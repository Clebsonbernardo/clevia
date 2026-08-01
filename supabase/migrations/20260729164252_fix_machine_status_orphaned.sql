/*
# Fix orphaned machine statuses and add auto-sync trigger

## What this does

1. Data fix: Any machine currently in 'parada' or 'manutencao' that has NO
   open work orders (all OS are concluida or cancelada) is reset to 'producao'.
   This fixes the "Maquina secadora 15" bug where the machine kept blinking
   red in the Lavanderia sector monitor even though the OS was closed.

2. Database trigger: A trigger fires AFTER INSERT or UPDATE on work_orders.
   When the OS status becomes 'concluida' or 'cancelada', the machine is
   automatically set back to 'producao' (if no other open OS exists for it).
   When the OS status becomes 'aberta', 'em_andamento', or 'pausada', the
   machine is set to 'manutencao'. This guarantees the machine status always
   reflects the actual OS state, even if the frontend forgets to update it.

## Tables affected
- machines — data correction (UPDATE only, no schema change)
- work_orders — new trigger added

## Security
- No RLS changes
- The trigger function runs with SECURITY DEFINER so it can update
  the machines table regardless of the caller's role
*/

-- 1. Fix existing orphaned machines
UPDATE machines
SET status = 'producao'
WHERE status IN ('parada', 'manutencao')
  AND id NOT IN (
    SELECT DISTINCT wo.machine_id
    FROM work_orders wo
    WHERE wo.status IN ('aberta', 'em_andamento', 'pausada')
      AND wo.machine_id IS NOT NULL
  );

-- 2. Create trigger function to auto-sync machine status
CREATE OR REPLACE FUNCTION sync_machine_status_on_os_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status))
     AND NEW.machine_id IS NOT NULL THEN

    IF NEW.status IN ('concluida', 'cancelada') THEN
      IF NOT EXISTS (
        SELECT 1 FROM work_orders wo
        WHERE wo.machine_id = NEW.machine_id
          AND wo.id <> NEW.id
          AND wo.status IN ('aberta', 'em_andamento', 'pausada')
      ) THEN
        UPDATE machines SET status = 'producao'
        WHERE id = NEW.machine_id AND status IN ('parada', 'manutencao');
      END IF;

    ELSIF NEW.status IN ('aberta', 'em_andamento', 'pausada') THEN
      UPDATE machines SET status = 'manutencao'
      WHERE id = NEW.machine_id AND status NOT IN ('manutencao');
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

-- 3. Attach the trigger (drop first for idempotency)
DROP TRIGGER IF EXISTS trg_sync_machine_status ON work_orders;
CREATE TRIGGER trg_sync_machine_status
  AFTER INSERT OR UPDATE ON work_orders
  FOR EACH ROW
  EXECUTE FUNCTION sync_machine_status_on_os_change();
