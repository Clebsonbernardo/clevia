import { useEffect, useState, useRef, useMemo, type ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { supabase, type Notification } from '@/lib/supabase';
import { subscribeToPush } from '@/lib/push';
import { useMechanicLocation } from '@/lib/useMechanicLocation';
import {
  LayoutDashboard, ClipboardList, Users, ShieldCheck,
  Building2, Boxes, Settings, LogOut, X, Menu,
  Sun, Moon, Bell, BellRing, Clock, ChevronDown, Search, BarChart3, Hand,
  History, FileClock, Sparkles, MapPin, Monitor, Crown, FileText, Cog, Grid3x3,
  FileCode, CalendarDays, Factory, FileBarChart, ScanEye, ShieldAlert, Plug, ClipboardCheck,
} from 'lucide-react';
import CleviaLogo, { CleviaGear } from '@/components/CleviaLogo';
import { FloatingAIAssistant } from '@/components/FloatingAIAssistant';

export type NavId =
  | 'dashboard' | 'workorders' | 'oshistory' | 'machinehistory' | 'mechanics' | 'preventives'
  | 'indicators' | 'aiassistant' | 'companies' | 'users' | 'inventory' | 'licenses' | 'contracts' | 'machines' | 'settings' | 'mechaniclocation' | 'managescreens' | 'permissions' | 'sectorboard' | 'techdoc'
  | 'factorymap' | 'reports' | 'aipredictions' | 'auditlog' | 'integrations' | 'compliance';

type NavItem = { id: NavId; label: string; icon: typeof LayoutDashboard; roles?: string[]; color: string; anim?: string };

const ALL_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['ceo', 'gerente', 'solicitante', 'mecanico', 'supervisora'], color: 'text-sky-400', anim: 'animate-icon-pulse-continuous' },
  { id: 'workorders', label: 'Ordens de Serviço', icon: ClipboardList, color: 'text-cyan-400', anim: 'animate-icon-bounce-soft' },
  { id: 'machines', label: 'Máquinas', icon: Cog, color: 'text-orange-400', anim: 'animate-icon-spin-continuous' },
  { id: 'sectorboard', label: 'Quadro de Setores', icon: Grid3x3, roles: ['ceo', 'gerente', 'mecanico'], color: 'text-cyan-300', anim: 'animate-icon-pulse-continuous' },
  { id: 'factorymap', label: 'Mapa da Fábrica', icon: Factory, roles: ['ceo', 'gerente', 'mecanico', 'supervisora'], color: 'text-orange-400', anim: 'animate-icon-pulse-continuous' },
  { id: 'oshistory', label: 'Histórico de OS', icon: History, roles: ['ceo', 'gerente', 'solicitante', 'mecanico'], color: 'text-teal-300', anim: 'animate-icon-float-continuous' },
  { id: 'machinehistory', label: 'Histórico de Máquinas', icon: FileClock, roles: ['ceo', 'gerente', 'solicitante', 'mecanico'], color: 'text-orange-300', anim: 'animate-icon-wiggle-continuous' },
  { id: 'mechanics', label: 'Mecânicos', icon: Users, roles: ['ceo', 'gerente', 'mecanico'], color: 'text-amber-400', anim: 'animate-icon-pulse-continuous' },
  { id: 'mechaniclocation', label: 'Localização Mecânicos', icon: MapPin, roles: ['ceo', 'gerente'], color: 'text-rose-400', anim: 'animate-icon-bounce-soft' },
  { id: 'managescreens', label: 'Gerenciar Telas', icon: Monitor, roles: ['ceo'], color: 'text-sky-400', anim: 'animate-icon-pulse-continuous' },
  { id: 'permissions', label: 'Permissões', icon: Crown, roles: ['ceo'], color: 'text-amber-400', anim: 'animate-icon-pulse-continuous' },
  { id: 'preventives', label: 'Preventivas', icon: ShieldCheck, roles: ['ceo', 'gerente', 'mecanico'], color: 'text-emerald-400', anim: 'animate-icon-pulse-continuous' },
  { id: 'indicators', label: 'Indicadores', icon: BarChart3, roles: ['ceo', 'gerente', 'solicitante', 'mecanico', 'supervisora'], color: 'text-violet-400', anim: 'animate-icon-pulse-continuous' },
  { id: 'reports', label: 'Relatórios', icon: FileBarChart, roles: ['ceo', 'gerente', 'supervisora'], color: 'text-blue-300', anim: 'animate-icon-float-continuous' },
  { id: 'aipredictions', label: 'IA Preditiva', icon: ScanEye, roles: ['ceo', 'gerente'], color: 'text-cyan-300', anim: 'animate-icon-pulse-continuous' },
  { id: 'aiassistant', label: 'Assistente IA', icon: Sparkles, color: 'text-cyan-300', anim: 'animate-icon-float-continuous' },
  { id: 'companies', label: 'Empresas', icon: Building2, roles: ['ceo', 'gerente'], color: 'text-blue-400', anim: 'animate-icon-float-continuous' },
  { id: 'users', label: 'Usuários', icon: Users, roles: ['ceo', 'gerente'], color: 'text-teal-400', anim: 'animate-icon-pulse-continuous' },
  { id: 'inventory', label: 'Estoque', icon: Boxes, roles: ['ceo', 'gerente', 'solicitante'], color: 'text-yellow-400', anim: 'animate-icon-wiggle-continuous' },
  { id: 'licenses', label: 'Licenças', icon: ShieldCheck, roles: ['admin'], color: 'text-rose-400', anim: 'animate-icon-pulse-continuous' },
  { id: 'contracts', label: 'Contratos', icon: FileText, roles: ['admin'], color: 'text-amber-400', anim: 'animate-icon-float-continuous' },
  { id: 'settings', label: 'Configurações', icon: Settings, color: 'text-slate-400', anim: 'animate-icon-spin-continuous' },
  { id: 'auditlog', label: 'Auditoria', icon: ShieldAlert, roles: ['ceo', 'gerente'], color: 'text-rose-300', anim: 'animate-icon-pulse-continuous' },
  { id: 'integrations', label: 'Integrações', icon: Plug, roles: ['ceo', 'gerente'], color: 'text-cyan-400', anim: 'animate-icon-pulse-continuous' },
  { id: 'compliance', label: 'Conformidade', icon: ClipboardCheck, roles: ['ceo', 'gerente', 'mecanico'], color: 'text-emerald-400', anim: 'animate-icon-pulse-continuous' },
  { id: 'techdoc', label: 'Documento Técnico', icon: FileCode, roles: ['ceo'], color: 'text-sky-300', anim: 'animate-icon-float-continuous' },
];

