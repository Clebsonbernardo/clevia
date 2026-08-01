/*
# Fix: allow null machine_id in production_daily_history

1. Modified Tables
- `production_daily_history`: alter `machine_id` to be nullable — company-wide production logs have no machine_id
2. Security
- No policy changes
3. Important Notes
- The archive function inserts from production_logs which can have machine_id = null (company-wide production entries registered by supervisora)
- Previously this caused the midnight reset to fail silently, leaving stale production data in production_logs
*/

ALTER TABLE production_daily_history ALTER COLUMN machine_id DROP NOT NULL;
