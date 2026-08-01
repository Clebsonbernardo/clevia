/*
# Fix machine status sync when work orders are deleted

## Problem
The trigger `trg_sync_machine_status` only fired AFTER INSERT or UPDATE on
work_orders. When a work order was DELETED, the trigger never ran, so the
linked machine's status was never recalculated. Machines stayed stuck in
'manutencao' or 'parada' even though no open work orders remained for them.

## Fix
1. Replace the trigger function `sync_machine_status_on_os_change()` with a
   version that also handles the DELETE case. On DELETE, it checks whether
   any active work orders remain for the machine; if none remain, the machine
   is set back to 'producao'. If remaining active orders are all low/medium
   priority, status becomes 'manutencao'; if any are critical/high, 'parada'.

2. Recreate the trigger to fire AFTER INSERT OR UPDATE OR DELETE.

3. Backfill: reset any machine currently in 'parada' or 'manutencao' that has
   no active work orders back to 'producao'.

## Tables affected
- machines (data backfill — UPDATE only)
- work_orders (trigger change)

## Security
- No RLS changes. Trigger function remains SECURITY DEFINER so it can update
  machines regardless of caller role.
*/

CREATE OR REPLACE FUNCTION sync_machine_status_on_os_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m_id uuid;
  has_critical boolean;
  has_active boolean;
BEGIN
  m_id := COALESCE(NEW.machine_id, OLD.machine_id);
  IF m_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Only act on status transitions (INSERT/UPDATE) or deletion (DELETE)
  IF TG_OP = 'DELETE' OR (TG_OP IN ('INSERT','UPDATE') AND NEW.status IS DISTINCT FROM OLD.status) THEN

    SELECT
      EXISTS(
        SELECT 1 FROM work_orders
        WHERE machine_id = m_id
          AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
          AND status IN ('aberta', 'em_andamento', 'pausada')
          AND priority IN ('critica', 'alta')
      ),
      EXISTS(
        SELECT 1 FROM work_orders
        WHERE machine_id = m_id
          AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
          AND status IN ('aberta', 'em_andamento', 'pausada')
      )
    INTO has_critical, has_active;

    IF has_critical THEN
      UPDATE machines SET status = 'parada' WHERE id = m_id;
    ELSIF has_active THEN
      UPDATE machines SET status = 'manutencao' WHERE id = m_id AND status <> 'manutencao';
    ELSE
      UPDATE machines SET status = 'producao' WHERE id = m_id AND status IN ('parada', 'manutencao');
    END IF;

  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_machine_status ON work_orders;
CREATE TRIGGER trg_sync_machine_status
  AFTER INSERT OR UPDATE OR DELETE ON work_orders
  FOR EACH ROW
  EXECUTE FUNCTION sync_machine_status_on_os_change();

-- Backfill: reset orphaned machines with no active work orders
UPDATE machines
SET status = 'producao'
WHERE status IN ('parada', 'manutencao')
  AND id NOT IN (
    SELECT DISTINCT wo.machine_id
    FROM work_orders wo
    WHERE wo.status IN ('aberta', 'em_andamento', 'pausada')
      AND wo.machine_id IS NOT NULL
  );
