import { useEffect, useState, type FormEvent } from 'react';
import { supabase, type Company, type CompanyLicense } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Modal, Field, inputCls, Spinner, EmptyState } from '@/components/ui';
import {
  ShieldCheck, Clock, CheckCircle2, XCircle, AlertTriangle,
  Plus, Pencil, Calendar, DollarSign, Building2, RefreshCw, UserPlus,
  Trash2, Loader2, AlertOctagon, Users, Wallet, BadgeCheck, Lock,
} from 'lucide-react';
import NewCompanyWizard from '@/components/NewCompanyWizard';

type CompanyWithLicense = Company & {
  license: CompanyLicense | null;
  userCount: number;
};

const PRICE_PER_USER = 49.90;

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function LicensesScreen() {
  const { session } = useAuth();
  const [companies, setCompanies] = useState<CompanyWithLicense[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [newCompanyOpen, setNewCompanyOpen] = useState(false);
  const [editing, setEditing] = useState<CompanyLicense | null>(null);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [form, setForm] = useState<Partial<CompanyLicense>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingCompany, setDeletingCompany] = useState<Company | null>(null);
  const [deleteOwnerUser, setDeleteOwnerUser] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [globalFee, setGlobalFee] = useState<number>(PRICE_PER_USER);
  const [applyingFee, setApplyingFee] = useState(false);
  const [feeSuccess, setFeeSuccess] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: companiesData } = await supabase
      .from('companies')
      .select('*')
      .order('created_at', { ascending: false });
    const { data: licensesData } = await supabase
      .from('company_licenses')
      .select('*');
    const { data: membersData } = await supabase
      .from('company_members')
      .select('company_id');

    const licensesMap = new Map((licensesData ?? []).map((l: CompanyLicense) => [l.company_id, l]));
    const userCountMap = new Map<string, number>();
    (membersData ?? []).forEach((m: { company_id: string }) => {
      userCountMap.set(m.company_id, (userCountMap.get(m.company_id) ?? 0) + 1);
    });
    const merged = (companiesData ?? []).map((c: Company) => ({
      ...c,
      license: licensesMap.get(c.id) ?? null,
      userCount: userCountMap.get(c.id) ?? 0,
    }));
    setCompanies(merged);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openEdit = (company: Company, license: CompanyLicense | null) => {
    setEditingCompany(company);
    setEditing(license);
    setForm(license ? {
      plan: license.plan,
      status: license.status,
      monthly_fee: license.monthly_fee,
      next_payment_date: license.next_payment_date,
      expires_at: license.expires_at,
      notes: license.notes,
      per_user_fee: license.per_user_fee ?? PRICE_PER_USER,
      payment_status: license.payment_status ?? 'pending',
    } : {
      plan: 'paid',
      status: 'active',
      monthly_fee: 199.90,
      next_payment_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      per_user_fee: PRICE_PER_USER,
      payment_status: 'pending',
    });
    setError(null);
    setModalOpen(true);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingCompany) return;
    setSaving(true);
    setError(null);

    try {
      const expiresAt = form.expires_at
        ? new Date(form.expires_at).toISOString()
        : new Date(Date.now() + 30 * 86400000).toISOString();

      const payload = {
        company_id: editingCompany.id,
        plan: form.plan ?? 'paid',
        status: form.status ?? 'active',
        expires_at: expiresAt,
        monthly_fee: form.monthly_fee != null ? Number(form.monthly_fee) : null,
        next_payment_date: form.next_payment_date ?? null,
        notes: form.notes ?? null,
        per_user_fee: form.per_user_fee != null ? Number(form.per_user_fee) : PRICE_PER_USER,
        payment_status: form.payment_status ?? 'pending',
      };

      if (editing) {
        const { error: err } = await supabase
          .from('company_licenses')
          .update(payload)
          .eq('id', editing.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase
          .from('company_licenses')
          .insert(payload);
        if (err) throw err;
      }

      setSaving(false);
      setModalOpen(false);
      load();
    } catch (err) {
      console.error('license save failed', err);
      setError('Não foi possível salvar a licença. Verifique os dados e tente novamente.');
      setSaving(false);
    }
  };

  const renewMonthly = async (license: CompanyLicense) => {
    const nextDate = new Date(Date.now() + 30 * 86400000);
    const { error: renewErr } = await supabase
      .from('company_licenses')
      .update({
        status: 'active',
        plan: 'paid',
        expires_at: nextDate.toISOString(),
        next_payment_date: nextDate.toISOString().slice(0, 10),
      })
      .eq('id', license.id);
    if (renewErr) { alert('Erro ao renovar licença: ' + renewErr.message); return; }
    load();
  };

  const activatePaid = async (license: CompanyLicense) => {
    const nextDate = new Date(Date.now() + 30 * 86400000);
    const { error: actErr } = await supabase
      .from('company_licenses')
      .update({
        status: 'active',
        plan: 'paid',
        expires_at: nextDate.toISOString(),
        next_payment_date: nextDate.toISOString().slice(0, 10),
      })
      .eq('id', license.id);
    if (actErr) { alert('Erro ao ativar licença: ' + actErr.message); return; }
    load();
  };

  const markAsPaid = async (company: CompanyWithLicense) => {
    if (!company.license) return;
    setPayingId(company.id);
    const fee = company.license.per_user_fee ?? PRICE_PER_USER;
    const totalAmount = fee * company.userCount;
    const nextDate = new Date(Date.now() + 30 * 86400000);
    try {
      const { error: paidErr } = await supabase
        .from('company_licenses')
        .update({
          payment_status: 'paid',
          last_payment_date: new Date().toISOString().slice(0, 10),
          last_payment_amount: totalAmount,
          status: 'active',
          expires_at: nextDate.toISOString(),
          next_payment_date: nextDate.toISOString().slice(0, 10),
        })
        .eq('id', company.license.id);
      if (paidErr) throw paidErr;
      load();
    } catch (err) {
      alert('Erro ao marcar como pago: ' + (err instanceof Error ? err.message : 'desconhecido'));
    }
    setPayingId(null);
  };

  const openDelete = (company: Company) => {
    setDeletingCompany(company);
    setDeleteOwnerUser(false);
    setDeleteError(null);
  };

  const confirmDelete = async () => {
    if (!deletingCompany) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-client-company`;
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          company_id: deletingCompany.id,
          delete_owner_user: deleteOwnerUser,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao excluir empresa');
      setDeleting(false);
      setDeletingCompany(null);
      load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Erro');
      setDeleting(false);
    }
  };

  const applyGlobalFee = async () => {
    setApplyingFee(true);
    setFeeSuccess(false);
    try {
      const paidLicenses = companies.filter(c => c.license && c.license.plan === 'paid').map(c => c.license!.id);
      if (paidLicenses.length === 0) {
        setApplyingFee(false);
        return;
      }
      const { error } = await supabase
        .from('company_licenses')
        .update({ per_user_fee: globalFee })
        .in('id', paidLicenses);
      if (error) throw error;
      setFeeSuccess(true);
      setTimeout(() => setFeeSuccess(false), 3000);
      load();
    } catch (err) {
      console.error('apply global fee failed', err);
    }
    setApplyingFee(false);
  };

  const totalRevenue = companies.reduce((sum, c) => {
    if (!c.license || c.license.plan !== 'paid') return sum;
    const fee = c.license.per_user_fee ?? PRICE_PER_USER;
    return sum + fee * c.userCount;
  }, 0);
  const totalPaid = companies.reduce((sum, c) => {
    if (!c.license || c.license.payment_status !== 'paid') return sum;
    const fee = c.license.per_user_fee ?? PRICE_PER_USER;
    return sum + fee * c.userCount;
  }, 0);
  const totalPending = totalRevenue - totalPaid;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Licenças</h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Gerencie as licenças de todas as empresas clientes
          </p>
        </div>
        <button onClick={() => setNewCompanyOpen(true)} className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-sky-500 text-white font-medium rounded-xl hover:from-cyan-400 hover:to-sky-400 transition shadow-sm whitespace-nowrap">
          <UserPlus className="w-5 h-5" /> Nova empresa
        </button>
      </div>

      {/* Campo de valor por usuário */}
      {!loading && (
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 dark:from-slate-800 dark:to-slate-900 rounded-2xl p-5 shadow-lg">
          <div className="flex flex-col lg:flex-row lg:items-end gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Valor cobrado por usuário (mensalidade)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">R$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={globalFee}
                  onChange={(e) => setGlobalFee(parseFloat(e.target.value) || 0)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white text-lg font-bold focus:outline-none focus:ring-2 focus:ring-cyan-400 placeholder-slate-500"
                  placeholder="49.90"
                />
              </div>
              <p className="text-xs text-slate-400 mt-2">
                O sistema multiplica este valor pela quantidade de usuários de cada empresa para calcular o total a cobrar.
              </p>
            </div>
            <button
              onClick={applyGlobalFee}
              disabled={applyingFee || globalFee <= 0}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-sky-500 text-white font-semibold shadow-md hover:from-cyan-400 hover:to-sky-400 transition disabled:opacity-60 whitespace-nowrap"
            >
              {applyingFee ? <Loader2 className="w-5 h-5 animate-spin" /> : <BadgeCheck className="w-5 h-5" />}
              {applyingFee ? 'Aplicando...' : 'Aplicar a todas as empresas'}
            </button>
          </div>
          {feeSuccess && (
            <div className="mt-3 flex items-center gap-2 text-sm text-emerald-400">
              <BadgeCheck className="w-4 h-4" />
              Valor atualizado para todas as empresas pagantes! Os totais foram recalculados automaticamente.
            </div>
          )}
        </div>
      )}

      {/* Resumo */}
      {!loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard label="Total de empresas" value={companies.length} icon={Building2} color="sky" />
          <SummaryCard label="Total de usuários" value={companies.reduce((sum, c) => sum + c.userCount, 0)} icon={Users} color="cyan" />
          <SummaryCard label="Receita mensal total" value={fmtBRL(totalRevenue)} icon={Wallet} color="emerald" isText />
          <SummaryCard label="Pago (em dia)" value={fmtBRL(totalPaid)} icon={BadgeCheck} color="emerald" isText />
          <SummaryCard label="Pendente" value={fmtBRL(totalPending)} icon={AlertTriangle} color="amber" isText />
          <SummaryCard label="Em teste" value={companies.filter(c => c.license?.plan === 'trial').length} icon={Clock} color="amber" />
          <SummaryCard label="Pagas (ativas)" value={companies.filter(c => c.license?.plan === 'paid' && c.license?.status === 'active').length} icon={CheckCircle2} color="emerald" />
          <SummaryCard label="Expiradas/Bloqueadas" value={companies.filter(c => {
            if (!c.license) return false;
            const exp = new Date(c.license.expires_at) < new Date();
            return c.license.status === 'blocked' || c.license.status === 'canceled' || exp;
          }).length} icon={AlertTriangle} color="rose" />
        </div>
      )}

      <button onClick={load} className="flex items-center gap-2 px-4 py-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition">
        <RefreshCw className="w-4 h-4" /> Atualizar lista
      </button>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : companies.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-12">
          <EmptyState icon={ShieldCheck} text="Nenhuma empresa cadastrada ainda." />
        </div>
      ) : (
        <div className="space-y-3">
          {companies.map((c) => (
            <CompanyLicenseCard
              key={c.id}
              company={c}
              onEdit={() => openEdit(c, c.license)}
              onRenew={() => c.license && renewMonthly(c.license)}
              onActivate={() => c.license && activatePaid(c.license)}
              onDelete={() => openDelete(c)}
              onMarkPaid={() => markAsPaid(c)}
              paying={payingId === c.id}
            />
          ))}
        </div>
      )}

      {modalOpen && editingCompany && (
        <Modal title={editing ? `Editar licença — ${editingCompany.name}` : `Criar licença — ${editingCompany.name}`} onClose={() => setModalOpen(false)}>
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Plano">
                <select value={form.plan ?? 'paid'} onChange={(e) => setForm({ ...form, plan: e.target.value as 'trial' | 'paid' })} className={inputCls}>
                  <option value="trial">Teste (Trial)</option>
                  <option value="paid">Pago (Mensal)</option>
                </select>
              </Field>
              <Field label="Status">
                <select value={form.status ?? 'active'} onChange={(e) => setForm({ ...form, status: e.target.value as CompanyLicense['status'] })} className={inputCls}>
                  <option value="active">Ativa</option>
                  <option value="expired">Expirada</option>
                  <option value="blocked">Bloqueada</option>
                  <option value="canceled">Cancelada</option>
                </select>
              </Field>
            </div>

            <Field label="Expira em (data e hora)">
              <input
                type="datetime-local"
                value={form.expires_at ? new Date(form.expires_at).toISOString().slice(0, 16) : ''}
                onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                className={inputCls}
              />
            </Field>

            {form.plan === 'paid' && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Valor por usuário (R$)">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.per_user_fee ?? PRICE_PER_USER}
                      onChange={(e) => setForm({ ...form, per_user_fee: parseFloat(e.target.value) })}
                      className={inputCls}
                      placeholder="49.90"
                    />
                  </Field>
                  <Field label="Status do pagamento">
                    <select
                      value={form.payment_status ?? 'pending'}
                      onChange={(e) => setForm({ ...form, payment_status: e.target.value as CompanyLicense['payment_status'] })}
                      className={inputCls}
                    >
                      <option value="pending">Pendente</option>
                      <option value="paid">Pago (em dia)</option>
                      <option value="overdue">Em atraso</option>
                    </select>
                  </Field>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Mensalidade fixa (R$) — opcional">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.monthly_fee ?? ''}
                      onChange={(e) => setForm({ ...form, monthly_fee: parseFloat(e.target.value) })}
                      className={inputCls}
                      placeholder="199.90"
                    />
                  </Field>
                  <Field label="Próximo pagamento">
                    <input
                      type="date"
                      value={form.next_payment_date ?? ''}
                      onChange={(e) => setForm({ ...form, next_payment_date: e.target.value })}
                      className={inputCls}
                    />
                  </Field>
                </div>
              </>
            )}

            <Field label="Observações">
              <textarea
                value={form.notes ?? ''}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className={inputCls}
                rows={2}
                placeholder="Notas internas sobre o cliente"
              />
            </Field>

            {error && (
              <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-lg p-3 text-sm text-rose-700 dark:text-rose-300">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModalOpen(false)} className="flex-1 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition">Cancelar</button>
              <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-gradient-to-r from-cyan-500 to-sky-500 text-white font-medium rounded-xl hover:from-cyan-400 hover:to-sky-400 transition disabled:opacity-60">
                {saving ? 'Salvando...' : 'Salvar licença'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      <NewCompanyWizard open={newCompanyOpen} onClose={() => setNewCompanyOpen(false)} onCreated={load} />

      {/* Modal de exclusão */}
      {deletingCompany && (
        <Modal title={`Excluir empresa — ${deletingCompany.name}`} onClose={() => !deleting && setDeletingCompany(null)} maxWidth="max-w-lg">
          <div className="space-y-5">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-rose-50 dark:bg-rose-950/30 flex items-center justify-center flex-shrink-0">
                <AlertOctagon className="w-6 h-6 text-rose-500" />
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-300 space-y-2">
                <p className="font-semibold text-slate-800 dark:text-white">Esta ação não pode ser desfeita.</p>
                <p>Todos os dados da empresa serão removidos permanentemente: máquinas, ordens de serviço, manutenções, estoque, membros, licença e histórico.</p>
              </div>
            </div>

            <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition">
              <input
                type="checkbox"
                checked={deleteOwnerUser}
                onChange={(e) => setDeleteOwnerUser(e.target.checked)}
                className="w-4 h-4 rounded accent-rose-500"
              />
              <span className="text-sm text-slate-600 dark:text-slate-300">
                Excluir também o usuário de login do responsável (ele não poderá mais acessar o sistema)
              </span>
            </label>

            {deleteError && (
              <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-lg p-3 text-sm text-rose-700 dark:text-rose-300">
                {deleteError}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setDeletingCompany(null)}
                disabled={deleting}
                className="flex-1 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="flex-1 py-2.5 bg-gradient-to-r from-rose-500 to-red-600 text-white font-semibold rounded-xl hover:from-rose-400 hover:to-red-500 transition disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {deleting ? 'Excluindo...' : 'Excluir empresa'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, color, isText }: {
  label: string; value: number | string; icon: typeof Building2; color: 'sky' | 'amber' | 'emerald' | 'rose' | 'cyan'; isText?: boolean;
}) {
  const colors = {
    sky: 'text-sky-500 bg-sky-50 dark:bg-sky-950/30',
    cyan: 'text-cyan-500 bg-cyan-50 dark:bg-cyan-950/30',
    amber: 'text-amber-500 bg-amber-50 dark:bg-amber-950/30',
    emerald: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-950/30',
    rose: 'text-rose-500 bg-rose-50 dark:bg-rose-950/30',
  };
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${colors[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className={`${isText ? 'text-lg font-bold' : 'text-2xl font-bold'} text-slate-900 dark:text-white`}>{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}

function CompanyLicenseCard({ company, onEdit, onRenew, onActivate, onDelete, onMarkPaid, paying }: {
  company: CompanyWithLicense;
  onEdit: () => void;
  onRenew: () => void;
  onActivate: () => void;
  onDelete: () => void;
  onMarkPaid: () => void;
  paying: boolean;
}) {
  const license = company.license;
  const now = new Date();
  const isExpired = license ? new Date(license.expires_at) < now : false;
  const isActive = license?.status === 'active' && !isExpired;
  const isTrial = license?.plan === 'trial';

  const perUserFee = license?.per_user_fee ?? PRICE_PER_USER;
  const totalCharge = perUserFee * company.userCount;

  const paymentInfo = (() => {
    if (!license || license.plan !== 'paid') return null;
    const ps = license.payment_status ?? 'pending';
    if (ps === 'paid') return { label: 'Pago — em dia', color: 'emerald', icon: BadgeCheck };
    if (ps === 'overdue') return { label: 'Pagamento em atraso', color: 'rose', icon: AlertTriangle };
    return { label: 'Pagamento pendente', color: 'amber', icon: Clock };
  })();

  const statusInfo = (() => {
    if (!license) return { label: 'Sem licença', color: 'slate', icon: XCircle };
    if (license.status === 'canceled') return { label: 'Cancelada', color: 'rose', icon: XCircle };
    if (license.status === 'blocked') return { label: 'Bloqueada', color: 'rose', icon: Lock };
    if (isExpired) return { label: 'Expirada', color: 'rose', icon: AlertTriangle };
    if (isActive && isTrial) return { label: 'Teste ativo', color: 'amber', icon: Clock };
    if (isActive) return { label: 'Ativa', color: 'emerald', icon: CheckCircle2 };
    return { label: license.status, color: 'slate', icon: AlertTriangle };
  })();

  const statusColors: Record<string, string> = {
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    rose: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
    slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  };
  const StatusIcon = statusInfo.icon;
  const PayIcon = paymentInfo?.icon ?? Clock;

  const daysRemaining = license
    ? Math.max(Math.ceil((new Date(license.expires_at).getTime() - now.getTime()) / 86400000), 0)
    : 0;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-5 hover:shadow-md transition group">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          {/* Empresa */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500 to-sky-600 flex items-center justify-center flex-shrink-0">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{company.name}</p>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs text-slate-400 truncate">{company.cnpj ?? 'Sem CNPJ'}</p>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300 whitespace-nowrap">
                  <Users className="w-3 h-3" />
                  {company.userCount} {company.userCount === 1 ? 'usuário' : 'usuários'}
                </span>
              </div>
            </div>
          </div>

          {/* Status badge */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${statusColors[statusInfo.color]}`}>
              <StatusIcon className="w-3.5 h-3.5" />
              {statusInfo.label}
            </span>
            {paymentInfo && (
              <span className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${statusColors[paymentInfo.color]}`}>
                <PayIcon className="w-3.5 h-3.5" />
                {paymentInfo.label}
              </span>
            )}
          </div>

          {/* Detalhes */}
          {license && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
              <div className="flex items-center gap-1.5 text-slate-500">
                <Calendar className="w-4 h-4" />
                <span>Expira: <span className={isExpired ? 'text-rose-500 font-medium' : 'text-slate-700 dark:text-slate-300'}>{new Date(license.expires_at).toLocaleDateString('pt-BR')}</span></span>
              </div>
              {!isExpired && (
                <span className="text-xs text-slate-400">{daysRemaining} dias restantes</span>
              )}
              {license.next_payment_date && (
                <span className="text-xs text-slate-400">Próx. pgto: {new Date(license.next_payment_date).toLocaleDateString('pt-BR')}</span>
              )}
            </div>
          )}

          {/* Ações */}
          <div className="flex items-center gap-2 flex-wrap">
            {license && isTrial && (
              <button onClick={onActivate} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 hover:bg-emerald-200 transition">
                Converter para pago
              </button>
            )}
            {license && isExpired && license.plan === 'paid' && (
              <button onClick={onRenew} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300 hover:bg-cyan-200 transition">
                Renovar mensalidade
              </button>
            )}
            <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-sky-600 transition">
              <Pencil className="w-4 h-4" />
            </button>
            <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 text-slate-400 hover:text-rose-600 transition">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Faturamento por usuário */}
        {license && license.plan === 'paid' && (
          <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
                    <Wallet className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Valor por usuário</p>
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{fmtBRL(perUserFee)}</p>
                  </div>
                </div>
                <div className="text-slate-300 dark:text-slate-600 text-xl">x</div>
                <div>
                  <p className="text-xs text-slate-400">Usuários ativos</p>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{company.userCount}</p>
                </div>
                <div className="text-slate-300 dark:text-slate-600 text-xl">=</div>
                <div>
                  <p className="text-xs text-slate-400">Total mensal a cobrar</p>
                  <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{fmtBRL(totalCharge)}</p>
                </div>
                {license.last_payment_date && license.last_payment_amount != null && (
                  <div className="ml-auto sm:ml-0 sm:pl-6 sm:border-l sm:border-slate-100 dark:sm:border-slate-800">
                    <p className="text-xs text-slate-400">Último pagamento</p>
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                      {fmtBRL(license.last_payment_amount)} em {new Date(license.last_payment_date).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                )}
              </div>

              {paymentInfo && paymentInfo.color !== 'emerald' && (
                <button
                  onClick={onMarkPaid}
                  disabled={paying}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-sm hover:from-emerald-400 hover:to-green-500 transition disabled:opacity-60 whitespace-nowrap"
                >
                  {paying ? <Loader2 className="w-4 h-4 animate-spin" /> : <BadgeCheck className="w-4 h-4" />}
                  {paying ? 'Registrando...' : 'Registrar pagamento'}
                </button>
              )}
              {paymentInfo && paymentInfo.color === 'emerald' && (
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 text-sm font-semibold whitespace-nowrap">
                  <BadgeCheck className="w-4 h-4" />
                  Pagamento confirmado
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
