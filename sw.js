// BYOT service worker.
// - App shell: cache-first (works offline after the first visit).
// - Public, anonymous database API GETs: stale-while-revalidate for offline reading.
// - Auth/session endpoints and bearer-authenticated API requests: network-only,
//   never cached or served from the shared API cache.
// - Cache-Control: no-store responses are never cached.
// - Everything else: network-first, with cache fallback.
// Paths are resolved against the worker's scope, so the app works from any subpath.
const CACHE = "byot-v19";
const API_CACHE = "byot-api-v3";
const KEEP = [CACHE, API_CACHE];
const SHELL = [
  "./",
  "index.html",
  "config.js",
  "manifest.webmanifest",
  "icon-180.png",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png",
];
const SHELL_URLS = () => SHELL.map((p) => new URL(p, self.registration.scope).href);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL_URLS())).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isApi(url) {
  return url.pathname.includes("/api/");
}

function isJson(res) {
  const type = res.headers.get("content-type") || "";
  const cacheControl = res.headers.get("cache-control") || "";
  return res.ok && type.includes("json") && !/\bno-store\b/i.test(cacheControl);
}

function isPrivateApiRequest(req, url) {
  // Session/CSRF bootstrap and all bearer-authenticated API responses must
  // never enter the shared service-worker cache.
  return url.pathname.includes("/api/auth/") ||
    url.pathname.includes("/api/bible/") ||
    req.headers.has("authorization");
}

async function apiResponse(event, req) {
  const cache = await caches.open(API_CACHE);
  let hit = await cache.match(req);
  if (hit && /\bno-store\b/i.test(hit.headers.get("cache-control") || "")) {
    await cache.delete(req);
    hit = null;
  }
  const network = fetch(req)
    .then((res) => {
      if (isJson(res)) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  if (hit) {
    event.waitUntil(network);   // refresh in the background
    return hit;
  }
  const res = await network;
  return res || new Response("offline", { status: 503, headers: { "Content-Type": "text/plain" } });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  url.hash = "";
  const scopeRoot = self.registration.scope;

  if (isApi(url)) {
    if (isPrivateApiRequest(req, url)) {
      event.respondWith(fetch(req, { cache: "no-store" }));
      return;
    }
    event.respondWith(apiResponse(event, req));
    return;
  }

  // Deployment config is network-first so a host can change its API origin
  // without leaving installed clients pinned to a stale cached config.js.
  const configUrl = new URL("config.js", scopeRoot).href;
  if (url.href === configUrl) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => caches.open(CACHE).then((c) => c.match(req)))
    );
    return;
  }

  // The scope root and a navigation to it both mean the app page.
  const key = req.mode === "navigate" && url.href.startsWith(scopeRoot) && !url.search
    ? new URL("index.html", scopeRoot).href
    : url.href;

  if (SHELL_URLS().includes(key)) {
    event.respondWith(caches.open(CACHE).then((c) => c.match(key)).then((hit) => hit || fetch(req)));
    return;
  }

  event.respondWith(
    fetch(req)
      .then((res) => {
        // Keep successful and opaque (cross-origin, e.g. Google Fonts) responses for offline use.
        if (res.ok || res.type === "opaque") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match(key)))
  );
});
