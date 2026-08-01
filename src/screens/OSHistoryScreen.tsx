import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase, type WorkOrder } from '@/lib/supabase';
import { EmptyState, Spinner } from '@/components/ui';
import { History, Search, ChevronDown, Cog, Wrench, CheckCircle2, XCircle, Clock } from 'lucide-react';

const statusStyles: Record<string, string> = {
  concluida: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  cancelada: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};
const statusLabels: Record<string, string> = { concluida: 'Concluída', cancelada: 'Cancelada' };
const typeLabels: Record<string, string> = { preventiva: 'Preventiva', corretiva: 'Corretiva', preditiva: 'Preditiva' };

type MachineLite = { id: string; name: string };
type MechanicLite = { id: string; name: string };
type Filter = 'todas' | 'concluida' | 'cancelada';

export default function OSHistoryScreen() {
  const { activeCompany } = useAuth();
  const cid = activeCompany?.id;
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [machines, setMachines] = useState<MachineLite[]>([]);
  const [mechanics, setMechanics] = useState<MechanicLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('todas');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!cid) return;
    (async () => {
      setLoading(true);
      const [o, m, mec] = await Promise.all([
        supabase.from('work_orders').select('*').eq('company_id', cid)
          .in('status', ['concluida', 'cancelada'])
          .order('created_at', { ascending: false }),
        supabase.from('machines').select('id, name').eq('company_id', cid),
        supabase.from('mechanics').select('id, name').eq('company_id', cid),
      ]);
      setOrders(o.data ?? []);
      setMachines(m.data ?? []);
      setMechanics(mec.data ?? []);
      setLoading(false);
    })();
    const channel = supabase.channel('os-history-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders', filter: `company_id=eq.${cid}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid]);

  const load = async () => {
    if (!cid) return;
    const { data: o } = await supabase.from('work_orders').select('*').eq('company_id', cid)
      .in('status', ['concluida', 'cancelada'])
      .order('created_at', { ascending: false });
    setOrders(o ?? []);
  };

  const machineName = (id: string | null) => machines.find((m) => m.id === id)?.name ?? '—';
  const mechanicName = (id: string | null) => mechanics.find((m) => m.id === id)?.name ?? '—';

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return orders.filter((w) => {
      if (filter !== 'todas' && w.status !== filter) return false;
      if (!q) return true;
      return (
        String(w.os_number ?? '').includes(q) ||
        `#${String(w.os_number ?? '').padStart(4, '0')}`.includes(q) ||
        (w.title ?? '').toLowerCase().includes(q) ||
        (w.description ?? '').toLowerCase().includes(q) ||
        machineName(w.machine_id).toLowerCase().includes(q) ||
        mechanicName(w.mechanic_id).toLowerCase().includes(q) ||
        (w.defect ?? '').toLowerCase().includes(q) ||
        (w.procedure ?? '').toLowerCase().includes(q) ||
        (w.replaced_part ?? '').toLowerCase().includes(q)
      );
    });
  }, [orders, search, filter, machines, mechanics]);

  const done = orders.filter((w) => w.status === 'concluida').length;
  const canceled = orders.length - done;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Histórico de OS</h2>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Todas as ordens de serviço já finalizadas</p>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <StatCard icon={History} label="Total" value={orders.length} color="text-sky-500" bg="bg-sky-50 dark:bg-sky-950/40" />
        <StatCard icon={CheckCircle2} label="Concluídas" value={done} color="text-emerald-500" bg="bg-emerald-50 dark:bg-emerald-950/40" />
        <StatCard icon={XCircle} label="Canceladas" value={canceled} color="text-rose-500" bg="bg-rose-50 dark:bg-rose-950/40" />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nº da OS, máquina, mecânico..."
            className="w-full pl-11 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition" />
        </div>
        <div className="flex gap-2">
          {(['todas', 'concluida', 'cancelada'] as Filter[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition ${filter === f
                ? 'bg-cyan-500 text-white shadow-sm'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-cyan-400'}`}>
              {f === 'todas' ? 'Todas' : statusLabels[f]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-12">
          <EmptyState icon={History} text="Nenhuma OS finalizada encontrada." />
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((w) => {
            const open = expanded === w.id;
            return (
              <div key={w.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
                <button onClick={() => setExpanded(open ? null : w.id)} className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${w.status === 'concluida' ? 'bg-emerald-50 dark:bg-emerald-950/40' : 'bg-slate-100 dark:bg-slate-800'}`}>
                    {w.status === 'concluida'
                      ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      : <XCircle className="w-5 h-5 text-slate-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-800 dark:text-slate-100">OS #{String(w.os_number ?? 0).padStart(4, '0')}</span>
                      <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${statusStyles[w.status]}`}>{statusLabels[w.status]}</span>
                      <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300">{typeLabels[w.type] ?? w.type}</span>
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      <Cog className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />{machineName(w.machine_id)}
                      <span className="mx-1.5">·</span>
                      <Wrench className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />{mechanicName(w.mechanic_id)}
                    </p>
                  </div>
                  <div className="text-right shrink-0 hidden sm:block">
                    <p className="text-xs text-slate-400">{w.finished_at ? new Date(w.finished_at).toLocaleDateString('pt-BR') : new Date(w.created_at).toLocaleDateString('pt-BR')}</p>
                  </div>
                  <ChevronDown className={`w-5 h-5 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>
                {open && (
                  <div className="px-4 pb-4 pt-1 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <Info label="Aberta em" value={new Date(w.created_at).toLocaleString('pt-BR')} />
                    {w.accepted_at && <Info label="Aceita em" value={new Date(w.accepted_at).toLocaleString('pt-BR')} />}
                    {w.finished_at && <Info label="Finalizada em" value={new Date(w.finished_at).toLocaleString('pt-BR')} />}
                    {w.description && <Info label="Descrição" value={w.description} />}
                    {w.defect && <Info label="Defeito encontrado" value={w.defect} />}
                    {w.procedure && <Info label="Procedimento realizado" value={w.procedure} />}
                    {w.replaced_part && <Info label="Peça substituída" value={w.replaced_part} />}
                    {w.accepted_at && w.finished_at && (
                      <Info label="Tempo de execução" value={duration(w.accepted_at, w.finished_at)} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function duration(start: string, end: string): string {
  const mins = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
  const h = Math.floor(mins / 60);
  return h > 0 ? `${h}h ${mins % 60}min` : `${mins}min`;
}

function StatCard({ icon: Icon, label, value, color, bg }: {
  icon: typeof Clock; label: string; value: number; color: string; bg: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${bg}`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div className="min-w-0">
        <p className="text-xl font-bold text-slate-800 dark:text-slate-100 leading-tight">{value}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{label}</p>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-400 dark:text-slate-500">{label}</p>
      <p className="text-slate-700 dark:text-slate-200 mt-0.5">{value}</p>
    </div>
  );
}
