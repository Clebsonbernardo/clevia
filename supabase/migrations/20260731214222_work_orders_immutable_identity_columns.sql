-- A política de UPDATE em work_orders é por linha, então qualquer membro podia
-- reescrever quem criou a OS, mover a OS para outra empresa ou alterar o número
-- sequencial da OS. Essas colunas passam a ser imutáveis após a criação.
CREATE OR REPLACE FUNCTION public.work_orders_protect_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.company_id := OLD.company_id;
  NEW.user_id := OLD.user_id;
  NEW.os_number := OLD.os_number;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.work_orders_protect_identity() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_work_orders_protect_identity ON public.work_orders;
CREATE TRIGGER trg_work_orders_protect_identity
  BEFORE UPDATE ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.work_orders_protect_identity();
