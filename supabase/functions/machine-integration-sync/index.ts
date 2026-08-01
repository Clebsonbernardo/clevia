import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Só permitimos buscar URLs externas públicas via https, e nunca endereços internos.
function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    h === "localhost" ||
    h === "0.0.0.0" ||
    h.endsWith(".localhost") ||
    h.endsWith(".internal") ||
    h.endsWith(".local")
  ) return true;
  // IPv6 loopback / link-local / unique-local
  if (h === "::1" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true;

  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local / metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
  }
  return false;
}

function safeExternalUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  if (isPrivateHost(u.hostname)) return null;
  return u.toString();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Não autorizado." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Escopo: o job agendado (service role) sincroniza tudo; um usuário logado só
    // pode sincronizar as integrações da(s) empresa(s) em que é CEO.
    let allowedCompanyIds: string[] | null = null; // null = todas (service role)

    if (token !== serviceRoleKey) {
      const caller = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: callerUser, error: callerErr } = await caller.auth.getUser();
      if (callerErr || !callerUser.user) {
        return new Response(JSON.stringify({ error: "Sessão inválida." }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: memberships } = await supabase
        .from("company_members")
        .select("company_id, role")
        .eq("user_id", callerUser.user.id)
        .eq("role", "ceo");
      allowedCompanyIds = (memberships ?? []).map((m) => m.company_id);
      if (allowedCompanyIds.length === 0) {
        return new Response(JSON.stringify({ error: "Você não tem permissão para sincronizar." }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Busca as integrações ativas permitidas ao chamador
    let intQuery = supabase
      .from("machine_integrations")
      .select("*")
      .eq("active", true);
    if (allowedCompanyIds) intQuery = intQuery.in("company_id", allowedCompanyIds);

    const { data: integrations, error: ie } = await intQuery;

    if (ie) {
      console.error("machine_integrations select failed", ie);
      return new Response(JSON.stringify({ error: "Não foi possível concluir a operação." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: { integration: string; synced: number; errors: string[] }[] = [];

    for (const integration of integrations ?? []) {
      const errors: string[] = [];
      let synced = 0;

      try {
        // Busca o status das máquinas no sistema externo
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (integration.api_key) {
          headers["Authorization"] = `Bearer ${integration.api_key}`;
        }

        const target = safeExternalUrl(integration.api_url);
        if (!target) {
          errors.push("Endereço do sistema externo inválido (use um endereço https público).");
        } else {
          const response = await fetch(target, {
            headers,
            redirect: "error",
            signal: AbortSignal.timeout(10000),
          });

          if (!response.ok) {
            errors.push(`HTTP ${response.status} do sistema externo`);
          } else {
            const data = await response.json();

            // Espera-se que o sistema externo retorne um array de máquinas:
            // [{ "code": "L100", "status": "trabalhando" | "parada" | "manutencao", "units_produced": 120, "uptime_hours": 8 }, ...]
            const machines: Array<{
              code?: string;
              name?: string;
              status?: string;
              units_produced?: number;
              uptime_hours?: number;
            }> = Array.isArray(data) ? data : (data.machines ?? data.data ?? []);

            for (const m of machines) {
              // Encontra a máquina no CLEVIA pelo código ou nome
              let query = supabase.from("machines").select("id, status").eq("company_id", integration.company_id);
              if (m.code) query = query.eq("code", m.code);
              else if (m.name) query = query.eq("name", m.name);
              else continue;

              const { data: existing } = await query.maybeSingle();
              if (!existing) continue;

              // Atualiza o status da máquina se mudou
              if (m.status && m.status !== existing.status) {
                await supabase.from("machines").update({ status: m.status }).eq("id", existing.id);
              }

              // Registra a produção do dia
              if (m.units_produced !== undefined || m.uptime_hours !== undefined) {
                const today = new Date().toISOString().slice(0, 10);
                const { data: existingLog } = await supabase
                  .from("production_logs")
                  .select("id")
                  .eq("company_id", integration.company_id)
                  .eq("machine_id", existing.id)
                  .eq("log_date", today)
                  .maybeSingle();
                const logRow = {
                  units_produced: m.units_produced ?? 0,
                  uptime_hours: m.uptime_hours ?? 0,
                };
                if (existingLog) {
                  await supabase.from("production_logs").update(logRow).eq("id", existingLog.id);
                } else {
                  await supabase.from("production_logs").insert({
                    company_id: integration.company_id,
                    machine_id: existing.id,
                    log_date: today,
                    ...logRow,
                  });
                }
              }

              synced += 1;
            }
          }
        }
      } catch (err) {
        console.error("integration sync failed", integration.id, err);
        errors.push("Não foi possível sincronizar com o sistema externo.");
      }

      // Atualiza last_sync_at
      await supabase.from("machine_integrations")
        .update({ last_sync_at: new Date().toISOString() })
        .eq("id", integration.id);

      results.push({ integration: integration.name, synced, errors });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("machine-integration-sync failed", err);
    return new Response(
      JSON.stringify({ error: "Erro interno." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
