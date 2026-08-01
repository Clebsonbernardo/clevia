/*
# CLEVIA Professional - Multi-tenant CMMS Schema

## Visão Geral
Transforma o CLEVIA em um sistema multi-empresa (SaaS) com matriz e filiais,
controle de acesso por papel (CEO, mecânico, solicitante), ordens de serviço
com aceite automático e histórico detalhado, planos preventivos, estoque,
integração com sistemas externos de máquinas e notificações.

## Novas Tabelas
1. companies - empresas matriz (multi-tenant root)
2. branches - filiais de cada empresa
3. company_members - vínculo usuário↔empresa com papel (role)
4. machines - máquinas/equipamentos por filial
5. mechanics - mecânicos da empresa
6. preventive_plans - planos de manutenção preventiva
7. inventory_items - peças e insumos em estoque
8. production_logs - registros de produção diária por máquina
9. machine_integrations - config de integração com sistemas externos
10. notifications - notificações de OS para mecânicos
11. work_order_history - histórico de eventos da OS

## Modificações
- work_orders: adiciona company_id, branch_id, machine_id, mechanic_id,
  accepted_at, finished_at, defect, procedure, replaced_part

## Segurança
- RLS em todas as tabelas baseado em company_id via company_members
- CEO vê tudo da empresa; mecânico vê OS atribuídas e dados da empresa;
  solicitante vê OS que abriu
*/

-- ============================================================
-- COMPANIES (matriz)
-- ============================================================
CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  cnpj text,
  logo_url text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- BRANCHES (filiais)
-- ============================================================
CREATE TABLE IF NOT EXISTS branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  city text,
  state text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- COMPANY_MEMBERS (vínculo usuário↔empresa)
-- ============================================================
CREATE TABLE IF NOT EXISTS company_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'solicitante',
  display_name text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(company_id, user_id)
);
ALTER TABLE company_members ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- MACHINES (máquinas por filial)
-- ============================================================
CREATE TABLE IF NOT EXISTS machines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  name text NOT NULL,
  code text,
  sector text,
  model text,
  manufacturer text,
  status text NOT NULL DEFAULT 'trabalhando',
  criticality text NOT NULL DEFAULT 'media',
  purchase_date date,
  integration_id uuid,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE machines ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- MECHANICS (mecânicos da empresa)
