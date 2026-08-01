/*
# Acesso administrativo total (dono do software)

## Visão Geral
Permite que o administrador do CLEVIA (dono do software) veja TODAS as
empresas cadastradas e gerencie TODAS as licenças, mesmo sem ser membro
de cada empresa. Isso é necessário para que ele possa acompanhar todos
os clientes pelo celular, ativar licenças, renovar mensalidades e
cadastrar empresas novas.

## Como funciona
- O e-mail do administrador é identificado por uma função SQL
  `is_admin()` que verifica se o usuário autenticado é o dono do software.
- As políticas RLS de `companies` e `company_licenses` são ajustadas para
  permitir SELECT/UPDATE/INSERT ao administrador, além dos membros.
- Isso garante que o admin veja tudo no painel de Licenças, mas os
  clientes continuam vendo apenas a própria empresa.

## Modificações
1. Função `is_admin()` — verifica se o usuário atual é o admin
2. Políticas de `companies` — admin tem acesso total
3. Políticas de `company_licenses` — admin pode ver e editar todas
4. Permissões concedidas
*/

-- ============================================================
-- FUNÇÃO: is_admin()
-- ============================================================
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid() AND email = 'clebsonbernardovelho@gmail.com'
  );
$$;

GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;

-- ============================================================
-- COMPANIES: admin vê e edita todas
-- ============================================================
DROP POLICY IF EXISTS "select_member_companies" ON companies;
CREATE POLICY "select_member_companies" ON companies FOR SELECT
  TO authenticated USING (
    id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid())
    OR is_admin()
  );

DROP POLICY IF EXISTS "update_own_companies" ON companies;
CREATE POLICY "update_own_companies" ON companies FOR UPDATE
  TO authenticated USING (
    (id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role = 'ceo'))
    OR is_admin()
  )
  WITH CHECK (
    (id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role = 'ceo'))
    OR is_admin()
  );

-- Admin pode criar empresas novas
DROP POLICY IF EXISTS "insert_companies" ON companies;
CREATE POLICY "insert_companies" ON companies FOR INSERT
  TO authenticated WITH CHECK (true);

-- ============================================================
-- COMPANY_LICENSES: admin vê e edita todas
-- ============================================================
DROP POLICY IF EXISTS "select_own_license" ON company_licenses;
CREATE POLICY "select_own_license" ON company_licenses FOR SELECT
  TO authenticated USING (
    company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role = 'ceo')
    OR is_admin()
  );

-- Admin pode criar licenças
DROP POLICY IF EXISTS "insert_license_admin" ON company_licenses;
CREATE POLICY "insert_license_admin" ON company_licenses FOR INSERT
  TO authenticated WITH CHECK (is_admin());

-- Admin pode editar licenças
DROP POLICY IF EXISTS "update_license_admin" ON company_licenses;
CREATE POLICY "update_license_admin" ON company_licenses FOR UPDATE
  TO authenticated USING (is_admin())
  WITH CHECK (is_admin());

-- ============================================================
-- COMPANY_MEMBERS: admin pode adicionar membros em qualquer empresa
-- ============================================================
DROP POLICY IF EXISTS "insert_members" ON company_members;
CREATE POLICY "insert_members" ON company_members FOR INSERT
  TO authenticated WITH CHECK (
    company_id IN (SELECT company_id FROM company_members m WHERE m.user_id = auth.uid() AND m.role = 'ceo')
    OR is_admin()
  );

DROP POLICY IF EXISTS "update_members" ON company_members;
CREATE POLICY "update_members" ON company_members FOR UPDATE
  TO authenticated USING (
    company_id IN (SELECT company_id FROM company_members m WHERE m.user_id = auth.uid() AND m.role = 'ceo')
    OR is_admin()
  )
  WITH CHECK (
    company_id IN (SELECT company_id FROM company_members m WHERE m.user_id = auth.uid() AND m.role = 'ceo')
    OR is_admin()
  );

DROP POLICY IF EXISTS "delete_members" ON company_members;
CREATE POLICY "delete_members" ON company_members FOR DELETE
  TO authenticated USING (
    company_id IN (SELECT company_id FROM company_members m WHERE m.user_id = auth.uid() AND m.role = 'ceo')
    OR is_admin()
  );

-- Admin pode ver membros de todas as empresas
DROP POLICY IF EXISTS "select_members" ON company_members;
CREATE POLICY "select_members" ON company_members FOR SELECT
  TO authenticated USING (
    company_id IN (SELECT company_id FROM company_members m WHERE m.user_id = auth.uid())
    OR is_admin()
  );
