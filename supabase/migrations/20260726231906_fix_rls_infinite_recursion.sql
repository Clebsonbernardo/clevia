/*
# Fix infinite recursion in company_members RLS policies

## Problem
Several policies on `company_members` used self-referential subqueries
(`company_id IN (SELECT m.company_id FROM company_members m WHERE ...)`).
Because RLS is evaluated on every query, querying `company_members` from
within a policy on `company_members` re-triggers the same policy, which
queries `company_members` again — infinite recursion. The error surfaced as
"infinite recursion detected in policy for relation company_members".

The `companies` SELECT policy also references `company_members`, which fed
the same cycle.

## Fix

### 1. SECURITY DEFINER helper functions
- `is_company_ceo(company_id, user_id)` — returns true if the given user is a
  `ceo` member of the given company. Runs as the owner (SECURITY DEFINER) so
  it bypasses RLS and breaks the recursion.
- `is_company_owner(company_id, user_id)` — returns true if the given user
  owns the given company (`companies.owner_id`). Also SECURITY DEFINER.

Both are STABLE, set search_path to public, and only read — no side effects.

### 2. Rewrite company_members policies (no self-referential subqueries)
- select_members: `auth.uid() = user_id` (a user reads their own rows).
- insert_members: company owner OR existing CEO of that company (via helpers).
- update_members: existing CEO of that company (via helper).
- delete_members: existing CEO of that company (via helper).

### 3. Rewrite companies SELECT policy (no subquery on company_members)
- Use `is_company_member` helper instead of an inline subquery, so the
  companies policy no longer reaches back into company_members under RLS.
- Added `is_company_member` helper (SECURITY DEFINER) for this.

## Security
- A user can read only their own membership rows.
- Only the company owner or an existing CEO can insert/update/delete members.
- A user can read a company only if they own it or are a member of it.
- No data is lost; only policies change.
*/

-- Helper functions (SECURITY DEFINER to bypass RLS and break recursion)
CREATE OR REPLACE FUNCTION public.is_company_member(check_company_id uuid, check_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members
    WHERE company_id = check_company_id AND user_id = check_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_company_ceo(check_company_id uuid, check_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members
    WHERE company_id = check_company_id AND user_id = check_user_id AND role = 'ceo'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_company_owner(check_company_id uuid, check_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.companies
    WHERE id = check_company_id AND owner_id = check_user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_company_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_company_ceo(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_company_owner(uuid, uuid) TO authenticated;

-- companies SELECT: use helper instead of inline subquery on company_members
DROP POLICY IF EXISTS "select_member_companies" ON public.companies;
CREATE POLICY "select_member_companies" ON public.companies FOR SELECT
  TO authenticated
  USING (
    auth.uid() = owner_id
    OR public.is_company_member(id, auth.uid())
  );

-- company_members: rewrite all policies without self-referential subqueries
DROP POLICY IF EXISTS "select_members" ON public.company_members;
CREATE POLICY "select_members" ON public.company_members FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_members" ON public.company_members;
CREATE POLICY "insert_members" ON public.company_members FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_company_owner(company_id, auth.uid())
    OR public.is_company_ceo(company_id, auth.uid())
  );

DROP POLICY IF EXISTS "update_members" ON public.company_members;
CREATE POLICY "update_members" ON public.company_members FOR UPDATE
  TO authenticated
  USING (public.is_company_ceo(company_id, auth.uid()))
  WITH CHECK (public.is_company_ceo(company_id, auth.uid()));

DROP POLICY IF EXISTS "delete_members" ON public.company_members;
CREATE POLICY "delete_members" ON public.company_members FOR DELETE
  TO authenticated
  USING (public.is_company_ceo(company_id, auth.uid()));
