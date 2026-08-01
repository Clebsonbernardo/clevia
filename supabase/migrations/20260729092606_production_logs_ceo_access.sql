/*
# Permitir que o CEO também registre produção (demonstração)

1. Segurança (RLS) em `production_logs`
   - INSERT, UPDATE, DELETE: agora permuem usuários com role 'supervisora' OU 'ceo'.
   - SELECT permanece liberado para todos os membros da empresa.
   - Isso permite que o CEO demonstre o funcionamento do sistema inserindo
     valores de produção manualmente, além da supervisora.
*/

DROP POLICY IF EXISTS "insert_production" ON production_logs;
CREATE POLICY "insert_production" ON production_logs FOR INSERT
  TO authenticated WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_members
      WHERE user_id = auth.uid() AND role IN ('supervisora', 'ceo')
    )
  );

DROP POLICY IF EXISTS "update_production" ON production_logs;
CREATE POLICY "update_production" ON production_logs FOR UPDATE
  TO authenticated USING (
    company_id IN (
      SELECT company_id FROM company_members
      WHERE user_id = auth.uid() AND role IN ('supervisora', 'ceo')
    )
  ) WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_members
      WHERE user_id = auth.uid() AND role IN ('supervisora', 'ceo')
    )
  );

DROP POLICY IF EXISTS "delete_production" ON production_logs;
CREATE POLICY "delete_production" ON production_logs FOR DELETE
  TO authenticated USING (
    company_id IN (
      SELECT company_id FROM company_members
      WHERE user_id = auth.uid() AND role IN ('supervisora', 'ceo')
    )
  );
