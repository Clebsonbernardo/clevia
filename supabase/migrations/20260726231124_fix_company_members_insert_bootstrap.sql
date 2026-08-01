/*
# Fix company_members INSERT policy to allow bootstrap of first CEO

## Problem
The `insert_members` policy on `public.company_members` only allowed inserts
when the authenticated user was ALREADY a `ceo` member of the target company:

    WITH CHECK (company_id IN (
      SELECT m.company_id FROM company_members m
      WHERE m.user_id = auth.uid() AND m.role = 'ceo'
    ))

During onboarding, a newly signed-up user creates a company (they own it via
`companies.owner_id = auth.uid()`) and then inserts themselves as the first
`ceo` member of that company. Because no prior membership exists, the policy
blocks the insert and onboarding fails with "Erro ao criar empresa." (the
company insert succeeds, but the member insert silently fails, then the reload
leaves the user with an orphan company and no membership).

## Fix
Replace `insert_members` so it allows an insert when EITHER:
  1. The user owns the target company (`companies.owner_id = auth.uid()`), OR
  2. The user is already a `ceo` of the target company (existing behavior,
     needed for a CEO to add further members later).

This preserves the existing ability for a CEO to add more members while also
permitting the very first member (the bootstrap CEO) on a company they own.

## Security
- Only the company owner or an existing CEO of that company can insert members.
- No other policies are changed.
*/

DROP POLICY IF EXISTS "insert_members" ON public.company_members;
CREATE POLICY "insert_members" ON public.company_members FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT c.id FROM public.companies c WHERE c.owner_id = auth.uid()
    )
    OR
    company_id IN (
      SELECT m.company_id FROM public.company_members m
      WHERE m.user_id = auth.uid() AND m.role = 'ceo'
    )
  );
