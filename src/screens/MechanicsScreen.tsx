import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase, type Mechanic, type Machine } from '@/lib/supabase';
import { Modal, Field, inputCls, EmptyState, Spinner } from '@/components/ui';
import { Users, Plus, Search, Pencil, Trash2, Phone, Mail, Wrench, Cog, Activity, AlertTriangle } from 'lucide-react';

const STATUS = ['disponivel', 'em_atendimento', 'inativo'] as const;
const statusStyles: Record<string, string> = {
  disponivel: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  em_atendimento: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  inativo: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};
const statusLabels: Record<string, string> = {
  disponivel: 'Disponível', em_atendimento: 'Em atendimento', inativo: 'Inativo',
};

const machineStatusStyles: Record<string, string> = {
  producao: 'bg-emerald-500',
  setup: 'bg-amber-500',
  parada: 'bg-rose-500',
  manutencao: 'bg-sky-500',
  fora_turno: 'bg-amber-600',
};
const machineStatusGlow: Record<string, string> = {
  producao: 'shadow-emerald-500/50',
  setup: 'shadow-amber-500/50',
  parada: 'shadow-rose-500/50',
  manutencao: 'shadow-sky-500/50',
  fora_turno: 'shadow-amber-600/50',
};
const machineStatusLabel: Record<string, string> = {
  producao: 'Em produção', setup: 'Em setup', parada: 'Parada', manutencao: 'Em manutenção', fora_turno: 'Fora de turno',
};

