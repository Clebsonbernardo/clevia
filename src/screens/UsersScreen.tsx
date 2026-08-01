import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase, type CompanyMember, type Mechanic } from '@/lib/supabase';
type MechanicLite = Pick<Mechanic, 'id' | 'name' | 'user_id'>;
import { Modal, Field, inputCls, EmptyState, Spinner } from '@/components/ui';
import { Users, Plus, Pencil, Trash2, Mail, Shield, UserPlus, Eye, EyeOff } from 'lucide-react';

const ROLES = [
  { value: 'ceo', label: 'CEO (acesso total)' },
  { value: 'gerente', label: 'Gerente (acesso total)' },
  { value: 'mecanico', label: 'Mecânico' },
  { value: 'solicitante', label: 'Solicitante' },
  { value: 'supervisora', label: 'Supervisora de Produção' },
];
const roleStyles: Record<string, string> = {
  ceo: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  gerente: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  mecanico: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  solicitante: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  supervisora: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
};
const roleLabels: Record<string, string> = { ceo: 'CEO', gerente: 'Gerente', mecanico: 'Mecânico', solicitante: 'Solicitante', supervisora: 'Supervisora de Produção' };

type NewUserForm = {
  email: string;
  password: string;
  displayName: string;
  role: string;
};

export default function UsersScreen() {
  const { activeCompany, user, members, refreshMembers } = useAuth();
  const cid = activeCompany?.id;
  const [allMembers, setAllMembers] = useState<CompanyMember[]>([]);
  const [mechanics, setMechanics] = useState<MechanicLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<CompanyMember | null>(null);
  const [form, setForm] = useState<Partial<CompanyMember>>({});
  const [saving, setSaving] = useState(false);

  const [newUser, setNewUser] = useState<NewUserForm>({ email: '', password: '', displayName: '', role: 'mecanico' });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [showPass, setShowPass] = useState(false);

  const load = async () => {
    if (!cid) return;
    setLoading(true);
    const [m, me] = await Promise.all([
      supabase.from('company_members').select('*').eq('company_id', cid).order('created_at', { ascending: false }),
      supabase.from('mechanics').select('id, name, user_id').eq('company_id', cid),
    ]);
    setAllMembers(m.data ?? []);
    setMechanics(me.data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [cid]);

  const openNew = () => { setEditing(null); setForm({ role: 'solicitante' }); setModalOpen(true); };
  const openEdit = (m: CompanyMember) => { setEditing(m); setForm(m); setModalOpen(true); };

  const openCreate = () => {
    setNewUser({ email: '', password: '', displayName: '', role: 'mecanico' });
    setCreateError(null);
    setCreateSuccess(null);
    setCreateOpen(true);
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!cid) return;
    setCreating(true);
    setCreateError(null);
    setCreateSuccess(null);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-team-member`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          email: newUser.email,
          password: newUser.password,
          displayName: newUser.displayName,
          role: newUser.role,
          companyId: cid,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error ?? 'Erro ao criar usuário.');
      } else {
        setCreateSuccess(data.linkedExisting
          ? 'Pessoa vinculada à empresa! Ela já pode entrar com o e-mail e a senha que já usava.'
          : 'Usuário criado e vinculado com sucesso!');
        setNewUser({ email: '', password: '', displayName: '', role: 'mecanico' });
        await load();
        refreshMembers();
      }
    } catch {
      setCreateError('Falha de conexão. Tente novamente.');
    }
    setCreating(false);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!cid) return;
    setSaving(true);
    if (editing) {
      const { error: updErr } = await supabase.from('company_members').update({ role: form.role, display_name: form.display_name }).eq('id', editing.id);
      if (updErr) { alert('Erro ao atualizar usuário: ' + updErr.message); setSaving(false); return; }
    }
    setSaving(false);
    setModalOpen(false);
    load();
    refreshMembers();
  };

  const remove = async (m: CompanyMember) => {
    if (m.user_id === user?.id) { alert('Você não pode remover a si mesmo.'); return; }
    if (!confirm(`Remover este usuário da empresa?`)) return;
    const { error: delErr } = await supabase.from('company_members').delete().eq('id', m.id);
    if (delErr) { alert('Erro ao remover usuário: ' + delErr.message); return; }
    load();
    refreshMembers();
  };

  const linkMechanic = async (m: CompanyMember) => {
    const mech = mechanics.find((me) => me.user_id === m.user_id);
    if (mech) { alert(`Já vinculado ao mecânico: ${mech.name}`); return; }
    if (!cid) { alert('Empresa não selecionada.'); return; }
    const name = m.display_name || `Mecânico ${m.user_id.slice(0, 4)}`;
    const { error: linkErr } = await supabase.from('mechanics').insert({ company_id: cid, user_id: m.user_id, name, status: 'disponivel' });
    if (linkErr) { alert('Erro ao vincular mecânico: ' + linkErr.message); return; }
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Usuários</h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Gerencie quem acessa o sistema e seus papéis</p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-sky-500 text-white font-medium rounded-xl hover:from-cyan-400 hover:to-sky-400 transition shadow-sm"
        >
          <UserPlus className="w-4 h-4" /> Adicionar usuário
        </button>
      </div>

      <div className="bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800 rounded-xl p-4 text-sm text-cyan-700 dark:text-cyan-300">
        <p className="flex items-start gap-2"><Shield className="w-4 h-4 mt-0.5 flex-shrink-0" /> Cadastre a pessoa direto aqui: informe o nome, e-mail e a senha que ela vai usar. Se o e-mail já tem conta no sistema (ex: pessoa que já usava o CLEVIA em outra empresa), deixe a senha em branco — ela continua usando a senha que já conhece e passa a ver a sua empresa ao entrar.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : allMembers.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-12">
          <EmptyState icon={Users} text="Nenhum usuário vinculado à empresa. Clique em 'Adicionar usuário'." />
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                  <tr>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Nome</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Papel</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Vinculado a mecânico</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                  {allMembers.map((m) => {
                    const linkedMech = mechanics.find((me) => me.user_id === m.user_id);
                    return (
                      <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition group">
                        <td className="px-5 py-3.5">
                          <p className="font-medium text-slate-800 dark:text-slate-100">{m.display_name ?? 'Sem nome'}</p>
                          <p className="text-xs text-slate-400">{m.user_id.slice(0, 8)}...</p>
                        </td>
                        <td className="px-5 py-3.5"><span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${roleStyles[m.role] ?? ''}`}>{roleLabels[m.role] ?? m.role}</span></td>
                        <td className="px-5 py-3.5 text-sm text-slate-600 dark:text-slate-300">
                          {linkedMech ? linkedMech.name : m.role === 'mecanico' ? (
                            <button onClick={() => linkMechanic(m)} className="text-cyan-600 dark:text-cyan-400 hover:underline">Vincular agora</button>
                          ) : '—'}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex gap-1 lg:opacity-0 lg:group-hover:opacity-100 transition justify-end">
                            <button onClick={() => openEdit(m)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-sky-600"><Pencil className="w-4 h-4" /></button>
                            {m.user_id !== user?.id && <button onClick={() => remove(m)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {allMembers.map((m) => {
              const linkedMech = mechanics.find((me) => me.user_id === m.user_id);
              return (
                <div key={m.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{m.display_name ?? 'Sem nome'}</p>
                      <p className="text-xs text-slate-400">{m.user_id.slice(0, 8)}...</p>
                    </div>
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-medium flex-shrink-0 ${roleStyles[m.role] ?? ''}`}>{roleLabels[m.role] ?? m.role}</span>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
                    {linkedMech ? `Mecânico: ${linkedMech.name}` : m.role === 'mecanico' ? (
                      <button onClick={() => linkMechanic(m)} className="text-cyan-600 dark:text-cyan-400 hover:underline">Vincular agora</button>
                    ) : '—'}
                  </p>
                  <div className="flex gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <button onClick={() => openEdit(m)} className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs font-medium transition flex items-center justify-center gap-1">
                      <Pencil className="w-3.5 h-3.5" /> Editar
                    </button>
                    {m.user_id !== user?.id && <button onClick={() => remove(m)} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs font-medium transition flex items-center gap-1">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Modal criar usuário */}
      {createOpen && (
        <Modal title="Adicionar usuário" onClose={() => setCreateOpen(false)}>
          <form onSubmit={handleCreate} className="space-y-4">
            <Field label="Nome da pessoa" required>
              <input
                required
                value={newUser.displayName}
                onChange={(e) => setNewUser({ ...newUser, displayName: e.target.value })}
                placeholder="Ex: João Silva"
                className={inputCls}
              />
            </Field>
            <Field label="E-mail" required>
              <input
                type="email"
                required
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                placeholder="pode ser o seu ou o da pessoa"
                className={inputCls}
              />
            </Field>
            <Field label="Senha">
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  minLength={newUser.password.length > 0 ? 6 : undefined}
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  placeholder="Deixe em branco se a pessoa já tem conta"
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-1">Se o e-mail já tem conta no sistema, deixe a senha em branco. A pessoa continua usando a senha que já conhece.</p>
            </Field>
            <Field label="Papel" required>
              <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })} className={inputCls}>
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </Field>

            {createError && (
              <div className="px-4 py-3 rounded-lg text-sm bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-300">
                {createError}
              </div>
            )}
            {createSuccess && (
              <div className="px-4 py-3 rounded-lg text-sm bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-300">
                {createSuccess}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setCreateOpen(false)} className="flex-1 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition">Fechar</button>
              <button type="submit" disabled={creating} className="flex-1 py-2.5 bg-gradient-to-r from-cyan-500 to-sky-500 text-white font-medium rounded-xl hover:from-cyan-400 hover:to-sky-400 transition disabled:opacity-60">
                {creating ? 'Criando...' : 'Criar e vincular'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal editar usuário */}
      {modalOpen && (
        <Modal title={editing ? 'Editar usuário' : 'Adicionar usuário'} onClose={() => setModalOpen(false)}>
          <form onSubmit={save} className="space-y-4">
            <Field label="Nome de exibição">
              <input value={form.display_name ?? ''} onChange={(e) => setForm({ ...form, display_name: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Papel" required>
              <select value={form.role ?? 'solicitante'} onChange={(e) => setForm({ ...form, role: e.target.value })} className={inputCls}>
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
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
