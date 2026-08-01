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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const alerts: string[] = [];

    // 1. Preventive overdue — check all companies
    const { data: overduePreventives } = await supabase
      .from("preventive_plans")
      .select("id, company_id, title, next_date, machine_id")
      .lt("next_date", new Date().toISOString().split("T")[0])
      .eq("status", "ativo");

    if (overduePreventives) {
      for (const p of overduePreventives) {
        alerts.push(`preventive_overdue:${p.company_id}:${p.id}`);
        // Create notification for company members
        await supabase.from("notifications").insert({
          company_id: p.company_id,
          title: "Preventiva Vencida",
          body: `A manutenção preventiva "${p.title}" está vencida.`,
          notification_type: "preventive_overdue",
        });
      }
    }

    // 2. Low stock — items below minimum quantity
    const { data: lowStockItems } = await supabase
      .from("inventory_items")
      .select("id, company_id, name, quantity, min_quantity")
      .filter("quantity", "lte", "min_quantity");

    if (lowStockItems) {
      for (const item of lowStockItems) {
        if (item.quantity <= (item.min_quantity || 0)) {
          alerts.push(`low_stock:${item.company_id}:${item.id}`);
          await supabase.from("notifications").insert({
            company_id: item.company_id,
            title: "Peça em Falta",
            body: `A peça "${item.name}" está abaixo do estoque mínimo (${item.quantity} unidades).`,
            notification_type: "low_stock",
          });
        }
      }
    }

    // 3. Machine stopped / critical — machines in maintenance or waiting for mechanic
    const { data: criticalMachines } = await supabase
      .from("machines")
      .select("id, company_id, name, code, status")
      .in("status", ["manutencao", "aguardando_mecanico"]);

    if (criticalMachines) {
      for (const m of criticalMachines) {
        alerts.push(`machine_critical:${m.company_id}:${m.id}`);
        await supabase.from("notifications").insert({
          company_id: m.company_id,
          title: "Máquina Crítica",
          body: `Máquina ${m.code} - ${m.name} está em status crítico: ${m.status}.`,
          notification_type: "machine_critical",
        });
      }
    }

    // 4. Recurring failures — machines with 3+ work orders in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const { data: recentWOs } = await supabase
      .from("work_orders")
      .select("id, company_id, machine_id, created_at")
      .gte("created_at", thirtyDaysAgo.toISOString());

    if (recentWOs) {
      const machineWOCount: Record<string, { count: number; company_id: string }> = {};
      for (const wo of recentWOs) {
        if (wo.machine_id) {
          if (!machineWOCount[wo.machine_id]) {
            machineWOCount[wo.machine_id] = { count: 0, company_id: wo.company_id };
          }
          machineWOCount[wo.machine_id].count++;
        }
      }
      for (const [machineId, info] of Object.entries(machineWOCount)) {
        if (info.count >= 3) {
          alerts.push(`recurring_failure:${info.company_id}:${machineId}`);
          await supabase.from("notifications").insert({
            company_id: info.company_id,
            title: "Falha Recorrente",
            body: `Máquina com ${info.count} ordens de serviço nos últimos 30 dias. Possível falha recorrente.`,
            notification_type: "recurring_failure",
          });
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        alerts_generated: alerts.length,
        alert_types: alerts,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
