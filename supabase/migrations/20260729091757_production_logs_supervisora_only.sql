/*
# Restringir edição de produção à supervisora + coluna de hora

1. Modificações na tabela `production_logs`
   - Adiciona coluna `production_hour` (int, 0-23) para registrar a hora do dia
     em que a produção foi inserida. Permite que a supervisora informe a
     quantidade de peças produzidas a cada hora.
   - `machine_id` e `uptime_hours` permanecem na tabela (não removidos para
     não perder dados históricos), mas não são mais preenchidos pelo
     formulário manual.

2. Segurança (RLS)
   - SELECT: todos os membros da empresa podem visualizar (ceo, gerente,
     solicitante, mecanico, supervisora).
   - INSERT: apenas usuários com role 'supervisora' na empresa podem inserir.
   - UPDATE: apenas 'supervisora' pode alterar registros.
   - DELETE: apenas 'supervisora' pode remover registros.
   - CEO, gerente e demais papéis podem apenas visualizar e navegar pelos
     dias anteriores, sem alterar valores.

3. Notas
   - A coluna `production_hour` é nullable para compatibilidade com
     registros antigos.
   - Políticas anteriores de insert são substituídas.
*/

-- Adiciona coluna de hora (0-23) para registro por hora
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'production_logs' AND column_name = 'production_hour'
  ) THEN
    ALTER TABLE production_logs ADD COLUMN production_hour int;
  END IF;
END $$;

-- ============================================================
-- RLS: apenas supervisora pode inserir/atualizar/remover
-- Todos os membros podem visualizar (SELECT)
-- ============================================================

-- SELECT: todos os membros da empresa
DROP POLICY IF EXISTS "select_production" ON production_logs;
CREATE POLICY "select_production" ON production_logs FOR SELECT
  TO authenticated USING (
    company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid())
  );

-- INSERT: apenas supervisora
DROP POLICY IF EXISTS "insert_production" ON production_logs;
CREATE POLICY "insert_production" ON production_logs FOR INSERT
  TO authenticated WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_members
      WHERE user_id = auth.uid() AND role = 'supervisora'
    )
  );

-- UPDATE: apenas supervisora
DROP POLICY IF EXISTS "update_production" ON production_logs;
CREATE POLICY "update_production" ON production_logs FOR UPDATE
  TO authenticated USING (
    company_id IN (
      SELECT company_id FROM company_members
      WHERE user_id = auth.uid() AND role = 'supervisora'
    )
  ) WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_members
      WHERE user_id = auth.uid() AND role = 'supervisora'
    )
  );

-- DELETE: apenas supervisora
DROP POLICY IF EXISTS "delete_production" ON production_logs;
CREATE POLICY "delete_production" ON production_logs FOR DELETE
  TO authenticated USING (
    company_id IN (
      SELECT company_id FROM company_members
      WHERE user_id = auth.uid() AND role = 'supervisora'
    )
  );
