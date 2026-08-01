import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});

export type Company = {
  id: string; name: string; cnpj: string | null; logo_url: string | null; created_at: string;
};

export type Branch = {
  id: string; company_id: string; name: string; address: string | null; city: string | null; state: string | null; created_at: string;
};

export type CompanyMember = {
  id: string; company_id: string; user_id: string; role: string; display_name: string | null; created_at: string;
};

export type Machine = {
  id: string; company_id: string; branch_id: string | null; name: string; code: string | null;
  sector: string | null; model: string | null; manufacturer: string | null;
  status: string; criticality: string; purchase_date: string | null; integration_id: string | null; created_at: string;
};

export type Mechanic = {
  id: string; company_id: string; user_id: string | null; name: string; specialty: string | null;
  phone: string | null; email: string | null; status: string; created_at: string;
};

export type WorkOrder = {
  id: string; user_id: string; company_id: string; branch_id: string | null; machine_id: string | null;
  mechanic_id: string | null; title: string | null; description: string | null;
  status: string; priority: string; type: string; assigned_to: string | null;
  created_at: string; scheduled_date: string | null; completed_at: string | null;
  accepted_at: string | null; finished_at: string | null;
  paused_at: string | null; resumed_at: string | null;
  defect: string | null; procedure: string | null; replaced_part: string | null;
  os_number: number | null;
  approval_status: 'none' | 'pending' | 'approved' | 'rejected';
  requires_approval: boolean;
};

export type WorkOrderHistory = {
  id: string; work_order_id: string; event_type: string; event_description: string | null;
  actor_name: string | null; created_at: string;
};

export type PreventivePlan = {
  id: string; company_id: string; branch_id: string | null; machine_id: string | null;
  title: string; description: string | null; frequency_days: number;
  last_executed: string | null; next_date: string; status: string; created_at: string;
};

export type InventoryItem = {
  id: string; company_id: string; branch_id: string | null; name: string; code: string | null;
  category: string | null; quantity: number; min_quantity: number; unit: string; location: string | null; created_at: string;
};

export type ProductionLog = {
  id: string; company_id: string; machine_id: string | null; log_date: string;
  units_produced: number; uptime_hours: number; production_hour: number | null; created_at: string;
};

export type ProductionDailyHistory = {
  id: string; company_id: string; machine_id: string; log_date: string;
  units_produced: number; uptime_hours: number; production_per_hour: number;
  shift: string | null; archived_at: string;
};

export type MachineIntegration = {
  id: string; company_id: string; name: string; api_url: string; api_key: string | null;
  poll_interval_seconds: number; active: boolean; last_sync_at: string | null; created_at: string;
};

export type Notification = {
  id: string; company_id: string; user_id: string; work_order_id: string | null;
  title: string; body: string | null; type: string; read: boolean; created_at: string;
};

export type CompanyLicense = {
  id: string; company_id: string;
  plan: 'trial' | 'paid';
  status: 'active' | 'expired' | 'blocked' | 'canceled';
  started_at: string; expires_at: string;
  monthly_fee: number | null; next_payment_date: string | null;
  notes: string | null; created_at: string; updated_at: string;
  per_user_fee: number | null;
  payment_status: 'paid' | 'pending' | 'overdue' | null;
  last_payment_date: string | null;
  last_payment_amount: number | null;
};

export type KnowledgeBase = {
  id: string; company_id: string; user_id: string; machine_id: string | null;
  query: string; title: string; content: string; source_url: string | null;
  source_type: string; tags: string[]; created_at: string; updated_at: string;
};

export type AiSearchHistory = {
  id: string; company_id: string; user_id: string; machine_id: string | null;
  query: string; results_count: number; created_at: string;
};

export type LicenseStatusResult = {
  plan: 'trial' | 'paid';
  status: 'active' | 'expired' | 'blocked' | 'canceled';
  started_at: string; expires_at: string;
  monthly_fee: number | null; next_payment_date: string | null;
  days_remaining: number; is_blocked: boolean;
};

export type Contract = {
  id: string; company_id: string; contract_number: string;
  plan: 'trial' | 'paid'; monthly_fee: number | null;
  duration_months: number; start_date: string; end_date: string;
  client_name: string | null; client_email: string | null; client_cpf: string | null;
  status: 'draft' | 'sent' | 'signed' | 'expired' | 'canceled';
  notes: string | null; created_by: string | null;
  created_at: string; updated_at: string;
};

