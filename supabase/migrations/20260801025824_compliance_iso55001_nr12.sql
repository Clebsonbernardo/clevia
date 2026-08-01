/*
# Compliance Module — ISO 55001 & NR-12

## Tables

### compliance_audits
Auditorias de conformidade (ISO 55001 ou NR-12).
- id, company_id, framework ('iso_55001' | 'nr_12'), scope, auditor_name,
  status ('planned' | 'in_progress' | 'completed' | 'archived'),
  score (numeric 0-100), scheduled_date, completed_date, notes, created_at

### compliance_findings
Não-conformidades encontradas em auditorias.
- id, audit_id, company_id, requirement_ref (ex: "7.2.1" for ISO, "12.3.1" for NR-12),
  severity ('critical' | 'major' | 'minor' | 'observation'),
  description, corrective_action, due_date, status ('open' | 'in_progress' | 'resolved'),
  resolved_at, photo_url, created_at

### nr12_machine_inspections
Inspeções NR-12 por máquina.
- id, company_id, machine_id, inspector_name, inspection_date,
  status ('conforme' | 'nao_conforme' | 'pendente'),
  emergency_stop_ok, guards_ok, interlocks_ok, signage_ok, grounding_ok,
  lockout_tagout_ok, training_ok, maintenance_ok,
  observations, photo_url, next_inspection_date, created_at

### compliance_documents
Documentos de conformidade (certificados, relatórios, laudos).
- id, company_id, framework, title, document_type, file_url, issue_date, expiry_date, created_at
*/

-- ═════════════════════════════════════════════
-- 1. COMPLIANCE AUDITS
-- ═════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS compliance_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  framework text NOT NULL CHECK (framework IN ('iso_55001', 'nr_12')),
  scope text NOT NULL DEFAULT 'Geral',
  auditor_name text,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed', 'archived')),
  score numeric(5,2),
  scheduled_date date,
  completed_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE compliance_audits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_compliance_audits" ON compliance_audits;
CREATE POLICY "select_own_compliance_audits" ON compliance_audits FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = compliance_audits.company_id AND cm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_own_compliance_audits" ON compliance_audits;
CREATE POLICY "insert_own_compliance_audits" ON compliance_audits FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = compliance_audits.company_id AND cm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_own_compliance_audits" ON compliance_audits;
CREATE POLICY "update_own_compliance_audits" ON compliance_audits FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = compliance_audits.company_id AND cm.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = compliance_audits.company_id AND cm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_own_compliance_audits" ON compliance_audits;
CREATE POLICY "delete_own_compliance_audits" ON compliance_audits FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = compliance_audits.company_id AND cm.user_id = auth.uid() AND cm.role IN ('ceo', 'gerente'))
  );

-- ═════════════════════════════════════════════
-- 2. COMPLIANCE FINDINGS
-- ═════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS compliance_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES compliance_audits(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  requirement_ref text NOT NULL,
  severity text NOT NULL DEFAULT 'minor' CHECK (severity IN ('critical', 'major', 'minor', 'observation')),
  description text NOT NULL,
  corrective_action text,
  due_date date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  resolved_at timestamptz,
  photo_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE compliance_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_compliance_findings" ON compliance_findings;
CREATE POLICY "select_own_compliance_findings" ON compliance_findings FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = compliance_findings.company_id AND cm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_own_compliance_findings" ON compliance_findings;
CREATE POLICY "insert_own_compliance_findings" ON compliance_findings FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = compliance_findings.company_id AND cm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_own_compliance_findings" ON compliance_findings;
CREATE POLICY "update_own_compliance_findings" ON compliance_findings FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = compliance_findings.company_id AND cm.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = compliance_findings.company_id AND cm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_own_compliance_findings" ON compliance_findings;
CREATE POLICY "delete_own_compliance_findings" ON compliance_findings FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = compliance_findings.company_id AND cm.user_id = auth.uid())
  );

-- ═════════════════════════════════════════════
-- 3. NR-12 MACHINE INSPECTIONS
-- ═════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS nr12_machine_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  machine_id uuid REFERENCES machines(id) ON DELETE SET NULL,
  inspector_name text,
  inspection_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('conforme', 'nao_conforme', 'pendente')),
  emergency_stop_ok boolean DEFAULT false,
  guards_ok boolean DEFAULT false,
  interlocks_ok boolean DEFAULT false,
  signage_ok boolean DEFAULT false,
  grounding_ok boolean DEFAULT false,
  lockout_tagout_ok boolean DEFAULT false,
  training_ok boolean DEFAULT false,
  maintenance_ok boolean DEFAULT false,
  observations text,
  photo_url text,
  next_inspection_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE nr12_machine_inspections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_nr12_inspections" ON nr12_machine_inspections;
CREATE POLICY "select_own_nr12_inspections" ON nr12_machine_inspections FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = nr12_machine_inspections.company_id AND cm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_own_nr12_inspections" ON nr12_machine_inspections;
CREATE POLICY "insert_own_nr12_inspections" ON nr12_machine_inspections FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = nr12_machine_inspections.company_id AND cm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_own_nr12_inspections" ON nr12_machine_inspections;
CREATE POLICY "update_own_nr12_inspections" ON nr12_machine_inspections FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = nr12_machine_inspections.company_id AND cm.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = nr12_machine_inspections.company_id AND cm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_own_nr12_inspections" ON nr12_machine_inspections;
CREATE POLICY "delete_own_nr12_inspections" ON nr12_machine_inspections FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = nr12_machine_inspections.company_id AND cm.user_id = auth.uid() AND cm.role IN ('ceo', 'gerente'))
  );

-- ═════════════════════════════════════════════
-- 4. COMPLIANCE DOCUMENTS
-- ═════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS compliance_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  framework text NOT NULL CHECK (framework IN ('iso_55001', 'nr_12')),
  title text NOT NULL,
  document_type text NOT NULL DEFAULT 'certificate',
  file_url text,
  issue_date date,
  expiry_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE compliance_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_compliance_docs" ON compliance_documents;
CREATE POLICY "select_own_compliance_docs" ON compliance_documents FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = compliance_documents.company_id AND cm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_own_compliance_docs" ON compliance_documents;
CREATE POLICY "insert_own_compliance_docs" ON compliance_documents FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = compliance_documents.company_id AND cm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_own_compliance_docs" ON compliance_documents;
CREATE POLICY "update_own_compliance_docs" ON compliance_documents FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = compliance_documents.company_id AND cm.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = compliance_documents.company_id AND cm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_own_compliance_docs" ON compliance_documents;
CREATE POLICY "delete_own_compliance_docs" ON compliance_documents FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = compliance_documents.company_id AND cm.user_id = auth.uid())
  );

-- Realtime
ALTER TABLE compliance_audits REPLICA IDENTITY FULL;
ALTER TABLE compliance_findings REPLICA IDENTITY FULL;
ALTER TABLE nr12_machine_inspections REPLICA IDENTITY FULL;
ALTER TABLE compliance_documents REPLICA IDENTITY FULL;
