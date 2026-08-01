-- O bloqueio por licença expirada/cancelada só existia na interface (LicenseBlockedScreen).
-- Passa a ser verificado no banco na criação de novos registros.
CREATE OR REPLACE FUNCTION public.is_license_active(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM company_licenses cl
    WHERE cl.company_id = p_company_id
      AND (
        cl.status IN ('canceled', 'blocked')
        OR cl.expires_at < now()
        OR (cl.plan = 'paid' AND cl.next_payment_date IS NOT NULL AND cl.next_payment_date < CURRENT_DATE)
      )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_license_active(uuid) FROM anon;

DROP POLICY IF EXISTS insert_wo ON work_orders;
CREATE POLICY insert_wo ON work_orders FOR INSERT TO authenticated
  WITH CHECK (
    public.is_license_active(company_id)
    AND company_id IN (
      SELECT company_members.company_id FROM company_members
      WHERE company_members.user_id = auth.uid()
        AND company_members.role = ANY (ARRAY['ceo'::text, 'gerente'::text])
    )
  );

DROP POLICY IF EXISTS insert_machines ON machines;
CREATE POLICY insert_machines ON machines FOR INSERT TO authenticated
  WITH CHECK (
    public.is_license_active(company_id)
    AND company_id IN (
      SELECT company_members.company_id FROM company_members
      WHERE company_members.user_id = auth.uid()
        AND company_members.role = ANY (ARRAY['ceo'::text, 'solicitante'::text])
    )
  );

DROP POLICY IF EXISTS insert_preventives ON preventive_plans;
CREATE POLICY insert_preventives ON preventive_plans FOR INSERT TO authenticated
  WITH CHECK (
    public.is_license_active(company_id)
    AND company_id IN (
      SELECT company_members.company_id FROM company_members
      WHERE company_members.user_id = auth.uid()
        AND company_members.role = ANY (ARRAY['ceo'::text, 'solicitante'::text])
    )
  );

DROP POLICY IF EXISTS insert_inventory ON inventory_items;
CREATE POLICY insert_inventory ON inventory_items FOR INSERT TO authenticated
  WITH CHECK (
    public.is_license_active(company_id)
    AND company_id IN (
      SELECT company_members.company_id FROM company_members
      WHERE company_members.user_id = auth.uid()
        AND company_members.role = ANY (ARRAY['ceo'::text, 'solicitante'::text])
    )
  );

DROP POLICY IF EXISTS insert_production ON production_logs;
CREATE POLICY insert_production ON production_logs FOR INSERT TO authenticated
  WITH CHECK (
    public.is_license_active(company_id)
    AND company_id IN (
      SELECT company_members.company_id FROM company_members
      WHERE company_members.user_id = auth.uid()
        AND company_members.role = ANY (ARRAY['supervisora'::text, 'ceo'::text])
    )
  );
