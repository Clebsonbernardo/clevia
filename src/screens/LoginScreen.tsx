import { useState, type FormEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Mail, Lock, ArrowRight, Loader2, Building2, KeyRound, CheckCircle2 } from 'lucide-react';
import { CleviaGear } from '@/components/CleviaLogo';

export default function LoginScreen() {
  const { signIn, signUp, session } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [forgotSent, setForgotSent] = useState(false);

  const [companyName, setCompanyName] = useState('');
  const [displayName, setDisplayName] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    if (mode === 'signup') {
      const { error } = await signUp(email, password);
      if (error) setError(error);
    } else {
      const { error } = await signIn(email, password);
      if (error) {
        setError(error);
        setFailedAttempts((n) => n + 1);
      }
    }
    setLoading(false);
  };

  const handleForgot = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    setLoading(false);
    if (error) {
      setError('Não foi possível enviar o e-mail. Verifique o endereço e tente novamente.');
    } else {
      setForgotSent(true);
    }
  };

  const handleOnboarding = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError('Sessão expirada. Recarregue a página.'); setLoading(false); return; }

    const { data: company, error: ce } = await supabase.from('companies').insert({ name: companyName }).select().single();
    if (ce || !company) { console.error('companies insert failed', ce); setError('Não foi possível criar a empresa. Tente novamente.'); setLoading(false); return; }

    const { error: me } = await supabase.from('company_members').insert({
      company_id: company.id, user_id: user.id, role: 'ceo', display_name: displayName || email.split('@')[0],
    });
    if (me) {
      await supabase.from('companies').delete().eq('id', company.id);
      console.error('company_members insert failed', me);
      setError('Não foi possível concluir o cadastro da empresa. Tente novamente.');
      setLoading(false);
      return;
    }

    setLoading(false);
    window.location.reload();
  };

  if (session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 p-6">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8">
          <div className="flex flex-col items-center text-center mb-6">
            <CleviaGear size={56} className="mx-auto" />
            <h2 className="text-xl font-bold text-white mt-4">Bem-vindo ao CLEVIA</h2>
            <p className="text-sm text-slate-400 mt-1.5">Cadastre sua empresa para começar</p>
          </div>
          <form onSubmit={handleOnboarding} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Nome da empresa *</label>
              <input required value={companyName} onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Ex: Lavanderia Silva Ltda"
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Seu nome de exibição</label>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Como devemos te chamar"
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition" />
            </div>
            {error && <div className="px-4 py-3 rounded-lg text-sm bg-rose-950/50 border border-rose-800 text-rose-300">{error}</div>}
            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-cyan-400 to-sky-500 text-slate-950 font-semibold rounded-xl hover:from-cyan-300 hover:to-sky-400 transition shadow-lg shadow-cyan-500/20 disabled:opacity-60">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Criar empresa <ArrowRight className="w-5 h-5" /></>}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Tela de recuperação de senha
  if (mode === 'forgot') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 px-6 py-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-30" style={{
          backgroundImage: 'radial-gradient(circle at 50% 20%, rgba(34,211,238,0.15) 0%, transparent 50%), radial-gradient(circle at 50% 80%, rgba(14,165,233,0.1) 0%, transparent 50%)'
        }} />
        <div className="absolute inset-0 opacity-[0.025]" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '48px 48px'
        }} />

        <div className="relative z-10 w-full max-w-md flex flex-col items-center">
          <div className="flex flex-col items-center text-center mb-12">
            <CleviaGear size={88} className="mx-auto" />
            <h1 className="mt-4 text-5xl sm:text-7xl font-black tracking-[0.15em] bg-gradient-to-r from-cyan-300 via-sky-400 to-blue-500 bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(56,189,248,0.3)]">
              CLEVIA
            </h1>
            <div className="mt-3 flex items-center justify-center gap-3">
              <span className="h-px w-12 bg-gradient-to-r from-transparent to-cyan-500/50" />
              <p className="text-xs font-semibold tracking-[0.3em] uppercase text-slate-500">Plataforma de Gestão</p>
              <span className="h-px w-12 bg-gradient-to-l from-transparent to-cyan-500/50" />
            </div>
          </div>

          <div className="w-full bg-slate-900/70 backdrop-blur-xl border border-slate-800 rounded-2xl p-8 shadow-2xl shadow-cyan-500/5">
            <div className="text-center mb-8">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-400 to-sky-500 flex items-center justify-center shadow-lg shadow-cyan-500/30 mx-auto mb-4">
                <KeyRound className="w-7 h-7 text-slate-950" strokeWidth={2.5} />
              </div>
              <h2 className="text-xl font-bold text-white">Esqueceu a senha?</h2>
              <p className="text-sm text-slate-400 mt-1.5">Digite seu e-mail e enviaremos um link para redefinir sua senha</p>
            </div>

            {forgotSent ? (
              <div className="space-y-5">
                <div className="flex flex-col items-center text-center gap-3 py-4">
                  <CheckCircle2 className="w-12 h-12 text-emerald-400" />
                  <p className="text-sm text-slate-300">
                    Se o e-mail <span className="font-semibold text-white">{email}</span> estiver cadastrado, você receberá um link para redefinir sua senha em instantes.
                  </p>
                  <p className="text-xs text-slate-500">Verifique sua caixa de entrada e a pasta de spam.</p>
                </div>
                <button onClick={() => { setMode('login'); setForgotSent(false); setError(null); }}
                  className="w-full py-3.5 border border-slate-700 text-slate-200 font-medium rounded-xl hover:bg-slate-800 transition">
                  Voltar para o login
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgot} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">E-mail</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                    <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com"
                      className="w-full pl-11 pr-4 py-3 bg-slate-800/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition" />
                  </div>
                </div>
                {error && <div className="px-4 py-3 rounded-lg text-sm bg-rose-950/50 border border-rose-800 text-rose-300">{error}</div>}
                <button type="submit" disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-cyan-400 to-sky-500 text-slate-950 font-semibold rounded-xl hover:from-cyan-300 hover:to-sky-400 transition shadow-lg shadow-cyan-500/20 disabled:opacity-60 disabled:cursor-not-allowed">
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Enviar link de recuperação <ArrowRight className="w-5 h-5" /></>}
                </button>
              </form>
            )}

            <div className="mt-6 text-center">
              <button onClick={() => { setMode('login'); setForgotSent(false); setError(null); }}
                className="text-sm text-slate-400 hover:text-cyan-400 transition">
                Voltar para o login
              </button>
            </div>
          </div>

          <p className="mt-10 text-center text-xs text-slate-600">
            © 2026 CLEVIA Software · Clebson Bernardo Velho
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 px-6 py-12 relative overflow-hidden">
      {/* Background decorativo */}
      <div className="absolute inset-0 opacity-30" style={{
        backgroundImage: 'radial-gradient(circle at 50% 20%, rgba(34,211,238,0.15) 0%, transparent 50%), radial-gradient(circle at 50% 80%, rgba(14,165,233,0.1) 0%, transparent 50%)'
      }} />
      <div className="absolute inset-0 opacity-[0.025]" style={{
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
        backgroundSize: '48px 48px'
      }} />

      {/* Conteúdo centralizado */}
      <div className="relative z-10 w-full max-w-md flex flex-col items-center">
        {/* Identidade CLEVIA */}
        <div className="flex flex-col items-center text-center mb-12">
          <CleviaGear size={88} className="mx-auto" />
          <h1 className="mt-4 text-5xl sm:text-7xl font-black tracking-[0.15em] bg-gradient-to-r from-cyan-300 via-sky-400 to-blue-500 bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(56,189,248,0.3)]">
            CLEVIA
          </h1>
          <div className="mt-3 flex items-center justify-center gap-3">
            <span className="h-px w-12 bg-gradient-to-r from-transparent to-cyan-500/50" />
            <p className="text-xs font-semibold tracking-[0.3em] uppercase text-slate-500">Plataforma de Gestão</p>
            <span className="h-px w-12 bg-gradient-to-l from-transparent to-cyan-500/50" />
          </div>
        </div>

        {/* Card de login */}
        <div className="w-full bg-slate-900/70 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl shadow-cyan-500/5">
          <div className="text-center mb-8">
            <h2 className="text-xl font-bold text-white">{mode === 'signup' ? 'Criar sua conta' : 'Acesse sua conta'}</h2>
            <p className="text-sm text-slate-400 mt-1.5">{mode === 'signup' ? 'Cadastre-se com seu próprio e-mail e senha' : 'Entre com seu e-mail e senha'}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">E-mail</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com"
                  className="w-full pl-11 pr-4 py-3 bg-slate-800/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Senha</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres"
                  className="w-full pl-11 pr-4 py-3 bg-slate-800/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition" />
              </div>
            </div>
            {error && <div className="px-4 py-3 rounded-lg text-sm bg-rose-950/50 border border-rose-800 text-rose-300">{error}</div>}

            {/* Aviso de várias tentativas falhas */}
            {failedAttempts >= 2 && !error && (
              <div className="px-4 py-3 rounded-lg text-sm bg-amber-950/40 border border-amber-800 text-amber-300">
                Tentou várias vezes sem sucesso? Você pode redefinir sua senha abaixo.
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-cyan-400 to-sky-500 text-slate-950 font-semibold rounded-xl hover:from-cyan-300 hover:to-sky-400 transition shadow-lg shadow-cyan-500/20 disabled:opacity-60 disabled:cursor-not-allowed">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>{mode === 'signup' ? 'Criar conta' : 'Entrar'} <ArrowRight className="w-5 h-5" /></>}
            </button>
          </form>

          {/* Esqueceu a senha — sempre visível no login, destacado após 2 falhas */}
          {mode === 'login' && (
            <div className={`mt-4 text-center ${failedAttempts >= 2 ? 'animate-pulse' : ''}`}>
              <button
                onClick={() => { setMode('forgot'); setError(null); setForgotSent(false); }}
                className={`text-sm transition inline-flex items-center gap-1.5 ${
                  failedAttempts >= 2
                    ? 'text-amber-400 hover:text-amber-300 font-semibold'
                    : 'text-slate-400 hover:text-cyan-400'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" /> Esqueceu a senha?
              </button>
            </div>
          )}

          <div className="mt-6 text-center">
            <button onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setError(null); setFailedAttempts(0); }}
              className="text-sm text-slate-400 hover:text-cyan-400 transition">
              {mode === 'signup' ? 'Já tem conta? Fazer login' : 'Não tem conta? Criar agora'}
            </button>
          </div>
        </div>

        {/* Rodapé */}
        <p className="mt-10 text-center text-xs text-slate-600">
          © 2026 CLEVIA Software · Clebson Bernardo Velho
        </p>
      </div>
    </div>
  );
}
