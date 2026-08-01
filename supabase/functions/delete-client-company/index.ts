import { createClient } from "jsr:@supabase/supabase-js@2";

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
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verifica se quem chama é admin
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) throw new Error("Não autenticado");

    // O admin do sistema é identificado pelo e-mail do dono do software
    const ADMIN_EMAIL = "clebsonbernardovelho@gmail.com";
    if (user.email !== ADMIN_EMAIL) {
      throw new Error("Apenas o administrador do sistema pode excluir empresas");
    }

    const { company_id, delete_owner_user } = await req.json();
    if (!company_id) throw new Error("company_id é obrigatório");

    // Busca o owner_id antes de excluir (para opcionalmente remover o usuário)
    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("owner_id, name")
      .eq("id", company_id)
      .maybeSingle();

    if (!company) throw new Error("Empresa não encontrada");

    // Exclui a empresa — CASCADE remove members, licenses, machines, etc.
    const { error: delErr } = await supabaseAdmin
      .from("companies")
      .delete()
      .eq("id", company_id);

    if (delErr) {
      console.error("companies delete failed", delErr);
      throw new Error("Não foi possível excluir a empresa.");
    }

    // Opcionalmente exclui o usuário CEO
    let userDeleted = false;
    if (delete_owner_user && company.owner_id) {
      const { error: userErr } = await supabaseAdmin.auth.admin.deleteUser(company.owner_id);
      userDeleted = !userErr;
    }

    return new Response(
      JSON.stringify({
        success: true,
        company_name: company.name,
        user_deleted: userDeleted,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("delete-client-company failed", err);
    const message = err instanceof Error ? err.message : "Não foi possível concluir a operação.";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
