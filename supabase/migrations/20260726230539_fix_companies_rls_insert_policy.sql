/*
# Fix RLS INSERT policy on companies table

## Problem
The `insert_companies` policy on `public.companies` used `WITH CHECK (true)`,
which allows any authenticated user to insert any company row with no ownership
verification. This effectively bypasses row-level security for INSERT.

## Changes

### 1. New column
- `companies.owner_id` (uuid) — the user who created/owns the company.
  Defaults to `auth.uid()` so frontend inserts that omit `owner_id` are still
  attributed to the authenticated session.

### 2. Backfill existing rows
- Existing `companies` rows get `owner_id` set from the `company_members` row
  with role `ceo` for that company. Rows with no ceo member are left NULL and
  are later set to a sentinel-free state; since the column ends up NOT NULL,
  any orphan rows without a ceo are assigned their first member as owner.

### 3. RLS policy fix
- Drop and recreate `insert_companies` with
  `WITH CHECK (auth.uid() = owner_id)` so only the authenticated owner can
  insert a row attributed to themselves.

## Security
- INSERT on `companies` now requires `auth.uid() = owner_id`.
- No other policies are changed.
*/

-- 1. Add owner_id column (nullable first so existing rows don't fail)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS owner_id uuid;

-- 2. Backfill: set owner_id from the ceo member of each company
UPDATE public.companies c
SET owner_id = sub.owner_id
FROM (
  SELECT DISTINCT ON (company_id) company_id, user_id AS owner_id
  FROM public.company_members
  WHERE role = 'ceo'
  ORDER BY company_id, created_at
) sub
WHERE c.owner_id IS NULL AND sub.company_id = c.id;

-- 3. For any rows still missing an owner, fall back to the first member
UPDATE public.companies c
SET owner_id = sub.owner_id
FROM (
  SELECT DISTINCT ON (company_id) company_id, user_id AS owner_id
  FROM public.company_members
  ORDER BY company_id, created_at
) sub
WHERE c.owner_id IS NULL AND sub.company_id = c.id;

-- 4. Enforce NOT NULL and default to auth.uid() for future inserts
ALTER TABLE public.companies
  ALTER COLUMN owner_id SET DEFAULT auth.uid();

ALTER TABLE public.companies
  ALTER COLUMN owner_id SET NOT NULL;

-- 5. Replace the insecure INSERT policy with an ownership-scoped one
DROP POLICY IF EXISTS "insert_companies" ON public.companies;
CREATE POLICY "insert_companies" ON public.companies FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);
