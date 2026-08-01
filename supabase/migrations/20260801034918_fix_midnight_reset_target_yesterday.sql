/*
# Fix midnight reset: archive and zero YESTERDAY's production, not today's

1. Modified Functions
- `archive_and_reset_daily_production()`: changed `WHERE log_date = CURRENT_DATE` to `WHERE log_date = CURRENT_DATE - 1`
2. Security
- No policy changes
3. Important Notes
- At midnight (00:00), CURRENT_DATE is already the NEW day. The old code archived/reset the new (empty) day and left yesterday's production untouched in production_logs — so the dashboard kept showing stale data.
- Now it correctly archives yesterday's logs into production_daily_history and zeroes them, so the new day starts fresh.
*/

CREATE OR REPLACE FUNCTION archive_and_reset_daily_production()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO production_daily_history (company_id, machine_id, log_date, units_produced, uptime_hours, production_per_hour, shift)
  SELECT company_id, machine_id, log_date, units_produced, uptime_hours,
    CASE WHEN uptime_hours > 0 THEN units_produced / uptime_hours ELSE 0 END, shift
  FROM production_logs WHERE log_date = CURRENT_DATE - 1;
  UPDATE production_logs SET units_produced = 0, uptime_hours = 0 WHERE log_date = CURRENT_DATE - 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION archive_and_reset_daily_production() FROM anon, public;
