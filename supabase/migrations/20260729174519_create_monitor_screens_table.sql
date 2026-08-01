/*
# Create monitor_screens table for custom sector screens

## What this does
Creates a new table `monitor_screens` that lets the CEO create unlimited
custom screens (sectors) for the Monitor de Telas. Each screen belongs to a
company and has a name, an icon identifier, and a color.

## New Table: monitor_screens
- id (uuid, primary key)
- company_id (uuid, FK to companies)
- name (text, not null) — display name of the screen
- icon (text) — lucide icon name, defaults to 'Monitor'
- color (text) — tailwind color identifier, defaults to 'sky'
- sort_order (int) — ordering, defaults to 0
- created_at (timestamptz)

## Security
- RLS enabled
- Only authenticated users who are members of the company can SELECT
- Only CEO role can INSERT/UPDATE/DELETE (checked via company_members)
*/

CREATE TABLE IF NOT EXISTS monitor_screens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  icon text NOT NULL DEFAULT 'Monitor',
  color text NOT NULL DEFAULT 'sky',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE monitor_screens ENABLE ROW LEVEL SECURITY;

-- SELECT: any company member can see screens
DROP POLICY IF EXISTS "select_monitor_screens" ON monitor_screens;
CREATE POLICY "select_monitor_screens" ON monitor_screens FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = monitor_screens.company_id
        AND cm.user_id = auth.uid()
    )
  );

-- INSERT: only CEO
DROP POLICY IF EXISTS "insert_monitor_screens_ceo" ON monitor_screens;
CREATE POLICY "insert_monitor_screens_ceo" ON monitor_screens FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = monitor_screens.company_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'ceo'
    )
  );

-- UPDATE: only CEO
DROP POLICY IF EXISTS "update_monitor_screens_ceo" ON monitor_screens;
CREATE POLICY "update_monitor_screens_ceo" ON monitor_screens FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = monitor_screens.company_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'ceo'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = monitor_screens.company_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'ceo'
    )
  );

-- DELETE: only CEO
DROP POLICY IF EXISTS "delete_monitor_screens_ceo" ON monitor_screens;
CREATE POLICY "delete_monitor_screens_ceo" ON monitor_screens FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = monitor_screens.company_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'ceo'
    )
  );

-- Seed default screens for existing companies
INSERT INTO monitor_screens (company_id, name, icon, color, sort_order)
SELECT c.id, s.name, s.icon, s.color, s.sort_order
FROM companies c
CROSS JOIN (VALUES
  ('Corte', 'Scissors', 'rose', 0),
  ('Acabamento', 'Sparkles', 'amber', 1),
  ('Laser', 'Zap', 'cyan', 2),
  ('Lavanderia', 'WashingMachine', 'sky', 3),
  ('Passadoria', 'Shirt', 'violet', 4)
) AS s(name, icon, color, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM monitor_screens ms WHERE ms.company_id = c.id AND ms.name = s.name
);
