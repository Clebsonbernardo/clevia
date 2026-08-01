/*
# Create ceo_grants table for CEO permission delegation

## What this does
Creates a new table `ceo_grants` that allows the CEO to grant special permissions
to any user in the company. This is a CEO-exclusive feature — only the CEO can
create, modify, or delete grants. Other users can only read grants that affect them.

## New Table: ceo_grants
- id (uuid, primary key)
- company_id (uuid, FK to companies)
- user_id (uuid, FK to auth.users) — the user receiving the grant
- permission_key (text) — e.g. 'manage_screens', 'edit_screens', 'delete_screens'
- granted_by (uuid, FK to auth.users) — the CEO who granted it
- granted (boolean, default true) — whether the grant is active
- created_at (timestamptz)

## Security
- RLS enabled
- Any company member can SELECT grants for their company
- Only CEO can INSERT/UPDATE/DELETE grants
*/

CREATE TABLE IF NOT EXISTS ceo_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_key text NOT NULL,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  granted boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ceo_grants ENABLE ROW LEVEL SECURITY;

-- SELECT: any company member can see grants
DROP POLICY IF EXISTS "select_ceo_grants" ON ceo_grants;
CREATE POLICY "select_ceo_grants" ON ceo_grants FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = ceo_grants.company_id
        AND cm.user_id = auth.uid()
    )
  );

-- INSERT: only CEO
DROP POLICY IF EXISTS "insert_ceo_grants_ceo" ON ceo_grants;
CREATE POLICY "insert_ceo_grants_ceo" ON ceo_grants FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = ceo_grants.company_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'ceo'
    )
  );

-- UPDATE: only CEO
DROP POLICY IF EXISTS "update_ceo_grants_ceo" ON ceo_grants;
CREATE POLICY "update_ceo_grants_ceo" ON ceo_grants FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = ceo_grants.company_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'ceo'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = ceo_grants.company_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'ceo'
    )
  );

-- DELETE: only CEO
DROP POLICY IF EXISTS "delete_ceo_grants_ceo" ON ceo_grants;
CREATE POLICY "delete_ceo_grants_ceo" ON ceo_grants FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = ceo_grants.company_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'ceo'
    )
  );

CREATE INDEX IF NOT EXISTS idx_ceo_grants_company ON ceo_grants(company_id);
CREATE INDEX IF NOT EXISTS idx_ceo_grants_user ON ceo_grants(user_id);
CREATE INDEX IF NOT EXISTS idx_ceo_grants_permission ON ceo_grants(permission_key);
