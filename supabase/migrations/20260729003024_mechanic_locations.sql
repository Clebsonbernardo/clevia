/*
# Mechanic real-time location tracking

1. New Tables
- `mechanic_locations`
  - `id` (uuid, primary key)
  - `company_id` (uuid, references companies)
  - `user_id` (uuid, references auth.users — the mechanic's user account)
  - `mechanic_id` (uuid, references mechanics — the mechanic profile)
  - `latitude` (double precision, not null)
  - `longitude` (double precision, not null)
  - `accuracy_meters` (double precision, nullable — GPS accuracy)
  - `heading` (double precision, nullable — direction of travel in degrees)
  - `speed` (double precision, nullable — speed in m/s)
  - `updated_at` (timestamptz, default now() — last location update time)
  - `created_at` (timestamptz, default now())
2. Security
- Enable RLS on `mechanic_locations`.
- Mechanics (authenticated) can insert/update their own location rows (auth.uid() = user_id).
- CEO, gerente, supervisor can read all locations within their company.
- Mechanics can read their own location.
3. Indexes
- Index on `company_id` for efficient company-scoped queries.
- Index on `user_id` for efficient own-location queries.
4. Notes
- Each mechanic has at most one row (upsert by user_id).
- The `updated_at` column is used to determine if a location is "stale" (no update for > 5 minutes).
- Realtime is enabled on this table so supervisors see live position updates.
*/

CREATE TABLE IF NOT EXISTS mechanic_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  mechanic_id uuid REFERENCES mechanics(id) ON DELETE SET NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  accuracy_meters double precision,
  heading double precision,
  speed double precision,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One location row per mechanic (upsert by user_id within a company)
CREATE UNIQUE INDEX IF NOT EXISTS mechanic_locations_user_company_idx
  ON mechanic_locations(user_id, company_id);

CREATE INDEX IF NOT EXISTS mechanic_locations_company_idx
  ON mechanic_locations(company_id);

ALTER TABLE mechanic_locations ENABLE ROW LEVEL SECURITY;

-- Mechanics can insert their own location
DROP POLICY IF EXISTS "insert_own_location" ON mechanic_locations;
CREATE POLICY "insert_own_location"
ON mechanic_locations FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Mechanics can update their own location
DROP POLICY IF EXISTS "update_own_location" ON mechanic_locations;
CREATE POLICY "update_own_location"
ON mechanic_locations FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Company members can read locations within their company
-- (CEO, gerente, supervisor see all mechanics; mechanics see their own)
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
    AND cm.role IN ('ceo', 'gerente', 'supervisor')
  )
);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE mechanic_locations;
