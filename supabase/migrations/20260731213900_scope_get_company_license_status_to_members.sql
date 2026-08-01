-- A função é SECURITY DEFINER e devolvia dados de licença/valores de qualquer empresa
-- para qualquer chamador que informasse o company_id. Passa a exigir vínculo ou admin.
CREATE OR REPLACE FUNCTION public.get_company_license_status(p_company_id uuid)
 RETURNS TABLE(plan text, status text, started_at timestamp with time zone, expires_at timestamp with time zone, monthly_fee numeric, next_payment_date date, days_remaining integer, is_blocked boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
SELECT
cl.plan,
CASE
WHEN cl.status = 'canceled' THEN 'canceled'
WHEN cl.status = 'blocked' THEN 'blocked'
WHEN cl.expires_at < now() THEN 'expired'
WHEN cl.plan = 'paid' AND cl.next_payment_date IS NOT NULL AND cl.next_payment_date < CURRENT_DATE THEN 'expired'
ELSE 'active'
END,
cl.started_at,
cl.expires_at,
cl.monthly_fee,
cl.next_payment_date,
GREATEST(EXTRACT(day FROM cl.expires_at - now())::int, 0),
CASE
WHEN cl.status = 'canceled' THEN true
WHEN cl.status = 'blocked' THEN true
WHEN cl.expires_at < now() THEN true
WHEN cl.plan = 'paid' AND cl.next_payment_date IS NOT NULL AND cl.next_payment_date < CURRENT_DATE THEN true
ELSE false
END
FROM company_licenses cl
WHERE cl.company_id = p_company_id
  AND (public.is_company_member(p_company_id, auth.uid()) OR public.is_admin());
$function$;

REVOKE EXECUTE ON FUNCTION public.get_company_license_status(uuid) FROM anon;
