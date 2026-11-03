// BYOT service worker: cache-first for the app shell, network-first for the rest.
// Paths are resolved against the worker's scope, so the app works from any subpath.
const CACHE = "byot-v1";
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
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  url.hash = "";
  const scopeRoot = self.registration.scope;
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
