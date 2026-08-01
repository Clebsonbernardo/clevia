/*
# Integrations, OS Approval Flow, and Report Templates

## 1. Integrations (SAP, ERP, IoT OPC UA/Modbus, Active Directory)

### New Tables:
- `integrations` — per-company integration configurations. Supports SAP, ERP, IoT (OPC UA / Modbus), and Active Directory.
  - `id` (uuid PK)
  - `company_id` (uuid FK → companies)
  - `type` (text: 'sap' | 'erp' | 'iot_opcua' | 'iot_modbus' | 'active_directory')
  - `name` (text — user-friendly label)
  - `endpoint_url` (text — API URL, OPC UA server URL, AD domain, etc.)
  - `config` (jsonb — protocol-specific config: polling intervals, tag mappings, search filters, etc.)
  - `credentials_encrypted` (jsonb — stored encrypted; in production this would use vault)
  - `active` (boolean, default true)
  - `last_sync_at` (timestamptz)
  - `sync_status` (text: 'idle' | 'running' | 'success' | 'error')
  - `last_error` (text)
  - `created_at`, `updated_at` (timestamptz)

- `integration_sync_logs` — per-sync audit trail.
  - `id` (uuid PK)
  - `integration_id` (uuid FK → integrations ON DELETE CASCADE)
  - `company_id` (uuid)
  - `started_at`, `finished_at` (timestamptz)
  - `status` (text: 'success' | 'error' | 'partial')
  - `records_synced` (int)
  - `error_message` (text)
  - `payload` (jsonb — sample of synced data for debugging)

## 2. OS Approval Flow with Hierarchical Levels

### New Table:
- `work_order_approvals` — approval chain per work order.
  - `id` (uuid PK)
  - `work_order_id` (uuid FK → work_orders ON DELETE CASCADE)
  - `company_id` (uuid)
  - `approval_level` (int — 1 = first approver, 2 = second, etc.)
  - `approver_role` (text — which role must approve at this level: 'gerente' | 'ceo')
  - `approver_user_id` (uuid — who actually approved/rejected)
  - `status` (text: 'pending' | 'approved' | 'rejected')
  - `comment` (text)
  - `acted_at` (timestamptz)
  - `created_at` (timestamptz DEFAULT now())

### Modified Tables:
- `work_orders` — add `approval_status` column (text: 'none' | 'pending' | 'approved' | 'rejected', default 'none')
  and `requires_approval` column (boolean, default false).

## 3. Report Templates (saved report configurations)

### New Table:
- `report_templates` — saved custom report configs per company.
  - `id` (uuid PK)
  - `company_id` (uuid FK → companies)
  - `name` (text)
  - `report_type` (text)
  - `period_type` (text)
  - `custom_start` (text)
  - `custom_end` (text)
  - `columns` (text[] — which columns to include)
  - `created_by` (uuid)
  - `created_at` (timestamptz DEFAULT now())

## Security
- RLS enabled on all new tables.
- Owner-scoped CRUD via company membership checks (same pattern as existing tables).
- All policies scoped to `authenticated`.
*/

-- ═════════════════════════════════════════════
-- 1. INTEGRATIONS
-- ═════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('sap', 'erp', 'iot_opcua', 'iot_modbus', 'active_directory')),
  name text NOT NULL,
  endpoint_url text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  credentials_encrypted jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  last_sync_at timestamptz,
  sync_status text NOT NULL DEFAULT 'idle',
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_integrations" ON integrations;
CREATE POLICY "select_own_integrations" ON integrations FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = integrations.company_id AND cm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_own_integrations" ON integrations;
CREATE POLICY "insert_own_integrations" ON integrations FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = integrations.company_id AND cm.user_id = auth.uid() AND cm.role IN ('ceo', 'gerente'))
  );

