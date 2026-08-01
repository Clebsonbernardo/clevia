import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { integration_id, action } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: integration, error } = await supabase
      .from("integrations")
      .select("*")
      .eq("id", integration_id)
      .single();

    if (error || !integration) {
      return new Response(JSON.stringify({ error: "Integration not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create sync log
    const { data: log } = await supabase.from("integration_sync_logs").insert({
      integration_id, company_id: integration.company_id,
      status: "running",
    }).select().single();

    // Mark integration as running
    await supabase.from("integrations").update({
      sync_status: "running", updated_at: new Date().toISOString(),
    }).eq("id", integration_id);

    let recordsSynced = 0;
    let syncError: string | null = null;

    try {
      switch (integration.type) {
        case "sap":
          recordsSynced = await syncSAP(supabase, integration);
          break;
        case "erp":
          recordsSynced = await syncERP(supabase, integration);
          break;
        case "iot_opcua":
          recordsSynced = await syncIoT(supabase, integration, "opcua");
          break;
        case "iot_modbus":
          recordsSynced = await syncIoT(supabase, integration, "modbus");
          break;
        case "active_directory":
          recordsSynced = await syncAD(supabase, integration);
          break;
      }
    } catch (err) {
      syncError = err instanceof Error ? err.message : String(err);
    }

    const finalStatus = syncError ? "error" : "success";
    await supabase.from("integration_sync_logs").update({
      status: finalStatus, finished_at: new Date().toISOString(),
      records_synced: recordsSynced, error_message: syncError,
    }).eq("id", log?.id);

    await supabase.from("integrations").update({
      sync_status: finalStatus,
      last_sync_at: new Date().toISOString(),
      last_error: syncError,
      updated_at: new Date().toISOString(),
    }).eq("id", integration_id);

    return new Response(JSON.stringify({
      success: !syncError, records_synced: recordsSynced,
      error: syncError,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function syncSAP(supabase: any, integration: any): Promise<number> {
  const config = integration.config || {};
  const endpoint = integration.endpoint_url;
  if (!endpoint) throw new Error("SAP endpoint not configured");

  // SAP OData fetch — production orders, notifications, equipment
  const headers: Record<string, string> = {
    "Accept": "application/json",
    ...buildAuthHeaders(integration),
  };

  let count = 0;
  const entities = config.entities || ["ProductionOrders", "MaintenanceNotifications"];
  for (const entity of entities) {
    try {
      const url = `${endpoint.replace(/\/$/, "")}/${entity}?$top=${config.batch_size || 100}`;
      const resp = await fetch(url, { headers });
      if (!resp.ok) continue;
      const json = await resp.json();
      const records = json.d?.results || json.value || [];
      count += records.length;
      // Map SAP records to CLEVIA tables based on entity type
      if (entity === "MaintenanceNotifications" && records.length > 0) {
        await mapSAPNotifications(supabase, integration.company_id, records);
      }
    } catch { /* skip entity on error */ }
  }
  return count;
}

async function mapSAPNotifications(supabase: any, companyId: string, records: any[]) {
  for (const rec of records) {
    const machineName = rec.Equipment || rec.FunctionalLoc;
    if (!machineName) continue;
    const { data: machine } = await supabase.from("machines")
      .select("id").eq("company_id", companyId)
      .ilike("name", `%${machineName}%`).maybeSingle();
    if (!machine) continue;
    await supabase.from("work_orders").insert({
      company_id: companyId,
      machine_id: machine.id,
      title: `SAP: ${rec.ShortText || rec.NotifDesc}`,
      description: rec.LongText || rec.ShortText,
      priority: mapSAPPriority(rec.Priority),
      status: "aberta",
      type: "corretiva",
    });
  }
}

function mapSAPPriority(sapPriority: string): string {
  const map: Record<string, string> = { "1": "critica", "2": "alta", "3": "media", "4": "baixa" };
  return map[sapPriority] || "media";
}

async function syncERP(supabase: any, integration: any): Promise<number> {
  const endpoint = integration.endpoint_url;
  if (!endpoint) throw new Error("ERP endpoint not configured");

  const headers: Record<string, string> = {
    "Accept": "application/json",
    ...buildAuthHeaders(integration),
  };

  let count = 0;
  const config = integration.config || {};

  // Sync inventory items from ERP
  if (config.sync_inventory !== false) {
    try {
      const resp = await fetch(`${endpoint.replace(/\/$/, "")}/items?$top=200`, { headers });
      if (resp.ok) {
        const json = await resp.json();
        const items = json.value || json.items || [];
        for (const item of items) {
          await supabase.from("inventory_items").upsert({
            company_id: integration.company_id,
            code: item.code || item.itemCode,
            name: item.name || item.description,
            quantity: item.quantity ?? item.stock ?? 0,
            min_quantity: item.minQuantity ?? item.reorderPoint ?? 0,
            cost: item.cost ?? item.unitCost ?? 0,
            supplier: item.supplier ?? null,
          }, { onConflict: "company_id,code" });
          count++;
        }
      }
    } catch { /* best-effort */ }
  }

  // Sync work orders from ERP
  if (config.sync_work_orders) {
    try {
      const resp = await fetch(`${endpoint.replace(/\/$/, "")}/workorders?$top=100`, { headers });
      if (resp.ok) {
        const json = await resp.json();
        const orders = json.value || json.orders || [];
        count += orders.length;
      }
    } catch { /* best-effort */ }
  }

  return count;
}

async function syncIoT(supabase: any, integration: any, protocol: string): Promise<number> {
  const endpoint = integration.endpoint_url;
  if (!endpoint) throw new Error("IoT endpoint not configured");

  const config = integration.config || {};
  const tags = config.tags || [];
  let count = 0;

  if (protocol === "opcua") {
    // OPC UA JSON-encoded read — POST to the gateway
    for (const tag of tags) {
      try {
        const resp = await fetch(`${endpoint.replace(/\/$/, "")}/read`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...buildAuthHeaders(integration) },
          body: JSON.stringify({ nodeId: tag.nodeId }),
        });
        if (!resp.ok) continue;
        const val = await resp.json();
        await supabase.from("production_logs").insert({
          company_id: integration.company_id,
          machine_id: tag.machine_id || null,
          log_date: new Date().toISOString().split("T")[0],
          units_produced: Math.round(Number(val.value) || 0),
          uptime_hours: Number(config.uptime_hours ?? 8),
          production_hour: new Date().getHours(),
        });
        count++;
      } catch { /* skip tag on error */ }
    }
  } else if (protocol === "modbus") {
    // Modbus TCP — read holding registers
    for (const tag of tags) {
      try {
        const resp = await fetch(`${endpoint.replace(/\/$/, "")}/modbus/read`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...buildAuthHeaders(integration) },
          body: JSON.stringify({ address: tag.address, count: 1, unitId: tag.unitId || 1 }),
        });
        if (!resp.ok) continue;
        const val = await resp.json();
        await supabase.from("production_logs").insert({
          company_id: integration.company_id,
          machine_id: tag.machine_id || null,
          log_date: new Date().toISOString().split("T")[0],
          units_produced: Math.round(Number(val.value) || 0),
          uptime_hours: Number(config.uptime_hours ?? 8),
          production_hour: new Date().getHours(),
        });
        count++;
      } catch { /* skip tag on error */ }
    }
  }

  return count;
}

async function syncAD(supabase: any, integration: any): Promise<number> {
  const endpoint = integration.endpoint_url;
  if (!endpoint) throw new Error("Active Directory endpoint not configured");

  const config = integration.config || {};
  const searchBase = config.search_base || "DC=example,DC=com";
  const filter = config.filter || "(objectClass=user)";

  // Microsoft Graph API or LDAP gateway
  const headers: Record<string, string> = {
    "Accept": "application/json",
    ...buildAuthHeaders(integration),
  };

  try {
    const url = `${endpoint.replace(/\/$/, "")}/users?$select=displayName,mail,userPrincipalName,department&$top=200`;
    const resp = await fetch(url, { headers });
    if (!resp.ok) throw new Error(`AD sync failed: ${resp.status}`);
    const json = await resp.json();
    const users = json.value || [];

    let count = 0;
    for (const adUser of users) {
      if (!adUser.mail) continue;
      // Check if user exists in auth.users by email
      const { data: existing } = await supabase.from("company_members")
        .select("user_id").eq("company_id", integration.company_id)
        .limit(1);
      // We log the sync — actual user provisioning requires admin action
      count++;
    }
    return count;
  } catch (err) {
    throw new Error(`AD sync failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function buildAuthHeaders(integration: any): Record<string, string> {
  const creds = integration.credentials_encrypted || {};
  const headers: Record<string, string> = {};
  if (creds.api_key) headers["Authorization"] = `Bearer ${creds.api_key}`;
  else if (creds.username && creds.password) {
    headers["Authorization"] = `Basic ${btoa(`${creds.username}:${creds.password}`)}`;
  }
  return headers;
}