export default function MechanicsScreen() {
  const { activeCompany, activeRole } = useAuth();
  const cid = activeCompany?.id;
  const [mechanics, setMechanics] = useState<Mechanic[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Mechanic | null>(null);
  const [form, setForm] = useState<Partial<Mechanic>>({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!cid) return;
    setLoading(true);
    const [m, mc] = await Promise.all([
      supabase.from('mechanics').select('*').eq('company_id', cid).order('created_at', { ascending: false }),
      supabase.from('machines').select('*').eq('company_id', cid).order('name'),
    ]);
    setMechanics(m.data ?? []);
    setMachines(mc.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    if (!cid) return;
    const channel = supabase.channel('mechanics-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mechanics', filter: `company_id=eq.${cid}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'machines', filter: `company_id=eq.${cid}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid]);

  const filtered = mechanics.filter((t) => {
    const q = search.toLowerCase();
    return t.name.toLowerCase().includes(q) ||
      (t.specialty ?? '').toLowerCase().includes(q) ||
      (t.phone ?? '').toLowerCase().includes(q) ||
      (t.email ?? '').toLowerCase().includes(q);
  });

  const machineStats = useMemo(() => ({
    total: machines.length,
    producao: machines.filter((m) => m.status === 'producao').length,
    manutencao: machines.filter((m) => m.status === 'manutencao').length,
    parada: machines.filter((m) => m.status === 'parada').length,
  }), [machines]);

  const openNew = () => { setEditing(null); setForm({ status: 'disponivel' }); setModalOpen(true); };
  const openEdit = (t: Mechanic) => { setEditing(t); setForm(t); setModalOpen(true); };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!cid) return;
    setSaving(true);
    const payload = { ...form, company_id: cid };
    if (editing) { const { error: updErr } = await supabase.from('mechanics').update(payload).eq('id', editing.id); if (updErr) { alert('Erro ao atualizar mecânico: ' + updErr.message); setSaving(false); return; } }
    else { const { error: insErr } = await supabase.from('mechanics').insert(payload); if (insErr) { alert('Erro ao cadastrar mecânico: ' + insErr.message); setSaving(false); return; } }
    setSaving(false);
    setModalOpen(false);
    load();
  };

  const remove = async (t: Mechanic) => {
    if (!confirm(`Excluir o mecânico "${t.name}"?`)) return;
    const { error: delErr } = await supabase.from('mechanics').delete().eq('id', t.id);
    if (delErr) { alert('Erro ao excluir mecânico: ' + delErr.message); return; }
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Mecânicos</h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Equipe responsável pelas manutenções</p>
        </div>
        {(activeRole === 'ceo' || activeRole === 'gerente') && (
          <button onClick={openNew} className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-sky-500 text-white font-medium rounded-xl hover:from-cyan-400 hover:to-sky-400 transition shadow-sm">
            <Plus className="w-5 h-5" /> Novo mecânico
          </button>
        )}
      </div>

      {/* Flashboard — Machines */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Activity className="w-5 h-5 text-cyan-500" /> Painel de Máquinas
          </h3>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> {machineStats.producao} em produção
            </span>
            <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> {machineStats.manutencao} manutenção
            </span>
            <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> {machineStats.parada} paradas
            </span>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : machines.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-6">Nenhuma máquina cadastrada.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {machines.map((m) => (
              <div key={m.id} className={`relative rounded-xl border p-3 transition-all hover:scale-[1.03] cursor-default ${
                m.status === 'producao'
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
                  : m.status === 'manutencao'
                    ? 'bg-sky-50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-800'
                    : m.status === 'setup'
                      ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'
                      : m.status === 'parada'
                        ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800'
                        : 'bg-amber-700/10 dark:bg-amber-950/20 border-amber-700/30 dark:border-amber-800'
              }`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${machineStatusStyles[m.status] ?? 'bg-slate-400'} ${m.status === 'producao' ? 'animate-pulse shadow-md ' + (machineStatusGlow[m.status] ?? '') : ''}`} />
                  <Cog className={`w-4 h-4 ${
                    m.status === 'producao' ? 'text-emerald-500 animate-icon-gear' : m.status === 'manutencao' ? 'text-sky-500 animate-icon-wiggle' : m.status === 'setup' ? 'text-amber-500 animate-icon-wiggle' : m.status === 'parada' ? 'text-rose-500 animate-icon-pulse-soft' : 'text-amber-600 animate-icon-pulse-soft'
                  }`} />
                </div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{m.name}</p>
                <p className={`text-xs font-medium ${
                  m.status === 'producao' ? 'text-emerald-600 dark:text-emerald-400' : m.status === 'manutencao' ? 'text-sky-600 dark:text-sky-400' : m.status === 'setup' ? 'text-amber-600 dark:text-amber-400' : m.status === 'parada' ? 'text-rose-600 dark:text-rose-400' : 'text-amber-700 dark:text-amber-500'
                }`}>{machineStatusLabel[m.status] ?? m.status}</p>
                {m.code && <p className="text-xs text-slate-400 mt-0.5 truncate">{m.code}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Mechanics search */}
      <div className="relative w-full sm:max-w-md">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome ou especialidade..."
          className="w-full pl-11 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition" />
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-12">
          <EmptyState icon={Users} text="Nenhum mecânico encontrado." />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
          {filtered.map((t) => (
            <div key={t.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-5 hover:shadow-md transition group">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`relative w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg flex-shrink-0 ${
                    t.status === 'em_atendimento'
                      ? 'bg-gradient-to-br from-emerald-400 to-teal-500 text-slate-950 animate-mech-blink'
                      : t.status === 'disponivel'
                        ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-slate-950 animate-mech-blink'
                        : 'bg-gradient-to-br from-slate-400 to-slate-500 text-slate-950'
                  }`}>
                    {t.name[0]?.toUpperCase()}
                    {t.status === 'em_atendimento' && <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-white dark:border-slate-900 animate-mech-blink" />}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800 dark:text-slate-100">{t.name}</p>
                    {t.specialty && <p className="text-xs text-slate-400 flex items-center gap-1"><Wrench className="w-3 h-3" />{t.specialty}</p>}
                  </div>
                </div>
                {(activeRole === 'ceo' || activeRole === 'gerente') && (
                  <div className="flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition">
                    <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-sky-600"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => remove(t)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>
                  </div>
                )}
              </div>
              <div className="space-y-2 text-sm">
                {t.phone && <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400"><Phone className="w-4 h-4" />{t.phone}</div>}
                {t.email && <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400"><Mail className="w-4 h-4" />{t.email}</div>}
              </div>
              <div className="mt-4">
                <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${statusStyles[t.status] ?? ''}`}>{statusLabels[t.status] ?? t.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <Modal title={editing ? 'Editar mecânico' : 'Novo mecânico'} onClose={() => setModalOpen(false)}>
          <form onSubmit={save} className="space-y-4">
            <Field label="Nome" required>
              <input required value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Especialidade">
              <input value={form.specialty ?? ''} onChange={(e) => setForm({ ...form, specialty: e.target.value })} placeholder="Ex: Elétrica, Mecânica..." className={inputCls} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Telefone">
                <input value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} />
              </Field>
              <Field label="E-mail">
                <input type="email" value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} />
              </Field>
            </div>
            <Field label="Status">
              <select value={form.status ?? 'disponivel'} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inputCls}>
                {STATUS.map((s) => <option key={s} value={s}>{statusLabels[s]}</option>)}
              </select>
            </Field>
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
