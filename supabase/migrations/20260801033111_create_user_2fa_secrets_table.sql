/*
# Create user_2fa_secrets table for server-side TOTP storage

1. New Tables
- `user_2fa_secrets`
  - `id` (uuid, primary key)
  - `user_id` (uuid, not null, references auth.users, unique — one secret per user)
  - `secret` (text, not null — base32-encoded TOTP secret)
  - `enabled` (boolean, default false — true once user verifies a code)
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())
2. Security
- Enable RLS on `user_2fa_secrets`
- Only the authenticated owner can SELECT, INSERT, UPDATE, DELETE their own row
3. Important Notes
- Replaces the previous localStorage-based 2FA which was client-side only and not real security
- The secret is stored per-user and can only be accessed by the owning user
*/

CREATE TABLE IF NOT EXISTS user_2fa_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  secret text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_2fa_secrets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_2fa" ON user_2fa_secrets;
CREATE POLICY "select_own_2fa" ON user_2fa_secrets FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_2fa" ON user_2fa_secrets;
CREATE POLICY "insert_own_2fa" ON user_2fa_secrets FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_2fa" ON user_2fa_secrets;
CREATE POLICY "update_own_2fa" ON user_2fa_secrets FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_2fa" ON user_2fa_secrets;
CREATE POLICY "delete_own_2fa" ON user_2fa_secrets FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
