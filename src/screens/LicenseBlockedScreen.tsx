import { useAuth } from '@/context/AuthContext';
import { Lock, Clock, AlertTriangle, Mail, Phone, CheckCircle2 } from 'lucide-react';

export default function LicenseBlockedScreen() {
  const { license, activeCompany, signOut } = useAuth();

  const isTrial = license?.plan === 'trial';
  const expired = license?.status === 'expired';

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="fixed inset-0 opacity-[0.02] pointer-events-none" style={{
        backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }} />

      <div className="relative w-full max-w-lg">
        <div className="bg-slate-900/90 backdrop-blur-xl rounded-3xl border border-slate-800 shadow-2xl overflow-hidden">
          {/* Header com ícone */}
          <div className="px-8 pt-10 pb-6 text-center">
            <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-rose-500/20 to-orange-500/10 border border-rose-500/30 flex items-center justify-center mb-5">
              {isTrial && expired ? (
                <Clock className="w-10 h-10 text-rose-400" />
              ) : (
                <Lock className="w-10 h-10 text-rose-400" />
              )}
            </div>

            <h1 className="text-2xl font-bold text-white mb-2">
              {license?.status === 'canceled'
                ? 'Licença cancelada'
                : license?.status === 'blocked'
                ? 'Acesso bloqueado'
                : isTrial && expired
                ? 'Período de teste encerrado'
                : 'Licença expirada'}
            </h1>

            <p className="text-slate-400 text-sm leading-relaxed">
              {isTrial && expired
                ? `O período de teste gratuito de 60 dias da empresa ${activeCompany?.name ?? ''} terminou. Para continuar usando o CLEVIA, é necessário contratar a licença mensal.`
                : `A licença da empresa ${activeCompany?.name ?? ''} não está ativa. Entre em contato para regularizar o acesso.`}
            </p>
          </div>

          {/* Detalhes da licença */}
          {license && (
            <div className="mx-8 mb-6 bg-slate-800/50 rounded-2xl border border-slate-700/50 p-5 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Plano atual</span>
                <span className={`font-semibold px-2.5 py-1 rounded-lg ${
                  isTrial ? 'bg-sky-500/10 text-sky-400' : 'bg-emerald-500/10 text-emerald-400'
                }`}>
                  {isTrial ? 'Teste gratuito' : 'Mensal'}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Início</span>
                <span className="text-slate-200">
                  {new Date(license.started_at).toLocaleDateString('pt-BR')}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Expirou em</span>
                <span className="text-rose-400 font-medium">
                  {new Date(license.expires_at).toLocaleDateString('pt-BR')}
                </span>
              </div>
              {license.monthly_fee != null && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Mensalidade</span>
                  <span className="text-emerald-400 font-semibold">
                    R$ {license.monthly_fee.toFixed(2).replace('.', ',')}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Como regularizar */}
          <div className="mx-8 mb-6">
            <div className="bg-gradient-to-br from-cyan-500/10 to-sky-500/5 rounded-2xl border border-cyan-500/20 p-5">
              <h3 className="text-sm font-semibold text-cyan-300 mb-3 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Como regularizar
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed mb-4">
                Entre em contato com o responsável pelo CLEVIA para contratar a licença mensal e liberar o acesso imediatamente.
              </p>
              <div className="space-y-2">
                <a href="mailto:clebsonbernardovelho@gmail.com" className="flex items-center gap-3 text-sm text-slate-300 hover:text-cyan-400 transition">
                  <Mail className="w-4 h-4 text-cyan-400" />
                  clebsonbernardovelho@gmail.com
                </a>
                <a href="https://wa.me/5548996568756" target="_blank" rel="noreferrer" className="flex items-center gap-3 text-sm text-slate-300 hover:text-emerald-400 transition">
                  <Phone className="w-4 h-4 text-emerald-400" />
                  (48) 99656-8756
                </a>
              </div>
            </div>
          </div>

          {/* Avisos */}
          <div className="mx-8 mb-6 flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-200/80 leading-relaxed">
              Seus dados não foram apagados. Eles continuam salvos e seguros — assim que a licença for reativada, você terá acesso a tudo novamente: máquinas, ordens de serviço, preventivas, estoque e histórico completo.
            </p>
          </div>

          {/* Botão sair */}
          <div className="px-8 pb-8">
            <button
              onClick={signOut}
              className="w-full py-3 rounded-xl border border-slate-700 text-slate-300 font-medium hover:bg-slate-800 transition"
            >
              Sair do sistema
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
