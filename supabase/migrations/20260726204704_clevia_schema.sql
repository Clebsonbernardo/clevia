/*
# CLEVIA - Schema de Gerenciamento de Manutenção

## Visão Geral
Cria as tabelas base do software CLEVIA (CMMS em nuvem): ativos/equipamentos,
ordens de serviço, técnicos e planos de manutenção. Cada usuário autenticado
gerencia apenas seus próprios dados.

## Novas Tabelas
1. `assets` - Ativos/equipamentos cadastrados pelo usuário
   - id (uuid, pk)
   - user_id (uuid, dono, default auth.uid())
   - name (text) - nome do equipamento
   - code (text) - código/tag do ativo
   - location (text) - localização
   - category (text) - categoria
   - status (text) - status operacional (operacional, parado, manutencao)
   - criticality (text) - criticidade (alta, media, baixa)
   - purchase_date (date) - data de aquisição
   - created_at (timestamptz)

2. `work_orders` - Ordens de serviço de manutenção
   - id (uuid, pk)
   - user_id (uuid, dono, default auth.uid())
   - asset_id (uuid, fk para assets)
   - title (text) - título da OS
   - description (text) - descrição
   - status (text) - aberta, em_andamento, concluida, cancelada
   - priority (text) - baixa, media, alta, critica
   - type (text) - preventiva, corretiva, preditiva
   - assigned_to (text) - técnico responsável
   - created_at, scheduled_date, completed_at (timestamptz)

3. `technicians` - Técnicos de manutenção
   - id (uuid, pk)
   - user_id (uuid, dono, default auth.uid())
   - name (text)
   - specialty (text) - especialidade
   - phone (text)
   - email (text)
   - status (text) - ativo, inativo
   - created_at (timestamptz)

## Segurança
- RLS habilitado em todas as tabelas
- Políticas owner-scoped (auth.uid() = user_id) para CRUD
- user_id com DEFAULT auth.uid() para inserts do frontend
*/

CREATE TABLE IF NOT EXISTS assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  location text,
  category text,
  status text NOT NULL DEFAULT 'operacional',
  criticality text NOT NULL DEFAULT 'media',
  purchase_date date,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_assets" ON assets;
CREATE POLICY "select_own_assets" ON assets FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_assets" ON assets;
CREATE POLICY "insert_own_assets" ON assets FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_assets" ON assets;
CREATE POLICY "update_own_assets" ON assets FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_assets" ON assets;
CREATE POLICY "delete_own_assets" ON assets FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'aberta',
  priority text NOT NULL DEFAULT 'media',
  type text NOT NULL DEFAULT 'corretiva',
  assigned_to text,
  created_at timestamptz DEFAULT now(),
  scheduled_date timestamptz,
  completed_at timestamptz
);

ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_work_orders" ON work_orders;
CREATE POLICY "select_own_work_orders" ON work_orders FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_work_orders" ON work_orders;
CREATE POLICY "insert_own_work_orders" ON work_orders FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_work_orders" ON work_orders;
CREATE POLICY "update_own_work_orders" ON work_orders FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_work_orders" ON work_orders;
CREATE POLICY "delete_own_work_orders" ON work_orders FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS technicians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  specialty text,
  phone text,
  email text,
  status text NOT NULL DEFAULT 'ativo',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE technicians ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_technicians" ON technicians;
CREATE POLICY "select_own_technicians" ON technicians FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_technicians" ON technicians;
CREATE POLICY "insert_own_technicians" ON technicians FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_technicians" ON technicians;
CREATE POLICY "update_own_technicians" ON technicians FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_technicians" ON technicians;
CREATE POLICY "delete_own_technicians" ON technicians FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_assets_user_id ON assets(user_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_user_id ON work_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders(status);
CREATE INDEX IF NOT EXISTS idx_technicians_user_id ON technicians(user_id);
