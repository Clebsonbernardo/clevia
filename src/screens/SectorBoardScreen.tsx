import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase, type Machine } from '@/lib/supabase';
import { machineEffectivePriority, PRIORITY_STYLES, type OSPriority } from '@/lib/priority';
import { Spinner } from '@/components/ui';
import {
  Cog, Monitor, Scissors, Sparkles, Zap, WashingMachine, Shirt,
  PlayCircle, Settings, Square, Wrench, MoonStar, AlertTriangle,
  Boxes, Factory, Package, Layers, Wind, Droplets, Flame, Snowflake,
  CircuitBoard, Hammer, PaintBucket, Shield, Grid3x3, X, Search,
} from 'lucide-react';

const ICON_MAP: Record<string, typeof Cog> = {
  Monitor, Scissors, Sparkles, Zap, WashingMachine, Shirt, Cog,
  Boxes, Factory, Package, Layers, Wind, Droplets, Flame, Snowflake,
  CircuitBoard, Hammer, PaintBucket, Shield,
};

const COLOR_MAP: Record<string, { color: string; bg: string; border: string }> = {
  sky:     { color: 'text-sky-400',     bg: 'bg-sky-500/10',     border: 'border-sky-500/30' },
  rose:    { color: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/30' },
  amber:   { color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30' },
  cyan:    { color: 'text-cyan-400',    bg: 'bg-cyan-500/10',    border: 'border-cyan-500/30' },
  violet:  { color: 'text-violet-400',  bg: 'bg-violet-500/10',  border: 'border-violet-500/30' },
  emerald: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  orange:  { color: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/30' },
  teal:    { color: 'text-teal-400',    bg: 'bg-teal-500/10',    border: 'border-teal-500/30' },
  blue:    { color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/30' },
  yellow:  { color: 'text-yellow-400',  bg: 'bg-yellow-500/10',  border: 'border-yellow-500/30' },
};

type MachineStatus = 'producao' | 'setup' | 'parada' | 'manutencao' | 'fora_turno';

const STATUS_META: Record<MachineStatus, { label: string; color: string; bg: string; border: string; dot: string; icon: typeof Cog; anim: string }> = {
  producao:   { label: 'Em Produção',  color: 'text-emerald-300', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', dot: 'bg-emerald-500', icon: PlayCircle, anim: 'animate-machine-producao' },
  setup:      { label: 'Em Setup',     color: 'text-amber-300',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   dot: 'bg-amber-500',   icon: Settings,   anim: 'animate-machine-setup' },
  parada:     { label: 'Parada',        color: 'text-rose-300',    bg: 'bg-rose-500/10',    border: 'border-rose-500/30',    dot: 'bg-rose-500',    icon: Square,     anim: 'animate-machine-parada' },
  manutencao: { label: 'Em Manutenção', color: 'text-sky-300',     bg: 'bg-sky-500/10',     border: 'border-sky-500/30',     dot: 'bg-sky-500',     icon: Wrench,     anim: 'animate-machine-manutencao' },
  fora_turno: { label: 'Fora de Turno', color: 'text-slate-400',   bg: 'bg-slate-500/10',   border: 'border-slate-500/30',   dot: 'bg-slate-500',   icon: MoonStar,   anim: 'animate-machine-fora-turno' },
};

const STATUS_ORDER: MachineStatus[] = ['producao', 'setup', 'parada', 'manutencao', 'fora_turno'];

function getStatusMeta(status: string) {
  return STATUS_META[status as MachineStatus] ?? STATUS_META.fora_turno;
}

type ScreenDef = { name: string; icon: string; color: string; sort_order: number };

const DEFAULT_SCREENS: ScreenDef[] = [
  { name: 'Corte', icon: 'Scissors', color: 'rose', sort_order: 0 },
  { name: 'Acabamento', icon: 'Sparkles', color: 'amber', sort_order: 1 },
  { name: 'Laser', icon: 'Zap', color: 'cyan', sort_order: 2 },
  { name: 'Lavanderia', icon: 'WashingMachine', color: 'sky', sort_order: 3 },
  { name: 'Passadoria', icon: 'Shirt', color: 'violet', sort_order: 4 },
];

function buildSectorMeta(screens: ScreenDef[]) {
  const meta: Record<string, { icon: typeof Cog; color: string; bg: string; border: string }> = {};
  for (const s of screens) {
    const icon = ICON_MAP[s.icon] ?? Monitor;
    const color = COLOR_MAP[s.color] ?? COLOR_MAP.sky;
    meta[s.name] = { icon, color: color.color, bg: color.bg, border: color.border };
  }
  return meta;
}

export default function SectorBoardScreen({ onNavigate }: { onNavigate?: (id: string) => void }) {
  const { activeCompany, activeRole } = useAuth();
  const cid = activeCompany?.id;
  const canEdit = activeRole === 'ceo' || activeRole === 'gerente';
  const [machines, setMachines] = useState<Machine[]>([]);
  const [machinePriorities, setMachinePriorities] = useState<Record<string, OSPriority>>({});
  const [screens, setScreens] = useState<ScreenDef[]>(DEFAULT_SCREENS);
  const [loading, setLoading] = useState(true);
  const [activeSector, setActiveSector] = useState<string | null>(null);
  const [filterSector, setFilterSector] = useState<string>('todos');
  const [filterText, setFilterText] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('todos');

  const SECTOR_META = useMemo(() => buildSectorMeta(screens), [screens]);
  const SECTORS = useMemo(() => screens.map((s) => s.name), [screens]);

  const sectorMeta = (sector: string) =>
    SECTOR_META[sector] ?? { icon: Cog, color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/30' };

  const load = async () => {
    if (!cid) return;
    setLoading(true);
    const [machinesRes, osRes, screensRes] = await Promise.all([
      supabase.from('machines').select('*').eq('company_id', cid).order('created_at', { ascending: false }),
      supabase.from('work_orders').select('machine_id, status, priority').eq('company_id', cid).in('status', ['aberta', 'em_andamento', 'pausada', 'aguardando_pecas']),
      supabase.from('monitor_screens').select('name, icon, color, sort_order').eq('company_id', cid).order('sort_order', { ascending: true }),
    ]);
    setMachines(machinesRes.data ?? []);
    const allOS = osRes.data ?? [];
    const prioMap: Record<string, OSPriority> = {};
    const byMachine: Record<string, typeof allOS> = {};
    for (const w of allOS) {
      if (!w.machine_id) continue;
      (byMachine[w.machine_id] ??= []).push(w);
    }
    for (const [mid, orders] of Object.entries(byMachine)) {
      const p = machineEffectivePriority(mid, orders as any);
      if (p) prioMap[mid] = p;
    }
    setMachinePriorities(prioMap);
    if (screensRes.data && screensRes.data.length > 0) setScreens(screensRes.data as ScreenDef[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [cid]);

  useEffect(() => {
    if (!cid) return;
    const channel = supabase.channel('sectorboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'machines', filter: `company_id=eq.${cid}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders', filter: `company_id=eq.${cid}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'monitor_screens', filter: `company_id=eq.${cid}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid]);

  // Apply filters to machines
  const filteredMachines = useMemo(() => {
    return machines.filter((m) => {
      if (filterSector !== 'todos' && m.sector !== filterSector) return false;
      if (filterStatus !== 'todos' && (m.status ?? 'fora_turno') !== filterStatus) return false;
      if (filterText.trim()) {
        const q = filterText.trim().toLowerCase();
        if (!m.name.toLowerCase().includes(q) &&
            !(m.code ?? '').toLowerCase().includes(q) &&
            !(m.sector ?? '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [machines, filterSector, filterStatus, filterText]);

  const machinesWithOpenOS = useMemo(() => new Set(Object.keys(machinePriorities)), [machinePriorities]);

  // Machines grouped by sector
  const sectorData = useMemo(() => {
    return SECTORS.map((name) => {
      const ms = filteredMachines
        .filter((m) => m.sector === name)
        .slice()
        .sort((a, b) => {
          const aHas = machinePriorities[a.id] || machinesWithOpenOS.has(a.id) ? 1 : 0;
          const bHas = machinePriorities[b.id] || machinesWithOpenOS.has(b.id) ? 1 : 0;
          return bHas - aHas;
        });
      const counts = STATUS_ORDER.reduce((acc, s) => {
        acc[s] = ms.filter((m) => (m.status as MachineStatus) === s).length;
        return acc;
      }, {} as Record<MachineStatus, number>);
      return {
        name,
        machines: ms,
        ...counts,
        total: ms.length,
      };
    });
  }, [filteredMachines, SECTORS, machinePriorities, machinesWithOpenOS]);

  const globalCounts = useMemo(() => {
    return STATUS_ORDER.reduce((acc, s) => {
      acc[s] = filteredMachines.filter((m) => (m.status as MachineStatus) === s).length;
      return acc;
    }, {} as Record<MachineStatus, number>);
  }, [filteredMachines]);
  const hasActiveFilter = filterSector !== 'todos' || filterStatus !== 'todos' || filterText.trim() !== '';

  const clearFilters = () => { setFilterSector('todos'); setFilterStatus('todos'); setFilterText(''); };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center">
            <Grid3x3 className="w-6 h-6 text-sky-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Quadro de Setores</h2>
            <p className="text-sm text-slate-400">Acompanhamento de equipamentos por setor em tempo real</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {onNavigate && canEdit && (
            <button
              onClick={() => onNavigate('machines')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-orange-300 text-xs font-medium transition border border-orange-500/20"
            >
              <Cog className="w-3.5 h-3.5" /> Cadastrar máquinas
            </button>
          )}
          {STATUS_ORDER.map((s) => {
            const count = globalCounts[s];
            return (
              <span key={s} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium ${STATUS_META[s].bg} ${STATUS_META[s].color} border ${STATUS_META[s].border}`}>
                <span className={`w-2 h-2 rounded-full ${STATUS_META[s].dot}`} />
                {STATUS_META[s].label}
                <span className="ml-0.5 font-bold">{count}</span>
              </span>
            );
          })}
        </div>
      </div>

      {/* Filter bar */}
      {machines.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl border border-slate-800 bg-slate-900/50">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Buscar máquina por nome ou código..."
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-sky-500/50"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={filterSector}
              onChange={(e) => setFilterSector(e.target.value)}
              className="px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-sky-500/50"
            >
              <option value="todos">Todos os setores</option>
              {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-sky-500/50"
            >
              <option value="todos">Todos os status</option>
              {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
            </select>
            {hasActiveFilter && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/30 text-sm font-medium hover:bg-rose-500/20 transition"
              >
                <X className="w-4 h-4" /> Limpar
              </button>
            )}
          </div>
        </div>
      )}

      {machines.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mb-4">
            <Cog className="w-8 h-8 text-slate-500" />
          </div>
          <p className="text-slate-400 font-medium">Nenhuma máquina cadastrada ainda</p>
          <p className="text-sm text-slate-500 mt-1">Aguarde o cadastro de equipamentos para visualizar o quadro.</p>
        </div>
      ) : filteredMachines.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mb-4">
            <Search className="w-8 h-8 text-slate-500" />
          </div>
          <p className="text-slate-400 font-medium">Nenhuma máquina encontrada com esses filtros</p>
          <button onClick={clearFilters} className="mt-3 text-sm text-sky-400 hover:text-sky-300 font-medium">Limpar filtros</button>
        </div>
      ) : (
        <>
          {/* Mobile: tappable sector chips — tap to open that sector's scrollable list */}
          <div className="lg:hidden">
            <div className="flex items-center gap-2 overflow-x-auto pb-3 -mx-1 px-1 scroll-smooth">
              {(() => {
                const unassigned = filteredMachines.filter((m) => !m.sector || !SECTORS.includes(m.sector));
                const chips = [
                  ...sectorData.filter((s) => s.total > 0),
                  ...(unassigned.length > 0 ? [{
                    name: 'Sem Setor',
                    total: unassigned.length,
                    producao: 0, setup: 0, parada: 0, manutencao: 0, fora_turno: 0,
                    machines: unassigned,
                  }] : []),
                ];
                return chips.map((sector) => {
                  const isUnassigned = sector.name === 'Sem Setor';
                  const meta = isUnassigned ? { icon: Cog, color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/30' } : sectorMeta(sector.name);
                  const SIcon = meta.icon;
                  const isActive = activeSector === sector.name;
                  const hasIssue = sector.parada > 0 || sector.manutencao > 0;
                  return (
                    <button
                      key={sector.name}
                      onClick={() => setActiveSector(isActive ? null : sector.name)}
                      className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-medium transition whitespace-nowrap flex-shrink-0 ${
                        isActive
                          ? `${meta.bg} ${meta.color} border ${meta.border} shadow-lg`
                          : 'bg-slate-800/40 text-slate-400 hover:text-slate-200 hover:bg-slate-800/70 border border-transparent'
                      }`}
                    >
                      <SIcon className="w-4 h-4" />
                      {sector.name}
                      <span className={`px-1.5 py-0.5 rounded-md text-xs font-bold ${isActive ? 'bg-slate-900/40' : 'bg-slate-700/40'}`}>
                        {sector.total}
                      </span>
                      {hasIssue && <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />}
                    </button>
                  );
                });
              })()}
            </div>

            {/* Mobile: scrollable machine list for selected sector with fixed header */}
            {activeSector ? (
              <SectorColumn
                sector={activeSector === 'Sem Setor'
                  ? {
                      name: 'Sem Setor',
                      machines: filteredMachines.filter((m) => !m.sector || !SECTORS.includes(m.sector)).slice().sort((a, b) => {
                        const aHas = machinePriorities[a.id] || machinesWithOpenOS.has(a.id) ? 1 : 0;
                        const bHas = machinePriorities[b.id] || machinesWithOpenOS.has(b.id) ? 1 : 0;
                        return bHas - aHas;
                      }),
                      total: filteredMachines.filter((m) => !m.sector || !SECTORS.includes(m.sector)).length,
                      producao: 0, setup: 0, parada: 0, manutencao: 0, fora_turno: 0,
                    }
                  : sectorData.find((s) => s.name === activeSector)!}
                meta={activeSector === 'Sem Setor' ? { icon: Cog, color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/30' } : sectorMeta(activeSector)}
                machinePriorities={machinePriorities}
                machinesWithOpenOS={machinesWithOpenOS}
                maxHeight="60vh"
                collapsible
                onCollapse={() => setActiveSector(null)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Grid3x3 className="w-10 h-10 text-slate-700 mb-3" />
                <p className="text-sm text-slate-500">Toque em um setor acima para ver as máquinas</p>
              </div>
            )}
          </div>

          {/* Desktop: all columns side by side, each with sticky header + scrollable list */}
          <div className="hidden lg:flex gap-5 overflow-x-auto pb-4">
            {sectorData.map((sector) => {
              const meta = sectorMeta(sector.name);
              return (
                <SectorColumn
                  key={sector.name}
                  sector={sector}
                  meta={meta}
                  machinePriorities={machinePriorities}
                  machinesWithOpenOS={machinesWithOpenOS}
                  maxHeight="calc(100vh - 280px)"
                />
              );
            })}

            {/* Unassigned machines sector */}
            {filteredMachines.some((m) => !m.sector || !SECTORS.includes(m.sector)) && (
              <SectorColumn
                sector={{
                  name: 'Sem Setor',
                  machines: filteredMachines.filter((m) => !m.sector || !SECTORS.includes(m.sector)).slice().sort((a, b) => {
                    const aHas = machinePriorities[a.id] || machinesWithOpenOS.has(a.id) ? 1 : 0;
                    const bHas = machinePriorities[b.id] || machinesWithOpenOS.has(b.id) ? 1 : 0;
                    return bHas - aHas;
                  }),
                  total: filteredMachines.filter((m) => !m.sector || !SECTORS.includes(m.sector)).length,
                  producao: 0, setup: 0, parada: 0, manutencao: 0, fora_turno: 0,
                }}
                meta={{ icon: Cog, color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/30' }}
                machinePriorities={machinePriorities}
                machinesWithOpenOS={machinesWithOpenOS}
                maxHeight="calc(100vh - 280px)"
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

type SectorInfo = {
  name: string;
  machines: Machine[];
  total: number;
  producao: number;
  setup: number;
  parada: number;
  manutencao: number;
  fora_turno: number;
};

function SectorColumn({
  sector,
  meta,
  machinePriorities,
  machinesWithOpenOS,
  maxHeight,
  collapsible,
  onCollapse,
}: {
  sector: SectorInfo;
  meta: { icon: typeof Cog; color: string; bg: string; border: string };
  machinePriorities: Record<string, OSPriority>;
  machinesWithOpenOS: Set<string>;
  maxHeight: string;
  collapsible?: boolean;
  onCollapse?: () => void;
}) {
  const SIcon = meta.icon;
  const hasIssue = sector.parada > 0 || sector.manutencao > 0;

  return (
    <div className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden w-full lg:w-[320px] lg:flex-shrink-0">
      {/* Fixed sector header */}
      <div className={`px-4 py-3 border-b border-slate-800 ${meta.bg} flex-shrink-0`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.bg} border ${meta.border}`}>
              <SIcon className={`w-5 h-5 ${meta.color}`} />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-white text-sm truncate">{sector.name}</h3>
              <p className="text-xs text-slate-400">{sector.total} {sector.total === 1 ? 'máquina' : 'máquinas'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {hasIssue && <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />}
            {collapsible && (
              <button onClick={onCollapse} className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        {/* Mini status counts */}
        <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
          {STATUS_ORDER.map((s) => {
            const c = (sector as any)[s] as number;
            if (c === 0) return null;
            const sm = STATUS_META[s];
            return (
              <span key={s} className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium ${sm.bg} ${sm.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${sm.dot}`} />
                {c}
              </span>
            );
          })}
        </div>
      </div>

      {/* Scrollable machine list — header stays fixed */}
      <div className="p-3 space-y-2.5 overflow-y-auto custom-scrollbar" style={{ maxHeight }}>
        {sector.machines.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Cog className="w-6 h-6 text-slate-700 mb-2" />
            <p className="text-xs text-slate-600">Nenhuma máquina neste setor</p>
          </div>
        ) : (
          sector.machines.map((m) => {
            const sm = getStatusMeta(m.status ?? 'fora_turno');
            const SCardIcon = sm.icon;
            const prio = machinePriorities[m.id];
            const ps = prio ? PRIORITY_STYLES[prio] : null;
            const cardBg = ps ? `bg-gradient-to-br ${ps.bg} ${ps.border}` : `${sm.bg} ${sm.border}`;
            const iconBg = ps ? ps.bg : sm.bg;
            const iconColor = ps ? ps.text : sm.color;
            const iconAnim = ps ? 'animate-icon-pulse-continuous' : sm.anim;
            return (
              <div key={m.id} className={`rounded-xl border-2 p-3 transition hover:shadow-lg ${cardBg}`}>
                <div className="flex items-center gap-2.5">
                  <div className={`relative w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBg}`}>
                    {ps ? (
                      <AlertTriangle className={`w-5 h-5 ${iconColor} ${iconAnim}`} />
                    ) : (
                      <SCardIcon className={`w-5 h-5 ${iconColor} ${iconAnim}`} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-100 text-sm truncate">{m.name}</p>
                    {m.code && <p className="text-xs text-slate-500 truncate">{m.code}</p>}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                  {ps ? (
                    <span className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-bold ${ps.bg} ${ps.text} border ${ps.border}`}>
                      <span className={`w-2 h-2 rounded-full ${ps.dot} animate-pulse`} />
                      OS {ps.label}
                    </span>
                  ) : (
                    <span className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-bold ${sm.bg} ${sm.color}`}>
                      <span className={`w-2 h-2 rounded-full ${sm.dot} ${sm.anim}`} />
                      {sm.label}
                    </span>
                  )}
                  {machinesWithOpenOS.has(m.id) && !ps && (
                    <span className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold bg-orange-500/10 text-orange-400 border border-orange-500/30">
                      <AlertTriangle className="w-3 h-3" /> OS Aberta
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