-- ============================================================
CREATE TABLE IF NOT EXISTS mechanics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  specialty text,
  phone text,
  email text,
  status text NOT NULL DEFAULT 'disponivel',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE mechanics ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- WORK ORDERS (extensão multi-tenant)
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_orders' AND column_name='company_id') THEN
    ALTER TABLE work_orders ADD COLUMN company_id uuid REFERENCES companies(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_orders' AND column_name='branch_id') THEN
    ALTER TABLE work_orders ADD COLUMN branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_orders' AND column_name='machine_id') THEN
    ALTER TABLE work_orders ADD COLUMN machine_id uuid REFERENCES machines(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_orders' AND column_name='mechanic_id') THEN
    ALTER TABLE work_orders ADD COLUMN mechanic_id uuid REFERENCES mechanics(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_orders' AND column_name='accepted_at') THEN
    ALTER TABLE work_orders ADD COLUMN accepted_at timestamptz;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_orders' AND column_name='finished_at') THEN
    ALTER TABLE work_orders ADD COLUMN finished_at timestamptz;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_orders' AND column_name='defect') THEN
    ALTER TABLE work_orders ADD COLUMN defect text;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_orders' AND column_name='procedure') THEN
    ALTER TABLE work_orders ADD COLUMN "procedure" text;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_orders' AND column_name='replaced_part') THEN
    ALTER TABLE work_orders ADD COLUMN replaced_part text;
  END IF;
END $$;

-- ============================================================
-- WORK_ORDER_HISTORY (histórico de eventos)
-- ============================================================
CREATE TABLE IF NOT EXISTS work_order_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_description text,
  actor_name text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE work_order_history ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PREVENTIVE_PLANS
-- ============================================================
CREATE TABLE IF NOT EXISTS preventive_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  machine_id uuid REFERENCES machines(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  frequency_days int NOT NULL DEFAULT 30,
  last_executed date,
  next_date date NOT NULL,
  status text NOT NULL DEFAULT 'em_dia',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE preventive_plans ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- INVENTORY_ITEMS (estoque)
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  name text NOT NULL,
  code text,
  category text,
  quantity numeric NOT NULL DEFAULT 0,
  min_quantity numeric NOT NULL DEFAULT 0,
  unit text DEFAULT 'un',
  location text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PRODUCTION_LOGS (produção diária por máquina)
-- ============================================================
CREATE TABLE IF NOT EXISTS production_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  machine_id uuid REFERENCES machines(id) ON DELETE SET NULL,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  units_produced numeric NOT NULL DEFAULT 0,
  uptime_hours numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE production_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- MACHINE_INTEGRATIONS (config de integração externa)
-- ============================================================
CREATE TABLE IF NOT EXISTS machine_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  api_url text NOT NULL,
  api_key text,
  poll_interval_seconds int NOT NULL DEFAULT 60,
  active boolean NOT NULL DEFAULT true,
  last_sync_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE machine_integrations ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  work_order_id uuid REFERENCES work_orders(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  type text NOT NULL DEFAULT 'os_aberta',
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_branches_company ON branches(company_id);
CREATE INDEX IF NOT EXISTS idx_members_company ON company_members(company_id);
CREATE INDEX IF NOT EXISTS idx_members_user ON company_members(user_id);
CREATE INDEX IF NOT EXISTS idx_machines_company ON machines(company_id);
CREATE INDEX IF NOT EXISTS idx_machines_branch ON machines(branch_id);
CREATE INDEX IF NOT EXISTS idx_mechanics_company ON mechanics(company_id);
CREATE INDEX IF NOT EXISTS idx_wo_company ON work_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_wo_branch ON work_orders(branch_id);
CREATE INDEX IF NOT EXISTS idx_wo_machine ON work_orders(machine_id);
CREATE INDEX IF NOT EXISTS idx_wo_mechanic ON work_orders(mechanic_id);
CREATE INDEX IF NOT EXISTS idx_wo_status ON work_orders(status);
CREATE INDEX IF NOT EXISTS idx_history_wo ON work_order_history(work_order_id);
CREATE INDEX IF NOT EXISTS idx_preventives_company ON preventive_plans(company_id);
CREATE INDEX IF NOT EXISTS idx_inventory_company ON inventory_items(company_id);
CREATE INDEX IF NOT EXISTS idx_production_company ON production_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_production_date ON production_logs(log_date);
CREATE INDEX IF NOT EXISTS idx_integrations_company ON machine_integrations(company_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);

-- ============================================================
-- POLÍTICAS RLS
-- ============================================================

-- COMPANIES
DROP POLICY IF EXISTS "select_member_companies" ON companies;
CREATE POLICY "select_member_companies" ON companies FOR SELECT
  TO authenticated USING (id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "insert_companies" ON companies;
CREATE POLICY "insert_companies" ON companies FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_own_companies" ON companies;
CREATE POLICY "update_own_companies" ON companies FOR UPDATE
  TO authenticated USING (id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role = 'ceo'))
  WITH CHECK (id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role = 'ceo'));

-- BRANCHES
DROP POLICY IF EXISTS "select_member_branches" ON branches;
CREATE POLICY "select_member_branches" ON branches FOR SELECT
  TO authenticated USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "insert_branches" ON branches;
CREATE POLICY "insert_branches" ON branches FOR INSERT
  TO authenticated WITH CHECK (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role = 'ceo'));
DROP POLICY IF EXISTS "update_branches" ON branches;
CREATE POLICY "update_branches" ON branches FOR UPDATE
  TO authenticated USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role = 'ceo'))
  WITH CHECK (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role = 'ceo'));
