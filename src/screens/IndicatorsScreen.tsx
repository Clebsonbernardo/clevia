import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase, type WorkOrder, type Machine, type ProductionLog } from '@/lib/supabase';
import { BarChart, LineChart, DonutChart } from '@/components/charts';
import { Spinner } from '@/components/ui';
import { BarChart3, TrendingUp, AlertTriangle, Clock, Activity, Gauge, Wrench, Cog } from 'lucide-react';

type AccentKey = 'emerald' | 'amber' | 'sky' | 'rose' | 'cyan' | 'violet';

const accentStyles: Record<AccentKey, {
  iconText: string; iconBg: string; valueText: string; barFrom: string; barTo: string; glow: string; spark: string;
}> = {
  emerald: { iconText: 'text-emerald-400', iconBg: 'bg-emerald-500/10', valueText: 'text-emerald-400', barFrom: 'from-emerald-500', barTo: 'to-emerald-400', glow: 'rgba(16,185,129,0.15)', spark: '#10b981' },
  amber:   { iconText: 'text-amber-400',   iconBg: 'bg-amber-500/10',   valueText: 'text-amber-400',   barFrom: 'from-amber-500',   barTo: 'to-amber-400',   glow: 'rgba(245,158,11,0.15)', spark: '#f59e0b' },
  sky:     { iconText: 'text-sky-400',     iconBg: 'bg-sky-500/10',     valueText: 'text-sky-400',     barFrom: 'from-sky-500',     barTo: 'to-sky-400',     glow: 'rgba(14,165,233,0.15)', spark: '#0ea5e9' },
  rose:    { iconText: 'text-rose-400',    iconBg: 'bg-rose-500/10',    valueText: 'text-rose-400',    barFrom: 'from-rose-500',    barTo: 'to-rose-400',    glow: 'rgba(244,63,94,0.15)',  spark: '#f43f5e' },
  cyan:    { iconText: 'text-cyan-400',    iconBg: 'bg-cyan-500/10',    valueText: 'text-cyan-400',    barFrom: 'from-cyan-500',    barTo: 'to-cyan-400',    glow: 'rgba(34,211,238,0.15)', spark: '#22d3ee' },
  violet:  { iconText: 'text-violet-400',  iconBg: 'bg-violet-500/10',  valueText: 'text-violet-400',  barFrom: 'from-violet-500',  barTo: 'to-violet-400',  glow: 'rgba(139,92,246,0.15)',  spark: '#8b5cf6' },
};

