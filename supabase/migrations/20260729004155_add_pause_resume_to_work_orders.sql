/*
# Add pause/resume support for work orders

1. Modified Tables
- `work_orders`
  - `paused_at` (timestamptz, nullable) — when the mechanic paused the OS to handle a higher-priority one
  - `resumed_at` (timestamptz, nullable) — when the mechanic resumed the OS after a pause
2. Notes
- The status column already accepts arbitrary text, so 'pausada' is a new status value that requires no type change.
- When a mechanic pauses an OS, status changes from 'em_andamento' to 'pausada' and paused_at is set.
- When resuming, status changes back to 'em_andamento' and resumed_at is set.
- The mechanic remains assigned (mechanic_id stays), so the same mechanic can resume later.
- Alternatively, the mechanic can transfer the paused OS to another mechanic.
*/

ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS paused_at timestamptz;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS resumed_at timestamptz;