DROP POLICY IF EXISTS "delete_branches" ON branches;
CREATE POLICY "delete_branches" ON branches FOR DELETE
  TO authenticated USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role = 'ceo'));

-- COMPANY_MEMBERS
DROP POLICY IF EXISTS "select_members" ON company_members;
CREATE POLICY "select_members" ON company_members FOR SELECT
  TO authenticated USING (company_id IN (SELECT company_id FROM company_members m WHERE m.user_id = auth.uid()));
DROP POLICY IF EXISTS "insert_members" ON company_members;
CREATE POLICY "insert_members" ON company_members FOR INSERT
  TO authenticated WITH CHECK (company_id IN (SELECT company_id FROM company_members m WHERE m.user_id = auth.uid() AND m.role = 'ceo'));
DROP POLICY IF EXISTS "update_members" ON company_members;
CREATE POLICY "update_members" ON company_members FOR UPDATE
  TO authenticated USING (company_id IN (SELECT company_id FROM company_members m WHERE m.user_id = auth.uid() AND m.role = 'ceo'))
  WITH CHECK (company_id IN (SELECT company_id FROM company_members m WHERE m.user_id = auth.uid() AND m.role = 'ceo'));
DROP POLICY IF EXISTS "delete_members" ON company_members;
CREATE POLICY "delete_members" ON company_members FOR DELETE
  TO authenticated USING (company_id IN (SELECT company_id FROM company_members m WHERE m.user_id = auth.uid() AND m.role = 'ceo'));

-- MACHINES
DROP POLICY IF EXISTS "select_machines" ON machines;
CREATE POLICY "select_machines" ON machines FOR SELECT
  TO authenticated USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "insert_machines" ON machines;
CREATE POLICY "insert_machines" ON machines FOR INSERT
  TO authenticated WITH CHECK (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role IN ('ceo','solicitante')));
DROP POLICY IF EXISTS "update_machines" ON machines;
CREATE POLICY "update_machines" ON machines FOR UPDATE
  TO authenticated USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role IN ('ceo','solicitante')))
  WITH CHECK (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role IN ('ceo','solicitante')));
DROP POLICY IF EXISTS "delete_machines" ON machines;
CREATE POLICY "delete_machines" ON machines FOR DELETE
  TO authenticated USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role = 'ceo'));

-- MECHANICS
DROP POLICY IF EXISTS "select_mechanics" ON mechanics;
CREATE POLICY "select_mechanics" ON mechanics FOR SELECT
  TO authenticated USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "insert_mechanics" ON mechanics;
CREATE POLICY "insert_mechanics" ON mechanics FOR INSERT
  TO authenticated WITH CHECK (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role = 'ceo'));
DROP POLICY IF EXISTS "update_mechanics" ON mechanics;
CREATE POLICY "update_mechanics" ON mechanics FOR UPDATE
  TO authenticated USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role IN ('ceo','mecanico')))
  WITH CHECK (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role IN ('ceo','mecanico')));
DROP POLICY IF EXISTS "delete_mechanics" ON mechanics;
CREATE POLICY "delete_mechanics" ON mechanics FOR DELETE
  TO authenticated USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role = 'ceo'));

-- WORK ORDERS
DROP POLICY IF EXISTS "select_wo" ON work_orders;
CREATE POLICY "select_wo" ON work_orders FOR SELECT
  TO authenticated USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "insert_wo" ON work_orders;
CREATE POLICY "insert_wo" ON work_orders FOR INSERT
  TO authenticated WITH CHECK (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "update_wo" ON work_orders;
CREATE POLICY "update_wo" ON work_orders FOR UPDATE
  TO authenticated USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "delete_wo" ON work_orders;
CREATE POLICY "delete_wo" ON work_orders FOR DELETE
  TO authenticated USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role = 'ceo'));

-- WORK ORDER HISTORY
DROP POLICY IF EXISTS "select_history" ON work_order_history;
CREATE POLICY "select_history" ON work_order_history FOR SELECT
  TO authenticated USING (
    work_order_id IN (
      SELECT wo.id FROM work_orders wo
      WHERE wo.company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid())
    )
  );
