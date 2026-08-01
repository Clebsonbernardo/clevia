-- EXECUTE estava concedido ao papel PUBLIC (default do Postgres), o que torna as
-- funções chamáveis por visitantes não autenticados via /rest/v1/rpc.
-- Revogamos de PUBLIC e devolvemos EXECUTE apenas a quem precisa.

-- Funções de gatilho: ninguém deve chamá-las diretamente.
REVOKE EXECUTE ON FUNCTION public.assign_os_number() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_create_trial_license() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_contract_number() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.populate_mechanic_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_machine_status_from_work_orders() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_machine_status_on_os_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_contracts_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.work_orders_protect_identity() FROM PUBLIC;

-- Helpers usados nas políticas RLS: apenas usuários autenticados.
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_clevia_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_company_ceo(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_company_member(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_company_owner(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_license_active(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_company_license_status(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_clevia_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_company_ceo(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_company_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_company_owner(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_license_active(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_company_license_status(uuid) TO authenticated;
