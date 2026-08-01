import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Modal, Field, Spinner, EmptyState, inputCls } from '@/components/ui';
import { Factory, X, Save, MapPin, Activity, Clock, Wrench, User, Cog } from 'lucide-react';
import type { Machine, MachinePosition, WorkOrder } from '@/lib/supabase';

const STATUS_CONFIG: Record<string, { color: string; ring: string; label: string; dot: string }> = {
  producao: { color: 'bg-emerald-500', ring: 'ring-emerald-400/50', label: 'Produzindo', dot: 'bg-emerald-400' },
  setup: { color: 'bg-blue-500', ring: 'ring-blue-400/50', label: 'Setup', dot: 'bg-blue-400' },
  parada: { color: 'bg-amber-500', ring: 'ring-amber-400/50', label: 'Parada', dot: 'bg-amber-400' },
  manutencao: { color: 'bg-red-500', ring: 'ring-red-400/50', label: 'Em Manutenção', dot: 'bg-red-400' },
  fora_turno: { color: 'bg-slate-600', ring: 'ring-slate-500/50', label: 'Fora de Turno', dot: 'bg-slate-500' },
};

function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] || STATUS_CONFIG.fora_turno;
}

export default function FactoryMapScreen() {
  const { activeCompany, activeRole } = useAuth();
  const [machines, setMachines] = useState<Machine[]>([]);
  const [positions, setPositions] = useState<Record<string, MachinePosition>>({});
  const [workOrders, setWorkOrders] = useState<Record<string, WorkOrder[]>>({});
  const [loading, setLoading] = useState(true);
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
  const [draggingMachine, setDraggingMachine] = useState<string | null>(null);
  const [sectors, setSectors] = useState<string[]>([]);
  const [activeSector, setActiveSector] = useState<string>('all');
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);

  const canEdit = activeRole === 'ceo' || activeRole === 'gerente';

  const loadData = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    try {
      const [machinesRes, positionsRes, woRes] = await Promise.all([
        supabase.from('machines').select('*').eq('company_id', activeCompany.id).order('sector', { ascending: true }),
        supabase.from('machine_positions').select('*').eq('company_id', activeCompany.id),
        supabase.from('work_orders').select('*').eq('company_id', activeCompany.id).in('status', ['aberta', 'em_andamento', 'pausada']),
      ]);

      const machineList = (machinesRes.data || []) as Machine[];
      setMachines(machineList);

      const posMap: Record<string, MachinePosition> = {};
      (positionsRes.data || []).forEach((p: MachinePosition) => {
        posMap[p.machine_id] = p;
      });
      setPositions(posMap);

      const woMap: Record<string, WorkOrder[]> = {};
      (woRes.data || []).forEach((wo: WorkOrder) => {
        if (wo.machine_id) {
          if (!woMap[wo.machine_id]) woMap[wo.machine_id] = [];
          woMap[wo.machine_id].push(wo);
        }
      });
      setWorkOrders(woMap);

      const sectorSet = new Set<string>();
      machineList.forEach((m) => { if (m.sector) sectorSet.add(m.sector); });
      setSectors(Array.from(sectorSet).sort());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [activeCompany]);

  useEffect(() => { loadData(); }, [loadData]);

  // Realtime subscription
  useEffect(() => {
    if (!activeCompany) return;
    const channel = supabase.channel('factory-map')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'machines', filter: `company_id=eq.${activeCompany.id}` }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders', filter: `company_id=eq.${activeCompany.id}` }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeCompany, loadData]);

  const filteredMachines = activeSector === 'all' ? machines : machines.filter((m) => m.sector === activeSector);

  const getMachinePosition = (machine: Machine, index: number, total: number) => {
    const pos = positions[machine.id];
    if (pos) return { x: pos.position_x, y: pos.position_y };
    const cols = Math.min(Math.ceil(Math.sqrt(total)), 6);
    const rows = Math.ceil(total / cols);
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = cols > 1 ? 15 + (col * 70 / (cols - 1)) : 50;
    const y = rows > 1 ? 15 + (row * 70 / (rows - 1)) : 50;
    return { x: Math.round(x), y: Math.round(y) };
  };

  const handleDragStart = (e: React.DragEvent, machineId: string) => {
    if (!editMode) return;
    e.dataTransfer.setData('text/plain', machineId);
    setDraggingMachine(machineId);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (!editMode || !activeCompany) return;
    const machineId = e.dataTransfer.getData('text/plain');
    if (!machineId) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);

    setSaving(true);
    try {
      const existing = positions[machineId];
      if (existing) {
        const { error: updErr } = await supabase.from('machine_positions').update({ position_x: x, position_y: y, updated_at: new Date().toISOString() }).eq('id', existing.id);
        if (updErr) { alert('Erro ao salvar posição: ' + updErr.message); return; }
      } else {
        const machine = machines.find((m) => m.id === machineId);
        const { error: insErr } = await supabase.from('machine_positions').insert({
          company_id: activeCompany.id,
          machine_id: machineId,
          sector: machine?.sector || null,
          position_x: x,
          position_y: y,
        });
        if (insErr) { alert('Erro ao salvar posição: ' + insErr.message); return; }
      }
      loadData();
    } finally {
      setSaving(false);
      setDraggingMachine(null);
    }
  };

  const autoArrange = () => {
    if (!activeCompany) return;
    const cols = Math.ceil(Math.sqrt(filteredMachines.length));
    filteredMachines.forEach((m, i) => {
      const x = ((i % cols) + 1) * (100 / (cols + 1));
      const y = (Math.floor(i / cols) + 1) * (100 / (Math.ceil(filteredMachines.length / cols) + 1));
      const existing = positions[m.id];
      if (existing) {
        supabase.from('machine_positions').update({ position_x: Math.round(x), position_y: Math.round(y), updated_at: new Date().toISOString() }).eq('id', existing.id).then(({ error }: { error: { message: string } | null }) => { if (error) console.error('autoArrange update failed', error); });
      } else {
        supabase.from('machine_positions').insert({ company_id: activeCompany.id, machine_id: m.id, sector: m.sector, position_x: Math.round(x), position_y: Math.round(y) }).then(({ error }: { error: { message: string } | null }) => { if (error) console.error('autoArrange insert failed', error); });
      }
    });
    setTimeout(() => loadData(), 500);
  };

  if (loading) return <div className="flex items-center justify-center h-full"><Spinner /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
            <Factory className="w-6 h-6 text-orange-400" />
            Mapa da Fábrica
          </h1>
          <p className="text-sm text-slate-400 mt-1">Centro de monitoramento visual das máquinas por setor</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canEdit && (
            <>
              <button
                onClick={() => setEditMode(!editMode)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition ${editMode ? 'bg-cyan-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
              >
                {editMode ? 'Editar: ON' : 'Editar: OFF'}
              </button>
              {editMode && (
                <button onClick={autoArrange} className="px-3 py-2 rounded-lg text-sm font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition">
                  Auto-arranjo
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Sector tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        <button
          onClick={() => setActiveSector('all')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition ${activeSector === 'all' ? 'bg-cyan-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
        >
          Geral
        </button>
        {sectors.map((s) => (
          <button
            key={s}
            onClick={() => setActiveSector(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition ${activeSector === s ? 'bg-cyan-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Factory floor grid */}
      <div
        className="relative w-full bg-slate-900/50 border border-slate-700/50 rounded-2xl overflow-hidden"
        style={{ minHeight: '500px', backgroundImage: 'radial-gradient(circle, rgba(148,163,184,0.08) 1px, transparent 1px)', backgroundSize: '24px 24px' }}
        onDragOver={(e) => { if (editMode) e.preventDefault(); }}
        onDrop={handleDrop}
      >
        {filteredMachines.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <EmptyState icon={Factory} text="Nenhuma máquina neste setor" />
          </div>
        )}
        {filteredMachines.map((machine, idx) => {
          const pos = getMachinePosition(machine, idx, filteredMachines.length);
          const x = pos.x;
          const y = pos.y;
          const cfg = getStatusConfig(machine.status);
          const openWOs = workOrders[machine.id] || [];

          return (
            <div
              key={machine.id}
              draggable={editMode}
              onDragStart={(e) => handleDragStart(e, machine.id)}
              onClick={() => !editMode && setSelectedMachine(machine)}
              className={`absolute group cursor-pointer transition-all ${editMode ? 'cursor-move' : 'hover:scale-110'} ${draggingMachine === machine.id ? 'opacity-50' : ''}`}
              style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}
            >
              <div className={`relative w-12 h-12 sm:w-14 sm:h-14 rounded-xl ${cfg.color} ring-2 ${cfg.ring} flex items-center justify-center shadow-lg ${openWOs.length > 0 ? 'animate-pulse' : ''}`}>
                <Cog className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                {openWOs.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center border-2 border-slate-900">
                    {openWOs.length}
                  </span>
                )}
              </div>
              <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition pointer-events-none z-20">
                <div className="bg-slate-800 text-white text-xs rounded-lg px-2 py-1 whitespace-nowrap shadow-xl border border-slate-700">
                  <span className="font-semibold">{machine.code}</span> · {machine.name}
                </div>
              </div>
            </div>
          );
        })}
        {saving && (
          <div className="absolute top-2 right-2 bg-cyan-500/20 text-cyan-300 text-xs px-3 py-1 rounded-lg border border-cyan-500/30">
            Salvando...
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <div key={key} className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className={`w-3 h-3 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </div>
        ))}
      </div>

      {/* Machine detail modal */}
      {selectedMachine && (
        <MachineDetailModal machine={selectedMachine} workOrders={workOrders[selectedMachine.id] || []} onClose={() => setSelectedMachine(null)} />
      )}
    </div>
  );
}

function MachineDetailModal({ machine, workOrders, onClose }: { machine: Machine; workOrders: WorkOrder[]; onClose: () => void }) {
  const cfg = getStatusConfig(machine.status);
  return (
    <Modal open onClose={onClose} title={`Máquina ${machine.code}`} maxWidth="max-w-lg">
      <div className="space-y-4">
        <div className={`flex items-center gap-3 p-4 rounded-xl ${cfg.color} bg-opacity-20`}>
          <div className={`w-12 h-12 rounded-xl ${cfg.color} flex items-center justify-center`}>
            <Cog className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">{machine.name}</h3>
            <p className="text-sm text-slate-400">{machine.code}</p>
          </div>
          <span className={`ml-auto px-3 py-1 rounded-full text-xs font-medium ${cfg.color} text-white`}>{cfg.label}</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Setor">
            <p className="text-sm text-slate-200">{machine.sector || '—'}</p>
          </Field>
          <Field label="Modelo">
            <p className="text-sm text-slate-200">{machine.model || '—'}</p>
          </Field>
          <Field label="Fabricante">
            <p className="text-sm text-slate-200">{machine.manufacturer || '—'}</p>
          </Field>
          <Field label="Criticidade">
            <p className="text-sm text-slate-200 capitalize">{machine.criticality || '—'}</p>
          </Field>
        </div>

        {workOrders.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-1.5">
              <Wrench className="w-4 h-4 text-orange-400" />
              Ordens de Serviço Abertas ({workOrders.length})
            </h4>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {workOrders.map((wo) => (
                <div key={wo.id} className="p-2 rounded-lg bg-slate-800/50 border border-slate-700/30">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white font-medium">OS #{wo.os_number || wo.id.slice(0, 8)}</span>
                    <span className="text-xs text-slate-400">{wo.priority}</span>
                  </div>
                  {wo.title && <p className="text-xs text-slate-400 mt-1">{wo.title}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
