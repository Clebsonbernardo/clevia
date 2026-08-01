import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, type Company, type CompanyMember, type LicenseStatusResult } from '@/lib/supabase';
import { logAction } from '@/lib/audit';

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  activeCompany: Company | null;
  activeRole: string | null;
  members: CompanyMember[];
  license: LicenseStatusResult | null;
  licenseLoading: boolean;
  companyLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  setActiveCompany: (c: Company | null) => void;
  refreshMembers: () => Promise<void>;
  refreshLicense: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCompany, setActiveCompanyState] = useState<Company | null>(null);
  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [activeRole, setActiveRole] = useState<string | null>(null);
  const [license, setLicense] = useState<LicenseStatusResult | null>(null);
  const [licenseLoading, setLicenseLoading] = useState(false);
  const [companyLoading, setCompanyLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      (async () => {
        setSession(newSession);
        if (!newSession) {
          setActiveCompanyState(null);
          setMembers([]);
          setActiveRole(null);
          setLicense(null);
          setCompanyLoading(false);
          setLoading(false);
        } else {
          setCompanyLoading(true);
        }
      })();
    });

    return () => { listener.subscription.unsubscribe(); };
  }, []);

  // Carrega empresas do usuário quando a sessão muda
  useEffect(() => {
    if (session?.user) {
      setCompanyLoading(true);
      (async () => {
        const { data: memberRows } = await supabase
          .from('company_members')
          .select('*, companies(*)')
          .eq('user_id', session.user.id);
        if (memberRows && memberRows.length > 0) {
          const stored = localStorage.getItem('clevia-active-company');
          const found = stored
            ? memberRows.find((m: { companies: Company }) => m.companies?.id === stored)?.companies
            : null;
          setActiveCompanyState(found ?? (memberRows[0] as { companies: Company }).companies);
          setMembers(memberRows as unknown as CompanyMember[]);
          // Log pending login audit
          if (localStorage.getItem('clevia_pending_login_audit')) {
            const companyId = (found ?? (memberRows[0] as { companies: Company }).companies)?.id;
            if (companyId) {
              logAction(companyId, 'login', 'auth', undefined, `Usuário ${session?.user?.email || ''} entrou no sistema`);
            }
            localStorage.removeItem('clevia_pending_login_audit');
          }
        }
        setCompanyLoading(false);
        setLoading(false);
      })();
    } else {
      setCompanyLoading(false);
    }
  }, [session]);

  // Atualiza o papel ativo quando a empresa ou membros mudam
  useEffect(() => {
    if (activeCompany && session?.user) {
      const m = members.find((x) => x.company_id === activeCompany.id && x.user_id === session.user.id);
      setActiveRole(m?.role ?? null);
    } else {
      setActiveRole(null);
    }
  }, [activeCompany, members, session]);

  // Carrega status da licença da empresa ativa
  const refreshLicense = async () => {
    if (!activeCompany) { setLicense(null); return; }
    setLicenseLoading(true);
    const { data, error } = await supabase.rpc('get_company_license_status', { p_company_id: activeCompany.id });
    if (error) { console.error('license status check failed', error); setLicense(null); }
    else setLicense((data as LicenseStatusResult) ?? null);
    setLicenseLoading(false);
  };

  useEffect(() => {
    refreshLicense();
  }, [activeCompany]);

  const refreshMembers = async () => {
    if (!session?.user) return;
    const { data } = await supabase.from('company_members').select('*, companies(*)').eq('user_id', session.user.id);
    setMembers(data ?? []);
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) {
      // Audit log will be captured after company loads
      localStorage.setItem('clevia_pending_login_audit', '1');
    }
    return { error: error ? translateError(error.message) : null };
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error ? translateError(error.message) : null };
  };

  const signOut = async () => {
    if (activeCompany) {
      await logAction(activeCompany.id, 'logout', 'auth', undefined, `Usuário ${session?.user?.email || ''} saiu do sistema`);
    }
    await supabase.auth.signOut();
    setSession(null);
    setActiveCompanyState(null);
    setMembers([]);
    setActiveRole(null);
    setLicense(null);
    localStorage.removeItem('clevia-active-company');
  };

  const setActiveCompany = (c: Company | null) => {
    setActiveCompanyState(c);
    if (c) localStorage.setItem('clevia-active-company', c.id);
    else localStorage.removeItem('clevia-active-company');
  };

  return (
    <AuthContext.Provider value={{
      session, user: session?.user ?? null, loading,
      activeCompany, activeRole, members,
      license, licenseLoading, companyLoading,
      signIn, signUp, signOut, setActiveCompany, refreshMembers, refreshLicense,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

function translateError(message: string): string {
  if (message.includes('Invalid login credentials')) return 'E-mail ou senha incorretos.';
  // Não confirmamos se um e-mail já possui conta: isso permitiria descobrir
  // quais pessoas usam o sistema. Mensagem neutra para o mesmo caso.
  if (message.includes('User already registered')) {
    return 'Não foi possível concluir o cadastro com estes dados. Verifique o e-mail informado ou entre com sua conta.';
  }
  if (message.includes('Password should be at least')) return 'A senha deve ter pelo menos 6 caracteres.';
  if (message.includes('Unable to validate email')) return 'E-mail inválido.';
  // Nunca devolvemos a mensagem original do servidor: ela expõe detalhes internos.
  console.error('auth error', message);
  return 'Não foi possível concluir a operação. Tente novamente.';
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
