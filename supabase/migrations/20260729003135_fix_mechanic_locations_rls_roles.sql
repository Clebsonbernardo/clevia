/*
# Fix mechanic_locations RLS to use actual roles

The system uses 'ceo' and 'gerente' roles (not 'supervisor').
Update the SELECT policy to match the real role names.
*/

DROP POLICY IF EXISTS "read_company_locations" ON mechanic_locations;

CREATE POLICY "read_company_locations"
ON mechanic_locations FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = mechanic_locations.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('ceo', 'gerente')
  )
);
