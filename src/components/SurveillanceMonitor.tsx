import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase, type Machine, type WorkOrder } from '@/lib/supabase';
import { machineEffectivePriority, PRIORITY_STYLES, type OSPriority } from '@/lib/priority';
import { Spinner } from '@/components/ui';
import {
  Monitor, Grid3x3, Cog, AlertTriangle, PlayCircle, Settings, Square, Wrench, MoonStar,
  ChevronLeft, ChevronRight, Pause, Play,
} from 'lucide-react';

type MachineStatus = 'producao' | 'setup' | 'parada' | 'manutencao' | 'fora_turno';

const STATUS_META: Record<MachineStatus, { label: string; color: string; bg: string; border: string; ring: string; icon: typeof Cog; anim: string; dot: string; glow: string }> = {
  producao:   { label: 'PRODUÇÃO',     color: 'text-emerald-300', bg: 'bg-emerald-500/10', border: 'border-emerald-500/40', ring: 'ring-emerald-500/50', icon: PlayCircle, anim: 'animate-machine-producao',   dot: 'bg-emerald-500', glow: 'shadow-emerald-500/30' },
  setup:      { label: 'SETUP',        color: 'text-amber-300',   bg: 'bg-amber-500/10',   border: 'border-amber-500/40',   ring: 'ring-amber-500/50',   icon: Settings,   anim: 'animate-machine-setup',      dot: 'bg-amber-500',   glow: 'shadow-amber-500/30' },
  parada:     { label: 'PARADA',       color: 'text-rose-300',    bg: 'bg-rose-500/10',    border: 'border-rose-500/40',    ring: 'ring-rose-500/50',    icon: Square,     anim: 'animate-machine-parada',     dot: 'bg-rose-500',    glow: 'shadow-rose-500/40' },
  manutencao: { label: 'MANUTENÇÃO',   color: 'text-sky-300',     bg: 'bg-sky-500/10',     border: 'border-sky-500/40',     ring: 'ring-sky-500/50',     icon: Wrench,     anim: 'animate-machine-manutencao', dot: 'bg-sky-500',     glow: 'shadow-sky-500/40' },
  fora_turno: { label: 'FORA DE TURNO', color: 'text-slate-400',  bg: 'bg-slate-500/10',   border: 'border-slate-500/40',   ring: 'ring-slate-500/50',   icon: MoonStar,   anim: 'animate-machine-fora-turno', dot: 'bg-slate-500',   glow: 'shadow-slate-500/20' },
};

const STATUS_ORDER: MachineStatus[] = ['producao', 'setup', 'parada', 'manutencao', 'fora_turno'];

function getStatusMeta(status: string) {
  return STATUS_META[status as MachineStatus] ?? STATUS_META.fora_turno;
}

type ScreenDef = { name: string; icon: string; color: string; sort_order: number };

const ICON_MAP: Record<string, typeof Cog> = {
  Monitor, Scissors: Monitor, Sparkles: Monitor, Zap: Monitor, WashingMachine: Monitor,
  Shirt: Monitor, Cog, Boxes: Monitor, Factory: Monitor, Package: Monitor, Layers: Monitor,
  Wind: Monitor, Droplets: Monitor, Flame: Monitor, Snowflake: Monitor, CircuitBoard: Monitor,
  Hammer: Monitor, PaintBucket: Monitor, Shield: Monitor,
};

