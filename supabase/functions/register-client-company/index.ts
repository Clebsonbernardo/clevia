import { createClient } from 'npm:@supabase/supabase-js@2';

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

    // Somente o administrador do sistema pode cadastrar empresas clientes.
    // O JWT precisa ser de um usuário real: a chave anônima é pública e não basta.
    const ADMIN_EMAIL = "clebsonbernardovelho@gmail.com";
    const authHeader = req.headers.get("Authorization") ?? "";
    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false, autoRefreshToken: false },
      }
    );
    const { data: callerData } = await callerClient.auth.getUser();
    if (!callerData?.user) {
      return new Response(
        JSON.stringify({ error: "Não autorizado." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (callerData.user.email !== ADMIN_EMAIL) {
      return new Response(
        JSON.stringify({ error: "Apenas o administrador do sistema pode cadastrar empresas." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { company_name, cnpj, ceo_email, ceo_password, ceo_name, monthly_fee, plan } = await req.json();

    if (!company_name || !ceo_email || !ceo_password) {
      return new Response(
        JSON.stringify({ error: "Nome da empresa, e-mail e senha do cliente são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Cria o usuário CEO (cliente) primeiro, para termos o owner_id
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email: ceo_email,
      password: ceo_password,
      email_confirm: true,
      user_metadata: { display_name: ceo_name || "" },
    });

    let userId: string;
    let userCreated = false;

    if (authErr) {
      // Se o usuário já existe, apenas usamos o e-mail para buscar
      if (authErr.message.includes("already") || authErr.message.includes("registered")) {
        const { data: existingUser } = await supabaseAdmin.auth.admin.listUsers();
        const found = existingUser?.users?.find((u: { email: string; id: string }) => u.email === ceo_email);
        if (!found) throw new Error("Não foi possível concluir o cadastro.");
        userId = found.id;
      } else {
        console.error("createUser failed", authErr);
        throw new Error("Não foi possível criar o usuário.");
      }
    } else {
      userId = authData.user.id;
      userCreated = true;
    }

    // 2. Cria a empresa, definindo o CEO como owner (owner_id é NOT NULL)
    const { data: company, error: companyErr } = await supabaseAdmin
      .from("companies")
      .insert({ name: company_name, cnpj: cnpj || null, owner_id: userId })
      .select()
      .single();

    if (companyErr) {
      console.error("company insert failed", companyErr);
      throw new Error("Não foi possível criar a empresa.");
    }

    // 3. Vincula o usuário como CEO da empresa
    const { error: memberErr } = await supabaseAdmin
      .from("company_members")
      .insert({
        company_id: company.id,
        user_id: userId,
        role: "ceo",
        display_name: ceo_name || null,
      });

    if (memberErr) {
      console.error("member insert failed", memberErr);
      throw new Error("Não foi possível vincular o usuário à empresa.");
    }

    // 4. A licença TRIAL é criada automaticamente pelo trigger.
    // Se o admin escolheu plano pago, atualizamos a licença.
    if (plan === "paid" && monthly_fee) {
      const nextDate = new Date(Date.now() + 30 * 86400000);
      await supabaseAdmin
        .from("company_licenses")
        .update({
          plan: "paid",
          status: "active",
          monthly_fee: Number(monthly_fee),
          next_payment_date: nextDate.toISOString().slice(0, 10),
          expires_at: nextDate.toISOString(),
        })
        .eq("company_id", company.id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        company_id: company.id,
        company_name: company.name,
        ceo_user_id: userId,
        user_created: userCreated,
        message: userCreated
          ? "Empresa criada e usuário CEO cadastrado com sucesso"
          : "Empresa criada e vinculado a usuário existente",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("register-client-company error", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Não foi possível concluir a operação." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