export default function IndicatorsScreen() {
  const { activeCompany } = useAuth();
  const cid = activeCompany?.id;
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [production, setProduction] = useState<ProductionLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!cid) return;
    (async () => {
      const [w, m, p] = await Promise.all([
        supabase.from('work_orders').select('*').eq('company_id', cid),
        supabase.from('machines').select('*').eq('company_id', cid),
        supabase.from('production_logs').select('*').eq('company_id', cid).order('log_date', { ascending: true }).limit(60),
      ]);
      setWorkOrders(w.data ?? []);
      setMachines(m.data ?? []);
      setProduction(p.data ?? []);
      setLoading(false);
    })();
    const channel = supabase.channel('indicators-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders', filter: `company_id=eq.${cid}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'machines', filter: `company_id=eq.${cid}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_logs', filter: `company_id=eq.${cid}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid]);

  const load = async () => {
    if (!cid) return;
    const [w, m, p] = await Promise.all([
      supabase.from('work_orders').select('*').eq('company_id', cid),
      supabase.from('machines').select('*').eq('company_id', cid),
      supabase.from('production_logs').select('*').eq('company_id', cid).order('log_date', { ascending: true }).limit(60),
    ]);
    setWorkOrders(w.data ?? []);
    setMachines(m.data ?? []);
    setProduction(p.data ?? []);
  };

  const osByMonth = useMemo(() => {
    const now = new Date();
    const months: { label: string; value: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ label: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''), value: 0 });
    }
    workOrders.forEach((w) => {
      const d = new Date(w.created_at);
      const diff = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
      if (diff >= 0 && diff <= 5) months[5 - diff].value += 1;
    });
    return months;
  }, [workOrders]);

  const osByType = useMemo(() => {
    const colors: Record<string, string> = { corretiva: '#ef4444', preventiva: '#10b981', preditiva: '#8b5cf6' };
    const labels: Record<string, string> = { corretiva: 'Corretiva', preventiva: 'Preventiva', preditiva: 'Preditiva' };
    return ['corretiva', 'preventiva', 'preditiva'].map((k) => ({
      label: labels[k], value: workOrders.filter((w) => w.type === k).length, color: colors[k],
    }));
  }, [workOrders]);

  const [productionRange, setProductionRange] = useState<'hora' | 'dia' | 'semana' | 'mes'>('dia');

  const productionData = useMemo(() => {
    const now = new Date();
    if (productionRange === 'hora') {
      const hours: { label: string; value: number }[] = [];
      for (let i = 7; i >= 0; i--) {
        const h = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() - i);
        const isoDate = h.toISOString().slice(0, 10);
        const hour = h.getHours();
        const total = production
          .filter((p) => p.log_date === isoDate && p.production_hour === hour)
          .reduce((s, p) => s + (p.units_produced ?? 0), 0);
        hours.push({ label: `${hour}h`, value: total });
      }
      return hours;
    }
    if (productionRange === 'semana') {
      const weeks: { label: string; value: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i * 7);
        const start = new Date(end); start.setDate(start.getDate() - 6);
        const startStr = start.toISOString().slice(0, 10);
        const endStr = end.toISOString().slice(0, 10);
        const total = production
          .filter((p) => p.log_date >= startStr && p.log_date <= endStr)
          .reduce((s, p) => s + (p.units_produced ?? 0), 0);
        weeks.push({ label: i === 0 ? 'S atual' : `S-${i}`, value: total });
      }
      return weeks;
    }
    if (productionRange === 'mes') {
      const months: { label: string; value: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthStr = d.toISOString().slice(0, 7);
        const total = production
          .filter((p) => p.log_date?.slice(0, 7) === monthStr)
          .reduce((s, p) => s + (p.units_produced ?? 0), 0);
        months.push({ label: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''), value: total });
      }
      return months;
    }
    const days: { label: string; value: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
      const total = production.filter((p) => p.log_date === iso).reduce((s, p) => s + (p.units_produced ?? 0), 0);
      days.push({ label, value: total });
    }
    return days;
  }, [production, productionRange]);

  const mttr = useMemo(() => {
    const finished = workOrders.filter((w) => w.status === 'concluida' && w.accepted_at && w.finished_at);
    if (finished.length === 0) return 0;
    const totalHours = finished.reduce((s, w) => {
      const diff = new Date(w.finished_at!).getTime() - new Date(w.accepted_at!).getTime();
      return s + diff / (1000 * 60 * 60);
    }, 0);
    return Math.round((totalHours / finished.length) * 10) / 10;
  }, [workOrders]);

  const mtbf = useMemo(() => {
    const corrective = workOrders.filter((w) => w.type === 'corretiva');
    if (corrective.length < 2) return 0;
    const totalHours = machines.length * 24 * 30;
    return Math.round((totalHours / corrective.length) * 10) / 10;
  }, [workOrders, machines]);

  const availability = useMemo(() => {
    if (machines.length === 0) return 0;
    const working = machines.filter((m) => m.status === 'producao').length;
    return Math.round((working / machines.length) * 100);
  }, [machines]);

  const criticalOS = workOrders.filter((w) => w.priority === 'critica' && w.status !== 'concluida' && w.status !== 'cancelada').length;

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Indicadores</h2>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Métricas de manutenção da empresa em tempo real</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Gauge} label="Disponibilidade" value={`${availability}%`} accent="emerald" progress={availability} spinIcon />
        <KpiCard icon={Clock} label="MTTR (h)" value={mttr} accent="amber" iconBounce />
        <KpiCard icon={Activity} label="MTBF (h)" value={mtbf} accent="sky" iconBounce />
        <KpiCard icon={AlertTriangle} label="OS críticas" value={criticalOS} accent="rose" blinkIcon />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="OS por mês" icon={TrendingUp} accent="cyan">
          <BarChart data={osByMonth} />
        </ChartCard>
        <ChartCard title="OS por tipo" icon={BarChart3} accent="violet">
          <DonutChart data={osByType} centerSublabel="total" />
        </ChartCard>
      </div>

      <ChartCard title="Produção" icon={TrendingUp} accent="cyan" rangeSelector={{ value: productionRange, onChange: setProductionRange }}>
        {productionData.every((d) => d.value === 0) ? (
          <div className="h-48 flex items-center justify-center text-sm text-slate-400">Sem registros de produção.</div>
        ) : (
          <LineChart data={productionData} color="#06b6d4" />
        )}
      </ChartCard>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, accent, progress, spinIcon, blinkIcon, iconBounce }: {
  icon: typeof Clock; label: string; value: string | number; accent: AccentKey;
  progress?: number; spinIcon?: boolean; blinkIcon?: boolean; iconBounce?: boolean;
}) {
  const s = accentStyles[accent];
  const iconAnim = spinIcon ? 'animate-spin-slow' : blinkIcon ? 'animate-blink-pulse' : iconBounce ? 'animate-icon-bounce' : '';

  return (
    <div
      className="card-hover bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 group relative overflow-hidden"
      style={{ boxShadow: `0 4px 24px -8px ${s.glow}, 0 0 0 1px rgba(0,0,0,0.02)` }}
    >
      {/* Animated gradient sheen */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none animate-shimmer"
        style={{ background: `linear-gradient(110deg, transparent 30%, ${s.glow} 50%, transparent 70%)` }}
      />
      <div className="relative flex items-start justify-between">
        <div className={`relative w-12 h-12 rounded-xl ${s.iconBg} flex items-center justify-center group-hover:scale-110 transition-transform`}>
          {blinkIcon && <span className={`absolute inset-0 rounded-xl ${s.iconBg} animate-pulse-ring`} />}
          <Icon className={`w-6 h-6 ${s.iconText} ${iconAnim} relative z-10`} />
        </div>
      </div>
      <p className="relative text-sm text-slate-500 dark:text-slate-400 font-medium mt-4">{label}</p>
      <p className={`relative text-3xl font-bold ${s.valueText} mt-1 animate-count-up`}>{value}</p>
      {progress !== undefined && (
        <div className="relative mt-3 w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${s.barFrom} ${s.barTo} transition-all duration-1000`}
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

function ChartCard({ title, icon: Icon, accent, children, rangeSelector }: {
  title: string; icon: typeof TrendingUp; accent: AccentKey; children: React.ReactNode;
  rangeSelector?: { value: 'hora' | 'dia' | 'semana' | 'mes'; onChange: (v: 'hora' | 'dia' | 'semana' | 'mes') => void };
}) {
  const s = accentStyles[accent];
  return (
    <div
      className="card-hover bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 group relative overflow-hidden"
      style={{ boxShadow: `0 4px 24px -8px ${s.glow}, 0 0 0 1px rgba(0,0,0,0.02)` }}
    >
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none animate-shimmer"
        style={{ background: `linear-gradient(110deg, transparent 30%, ${s.glow} 50%, transparent 70%)` }}
      />
      <div className="relative flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className={`font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2`}>
          <Icon className={`w-5 h-5 ${s.iconText} animate-icon-bounce`} /> {title}
        </h3>
        {rangeSelector && (
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/60 rounded-lg p-1">
            {(['hora', 'dia', 'semana', 'mes'] as const).map((r) => (
              <button key={r} onClick={() => rangeSelector.onChange(r)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition ${rangeSelector.value === r
                  ? 'bg-cyan-500 text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
                {r === 'hora' ? 'Por hora' : r === 'dia' ? 'Por dia' : r === 'semana' ? 'Por semana' : 'Por mês'}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}
