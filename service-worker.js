const CACHE_NAME = "daily-discipline-v3";
const ASSETS = [
  "./", "./index.html", "./style.css", "./app.js", "./push-config.js",
  "./manifest.json", "./icons/icon-192.png", "./icons/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith("daily-discipline-") && key !== CACHE_NAME)
      .map(key => caches.delete(key))
  )));
  self.clients.claim();
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(scope.pathname)) return;
  // Prefer fresh JS/HTML/config after a site upgrade, fall back to cached files offline.
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
    }
    return response;
  }).catch(() => caches.match(event.request).then(cached => cached ||
    (event.request.mode === "navigate" ? caches.match("./index.html") : Response.error()))));
});

self.addEventListener("push", event => {
  let payload = { title: "每日自律 · 提醒", body: "你有一項待辦提醒" };
  try {
    if (event.data) {
      const incoming = event.data.json();
      if (incoming && typeof incoming === "object") payload = incoming;
    }
  } catch (_) {}
  const title = typeof payload.title === "string" ? payload.title.slice(0, 60) : "每日自律 · 提醒";
  const body = typeof payload.body === "string" ? payload.body.slice(0, 160) : "你有一項待辦提醒";
  const tag = typeof payload.tag === "string" ? payload.tag.slice(0, 128) : "daily-discipline-push";
  event.waitUntil(self.registration.showNotification(title, {
    body, icon: "./icons/icon-192.png", badge: "./icons/icon-192.png", tag,
    data: { url: self.registration.scope }, renotify: false
  }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const appURL = self.registration.scope;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async clients => {
    for (const client of clients) {
      if (new URL(client.url).origin === self.location.origin && client.url.startsWith(appURL)) return client.focus();
    }
    return self.clients.openWindow(appURL);
  }));
});
