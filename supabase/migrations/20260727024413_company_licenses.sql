/*
# Licenciamento de Empresas (SaaS)

## Visão Gaveal
Cria o sistema de licenças para o CLEVIA funcionar como um software pago
por assinatura mensal. Cada empresa (tenant) precisa ter uma licença ativa
para usar o sistema. Licenças de teste (trial) duram 2 meses e depois
bloqueiam o acesso até que o cliente pague a mensalidade.

## Como funciona
1. O administrador (você, dono do software) cria uma empresa nova para o cliente.
2. Ao criar a empresa, uma licença TRIAL de 2 meses é gerada automaticamente.
3. Durante o trial, a empresa usa o sistema normalmente.
4. Quando o trial expira, o sistema bloqueia e mostra uma tela de pagamento.
5. O administrador converte a licença para PAGA (mensal) e define a data
   do próximo pagamento. A cada mês, o administrador renova a licença.
6. Se o pagamento mensal não for renovado até a data limite, o sistema
   bloqueia novamente.

## Nova Tabela
- `company_licenses`
  - `id` (uuid, primary key)
  - `company_id` (uuid, foreign key para companies, único — uma licença por empresa)
  - `plan` (text: 'trial' | 'paid') — tipo da licença
  - `status` (text: 'active' | 'expired' | 'blocked' | 'canceled')
  - `started_at` (timestamptz) — quando a licença começou
  - `expires_at` (timestamptz) — quando expira (trial: +60 dias; paid: +30 dias)
  - `monthly_fee` (numeric, nullable) — valor da mensalidade para licenças pagas
  - `next_payment_date` (date, nullable) — próximo vencimento para licenças pagas
  - `notes` (text, nullable) — observações do administrador
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

## Segurança (RLS)
- Apenas membros com role 'ceo' da própria empresa podem VER a licença dela.
- Ninguém pode criar/editar licenças pelo app — isso é feito via SQL pelo
  administrador do software (você). As políticas de INSERT/UPDATE/DELETE
  ficam restritas ao service role (backend), garantindo que o cliente
  não consiga alterar a própria licença.
- É criada uma função SQL `get_company_license_status(company_id)` que
  retorna o status atual da licença (considerando datas expiradas) para
  o app consultar sem expor a tabela inteira.

## Notas Importantes
1. A função `auto_create_trial_license()` é um trigger que cria uma licença
   TRIAL de 60 dias automaticamente sempre que uma empresa nova é cadastrada.
   Assim, ao vender para um cliente, basta criar a empresa e o trial já começa.
2. A função `get_company_license_status()` calcula o status real no momento
   da consulta: se a licença era 'active' mas já passou da data de expiração,
   retorna 'expired'. Isso evita precisar de um job agendado para bloquear.
*/

-- ============================================================
-- TABELA DE LICENÇAS
-- ============================================================
CREATE TABLE IF NOT EXISTS company_licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'trial' CHECK (plan IN ('trial', 'paid')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'blocked', 'canceled')),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '60 days'),
  monthly_fee numeric(10,2),
  next_payment_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE company_licenses ENABLE ROW LEVEL SECURITY;

-- Índice para consulta rápida por empresa
CREATE INDEX IF NOT EXISTS idx_licenses_company ON company_licenses(company_id);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON company_licenses(status);

-- ============================================================
-- POLÍTICAS RLS
-- Apenas CEO da própria empresa pode VER a licença dela.
-- INSERT/UPDATE/DELETE apenas via service role (backend/admin).
-- ============================================================
DROP POLICY IF EXISTS "select_own_license" ON company_licenses;
CREATE POLICY "select_own_license" ON company_licenses FOR SELECT
  TO authenticated USING (
    company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role = 'ceo')
  );

-- Não há políticas de INSERT/UPDATE/DELETE para authenticated —
-- apenas o service role (que bypassa RLS) pode modificar licenças.

-- ============================================================
-- TRIGGER: cria licença TRIAL automática ao criar empresa
-- ============================================================
CREATE OR REPLACE FUNCTION auto_create_trial_license()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO company_licenses (company_id, plan, status, started_at, expires_at)
  VALUES (NEW.id, 'trial', 'active', now(), now() + interval '60 days')
  ON CONFLICT (company_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_create_license ON companies;
CREATE TRIGGER trg_auto_create_license
  AFTER INSERT ON companies
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_trial_license();

-- ============================================================
-- FUNÇÃO: status atual da licença (calculado em tempo real)
-- ============================================================
CREATE OR REPLACE FUNCTION get_company_license_status(p_company_id uuid)
RETURNS TABLE (
  plan text,
  status text,
  started_at timestamptz,
  expires_at timestamptz,
  monthly_fee numeric,
  next_payment_date date,
  days_remaining int,
  is_blocked boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cl.plan,
    CASE
      WHEN cl.status = 'canceled' THEN 'canceled'
      WHEN cl.status = 'blocked' THEN 'blocked'
      WHEN cl.expires_at < now() THEN 'expired'
      WHEN cl.plan = 'paid' AND cl.next_payment_date IS NOT NULL AND cl.next_payment_date < CURRENT_DATE THEN 'expired'
      ELSE 'active'
    END,
    cl.started_at,
    cl.expires_at,
    cl.monthly_fee,
    cl.next_payment_date,
    GREATEST(EXTRACT(day FROM cl.expires_at - now())::int, 0),
    CASE
      WHEN cl.status = 'canceled' THEN true
      WHEN cl.status = 'blocked' THEN true
      WHEN cl.expires_at < now() THEN true
      WHEN cl.plan = 'paid' AND cl.next_payment_date IS NOT NULL AND cl.next_payment_date < CURRENT_DATE THEN true
      ELSE false
    END
  FROM company_licenses cl
  WHERE cl.company_id = p_company_id;
$$;

-- Concede acesso à função para usuários autenticados
GRANT EXECUTE ON FUNCTION get_company_license_status(uuid) TO authenticated;

-- Concede SELECT na tabela para a função SECURITY DEFINER funcionar
GRANT SELECT ON company_licenses TO authenticated;
