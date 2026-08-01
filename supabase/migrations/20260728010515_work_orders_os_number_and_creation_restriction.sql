/*
# Numeração de OS e restrição de criação

1. Modified Tables
- `work_orders`: nova coluna `os_number` (integer) — número sequencial da OS por empresa, preenchido automaticamente ao criar. Ordens existentes são numeradas retroativamente pela data de criação.

2. New Functions/Triggers
- `assign_os_number()`: trigger BEFORE INSERT que atribui o próximo número sequencial dentro da empresa.

3. Security (RLS)
- Removida a política `insert_own_work_orders` (permitia qualquer usuário autenticado criar OS própria).
- `insert_wo` recriada: somente membros com papel `ceo` ou `gerente` da empresa podem criar ordens de serviço. Mecânicos e solicitantes não podem mais criar OS (continuam podendo visualizar e atualizar para aceitar/finalizar).

4. Notes
- Nenhum dado é removido; apenas restrição de criação e nova coluna.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'work_orders' AND column_name = 'os_number'
  ) THEN
    ALTER TABLE work_orders ADD COLUMN os_number integer;
  END IF;
END $$;

-- Backfill existing orders per company by creation date
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY created_at ASC) AS rn
  FROM work_orders
  WHERE os_number IS NULL
)
UPDATE work_orders w SET os_number = n.rn
FROM numbered n WHERE w.id = n.id AND w.os_number IS NULL;

CREATE OR REPLACE FUNCTION assign_os_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.os_number IS NULL THEN
    SELECT COALESCE(MAX(os_number), 0) + 1 INTO NEW.os_number
    FROM work_orders WHERE company_id = NEW.company_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_os_number ON work_orders;
CREATE TRIGGER trg_assign_os_number
BEFORE INSERT ON work_orders
FOR EACH ROW EXECUTE FUNCTION assign_os_number();

-- Restrict creation to ceo/gerente
DROP POLICY IF EXISTS "insert_own_work_orders" ON work_orders;
DROP POLICY IF EXISTS "insert_wo" ON work_orders;
CREATE POLICY "insert_wo" ON work_orders FOR INSERT
TO authenticated
WITH CHECK (
  company_id IN (
    SELECT company_members.company_id FROM company_members
    WHERE company_members.user_id = auth.uid()
      AND company_members.role IN ('ceo', 'gerente')
  )
);