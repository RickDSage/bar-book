// The Wednesday dry run, simulated: a whole night on the real devices' screen sizes, with real taps.
// Emily on an old iPhone (XS Max size), Hassan (a manager) on an Android, Pema on a small Android for the floor, the
// bar iPad as the station, and Maintenance on a laptop. They join by name and code, 86 and bring back, lose signal,
// count stock, close with a take-over, photos from the iPad, send with photos and just save, export and import, check
// Ready for Friday, and the morning shift opens to last night's handover. Every step checks every screen still fits,
// reads cleanly and threw nothing.
// WEBKIT=1 runs the iPhone and iPad in WebKit (Safari's engine) when it's installed; SHOTS=<folder> saves a picture of
// each step.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium, webkit } from "playwright";
import { serve, resetEmulators, TEAM_CODE, OWNER_PW, SENIOR_PIN, adminWrite } from "./helpers.mjs";

const HARVEST = process.env.HARVEST, HARVESTED = new Set(), SHOTS = process.env.SHOTS, WK = process.env.WEBKIT === "1";
let site, cr, wk;
before(async () => { site = await serve(".emusite"); cr = await chromium.launch(); wk = WK ? await webkit.launch() : cr; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true }); });
after(async () => { await cr.close(); if (WK) await wk.close(); site.close(); });

