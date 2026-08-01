/*
# Add cost and supplier columns to inventory_items

1. Modified Tables
- `inventory_items`: add `cost` (numeric, nullable, default 0) — unit cost of the item in BRL
- `inventory_items`: add `supplier` (text, nullable) — name of the supplier/vendor
2. Security
- No policy changes needed — existing RLS policies on inventory_items already cover the new columns
3. Important Notes
- Both columns are nullable so existing rows are unaffected
- The ReportsScreen "Custos" and "Peças" reports reference these columns and were broken without them
*/

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS cost numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supplier text;
