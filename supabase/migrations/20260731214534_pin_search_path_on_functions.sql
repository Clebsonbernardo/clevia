-- Funções sem search_path fixo podem ser induzidas a resolver objetos de um schema
-- controlado pelo chamador. Fixamos o search_path em todas elas.
ALTER FUNCTION public.is_clevia_admin() SET search_path = public, pg_temp;
ALTER FUNCTION public.generate_contract_number() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_contracts_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.assign_os_number() SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_machine_status_from_work_orders() SET search_path = public, pg_temp;
ALTER FUNCTION public.populate_mechanic_id() SET search_path = public, pg_temp;
ALTER FUNCTION public.auto_create_trial_license() SET search_path = public, pg_temp;
ALTER FUNCTION public.is_admin() SET search_path = public, pg_temp;
ALTER FUNCTION public.is_company_ceo(uuid, uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.is_company_member(uuid, uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.is_company_owner(uuid, uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_machine_status_on_os_change() SET search_path = public, pg_temp;
