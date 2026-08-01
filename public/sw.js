// Service worker for CLEVIA — push notifications + offline caching

const CACHE_NAME = "clevia-v2";
const STATIC_ASSETS = ["/", "/index.html", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/logo.svg"];

// ─── Install: pre-cache static assets ───
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

// ─── Activate: clean old caches ───
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ─── Fetch: network-first for navigation, cache-first for assets ───
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Skip non-GET and Supabase API calls
  if (req.method !== "GET" || req.url.includes("supabase.co") || req.url.includes("/functions/")) {
    return;
  }

  // Navigation requests: network-first, fallback to cached page
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return resp;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match("/index.html")))
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((resp) => {
        if (resp.ok && resp.type === "basic") {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return resp;
      }).catch(() => cached);
    })
  );
});

// ─── Push notifications ───
self.addEventListener("push", (event) => {
  let data;
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = data.title || "CLEVIA";
  const body = data.body || "Nova notificação";
  const url = data.url || "/";

  const isOsUrgent = data.tag === "clevia-os-urgent" || data.tag === "clevia-os-reminder";

  let options;
  if (isOsUrgent) {
    options = {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url },
      tag: data.tag || "clevia-os-urgent",
      renotify: true,
      requireInteraction: true,
      silent: false,
      vibrate: [500, 200, 500, 200, 500, 200, 800, 200, 500, 200, 500, 200, 800],
      actions: [{ action: "view", title: "Ver OS" }],
    };
  } else {
    const isReminder = data.tag === "clevia-reminder";
    options = {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url },
      tag: isReminder ? "clevia-reminder" : "clevia-os-" + Date.now(),
      renotify: true,
      requireInteraction: isReminder ? false : true,
      silent: false,
      vibrate: isReminder ? [400, 150, 400, 150, 600] : [300, 100, 300, 100, 400],
    };
  }

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client && "navigate" in client) {
            client.focus();
            client.navigate(url);
            return;
          }
        }
        return self.clients.openWindow(url);
      })
  );
});
