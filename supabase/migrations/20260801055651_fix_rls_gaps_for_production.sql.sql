-- Fix 1: Add DELETE policies for tables that have DELETE grants but no DELETE policy

-- ai_predictions: delete only by company members
CREATE POLICY "delete_ai_predictions_company" ON ai_predictions
  FOR DELETE TO authenticated
  USING (company_id IN (SELECT company_members.company_id FROM company_members WHERE company_members.user_id = auth.uid()));

-- audit_logs: delete only by admin
CREATE POLICY "delete_audit_logs_admin" ON audit_logs
  FOR DELETE TO authenticated
  USING (is_admin());

-- company_licenses: delete only by admin
CREATE POLICY "delete_license_admin" ON company_licenses
  FOR DELETE TO authenticated
  USING (is_admin());

-- integration_sync_logs: delete by company members
CREATE POLICY "delete_own_sync_logs" ON integration_sync_logs
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = integration_sync_logs.company_id AND cm.user_id = auth.uid()));

-- mechanic_locations: delete own location only
CREATE POLICY "delete_own_location" ON mechanic_locations
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- production_daily_history: delete by company members (admin/gerente only)
CREATE POLICY "delete_production_history_company" ON production_daily_history
  FOR DELETE TO authenticated
  USING (company_id IN (SELECT company_members.company_id FROM company_members WHERE company_members.user_id = auth.uid() AND company_members.role IN ('ceo', 'gerente')));

-- work_order_history: delete by company members
CREATE POLICY "delete_history" ON work_order_history
  FOR DELETE TO authenticated
  USING (work_order_id IN (SELECT wo.id FROM work_orders wo WHERE wo.company_id IN (SELECT company_members.company_id FROM company_members WHERE company_members.user_id = auth.uid())));

-- Fix 2: Add WITH CHECK to integration_sync_logs UPDATE policy
DROP POLICY IF EXISTS "update_own_sync_logs" ON integration_sync_logs;
CREATE POLICY "update_own_sync_logs" ON integration_sync_logs
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = integration_sync_logs.company_id AND cm.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = integration_sync_logs.company_id AND cm.user_id = auth.uid()));

-- Fix 3: Restrict app_settings - anon should only SELECT the vapid_public_key
-- Revoke INSERT, UPDATE, DELETE from anon
REVOKE INSERT, UPDATE, DELETE ON app_settings FROM anon;
-- Keep SELECT for anon (filtered by RLS to only vapid_public_key)
-- Add INSERT/UPDATE/DELETE policies for authenticated admin only
CREATE POLICY "insert_app_settings_admin" ON app_settings
  FOR INSERT TO authenticated
  WITH CHECK (is_admin());
CREATE POLICY "update_app_settings_admin" ON app_settings
  FOR UPDATE TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "delete_app_settings_admin" ON app_settings
  FOR DELETE TO authenticated
  USING (is_admin());

-- Fix 4: Add SELECT policy for app_settings for authenticated (admin can read all settings)
DROP POLICY IF EXISTS "read_app_settings_public_key" ON app_settings;
CREATE POLICY "read_app_settings_public" ON app_settings
  FOR SELECT TO anon, authenticated
  USING (key = 'vapid_public_key');
CREATE POLICY "read_app_settings_admin" ON app_settings
  FOR SELECT TO authenticated
  USING (is_admin());

-- Fix 5: Revoke EXECUTE from PUBLIC on all SECURITY DEFINER functions
-- (They still have EXECUTE on authenticated explicitly, which is intentional)
REVOKE EXECUTE ON FUNCTION public.archive_and_reset_daily_production() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_company_license_status(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_production_metrics(uuid, text, date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_clevia_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_company_ceo(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_company_member(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_company_owner(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_license_active(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_audit_entry(uuid, text, text, uuid, text, jsonb) FROM PUBLIC;
