import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase, type Machine, type WorkOrder } from '@/lib/supabase';
import { EmptyState, Spinner } from '@/components/ui';
import { Cog, Search, ArrowLeft, Wrench, CheckCircle2, Clock, CircleDot, History, TrendingUp, AlertTriangle, Activity } from 'lucide-react';

const statusStyles: Record<string, string> = {
  aberta: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  em_andamento: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  concluida: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  cancelada: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};
const statusLabels: Record<string, string> = {
  aberta: 'Aberta', em_andamento: 'Em andamento', concluida: 'Concluída', cancelada: 'Cancelada',
};
const typeLabels: Record<string, string> = { preventiva: 'Preventiva', corretiva: 'Corretiva', preditiva: 'Preditiva' };

const machineStatusStyles: Record<string, string> = {
  producao: 'bg-emerald-500',
  setup: 'bg-amber-500',
  parada: 'bg-rose-500',
  manutencao: 'bg-sky-500',
  fora_turno: 'bg-amber-600',
};
const machineStatusLabel: Record<string, string> = {
  producao: 'Em produção', setup: 'Em setup', parada: 'Parada', manutencao: 'Em manutenção', fora_turno: 'Fora de turno',
};

type MechanicLite = { id: string; name: string };

export default function MachineHistoryScreen() {
  const { activeCompany } = useAuth();
  const cid = activeCompany?.id;
  const [machines, setMachines] = useState<Machine[]>([]);
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [mechanics, setMechanics] = useState<MechanicLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Machine | null>(null);

  useEffect(() => {
    if (!cid) return;
    (async () => {
      setLoading(true);
      const [m, o, mec] = await Promise.all([
        supabase.from('machines').select('*').eq('company_id', cid).order('name'),
        supabase.from('work_orders').select('*').eq('company_id', cid).order('created_at', { ascending: false }),
        supabase.from('mechanics').select('id, name').eq('company_id', cid),
      ]);
      setMachines(m.data ?? []);
      setOrders(o.data ?? []);
      setMechanics(mec.data ?? []);
      setLoading(false);
    })();
    const channel = supabase.channel('machine-history-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders', filter: `company_id=eq.${cid}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'machines', filter: `company_id=eq.${cid}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid]);

  const load = async () => {
    if (!cid) return;
    const [m, o] = await Promise.all([
      supabase.from('machines').select('*').eq('company_id', cid).order('name'),
      supabase.from('work_orders').select('*').eq('company_id', cid).order('created_at', { ascending: false }),
    ]);
    setMachines(m.data ?? []);
    setOrders(o.data ?? []);
  };

  const mechanicName = (id: string | null) => mechanics.find((m) => m.id === id)?.name ?? '—';
  const ordersFor = (machineId: string) => orders.filter((w) => w.machine_id === machineId);

  const filteredMachines = useMemo(() => {
    const q = search.toLowerCase();
    return machines.filter((m) =>
      m.name.toLowerCase().includes(q) ||
      (m.code ?? '').toLowerCase().includes(q) ||
      (m.sector ?? '').toLowerCase().includes(q));
  }, [machines, search]);

  // Ranking: machines with most maintenance orders
  const machineRanking = useMemo(() => {
    return machines
      .map((m) => {
        const list = ordersFor(m.id);
        const done = list.filter((w) => w.status === 'concluida');
        const corretivas = list.filter((w) => w.type === 'corretiva').length;
        const preventivas = list.filter((w) => w.type === 'preventiva').length;
        const open = list.filter((w) => w.status === 'aberta' || w.status === 'em_andamento').length;
        const last = done[0]?.finished_at ?? done[0]?.created_at ?? null;
        return { machine: m, total: list.length, done: done.length, corretivas, preventivas, open, last };
      })
      .sort((a, b) => b.total - a.total);
  }, [machines, orders]);

  const overallStats = useMemo(() => {
    const totalOS = orders.length;
    const totalDone = orders.filter((w) => w.status === 'concluida').length;
    const totalCorretivas = orders.filter((w) => w.type === 'corretiva').length;
    const totalPreventivas = orders.filter((w) => w.type === 'preventiva').length;
    const machinesWithIssues = machineRanking.filter((r) => r.total > 0).length;
    return { totalOS, totalDone, totalCorretivas, totalPreventivas, machinesWithIssues };
  }, [orders, machineRanking]);

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  if (selected) {
    const list = ordersFor(selected.id);
    const done = list.filter((w) => w.status === 'concluida');
    const corretivas = list.filter((w) => w.type === 'corretiva').length;
    const preventivas = list.filter((w) => w.type === 'preventiva').length;
    const last = done[0]?.finished_at ?? done[0]?.created_at ?? null;
    return (
      <div className="space-y-6">
        <div>
          <button onClick={() => setSelected(null)} className="flex items-center gap-1.5 text-sm text-cyan-600 dark:text-cyan-400 hover:underline mb-2">
            <ArrowLeft className="w-4 h-4" /> Todas as máquinas
          </button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-orange-50 dark:bg-orange-950/40 flex items-center justify-center">
              <Cog className="w-6 h-6 text-orange-500" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{selected.name}</h2>
              <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                {selected.code && <span>{selected.code} · </span>}Histórico completo de manutenções
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Stat label="Total de OS" value={String(list.length)} icon={History} color="text-sky-500" bg="bg-sky-50 dark:bg-sky-950/40" />
          <Stat label="Concluídas" value={String(done.length)} icon={CheckCircle2} color="text-emerald-500" bg="bg-emerald-50 dark:bg-emerald-950/40" />
          <Stat label="Corretivas / Preventivas" value={`${corretivas} / ${preventivas}`} icon={Wrench} color="text-orange-500" bg="bg-orange-50 dark:bg-orange-950/40" />
          <Stat label="Última manutenção" value={last ? new Date(last).toLocaleDateString('pt-BR') : '—'} icon={Clock} color="text-cyan-500" bg="bg-cyan-50 dark:bg-cyan-950/40" />
        </div>
        <div className="mt-2 text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-cyan-500 animate-pulse" />
          Modo visualização — mecânicos podem acompanhar os indicadores sem alterar dados.
        </div>

        {list.length === 0 ? (
          <div className="card-hover bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-12">
            <EmptyState icon={History} text="Esta máquina ainda não tem ordens de serviço." />
          </div>
        ) : (
          <div className="card-hover bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5">
            <div className="relative pl-6 space-y-6 before:absolute before:left-[7px] before:top-1 before:bottom-1 before:w-px before:bg-slate-200 dark:before:bg-slate-700">
              {list.map((w) => (
                <div key={w.id} className="relative">
                  <span className={`absolute -left-6 top-1 w-[15px] h-[15px] rounded-full border-2 border-white dark:border-slate-900 ${
                    w.status === 'concluida' ? 'bg-emerald-400' : w.status === 'cancelada' ? 'bg-slate-400' : w.status === 'em_andamento' ? 'bg-amber-400' : 'bg-sky-400'}`} />
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-800 dark:text-slate-100 text-sm">OS #{String(w.os_number ?? 0).padStart(4, '0')}</span>
                    <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${statusStyles[w.status] ?? ''}`}>{statusLabels[w.status] ?? w.status}</span>
                    <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300">{typeLabels[w.type] ?? w.type}</span>
                    <span className="text-xs text-slate-400 ml-auto">{new Date(w.created_at).toLocaleDateString('pt-BR')}</span>
                  </div>
                  {w.description && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{w.description}</p>}
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                    <Wrench className="w-3 h-3 inline mr-1 -mt-0.5" />{mechanicName(w.mechanic_id)}
                    {w.replaced_part && <span> · Peça: {w.replaced_part}</span>}
                  </p>
                  {w.status === 'concluida' && (w.defect || w.procedure || w.replaced_part) && (
                    <div className="mt-2 bg-emerald-50 dark:bg-emerald-950/20 rounded-lg p-3 space-y-1.5">
                      {w.defect && <div><p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold uppercase">Defeito</p><p className="text-sm text-slate-700 dark:text-slate-200">{w.defect}</p></div>}
                      {w.procedure && <div><p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold uppercase">Procedimento</p><p className="text-sm text-slate-700 dark:text-slate-200">{w.procedure}</p></div>}
                      {w.replaced_part && <div><p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold uppercase">Peça trocada</p><p className="text-sm text-slate-700 dark:text-slate-200">{w.replaced_part}</p></div>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Histórico de Máquinas</h2>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Acompanhe todas as máquinas e quais mais precisam de manutenção</p>
      </div>

      {/* Overall stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Stat label="Total de máquinas" value={String(machines.length)} icon={Cog} color="text-orange-500" bg="bg-orange-50 dark:bg-orange-950/40" />
        <Stat label="Total de OS" value={String(overallStats.totalOS)} icon={History} color="text-sky-500" bg="bg-sky-50 dark:bg-sky-950/40" />
        <Stat label="Corretivas" value={String(overallStats.totalCorretivas)} icon={AlertTriangle} color="text-rose-500" bg="bg-rose-50 dark:bg-rose-950/40" />
        <Stat label="Preventivas" value={String(overallStats.totalPreventivas)} icon={CheckCircle2} color="text-emerald-500" bg="bg-emerald-50 dark:bg-emerald-950/40" />
      </div>
      <div className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
        <Activity className="w-3.5 h-3.5 text-cyan-500 animate-pulse" />
        Modo visualização — mecânicos podem acompanhar os indicadores sem alterar dados.
      </div>

      {/* Ranking — machines with most maintenance */}
      {machineRanking.length > 0 && machineRanking.some((r) => r.total > 0) && (
        <div className="card-hover bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 group relative overflow-hidden">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-rose-500 animate-icon-bounce" /> Indicadores de interrupções por máquinas
          </h3>
          <div className="space-y-2">
            {machineRanking.filter((r) => r.total > 0).slice(0, 5).map((r, i) => {
              const maxTotal = machineRanking[0]?.total || 1;
              const pct = (r.total / maxTotal) * 100;
              return (
                <button key={r.machine.id} onClick={() => setSelected(r.machine)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition text-left group">
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    i === 0 ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400'
                    : i === 1 ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400'
                    : i === 2 ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-slate-800 dark:text-slate-100 truncate">{r.machine.name}</p>
                      {r.machine.code && <span className="text-xs text-slate-400">{r.machine.code}</span>}
                    </div>
                    <div className="mt-1.5 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${i === 0 ? 'bg-rose-500' : i === 1 ? 'bg-amber-500' : 'bg-orange-400'}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{r.total}</p>
                    <p className="text-xs text-slate-400">OS</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="relative w-full sm:max-w-md">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, código ou setor..."
          className="w-full pl-11 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition" />
      </div>

      {filteredMachines.length === 0 ? (
        <div className="card-hover bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-12">
          <EmptyState icon={Cog} text="Nenhuma máquina encontrada." />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
          {filteredMachines.map((m) => {
            const list = ordersFor(m.id);
            const openCount = list.filter((w) => w.status === 'aberta' || w.status === 'em_andamento').length;
            const doneCount = list.filter((w) => w.status === 'concluida').length;
            const corretivas = list.filter((w) => w.type === 'corretiva').length;
            return (
              <button key={m.id} onClick={() => setSelected(m)}
                className="card-hover bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 transition text-left group relative overflow-hidden">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-11 h-11 rounded-xl bg-orange-50 dark:bg-orange-950/40 flex items-center justify-center relative group-hover:scale-110 transition-transform">
                    <Cog className="w-5 h-5 text-orange-500 group-hover:rotate-45 transition-transform animate-icon-bounce" />
                    <span className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900 ${machineStatusStyles[m.status] ?? 'bg-slate-400'} animate-pulse`} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{m.name}</p>
                    {m.code && <p className="text-xs text-slate-400">{m.code}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mb-2">
                  <span className="flex items-center gap-1"><History className="w-3.5 h-3.5" /> {list.length} OS</span>
                  {openCount > 0 && (
                    <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400"><CircleDot className="w-3.5 h-3.5" /> {openCount} em aberto</span>
                  )}
                  {doneCount > 0 && (
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="w-3.5 h-3.5" /> {doneCount} concluídas</span>
                  )}
                </div>
                {corretivas > 0 && (
                  <div className="flex items-center gap-1 text-xs text-rose-500 dark:text-rose-400">
                    <AlertTriangle className="w-3.5 h-3.5 animate-blink-pulse" /> {corretivas} manutenções corretivas
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, icon: Icon, color, bg }: {
  label: string; value: string; icon: typeof Clock; color: string; bg: string;
}) {
  return (
    <div className="card-hover bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 flex items-center gap-3 group relative overflow-hidden">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${bg} group-hover:scale-110 transition-transform`}>
        <Icon className={`w-5 h-5 ${color} animate-icon-bounce`} />
      </div>
      <div className="min-w-0">
        <p className="text-lg font-bold text-slate-800 dark:text-slate-100 leading-tight truncate animate-count-up">{value}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{label}</p>
      </div>
    </div>
  );
}
