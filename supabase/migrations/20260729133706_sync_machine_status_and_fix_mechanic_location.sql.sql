/*
# Sync machine status with work orders + fix mechanic location

## 1. Machine status auto-sync from work orders
When a work order is created, updated, or deleted, a trigger automatically
recalculates the linked machine's status based on ALL active work orders for
that machine:

- If any active OS (aberta/em_andamento/pausada) has priority 'critica' or
  'alta' → machine status = 'parada' (red)
- If any active OS exists (but none critical/high) → machine status =
  'manutencao' (blue)
- If no active OS remains → machine status = 'producao' (green)

This ensures the Monitor de Telas always reflects the real state of machines
based on work orders, in real time.

## 2. Auto-populate mechanic_id on mechanic_locations
The mechanic_locations table has a mechanic_id column that was never being
filled by the frontend upsert. A BEFORE INSERT/UPDATE trigger now looks up
the mechanic profile by user_id + company_id and populates mechanic_id
automatically.

## 3. Fix RLS: allow mechanics to read their own location
The previous SELECT policy only allowed ceo/gerente to read all locations.
Mechanics could only read their own row. This is correct and stays as-is.
*/

-- ============================================================
-- 1. Machine status sync trigger
-- ============================================================

CREATE OR REPLACE FUNCTION sync_machine_status_from_work_orders()
RETURNS TRIGGER AS $$
DECLARE
  m_id uuid;
  has_critical boolean;
  has_active boolean;
BEGIN
  -- Determine which machine is affected (NEW for insert/update, OLD for delete)
  m_id := COALESCE(NEW.machine_id, OLD.machine_id);
  IF m_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Check for active work orders on this machine
  SELECT
    EXISTS(
      SELECT 1 FROM work_orders
      WHERE machine_id = m_id
        AND status IN ('aberta', 'em_andamento', 'pausada')
        AND priority IN ('critica', 'alta')
    ),
    EXISTS(
      SELECT 1 FROM work_orders
      WHERE machine_id = m_id
        AND status IN ('aberta', 'em_andamento', 'pausada')
    )
  INTO has_critical, has_active;

  IF has_critical THEN
    UPDATE machines SET status = 'parada' WHERE id = m_id;
  ELSIF has_active THEN
    UPDATE machines SET status = 'manutencao' WHERE id = m_id;
  ELSE
    UPDATE machines SET status = 'producao' WHERE id = m_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_machine_status ON work_orders;
CREATE TRIGGER trg_sync_machine_status
  AFTER INSERT OR UPDATE OR DELETE ON work_orders
  FOR EACH ROW EXECUTE FUNCTION sync_machine_status_from_work_orders();

-- ============================================================
-- 2. Auto-populate mechanic_id on mechanic_locations
-- ============================================================

CREATE OR REPLACE FUNCTION populate_mechanic_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.mechanic_id IS NULL THEN
    SELECT id INTO NEW.mechanic_id
    FROM mechanics
    WHERE user_id = NEW.user_id AND company_id = NEW.company_id
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_populate_mechanic_id ON mechanic_locations;
CREATE TRIGGER trg_populate_mechanic_id
  BEFORE INSERT OR UPDATE ON mechanic_locations
  FOR EACH ROW EXECUTE FUNCTION populate_mechanic_id();

-- ============================================================
-- 3. Backfill: update existing machines based on current work orders
-- ============================================================

UPDATE machines SET status = 'parada'
WHERE id IN (
  SELECT DISTINCT machine_id FROM work_orders
  WHERE status IN ('aberta', 'em_andamento', 'pausada')
    AND priority IN ('critica', 'alta')
);

UPDATE machines SET status = 'manutencao'
WHERE id IN (
  SELECT DISTINCT machine_id FROM work_orders
  WHERE status IN ('aberta', 'em_andamento', 'pausada')
    AND priority NOT IN ('critica', 'alta')
)
AND id NOT IN (
  SELECT DISTINCT machine_id FROM work_orders
  WHERE status IN ('aberta', 'em_andamento', 'pausada')
    AND priority IN ('critica', 'alta')
);

-- Machines with no active work orders go back to production
UPDATE machines SET status = 'producao'
WHERE id NOT IN (
  SELECT DISTINCT machine_id FROM work_orders
  WHERE status IN ('aberta', 'em_andamento', 'pausada')
  AND machine_id IS NOT NULL
);