DROP POLICY IF EXISTS "update_own_integrations" ON integrations;
CREATE POLICY "update_own_integrations" ON integrations FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = integrations.company_id AND cm.user_id = auth.uid() AND cm.role IN ('ceo', 'gerente'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = integrations.company_id AND cm.user_id = auth.uid() AND cm.role IN ('ceo', 'gerente'))
  );

DROP POLICY IF EXISTS "delete_own_integrations" ON integrations;
CREATE POLICY "delete_own_integrations" ON integrations FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = integrations.company_id AND cm.user_id = auth.uid() AND cm.role IN ('ceo', 'gerente'))
  );

CREATE TABLE IF NOT EXISTS integration_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  records_synced int NOT NULL DEFAULT 0,
  error_message text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE integration_sync_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_sync_logs" ON integration_sync_logs;
CREATE POLICY "select_own_sync_logs" ON integration_sync_logs FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = integration_sync_logs.company_id AND cm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_own_sync_logs" ON integration_sync_logs;
CREATE POLICY "insert_own_sync_logs" ON integration_sync_logs FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = integration_sync_logs.company_id AND cm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_own_sync_logs" ON integration_sync_logs;
CREATE POLICY "update_own_sync_logs" ON integration_sync_logs FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = integration_sync_logs.company_id AND cm.user_id = auth.uid())
  );

-- ═════════════════════════════════════════════
-- 2. OS APPROVAL FLOW
-- ═════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_orders' AND column_name = 'approval_status') THEN
    ALTER TABLE work_orders ADD COLUMN approval_status text NOT NULL DEFAULT 'none';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_orders' AND column_name = 'requires_approval') THEN
    ALTER TABLE work_orders ADD COLUMN requires_approval boolean NOT NULL DEFAULT false;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS work_order_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  approval_level int NOT NULL DEFAULT 1,
  approver_role text NOT NULL DEFAULT 'gerente',
  approver_user_id uuid,
  status text NOT NULL DEFAULT 'pending',
  comment text,
  acted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE work_order_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_wo_approvals" ON work_order_approvals;
CREATE POLICY "select_own_wo_approvals" ON work_order_approvals FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = work_order_approvals.company_id AND cm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_own_wo_approvals" ON work_order_approvals;
CREATE POLICY "insert_own_wo_approvals" ON work_order_approvals FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = work_order_approvals.company_id AND cm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_own_wo_approvals" ON work_order_approvals;
CREATE POLICY "update_own_wo_approvals" ON work_order_approvals FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = work_order_approvals.company_id AND cm.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = work_order_approvals.company_id AND cm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_own_wo_approvals" ON work_order_approvals;
CREATE POLICY "delete_own_wo_approvals" ON work_order_approvals FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = work_order_approvals.company_id AND cm.user_id = auth.uid() AND cm.role IN ('ceo', 'gerente'))
  );

-- ═════════════════════════════════════════════
-- 3. REPORT TEMPLATES
-- ═════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS report_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  report_type text NOT NULL,
  period_type text NOT NULL DEFAULT 'month',
  custom_start text,
  custom_end text,
  columns text[] NOT NULL DEFAULT '{}',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE report_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_report_templates" ON report_templates;
CREATE POLICY "select_own_report_templates" ON report_templates FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = report_templates.company_id AND cm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_own_report_templates" ON report_templates;
CREATE POLICY "insert_own_report_templates" ON report_templates FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = report_templates.company_id AND cm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_own_report_templates" ON report_templates;
CREATE POLICY "update_own_report_templates" ON report_templates FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = report_templates.company_id AND cm.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = report_templates.company_id AND cm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_own_report_templates" ON report_templates;
CREATE POLICY "delete_own_report_templates" ON report_templates FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = report_templates.company_id AND cm.user_id = auth.uid())
  );

-- Add new tables to realtime
ALTER TABLE integrations REPLICA IDENTITY FULL;
ALTER TABLE integration_sync_logs REPLICA IDENTITY FULL;
ALTER TABLE work_order_approvals REPLICA IDENTITY FULL;
ALTER TABLE report_templates REPLICA IDENTITY FULL;