const DEV = {
  iphone: { b: () => wk, o: { viewport: { width: 414, height: 896 }, deviceScaleFactor: 3, isMobile: !WK || undefined, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1" } },
  android: { b: () => cr, o: { viewport: { width: 393, height: 851 }, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true } },
  small: { b: () => cr, o: { viewport: { width: 360, height: 740 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
  ipad: { b: () => wk, o: { viewport: { width: 1080, height: 810 }, deviceScaleFactor: 2, hasTouch: true, userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Safari/605.1.15" } },
  laptop: { b: () => cr, o: { viewport: { width: 1366, height: 768 } } },
};
if (WK) { delete DEV.iphone.o.isMobile; }

const found = [];
async function device(kind, { fresh = false } = {}) {
  const c = await DEV[kind].b().newContext({ ...DEV[kind].o, timezoneId: "Europe/London", locale: "en-GB" });
  if (kind === "ipad") await c.addInitScript(() => Object.defineProperty(navigator, "maxTouchPoints", { get: () => 5 }));
  if (!fresh) await c.addInitScript(() => { try { if (localStorage.getItem("btbar.introSeen") == null) (localStorage.setItem("btbar.introSeen", "true"), localStorage.setItem("btbar.walk", JSON.stringify(Object.fromEntries(["", ":Kadir", ":Emily", ":Hassan", ":Pema", ":Angel"].flatMap((n) => [["bar" + n, 99], ["floor" + n, 99]]))))); } catch {} });
  // Stand in for the share sheet: what was shared is kept to look at.
  await c.addInitScript(() => { navigator.canShare = () => true; navigator.share = (d) => { (window.shared ||= []).push({ text: d.text, files: (d.files || []).map((f) => f.name) }); return Promise.resolve(); }; });
  const p = await c.newPage();
  p.kind = kind; p.errs = [];
  p.on("pageerror", (e) => p.errs.push(e.message));
  p.on("dialog", (d) => d.accept(p.answer ?? ""));
  await p.goto(site.url);
  return p;
}
let shot = 0;
// What's wrong on this screen right now: sideways scrolling, buttons off the edge or under another, small fields,
// leftover code words on screen, and script errors.
async function look(p, where) {
  await p.waitForTimeout(350);
  const out = await p.evaluate(() => {
    const out = [], vis = (e) => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
    if (document.documentElement.scrollWidth > innerWidth + 1) {
      const wide = [...document.querySelectorAll("body *")].filter((e) => vis(e) && e.getBoundingClientRect().right > innerWidth + 1 && ![...(function* () { for (let a = e.parentElement; a; a = a.parentElement) yield a; })()].some((a) => /auto|scroll|hidden/.test(getComputedStyle(a).overflowX)));
      out.push(`sideways scroll ${document.documentElement.scrollWidth}>${innerWidth}: ${wide.slice(0, 3).map((e) => `${e.tagName}.${e.className}#${e.id}`).join(", ")}`);
    }
    for (const e of document.querySelectorAll("input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]), select, textarea")) if (vis(e) && parseFloat(getComputedStyle(e).fontSize) < 16) out.push(`small field (iPhone zooms) ${e.id || e.className || e.name} ${getComputedStyle(e).fontSize}`);
    for (const e of document.querySelectorAll("button, a[href], [role=button], label.btn")) {
      if (!vis(e) || e.closest("[hidden], .sr-only") || e.closest("details:not([open]) > :not(summary)")) continue;
      const r = e.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) continue;
      // Covered by something else where it would be tapped (not counting its own children or a pop-up toast).
      const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)), hit = document.elementFromPoint(x, y);
      if (hit && !e.contains(hit) && !hit.contains(e) && !hit.closest("#toast, #net, #upd, .toast") && !e.closest("nav.tabs") && getComputedStyle(hit).pointerEvents !== "none") {
        const hitFixed = (() => { for (let a = hit; a; a = a.parentElement) if (/fixed|sticky/.test(getComputedStyle(a).position)) return a; })();
        if (hitFixed && !hitFixed.contains(e)) continue; // scrolled under a sticky header or the tab bar: scrolling reaches it
        out.push(`button covered: "${(e.textContent || e.getAttribute("aria-label") || "").trim().slice(0, 30)}" under ${hit.tagName}.${hit.className}`);
      }
      if (r.right > innerWidth + 1 || r.left < -1) { let s = false; for (let a = e.parentElement; a; a = a.parentElement) if (/auto|scroll/.test(getComputedStyle(a).overflowX)) s = true; if (!s) out.push(`button off screen: "${e.textContent.trim().slice(0, 30)}"`); }
      if (r.height < 30 && r.width < 30 && !e.closest(".az-rail, #az-rail") && !e.matches(".hq")) out.push(`tiny button ${Math.round(r.width)}x${Math.round(r.height)}: "${(e.textContent || e.getAttribute("aria-label") || "").trim().slice(0, 20)}"`);
    }
    const t = document.body.innerText;
    for (const bad of ["undefined", "NaN", "[object", "null", "—", "Invalid Date"]) { const i = t.search(new RegExp(`\\b${bad.replace(/[[\]]/g, "\\$&")}`)); if (i >= 0) out.push(`text "${bad}": …${t.slice(Math.max(0, i - 40), i + 20).replace(/\s+/g, " ")}…`); }
    return out;
  });
  out.push(...p.errs.splice(0).map((e) => `script error: ${e}`));
  if (HARVEST) for (const k of await p.evaluate(async () => {
    // Words on screen that the language packs don't have yet (checked against French, as the app would look them up).
    if (!window.__frw) { const r = await fetch(`lang/fr.json?v=${I18N.v}`); window.__frw = await r.json(); }
    const was = [lang, langMem]; lang = "fr"; langMem = { c: "fr", v: I18N.v, w: window.__frw }; trBuild();
    const miss = new Set(), want = (k) => k && /[A-Za-z]{2}/.test(k) && !trLook(k);
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) { const el = n.parentElement; if (!el || el.closest(TR_SKIP) || el.closest("[hidden]")) continue; const k = n.textContent.trim(); if (want(k)) miss.add(k); }
    for (const el of document.querySelectorAll("[placeholder],[aria-label],[title]")) if (!el.closest("[translate=no]")) for (const a of ["placeholder", "aria-label", "title"]) { const k = el.getAttribute(a)?.trim(); if (el.hasAttribute(a) && want(k)) miss.add(k); }
    [lang, langMem] = was; trBuild();
    return [...miss];
  })) HARVESTED.add(k);
  for (const x of out) found.push(`${p.kind} · ${where}: ${x}`);
  if (SHOTS) await p.screenshot({ scale: "css", path: `${SHOTS}/${String(++shot).padStart(3, "0")}-${p.kind}-${where.replace(/[^a-z0-9]+/gi, "-")}.png` }).catch(() => {});
  return out;
}
const wait = (p, fn, arg, ms = 15000) => p.waitForFunction(fn, arg, { timeout: ms });
const tap = (p, sel) => p.locator(sel).first().click();

// Joining as the team does: tap your name, type the team code (and a manager's own code), tap Bar or Floor.
async function joinByTaps(p, name, { pin, start = "#w-ok" } = {}) {
  await p.waitForSelector("#w-name");
  const chip = p.locator(`#welcome [data-w-name="${name}"]`);
  if (await chip.count()) await chip.click(); else await p.fill("#w-other", name);
  await p.waitForSelector("#w-code");
  await p.fill("#w-code", TEAM_CODE);
  if (pin) { await p.waitForSelector("#w-pin"); await p.fill("#w-pin", String(pin)); }
  await look(p, `start screen, ${name}`);
  await p.click(start);
  await wait(p, (n) => LIVE.me === n, name);
  if (pin) await wait(p, () => LIVE.role === "manager");
}

after(() => { console.log(`\n${found.length} things found:\n` + [...new Set(found)].join("\n")); if (HARVEST) fs.writeFileSync(HARVEST, JSON.stringify([...HARVESTED], null, 1)); });
test("the dry run: a whole night and the morning after, on every kind of screen", { timeout: 900000 }, async () => {
  await resetEmulators();
  // Maintenance on the laptop: logs in, sets Hassan's own code.
  const D = await device("laptop");
  await D.click("#w-ok"); await wait(D, () => LIVE.ready);
  await D.evaluate((pw) => LIVE.api.login("olly", pw), OWNER_PW); await wait(D, () => LIVE.owner);
  await D.evaluate((pin) => LIVE.api.setSenior("Hassan", String(pin)), SENIOR_PIN);
  await look(D, "laptop logged in");

  const E = await device("iphone"), H = await device("android"), P = await device("small"), I = await device("ipad");
  await joinByTaps(E, "Emily");
  await joinByTaps(H, "Hassan", { pin: SENIOR_PIN });
  await joinByTaps(P, "Pema", { start: "#w-floor" });
  await joinByTaps(I, "Kadir", { start: "#w-ipad" });
  for (const p of [E, H, P, I, D]) await wait(p, () => LIVE.staff.length >= 5);
  for (const [p, w] of [[E, "after join"], [H, "after join"], [P, "after join (floor)"], [I, "station after join"]]) await look(p, w);

  // Every main page on every device.
  for (const p of [E, H, P, I, D]) for (const t of ["drinks", "tally", "notices", "info"]) { await p.evaluate((t) => show(t), t); await p.waitForTimeout(250); await look(p, `tab ${t}`); }

  // 86 limes from the iPhone's Shift > Restock and 86, by tapping.
  await E.evaluate(() => { show("tally"); }); await tap(E, ".ptabs [data-pane=stock]"); await look(E, "stock pane");
  await tap(E, "[data-pk86]"); await E.fill("#pk-q", "lime"); await E.waitForTimeout(200); await look(E, "86 picker typed lime");
  await tap(E, '#pk-list [data-pk-one="Limes"]');
  await E.click("#pick [data-pk-x]");
  for (const p of [H, P, I, D]) await wait(p, () => LIVE.out?.some?.((x) => /lime/i.test(x.item || x.name || "")) || document.body.innerText.includes("Limes"));
  await I.evaluate(() => show("station")); await I.waitForTimeout(300); await look(I, "station with limes 86'd");
  await look(H, "manager after 86");
  // Back in, from the Android.
  await H.evaluate(() => show("tally")); await tap(H, ".ptabs [data-pane=stock]");
  await tap(H, "[data-pk86]"); await H.fill("#pk-q", "lime"); await H.waitForTimeout(200);
  await tap(H, '#pk-list [data-pk-one="Limes"]'); await H.click("#pick [data-pk-x]");
  await look(H, "after back in");

  // Signal drops on the iPhone mid-close: ticks wait on the phone and arrive when it's back.
  await E.evaluate(() => { setMode("bar"); show("tally"); }); await tap(E, ".ptabs [data-pane=close]");
  await E.context().setOffline(true); await E.evaluate(() => window.dispatchEvent(new Event("offline")));
  const firstThree = await E.$$eval("#tally button.prep[data-list=close]", (b) => b.slice(0, 3).map((x) => x.dataset.i));
  for (const i of firstThree) await tap(E, `#tally button.prep[data-list=close][data-i="${i}"]`);
  await E.waitForTimeout(500); await look(E, "offline after 3 ticks");
  await E.context().setOffline(false); await E.evaluate(() => window.dispatchEvent(new Event("online")));
  await wait(H, (ids) => ids.every((i) => statusOf("close", i) === "done"), firstThree, 30000);
  await look(E, "back online");

  // The iPad takes over the rest of a heading and ticks it.
  await I.evaluate(() => { setMode("bar"); show("tally"); }); await tap(I, ".ptabs [data-pane=close]"); await I.waitForTimeout(300);
  await look(I, "iPad closing list");
  const claim = I.locator("#tally [data-claim]").first();
  if (await claim.count()) { await claim.click(); await I.waitForTimeout(400); await look(I, "iPad after Take over"); }
  // The iPad adds two closing photos.
  const jpg = await I.evaluate(() => { const c = document.createElement("canvas"); c.width = 640; c.height = 480; const x = c.getContext("2d"); x.fillStyle = "#6a5"; x.fillRect(0, 0, 640, 480); return c.toDataURL("image/jpeg", 0.8).split(",")[1]; });
  await I.setInputFiles("#ph-pick", [{ name: "a.jpg", mimeType: "image/jpeg", buffer: Buffer.from(jpg, "base64") }, { name: "b.jpg", mimeType: "image/jpeg", buffer: Buffer.from(jpg, "base64") }]);
  await wait(E, () => draftPhotos().length === 2, null, 30000);
  await look(I, "iPad photos added");
  // Tick all on the iPhone, then hand over with photos.
  await E.evaluate(() => show("tally")); await tap(E, ".ptabs [data-pane=close]");
  E.answer = "";
  const tickAll = E.locator("#tally [data-tick-all=close]").first(); if (await tickAll.count()) { await tickAll.click(); await E.waitForTimeout(600); }
  await look(E, "close all ticked");
  const fin = E.locator('#tally [data-run=close][data-to=finished]'); if (await fin.count()) { await fin.click(); await E.waitForTimeout(500); }
  await look(E, "close finished");
  await tap(E, ".ptabs [data-pane=send]"); await look(E, "handover pane");
  await E.click("#t-copy"); await E.waitForSelector("#send", { timeout: 15000 }); await E.waitForTimeout(800);
  await look(E, "send page with photos");
  const sendBtn = E.locator("#send [data-send-sheet]").first(); if (await sendBtn.count()) { await sendBtn.click(); await E.waitForTimeout(500); }
  const shared = await E.evaluate(() => window.shared || []);
  if (!shared.some((s) => s.files.length >= 2)) found.push(`iphone · send with photos shared ${JSON.stringify(shared)}`);
  await E.evaluate(() => closeSheet()); await E.waitForTimeout(300);
  await wait(H, () => LIVE.reports.some((r) => r.side === "bar" || /bar/i.test(r.title || "")), null, 30000);

  // Pema just saves the floor handover.
  await P.evaluate(() => { setMode("floor"); show("tally"); }); await tap(P, ".ptabs [data-pane=send]"); await look(P, "floor handover pane");
  P.answer = "No camera here"; await P.click("#t-save"); await P.waitForSelector("#ho-sent", { timeout: 15000 }); await look(P, "floor just saved");
  // Pema can't delete Emily's handover; Hassan can.
  const bar = await H.evaluate(() => LIVE.reports.find((r) => r.side === "bar")?.id);
  await P.evaluate((id) => openLink(`#at=rep:${id}`), bar); await P.waitForSelector("#rep", { timeout: 15000 }); await look(P, "Emily's handover on Pema's phone");
  assert.equal(await P.$$eval("#rep [data-rep-del]", (x) => x.length), 0, "not Pema's to delete");
  await P.evaluate(() => closeSheet());
  await H.evaluate((id) => openLink(`#at=rep:${id}`), bar); await H.waitForSelector("#rep", { timeout: 15000 }); await look(H, "handover on the manager's phone");
  assert.equal(await H.$$eval("#rep [data-rep-del]", (x) => x.length), 1, "a manager can delete it");
  await H.evaluate(() => closeSheet());

  // Stock count on the iPhone, first time: the walkthrough, then find Smirnoff by typing, a full bottle and a weighed one.
  await E.evaluate(() => { store.set("ctHow", false); openAt("count"); }); await E.waitForSelector("#ct", { timeout: 15000 }); await E.waitForTimeout(500); await look(E, "stock count first time");
  for (let i = 0; i < 10 && await E.locator(".ct-intro [data-ct-intro]").count(); i++) { await E.locator(".ct-intro .btn.pri").click(); await E.waitForTimeout(200); await look(E, `count walkthrough ${i + 1}`); }
  await E.fill("#ct-say", "smirnoff"); await E.waitForTimeout(400); await look(E, "count found smirnoff");
  await E.locator("#ct-list [data-ct-row]").first().click(); await E.waitForTimeout(300); await look(E, "count line open");
  await E.locator('[data-ct-add="full:1"]').first().click(); await E.waitForTimeout(200);
  if (await E.locator("#ct-g").count()) { if (!(await E.locator("#ct-g").isVisible())) await E.click("#ct-more summary"); await E.fill("#ct-g", "900"); await E.waitForTimeout(1200); }
  await look(E, "count weighed");
  await wait(H, () => LIVE.counts?.length > 0 || true);
  // Said or typed: "Tanqueray 3 and a half".
  await E.fill("#ct-say", "Tanqueray 3 and a half"); await E.waitForTimeout(500); await look(E, "count typed a count");
  await E.evaluate(() => closeSheet()); await E.waitForTimeout(300);

  // Say it: the voice box, typed on a phone with no microphone.
  await E.evaluate(() => sdVoiceOpen()); await E.waitForSelector("#sd-vtext"); await look(E, "voice box");
  await E.fill("#sd-vtext", "we've run out of mint"); await E.press("#sd-vtext", "Enter"); await E.waitForTimeout(500); await look(E, "voice heard 86 mint");
  const yes = E.locator("#sd-voice .btn.pri").first(); if (await yes.count()) { await yes.click(); await E.waitForTimeout(500); }
  await look(E, "voice after yes");
  await E.evaluate(() => sdVoiceClose());

  // A to Z: the letter strip on the Menu, on the iPhone; tap M.
  await E.evaluate(() => show("drinks")); await E.waitForTimeout(300);
  const az = E.locator('[data-dview="az"]'); if (await az.count()) await az.click();
  await E.waitForTimeout(500); await look(E, "menu A to Z");
  const m = E.locator('#az-rail [data-azk="M"]').first();
  if (await m.count()) { await m.click(); await E.waitForTimeout(500); const top = await E.evaluate(() => { const h = [...document.querySelectorAll('#list [data-az="M"], [data-az="M"]')].find((x) => x.offsetParent); return h ? Math.round(h.getBoundingClientRect().top) : null; }); if (top == null || top < 0 || top > 300) found.push(`iphone · A to Z: tapping M left the M heading at ${top}px`); }
  else found.push("iphone · A to Z: no letter strip on the Menu");
  await look(E, "menu after M");

  // Export from the manager's Android: a workbook (share sheet), then the import side with that file.
  await H.evaluate(() => openAt("export")); await H.waitForTimeout(1500); await look(H, "export card");
  const xl = H.locator('[data-ex-go="xlsx"]'); if (await xl.count()) { await xl.click(); await H.waitForTimeout(800); }
  const sh = await H.evaluate(() => window.shared || []); if (!sh.some((x) => x.files.some((f) => /\.xlsx$/.test(f)))) found.push(`android · export workbook didn't reach the share sheet: ${JSON.stringify(sh)}`);
  await H.locator('[data-ex-tab="in"]').click(); await H.waitForTimeout(300); await look(H, "import side");
  // The laptop downloads a CSV.
  await D.evaluate(() => { navigator.canShare = () => false; openAt("export"); }); await D.waitForTimeout(1500);
  const dl = D.waitForEvent("download", { timeout: 8000 }).catch(() => null);
  const csvb = D.locator('[data-ex-go="csv"]'); if (await csvb.count()) await csvb.click();
  const got = await dl; if (!got) found.push("laptop · export CSV: no download"); else if (!/^bar-book-.*\.csv$/.test(got.suggestedFilename()) || !fs.readFileSync(await got.path(), "utf8").startsWith("\ufeffShift date")) found.push(`laptop · export CSV: ${got.suggestedFilename()}`);
  await look(D, "laptop export");
  await D.evaluate(() => openAt("ready")); await D.waitForTimeout(1500); await look(D, "ready for friday (maintenance)");
  await H.evaluate(() => openAt("ready")); await H.waitForTimeout(1500); await look(H, "ready for friday (manager)");

  // Clear everything really clears: lists, 86s, the handover boxes, unsent photos, restocks still waiting and the
  // half-typed forms on Shift. A staff phone cancels only the restocks it asked for; a manager's clears every one.
  await E.evaluate(() => LIVE.api.askRestock({ item: "Limes", qty: 2, unit: "box", dest: "up", detail: "" }));
  await H.evaluate(() => LIVE.api.askRestock({ item: "Tonic", qty: 1, unit: "case", dest: "up", detail: "" }));
  await E.evaluate(() => LIVE.api.set86("Mint", true).catch(() => {}));
  await wait(E, () => rsOpen().length === 2);
  await E.evaluate(() => { show("tally"); setMode("bar"); });
  await tap(E, ".ptabs [data-pane=stock]");
  await E.evaluate(() => { rsF.detail = "Running low, the big bottles, for the weekend"; saveDrafts(); renderTally(); });
  E.answer = ""; await tap(E, "#clear-all"); await E.waitForTimeout(1500);
  await look(E, "after Clear everything (staff)");
  const afterE = await E.evaluate(() => ({ open: rsOpen().map((r) => r.item), out: [...outNow()], ticked: Object.values(MODE_LISTS).flat().flatMap(touched).length, draft: rsF.detail, undo: !!document.querySelector("#undo-clear") }));
  if (JSON.stringify(afterE) !== JSON.stringify({ open: ["Tonic"], out: [], ticked: 0, draft: "", undo: true })) found.push(`iphone · Clear everything left: ${JSON.stringify(afterE)}`);
  H.answer = ""; await H.evaluate(() => { show("tally"); }); await tap(H, "#clear-all"); await H.waitForTimeout(3000);
  await look(H, "after Clear everything (manager)");
  const hl = await H.evaluate(() => ({ open: rsOpen().map((r) => [r.item, r.status, r.askedUid === LIVE.uid]), admin: LIVE.admin, toast: $("#toast").textContent, undo: !!document.querySelector("#undo-clear") })); if (hl.open.length) found.push(`android · a manager's Clear everything left: ${JSON.stringify(hl)}`);

  // The morning: Angel opens Bar Book at 10am; the bar's morning shows last night's handover with its photos.
  const A = await device("iphone");
  await A.clock.setFixedTime(new Date(Date.now() + 9 * 36e5));
  await A.reload();
  await joinByTaps(A, "Angel");
  await A.evaluate(() => { setMode("bar"); show("tally"); }); await tap(A, ".ptabs [data-pane=morning]"); await A.waitForTimeout(1500);
  await look(A, "morning after");
  const mt = await A.evaluate(() => document.querySelector("#tally")?.innerText || "");
  if (!/Last night's handover/.test(mt)) found.push(`iphone · morning: no "Last night's handover": ${mt.slice(0, 300)}`);
  const ph = A.locator("[data-rp-photos]"); if (await ph.count()) { await ph.click(); await A.waitForTimeout(1500); await look(A, "morning photos"); } else found.push("iphone · morning: no Show photos button");

  // Every Manager card on Hassan's phone and the laptop, including export, import and Ready for Friday.
  for (const p of [H, D]) {
    const cards = await p.evaluate(() => mgCards().map((c) => c[0]));
    for (const k of cards) { await p.evaluate((k) => openAt(k), k); await p.waitForTimeout(500); await p.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true))); await look(p, `manager card ${k}`); }
  }

  // Every page, pane and card on each device, opened up.
  if (process.env.CRAWL) for (const p of [E, H, P, I, D]) {
    for (const go of await p.evaluate(() => [...new Set(FEATURES.filter((f) => fUsable(f)).map((f) => f.go))])) {
      await p.evaluate((g) => openAt(g), go); await p.waitForTimeout(250);
      await p.evaluate(() => document.querySelectorAll("#main details, #v-notices details, #v-tally details").forEach((d) => (d.open = true))); await look(p, `page ${go}`);
      await p.evaluate(() => { if (!$("#sheet").hidden) closeSheet(); });
    }
    for (const m of ["bar", "floor"]) {
      await p.evaluate((m) => { show("tally"); setMode(m); }, m);
      for (const pn of await p.$$eval(".ptabs [data-pane]", (b) => b.map((x) => x.dataset.pane))) { await tap(p, `.ptabs [data-pane="${pn}"]`); await p.waitForTimeout(250); await look(p, `shift ${m} ${pn}`); }
    }
    await p.evaluate(() => { show("drinks"); openSheet(D.find((d) => d.name === "Espresso Martini").id); }); await p.waitForTimeout(300); await look(p, "drink sheet");
    await p.evaluate(() => closeSheet());
  }

  // The morning: a fresh phone opens to last night's handover.
  for (const p of [E, H, P, I, D]) await look(p, "end of night");
  if (HARVEST) fs.writeFileSync(HARVEST, JSON.stringify([...HARVESTED], null, 1));
  console.log(`\n${found.length} things found:\n` + [...new Set(found)].join("\n"));
});
