// Builds the public GitHub Pages site (index, offline worker, manifest, icons) into the bar-book repo.
const fs = require("fs");
const { chromium } = require("playwright");
const OUT = process.argv[2];
const VERSION = new Date().toISOString().slice(0, 16);
// Live team feed: only built once the owner's Firebase web config is in firebase-config.json (the config is public by design;
// access is controlled by firestore.rules). LIVE_EMU=1 LIVE_CONFIG=firebase-config.emu.json points it at the local emulators for testing.
const CONFIG_FILE = process.env.LIVE_CONFIG || "firebase-config.json";
const CONFIG = fs.existsSync(CONFIG_FILE) ? fs.readFileSync(CONFIG_FILE, "utf8") : null;
if (CONFIG) require("esbuild").buildSync({ entryPoints: ["live-src.js"], bundle: true, format: "esm", minify: true, target: "es2020", outfile: OUT + "/live.js", define: { __CONFIG__: CONFIG, __EMU__: String(!!process.env.LIVE_EMU) } });

const head = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex"><meta name="description" content="Every Black Tap Soho drink: specs, step-by-step guides and allergens. Staff only."><meta property="og:title" content="Black Tap Bar Book"><meta property="og:description" content="Every Black Tap Soho drink: specs, step-by-step guides and allergens. Staff only."><meta property="og:image" content="https://rickdsage.github.io/bar-book/og.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:url" content="https://rickdsage.github.io/bar-book/"><meta property="og:type" content="website"><meta name="twitter:card" content="summary_large_image"><meta name="theme-color" content="#15130f"><meta name="apple-mobile-web-app-status-bar-style" content="black"><link rel="manifest" href="manifest.webmanifest"><link rel="apple-touch-icon" href="icon-180.png"><link rel="icon" href="icon-192.png"><style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style></head><body>`;
fs.writeFileSync(OUT + "/index.html", head + fs.readFileSync("black-tap-bar-app.html", "utf8") + (CONFIG ? `<script type="module" src="live.js"></script>` : "") + "</body></html>");

fs.writeFileSync(OUT + "/manifest.webmanifest", JSON.stringify({
  id: "./", name: "Black Tap Bar Book", short_name: "Bar Book", description: "Every Black Tap Soho drink: specs, step-by-step guides and allergens.", orientation: "portrait", start_url: "./", scope: "./", display: "standalone",
  background_color: "#15130f", theme_color: "#15130f",
  icons: [{ src: "icon-192.png", sizes: "192x192", type: "image/png" }, { src: "icon-512.png", sizes: "512x512", type: "image/png" }, { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }],
}, null, 2));

// Offline: pages come from the network when there is signal (so updates arrive), from the cache when not.
fs.writeFileSync(OUT + "/sw.js", `// Bar Book offline support. Version ${VERSION}
const CACHE = "bar-book-${VERSION}";
const CORE = ["./", ${CONFIG ? '"live.js", ' : ""}"manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png"];
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
`);

(async () => {
  const font = fs.readFileSync("/mnt/project-files/black-tap-menu/data/fonts/lexend-800.ttf").toString("base64");
  const html = (n) => `<style>@font-face{font-family:L;src:url(data:font/ttf;base64,${font})}html,body{margin:0;width:${n}px;height:${n}px;background:#15130f}</style>
  <svg width="${n}" height="${n}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <rect width="100" height="100" fill="#15130f"/>
    <path d="M24 22 H76 C76 40 64 48 50 48 C36 48 24 40 24 22Z" fill="#e0ad4f"/>
    <path d="M24 22 H76 C76 40 64 48 50 48 C36 48 24 40 24 22Z M50 48 V66 M38 66 H62" stroke="#f4eee4" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="50" y="88" text-anchor="middle" font-family="L" font-weight="800" font-size="12.5" letter-spacing=".5" fill="#f4eee4">BAR BOOK</text>
  </svg>`;
  const b = await chromium.launch();
  // Link preview card for group chats.
  const og = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await og.setContent(`<style>@font-face{font-family:L;src:url(data:font/ttf;base64,${font})}html,body{margin:0;width:1200px;height:630px;background:#15130f;color:#f4eee4;font-family:L}
    .w{display:flex;align-items:center;gap:70px;padding:0 90px;height:630px}h1{font-size:104px;line-height:.95;margin:0;letter-spacing:1px}h1 span{color:#e0ad4f}p{font-size:34px;color:#b3a998;margin:28px 0 0;font-weight:400}small{display:block;font-size:21px;color:#b3a998;margin-top:40px;letter-spacing:2px;white-space:nowrap}small b{color:#e0ad4f}</style>
    <div class="w"><svg width="300" height="300" viewBox="0 0 100 100"><path d="M24 22 H76 C76 40 64 48 50 48 C36 48 24 40 24 22Z" fill="#e0ad4f"/><path d="M24 22 H76 C76 40 64 48 50 48 C36 48 24 40 24 22Z M50 48 V66 M38 66 H62" stroke="#f4eee4" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <div><h1>BLACK TAP<br><span>BAR BOOK</span></h1><p>Specs, step-by-step guides<br>and allergens for every drink.</p><small>SOHO STAFF · DEVELOPED BY <b>CHARLES AGYEI II</b></small></div></div>`);
  await og.waitForTimeout(150); await og.screenshot({ path: `${OUT}/og.png` }); await og.close();
  for (const n of [180, 192, 512]) {
    const p = await b.newPage({ viewport: { width: n, height: n } });
    await p.setContent(html(n)); await p.waitForTimeout(150);
    await p.screenshot({ path: `${OUT}/icon-${n}.png` });
    await p.close();
  }
  // Android crops icons to a circle or squircle, so the maskable icon keeps the art inside the middle 70%.
  const m = await b.newPage({ viewport: { width: 512, height: 512 } });
  await m.setContent(`<style>html,body{margin:0;background:#15130f}div{width:512px;height:512px;display:flex;align-items:center;justify-content:center}</style><div>${html(340).replace(/html,body\{[^}]*\}/, "")}</div>`);
  await m.waitForTimeout(150); await m.screenshot({ path: `${OUT}/icon-maskable-512.png` }); await m.close();
  await b.close();
  console.log("site built", VERSION);
})();
