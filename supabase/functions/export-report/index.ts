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
    const { company_id, report_type, period, custom_start, custom_end, format } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { start, end } = getPeriodRange(period, custom_start, custom_end);
    const rows = await fetchReportData(supabase, company_id, report_type, start, end);
    const reportLabel = getReportLabel(report_type);

    if (format === "pdf") {
      const html = buildPDFHtml(reportLabel, start, end, rows);
      return new Response(JSON.stringify({ html, filename: `relatorio_${report_type}_${start}.html` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      const csv = buildCSV(rows);
      return new Response(JSON.stringify({ csv, filename: `relatorio_${report_type}_${start}.csv` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function getPeriodRange(period: string, customStart?: string, customEnd?: string) {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  switch (period) {
    case "today": return { start: fmt(today), end: fmt(today) };
    case "yesterday": { const y = new Date(today); y.setDate(y.getDate() - 1); return { start: fmt(y), end: fmt(y) }; }
    case "week": { const w = new Date(today); w.setDate(w.getDate() - 6); return { start: fmt(w), end: fmt(today) }; }
    case "month": return { start: new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0], end: fmt(today) };
    case "year": return { start: new Date(today.getFullYear(), 0, 1).toISOString().split("T")[0], end: fmt(today) };
    case "custom": return { start: customStart || fmt(today), end: customEnd || fmt(today) };
    default: return { start: fmt(today), end: fmt(today) };
  }
}

function getReportLabel(type: string): string {
  const labels: Record<string, string> = {
    production: "Produção", maintenance: "Manutenção", costs: "Custos",
    machines: "Máquinas", parts: "Peças", mechanics: "Mecânicos",
    operators: "Operadores", sectors: "Setores", companies: "Empresas",
  };
  return labels[type] || type;
}

async function fetchReportData(supabase: any, cid: string, type: string, start: string, end: string): Promise<Record<string, unknown>[]> {
  let rows: Record<string, unknown>[] = [];

  if (type === "production") {
    const { data: logs } = await supabase.from("production_logs").select("machine_id, log_date, units_produced, uptime_hours").eq("company_id", cid).gte("log_date", start).lte("log_date", end).order("log_date", { ascending: false });
    const { data: machines } = await supabase.from("machines").select("id, name, code").eq("company_id", cid);
    const machineMap: Record<string, string> = {};
    (machines || []).forEach((m: any) => { machineMap[m.id] = `${m.code} - ${m.name}`; });
    rows = (logs || []).map((l: any) => ({ Máquina: machineMap[l.machine_id] || "—", Data: l.log_date, "Unidades Produzidas": l.units_produced, "Horas Operando": l.uptime_hours }));
  } else if (type === "maintenance") {
    const { data: wos } = await supabase.from("work_orders").select("*").eq("company_id", cid).gte("created_at", start).lte("created_at", end + "T23:59:59").order("created_at", { ascending: false });
    rows = (wos || []).map((w: any) => ({ "OS #": w.os_number || w.id?.toString().slice(0, 8), Título: w.title || "—", Status: w.status, Prioridade: w.priority, Defeito: w.defect || "—", Abertura: w.created_at, Finalização: w.finished_at || "—" }));
  } else if (type === "machines") {
    const { data: machines } = await supabase.from("machines").select("*").eq("company_id", cid).order("sector");
    rows = (machines || []).map((m: any) => ({ Código: m.code, Nome: m.name, Setor: m.sector, Modelo: m.model, Fabricante: m.manufacturer, Status: m.status, Criticidade: m.criticality }));
  } else if (type === "parts") {
    const { data: items } = await supabase.from("inventory_items").select("*").eq("company_id", cid).order("name");
    rows = (items || []).map((i: any) => ({ Código: i.code, Nome: i.name, Categoria: i.category, Quantidade: i.quantity, "Qtd Mínima": i.min_quantity, Localização: i.location, Custo: i.cost, Fornecedor: i.supplier }));
  } else if (type === "mechanics") {
    const { data: mechs } = await supabase.from("mechanics").select("*").eq("company_id", cid).order("name");
    const { data: wos } = await supabase.from("work_orders").select("mechanic_id, status").eq("company_id", cid).gte("created_at", start).lte("created_at", end + "T23:59:59");
    const woCount: Record<string, number> = {};
    (wos || []).forEach((w: any) => { if (w.mechanic_id) woCount[w.mechanic_id] = (woCount[w.mechanic_id] || 0) + 1; });
    rows = (mechs || []).map((m: any) => ({ Nome: m.name, Especialidade: m.specialty, Telefone: m.phone, Status: m.status, "OS no Período": woCount[m.id] || 0 }));
  }

  return rows;
}

function buildPDFHtml(label: string, start: string, end: string, rows: Record<string, unknown>[]): string {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relatório ${label}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #1e293b; }
    h1 { color: #0891b2; border-bottom: 2px solid #0891b2; padding-bottom: 10px; }
    .meta { color: #64748b; margin-bottom: 20px; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th { background: #0891b2; color: white; padding: 10px 12px; text-align: left; font-size: 13px; }
    td { padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 12px; }
    tr:nth-child(even) { background: #f8fafc; }
    .footer { margin-top: 40px; font-size: 11px; color: #94a3b8; text-align: center; }
  </style></head><body>
  <h1>CLEVIA — Relatório de ${label}</h1>
  <div class="meta">Período: ${start} a ${end} · Gerado em: ${new Date().toLocaleString("pt-BR")}</div>
  <table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
  <tbody>${rows.map((row) => `<tr>${headers.map((h) => `<td>${String(row[h] ?? "—")}</td>`).join("")}</tr>`).join("")}</tbody></table>
  <div class="footer">CLEVIA Cloud — Plataforma Inteligente de Gestão Industrial</div>
  </body></html>`;
}

function buildCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(";"),
    ...rows.map((row) => headers.map((h) => `"${String(row[h] ?? "").replace(/"/g, '""')}"`).join(";")),
  ];
  return "\ufeff" + lines.join("\n");
}
