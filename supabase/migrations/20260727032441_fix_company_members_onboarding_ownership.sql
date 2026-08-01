/*
# Fix company_members onboarding chicken-and-egg + harden companies insert

## Problem
The `insert_members` RLS policy on `company_members` required the inserting
user to ALREADY be a CEO member of the target company:
  WITH CHECK (company_id IN (SELECT m.company_id FROM company_members m
                            WHERE m.user_id = auth.uid() AND m.role = 'ceo'))
On first signup/onboarding the user has zero membership rows, so the INSERT
always failed with "new row violates row-level security policy" — the company
row was created then immediately deleted by the frontend's rollback path.

## Fix
1. `insert_members` now allows a user to insert a membership row for any
   company they OWN (companies.owner_id = auth.uid()), OR if they are an
   admin. Ownership is set automatically via `DEFAULT auth.uid()` on
   companies.owner_id at company-creation time, so the very first member
   insert (role = 'ceo') for a brand-new company now succeeds.
2. `insert_companies` hardened from `WITH CHECK (true)` to
   `WITH CHECK (auth.uid() = owner_id)` so a user can only create companies
   they own (the DEFAULT auth.uid() still satisfies this for onboarding
   inserts that omit owner_id).
3. `update_members` and `delete_members` likewise broadened to allow the
   company OWNER (not just existing ceo members) to manage members, so a
   brand-new owner can invite/remove people before any other ceo row exists.

## Tables affected
- companies (policy: insert_companies)
- company_members (policies: insert_members, update_members, delete_members)

## Security
- All policies remain scoped TO authenticated.
- Ownership is verified via companies.owner_id = auth.uid().
- is_admin() bypass retained for platform admins.
- No schema/column changes; no data loss.
*/

-- 1) Harden companies INSERT: only the owner can create their company
DROP POLICY IF EXISTS "insert_companies" ON companies;
CREATE POLICY "insert_companies"
ON companies FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = owner_id);

-- 2) Fix company_members INSERT: allow owner of the company (or admin)
--    This resolves the onboarding chicken-and-egg.
DROP POLICY IF EXISTS "insert_members" ON company_members;
CREATE POLICY "insert_members"
ON company_members FOR INSERT
TO authenticated
WITH CHECK (
  company_id IN (SELECT id FROM companies WHERE owner_id = auth.uid())
  OR is_admin()
);

-- 3) Broaden UPDATE on members to company owner (not just existing ceo)
DROP POLICY IF EXISTS "update_members" ON company_members;
CREATE POLICY "update_members"
ON company_members FOR UPDATE
TO authenticated
USING (
  company_id IN (SELECT id FROM companies WHERE owner_id = auth.uid())
  OR company_id IN (SELECT m.company_id FROM company_members m
                     WHERE m.user_id = auth.uid() AND m.role = 'ceo')
  OR is_admin()
)
WITH CHECK (
  company_id IN (SELECT id FROM companies WHERE owner_id = auth.uid())
  OR company_id IN (SELECT m.company_id FROM company_members m
                     WHERE m.user_id = auth.uid() AND m.role = 'ceo')
  OR is_admin()
);

-- 4) Broaden DELETE on members to company owner (not just existing ceo)
DROP POLICY IF EXISTS "delete_members" ON company_members;
CREATE POLICY "delete_members"
ON company_members FOR DELETE
TO authenticated
USING (
  company_id IN (SELECT id FROM companies WHERE owner_id = auth.uid())
  OR company_id IN (SELECT m.company_id FROM company_members m
                     WHERE m.user_id = auth.uid() AND m.role = 'ceo')
  OR is_admin()
);