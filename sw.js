// BYOT service worker.
// - App shell: cache-first (works offline after the first visit).
// - Database API GETs (paths containing /api/): stale-while-revalidate. A verse
//   viewed once reopens offline; the cache refreshes in the background.
//   Only successful JSON responses are cached. With no cache and no network: 503.
// - Everything else: network-first, with cache fallback.
// Paths are resolved against the worker's scope, so the app works from any subpath.
const CACHE = "byot-v3";
const API_CACHE = "byot-api-v2";
const KEEP = [CACHE, API_CACHE];
const SHELL = [
  "./",
  "index.html",
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
  return res.ok && type.includes("json");
}

async function apiResponse(event, req) {
  const cache = await caches.open(API_CACHE);
  const hit = await cache.match(req);
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
    event.respondWith(apiResponse(event, req));
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
