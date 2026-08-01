import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const VAPID_SUBJECT = "mailto:clebsonbernardovelho@gmail.com";

function base64urlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function bytesToBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}

async function hmacSha256(key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, message));
}

async function hkdfExpand(prk: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const input = concatBytes(info, new Uint8Array([1]));
  const block = await hmacSha256(prk, input);
  return block.subarray(0, length);
}

async function importVapidSigningKey(publicKeyB64: string, privateKeyB64: string): Promise<CryptoKey> {
  const pub = base64urlToBytes(publicKeyB64);
  const jwk = {
    kty: "EC",
    crv: "P-256",
    d: privateKeyB64,
    x: bytesToBase64url(pub.subarray(1, 33)),
    y: bytesToBase64url(pub.subarray(33, 65)),
  };
  return await crypto.subtle.importKey(
    "jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"],
  );
}

async function createVapidJwt(endpoint: string, publicKeyB64: string, privateKeyB64: string): Promise<string> {
  const audience = new URL(endpoint).origin;
  const header = { typ: "JWT", alg: "ES256" };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: VAPID_SUBJECT,
  };
  const enc = (obj: unknown) => bytesToBase64url(new TextEncoder().encode(JSON.stringify(obj)));
  const token = `${enc(header)}.${enc(payload)}`;
  const signingKey = await importVapidSigningKey(publicKeyB64, privateKeyB64);
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    signingKey,
    new TextEncoder().encode(token),
  );
  return `${token}.${bytesToBase64url(new Uint8Array(signature))}`;
}

async function encryptPayload(
  payload: string,
  userPublicKey: string,
  userAuth: string,
): Promise<Uint8Array> {
  const uaPublic = base64urlToBytes(userPublicKey);
  const authSecret = base64urlToBytes(userAuth);

  const serverKeys = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"],
  );
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", serverKeys.publicKey));

  const uaKey = await crypto.subtle.importKey(
    "raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, [],
  );
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, serverKeys.privateKey, 256),
  );

  const prkKey = await hmacSha256(authSecret, ecdhSecret);
  const keyInfo = concatBytes(new TextEncoder().encode("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hkdfExpand(prkKey, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmacSha256(salt, ikm);
  const cek = await hkdfExpand(prk, new TextEncoder().encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdfExpand(prk, new TextEncoder().encode("Content-Encoding: nonce\0"), 12);

  const plaintext = concatBytes(new TextEncoder().encode(payload), new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, plaintext),
  );

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concatBytes(salt, rs, new Uint8Array([asPublic.length]), asPublic, ciphertext);
}

async function sendPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: string,
  vapidPublic: string,
  vapidPrivate: string,
): Promise<{ ok: boolean; status: number }> {
  const jwt = await createVapidJwt(subscription.endpoint, vapidPublic, vapidPrivate);
  const body = await encryptPayload(payload, subscription.p256dh, subscription.auth);

  const response = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      "TTL": "60",
      "Urgency": "high",
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      "Content-Length": String(body.length),
      "Authorization": `vapid t=${jwt}, k=${vapidPublic}`,
    },
    body,
  });
  if (!response.ok) await response.text().catch(() => "");
  return { ok: response.ok, status: response.status };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MAX_LOOP_DURATION_MS = 5 * 60 * 1000; // 5 minutes max
const LOOP_INTERVAL_MS = 15_000; // 15 seconds

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { work_order_id, user_ids, title, body, url } = await req.json();

    if (!work_order_id || !Array.isArray(user_ids) || user_ids.length === 0) {
      return new Response(
        JSON.stringify({ error: "work_order_id and user_ids array are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // O chamador precisa estar autenticado e pertencer à empresa da OS.
    const authHeader = req.headers.get("Authorization") ?? "";
    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const { data: callerData } = await callerClient.auth.getUser();
    const callerId = callerData?.user?.id;
    if (!callerId) {
      return new Response(
        JSON.stringify({ error: "Não autorizado." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: workOrder } = await supabase
      .from("work_orders")
      .select("company_id")
      .eq("id", work_order_id)
      .maybeSingle();
    if (!workOrder) {
      return new Response(
        JSON.stringify({ error: "Ordem de serviço não encontrada." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: companyMembers } = await supabase
      .from("company_members")
      .select("user_id")
      .eq("company_id", workOrder.company_id);
    const memberIds = new Set((companyMembers ?? []).map((m) => m.user_id));
    if (!memberIds.has(callerId)) {
      return new Response(
        JSON.stringify({ error: "Sem permissão para notificar esta empresa." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Restringe os destinatários aos membros da mesma empresa da OS.
    const targetIds = (user_ids as string[]).filter((id) => memberIds.has(id));
    if (targetIds.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, message: "No permitted recipients" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Load VAPID keys
    const { data: settings } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", ["vapid_public_key", "vapid_private_key"]);
    const vapidPublic = settings?.find((s) => s.key === "vapid_public_key")?.value ?? "";
    const vapidPrivate = settings?.find((s) => s.key === "vapid_private_key")?.value ?? "";
    if (!vapidPublic || !vapidPrivate) {
      return new Response(
        JSON.stringify({ error: "VAPID keys not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Load subscriptions for the target mechanics
    const { data: subscriptions } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth, user_id")
      .in("user_id", targetIds);

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, message: "No subscriptions found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const deadEndpoints: string[] = [];
    let totalSent = 0;

    // Build push payload — first notification is the "alert" (urgent), reminders use a tag so they replace each other
    const buildPayload = (isReminder: boolean, attempt: number) => JSON.stringify({
      title: isReminder ? `URGENTE: ${title}` : title,
      body: isReminder ? `OS aguardando aceitação (${attempt}º aviso)` : body,
      url: url || "/#workorders",
      tag: isReminder ? "clevia-os-reminder" : "clevia-os-urgent",
      isReminder,
      attempt,
    });

    const sendToAll = async (payloadStr: string): Promise<void> => {
      const results = await Promise.all(
        subscriptions.map(async (sub) => {
          try {
            return await sendPush(sub, payloadStr, vapidPublic, vapidPrivate);
          } catch {
            return { ok: false, status: 0 };
          }
        }),
      );
      for (let i = 0; i < results.length; i++) {
        if (results[i].ok) totalSent++;
        else if (results[i].status === 404 || results[i].status === 410) {
          deadEndpoints.push(subscriptions[i].endpoint);
        }
      }
    };

    // === FIRST PUSH — instant, no delay ===
    await sendToAll(buildPayload(false, 0));

    // === REMINDER LOOP — every 15 seconds until OS is accepted or max duration ===
    const startTime = Date.now();
    let attempt = 0;

    while (Date.now() - startTime < MAX_LOOP_DURATION_MS) {
      await sleep(LOOP_INTERVAL_MS);

      // Check if the OS is still in 'aberta' status
      const { data: wo } = await supabase
        .from("work_orders")
        .select("status")
        .eq("id", work_order_id)
        .maybeSingle();

      // If OS no longer exists or is no longer 'aberta', stop the loop
      if (!wo || wo.status !== "aberta") {
        break;
      }

      attempt++;
      await sendToAll(buildPayload(true, attempt));
    }

    // Cleanup dead endpoints
    if (deadEndpoints.length > 0) {
      const unique = [...new Set(deadEndpoints)];
      await supabase.from("push_subscriptions").delete().in("endpoint", unique);
    }

    return new Response(
      JSON.stringify({ sent: totalSent, attempts: attempt, stopped: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("os-alert-loop error", err);
    return new Response(
      JSON.stringify({ error: "Não foi possível enviar os alertas." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
