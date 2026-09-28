/* Learnify service worker.
 *
 * Caching strategy:
 *  - /api/*            never cached (authenticated, must be fresh)
 *  - navigations       network-first, falling back to the cached app shell when offline
 *  - /assets/*         cache-first (Vite content-hashes these, so they are immutable)
 *  - icons / manifest  stale-while-revalidate
 * Updates: a new worker waits until the page asks it to activate (SKIP_WAITING), so users
 * choose when to reload and are never stuck on a stale build.
 */
const VERSION = "v12";
const SHELL_CACHE = `learnify-shell-${VERSION}`;
const ASSET_CACHE = `learnify-assets-${VERSION}`;
const SHELL = ["/", "/manifest.json", "/icon.svg", "/icon-192.png", "/theme-init.js"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: "reload" })))));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n.startsWith("learnify-") && n !== SHELL_CACHE && n !== ASSET_CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname === "/health" || url.pathname === "/ready") return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put("/", copy));
          }
          return response;
        })
        .catch(() => caches.match("/").then((cached) => cached || Response.error())),
    );
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  if (SHELL.includes(url.pathname) || url.pathname.startsWith("/icon")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
  }
});

// ---- Push notifications ----

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }
  const title = data.title || "Learnify";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "You have new homework.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag || "learnify", // same tag replaces instead of stacking duplicates
      data: { url: typeof data.url === "string" ? data.url : "/student" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Only same-origin paths are opened.
  const raw = (event.notification.data && event.notification.data.url) || "/student";
  const target = new URL(raw.startsWith("/") && !raw.startsWith("//") ? raw : "/student", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
