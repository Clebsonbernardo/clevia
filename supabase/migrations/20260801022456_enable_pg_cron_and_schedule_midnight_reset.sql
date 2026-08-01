-- Enable pg_cron extension for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA cron;

-- Schedule the archive_and_reset_daily_production() function to run every day at midnight
-- This archives today's production into production_daily_history and zeroes out production_logs for the next day
SELECT cron.schedule(
  'clevia_midnight_production_reset',
  '0 0 * * *',
  $$SELECT archive_and_reset_daily_production()$$
);
