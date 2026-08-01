/*
# CLEVIA Premium — Audit Logs, Machine Positions, Production History, AI Predictions

## Summary
Adds database infrastructure for CLEVIA Premium:
1. Audit log tracking (who, when, what, IP, device)
2. Machine positions for factory map visual layout
3. Production daily history (for midnight auto-reset)
4. AI prediction results table
5. Additional notification types

## New Tables
- audit_logs: tracks every significant action
- machine_positions: visual X/Y coordinates for factory map
- production_daily_history: archived daily production snapshots
- ai_predictions: AI-generated predictions and anomaly detections

## Security
- RLS enabled on all new tables, scoped to company members
- SECURITY DEFINER functions for audit logging, midnight reset, production metrics
*/

-- 1. AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  description text,
  ip_address text,
  device_info text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_audit_logs_company" ON audit_logs;
CREATE POLICY "select_audit_logs_company" ON audit_logs FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "insert_audit_logs_company" ON audit_logs;
CREATE POLICY "insert_audit_logs_company" ON audit_logs FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_audit_logs_company ON audit_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

-- 2. MACHINE POSITIONS
CREATE TABLE IF NOT EXISTS machine_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  branch_id uuid,
  machine_id uuid NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  sector text,
  position_x integer DEFAULT 0,
  position_y integer DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(company_id, machine_id)
);
ALTER TABLE machine_positions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_machine_positions_company" ON machine_positions;
CREATE POLICY "select_machine_positions_company" ON machine_positions FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "insert_machine_positions_company" ON machine_positions;
CREATE POLICY "insert_machine_positions_company" ON machine_positions FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "update_machine_positions_company" ON machine_positions;
CREATE POLICY "update_machine_positions_company" ON machine_positions FOR UPDATE TO authenticated
  USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "delete_machine_positions_company" ON machine_positions;
CREATE POLICY "delete_machine_positions_company" ON machine_positions FOR DELETE TO authenticated
  USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_machine_positions_company ON machine_positions(company_id);

-- 3. PRODUCTION DAILY HISTORY
CREATE TABLE IF NOT EXISTS production_daily_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  machine_id uuid NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  log_date date NOT NULL,
  units_produced numeric DEFAULT 0,
  uptime_hours numeric DEFAULT 0,
  production_per_hour numeric DEFAULT 0,
  shift text,
  archived_at timestamptz DEFAULT now()
);
ALTER TABLE production_daily_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_production_history_company" ON production_daily_history;
CREATE POLICY "select_production_history_company" ON production_daily_history FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_production_history_company ON production_daily_history(company_id);
CREATE INDEX IF NOT EXISTS idx_production_history_date ON production_daily_history(log_date DESC);
CREATE INDEX IF NOT EXISTS idx_production_history_machine ON production_daily_history(machine_id);

-- 4. AI PREDICTIONS
CREATE TABLE IF NOT EXISTS ai_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  machine_id uuid REFERENCES machines(id) ON DELETE SET NULL,
  prediction_type text NOT NULL,
  severity text DEFAULT 'medium',
  description text,
  confidence numeric DEFAULT 0,
  recommended_action text,
  metadata jsonb DEFAULT '{}'::jsonb,
  resolved boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE ai_predictions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_ai_predictions_company" ON ai_predictions;
CREATE POLICY "select_ai_predictions_company" ON ai_predictions FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "insert_ai_predictions_company" ON ai_predictions;
CREATE POLICY "insert_ai_predictions_company" ON ai_predictions FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "update_ai_predictions_company" ON ai_predictions;
CREATE POLICY "update_ai_predictions_company" ON ai_predictions FOR UPDATE TO authenticated
  USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_ai_predictions_company ON ai_predictions(company_id);
CREATE INDEX IF NOT EXISTS idx_ai_predictions_unresolved ON ai_predictions(company_id) WHERE resolved = false;

