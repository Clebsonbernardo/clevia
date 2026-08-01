import { useState, type FormEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Modal, Field, inputCls } from '@/components/ui';
import {
  Building2, User, CreditCard, CheckCircle2, ArrowRight, ArrowLeft,
  Loader2, Sparkles, Check,
} from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

type FormState = {
  company_name: string;
  cnpj: string;
  ceo_name: string;
  ceo_email: string;
  ceo_password: string;
  plan: 'trial' | 'paid';
  monthly_fee: string;
};

const STEPS = [
  { id: 0, label: 'Empresa', icon: Building2, desc: 'Dados da empresa cliente' },
  { id: 1, label: 'Responsável', icon: User, desc: 'Quem vai administrar a conta' },
  { id: 2, label: 'Plano', icon: CreditCard, desc: 'Teste gratuito ou pago' },
  { id: 3, label: 'Revisão', icon: CheckCircle2, desc: 'Confirmar e cadastrar' },
];

export default function NewCompanyWizard({ open, onClose, onCreated }: Props) {
  const { session } = useAuth();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>({
    company_name: '', cnpj: '', ceo_name: '', ceo_email: '', ceo_password: '',
    plan: 'trial', monthly_fee: '199.90',
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const reset = () => {
    setStep(0);
    setForm({ company_name: '', cnpj: '', ceo_name: '', ceo_email: '', ceo_password: '', plan: 'trial', monthly_fee: '199.90' });
    setError(null);
    setSuccess(false);
  };

  const close = () => { reset(); onClose(); };

  const canAdvance = (() => {
    if (step === 0) return form.company_name.trim().length > 0;
    if (step === 1) return form.ceo_email.trim().length > 0 && form.ceo_password.trim().length >= 6;
    return true;
  })();

  const next = () => { if (step < 3) setStep(step + 1); };
  const back = () => { if (step > 0) setStep(step - 1); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/register-client-company`;
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          company_name: form.company_name,
          cnpj: form.cnpj || undefined,
          ceo_name: form.ceo_name || undefined,
          ceo_email: form.ceo_email,
          ceo_password: form.ceo_password,
          plan: form.plan,
          monthly_fee: form.plan === 'paid' ? Number(form.monthly_fee) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao criar empresa');
      setSuccess(true);
      setCreating(false);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro');
      setCreating(false);
    }
  };

  if (!open) return null;

  return (
    <Modal title="Cadastrar nova empresa cliente" onClose={close} maxWidth="max-w-2xl">
      {/* Stepper header */}
      {!success && (
        <div className="flex items-center justify-between mb-6 px-1">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = i < step;
            const active = i === step;
            return (
              <div key={s.id} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-1.5">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 ${
                      done
                        ? 'bg-emerald-500 text-white'
                        : active
                        ? 'bg-gradient-to-br from-cyan-500 to-sky-500 text-white shadow-lg shadow-cyan-500/30 scale-110'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                    }`}
                  >
                    {done ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                  </div>
                  <span className={`text-[11px] font-medium ${active ? 'text-cyan-600 dark:text-cyan-400' : done ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 rounded-full transition-all duration-500 ${i < step ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'}`} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Success state */}
      {success ? (
        <div className="flex flex-col items-center text-center py-8 animate-[fadeIn_0.4s_ease]">
          <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center mb-5">
            <CheckCircle2 className="w-11 h-11 text-emerald-500" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Empresa cadastrada!</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mb-1">
            <span className="font-semibold text-slate-700 dark:text-slate-200">{form.company_name}</span> foi criada com sucesso.
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mb-6">
            O responsável <span className="font-semibold text-slate-700 dark:text-slate-200">{form.ceo_email}</span> já pode acessar o sistema.
          </p>
          <button onClick={close} className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-sky-500 text-white font-medium rounded-xl hover:from-cyan-400 hover:to-sky-400 transition shadow-sm">
            Concluir
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          {/* Step 0: Empresa */}
          {step === 0 && (
            <div className="space-y-4 animate-[fadeIn_0.3s_ease]">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-cyan-50 dark:bg-cyan-950/30 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-cyan-500" />
                </div>
                <div>
                  <p className="font-semibold text-slate-800 dark:text-white">Dados da empresa</p>
                  <p className="text-xs text-slate-400">Informe o nome e CNPJ da empresa cliente</p>
                </div>
              </div>
              <Field label="Nome da empresa" required>
                <input
                  required
                  autoFocus
                  value={form.company_name}
                  onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                  className={inputCls}
                  placeholder="Ex: Lavanderia Silva Ltda"
                />
              </Field>
              <Field label="CNPJ">
                <input
                  value={form.cnpj}
                  onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
                  className={inputCls}
                  placeholder="00.000.000/0000-00"
                />
              </Field>
            </div>
          )}

          {/* Step 1: Responsável */}
          {step === 1 && (
            <div className="space-y-4 animate-[fadeIn_0.3s_ease]">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-950/30 flex items-center justify-center">
                  <User className="w-5 h-5 text-sky-500" />
                </div>
                <div>
                  <p className="font-semibold text-slate-800 dark:text-white">Responsável (CEO)</p>
                  <p className="text-xs text-slate-400">O usuário principal que vai administrar a empresa</p>
                </div>
              </div>
              <Field label="Nome do responsável">
                <input
                  value={form.ceo_name}
                  onChange={(e) => setForm({ ...form, ceo_name: e.target.value })}
                  className={inputCls}
                  placeholder="João Silva"
                />
              </Field>
              <Field label="E-mail de login" required>
                <input
                  required
                  type="email"
                  value={form.ceo_email}
                  onChange={(e) => setForm({ ...form, ceo_email: e.target.value })}
                  className={inputCls}
                  placeholder="joao@empresa.com"
                />
              </Field>
              <Field label="Senha de acesso" required>
                <input
                  required
                  type="password"
                  minLength={6}
                  value={form.ceo_password}
                  onChange={(e) => setForm({ ...form, ceo_password: e.target.value })}
                  className={inputCls}
                  placeholder="Mínimo 6 caracteres"
                />
              </Field>
              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
                <Sparkles className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>Anote o e-mail e senha para repassar ao cliente. Ele usará esses dados para entrar no sistema.</span>
              </div>
            </div>
          )}

          {/* Step 2: Plano */}
          {step === 2 && (
            <div className="space-y-4 animate-[fadeIn_0.3s_ease]">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-emerald-500" />
                </div>
                <div>
                  <p className="font-semibold text-slate-800 dark:text-white">Plano de licença</p>
                  <p className="text-xs text-slate-400">Escolha o tipo de plano da empresa</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, plan: 'trial' })}
                  className={`text-left p-4 rounded-2xl border-2 transition-all ${
                    form.plan === 'trial'
                      ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/20 shadow-md'
                      : 'border-slate-200 dark:border-slate-700 hover:border-amber-300'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${form.plan === 'trial' ? 'bg-amber-400 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <span className="font-semibold text-slate-800 dark:text-white">Teste gratuito</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">60 dias para o cliente experimentar o sistema sem custo.</p>
                </button>

                <button
                  type="button"
                  onClick={() => setForm({ ...form, plan: 'paid' })}
                  className={`text-left p-4 rounded-2xl border-2 transition-all ${
                    form.plan === 'paid'
                      ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 shadow-md'
                      : 'border-slate-200 dark:border-slate-700 hover:border-emerald-300'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${form.plan === 'paid' ? 'bg-emerald-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                      <CreditCard className="w-4 h-4" />
                    </div>
                    <span className="font-semibold text-slate-800 dark:text-white">Pago</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Mensalidade recorrente. Defina o valor abaixo.</p>
                </button>
              </div>

              {form.plan === 'paid' && (
                <Field label="Mensalidade (R$)">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.monthly_fee}
                    onChange={(e) => setForm({ ...form, monthly_fee: e.target.value })}
                    className={inputCls}
                    placeholder="199.90"
                  />
                </Field>
              )}
            </div>
          )}

          {/* Step 3: Revisão */}
          {step === 3 && (
            <div className="space-y-4 animate-[fadeIn_0.3s_ease]">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-cyan-50 dark:bg-cyan-950/30 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-cyan-500" />
                </div>
                <div>
                  <p className="font-semibold text-slate-800 dark:text-white">Revise os dados</p>
                  <p className="text-xs text-slate-400">Confira tudo antes de finalizar o cadastro</p>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl divide-y divide-slate-200 dark:divide-slate-700">
                <ReviewRow icon={Building2} label="Empresa" value={form.company_name} sub={form.cnpj || 'Sem CNPJ'} />
                <ReviewRow icon={User} label="Responsável" value={form.ceo_name || 'Não informado'} sub={form.ceo_email} />
                <ReviewRow
                  icon={CreditCard}
                  label="Plano"
                  value={form.plan === 'trial' ? 'Teste gratuito (60 dias)' : 'Pago'}
                  sub={form.plan === 'paid' ? `R$ ${Number(form.monthly_fee || 0).toFixed(2).replace('.', ',')}/mês` : 'Sem custo durante o teste'}
                />
              </div>

              <div className="bg-cyan-50 dark:bg-cyan-950/20 border border-cyan-200 dark:border-cyan-800/50 rounded-xl p-3 text-xs text-cyan-700 dark:text-cyan-300">
                Ao confirmar, a empresa será criada e o responsável poderá acessar o sistema imediatamente com o e-mail e senha informados.
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-lg p-3 text-sm text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}

          {/* Navigation buttons */}
          <div className="flex items-center justify-between pt-2">
            {step > 0 ? (
              <button type="button" onClick={back} className="flex items-center gap-2 px-4 py-2.5 text-slate-600 dark:text-slate-300 font-medium rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                <ArrowLeft className="w-4 h-4" /> Voltar
              </button>
            ) : <div />}

            {step < 3 ? (
              <button
                type="button"
                onClick={next}
                disabled={!canAdvance}
                className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-sky-500 text-white font-medium rounded-xl hover:from-cyan-400 hover:to-sky-400 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continuar <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={creating}
                className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-xl hover:from-emerald-400 hover:to-teal-400 transition shadow-sm disabled:opacity-60"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {creating ? 'Cadastrando...' : 'Cadastrar empresa'}
              </button>
            )}
          </div>
        </form>
      )}
    </Modal>
  );
}

function ReviewRow({ icon: Icon, label, value, sub }: {
  icon: typeof Building2; label: string; value: string; sub?: string;
}) {
  return (
    <div className="flex items-center gap-3 p-4">
      <div className="w-9 h-9 rounded-lg bg-white dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-slate-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate-400">{label}</p>
        <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{value}</p>
        {sub && <p className="text-xs text-slate-400 truncate">{sub}</p>}
      </div>
    </div>
  );
}
