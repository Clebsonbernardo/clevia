import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase, type PreventivePlan, type Machine, type Branch } from '@/lib/supabase';
type MachineLite = Pick<Machine, 'id' | 'name'>;
type BranchLite = Pick<Branch, 'id' | 'name'>;
import { Modal, Field, inputCls, EmptyState, Spinner } from '@/components/ui';
import { ShieldCheck, Plus, Search, Pencil, Trash2, Calendar, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';

const statusStyles: Record<string, string> = {
  em_dia: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  atrasada: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  concluida: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
};
const statusLabels: Record<string, string> = { em_dia: 'Em dia', atrasada: 'Atrasada', concluida: 'Concluída' };

export default function PreventivesScreen() {
  const { activeCompany, activeRole } = useAuth();
  const cid = activeCompany?.id;
  const [plans, setPlans] = useState<PreventivePlan[]>([]);
  const [machines, setMachines] = useState<MachineLite[]>([]);
  const [branches, setBranches] = useState<BranchLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PreventivePlan | null>(null);
  const [form, setForm] = useState<Partial<PreventivePlan>>({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!cid) return;
    setLoading(true);
    const [p, m, b] = await Promise.all([
      supabase.from('preventive_plans').select('*').eq('company_id', cid).order('next_date', { ascending: true }),
      supabase.from('machines').select('id, name').eq('company_id', cid),
      supabase.from('branches').select('id, name').eq('company_id', cid),
    ]);
    setPlans(p.data ?? []);
    setMachines(m.data ?? []);
    setBranches(b.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    if (!cid) return;
    const channel = supabase.channel('preventives-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'preventive_plans', filter: `company_id=eq.${cid}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'machines', filter: `company_id=eq.${cid}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'branches', filter: `company_id=eq.${cid}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid]);

  const machineName = (id: string | null) => machines.find((m) => m.id === id)?.name ?? '—';
  const branchName = (id: string | null) => branches.find((b) => b.id === id)?.name ?? 'Matriz';
  const canEdit = activeRole === 'ceo' || activeRole === 'gerente' || activeRole === 'solicitante';

  const filtered = plans.filter((p) => {
    const q = search.toLowerCase();
    return p.title.toLowerCase().includes(q) ||
      (p.description ?? '').toLowerCase().includes(q) ||
      machineName(p.machine_id).toLowerCase().includes(q);
  });

  const openNew = () => {
    setEditing(null);
    const next = new Date(); next.setDate(next.getDate() + 30);
    setForm({ frequency_days: 30, next_date: next.toISOString().slice(0, 10), status: 'em_dia' });
    setModalOpen(true);
  };
  const openEdit = (p: PreventivePlan) => { setEditing(p); setForm(p); setModalOpen(true); };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!cid) return;
    setSaving(true);
    const payload = { ...form, company_id: cid };
    if (editing) { const { error: updErr } = await supabase.from('preventive_plans').update(payload).eq('id', editing.id); if (updErr) { alert('Erro ao atualizar plano: ' + updErr.message); setSaving(false); return; } }
    else { const { error: insErr } = await supabase.from('preventive_plans').insert(payload); if (insErr) { alert('Erro ao criar plano: ' + insErr.message); setSaving(false); return; } }
    setSaving(false);
    setModalOpen(false);
    load();
  };

  const remove = async (p: PreventivePlan) => {
    if (!confirm(`Excluir o plano "${p.title}"?`)) return;
    const { error: delErr } = await supabase.from('preventive_plans').delete().eq('id', p.id);
    if (delErr) { alert('Erro ao excluir plano: ' + delErr.message); return; }
    load();
  };

  const markDone = async (p: PreventivePlan) => {
    const today = new Date().toISOString().slice(0, 10);
    const next = new Date(); next.setDate(next.getDate() + p.frequency_days);
    const { error: doneErr } = await supabase.from('preventive_plans').update({
      last_executed: today, next_date: next.toISOString().slice(0, 10), status: 'em_dia',
    }).eq('id', p.id);
    if (doneErr) { alert('Erro ao marcar como executada: ' + doneErr.message); return; }
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Preventivas</h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Planos de manutenção preventiva agendados</p>
        </div>
        {canEdit && (
          <button onClick={openNew} className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-sky-500 text-white font-medium rounded-xl hover:from-cyan-400 hover:to-sky-400 transition shadow-sm">
            <Plus className="w-5 h-5" /> Novo plano
          </button>
        )}
      </div>

      <div className="relative w-full sm:max-w-md">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar plano..."
          className="w-full pl-11 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition" />
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-12">
          <EmptyState icon={ShieldCheck} text="Nenhum plano preventivo cadastrado." />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
          {filtered.map((p) => (
            <div key={p.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-5 hover:shadow-md transition group">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-cyan-50 dark:bg-cyan-950/40 flex items-center justify-center">
                    <ShieldCheck className="w-5 h-5 text-cyan-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800 dark:text-slate-100">{p.title}</p>
                    <p className="text-xs text-slate-400">{machineName(p.machine_id)}</p>
                  </div>
                </div>
                {canEdit && (
                  <div className="flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition">
                    <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-sky-600"><Pencil className="w-4 h-4" /></button>
                    {(activeRole === 'ceo' || activeRole === 'gerente') && <button onClick={() => remove(p)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>}
                  </div>
                )}
              </div>
              {p.description && <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">{p.description}</p>}
              <div className="space-y-1.5 text-sm">
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400"><Calendar className="w-4 h-4" /> Próxima: {new Date(p.next_date).toLocaleDateString('pt-BR')}</div>
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400"><Clock className="w-4 h-4" /> A cada {p.frequency_days} dias</div>
                {p.last_executed && <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400"><CheckCircle2 className="w-4 h-4" /> Última: {new Date(p.last_executed).toLocaleDateString('pt-BR')}</div>}
              </div>
              <div className="flex items-center justify-between mt-4">
                <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${statusStyles[p.status] ?? ''}`}>{statusLabels[p.status] ?? p.status}</span>
                {canEdit && (
                  <button onClick={() => markDone(p)} className="px-3 py-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-xs font-medium hover:bg-emerald-200 dark:hover:bg-emerald-900/60 transition flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> Executar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <Modal title={editing ? 'Editar plano' : 'Novo plano preventivo'} onClose={() => setModalOpen(false)}>
          <form onSubmit={save} className="space-y-4">
            <Field label="Título" required>
              <input required value={form.title ?? ''} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputCls} placeholder="Ex: Lubrificação semestral" />
            </Field>
            <Field label="Descrição">
              <textarea value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className={inputCls} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Máquina">
                <select value={form.machine_id ?? ''} onChange={(e) => setForm({ ...form, machine_id: e.target.value || null })} className={inputCls}>
                  <option value="">—</option>
                  {machines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </Field>
              <Field label="Filial">
                <select value={form.branch_id ?? ''} onChange={(e) => setForm({ ...form, branch_id: e.target.value || null })} className={inputCls}>
                  <option value="">Matriz</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Frequência (dias)" required>
                <input type="number" required min={1} value={form.frequency_days ?? 30} onChange={(e) => setForm({ ...form, frequency_days: parseInt(e.target.value) })} className={inputCls} />
              </Field>
              <Field label="Próxima data" required>
                <input type="date" required value={form.next_date ?? ''} onChange={(e) => setForm({ ...form, next_date: e.target.value })} className={inputCls} />
              </Field>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModalOpen(false)} className="flex-1 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition">Cancelar</button>
              <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-gradient-to-r from-cyan-500 to-sky-500 text-white font-medium rounded-xl hover:from-cyan-400 hover:to-sky-400 transition disabled:opacity-60">
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
