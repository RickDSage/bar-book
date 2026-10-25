// Shared setup for the browser tests. They drive the real app (built with `npm run build:emu`) in Chromium
// against the Firestore and Auth emulators, so nothing here can touch the live Firebase project.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const PROJECT = "demo-bar-book";
const FS = `http://127.0.0.1:8080`;
const DOCS = `${FS}/v1/projects/${PROJECT}/databases/(default)/documents`;
// Test-only setup code. The real one lives only in the owner's Firebase console.
export const SETUP_CODE = "test-setup-code-0123456789";
export const OWNER_PIN = "111222", MANAGER_PIN = "222333", STAFF_PIN = "333444";

// Serves a built site folder on a free port.
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".webmanifest": "application/manifest+json", ".txt": "text/plain" };
export function serve(dir) {
  const base = path.join(ROOT, dir);
  if (!fs.existsSync(path.join(base, "index.html"))) throw new Error(`${dir}/index.html is missing. Run npm run build:emu first`);
  const server = http.createServer((req, res) => {
    const file = path.join(base, decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/\/$/, "/index.html"));
    if (!file.startsWith(base) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" }).end(fs.readFileSync(file));
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok({ url: `http://127.0.0.1:${server.address().port}/`, close: () => server.close() })));
}

// A clean emulator: today's rules, no data, no accounts, and a setup code waiting in config/pins.
export async function resetEmulators() {
  const rules = fs.readFileSync(path.join(ROOT, "firestore.rules"), "utf8");
  const put = await fetch(`${FS}/emulator/v1/projects/${PROJECT}:securityRules`, { method: "PUT", body: JSON.stringify({ rules: { files: [{ content: rules }] } }) });
  if (!put.ok) throw new Error(`Rules not loaded: ${await put.text()}`);
  await fetch(`${FS}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" });
  await adminWrite("config/pins", { setup: { stringValue: SETUP_CODE } });
}
// The emulator treats "Bearer owner" as an admin that skips the rules. Test setup only.
export const adminWrite = (p, fields) => fetch(`${DOCS}/${p}`, { method: "PATCH", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" }, body: JSON.stringify({ fields }) });
export const adminGet = (p) => fetch(`${DOCS}/${p}`, { headers: { Authorization: "Bearer owner" } });
// How many logins exist in the Auth emulator, to check that refused writes don't leave stray ones behind.
export const authAccounts = async () => {
  const r = await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:query`, { method: "POST", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" }, body: "{}" });
  return Number((await r.json()).recordsCount);
};

export const launch = () => chromium.launch();
// A phone with the app open and the welcome screen dismissed. Each one is a separate person (own storage).
export async function phone(browser, site, { start = "#w-ok", width = 390 } = {}) {
  const c = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true });
  const p = await c.newPage();
  p.errs = [];
  p.on("pageerror", (e) => p.errs.push(e.message));
  p.on("dialog", (d) => d.accept(p.answer));
  await p.goto(site.url);
  await p.click(start);
  await p.waitForFunction(() => LIVE.ready);
  return p;
}
// After a logout or removal the app wipes its saved data and reloads, so the welcome screen comes back.
export async function afterReload(p) {
  await p.waitForSelector("#w-ok");
  await p.click("#w-ok");
  await p.waitForFunction(() => LIVE.ready && !LIVE.uid);
}
export const toastOf = (p) => p.$eval("#toast", (t) => (t.hidden ? "" : t.textContent));
// Runs a LIVE.api call in the page and reports "allowed" or the error code, for the rule checks.
export const attempt = (p, fn, ...args) => p.evaluate(([f, a]) => (0, eval)(f)(...a).then(() => "allowed", (e) => e.code || e.message), [fn.toString(), args]);

// The usual team: an owner set up through the app, plus whoever else the test asks for.
export async function team(browser, site, people = []) {
  const O = await phone(browser, site);
  await O.evaluate(([pin, code]) => LIVE.api.setup("Olly Owner", "olly", pin, code), [OWNER_PIN, SETUP_CODE]);
  await O.waitForFunction(() => LIVE.owner && LIVE.staff.length === 1);
  const out = { O };
  for (const [key, name, username, role] of people) {
    const pin = role === "staff" ? STAFF_PIN : MANAGER_PIN;
    await O.evaluate((a) => LIVE.api.addPerson(...a), [name, username, pin, role]);
    const p = await phone(browser, site);
    await p.evaluate((a) => LIVE.api.login(...a), [username, pin]);
    await p.waitForFunction((r) => LIVE.role === r, role);
    out[key] = p;
  }
  await O.waitForFunction((n) => LIVE.staff.length === n, people.length + 1);
  return out;
}
// How many team records this phone has saved for offline use.
export const cachedDocs = (p) => p.evaluate(async () => {
  const name = (await indexedDB.databases()).map((d) => d.name).find((n) => n && n.startsWith("firestore/"));
  if (!name) return 0;
  const db = await new Promise((ok, no) => { const r = indexedDB.open(name); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  const stores = [...db.objectStoreNames].filter((n) => n.startsWith("remoteDocuments"));
  let n = 0;
  for (const s of stores) n += await new Promise((ok) => { const r = db.transaction(s).objectStore(s).count(); r.onsuccess = () => ok(r.result); r.onerror = () => ok(0); });
  db.close();
  return n;
});
export const ukDay = (t = Date.now()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(t);
