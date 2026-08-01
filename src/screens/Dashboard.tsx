import { useEffect, useMemo, useState, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase, type Machine, type WorkOrder, type Mechanic, type PreventivePlan, type ProductionLog, type ProductionDailyHistory } from '@/lib/supabase';
import { usePermission } from '@/lib/useGrants';
import { Spinner } from '@/components/ui';
import {
  AlertTriangle, Cog, Users, Gauge, Wrench, TrendingUp, Activity, ShieldCheck, Clock, ArrowUp,
  ClipboardEdit, Zap, Send,
  Flame, ArrowUpCircle, AlertCircle, CircleDot,
  ChevronLeft, ChevronRight, Calendar, BarChart3,
} from 'lucide-react';
import { PRIORITY_STYLES, PRIORITY_ORDER, PRIORITY_LABELS, PRIORITY_RANK, priorityCounts, type OSPriority } from '@/lib/priority';

function PriorityAlertIcon({ priority, count }: { priority: OSPriority | null; count: number }) {
  const Icon = priority === 'critica' ? Flame
    : priority === 'alta' ? ArrowUpCircle
    : priority === 'media' ? AlertCircle
    : priority === 'baixa' ? CircleDot
    : AlertTriangle;
  const color = priority === 'critica' ? 'text-rose-400'
    : priority === 'alta' ? 'text-orange-400'
    : priority === 'media' ? 'text-sky-400'
    : priority === 'baixa' ? 'text-slate-300'
    : 'text-emerald-400';
  const pulse = count > 0 && priority === 'critica' ? 'animate-blink-pulse' : 'animate-icon-glow';
  return (
    <span className="inline-flex transition-all duration-500">
      <Icon className={`w-5 h-5 ${color} ${pulse} transition-all duration-500`} />
    </span>
  );
}

