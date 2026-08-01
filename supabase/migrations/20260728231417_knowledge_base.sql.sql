/*
# Create knowledge_base table for AI Assistant

1. New Tables
- `knowledge_base`
  - `id` (uuid, primary key)
  - `company_id` (uuid, references companies, cascade delete)
  - `user_id` (uuid, references auth.users, cascade delete)
  - `machine_id` (uuid, references machines, nullable, cascade delete — optional link to a specific machine)
  - `query` (text, the search query that produced this knowledge)
  - `title` (text, title of the saved resource)
  - `content` (text, the main content/answer)
  - `source_url` (text, nullable, link to manual/video/article)
  - `source_type` (text: 'manual' | 'video' | 'article' | 'procedure' | 'other')
  - `tags` (text[], nullable, array of tags for categorization)
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())

2. Security
- Enable RLS on `knowledge_base`.
- Company-scoped CRUD: members of the company can read, the creator can insert/update/delete.
- Uses the existing `company_members` helper pattern for access checks.
*/

CREATE TABLE IF NOT EXISTS knowledge_base (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  machine_id uuid REFERENCES machines(id) ON DELETE SET NULL,
  query text NOT NULL DEFAULT '',
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  source_url text,
  source_type text NOT NULL DEFAULT 'other',
  tags text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;

-- Company members can read knowledge base entries
DROP POLICY IF EXISTS "select_company_knowledge" ON knowledge_base;
CREATE POLICY "select_company_knowledge" ON knowledge_base FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = knowledge_base.company_id
        AND cm.user_id = auth.uid()
    )
  );

-- Any company member can insert knowledge
DROP POLICY IF EXISTS "insert_company_knowledge" ON knowledge_base;
CREATE POLICY "insert_company_knowledge" ON knowledge_base FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = knowledge_base.company_id
        AND cm.user_id = auth.uid()
    )
  );

-- Creator can update their own entries
DROP POLICY IF EXISTS "update_own_knowledge" ON knowledge_base;
CREATE POLICY "update_own_knowledge" ON knowledge_base FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Creator can delete their own entries
DROP POLICY IF EXISTS "delete_own_knowledge" ON knowledge_base;
CREATE POLICY "delete_own_knowledge" ON knowledge_base FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Index for company-scoped queries
CREATE INDEX IF NOT EXISTS idx_knowledge_base_company ON knowledge_base(company_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_machine ON knowledge_base(machine_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_tags ON knowledge_base USING GIN(tags);
