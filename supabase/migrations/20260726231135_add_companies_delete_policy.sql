/*
# Add owner-scoped DELETE policy on companies

## Why
The onboarding cleanup in LoginScreen deletes an orphan company when the
company_members insert fails, so a user can retry without leaving stray rows.
There was no DELETE policy on `companies`, so that cleanup was silently a no-op.

## Security
- Only the company owner (`owner_id = auth.uid()`) can delete a company.
- This matches the ownership already enforced on INSERT.
*/

DROP POLICY IF EXISTS "delete_own_companies" ON public.companies;
CREATE POLICY "delete_own_companies" ON public.companies FOR DELETE
  TO authenticated
  USING (auth.uid() = owner_id);
