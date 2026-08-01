/*
# Fix companies UPDATE policy to use helper function

## Problem
The `update_own_companies` policy on `companies` still used an inline subquery
on `company_members` (`id IN (SELECT company_members.company_id FROM ...)`).
While this no longer causes infinite recursion (the `select_members` policy
was rewritten to `auth.uid() = user_id`), it is inconsistent with the other
policies that use SECURITY DEFINER helpers, and it omits the company owner
from being able to update their own company (only CEOs can currently).

## Fix
Rewrite `update_own_companies` to use the `is_company_owner` and
`is_company_ceo` helper functions, and add `is_admin()` for the platform
admin. This lets a company owner update their company even if they haven't
added themselves as a CEO member yet (important for onboarding).

## Security
- Only the company owner, a CEO member, or the platform admin can update
  a company record.
- No data is lost; only policies change.
*/

DROP POLICY IF EXISTS "update_own_companies" ON public.companies;
CREATE POLICY "update_own_companies" ON public.companies FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = owner_id
    OR public.is_company_ceo(id, auth.uid())
    OR public.is_admin()
  )
  WITH CHECK (
    auth.uid() = owner_id
    OR public.is_company_ceo(id, auth.uid())
    OR public.is_admin()
  );