/*
# Create app_settings table for VAPID push keys

1. Purpose
   Stores app-level configuration like VAPID push notification keys that
   edge functions need to read at runtime.
2. New Tables
   - `app_settings`
     - `key` (text, primary key identifier)
     - `value` (text, the setting value)
     - `created_at` (timestamptz)
3. Security
   - RLS enabled.
   - Only authenticated users can read settings (they need the public key to subscribe).
   - No one can insert/update/delete from the client (managed via migrations only).
*/

CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_app_settings" ON app_settings;
CREATE POLICY "read_app_settings" ON app_settings FOR SELECT
  TO authenticated USING (true);

INSERT INTO app_settings (key, value) VALUES
  ('vapid_public_key', 'BD8q46cf03WPYVOUmvTjbJg1PBfHT6U1pgT09ZMJBDPfS0wiF7eF6RnQ_xV7NLedh0RtkX73Kz02bGJiy5kZNVo'),
  ('vapid_private_key', '4-dDmCtMLEeENAqL7P4rQxrsKWV2nqco0iu_mJf09CE')
ON CONFLICT (key) DO NOTHING;
