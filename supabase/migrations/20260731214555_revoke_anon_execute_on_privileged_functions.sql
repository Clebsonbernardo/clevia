-- Funções SECURITY DEFINER não devem ser chamáveis por visitantes não autenticados
-- através da Data API. O papel authenticated mantém EXECUTE porque as políticas RLS
-- avaliam essas funções.
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_clevia_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_company_ceo(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_company_owner(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_company_member(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.assign_os_number() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_create_trial_license() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_contract_number() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_machine_status_on_os_change() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_machine_status_from_work_orders() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_contracts_updated_at() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.populate_mechanic_id() FROM anon, authenticated;