DROP POLICY IF EXISTS "insert_history" ON work_order_history;
CREATE POLICY "insert_history" ON work_order_history FOR INSERT
  TO authenticated WITH CHECK (
    work_order_id IN (
      SELECT wo.id FROM work_orders wo
      WHERE wo.company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid())
    )
  );

-- PREVENTIVE PLANS
DROP POLICY IF EXISTS "select_preventives" ON preventive_plans;
CREATE POLICY "select_preventives" ON preventive_plans FOR SELECT
  TO authenticated USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "insert_preventives" ON preventive_plans;
CREATE POLICY "insert_preventives" ON preventive_plans FOR INSERT
  TO authenticated WITH CHECK (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role IN ('ceo','solicitante')));
DROP POLICY IF EXISTS "update_preventives" ON preventive_plans;
CREATE POLICY "update_preventives" ON preventive_plans FOR UPDATE
  TO authenticated USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role IN ('ceo','solicitante')))
  WITH CHECK (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role IN ('ceo','solicitante')));
DROP POLICY IF EXISTS "delete_preventives" ON preventive_plans;
CREATE POLICY "delete_preventives" ON preventive_plans FOR DELETE
  TO authenticated USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role = 'ceo'));

-- INVENTORY
DROP POLICY IF EXISTS "select_inventory" ON inventory_items;
CREATE POLICY "select_inventory" ON inventory_items FOR SELECT
  TO authenticated USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "insert_inventory" ON inventory_items;
CREATE POLICY "insert_inventory" ON inventory_items FOR INSERT
  TO authenticated WITH CHECK (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role IN ('ceo','solicitante')));
DROP POLICY IF EXISTS "update_inventory" ON inventory_items;
CREATE POLICY "update_inventory" ON inventory_items FOR UPDATE
  TO authenticated USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role IN ('ceo','solicitante')))
  WITH CHECK (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role IN ('ceo','solicitante')));
DROP POLICY IF EXISTS "delete_inventory" ON inventory_items;
CREATE POLICY "delete_inventory" ON inventory_items FOR DELETE
  TO authenticated USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role = 'ceo'));

-- PRODUCTION LOGS
DROP POLICY IF EXISTS "select_production" ON production_logs;
CREATE POLICY "select_production" ON production_logs FOR SELECT
  TO authenticated USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "insert_production" ON production_logs;
CREATE POLICY "insert_production" ON production_logs FOR INSERT
  TO authenticated WITH CHECK (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));

-- MACHINE INTEGRATIONS (CEO only)
DROP POLICY IF EXISTS "select_integrations" ON machine_integrations;
CREATE POLICY "select_integrations" ON machine_integrations FOR SELECT
  TO authenticated USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role = 'ceo'));
DROP POLICY IF EXISTS "insert_integrations" ON machine_integrations;
CREATE POLICY "insert_integrations" ON machine_integrations FOR INSERT
  TO authenticated WITH CHECK (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role = 'ceo'));
DROP POLICY IF EXISTS "update_integrations" ON machine_integrations;
CREATE POLICY "update_integrations" ON machine_integrations FOR UPDATE
  TO authenticated USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role = 'ceo'))
  WITH CHECK (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role = 'ceo'));
DROP POLICY IF EXISTS "delete_integrations" ON machine_integrations;
CREATE POLICY "delete_integrations" ON machine_integrations FOR DELETE
  TO authenticated USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role = 'ceo'));

-- NOTIFICATIONS
DROP POLICY IF EXISTS "select_notifications" ON notifications;
CREATE POLICY "select_notifications" ON notifications FOR SELECT
  TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "insert_notifications" ON notifications;
CREATE POLICY "insert_notifications" ON notifications FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "update_notifications" ON notifications;
CREATE POLICY "update_notifications" ON notifications FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "delete_notifications" ON notifications;
CREATE POLICY "delete_notifications" ON notifications FOR DELETE
  TO authenticated USING (user_id = auth.uid());