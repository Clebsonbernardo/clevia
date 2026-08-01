/*
# Fix companies SELECT policy to allow owner to read their own company

## Problem
The `select_member_companies` policy only allowed reading a company when the
user was already a member of it (via `company_members`). During onboarding,
the flow is: INSERT company -> SELECT it back -> INSERT company_members row.
The SELECT between the two inserts returned zero rows because no membership
existed yet, so `.single()` threw and onboarding reported "Erro ao criar empresa."

## Fix
Broaden the SELECT policy to also allow the company owner
(`companies.owner_id = auth.uid()`) to read the row. Membership-based access
is preserved via the OR branch.

## Security
- A user can read a company only if they own it OR are a member of it.
- No other policies are changed.
*/

DROP POLICY IF EXISTS "select_member_companies" ON public.companies;
CREATE POLICY "select_member_companies" ON public.companies FOR SELECT
  TO authenticated
  USING (
    auth.uid() = owner_id
    OR id IN (
      SELECT company_members.company_id
      FROM public.company_members
      WHERE company_members.user_id = auth.uid()
    )
  );
