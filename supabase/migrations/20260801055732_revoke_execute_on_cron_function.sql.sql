-- archive_and_reset_daily_production is only called by pg_cron, not by users
REVOKE EXECUTE ON FUNCTION public.archive_and_reset_daily_production() FROM authenticated;