export default function Dashboard({ onNavigate }: { onNavigate?: (id: string) => void }) {
  const { activeCompany } = useAuth();
  const [machines, setMachines] = useState<Machine[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [mechanics, setMechanics] = useState<Mechanic[]>([]);
  const [preventives, setPreventives] = useState<PreventivePlan[]>([]);
  const [production, setProduction] = useState<ProductionLog[]>([]);
  const [history, setHistory] = useState<ProductionDailyHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [viewMode, setViewMode] = useState<'hoje' | 'historico' | 'comparativo'>('hoje');

  const cid = activeCompany?.id;

  const machineName = (id: string | null) => machines.find((m) => m.id === id)?.name ?? '—';

  const loadAll = async () => {
    const currentCid = cid;
    if (!currentCid) return;
    const [m, w, me, p, pl, hist] = await Promise.all([
      supabase.from('machines').select('*').eq('company_id', currentCid),
      supabase.from('work_orders').select('*').eq('company_id', currentCid),
      supabase.from('mechanics').select('*').eq('company_id', currentCid),
      supabase.from('preventive_plans').select('*').eq('company_id', currentCid),
      supabase.from('production_logs').select('*').eq('company_id', currentCid).order('log_date', { ascending: true }).limit(30),
      supabase.from('production_daily_history').select('*').eq('company_id', currentCid).order('log_date', { ascending: false }).limit(400),
    ]);
    if (m.error || w.error || me.error || p.error || pl.error || hist.error) {
      console.error('Dashboard load errors:', { m: m.error, w: w.error, me: me.error, p: p.error, pl: pl.error, hist: hist.error });
    }
    if (currentCid !== cid) return;
    setMachines(m.data ?? []);
    setWorkOrders(w.data ?? []);
    setMechanics(me.data ?? []);
    setPreventives(p.data ?? []);
    setProduction(pl.data ?? []);
    setHistory(hist.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
    if (!cid) return;
    const channel = supabase.channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders', filter: `company_id=eq.${cid}` }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'machines', filter: `company_id=eq.${cid}` }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mechanics', filter: `company_id=eq.${cid}` }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'preventive_plans', filter: `company_id=eq.${cid}` }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_logs', filter: `company_id=eq.${cid}` }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_daily_history', filter: `company_id=eq.${cid}` }, loadAll)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid]);

  const [productionRange, setProductionRange] = useState<'hora' | 'dia' | 'semana' | 'mes' | 'total'>('dia');
  const [showProdInput, setShowProdInput] = useState(false);
  const [prodUnits, setProdUnits] = useState('');
  const [prodSubmitting, setProdSubmitting] = useState(false);
  const [prodMsg, setProdMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const canRegisterProduction = usePermission('register_production');
  const isSupervisora = canRegisterProduction;

  const submitProduction = async () => {
    if (!cid || !prodUnits) return;
    setProdSubmitting(true);
    setProdMsg(null);
    const now = new Date();
    const units = parseInt(prodUnits, 10);
    const logDate = now.toISOString().slice(0, 10);
    const hour = now.getHours();

    // Optimistic update: add to local state immediately so the chart updates instantly
    const tempId = `temp-${Date.now()}`;
    setProduction((prev) => [...prev, {
      id: tempId, company_id: cid, machine_id: null, log_date: logDate,
      units_produced: units, uptime_hours: 0, production_hour: hour, created_at: now.toISOString(),
    }]);

    const { error } = await supabase.from('production_logs').insert({
      company_id: cid,
      log_date: logDate,
      production_hour: hour,
      units_produced: units,
    });
    setProdSubmitting(false);
    if (error) {
      // Rollback optimistic update
      setProduction((prev) => prev.filter((p) => p.id !== tempId));
      setProdMsg({ ok: false, text: 'Erro ao registrar produção.' });
    } else {
      setProdMsg({ ok: true, text: 'Produção registrada com sucesso!' });
      setProdUnits('');
      setTimeout(() => setProdMsg(null), 3000);
    }
  };

  const productionData = useMemo(() => {
    const now = new Date();
    if (productionRange === 'total') {
      const days: { label: string; value: number; detail: string }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const iso = d.toISOString().slice(0, 10);
        const label = i === 0 ? 'Hoje' : d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
        const detail = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
        const total = production.filter((p) => p.log_date === iso).reduce((s, p) => s + (p.units_produced ?? 0), 0);
        days.push({ label, value: total, detail });
      }
      return days;
    }
    if (productionRange === 'hora') {
      const hours: { label: string; value: number; detail: string }[] = [];
      for (let i = 7; i >= 0; i--) {
        const h = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() - i);
        const isoDate = h.toISOString().slice(0, 10);
        const hour = h.getHours();
        const total = production
          .filter((p) => p.log_date === isoDate && p.production_hour === hour)
          .reduce((s, p) => s + (p.units_produced ?? 0), 0);
        const detail = h.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }) + ` às ${hour}h`;
        hours.push({ label: `${hour}h`, value: total, detail });
      }
      return hours;
    }
    if (productionRange === 'semana') {
      const weeks: { label: string; value: number; detail: string }[] = [];
      for (let i = 5; i >= 0; i--) {
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i * 7);
        const start = new Date(end); start.setDate(start.getDate() - 6);
        const startStr = start.toISOString().slice(0, 10);
        const endStr = end.toISOString().slice(0, 10);
        const total = production
          .filter((p) => p.log_date >= startStr && p.log_date <= endStr)
          .reduce((s, p) => s + (p.units_produced ?? 0), 0);
        const detail = `${start.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} a ${end.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
        weeks.push({ label: `S${i === 0 ? ' atual' : `-${i}`}`, value: total, detail });
      }
      return weeks;
    }
    if (productionRange === 'mes') {
      const months: { label: string; value: number; detail: string }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthStr = d.toISOString().slice(0, 7);
        const total = production
          .filter((p) => p.log_date?.slice(0, 7) === monthStr)
          .reduce((s, p) => s + (p.units_produced ?? 0), 0);
        const detail = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
        months.push({ label: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''), value: total, detail });
      }
      return months;
    }
    // dia
    const days: { label: string; value: number; detail: string }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
      const detail = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
      const total = production.filter((p) => p.log_date === iso).reduce((s, p) => s + (p.units_produced ?? 0), 0);
      days.push({ label, value: total, detail });
    }
    return days;
  }, [production, productionRange]);

  const osByPriority = useMemo(() => {
    const colors: Record<string, string> = { critica: '#ef4444', alta: '#f97316', media: '#0ea5e9', baixa: '#64748b' };
    const labels: Record<string, string> = { critica: 'Crítica', alta: 'Alta', media: 'Média', baixa: 'Baixa' };
    const order = ['critica', 'alta', 'media', 'baixa'];
    return order.map((k) => ({
      label: labels[k],
      value: workOrders.filter((w) => w.priority === k && w.status !== 'concluida' && w.status !== 'cancelada').length,
      color: colors[k],
    }));
  }, [workOrders]);

  const criticalAlerts = useMemo(() => {
    const machinesStopped = machines.filter((m) => m.status === 'parada').length;
    const criticalOS = workOrders.filter((w) => w.priority === 'critica' && w.status !== 'concluida' && w.status !== 'cancelada').length;
    return machinesStopped + criticalOS;
  }, [machines, workOrders]);

  // Highest-priority level among open work orders, drives the Alertas Críticos card icon
  const highestPriority = useMemo<OSPriority | null>(() => {
    const open = workOrders.filter((w) => w.status !== 'concluida' && w.status !== 'cancelada');
    if (open.length === 0) return null;
    return open.reduce<OSPriority>((highest, w) => {
      const p = w.priority as OSPriority;
      return PRIORITY_RANK[p] < PRIORITY_RANK[highest] ? p : highest;
    }, 'baixa');
  }, [workOrders]);

  const priorityIconMap: Record<OSPriority, typeof Flame> = {
    critica: Flame, alta: ArrowUpCircle, media: AlertCircle, baixa: CircleDot,
  };

  const availabilityBySector = useMemo(() => {
    const sectors = new Map<string, { total: number; working: number }>();
    machines.forEach((m) => {
      const s = m.sector || 'Sem setor';
      const cur = sectors.get(s) ?? { total: 0, working: 0 };
      cur.total += 1;
      if (m.status === 'producao') cur.working += 1;
      sectors.set(s, cur);
    });
    if (sectors.size === 0) return 0;
    let sum = 0;
    sectors.forEach((v) => { sum += (v.working / v.total) * 100; });
    return Math.round(sum / sectors.size);
  }, [machines]);

  const sectorList = useMemo(() => {
    const sectors = new Map<string, { total: number; working: number }>();
    machines.forEach((m) => {
      const s = m.sector || 'Sem setor';
      const cur = sectors.get(s) ?? { total: 0, working: 0 };
      cur.total += 1;
      if (m.status === 'producao') cur.working += 1;
      sectors.set(s, cur);
    });
    return Array.from(sectors.entries()).map(([name, v]) => ({
      name, ...v,
      pct: v.total > 0 ? Math.round((v.working / v.total) * 100) : 0,
    }));
  }, [machines]);

  const mechanicsInAttendance = mechanics.filter((m) => m.status === 'em_atendimento').length;

  const machineStatus = useMemo(() => ({
    producao: machines.filter((m) => m.status === 'producao').length,
    parada: machines.filter((m) => m.status === 'parada').length,
    manutencao: machines.filter((m) => m.status === 'manutencao').length,
  }), [machines]);

  const machinePriorityCount = useMemo(() => priorityCounts(machines, workOrders), [machines, workOrders]);
  const machinesWithOS = useMemo(() => PRIORITY_ORDER.reduce((s, p) => s + machinePriorityCount[p], 0), [machinePriorityCount]);

  const preventivesOnTime = useMemo(() => {
    const onTime = preventives.filter((p) => p.status === 'em_dia' || p.status === 'concluida').length;
    return preventives.length > 0 ? Math.round((onTime / preventives.length) * 100) : 100;
  }, [preventives]);

  const criticalItems = useMemo(() => {
    const items: { type: 'machine' | 'os'; title: string; sub: string }[] = [];
    machines.filter((m) => m.status === 'parada').forEach((m) => {
      items.push({ type: 'machine', title: m.name, sub: `Máquina parada · ${m.sector || 'Sem setor'}` });
    });
    workOrders.filter((w) => w.priority === 'critica' && w.status !== 'concluida' && w.status !== 'cancelada').forEach((w) => {
      items.push({ type: 'os', title: machineName(w.machine_id), sub: w.description ?? 'OS crítica aberta' });
    });
    return items.slice(0, 6);
  }, [machines, workOrders]);

  const recentActivities = useMemo(() => {
    return workOrders
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5)
      .map((w) => ({
        id: w.id,
        title: w.title || `OS ${w.id.slice(0, 8)}`,
        desc: w.description ?? '',
        status: w.status,
        time: new Date(w.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
      }));
  }, [workOrders]);

  // ── Histórico e comparativo ──
  const isToday = selectedDate === new Date().toISOString().slice(0, 10);
  const dayHistory = history.filter((h) => h.log_date === selectedDate);
  const dayProduction = isToday
    ? production.filter((p) => p.log_date === selectedDate)
    : dayHistory;
  const dayTotal = dayProduction.reduce((s, p) => s + (p.units_produced ?? 0), 0);
  const dayHours = dayProduction.reduce((s, p) => s + (p.uptime_hours ?? 0), 0);
  const dayAvgPerHour = dayHours > 0 ? dayTotal / dayHours : 0;
  const dayPeak = Math.max(0, ...dayProduction.map((p) => p.units_produced ?? 0));

  // Comparativo mês atual vs mês anterior
  const now = new Date();
  const thisMonth = now.toISOString().slice(0, 7);
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonth = lastMonthDate.toISOString().slice(0, 7);

  const thisMonthHist = history.filter((h) => h.log_date.slice(0, 7) === thisMonth);
  const lastMonthHist = history.filter((h) => h.log_date.slice(0, 7) === lastMonth);
  const thisMonthTotal = thisMonthHist.reduce((s, h) => s + (h.units_produced ?? 0), 0)
    + production.filter((p) => p.log_date.slice(0, 7) === thisMonth).reduce((s, p) => s + (p.units_produced ?? 0), 0);
  const lastMonthTotal = lastMonthHist.reduce((s, h) => s + (h.units_produced ?? 0), 0);
  const monthDiff = lastMonthTotal > 0 ? ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100 : 0;

  // Agrupar por dia para o gráfico comparativo
  const daysInMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const buildDailyTotals = (hist: ProductionDailyHistory[], month: string, numDays: number) => {
    const totals = new Array(numDays).fill(0);
    hist.filter((h) => h.log_date.slice(0, 7) === month).forEach((h) => {
      const day = parseInt(h.log_date.slice(8, 10), 10) - 1;
      if (day >= 0 && day < numDays) totals[day] += h.units_produced ?? 0;
    });
    return totals;
  };
  const thisMonthDays = daysInMonth(now);
  const lastMonthDays = daysInMonth(lastMonthDate);
  const thisMonthDaily = buildDailyTotals(thisMonthHist, thisMonth, thisMonthDays);
  const lastMonthDaily = buildDailyTotals(lastMonthHist, lastMonth, lastMonthDays);
  // Incluir produção de hoje no mês atual
  production.filter((p) => p.log_date.slice(0, 7) === thisMonth).forEach((p) => {
    const day = parseInt(p.log_date.slice(8, 10), 10) - 1;
    if (day >= 0 && day < thisMonthDays) thisMonthDaily[day] += p.units_produced ?? 0;
  });

  const shiftDate = (days: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().slice(0, 10));
  };
  const formatDateBR = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const monthName = (m: string) => new Date(m + '-01T00:00:00').toLocaleDateString('pt-BR', { month: 'long' });

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Spinner /></div>;
  }

  return (
    <div className="flex flex-col gap-6">

      <div className="card-hover bg-slate-900/80 rounded-2xl border border-slate-800 p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-cyan-400 animate-icon-glow" /> Produção — Hoje, Histórico e Comparativo
          </h3>
          <div className="flex items-center gap-1 bg-slate-800/60 rounded-lg p-1">
            {(['hoje', 'historico', 'comparativo'] as const).map((m) => (
              <button key={m} onClick={() => setViewMode(m)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${viewMode === m ? 'bg-cyan-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}>
                {m === 'hoje' ? 'Hoje' : m === 'historico' ? 'Histórico' : 'Comparativo'}
              </button>
            ))}
          </div>
        </div>

        {viewMode === 'hoje' && (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-3">
              <button onClick={() => shiftDate(-1)} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"><ChevronLeft className="w-5 h-5" /></button>
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800/60">
                <Calendar className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-medium text-white">{isToday ? 'Hoje' : formatDateBR(selectedDate)}</span>
              </div>
              <button onClick={() => shiftDate(1)} disabled={isToday} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition disabled:opacity-30"><ChevronRight className="w-5 h-5" /></button>
              {!isToday && <button onClick={() => setSelectedDate(new Date().toISOString().slice(0, 10))} className="px-3 py-2 rounded-lg bg-cyan-500/20 text-cyan-300 text-xs font-medium hover:bg-cyan-500/30 transition">Hoje</button>}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl bg-gradient-to-br from-cyan-500/10 to-blue-500/5 border border-cyan-500/20 p-3">
                <p className="text-xs text-slate-400">Produção total</p>
                <p className="text-2xl font-bold text-cyan-300 mt-1">{dayTotal.toLocaleString('pt-BR')}</p>
                <p className="text-xs text-slate-500 mt-0.5">peças</p>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-emerald-500/10 to-teal-500/5 border border-emerald-500/20 p-3">
                <p className="text-xs text-slate-400">Horas operadas</p>
                <p className="text-2xl font-bold text-emerald-300 mt-1">{dayHours.toFixed(1)}</p>
                <p className="text-xs text-slate-500 mt-0.5">horas</p>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-violet-500/10 to-purple-500/5 border border-violet-500/20 p-3">
                <p className="text-xs text-slate-400">Média por hora</p>
                <p className="text-2xl font-bold text-violet-300 mt-1">{Math.round(dayAvgPerHour).toLocaleString('pt-BR')}</p>
                <p className="text-xs text-slate-500 mt-0.5">peças/hora</p>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-500/5 border border-amber-500/20 p-3">
                <p className="text-xs text-slate-400">Pico de produção</p>
                <p className="text-2xl font-bold text-amber-300 mt-1">{dayPeak.toLocaleString('pt-BR')}</p>
                <p className="text-xs text-slate-500 mt-0.5">peças no pico</p>
              </div>
            </div>
            {dayProduction.length === 0 ? (
              <div className="h-32 flex items-center justify-center text-sm text-slate-500">Sem registros de produção para esta data.</div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {dayProduction.map((p, i) => {
                  const machine = machines.find((m) => m.id === p.machine_id);
                  return (
                    <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-800/40 hover:bg-slate-800/60 transition">
                      <span className="text-sm text-slate-300 truncate">{machine?.name ?? 'Máquina removida'}</span>
                      <span className="text-sm font-semibold text-cyan-300 whitespace-nowrap ml-2">{(p.units_produced ?? 0).toLocaleString('pt-BR')} peças</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {viewMode === 'historico' && (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-3">
              <button onClick={() => shiftDate(-1)} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"><ChevronLeft className="w-5 h-5" /></button>
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800/60">
                <Calendar className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-medium text-white">{isToday ? 'Hoje' : formatDateBR(selectedDate)}</span>
              </div>
              <button onClick={() => shiftDate(1)} disabled={isToday} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition disabled:opacity-30"><ChevronRight className="w-5 h-5" /></button>
              {!isToday && <button onClick={() => setSelectedDate(new Date().toISOString().slice(0, 10))} className="px-3 py-2 rounded-lg bg-cyan-500/20 text-cyan-300 text-xs font-medium hover:bg-cyan-500/30 transition">Hoje</button>}
            </div>
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-900/80 border border-slate-700 text-sm text-white focus:border-cyan-500 focus:outline-none" />
            {dayHistory.length === 0 ? (
              <div className="h-32 flex items-center justify-center text-sm text-slate-500">Sem histórico arquivado para esta data.</div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {dayHistory.map((h) => {
                  const machine = machines.find((m) => m.id === h.machine_id);
                  return (
                    <div key={h.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-800/40 hover:bg-slate-800/60 transition">
                      <div className="min-w-0">
                        <p className="text-sm text-slate-300 truncate">{machine?.name ?? 'Máquina removida'}</p>
                        <p className="text-xs text-slate-500">{h.shift ?? 'Sem turno'} · {h.uptime_hours?.toFixed(1)}h operadas</p>
                      </div>
                      <div className="text-right whitespace-nowrap ml-2">
                        <p className="text-sm font-semibold text-cyan-300">{(h.units_produced ?? 0).toLocaleString('pt-BR')} peças</p>
                        <p className="text-xs text-slate-500">{(h.production_per_hour ?? 0).toFixed(0)}/hora</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-cyan-500/10 border border-cyan-500/20 p-3 text-center">
                <p className="text-xs text-slate-400">Total do dia</p>
                <p className="text-xl font-bold text-cyan-300 mt-1">{dayHistory.reduce((s, h) => s + (h.units_produced ?? 0), 0).toLocaleString('pt-BR')}</p>
              </div>
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-center">
                <p className="text-xs text-slate-400">Horas totais</p>
                <p className="text-xl font-bold text-emerald-300 mt-1">{dayHistory.reduce((s, h) => s + (h.uptime_hours ?? 0), 0).toFixed(1)}</p>
              </div>
              <div className="rounded-xl bg-violet-500/10 border border-violet-500/20 p-3 text-center">
                <p className="text-xs text-slate-400">Média/hora</p>
                <p className="text-xl font-bold text-violet-300 mt-1">{(() => { const tot = dayHistory.reduce((s, h) => s + (h.units_produced ?? 0), 0); const hrs = dayHistory.reduce((s, h) => s + (h.uptime_hours ?? 0), 0); return hrs > 0 ? Math.round(tot / hrs).toLocaleString('pt-BR') : '0'; })()}</p>
              </div>
            </div>
          </div>
        )}

        {viewMode === 'comparativo' && (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-cyan-400" />
                <span className="text-sm text-slate-300 capitalize">{monthName(thisMonth)} (atual)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-slate-500" />
                <span className="text-sm text-slate-300 capitalize">{monthName(lastMonth)} (anterior)</span>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl bg-cyan-500/10 border border-cyan-500/20 p-3 text-center">
                <p className="text-xs text-slate-400 capitalize">{monthName(thisMonth)}</p>
                <p className="text-2xl font-bold text-cyan-300 mt-1">{thisMonthTotal.toLocaleString('pt-BR')}</p>
                <p className="text-xs text-slate-500 mt-0.5">peças produzidas</p>
              </div>
              <div className="rounded-xl bg-slate-600/20 border border-slate-600/40 p-3 text-center">
                <p className="text-xs text-slate-400 capitalize">{monthName(lastMonth)}</p>
                <p className="text-2xl font-bold text-slate-300 mt-1">{lastMonthTotal.toLocaleString('pt-BR')}</p>
                <p className="text-xs text-slate-500 mt-0.5">peças produzidas</p>
              </div>
              <div className={`rounded-xl border p-3 text-center ${monthDiff >= 0 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-rose-500/10 border-rose-500/20'}`}>
                <p className="text-xs text-slate-400">Variação</p>
                <p className={`text-2xl font-bold mt-1 ${monthDiff >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {monthDiff >= 0 ? '+' : ''}{monthDiff.toFixed(1)}%
                </p>
                <p className="text-xs text-slate-500 mt-0.5">{monthDiff >= 0 ? 'aumento' : 'redução'}</p>
              </div>
            </div>
            {/* Gráfico de barras comparativo dia a dia */}
            <div className="rounded-xl bg-slate-800/40 border border-slate-700/50 p-4">
              <p className="text-xs text-slate-400 mb-3">Produção diária — comparação dia a dia</p>
              <div className="flex items-end gap-[2px] h-40">
                {Array.from({ length: Math.max(thisMonthDays, lastMonthDays) }, (_, i) => {
                  const v1 = thisMonthDaily[i] ?? 0;
                  const v2 = lastMonthDaily[i] ?? 0;
                  const maxVal = Math.max(...thisMonthDaily, ...lastMonthDaily, 1);
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative">
                      <div className="flex items-end gap-0.5 w-full justify-center" style={{ height: '100%' }}>
                        <div className="w-1/2 max-w-[8px] rounded-t bg-gradient-to-t from-cyan-600 to-cyan-400 transition-all duration-500 hover:opacity-80" style={{ height: `${(v1 / maxVal) * 100}%` }} />
                        <div className="w-1/2 max-w-[8px] rounded-t bg-gradient-to-t from-slate-600 to-slate-400 transition-all duration-500 hover:opacity-80" style={{ height: `${(v2 / maxVal) * 100}%` }} />
                      </div>
                      {(i + 1) % 5 === 0 && <span className="text-[9px] text-slate-500 mt-0.5">{i + 1}</span>}
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                <span>Dia 1</span>
                <span>Dia {Math.max(thisMonthDays, lastMonthDays)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card-hover bg-slate-900/80 rounded-2xl border border-slate-800 p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-cyan-400 animate-icon-rainbow-glow" /> Produção
              <ArrowUp className="md:hidden w-5 h-5 text-cyan-300 animate-bounce" />
            </h3>
            <div className="flex items-center gap-1 flex-wrap">
              <div className="flex items-center gap-1 bg-slate-800/60 rounded-lg p-1 flex-wrap">
                {(['hora', 'dia', 'total', 'semana', 'mes'] as const).map((r) => (
                  <button key={r} onClick={() => setProductionRange(r)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${productionRange === r
                      ? 'bg-cyan-500 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'}`}>
                    {r === 'hora' ? 'Por hora' : r === 'dia' ? 'Por dia' : r === 'total' ? 'Total do dia' : r === 'semana' ? 'Por semana' : 'Por mês'}
                  </button>
                ))}
              </div>
              {isSupervisora && (
                <button onClick={() => setShowProdInput(!showProdInput)}
                  className={`px-6 py-3 rounded-xl text-base font-bold transition flex items-center gap-2 shadow-lg ${showProdInput ? 'bg-emerald-500 text-white shadow-emerald-500/30' : 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-cyan-500/30 hover:opacity-90'}`}>
                  <ClipboardEdit className="w-5 h-5 animate-icon-glow" /> Registrar
                </button>
              )}
            </div>
          </div>
          {isSupervisora && showProdInput && (
            <div className="mb-4 p-4 rounded-xl bg-slate-800/50 border border-cyan-500/20 space-y-3 animate-area-fade">
              <div className="flex items-center gap-2 text-sm font-medium text-cyan-300">
                <ClipboardEdit className="w-4 h-4 animate-icon-glow" /> Registrar produção
              </div>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="text-xs text-slate-400 block mb-1">Quantidade de peças produzidas</label>
                  <input type="number" value={prodUnits} onChange={(e) => setProdUnits(e.target.value)} placeholder="0" autoFocus
                    className="w-full px-3 py-2 rounded-lg bg-slate-900/80 border border-slate-700 text-sm text-white focus:border-cyan-500 focus:outline-none" />
                </div>
                <button onClick={submitProduction} disabled={!prodUnits || prodSubmitting}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-500 text-white text-sm font-medium hover:opacity-90 disabled:opacity-40 transition flex items-center gap-1.5">
                  <Send className="w-4 h-4 animate-icon-glow" /> {prodSubmitting ? 'Enviando...' : 'Registrar'}
                </button>
              </div>
              {prodMsg && (
                <span className={`text-xs font-medium ${prodMsg.ok ? 'text-emerald-400' : 'text-rose-400'}`}>{prodMsg.text}</span>
              )}
            </div>
          )}
          {productionData.every((d) => d.value === 0) ? (
            <div className="h-48 flex items-center justify-center text-sm text-slate-500">
              Sem registros de produção. {isSupervisora ? 'Use o botão "Registrar Produção" para inserir manualmente.' : 'Aguardando a supervisora registrar a produção.'}
            </div>
          ) : (
            <ProductionChart data={productionData} range={productionRange} />
          )}
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="rounded-xl bg-gradient-to-br from-cyan-500/10 to-blue-500/5 border border-cyan-500/20 p-3">
              <p className="text-xs text-slate-400">Produção total do período</p>
              <p className="text-2xl font-bold text-cyan-300 mt-1">{production.reduce((s, p) => s + (p.units_produced ?? 0), 0).toLocaleString('pt-BR')}</p>
              <p className="text-xs text-slate-500 mt-0.5">peças acumuladas</p>
            </div>
            <div className="rounded-xl bg-gradient-to-br from-emerald-500/10 to-teal-500/5 border border-emerald-500/20 p-3">
              <p className="text-xs text-slate-400">Produção de hoje</p>
              <p className="text-2xl font-bold text-emerald-300 mt-1">{production.filter((p) => p.log_date === new Date().toISOString().slice(0, 10)).reduce((s, p) => s + (p.units_produced ?? 0), 0).toLocaleString('pt-BR')}</p>
              <p className="text-xs text-slate-500 mt-0.5">peças hoje</p>
            </div>
            <div className="rounded-xl bg-gradient-to-br from-violet-500/10 to-purple-500/5 border border-violet-500/20 p-3 col-span-2 sm:col-span-1">
              <p className="text-xs text-slate-400">Média por hora</p>
              <p className="text-2xl font-bold text-violet-300 mt-1">{(() => {
                const todayLogs = production.filter((p) => p.log_date === new Date().toISOString().slice(0, 10));
                const hours = new Set(todayLogs.map((p) => p.production_hour).filter((h) => h !== null)).size;
                const totalToday = todayLogs.reduce((s, p) => s + (p.units_produced ?? 0), 0);
                return hours > 0 ? Math.round(totalToday / hours).toLocaleString('pt-BR') : '0';
              })()}</p>
              <p className="text-xs text-slate-500 mt-0.5">peças por hora</p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Clock className="w-3.5 h-3.5 animate-icon-glow" /> Atualizado em tempo real · Cálculo automático
            </div>
          </div>
        </div>

        <div className="card-hover bg-slate-900/80 rounded-2xl border border-slate-800 p-5">
          <h3 className="font-semibold text-white flex items-center gap-2 mb-4">
            <AlertTriangle className={`w-5 h-5 text-amber-400 animate-icon-glow ${criticalAlerts > 0 ? 'animate-blink-pulse' : ''}`} /> OS por Prioridade
          </h3>
          <AnimatedDonut data={osByPriority} ringRotate />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard icon={AlertTriangle} label="Alertas Críticos" value={criticalAlerts} sub={`${machines.filter((m) => m.status === 'parada').length} máquinas paradas`} accent="rose" sparkData={[2, 3, 1, 4, 2, 5, 3]} blinkIcon={criticalAlerts > 0} />
        <KpiCard icon={Gauge} label="Disponibilidade" value={`${availabilityBySector}%`} sub={`${sectorList.length} setores monitorados`} accent="emerald" sparkData={[80, 85, 78, 90, 88, 92, 87]} />
        <KpiCard icon={Users} label="Mecânicos Ativos" value={mechanicsInAttendance} sub={`${mechanics.length} mecânicos no total`} accent={mechanicsInAttendance > 0 ? 'emerald' : 'amber'} sparkData={[1, 2, 3, 2, 4, 3, 2]} fillEmpty={mechanicsInAttendance > 0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6">
        <div className="card-hover bg-slate-900/80 rounded-2xl border border-slate-800 overflow-hidden">
          <div className="p-5 border-b border-slate-800 flex items-center justify-between">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <PriorityAlertIcon priority={highestPriority} count={criticalAlerts} />
              Alertas Críticos
            </h3>
            <span className={`text-xs font-bold px-2 py-1 rounded-lg transition-colors duration-500 ${
              highestPriority === 'critica' ? 'text-rose-400 bg-rose-500/10'
              : highestPriority === 'alta' ? 'text-orange-400 bg-orange-500/10'
              : highestPriority === 'media' ? 'text-sky-400 bg-sky-500/10'
              : highestPriority === 'baixa' ? 'text-slate-300 bg-slate-500/10'
              : 'text-emerald-400 bg-emerald-500/10'
            }`}>{criticalAlerts}</span>
          </div>
          {criticalItems.length === 0 ? (
            <div className="p-5 text-center text-sm text-slate-500">Nenhum alerta crítico no momento.</div>
          ) : (
            <div className="divide-y divide-slate-800/50">
              {criticalItems.map((item, i) => (
                <div key={i} className="p-4 flex items-start gap-3 hover:bg-slate-800/40 transition">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${item.type === 'machine' ? 'bg-rose-500/10' : 'bg-orange-500/10'}`}>
                    {item.type === 'machine' ? <Cog className="w-4 h-4 text-rose-400 animate-icon-glow" /> : <Wrench className="w-4 h-4 text-orange-400 animate-icon-glow" />}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-slate-200 text-sm truncate">{item.title}</p>
                    <p className="text-xs text-slate-500 truncate">{item.sub}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card-hover bg-slate-900/80 rounded-2xl border border-slate-800 p-5">
          <h3 className="font-semibold text-white flex items-center gap-2 mb-4">
            <Cog className="w-5 h-5 text-sky-400 animate-icon-glow" /> Status das Máquinas
          </h3>
          <AnimatedDonut data={[
            { label: 'Produção', value: machineStatus.producao, color: '#10b981' },
            { label: 'Manutenção', value: machineStatus.manutencao, color: '#0ea5e9' },
            { label: 'Paradas', value: machineStatus.parada, color: '#ef4444' },
          ]} />
          <div className="mt-4 pt-4 border-t border-slate-800">
            <p className="text-xs text-slate-400 font-medium mb-2">Máquinas por prioridade de OS</p>
            <div className="flex flex-wrap gap-1.5">
              {PRIORITY_ORDER.map((p) => {
                const cnt = machinePriorityCount[p];
                if (cnt === 0) return null;
                const st = PRIORITY_STYLES[p];
                return (
                  <span key={p} className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold ${st.bg} ${st.text} border ${st.border}`}>
                    <span className={`w-2 h-2 rounded-full ${st.dot}`} />
                    {st.label}: {cnt}
                  </span>
                );
              })}
              {machinesWithOS === 0 && <span className="text-xs text-slate-500">Sem OS abertas</span>}
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between text-sm">
            <span className="text-slate-400 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-cyan-400 animate-icon-glow" /> Preventivas em dia</span>
            <span className="font-semibold text-cyan-400">{preventivesOnTime}%</span>
          </div>
        </div>

        <div className="card-hover bg-slate-900/80 rounded-2xl border border-slate-800 overflow-hidden">
          <div className="p-5 border-b border-slate-800 flex items-center justify-between">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <Users className={`w-5 h-5 animate-icon-glow ${mechanicsInAttendance > 0 ? 'text-emerald-400 animate-blink-pulse' : 'text-amber-400'}`} /> Mecânicos
            </h3>
            <span className="text-xs text-slate-500">{mechanics.length} cadastrados</span>
          </div>
          {mechanics.length === 0 ? (
            <div className="p-5 text-center text-sm text-slate-500">Nenhum mecânico cadastrado.</div>
          ) : (
            <div className="divide-y divide-slate-800/50 max-h-64 overflow-y-auto">
              {mechanics.slice(0, 6).map((m) => {
                const acceptedOS = workOrders.find((w) => w.mechanic_id === m.id && w.status === 'em_andamento');
                const isAttending = m.status === 'em_atendimento' || !!acceptedOS;
                return (
                  <div key={m.id} className="p-4 flex items-center gap-3 hover:bg-slate-800/40 transition">
                    <div className={`relative w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${isAttending ? 'bg-gradient-to-br from-emerald-400 to-teal-500 text-slate-950 animate-mech-blink' : 'bg-gradient-to-br from-amber-400 to-orange-500 text-slate-950 animate-mech-blink'}`}>
                      {m.name[0]?.toUpperCase()}
                      {isAttending && <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-slate-900 animate-mech-blink" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-200 text-sm truncate">{m.name}</p>
                      <p className={`text-xs truncate ${isAttending ? 'text-emerald-400' : 'text-slate-500'}`}>
                        {isAttending ? `Atendendo: ${acceptedOS ? machineName(acceptedOS.machine_id) : 'OS em andamento'}` : (m.specialty ?? 'Geral')}
                      </p>
                    </div>
                    <MechanicBadge status={isAttending ? 'em_atendimento' : m.status} />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card-hover bg-slate-900/80 rounded-2xl border border-slate-800 p-5">
          <h3 className="font-semibold text-white flex items-center gap-2 mb-4">
            <Gauge className="w-5 h-5 text-emerald-400 animate-icon-glow" /> Disponibilidade por Setor
          </h3>
          {sectorList.length === 0 ? (
            <div className="py-6 text-center text-sm text-slate-500">Nenhum setor cadastrado.</div>
          ) : (
            <div className="space-y-4 max-h-64 overflow-y-auto">
              {sectorList.map((s) => (
                <div key={s.name}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-slate-300 truncate">{s.name}</span>
                    <span className="font-semibold text-white whitespace-nowrap ml-2">{s.pct}%</span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${s.pct >= 80 ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' : s.pct >= 50 ? 'bg-gradient-to-r from-amber-400 to-amber-500' : 'bg-gradient-to-r from-rose-400 to-rose-500'}`} style={{ width: `${s.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card-hover bg-slate-900/80 rounded-2xl border border-slate-800 overflow-hidden">
        <div className="p-5 border-b border-slate-800 flex items-center gap-2">
          <Activity className="w-5 h-5 text-cyan-400 animate-icon-glow" />
          <h3 className="font-semibold text-white">Atividades Recentes</h3>
        </div>
        {recentActivities.length === 0 ? (
          <div className="p-5 text-center text-sm text-slate-500">Nenhuma atividade recente.</div>
        ) : (
          <div className="divide-y divide-slate-800/50">
            {recentActivities.map((a) => (
              <div key={a.id} className="p-4 flex items-center gap-3 hover:bg-slate-800/40 transition">
                <div className="w-2 h-2 rounded-full bg-cyan-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-200 text-sm truncate">{a.title}</p>
                  {a.desc && <p className="text-xs text-slate-500 truncate">{a.desc}</p>}
                </div>
                <span className="text-xs text-slate-500 whitespace-nowrap hidden sm:inline">{a.time}</span>
                <StatusBadge status={a.status} />
              </div>
            ))}
          </div>
        )}
      </div>


    </div>
  );
}

function KpiCard({ icon: Icon, label, value, sub, accent, sparkData, spinIcon, blinkIcon, fillEmpty }: {
  icon: typeof AlertTriangle; label: string; value: string | number; sub: string;
  accent: 'rose' | 'emerald' | 'amber' | 'sky'; sparkData: number[]; spinIcon?: boolean; blinkIcon?: boolean | ((value: string | number) => boolean); fillEmpty?: boolean;
}) {
  const shouldBlink = typeof blinkIcon === 'function' ? blinkIcon(value) : blinkIcon;
  const styles = {
    rose: { iconBg: 'bg-rose-500/10', iconText: 'text-rose-400', value: 'text-rose-400', spark: '#f43f5e' },
    emerald: { iconBg: 'bg-emerald-500/10', iconText: 'text-emerald-400', value: 'text-emerald-400', spark: '#10b981' },
    amber: { iconBg: 'bg-amber-500/10', iconText: 'text-amber-400', value: 'text-amber-400', spark: '#f59e0b' },
    sky: { iconBg: 'bg-sky-500/10', iconText: 'text-sky-400', value: 'text-sky-400', spark: '#0ea5e9' },
  }[accent];

  const iconAnim = spinIcon ? 'animate-icon-glow-slow' : shouldBlink ? 'animate-blink-pulse' : fillEmpty ? 'animate-fill-empty' : 'animate-icon-glow';

  return (
    <div className={`card-hover bg-slate-900/80 rounded-2xl border border-slate-800 p-5 group ${fillEmpty ? 'animate-glow-border' : ''}`}>
      <div className="flex items-start justify-between">
        <div className={`relative w-12 h-12 rounded-xl ${styles.iconBg} flex items-center justify-center group-hover:scale-110 transition-transform`}>
          {fillEmpty && <span className={`absolute inset-0 rounded-xl ${styles.iconBg} animate-pulse-ring`} />}
          <Icon className={`w-6 h-6 ${styles.iconText} ${iconAnim} relative z-10`} />
        </div>
        <Sparkline data={sparkData} color={styles.spark} />
      </div>
      <p className="text-sm text-slate-400 font-medium mt-4">{label}</p>
      <p className={`text-3xl font-bold ${styles.value} mt-1`}>{value}</p>
      <p className="text-xs text-slate-500 mt-1.5">{sub}</p>
    </div>
  );
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const w = 60;
  const h = 24;
  const points = data.map((v, i) => ({
    x: (i / (data.length - 1)) * w,
    y: h - ((v - min) / range) * (h - 4) - 2,
  }));
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-15 h-6 opacity-70">
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Power BI-style interactive production chart ── */

type ChartDatum = { label: string; value: number; detail: string };

const BAR_PALETTE = [
  { top: '#22d3ee', bottom: '#0e7490', glow: '#22d3ee' },
  { top: '#a855f7', bottom: '#7e22ce', glow: '#a855f7' },
  { top: '#f59e0b', bottom: '#b45309', glow: '#f59e0b' },
  { top: '#10b981', bottom: '#047857', glow: '#10b981' },
  { top: '#ec4899', bottom: '#be185d', glow: '#ec4899' },
  { top: '#3b82f6', bottom: '#1e40af', glow: '#3b82f6' },
  { top: '#84cc16', bottom: '#4d7c0f', glow: '#84cc16' },
  { top: '#f97316', bottom: '#c2410c', glow: '#f97316' },
  { top: '#06b6d4', bottom: '#0e7490', glow: '#06b6d4' },
  { top: '#eab308', bottom: '#a16207', glow: '#eab308' },
];

function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const start = display;
    const diff = value - start;
    if (diff === 0) return;
    const startTime = performance.now();
    const duration = 800;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(start + diff * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <span className={className}>{display.toLocaleString('pt-BR')}</span>;
}

function ProductionChart({ data, range }: { data: ChartDatum[]; range: string }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [visibleStart, setVisibleStart] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [chartType, setChartType] = useState<'bar' | 'line' | 'area' | 'combo'>('combo');
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-cycle chart types in a loop: combo -> bar -> line -> area -> combo
  useEffect(() => {
    const cycle: ('combo' | 'bar' | 'line' | 'area')[] = ['combo', 'bar', 'line', 'area'];
    let idx = 0;
    const interval = setInterval(() => {
      idx = (idx + 1) % cycle.length;
      setChartType(cycle[idx]);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const max = Math.max(...data.map((d) => d.value), 1);
  const w = 100;
  const h = 100;

  const VISIBLE_COUNT = Math.min(data.length, 8);
  const maxStart = Math.max(0, data.length - VISIBLE_COUNT);
  const clampedStart = Math.min(visibleStart, maxStart);
  const visibleData = data.slice(clampedStart, clampedStart + VISIBLE_COUNT);
  const barW = visibleData.length > 0 ? (w / visibleData.length) * 0.65 : 0;
  const gap = visibleData.length > 0 ? (w / visibleData.length) * 0.35 : 0;

  const points = visibleData.map((d, i) => ({
    x: (i / Math.max(visibleData.length - 1, 1)) * w,
    y: h - (d.value / max) * (h - 14) - 7,
    ...d,
  }));
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
  const areaPath = `${linePath} L ${w} ${h} L 0 ${h} Z`;

  const total = visibleData.reduce((s, d) => s + d.value, 0);
  const avg = visibleData.length > 0 ? Math.round(total / visibleData.length) : 0;
  const peak = Math.max(...visibleData.map(d => d.value), 0);
  const minVal = Math.min(...visibleData.map(d => d.value), 0);
  const efficiency = peak > 0 ? Math.min(100, Math.round((avg / peak) * 100)) : 0;
  const effColor = efficiency >= 80 ? '#10b981' : efficiency >= 60 ? '#f59e0b' : '#ef4444';
  const trend = visibleData.length >= 2 ? visibleData[visibleData.length - 1].value - visibleData[0].value : 0;
  const trendPct = visibleData[0]?.value > 0 ? Math.round((trend / visibleData[0].value) * 100) : 0;

  const onTouchStart = (e: React.TouchEvent) => setTouchStart(e.touches[0].clientX);
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    const delta = e.changedTouches[0].clientX - touchStart;
    if (Math.abs(delta) > 40) {
      if (delta < 0 && clampedStart < maxStart) setVisibleStart(clampedStart + 1);
      else if (delta > 0 && clampedStart > 0) setVisibleStart(clampedStart - 1);
    }
    setTouchStart(null);
  };

  const showBars = chartType === 'bar' || chartType === 'combo';
  const showLine = chartType === 'line' || chartType === 'combo';
  const showArea = chartType === 'area' || chartType === 'combo';

  return (
    <div className="w-full" ref={containerRef} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <div className="rounded-xl bg-gradient-to-br from-cyan-500/10 to-blue-500/5 border border-cyan-500/20 px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Total</p>
          <p className="text-xl font-bold text-cyan-300"><AnimatedNumber value={total} /></p>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-emerald-500/10 to-teal-500/5 border border-emerald-500/20 px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Média</p>
          <p className="text-xl font-bold text-emerald-300"><AnimatedNumber value={avg} /></p>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-500/5 border border-amber-500/20 px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Pico</p>
          <p className="text-xl font-bold text-amber-300"><AnimatedNumber value={peak} /></p>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-violet-500/10 to-fuchsia-500/5 border border-violet-500/20 px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Tendência</p>
          <p className={`text-xl font-bold flex items-center gap-1 ${trend >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {trend >= 0 ? '↗' : '↘'} {Math.abs(trendPct)}%
          </p>
        </div>
      </div>

      {/* Chart type selector + efficiency badge */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-1 bg-slate-800/60 rounded-lg p-1">
          {(['combo', 'bar', 'line', 'area'] as const).map((t) => (
            <button key={t} onClick={() => setChartType(t)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${chartType === t
                ? 'bg-gradient-to-r from-cyan-500 to-violet-500 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'}`}>
              {t === 'combo' ? 'Combo' : t === 'bar' ? 'Barras' : t === 'line' ? 'Linha' : 'Área'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <Zap className="w-3.5 h-3.5 animate-icon-glow" style={{ color: effColor }} />
          <span className="text-slate-400">Eficiência: <span className="font-semibold" style={{ color: effColor }}>{efficiency}%</span></span>
          <span className="text-slate-600">·</span>
          <span className="text-slate-400">Min: <span className="font-semibold text-rose-300">{minVal.toLocaleString('pt-BR')}</span></span>
        </div>
      </div>

      <div className="relative">
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-60">
          <defs>
            <linearGradient id="areaGradProd" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.4" />
              <stop offset="30%" stopColor="#a855f7" stopOpacity="0.25" />
              <stop offset="60%" stopColor="#ec4899" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="lineGradProd" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#22d3ee" />
              <stop offset="20%" stopColor="#3b82f6" />
              <stop offset="40%" stopColor="#a855f7" />
              <stop offset="60%" stopColor="#ec4899" />
              <stop offset="80%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#10b981" />
            </linearGradient>
            <filter id="glowProd">
              <feGaussianBlur stdDeviation="1.2" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            {BAR_PALETTE.map((c, i) => (
              <linearGradient key={i} id={`barGrad${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c.top} stopOpacity="0.95" />
                <stop offset="100%" stopColor={c.bottom} stopOpacity="0.7" />
              </linearGradient>
            ))}
          </defs>

          {/* Grid lines */}
          {[0, 20, 40, 60, 80, 100].map((gy) => (
            <line key={gy} x1="0" y1={gy} x2={w} y2={gy} stroke="#1e293b" strokeWidth="0.25" vectorEffect="non-scaling-stroke" />
          ))}

          {/* Area fill */}
          {showArea && (
            <path d={areaPath} fill="url(#areaGradProd)" className="animate-area-fade" />
          )}

          {/* Bars */}
          {showBars && visibleData.map((d, i) => {
            const barH = (d.value / max) * (h - 14);
            const barX = i * (barW + gap) + gap / 2;
            const barY = h - barH - 7;
            const colorIdx = (clampedStart + i) % BAR_PALETTE.length;
            const isHovered = hovered === i;
            return (
              <g key={`bar-${i}`}>
                <rect x={barX} y={barY} width={barW} height={Math.max(barH, 0.5)} rx="1.5"
                  fill={`url(#barGrad${colorIdx})`}
                  className="animate-bar-grow animate-chart-bar-dance"
                  style={{ animationDelay: `${i * 0.06}s`, transformOrigin: 'bottom' }}
                  opacity={hovered !== null && !isHovered ? 0.4 : 1} />
                {isHovered && (
                  <rect x={barX - 0.5} y={barY - 1} width={barW + 1} height={Math.max(barH, 0.5) + 1} rx="2"
                    fill="none" stroke={BAR_PALETTE[colorIdx].glow} strokeWidth="0.8" vectorEffect="non-scaling-stroke" opacity="0.8" />
                )}
              </g>
            );
          })}

          {/* Line */}
          {showLine && (
            <path d={linePath} fill="none" stroke="url(#lineGradProd)" strokeWidth="2" vectorEffect="non-scaling-stroke"
              className="animate-line-draw" filter="url(#glowProd)" />
          )}

          {/* Hover guide */}
          {hovered !== null && (
            <line x1={points[hovered].x} y1="0" x2={points[hovered].x} y2={h}
              stroke="#22d3ee" strokeWidth="0.4" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" opacity="0.5" />
          )}

          {/* Data points */}
          {showLine && points.map((p, i) => {
            const colorIdx = (clampedStart + i) % BAR_PALETTE.length;
            const isHovered = hovered === i;
            return (
              <g key={`pt-${i}`}>
                <circle cx={p.x} cy={p.y} r={isHovered ? 3 : 1.8}
                  fill={isHovered ? '#22d3ee' : BAR_PALETTE[colorIdx].top}
                  stroke="#0f172a" strokeWidth="0.4" vectorEffect="non-scaling-stroke"
                  className="animate-point-pop animate-chart-point-glow"
                  style={{ animationDelay: `${i * 0.08}s` }} />
                {isHovered && (
                  <circle cx={p.x} cy={p.y} r="5" fill="none" stroke="#22d3ee" strokeWidth="0.6"
                    vectorEffect="non-scaling-stroke" opacity="0.4" />
                )}
              </g>
            );
          })}
        </svg>

        {/* Tooltip */}
        {hovered !== null && (
          <div
            className="absolute pointer-events-none z-20 px-3 py-2 rounded-lg bg-slate-950/95 border border-cyan-500/40 shadow-xl text-xs whitespace-nowrap"
            style={{
              left: `${(points[hovered].x / w) * 100}%`,
              top: `${(points[hovered].y / h) * 100}%`,
              transform: `translate(-50%, calc(-100% - 8px))`,
            }}
          >
            <p className="font-semibold text-cyan-300 capitalize">{points[hovered].detail}</p>
            <p className="text-slate-300 mt-0.5">{points[hovered].value.toLocaleString('pt-BR')} unidades</p>
          </div>
        )}
      </div>

      {/* X-axis labels */}
      <div className="flex justify-between mt-1 px-1">
        {visibleData.map((d, i) => (
          <button key={i}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => setHovered(hovered === i ? null : i)}
            className={`text-xs capitalize transition px-1 py-0.5 rounded ${hovered === i ? 'text-cyan-300 font-semibold' : 'text-slate-500 hover:text-slate-300'}`}>
            {d.label}
          </button>
        ))}
      </div>

      {/* Swipe / pagination */}
      {data.length > VISIBLE_COUNT && (
        <div className="mt-2 flex items-center justify-center gap-3 text-xs text-slate-500">
          <button onClick={() => setVisibleStart(s => Math.max(0, s - 1))} disabled={clampedStart === 0}
            className="px-2 py-1 rounded-lg bg-slate-800/60 hover:bg-slate-700 disabled:opacity-30 transition">‹</button>
          <span className="flex items-center gap-1.5">
            <span className="md:hidden">Deslize para ver mais</span>
            <span className="hidden md:inline">{clampedStart + 1}–{clampedStart + visibleData.length} de {data.length}</span>
          </span>
          <button onClick={() => setVisibleStart(s => Math.min(maxStart, s + 1))} disabled={clampedStart >= maxStart}
            className="px-2 py-1 rounded-lg bg-slate-800/60 hover:bg-slate-700 disabled:opacity-30 transition">›</button>
        </div>
      )}
    </div>
  );
}

/* ── Animated donut chart ── */

function AnimatedDonut({ data, ringRotate }: { data: { label: string; value: number; color: string }[]; ringRotate?: boolean }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const [animatedTotal, setAnimatedTotal] = useState(0);
  let cumulative = 0;

  useEffect(() => {
    setAnimatedTotal(0);
    const start = performance.now();
    const duration = 1000;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setAnimatedTotal(Math.round(eased * total));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [total]);

  return (
    <div className="flex flex-col sm:flex-row lg:flex-col items-center gap-4">
      <div className="relative w-36 h-36 flex-shrink-0">
        {/* Rotating glow ring */}
        {ringRotate && total > 0 && (
          <svg viewBox="0 0 160 160" className="absolute inset-0 w-full h-full animate-ring-rotate">
            <circle cx="80" cy="80" r={radius + 10} fill="none" stroke="url(#ringGrad)" strokeWidth="2.5"
              strokeDasharray="8 6" strokeLinecap="round" opacity="0.7" />
            <defs>
              <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#ef4444" />
                <stop offset="33%" stopColor="#f97316" />
                <stop offset="66%" stopColor="#0ea5e9" />
                <stop offset="100%" stopColor="#64748b" />
              </linearGradient>
            </defs>
          </svg>
        )}
        <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90 animate-donut-glow">
          <circle cx="80" cy="80" r={radius} fill="none" stroke="#1e293b" strokeWidth="16" />
          {total > 0 && data.map((d, i) => {
            const fraction = d.value / total;
            const dash = fraction * circumference;
            const offset = cumulative * circumference;
            cumulative += fraction;
            return (
              <circle key={i} cx="80" cy="80" r={radius} fill="none" stroke={d.color}
                strokeWidth="16" strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset} strokeLinecap="butt"
                style={{
                  animation: `donut-fill 1s ease-out forwards`,
                  ['--circumference' as any]: `${circumference}`,
                  ['--target-offset' as any]: `${-offset}`,
                }} />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-white">{animatedTotal}</span>
          <span className="text-xs text-slate-500">total</span>
        </div>
      </div>
      <div className="flex-1 space-y-2 w-full min-w-0">
        {data.map((d, i) => (
          <div key={i} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: d.color }} />
              <span className="text-sm text-slate-300 truncate">{d.label}</span>
            </div>
            <span className="text-sm font-semibold text-white flex-shrink-0">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MechanicBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    em_atendimento: 'bg-amber-500/10 text-amber-400',
    disponivel: 'bg-emerald-500/10 text-emerald-400',
    indisponivel: 'bg-slate-700/50 text-slate-400',
  };
  const labels: Record<string, string> = {
    em_atendimento: 'Em atendimento',
    disponivel: 'Disponível',
    indisponivel: 'Indisponível',
  };
  return <span className={`px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap ${styles[status] ?? styles.indisponivel}`}>{labels[status] ?? status}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    aberta: 'bg-cyan-500/10 text-cyan-400',
    em_andamento: 'bg-amber-500/10 text-amber-400',
    concluida: 'bg-emerald-500/10 text-emerald-400',
    cancelada: 'bg-slate-700/50 text-slate-400',
  };
  const labels: Record<string, string> = {
    aberta: 'Aberta', em_andamento: 'Em andamento', concluida: 'Concluída', cancelada: 'Cancelada',
  };
  return <span className={`px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap ${styles[status] ?? styles.cancelada}`}>{labels[status] ?? status}</span>;
}
