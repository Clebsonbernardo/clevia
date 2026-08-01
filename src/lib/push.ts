import { supabase } from "@/lib/supabase";

const VAPID_PUBLIC_KEY = async (): Promise<string> => {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "vapid_public_key")
    .maybeSingle();
  return data?.value ?? "";
};

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function subscribeToPush(
  userId: string,
  companyId: string,
): Promise<boolean> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return false;
  }

  const registration = await navigator.serviceWorker.ready;
  const existingSub = await registration.pushManager.getSubscription();
  if (existingSub) {
    await saveSubscription(existingSub, userId, companyId);
    return true;
  }

  const publicKey = await VAPID_PUBLIC_KEY();
  if (!publicKey) return false;

  const sub = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  await saveSubscription(sub, userId, companyId);
  return true;
}

export async function unsubscribeFromPush(userId: string): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;
  const registration = await navigator.serviceWorker.ready;
  const existingSub = await registration.pushManager.getSubscription();
  if (existingSub) {
    await existingSub.unsubscribe();
  }
  await supabase.from("push_subscriptions").delete().eq("user_id", userId).then(({ error }: { error: { message: string } | null }) => { if (error) console.error('push unsubscribe failed', error); });
  return true;
}

export async function isPushSubscribed(userId: string): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;
  const registration = await navigator.serviceWorker.ready;
  const sub = await registration.pushManager.getSubscription();
  if (!sub) return false;
  const { data } = await supabase
    .from("push_subscriptions")
    .select("id")
    .eq("user_id", userId)
    .eq("endpoint", sub.endpoint)
    .maybeSingle();
  return !!data;
}

async function saveSubscription(
  sub: PushSubscription,
  userId: string,
  companyId: string,
) {
  const payload = {
    user_id: userId,
    company_id: companyId,
    endpoint: sub.endpoint,
    p256dh: arrayBufferToBase64(sub.getKey("p256dh")),
    auth: arrayBufferToBase64(sub.getKey("auth")),
  };

  const { data: existing } = await supabase
    .from("push_subscriptions")
    .select("id")
    .eq("user_id", userId)
    .eq("endpoint", sub.endpoint)
    .maybeSingle();

  if (existing) {
    const { error: updErr } = await supabase
      .from("push_subscriptions")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (updErr) console.error('push subscription update failed', updErr);
  } else {
    const { error: insErr } = await supabase.from("push_subscriptions").insert(payload);
    if (insErr) console.error('push subscription insert failed', insErr);
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function registerServiceWorker(): Promise<void> {
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    } catch {
      // Service worker registration failed — push won't work but app continues
    }
  }
}