export type CeoGrant = {
  id: string; company_id: string; user_id: string; permission_key: string;
  granted_by: string | null; granted: boolean; created_at: string;
};

export type AuditLog = {
  id: string; company_id: string; user_id: string | null; user_email: string | null;
  action: string; entity_type: string | null; entity_id: string | null;
  description: string | null; ip_address: string | null; device_info: string | null;
  metadata: Record<string, unknown>; created_at: string;
};

export type MachinePosition = {
  id: string; company_id: string; branch_id: string | null;
  machine_id: string; sector: string | null;
  position_x: number; position_y: number; updated_at: string;
};

export type MonitorScreen = {
  id: string; company_id: string; name: string;
  screen_type: string; config: Record<string, unknown>;
  active: boolean; created_at: string;
};

export type ProductionDailyHistory = {
  id: string; company_id: string; machine_id: string; log_date: string;
  units_produced: number; uptime_hours: number; production_per_hour: number;
  shift: string | null; archived_at: string;
};

export type AiPrediction = {
  id: string; company_id: string; machine_id: string | null;
  prediction_type: string; severity: string; description: string | null;
  confidence: number; recommended_action: string | null;
  metadata: Record<string, unknown>; resolved: boolean; created_at: string;
};

export type Integration = {
  id: string; company_id: string;
  type: 'sap' | 'erp' | 'iot_opcua' | 'iot_modbus' | 'active_directory';
  name: string; endpoint_url: string | null;
  config: Record<string, unknown>;
  credentials_encrypted: Record<string, unknown>;
  active: boolean; last_sync_at: string | null;
  sync_status: 'idle' | 'running' | 'success' | 'error';
  last_error: string | null;
  created_at: string; updated_at: string;
};

export type IntegrationSyncLog = {
  id: string; integration_id: string; company_id: string;
  started_at: string; finished_at: string | null;
  status: 'success' | 'error' | 'partial' | 'running';
  records_synced: number; error_message: string | null;
  payload: Record<string, unknown>;
};

export type WorkOrderApproval = {
  id: string; work_order_id: string; company_id: string;
  approval_level: number; approver_role: string;
  approver_user_id: string | null;
  status: 'pending' | 'approved' | 'rejected';
  comment: string | null; acted_at: string | null;
  created_at: string;
};

export type ReportTemplate = {
  id: string; company_id: string; name: string;
  report_type: string; period_type: string;
  custom_start: string | null; custom_end: string | null;
  columns: string[]; created_by: string | null;
  created_at: string;
};

export type ComplianceAudit = {
  id: string; company_id: string;
  framework: 'iso_55001' | 'nr_12';
  scope: string; auditor_name: string | null;
  status: 'planned' | 'in_progress' | 'completed' | 'archived';
  score: number | null;
  scheduled_date: string | null; completed_date: string | null;
  notes: string | null; created_at: string;
};

export type ComplianceFinding = {
  id: string; audit_id: string; company_id: string;
  requirement_ref: string;
  severity: 'critical' | 'major' | 'minor' | 'observation';
  description: string; corrective_action: string | null;
  due_date: string | null;
  status: 'open' | 'in_progress' | 'resolved';
  resolved_at: string | null; photo_url: string | null;
  created_at: string;
};

export type Nr12MachineInspection = {
  id: string; company_id: string; machine_id: string | null;
  inspector_name: string | null; inspection_date: string;
  status: 'conforme' | 'nao_conforme' | 'pendente';
  emergency_stop_ok: boolean; guards_ok: boolean; interlocks_ok: boolean;
  signage_ok: boolean; grounding_ok: boolean; lockout_tagout_ok: boolean;
  training_ok: boolean; maintenance_ok: boolean;
  observations: string | null; photo_url: string | null;
  next_inspection_date: string | null; created_at: string;
};

export type ComplianceDocument = {
  id: string; company_id: string;
  framework: 'iso_55001' | 'nr_12';
  title: string; document_type: string;
  file_url: string | null;
  issue_date: string | null; expiry_date: string | null;
  created_at: string;
};
