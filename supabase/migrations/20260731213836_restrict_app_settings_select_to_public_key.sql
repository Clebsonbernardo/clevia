-- app_settings guarda a chave privada VAPID; qualquer usuário autenticado podia lê-la.
-- O cliente só precisa da chave pública. As edge functions usam service role e ignoram RLS.
DROP POLICY IF EXISTS read_app_settings ON app_settings;

CREATE POLICY read_app_settings_public_key ON app_settings
  FOR SELECT TO authenticated
  USING (key = 'vapid_public_key');
