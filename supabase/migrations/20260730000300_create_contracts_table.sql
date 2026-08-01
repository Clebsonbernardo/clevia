/*
# Create contracts table

1. New Tables
- `contracts`
  - `id` (uuid, primary key)
  - `company_id` (uuid, FK to companies)
  - `contract_number` (text, unique, auto-generated like CTR-2026-001)
  - `plan` (text: 'trial' | 'paid')
  - `monthly_fee` (numeric, nullable)
  - `duration_months` (integer, default 12)
  - `start_date` (date)
  - `end_date` (date)
  - `client_name` (text, name of the responsible person)
  - `client_email` (text)
  - `client_cpf` (text, nullable)
  - `status` (text: 'draft' | 'sent' | 'signed' | 'expired' | 'canceled', default 'draft')
  - `notes` (text, nullable)
  - `created_by` (uuid, FK to auth.users, nullable)
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())
2. Security
  - Enable RLS on `contracts`.
  - Admin-only access (the software administrator manages contracts).
  - Uses a helper to check admin via email match on auth.users.
3. Notes
  - Auto-generates contract_number via a trigger.
*/

CREATE TABLE IF NOT EXISTS contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contract_number text UNIQUE,
  plan text NOT NULL DEFAULT 'paid' CHECK (plan IN ('trial', 'paid')),
  monthly_fee numeric(10,2),
  duration_months integer NOT NULL DEFAULT 12,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '12 months'),
  client_name text,
  client_email text,
  client_cpf text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'signed', 'expired', 'canceled')),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

-- Helper function to check if current user is the admin (by email)
CREATE OR REPLACE FUNCTION is_clevia_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid() AND email = 'clebsonbernardovelho@gmail.com'
  );
$$;

DROP POLICY IF EXISTS "admin_select_contracts" ON contracts;
CREATE POLICY "admin_select_contracts" ON contracts FOR SELECT
  TO authenticated USING (is_clevia_admin());

DROP POLICY IF EXISTS "admin_insert_contracts" ON contracts;
CREATE POLICY "admin_insert_contracts" ON contracts FOR INSERT
  TO authenticated WITH CHECK (is_clevia_admin());

DROP POLICY IF EXISTS "admin_update_contracts" ON contracts;
CREATE POLICY "admin_update_contracts" ON contracts FOR UPDATE
  TO authenticated USING (is_clevia_admin()) WITH CHECK (is_clevia_admin());

DROP POLICY IF EXISTS "admin_delete_contracts" ON contracts;
CREATE POLICY "admin_delete_contracts" ON contracts FOR DELETE
  TO authenticated USING (is_clevia_admin());

-- Auto-generate contract number
CREATE OR REPLACE FUNCTION generate_contract_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_num integer;
  year_str text;
BEGIN
  year_str := EXTRACT(YEAR FROM NEW.created_at)::text;
  SELECT COALESCE(MAX(num), 0) + 1 INTO next_num
  FROM (
    SELECT CAST(SUBSTRING(contract_number FROM 5) AS integer) AS num
    FROM contracts
    WHERE contract_number LIKE 'CTR-' || year_str || '-%'
  ) sub;
  NEW.contract_number := 'CTR-' || year_str || '-' || LPAD(next_num::text, 4, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_contract_number ON contracts;
CREATE TRIGGER trg_generate_contract_number
  BEFORE INSERT ON contracts
  FOR EACH ROW
  EXECUTE FUNCTION generate_contract_number();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_contracts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contracts_updated_at ON contracts;
CREATE TRIGGER trg_contracts_updated_at
  BEFORE UPDATE ON contracts
  FOR EACH ROW
  EXECUTE FUNCTION update_contracts_updated_at();