const COLOR_MAP: Record<string, { color: string; bg: string; border: string }> = {
  sky: { color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/30' },
  rose: { color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/30' },
  amber: { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
  cyan: { color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30' },
  violet: { color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/30' },
  emerald: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  orange: { color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30' },
  teal: { color: 'text-teal-400', bg: 'bg-teal-500/10', border: 'border-teal-500/30' },
  blue: { color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30' },
  yellow: { color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
};

function sectorMetaFor(sector: string, screens: ScreenDef[]) {
  const def = screens.find((s) => s.name === sector);
  if (!def) return { icon: Cog, color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/30' };
  return {
    icon: ICON_MAP[def.icon] ?? Cog,
    color: (COLOR_MAP[def.color] ?? COLOR_MAP.sky).color,
    bg: (COLOR_MAP[def.color] ?? COLOR_MAP.sky).bg,
    border: (COLOR_MAP[def.color] ?? COLOR_MAP.sky).border,
  };
}

const CYCLE_MS = 6000;

export default function SurveillanceMonitor() {
  const { activeCompany } = useAuth() as any;
  const cid = activeCompany?.id;
  const [machines, setMachines] = useState<Machine[]>([]);
  const [machinePriorities, setMachinePriorities] = useState<Record<string, OSPriority>>({});
  const [screens, setScreens] = useState<ScreenDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [dir, setDir] = useState<1 | -1>(1);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async () => {
    if (!cid) return;
    const [mRes, osRes, sRes] = await Promise.all([
      supabase.from('machines').select('*').eq('company_id', cid).order('created_at', { ascending: false }),
      supabase.from('work_orders').select('machine_id, status, priority').eq('company_id', cid).in('status', ['aberta', 'em_andamento', 'pausada', 'aguardando_pecas']),
      supabase.from('monitor_screens').select('name, icon, color, sort_order').eq('company_id', cid).order('sort_order', { ascending: true }),
    ]);
    setMachines(mRes.data ?? []);
    const allOS = osRes.data ?? [];
    const byMachine: Record<string, typeof allOS> = {};
    for (const w of allOS) {
      if (!w.machine_id) continue;
      (byMachine[w.machine_id] ??= []).push(w);
    }
    const prioMap: Record<string, OSPriority> = {};
    for (const [mid, orders] of Object.entries(byMachine)) {
      const p = machineEffectivePriority(mid, orders as any);
      if (p) prioMap[mid] = p;
    }
    setMachinePriorities(prioMap);
    setScreens((sRes.data ?? []) as ScreenDef[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [cid]);

  useEffect(() => {
    if (!cid) return;
    const channel = supabase.channel('surveillance-monitor-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'machines', filter: `company_id=eq.${cid}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders', filter: `company_id=eq.${cid}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'monitor_screens', filter: `company_id=eq.${cid}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid]);

  const machinesWithOpenOS = useMemo(() => new Set(Object.keys(machinePriorities)), [machinePriorities]);

  // Build the list of "views" to cycle: "Geral" (machines with open OS) + each sector
  const views = useMemo(() => {
    const list: { key: string; label: string; isGeneral: boolean }[] = [];
    list.push({ key: 'Geral', label: 'Geral', isGeneral: true });
    screens.forEach((s) => list.push({ key: s.name, label: s.name, isGeneral: false }));
    return list;
  }, [screens]);

  const currentMachines = useMemo(() => {
    if (activeIndex === 0) return machines.filter((m) => machinesWithOpenOS.has(m.id));
    const sectorName = views[activeIndex]?.key;
    return machines.filter((m) => m.sector === sectorName);
  }, [machines, machinesWithOpenOS, activeIndex, views]);

  // Auto-cycle
  useEffect(() => {
    if (paused || views.length <= 1) return;
    timerRef.current = setInterval(() => {
      setDir(1);
      setActiveIndex((i) => (i + 1) % views.length);
    }, CYCLE_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [paused, views.length]);

  const goTo = (d: 1 | -1) => {
    setDir(d);
    setActiveIndex((i) => {
      const n = i + d;
      if (n < 0) return views.length - 1;
      if (n >= views.length) return 0;
      return n;
    });
  };

  const selectIndex = (idx: number) => {
    setDir(idx > activeIndex ? 1 : -1);
    setActiveIndex(idx);
  };

  const currentView = views[activeIndex];
  const meta = currentView && !currentView.isGeneral ? sectorMetaFor(currentView.key, screens) : null;

  const counts = useMemo(() => {
    return STATUS_ORDER.reduce((acc, s) => {
      acc[s] = currentMachines.filter((m) => (m.status as MachineStatus) === s).length;
      return acc;
    }, {} as Record<MachineStatus, number>);
  }, [currentMachines]);

  const clock = useClock();

  return (
    <div className="card-hover bg-slate-900/80 rounded-2xl border border-slate-800 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center">
            <Monitor className="w-5 h-5 text-sky-400 animate-icon-pulse-continuous" />
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-rose-500 animate-pulse border-2 border-slate-900" />
          </div>
          <div>
            <h3 className="font-semibold text-white flex items-center gap-2">
              Monitor de Setores
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-400 border border-rose-500/30 animate-blink-pulse">REC</span>
            </h3>
            <p className="text-xs text-slate-400">Alternância automática · {views.length} telas</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            {clock}
          </div>
          <button
            onClick={() => setPaused((p) => !p)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800/60 hover:bg-slate-700 text-slate-300 transition border border-slate-700"
          >
            {paused ? <Play className="w-3.5 h-3.5 text-emerald-400" /> : <Pause className="w-3.5 h-3.5 text-amber-400" />}
            {paused ? 'Retomar' : 'Pausar'}
          </button>
        </div>
      </div>

      {/* Viewport */}
      <div className="relative">
        {loading ? (
          <div className="flex items-center justify-center h-72"><Spinner /></div>
        ) : (
          <div className="relative h-[28rem] overflow-hidden">
            {/* Desktop nav arrows */}
            <button
              onClick={() => goTo(-1)}
              className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full bg-slate-800/80 border border-slate-700 hover:bg-slate-700 hover:border-sky-500/50 text-slate-300 hover:text-sky-400 items-center justify-center transition shadow-lg"
              aria-label="Tela anterior"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => goTo(1)}
              className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full bg-slate-800/80 border border-slate-700 hover:bg-slate-700 hover:border-sky-500/50 text-slate-300 hover:text-sky-400 items-center justify-center transition shadow-lg"
              aria-label="Próxima tela"
            >
              <ChevronRight className="w-5 h-5" />
            </button>

            {/* Sliding view */}
            <div
              key={activeIndex}
              className={`absolute inset-0 ${dir === 1 ? 'animate-slide-in-right' : 'animate-slide-in-left'}`}
            >
              {/* View title bar */}
              <div className={`px-5 py-3 flex items-center justify-between ${currentView?.isGeneral ? 'bg-sky-500/10' : meta?.bg}`}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${currentView?.isGeneral ? 'bg-sky-500/10 border border-sky-500/30' : `${meta!.bg} border ${meta!.border}`}`}>
                    {currentView?.isGeneral
                      ? <Grid3x3 className="w-5 h-5 text-sky-400 animate-icon-pulse-continuous" />
                      : (() => { const I = meta!.icon; return <I className={`w-5 h-5 ${meta!.color} animate-icon-pulse-continuous`} />; })()}
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-white text-sm truncate">{currentView?.isGeneral ? 'Visão Geral — Máquinas com OS aberta' : currentView?.label}</h4>
                    <p className="text-xs text-slate-400">{currentMachines.length} {currentMachines.length === 1 ? 'máquina' : 'máquinas'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  {STATUS_ORDER.map((s) => {
                    const c = counts[s];
                    if (c === 0) return null;
                    return (
                      <span key={s} className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium ${STATUS_META[s].bg} ${STATUS_META[s].color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${STATUS_META[s].dot}`} />
                        {c}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Machine grid */}
              <div className="p-4 overflow-y-auto custom-scrollbar" style={{ height: 'calc(100% - 56px)' }}>
                {currentMachines.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mb-4">
                      <Cog className="w-8 h-8 text-slate-500" />
                    </div>
                    <p className="text-slate-400 font-medium">
                      {currentView?.isGeneral ? 'Nenhuma máquina com OS aberta' : `Nenhuma máquina em ${currentView?.label}`}
                    </p>
                    <p className="text-sm text-slate-500 mt-1">
                      {currentView?.isGeneral ? 'Quando uma OS for aberta, a máquina aparecerá aqui automaticamente.' : 'Aguardando cadastro de máquinas neste setor.'}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {currentMachines.map((m) => {
                      const sm = getStatusMeta(m.status ?? 'fora_turno');
                      const SIcon = sm.icon;
                      const prio = machinePriorities[m.id];
                      const ps = prio ? PRIORITY_STYLES[prio] : null;
                      const cardBg = ps ? `bg-gradient-to-br ${ps.bg} ${ps.border}` : `${sm.bg} ${sm.border}`;
                      const iconBg = ps ? ps.bg : sm.bg;
                      const iconRing = ps ? ps.ring : sm.ring;
                      const iconColor = ps ? ps.text : sm.color;
                      const iconAnim = ps ? 'animate-icon-pulse-continuous' : sm.anim;
                      return (
                        <div key={m.id} className={`rounded-xl border-2 p-3.5 transition flex flex-col ${cardBg} hover:shadow-lg ${sm.glow}`}>
                          <div className="flex items-start gap-2.5 min-w-0">
                            <div className={`relative w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBg} ring-2 ${iconRing}`}>
                              {ps ? <AlertTriangle className={`w-5 h-5 ${iconColor} ${iconAnim}`} /> : <SIcon className={`w-5 h-5 ${iconColor} ${iconAnim}`} />}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-100 text-sm truncate">{m.name}</p>
                              {m.code && <p className="text-xs text-slate-500 truncate">{m.code}</p>}
                              {m.sector && (
                                <span className="inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-slate-800/60 text-slate-400 border border-slate-700">
                                  {m.sector}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                            {ps ? (
                              <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${ps.bg} ${ps.text} border ${ps.border}`}>
                                <span className={`w-2 h-2 rounded-full ${ps.dot} animate-pulse`} />
                                OS {ps.label}
                              </span>
                            ) : (
                              <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${sm.bg} ${sm.color}`}>
                                <span className={`w-2 h-2 rounded-full ${sm.dot} ${sm.anim}`} />
                                {sm.label}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Progress bar */}
            {!paused && views.length > 1 && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-800/60 z-20">
                <div key={activeIndex} className="h-full bg-gradient-to-r from-sky-500 to-cyan-400" style={{ animation: `surveillance-progress ${CYCLE_MS}ms linear forwards` }} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* View selector dots */}
      <div className="flex items-center justify-center gap-2 py-3 border-t border-slate-800 bg-slate-900/50 flex-wrap px-3">
        {views.map((v, i) => (
          <button
            key={v.key}
            onClick={() => selectIndex(i)}
            className={`h-2 rounded-full transition-all ${i === activeIndex ? 'w-6 bg-sky-400' : 'w-2 bg-slate-600 hover:bg-slate-500'}`}
            aria-label={v.label}
          />
        ))}
      </div>
    </div>
  );
}

function useClock() {
  const [time, setTime] = useState(() => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  useEffect(() => {
    const id = setInterval(() => {
      setTime(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}
