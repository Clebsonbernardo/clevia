
-- Re-sync all machine statuses based on current work orders.
-- This fixes machines stuck in 'manutencao'/'parada' when their OS
-- were cancelled or completed but the trigger didn't fire (e.g. the
-- OS was deleted, or status was changed via raw SQL).

-- 1) Machines with active critical/high OS -> parada
UPDATE machines SET status = 'parada'
WHERE id IN (
  SELECT DISTINCT machine_id FROM work_orders
  WHERE status IN ('aberta', 'em_andamento', 'pausada')
    AND priority IN ('critica', 'alta')
  AND machine_id IS NOT NULL
);

-- 2) Machines with active OS (none critical/high) -> manutencao
UPDATE machines SET status = 'manutencao'
WHERE id IN (
  SELECT DISTINCT machine_id FROM work_orders
  WHERE status IN ('aberta', 'em_andamento', 'pausada')
    AND priority NOT IN ('critica', 'alta')
  AND machine_id IS NOT NULL
)
AND id NOT IN (
  SELECT DISTINCT machine_id FROM work_orders
  WHERE status IN ('aberta', 'em_andamento', 'pausada')
    AND priority IN ('critica', 'alta')
  AND machine_id IS NOT NULL
);

-- 3) Machines with NO active OS -> producao
UPDATE machines SET status = 'producao'
WHERE id NOT IN (
  SELECT DISTINCT machine_id FROM work_orders
  WHERE status IN ('aberta', 'em_andamento', 'pausada')
  AND machine_id IS NOT NULL
);
