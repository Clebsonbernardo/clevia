import { useState, useEffect, lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { registerServiceWorker } from '@/lib/push';
import { ThemeProvider } from '@/context/ThemeContext';
import LoginScreen from '@/screens/LoginScreen';
import LicenseBlockedScreen from '@/screens/LicenseBlockedScreen';
import AppLayout, { canAccessPage, type NavId } from '@/components/AppLayout';

const Dashboard = lazy(() => import('@/screens/Dashboard'));
const WorkOrdersScreen = lazy(() => import('@/screens/WorkOrdersScreen'));
const MechanicsScreen = lazy(() => import('@/screens/MechanicsScreen'));
const PreventivesScreen = lazy(() => import('@/screens/PreventivesScreen'));
const IndicatorsScreen = lazy(() => import('@/screens/IndicatorsScreen'));
const CompaniesScreen = lazy(() => import('@/screens/CompaniesScreen'));
const UsersScreen = lazy(() => import('@/screens/UsersScreen'));
const InventoryScreen = lazy(() => import('@/screens/InventoryScreen'));
const SettingsScreen = lazy(() => import('@/screens/SettingsScreen'));
const OSHistoryScreen = lazy(() => import('@/screens/OSHistoryScreen'));
const MachineHistoryScreen = lazy(() => import('@/screens/MachineHistoryScreen'));
const MachinesScreen = lazy(() => import('@/screens/MachinesScreen'));
const AIAssistantScreen = lazy(() => import('@/screens/AIAssistantScreen'));
const MechanicLocationScreen = lazy(() => import('@/screens/MechanicLocationScreen'));
const ManageScreensScreen = lazy(() => import('@/screens/ManageScreensScreen'));
const PermissionsScreen = lazy(() => import('@/screens/PermissionsScreen'));
const SectorBoardScreen = lazy(() => import('@/screens/SectorBoardScreen'));
const TechDocScreen = lazy(() => import('@/screens/TechDocScreen'));
const FactoryMapScreen = lazy(() => import('@/screens/FactoryMapScreen'));
const ReportsScreen = lazy(() => import('@/screens/ReportsScreen'));
const AiPredictionsScreen = lazy(() => import('@/screens/AiPredictionsScreen'));
const AuditLogScreen = lazy(() => import('@/screens/AuditLogScreen'));
const IntegrationsScreen = lazy(() => import('@/screens/IntegrationsScreen'));
const ComplianceScreen = lazy(() => import('@/screens/ComplianceScreen'));
const LicensesScreen = lazy(() => import('@/screens/LicensesScreen'));
const ContractsScreen = lazy(() => import('@/screens/ContractsScreen'));

const ADMIN_EMAIL = 'clebsonbernardovelho@gmail.com';

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-slate-200 dark:border-slate-800 border-t-cyan-400 rounded-full animate-spin" />
    </div>
  );
}

function AppContent() {
  const { session, loading, activeCompany, activeRole, user, license, licenseLoading, companyLoading } = useAuth();
  const [page, setPage] = useState<NavId>('dashboard');

  const isAdmin = user?.email === ADMIN_EMAIL;

  useEffect(() => {
    registerServiceWorker();
  }, []);

  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash && canAccessPage(hash as NavId, activeRole ?? 'mecanico', isAdmin)) {
        setPage(hash as NavId);
        window.history.replaceState(null, '', window.location.pathname);
      }
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, [activeRole, isAdmin]);

  useEffect(() => {
    if (!activeRole) return;
    if (!canAccessPage(page, activeRole, isAdmin)) {
      setPage(activeRole === 'mecanico' ? 'workorders' : 'dashboard');
    }
  }, [activeRole, page, isAdmin]);

  if (loading || (session && companyLoading && !activeCompany)) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-slate-200 dark:border-slate-800 border-t-cyan-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) return <LoginScreen />;

  if (!activeCompany) {
    return <LoginScreen />;
  }

  if (!isAdmin && !licenseLoading && license?.is_blocked) {
    return <LicenseBlockedScreen />;
  }

  return (
    <AppLayout active={page} onNavigate={setPage}>
      <Suspense fallback={<PageLoader />}>
        {canAccessPage(page, activeRole, isAdmin) && (
          <>
            {page === 'dashboard' && <Dashboard onNavigate={(id) => setPage(id as any)} />}
            {page === 'workorders' && <WorkOrdersScreen />}
            {page === 'oshistory' && <OSHistoryScreen />}
            {page === 'machinehistory' && <MachineHistoryScreen />}
            {page === 'machines' && <MachinesScreen />}
            {page === 'mechanics' && <MechanicsScreen />}
            {page === 'preventives' && <PreventivesScreen />}
            {page === 'indicators' && <IndicatorsScreen />}
            {page === 'aiassistant' && <AIAssistantScreen />}
            {page === 'companies' && <CompaniesScreen />}
            {page === 'users' && <UsersScreen />}
            {page === 'inventory' && <InventoryScreen />}
            {page === 'licenses' && <LicensesScreen />}
            {page === 'contracts' && <ContractsScreen />}
            {page === 'settings' && <SettingsScreen />}
            {page === 'mechaniclocation' && <MechanicLocationScreen />}
            {page === 'managescreens' && <ManageScreensScreen />}
            {page === 'permissions' && <PermissionsScreen />}
            {page === 'sectorboard' && <SectorBoardScreen onNavigate={(id) => setPage(id as any)} />}
            {page === 'techdoc' && <TechDocScreen />}
            {page === 'factorymap' && <FactoryMapScreen />}
            {page === 'reports' && <ReportsScreen />}
            {page === 'aipredictions' && <AiPredictionsScreen />}
            {page === 'auditlog' && <AuditLogScreen />}
            {page === 'integrations' && <IntegrationsScreen />}
            {page === 'compliance' && <ComplianceScreen />}
          </>
        )}
      </Suspense>
    </AppLayout>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}
