// Bar Book offline support. Version 2026-10-24T12:24
const CACHE = "bar-book-2026-10-24T12:24";
const CORE = ["./", "manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png"];
// Safari refuses to show a page from a response that was redirected, so store a clean copy.
const clean = (res) => (res.redirected ? res.blob().then((b) => new Response(b, { status: 200, headers: res.headers })) : Promise.resolve(res));
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(CORE.map((u) => fetch(u, { cache: "reload" }).then(clean).then((res) => c.put(u, res))))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const font = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (url.origin !== location.origin && !font) return;
  if (font) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })));
    return;
  }
  e.respondWith(fetch(req).then(clean).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req.mode === "navigate" ? "./" : req, copy)); }
    return res;
  }).catch(() => caches.match(req.mode === "navigate" ? "./" : req, { ignoreSearch: true }).then((hit) => hit || caches.match("./"))));
});
