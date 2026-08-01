import { createClient } from "npm:@supabase/supabase-js@2";

function cryptoRandomPassword(length = 24): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%";
  const bytes = new Uint8Array(length);
  (crypto as any).getRandomValues(bytes);
  return Array.from(bytes, (b: number) => chars[b % chars.length]).join("");
}

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Client com service role para criar usuário e inserir membro
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verifica o JWT do chamador para garantir que está autenticado
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Não autorizado." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const body = await req.json();
    const { email, password, displayName, role, companyId } = body as {
      email: string;
      password: string;
      displayName: string;
      role: string;
      companyId: string;
    };

    if (!email || !role || !companyId) {
      return new Response(JSON.stringify({ error: "Dados incompletos." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // O papel precisa ser um dos conhecidos: o corpo da requisição não pode inventar papel.
    const ALLOWED_ROLES = ["ceo", "gerente", "solicitante", "mecanico", "supervisora"];
    if (!ALLOWED_ROLES.includes(role)) {
      return new Response(JSON.stringify({ error: "Função inválida." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verifica se o chamador é admin (ceo/gerente) da empresa
    const { data: callerMember } = await admin
      .from("company_members")
      .select("role")
      .eq("user_id", callerUser.user.id)
      .eq("company_id", companyId)
      .maybeSingle();

    if (!callerMember || !["ceo", "gerente"].includes(callerMember.role)) {
      return new Response(
        JSON.stringify({ error: "Você não tem permissão para adicionar usuários." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Somente o CEO pode conceder os papeis administrativos.
    const PRIVILEGED_ROLES = ["ceo", "gerente"];
    if (PRIVILEGED_ROLES.includes(role) && callerMember.role !== "ceo") {
      return new Response(
        JSON.stringify({ error: "Apenas o CEO pode criar usuários com essa função." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Cria o usuário no auth (se ainda não existir)
    let userId: string | null = null;
    let createdNow = false;
    let linkedExisting = false;

    const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: password || cryptoRandomPassword(),
      email_confirm: true,
    });

    if (createErr) {
      if (!createErr.message.toLowerCase().includes("already")) {
        console.error("createUser failed", createErr);
        return new Response(JSON.stringify({ error: "Não foi possível criar o usuário." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // E-mail já existe no auth: localiza o usuário existente
      const normalizedEmail = email.trim().toLowerCase();
      let existingId: string | null = null;
      for (let page = 1; page <= 20 && !existingId; page++) {
        const { data: pageData, error: listErr } = await admin.auth.admin.listUsers({
          page,
          perPage: 200,
        });
        if (listErr) {
          console.error("listUsers failed", listErr);
          return new Response(JSON.stringify({ error: "Não foi possível concluir a operação." }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const found = pageData.users.find(
          (u) => (u.email ?? "").toLowerCase() === normalizedEmail,
        );
        if (found) existingId = found.id;
        if (pageData.users.length < 200) break;
      }

      // Mensagem única para qualquer conta que já exista fora desta empresa:
      // não revelamos se a conta existe nem a que empresa pertence.
      const GENERIC_TAKEN = "Não é possível usar este e-mail. Verifique o endereço ou use outro.";

      if (!existingId) {
        return new Response(JSON.stringify({ error: GENERIC_TAKEN }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Verifica vínculos existentes desse usuário
      const { data: memberships } = await admin
        .from("company_members")
        .select("company_id")
        .eq("user_id", existingId);

      if (memberships && memberships.some((m) => m.company_id === companyId)) {
        return new Response(
          JSON.stringify({ error: "Este e-mail já faz parte da sua empresa." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // A conta já existe mas não pertence a esta empresa.
      // Vinculamos à empresa atual SEM alterar a senha — a pessoa
      // continua usando a senha que já conhece.
      userId = existingId;
      linkedExisting = true;
    } else {
      userId = newUser.user.id;
      createdNow = true;
    }

    // Vincula à empresa
    const { error: memberErr } = await admin.from("company_members").insert({
      company_id: companyId,
      user_id: userId,
      role,
      display_name: displayName || email.split("@")[0],
    });

    if (memberErr) {
      if (createdNow) await admin.auth.admin.deleteUser(userId);
      console.error("company_members insert failed", memberErr);
      return new Response(
        JSON.stringify({ error: "Não foi possível vincular o usuário à empresa." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Se for mecânico, cria registro na tabela mechanics (reaproveita se já existir)
    if (role === "mecanico") {
      const { data: existingMech } = await admin
        .from("mechanics")
        .select("id")
        .eq("company_id", companyId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!existingMech) {
        await admin.from("mechanics").insert({
          company_id: companyId,
          user_id: userId,
          name: displayName || email.split("@")[0],
          status: "disponivel",
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, userId, linkedExisting }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("create-team-member error", err);
    return new Response(
      JSON.stringify({ error: "Não foi possível concluir a operação." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