-- 5. ADD COLUMNS TO EXISTING TABLES
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'production_logs' AND column_name = 'shift') THEN
    ALTER TABLE production_logs ADD COLUMN shift text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'notification_type') THEN
    ALTER TABLE notifications ADD COLUMN notification_type text DEFAULT 'os';
  END IF;
END $$;

-- 6. SECURITY DEFINER FUNCTIONS
CREATE OR REPLACE FUNCTION log_audit_entry(
  p_company_id uuid,
  p_action text,
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_email text;
  v_result uuid;
BEGIN
  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
  INSERT INTO audit_logs (company_id, user_id, user_email, action, entity_type, entity_id, description, metadata)
  VALUES (p_company_id, v_user_id, v_user_email, p_action, p_entity_type, p_entity_id, p_description, p_metadata)
  RETURNING id INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION archive_and_reset_daily_production()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO production_daily_history (company_id, machine_id, log_date, units_produced, uptime_hours, production_per_hour, shift)
  SELECT company_id, machine_id, log_date, units_produced, uptime_hours,
    CASE WHEN uptime_hours > 0 THEN units_produced / uptime_hours ELSE 0 END, shift
  FROM production_logs WHERE log_date = CURRENT_DATE;
  UPDATE production_logs SET units_produced = 0, uptime_hours = 0 WHERE log_date = CURRENT_DATE;
END;
$$;

CREATE OR REPLACE FUNCTION get_production_metrics(
  p_company_id uuid, p_period text DEFAULT 'day',
  p_start_date date DEFAULT NULL, p_end_date date DEFAULT NULL
)
RETURNS TABLE (machine_id uuid, machine_name text, total_units numeric, total_hours numeric, avg_per_hour numeric, period_label text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_start date := COALESCE(p_start_date, CURRENT_DATE);
  v_end date := COALESCE(p_end_date, CURRENT_DATE);
BEGIN
  IF p_period = 'hour' OR p_period = 'day' THEN
    v_start := CURRENT_DATE; v_end := CURRENT_DATE;
  ELSIF p_period = 'week' THEN
    v_start := CURRENT_DATE - 6; v_end := CURRENT_DATE;
  ELSIF p_period = 'month' THEN
    v_start := date_trunc('month', CURRENT_DATE)::date; v_end := CURRENT_DATE;
  ELSIF p_period = 'year' THEN
    v_start := date_trunc('year', CURRENT_DATE)::date; v_end := CURRENT_DATE;
  END IF;
  RETURN QUERY
  SELECT m.id, m.name,
    COALESCE(SUM(CASE WHEN pl.log_date BETWEEN v_start AND v_end THEN pl.units_produced ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN pl.log_date BETWEEN v_start AND v_end THEN pl.uptime_hours ELSE 0 END), 0),
    CASE WHEN COALESCE(SUM(CASE WHEN pl.log_date BETWEEN v_start AND v_end THEN pl.uptime_hours ELSE 0 END), 0) > 0
      THEN COALESCE(SUM(CASE WHEN pl.log_date BETWEEN v_start AND v_end THEN pl.units_produced ELSE 0 END), 0) /
           SUM(CASE WHEN pl.log_date BETWEEN v_start AND v_end THEN pl.uptime_hours ELSE 0 END)
      ELSE 0 END,
    p_period
  FROM machines m
  LEFT JOIN production_logs pl ON pl.machine_id = m.id
  WHERE m.company_id = p_company_id
  GROUP BY m.id, m.name
  ORDER BY total_units DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION log_audit_entry(uuid, text, text, uuid, text, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION archive_and_reset_daily_production() FROM anon, public;
REVOKE EXECUTE ON FUNCTION get_production_metrics(uuid, text, date, date) FROM anon, public;

-- 7. REALTIME
ALTER TABLE audit_logs REPLICA IDENTITY FULL;
ALTER TABLE ai_predictions REPLICA IDENTITY FULL;
ALTER TABLE machine_positions REPLICA IDENTITY FULL;