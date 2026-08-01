/*
# Create ai_search_history table

1. New Tables
- `ai_search_history`
  - `id` (uuid, primary key)
  - `company_id` (uuid, references companies, cascade delete)
  - `user_id` (uuid, references auth.users, cascade delete)
  - `machine_id` (uuid, references machines, nullable, cascade delete)
  - `query` (text, the search query)
  - `results_count` (int, number of results found)
  - `created_at` (timestamptz, default now())

2. Security
- Enable RLS on `ai_search_history`.
- Company members can read; the creator can insert/delete their own.
*/

CREATE TABLE IF NOT EXISTS ai_search_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  machine_id uuid REFERENCES machines(id) ON DELETE SET NULL,
  query text NOT NULL,
  results_count int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ai_search_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_company_search_history" ON ai_search_history;
CREATE POLICY "select_company_search_history" ON ai_search_history FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = ai_search_history.company_id
        AND cm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_own_search_history" ON ai_search_history;
CREATE POLICY "insert_own_search_history" ON ai_search_history FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = ai_search_history.company_id
        AND cm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "delete_own_search_history" ON ai_search_history;
CREATE POLICY "delete_own_search_history" ON ai_search_history FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_ai_search_history_company ON ai_search_history(company_id);
CREATE INDEX IF NOT EXISTS idx_ai_search_history_user ON ai_search_history(user_id);