export function canAccessPage(id: NavId, role: string | null, isAdmin: boolean): boolean {
  const item = ALL_ITEMS.find((it) => it.id === id);
  if (!item) return false;
  if (item.roles?.includes('admin')) return isAdmin;
  return !item.roles || (!!role && item.roles.includes(role));
}

export default function AppLayout({
  active, onNavigate, children,
}: {
  active: NavId;
  onNavigate: (id: NavId) => void;
  children: ReactNode;
}) {
  const { user, signOut, activeCompany, activeRole, members, setActiveCompany } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [now, setNow] = useState(new Date());
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [companyMenuOpen, setCompanyMenuOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [pushBanner, setPushBanner] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushDenied, setPushDenied] = useState(false);
  // Navigation history stack: every visited screen is pushed here.
  // goBack() pops and returns to the previous screen — retracing the user's exact path.
  const navStack = useRef<NavId[]>(['dashboard']);
  const suppressPush = useRef(false);
  const lastGoBack = useRef(0);

  const isAdmin = user?.email === 'clebsonbernardovelho@gmail.com';

  useMechanicLocation(user?.id, activeCompany?.id, activeRole);

  // Push to history stack whenever the active screen changes (user navigated forward)
  useEffect(() => {
    if (suppressPush.current) { suppressPush.current = false; return; }
    const stack = navStack.current;
    if (stack[stack.length - 1] !== active) {
      stack.push(active);
      history.pushState({ clevia: stack.length - 1 }, '', '');
    }
  }, [active]);

  // Intercept browser back gesture/button — stay inside the app instead of exiting
  useEffect(() => {
    const onPop = () => {
      const now = Date.now();
      if (now - lastGoBack.current < 350) return; // already handled by touch swipe
      lastGoBack.current = now;
      const stack = navStack.current;
      if (stack.length > 1) {
        stack.pop();
        suppressPush.current = true;
        onNavigate(stack[stack.length - 1]);
        if ('vibrate' in navigator) navigator.vibrate(15);
      }
      // Always re-push so the browser can't exit the app
      history.pushState({ clevia: stack.length - 1 }, '', '');
    };
    history.pushState({ clevia: 0 }, '', '');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [onNavigate]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const loadNotifications = async () => {
    if (!user) return;
    const { data } = await supabase.from('notifications')
      .select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20);
    setNotifications(data ?? []);
  };

  const alertNewNotification = () => {
    if ('vibrate' in navigator) navigator.vibrate([300, 100, 300, 100, 400]);
    try {
      const ctx = new AudioContext();
      const beep = (freq: number, start: number, dur: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.25, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + dur);
      };
      beep(880, 0, 0.2);
      beep(1175, 0.25, 0.3);
      setTimeout(() => ctx.close(), 1200);
    } catch {
      // audio not available (e.g. no user interaction yet) — vibration still fires
    }
  };

  useEffect(() => {
    loadNotifications();
    if (!user) return;
    const channel = supabase.channel('notifications-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => {
          if (payload.eventType === 'INSERT') alertNewNotification();
          loadNotifications();
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Recurring OS reminder — every 1 minute, re-alert mechanics about unread OS
  // until someone accepts the OS (notifications are marked read on accept).
  useEffect(() => {
    if (!user || activeRole !== 'mecanico') return;

    const checkAndRemind = async () => {
      const { data: unread } = await supabase.from('notifications')
        .select('title, body, type, created_at, work_order_id')
        .eq('user_id', user.id)
        .eq('read', false)
        .eq('type', 'os_aberta')
        .order('created_at', { ascending: false })
        .limit(10);

      if (unread && unread.length > 0) {
        // Re-alert with stronger sound + vibration
        if ('vibrate' in navigator) navigator.vibrate([400, 150, 400, 150, 600]);
        try {
          const ctx = new AudioContext();
          const beep = (freq: number, start: number, dur: number) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.3, ctx.currentTime + start);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
            osc.start(ctx.currentTime + start);
            osc.stop(ctx.currentTime + start + dur);
          };
          beep(988, 0, 0.15);
          beep(1319, 0.2, 0.2);
          beep(988, 0.45, 0.15);
          beep(1319, 0.65, 0.25);
          setTimeout(() => ctx.close(), 1500);
        } catch {
          // audio not available — vibration still fires
        }

        // Also send a push notification for when the app is in the background
        const pushPayload = JSON.stringify({
          title: `Lembrete: ${unread.length} ${unread.length === 1 ? 'OS em aberto' : 'OS em aberto'}`,
          body: 'Você tem ordens de serviço aguardando atendimento. Toque para ver.',
          url: '/#workorders',
          tag: 'clevia-reminder',
          renotify: true,
        });
        try {
          const { data: sess } = await supabase.auth.getSession();
          const accessToken = sess.session?.access_token;
          if (accessToken) {
            fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-push-notification`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${accessToken}`,
              },
              body: JSON.stringify({ user_ids: [user.id], payload: pushPayload }),
            });
          }
        } catch {
          // best-effort
        }
      }
    };

    // First check after 1 minute, then every 1 minute
    const reminderInterval = setInterval(checkAndRemind, 60 * 1000);
    return () => clearInterval(reminderInterval);
  }, [user, activeRole]);

  useEffect(() => {
    if (!user || !activeCompany) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
    (async () => {
      if (Notification.permission === 'granted') {
        const ok = await subscribeToPush(user.id, activeCompany.id).catch(() => false);
        setPushBanner(!ok);
      } else if (Notification.permission === 'denied') {
        setPushDenied(true);
        setPushBanner(true);
      } else if (!sessionStorage.getItem('push_banner_dismissed')) {
        setPushBanner(true);
      }
    })();
  }, [user?.id, activeCompany?.id]);

  const enablePush = async () => {
    if (!user || !activeCompany) return;
    setPushBusy(true);
    try {
      const ok = await subscribeToPush(user.id, activeCompany.id);
      if (ok) { setPushBanner(false); setPushDenied(false); }
      else if (Notification.permission === 'denied') setPushDenied(true);
    } catch {
      if (Notification.permission === 'denied') setPushDenied(true);
    }
    setPushBusy(false);
  };

  const dismissPushBanner = () => {
    sessionStorage.setItem('push_banner_dismissed', '1');
    setPushBanner(false);
  };

  const greeting = (() => {
    const h = now.getHours();
    if (h < 12) return 'Bom dia';
    if (h < 18) return 'Boa tarde';
    return 'Boa noite';
  })();

  const displayName = members.find((m) => m.user_id === user?.id && m.company_id === activeCompany?.id)?.display_name
    || user?.email?.split('@')[0]
    || 'Usuário';

  const unreadCount = notifications.filter((n) => !n.read).length;
  const items = ALL_ITEMS.filter((it) => {
    if (it.roles?.includes('admin')) return isAdmin;
    return !it.roles || (activeRole && it.roles.includes(activeRole));
  });

  const markAllRead = async () => {
    if (!user) return;
    const { error: notifErr } = await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
    if (notifErr) { console.error('markAllRead failed', notifErr); return; }
    loadNotifications();
  };

  // Go back to the previous screen in the navigation stack.
  // Guard against double-fire from both touch swipe and popstate.
  const goBack = () => {
    const now = Date.now();
    if (now - lastGoBack.current < 350) return;
    lastGoBack.current = now;
    const stack = navStack.current;
    if (stack.length <= 1) return;
    stack.pop();
    suppressPush.current = true;
    onNavigate(stack[stack.length - 1]);
    if ('vibrate' in navigator) navigator.vibrate(15);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex">
      {/* Subtle grid background */}
      <div className="fixed inset-0 opacity-[0.015] pointer-events-none" style={{
        backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }} />

      {/* Sidebar — hidden drawer on mobile, fixed panel on sm+ */}
      <aside className={`sidebar-panel w-64 flex flex-col bg-slate-900 fixed inset-y-0 left-0 z-40 border-r border-slate-800 transition-transform duration-300 ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full sm:translate-x-0'}`}>
        <SidebarContent items={items} active={active} onNavigate={(id) => { onNavigate(id); setMobileSidebarOpen(false); }} onClose={() => setMobileSidebarOpen(false)} />
      </aside>
      {/* Mobile sidebar backdrop */}
      {mobileSidebarOpen && <div className="fixed inset-0 bg-black/50 z-30 sm:hidden" onClick={() => setMobileSidebarOpen(false)} />}

      {/* Main */}
      <div className="flex-1 sm:ml-64 flex flex-col min-h-screen relative z-10 min-w-0 max-w-full overflow-x-hidden pt-16">
        {/* Topbar */}
        <header className="h-16 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 flex items-center justify-between px-3 sm:px-6 fixed top-0 left-0 sm:left-64 right-0 z-30">
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
            {/* Hamburger — mobile only */}
            <button onClick={() => setMobileSidebarOpen(true)} className="sm:hidden p-2 rounded-lg hover:bg-slate-800 text-slate-300 transition shrink-0" aria-label="Abrir menu">
              <Menu className="w-5 h-5" />
            </button>
            {/* Greeting + clock */}
            <div className="flex flex-col items-center sm:items-center justify-center leading-tight text-center sm:text-center absolute left-1/2 -translate-x-1/2 sm:relative sm:left-0 sm:translate-x-0 sm:flex-1 sm:min-w-0">
              <span className="flex items-center gap-2 sm:gap-2 text-sm sm:text-xl font-bold bg-gradient-to-r from-cyan-300 via-sky-300 to-blue-400 bg-clip-text text-transparent truncate">
                <Hand className="sm:hidden w-6 h-6 text-amber-400 animate-wave-fancy shrink-0" />
                <Hand className="hidden sm:block w-4 h-4 sm:w-6 sm:h-6 text-amber-400 origin-[70%_70%] animate-wave shrink-0" />
                <span className="truncate">{greeting}, {displayName}!</span>
              </span>
              {/* Mobile: compact date + clock with seconds */}
              <span className="sm:hidden flex items-center gap-1.5 text-xs font-medium tabular-nums mt-0.5">
                <CalendarDays className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="text-emerald-400">{now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
                <span className="text-slate-600">·</span>
                <Clock className="w-3.5 h-3.5 text-sky-400 shrink-0 animate-pulse" />
                <span className="text-sky-400">{now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              </span>
              {/* Desktop: date + clock */}
              <span className="hidden sm:flex items-center gap-1.5 sm:gap-2 text-xs sm:text-base font-medium tabular-nums mt-0.5 justify-center">
                <Clock className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-cyan-400 shrink-0" />
                <span className="text-emerald-400">{now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</span>
                <span className="text-slate-600">·</span>
                <span className="text-sky-400">{now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-3 shrink-0">
            {/* Company switcher */}
            {members.length > 1 && activeCompany && (
              <div className="relative hidden sm:block">
                <button onClick={() => setCompanyMenuOpen(!companyMenuOpen)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 text-sm text-slate-200 hover:bg-slate-700 transition border border-slate-700/50">
                  <Building2 className="w-4 h-4 text-cyan-400" />
                  <span className="max-w-24 truncate">{activeCompany.name}</span>
                  <ChevronDown className="w-4 h-4" />
                </button>
                {companyMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setCompanyMenuOpen(false)} />
                    <div className="absolute right-0 mt-2 w-56 bg-slate-800 rounded-xl shadow-lg border border-slate-700 z-20 py-1">
                      {members.map((m) => (
                        <button key={m.id} onClick={() => {
                          setActiveCompany({ id: m.company_id, name: '', cnpj: null, logo_url: null, created_at: '' });
                          setCompanyMenuOpen(false);
                        }} className="w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-slate-700">
                          {m.company_id === activeCompany.id ? '✓ ' : ''}{m.company_id}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Theme toggle */}
            <button
              type="button"
              onPointerDown={(e) => { e.preventDefault(); toggleTheme(); }}
              aria-label={theme === 'light' ? 'Ativar modo escuro' : 'Ativar modo claro'}
              className="p-2 rounded-lg hover:bg-slate-800 active:bg-slate-700 active:scale-95 transition touch-manipulation select-none"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              {theme === 'light'
                ? <Moon className="w-5 h-5 text-indigo-400 hover:text-indigo-300" />
                : <Sun className="w-5 h-5 text-amber-400 hover:text-amber-300" />}
            </button>

            {/* Avatar + logout — desktop only */}
            <div className="hidden sm:flex w-9 h-9 rounded-full bg-gradient-to-br from-cyan-500 to-sky-600 items-center justify-center text-white font-semibold text-sm shrink-0">
              {displayName[0]?.toUpperCase()}
            </div>
            <button onClick={signOut} className="hidden sm:block p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-rose-400 transition shrink-0" title="Sair">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Page title banner */}
        <div className="px-4 sm:px-6 lg:px-8 pt-2 pb-1">
          <h1 className="text-lg sm:text-xl font-bold text-white">Painel de Controle</h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">Visão geral da manutenção industrial em tempo real</p>
        </div>

        {/* Content */}
        <main className="flex-1 p-3 sm:p-6 lg:p-8 pb-28 w-full max-w-full min-w-0 overflow-x-hidden">
          <div key={active} className="animate-page-enter">{children}</div>
        </main>

        {/* Mobile bottom navigation */}
        <MobileBottomNav active={active} onNavigate={onNavigate} />

        {/* Footer */}
        <footer className="fixed bottom-0 left-0 sm:left-64 right-0 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border-t border-cyan-500/20 z-20">
          <div className="px-3 sm:px-6 py-2.5 flex flex-row items-center justify-between gap-2 text-xs flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-white hidden sm:inline drop-shadow-[0_0_4px_rgba(255,255,255,0.5)]">©</span>
              <span className="text-white hidden sm:inline drop-shadow-[0_0_4px_rgba(255,255,255,0.5)]">2026</span>
              <span className="font-bold text-white tracking-wide drop-shadow-[0_0_6px_rgba(255,255,255,0.6)]">CLEVIA</span>
              <span className="font-semibold text-white hidden sm:inline drop-shadow-[0_0_4px_rgba(255,255,255,0.5)]">Software</span>
              <span className="text-white hidden lg:inline drop-shadow-[0_0_4px_rgba(255,255,255,0.5)]">·</span>
              <span className="inline-flex items-center gap-1">
                <span className="text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.5)]">Desenvolvedor:</span>
                <span className="font-semibold text-white drop-shadow-[0_0_6px_rgba(255,255,255,0.6)]">Clebson Bernardo Velho</span>
              </span>
            </div>
            <div className="flex items-center gap-3 sm:gap-4 shrink-0">
              <a href="mailto:clebsonbernardovelho@gmail.com" className="flex items-center gap-1.5 text-white hover:text-cyan-300 transition drop-shadow-[0_0_4px_rgba(255,255,255,0.5)]">
                <MailIcon /> <span className="hidden sm:inline">clebsonbernardovelho@gmail.com</span>
              </a>
              <a href="https://wa.me/5548996568756" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-white hover:text-cyan-300 transition drop-shadow-[0_0_4px_rgba(255,255,255,0.5)]">
                <WhatsIcon /> <span className="hidden sm:inline">48 996568756</span>
              </a>
            </div>
          </div>
        </footer>
      </div>

      {/* Floating AI Assistant — available on every screen */}
      <FloatingAIAssistant />
    </div>
  );

}

function MobileSidebarActions() {
  const { signOut } = useAuth();
  return (
    <div className="sm:hidden flex items-center gap-2">
      <button
        onClick={signOut}
        className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-slate-800/70 hover:bg-slate-800 text-slate-300 hover:text-rose-400 text-xs font-medium transition"
      >
        <LogOut className="w-4 h-4" /> Sair
      </button>
    </div>
  );
}

function SidebarContent({ items, active, onNavigate, onClose }: {
  items: NavItem[];
  active: NavId;
  onNavigate: (id: NavId) => void;
  onClose?: () => void;
}) {
  return (
    <>
      <div className="h-auto flex items-center gap-3 px-6 py-4 border-b border-slate-800 justify-start">
        <CleviaGear size={44} />
        <div className="flex flex-col leading-none">
          <span className="relative text-2xl font-black tracking-[0.2em] bg-gradient-to-r from-sky-300 via-blue-400 to-blue-600 bg-clip-text text-transparent drop-shadow-[0_0_12px_rgba(56,189,248,0.35)]">CLEVIA</span>
          <span className="mt-1.5 text-[10px] font-semibold tracking-[0.22em] uppercase bg-gradient-to-r from-sky-300 via-blue-400 to-blue-600 bg-clip-text text-transparent">Plataforma Inteligente Gestão Industrial</span>
        </div>
        {onClose && <button onClick={onClose} className="ml-auto text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>}
      </div>
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto sidebar-scroll">
        {items.map((item) => {
          const isActive = active === item.id;
          return (
            <button key={item.id} onClick={() => onNavigate(item.id)} title={item.label}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 justify-start ${
                isActive
                  ? 'bg-gradient-to-r from-cyan-500/20 to-sky-500/10 text-cyan-300 border border-cyan-500/30 shadow-lg shadow-cyan-500/5'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60 border border-transparent'
              }`}>
              <item.icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110 ' : ''}${item.color} ${item.anim ?? ''}`} />
              <span className="inline">{item.label}</span>
            </button>
          );
        })}
      </nav>
      {/* System status */}
      <div className="p-4 border-t border-slate-800 space-y-3">
        <MobileSidebarActions />
        <div className="flex items-center gap-2 px-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-slate-400">Sistema online</span>
        </div>
        <div className="px-4 py-3 rounded-xl bg-slate-800/50 border border-slate-700/30">
          <p className="text-xs text-slate-500">Versão</p>
          <p className="text-sm font-medium text-slate-300">CLEVIA Cloud 2.0</p>
        </div>
      </div>
    </>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none">
      <rect x="2" y="5" width="20" height="14" rx="2.5" fill="#fff" stroke="#d1d5db" strokeWidth="1.5" />
      <path d="M2.5 7.5 12 13l9.5-5.5" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.5 7.5 12 13l9.5-5.5" stroke="#fff" strokeWidth="0.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WhatsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4">
      <path fill="#25D366" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.89-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

function MobileBottomNav({ active, onNavigate }: { active: NavId; onNavigate: (id: NavId) => void }) {
  const { activeRole } = useAuth();
  const items = useMemo(() => ALL_ITEMS.filter((i) => !i.roles || i.roles.includes(activeRole ?? 'mecanico')), [activeRole]);
  const quickItems = items.slice(0, 5);
  const hasMore = items.length > 5;

  return (
    <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800">
      <div className="flex items-center justify-around px-1 py-1.5 safe-area-bottom">
        {quickItems.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button key={item.id} onClick={() => onNavigate(item.id)}
              className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition flex-1 min-w-0 ${
                isActive ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-300'
              }`}>
              <Icon className={`w-5 h-5 ${isActive ? item.color : ''}`} />
              <span className="text-[10px] font-medium truncate w-full text-center">{item.label}</span>
            </button>
          );
        })}
        {hasMore && (
          <button onClick={() => onNavigate('dashboard')}
            className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition flex-1 min-w-0 ${
              active === 'dashboard' ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-300'
            }`}>
            <Grid3x3 className="w-5 h-5" />
            <span className="text-[10px] font-medium">Mais</span>
          </button>
        )}
      </div>
    </nav>
  );
}
