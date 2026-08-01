/*
# Add per-user billing columns to company_licenses

1. New Columns on `company_licenses`
   - `per_user_fee` (numeric(10,2), default 49.90) — monthly price charged per active user
   - `payment_status` (text, default 'pending') — 'paid' | 'pending' | 'overdue'
   - `last_payment_date` (date, nullable) — date of the most recent confirmed payment
   - `last_payment_amount` (numeric(10,2), nullable) — amount actually paid in the last payment

2. Security
   - No new tables; RLS already enabled on `company_licenses`.
   - Existing admin UPDATE policy covers the new columns.

3. Important Notes
   - The total monthly charge is calculated dynamically as `per_user_fee * user_count`
     rather than stored, so it stays correct as users are added/removed.
   - `payment_status = 'paid'` means "empresa efetuou o pagamento, está em dia".
   - When a new company is created, `per_user_fee` defaults to 49.90 and
     `payment_status` defaults to 'pending'.
*/

ALTER TABLE company_licenses
  ADD COLUMN IF NOT EXISTS per_user_fee numeric(10,2) DEFAULT 49.90;

ALTER TABLE company_licenses
  ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'pending' CHECK (payment_status IN ('paid', 'pending', 'overdue'));

ALTER TABLE company_licenses
  ADD COLUMN IF NOT EXISTS last_payment_date date;

ALTER TABLE company_licenses
  ADD COLUMN IF NOT EXISTS last_payment_amount numeric(10,2);
