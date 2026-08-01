import { useEffect, useState, useCallback } from 'react';
import { supabase, type CeoGrant } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

export const PERMISSION_KEYS = [
  { key: 'register_production', label: 'Registrar Produção', desc: 'Permite registrar a produção no dashboard' },
  { key: 'manage_machines', label: 'Gerenciar Máquinas', desc: 'Cadastrar, editar e remover máquinas' },
  { key: 'manage_workorders', label: 'Gerenciar Ordens de Serviço', desc: 'Criar, editar e excluir OS' },
  { key: 'manage_mechanics', label: 'Gerenciar Mecânicos', desc: 'Cadastrar e editar mecânicos' },
  { key: 'manage_preventives', label: 'Gerenciar Preventivas', desc: 'Criar e editar planos preventivos' },
  { key: 'manage_inventory', label: 'Gerenciar Estoque', desc: 'Controle de peças e insumos' },
  { key: 'manage_companies', label: 'Gerenciar Empresas', desc: 'Cadastrar empresas e filiais' },
  { key: 'manage_users', label: 'Gerenciar Usuários', desc: 'Convidar e gerenciar membros' },
  { key: 'manage_screens', label: 'Gerenciar Telas', desc: 'Configurar monitores de setores' },
  { key: 'view_indicators', label: 'Ver Indicadores', desc: 'Acesso aos indicadores e relatórios' },
  { key: 'view_mechanic_location', label: 'Localização de Mecânicos', desc: 'Ver localização dos mecânicos no mapa' },
  { key: 'view_oshistory', label: 'Histórico de OS', desc: 'Ver histórico de ordens de serviço' },
  { key: 'view_machinehistory', label: 'Histórico de Máquinas', desc: 'Ver histórico de máquinas' },
] as const;

export function useGrants() {
  const { activeCompany, session, activeRole } = useAuth();
  const [grants, setGrants] = useState<CeoGrant[]>([]);
  const [loading, setLoading] = useState(true);

  const loadGrants = useCallback(async () => {
    if (!activeCompany?.id) return;
    const { data } = await supabase
      .from('ceo_grants')
      .select('*')
      .eq('company_id', activeCompany.id);
    setGrants(data ?? []);
    setLoading(false);
  }, [activeCompany?.id]);

  useEffect(() => {
    loadGrants();
    if (!activeCompany?.id) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase.channel('grants-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'ceo_grants', filter: `company_id=eq.${activeCompany.id}` }, loadGrants)
        .subscribe();
    } catch {
      channel = null;
    }
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [activeCompany?.id, loadGrants]);

  const hasPermission = useCallback((permissionKey: string): boolean => {
    if (!session?.user) return false;
    if (activeRole === 'ceo') return true;
    return grants.some(g => g.user_id === session.user.id && g.permission_key === permissionKey && g.granted);
  }, [grants, session?.user, activeRole]);

  return { grants, loading, loadGrants, hasPermission };
}

export function usePermission(permissionKey: string): boolean {
  const { hasPermission } = useGrants();
  return hasPermission(permissionKey);
}
