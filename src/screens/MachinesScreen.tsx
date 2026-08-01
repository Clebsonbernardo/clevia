import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase, type Machine, type Branch, type WorkOrder } from '@/lib/supabase';
type BranchLite = Pick<Branch, 'id' | 'name'>;
import { Modal, Field, inputCls, EmptyState, Spinner } from '@/components/ui';
import {
  Cog, Plus, Search, Pencil, Trash2, MapPin, Tag, Factory, AlertTriangle,
  PlayCircle, Settings, Square, Wrench, MoonStar, ChevronDown, FolderTree,
} from 'lucide-react';
import { machineEffectivePriority, PRIORITY_STYLES, PRIORITY_LABELS, type OSPriority } from '@/lib/priority';

type MachineStatus = 'producao' | 'setup' | 'parada' | 'manutencao' | 'fora_turno';

const STATUS_OPTIONS: { value: MachineStatus; label: string }[] = [
  { value: 'producao', label: 'PRODUÇÃO' },
  { value: 'setup', label: 'SETUP' },
  { value: 'parada', label: 'PARADA' },
  { value: 'manutencao', label: 'MANUTENÇÃO' },
  { value: 'fora_turno', label: 'FORA DE TURNO' },
];

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: typeof Cog }> = {
  producao:   { bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-600 dark:text-emerald-300', icon: PlayCircle },
  setup:      { bg: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-600 dark:text-amber-300', icon: Settings },
  parada:     { bg: 'bg-rose-50 dark:bg-rose-950/40', text: 'text-rose-600 dark:text-rose-300', icon: Square },
  manutencao: { bg: 'bg-sky-50 dark:bg-sky-950/40', text: 'text-sky-600 dark:text-sky-300', icon: Wrench },
  fora_turno: { bg: 'bg-amber-700/10 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-500', icon: MoonStar },
};

function generateMachineCode(existingCodes: string[]): string {
  let max = 0;
  for (const c of existingCodes) {
    const m = c.match(/^MAQ-(\d+)$/);
    if (m) { const n = parseInt(m[1], 10); if (n > max) max = n; }
  }
  return `MAQ-${String(max + 1).padStart(4, '0')}`;
}

export default function MachinesScreen() {
  const { activeCompany, activeRole } = useAuth();
  const cid = activeCompany?.id;
  const [machines, setMachines] = useState<Machine[]>([]);
  const [branches, setBranches] = useState<BranchLite[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [sectors, setSectors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Machine | null>(null);
  const [form, setForm] = useState<Partial<Machine>>({});
  const [saving, setSaving] = useState(false);
  const [collapsedSectors, setCollapsedSectors] = useState<Set<string>>(new Set());

  const load = async () => {
    if (!cid) return;
    setLoading(true);
    const [m, b, w, sc] = await Promise.all([
      supabase.from('machines').select('*').eq('company_id', cid).order('created_at', { ascending: false }),
      supabase.from('branches').select('id, name').eq('company_id', cid),
      supabase.from('work_orders').select('*').eq('company_id', cid),
      supabase.from('monitor_screens').select('name').eq('company_id', cid).order('sort_order', { ascending: true }),
    ]);
    setMachines(m.data ?? []);
    setBranches(b.data ?? []);
    setWorkOrders(w.data ?? []);
    const screenSectors = (sc.data ?? []).map((s: { name: string }) => s.name);
    const machineSectors = (m.data ?? []).map((mach: Machine) => mach.sector).filter(Boolean) as string[];
    setSectors(Array.from(new Set([...screenSectors, ...machineSectors])).sort());
    setLoading(false);
  };

  useEffect(() => { load(); }, [cid]);

  useEffect(() => {
    if (!cid) return;
    const channel = supabase.channel('machines-screen-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'machines', filter: `company_id=eq.${cid}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders', filter: `company_id=eq.${cid}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'monitor_screens', filter: `company_id=eq.${cid}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid]);

  const filtered = machines.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    (m.code ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (m.sector ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const branchName = (id: string | null) => branches.find((b) => b.id === id)?.name ?? 'Matriz';
  const prioOf = (m: Machine): OSPriority | null => machineEffectivePriority(m.id, workOrders);
  const canEdit = activeRole === 'ceo' || activeRole === 'gerente' || activeRole === 'solicitante';

  const groupedSectors = Array.from(new Set(filtered.map((m) => m.sector ?? 'Sem setor'))).sort();
  const machinesBySector = (sector: string) =>
    filtered.filter((m) => (m.sector ?? 'Sem setor') === sector);

  const toggleSector = (sector: string) => {
    setCollapsedSectors((prev) => {
      const next = new Set(prev);
      if (next.has(sector)) next.delete(sector);
      else next.add(sector);
      return next;
    });
  };

  const openNew = (presetSector?: string) => {
    setEditing(null);
    const sectorName = presetSector ?? '';
    const existingCodes = machines.map((m) => m.code).filter(Boolean) as string[];
    setForm({ status: 'producao', code: generateMachineCode(existingCodes), sector: sectorName || '' });
    setModalOpen(true);
  };
  const openEdit = (m: Machine) => { setEditing(m); setForm(m); setModalOpen(true); };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!cid) return;
    setSaving(true);
    const payload = { ...form, company_id: cid };
    if (editing) {
      const { error: updErr } = await supabase.from('machines').update(payload).eq('id', editing.id);
      if (updErr) { alert('Erro ao atualizar máquina: ' + updErr.message); setSaving(false); return; }
    } else {
      const { data: latest } = await supabase.from('machines').select('code').eq('company_id', cid);
      const existingCodes = (latest ?? []).map((m: { code: string | null }) => m.code).filter(Boolean) as string[];
      payload.code = generateMachineCode(existingCodes);
      const { error: insErr } = await supabase.from('machines').insert(payload);
      if (insErr) { alert('Erro ao cadastrar máquina: ' + insErr.message); setSaving(false); return; }
    }
    setSaving(false);
    setModalOpen(false);
    load();
  };

  const remove = async (m: Machine) => {
    if (!confirm(`Excluir a máquina "${m.name}"?`)) return;
    const { error: delErr } = await supabase.from('machines').delete().eq('id', m.id);
    if (delErr) { alert('Erro ao excluir máquina: ' + delErr.message); return; }
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Máquinas</h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Cadastre e organize equipamentos por setor</p>
        </div>
        {canEdit && (
          <button onClick={() => openNew()} className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-sky-500 text-white font-medium rounded-xl hover:from-cyan-400 hover:to-sky-400 transition shadow-sm">
            <Plus className="w-5 h-5" /> Nova máquina
          </button>
        )}
      </div>

      <div className="relative w-full sm:max-w-md">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, código ou setor..."
          className="w-full pl-11 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition" />
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-12">
          <EmptyState icon={Cog} text="Nenhuma máquina encontrada. Clique em 'Nova máquina' para começar." />
        </div>
      ) : (
        <div className="space-y-4">
          {groupedSectors.map((sector) => {
            const sectorMachines = machinesBySector(sector);
            const collapsed = collapsedSectors.has(sector);
            return (
              <div key={sector} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
                <button
                  onClick={() => toggleSector(sector)}
                  className="w-full flex items-center justify-between px-5 py-3.5 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center">
                      <FolderTree className="w-4.5 h-4.5 text-white" />
                    </div>
                    <div className="text-left">
                      <p className="font-semibold text-slate-800 dark:text-slate-100">{sector}</p>
                      <p className="text-xs text-slate-400">{sectorMachines.length} {sectorMachines.length === 1 ? 'máquina' : 'máquinas'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {canEdit && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); openNew(sector === 'Sem setor' ? '' : sector); }}
                        className="px-2.5 py-1 rounded-lg text-xs font-medium bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300 hover:bg-cyan-200 transition flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> Adicionar
                      </span>
                    )}
                    <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
                  </div>
                </button>

                {!collapsed && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 p-4">
                    {sectorMachines.map((m) => {
                      const prio = prioOf(m);
                      const pStyle = prio ? PRIORITY_STYLES[prio] : null;
                      const cardBorder = pStyle ? `border-l-4 ${pStyle.border}` : 'border-l-4 border-transparent';
                      return (
                      <div key={m.id} className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 ${cardBorder} shadow-sm p-5 hover:shadow-md transition group`}>
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${pStyle ? pStyle.bg : STATUS_STYLES[m.status ?? 'fora_turno']?.bg ?? 'bg-slate-100 dark:bg-slate-800'}`}>
                              {(() => { const SI = STATUS_STYLES[m.status ?? 'fora_turno']?.icon ?? Cog; return <SI className={`w-5 h-5 ${pStyle ? pStyle.text : STATUS_STYLES[m.status ?? 'fora_turno']?.text ?? 'text-slate-500'}`} />; })()}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-800 dark:text-slate-100">{m.name}</p>
                              {m.code && <p className="text-xs text-slate-400">{m.code}</p>}
                            </div>
                          </div>
                          {canEdit && (
                            <div className="flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition">
                              <button onClick={() => openEdit(m)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-sky-600"><Pencil className="w-4 h-4" /></button>
                              {(activeRole === 'ceo' || activeRole === 'gerente') && <button onClick={() => remove(m)} className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>}
                            </div>
                          )}
                        </div>
                        <div className="space-y-2 text-sm">
                          {m.sector && <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400"><Tag className="w-4 h-4" /> {m.sector}</div>}
                          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400"><MapPin className="w-4 h-4" /> {branchName(m.branch_id)}</div>
                          {m.manufacturer && <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400"><Factory className="w-4 h-4" /> {m.manufacturer} {m.model && `· ${m.model}`}</div>}
                        </div>
                        <div className="flex flex-wrap gap-2 mt-4">
                          <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${STATUS_STYLES[m.status ?? 'fora_turno']?.text ?? 'text-slate-500'}`}>{STATUS_OPTIONS.find((s) => s.value === m.status)?.label ?? m.status}</span>
                          {pStyle && (
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${pStyle.bg} ${pStyle.text} border ${pStyle.border}`}>
                              <AlertTriangle className="w-3 h-3" /> OS {PRIORITY_LABELS[prio!]}
                            </span>
                          )}
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <Modal title={editing ? 'Editar máquina' : 'Nova máquina'} onClose={() => setModalOpen(false)}>
          <form onSubmit={save} className="space-y-4">
            <Field label="Nome" required>
              <input required value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="Ex: Lavadora Industrial L100" />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Código (gerado automaticamente)">
                <input value={form.code ?? ''} readOnly className={`${inputCls} bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 cursor-not-allowed`} placeholder="Gerado automaticamente" />
              </Field>
              <Field label="Setor">
                <select value={form.sector ?? ''} onChange={(e) => setForm({ ...form, sector: e.target.value })} className={inputCls}>
                  <option value="">Sem setor</option>
                  {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Modelo">
              <input value={form.model ?? ''} onChange={(e) => setForm({ ...form, model: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Filial">
              <select value={form.branch_id ?? ''} onChange={(e) => setForm({ ...form, branch_id: e.target.value || null })} className={inputCls}>
                <option value="">Matriz</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select value={form.status ?? 'producao'} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inputCls}>
                {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </Field>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModalOpen(false)} className="flex-1 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition">Cancelar</button>
              <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-gradient-to-r from-cyan-500 to-sky-500 text-white font-medium rounded-xl hover:from-cyan-400 hover:to-sky-400 transition disabled:opacity-60">
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
            {editing && (activeRole === 'ceo' || activeRole === 'gerente') && (
              <div className="border-t border-slate-100 dark:border-slate-800 pt-4 mt-2">
                <button type="button" onClick={() => { if (confirm(`Excluir a máquina "${editing.name}"?`)) { supabase.from('machines').delete().eq('id', editing.id).then(({ error }: { error: { message: string } | null }) => { if (error) { alert('Erro ao excluir: ' + error.message); return; } setModalOpen(false); load(); }); } }} className="w-full py-2.5 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-300 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/40 transition flex items-center justify-center gap-1.5 text-sm font-medium">
                  <Trash2 className="w-4 h-4" /> Excluir máquina
                </button>
              </div>
            )}
          </form>
        </Modal>
      )}
    </div>
  );
}
