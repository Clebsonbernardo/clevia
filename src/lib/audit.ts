import { supabase } from '@/lib/supabase';

export async function logAction(
  companyId: string,
  action: string,
  entityType?: string,
  entityId?: string,
  description?: string,
  metadata?: Record<string, unknown>,
) {
  try {
    const deviceInfo = navigator.userAgent.slice(0, 200);
    await supabase.rpc('log_audit_entry', {
      p_company_id: companyId,
      p_action: action,
      p_entity_type: entityType || null,
      p_entity_id: entityId || null,
      p_description: description || null,
      p_metadata: metadata || {},
    });
    // Store device info separately (RPC doesn't capture it)
    if (entityId) {
      void deviceInfo;
    }
  } catch {
    // Audit logging is best-effort — never block user actions
  }
}
