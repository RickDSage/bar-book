// Manager tools: the weekly summary, the date label record (and its spreadsheet), training (tonight's quiz, speed
// drills, the starter test and sign-off on the house cocktails), change history with undo, backup and restore, the
// health check, the pre-shift brief on Morning, and Bar 101.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, part, attempt } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });
const people = [["M", "Mia Manager", "mia", "manager"], ["S", "Sam Staff", "sam", "staff"]];
const flat = (s) => s.replace(/\s+/g, " ").trim();
const text = async (p, sel) => flat(await p.$eval(sel, (e) => e.innerText));
const waitText = (p, sel, re) => p.waitForFunction(([s, r]) => new RegExp(r, "i").test((document.querySelector(s)?.innerText || "").replace(/\s+/g, " ")), [sel, re.source], { timeout: 15000 });
const card = async (p, k) => { await part(p, k); return `#tc-${k}`; };
const practise = async (p, mode) => { await p.click("nav.tabs [data-tab=info]"); await p.click("[data-go=practice]"); await p.click(`#pmode [data-pmode="${mode}"]`); };
async function answer(p, right) {
  const i = await p.evaluate((r) => { const q = qz.qs[qz.i]; return q.opts.findIndex((o) => (o === q.answer) === r); }, right);
  await p.locator("#pquiz [data-qz-pick]").nth(i).click();
  await p.click('#pquiz [data-qz="next"]');
}

test("labels, 86s and closes feed the label record, its spreadsheet and the weekly summary", async () => {
  await resetEmulators();
  const { O, M, S } = await team(browser, site, people);
  await M.evaluate(() => LIVE.api.label(null, "added", { item: "Apple juice", side: "bar", life: 3, on: true }));
  await S.waitForFunction(() => LIVE.labels.some((x) => x.item === "Apple juice" && !x.pending));
  await S.evaluate(() => { const x = LIVE.labels.find((l) => l.item === "Apple juice"); return LIVE.api.label(x, "opened", { useBy: addDays(shiftDay(), 3) }); });
  await S.waitForFunction(() => LIVE.labels.some((x) => x.state === "open" && !x.pending));
  await S.evaluate(() => { const x = LIVE.labels.find((l) => l.item === "Apple juice"); return LIVE.api.label(x, "binned"); });
  for (const n of ["Limes", "Limes", "Mint"]) {
    await S.evaluate((n) => LIVE.api.set86(n, true), n); await S.waitForFunction((n) => LIVE.out.has(n), n);
    await S.evaluate((n) => LIVE.api.set86(n, false), n); await S.waitForFunction((n) => !LIVE.out.has(n), n);
  }
  // Staff don't get the manager cards.
  await S.evaluate(() => show("notices"));
  assert.equal(await S.locator('[data-card="lblog"]').count(), 0);
  assert.equal(await attempt(S, () => LIVE.api.itemLog()), "permission-denied");

  const box = await card(M, "lblog");
  await waitText(M, box, /Sam Staff discarded Apple juice/);
  const t = await text(M, box);
  assert.match(t, /Mia Manager added Apple juice to the date labels: keeps 3 days/);
  assert.match(t, /Sam Staff opened Apple juice, use by/);
  // The spreadsheet: one row per tap, with what was done in plain words. Formula-looking cells are made safe.
  // Excel or CSV goes to Export with that log only (export.test.mjs covers the files).
  await M.click('[data-ex-only^="labels|"]');
  const ex = await card(M, "export");
  await waitText(M, ex, /Date labels 3 lines/);
  const csv = await M.evaluate(() => { const x = exTables().find((t) => t.L.k === "labels"); return toCsv(x.head, x.rows); });
  assert.match(csv, /Bar,Apple juice,Discarded/);
  assert.match(csv, /Bar,Apple juice,Added to the list,,,,Mia Manager/);
  assert.deepEqual(await M.evaluate(() => exPicked().map((x) => x.L.k)), ["labels"]);
  await M.evaluate(() => show("notices"));
  assert.equal(await M.evaluate(() => csvCell("=HYPERLINK(1)")), `"'=HYPERLINK(1)"`);
  const msg = await M.evaluate(() => SHARE.lblog());
  assert.match(msg.title, /date label record · last 7 days/);
  // Floor only: nothing.
  await M.click('[data-mg-lb="side:floor"]');
  await waitText(M, box, /No date label taps in the last 7 days/);

  const wk = await card(M, "week");
  await waitText(M, wk, /Most 86'd/);
  const w = await text(M, wk);
  assert.match(w, /86s 3/i);
  assert.match(w, /Limes × 2/);
  assert.match(w, /Mint × 1/);
  assert.match((await M.evaluate(() => SHARE.week())).head[0], /🚫 3 86s/);
  assert.deepEqual([...M.errs, ...S.errs, ...O.errs], []);
});

test("tonight's quiz, speed drills and the starter test reach Training; managers sign off the house cocktails", async () => {
  await resetEmulators();
  const { M, S } = await team(browser, site, people);
  await practise(S, "quiz");
  await S.click('#pquiz [data-qz="night"]');
  for (let i = 0; i < 10; i++) await answer(S, i < 7);
  await waitText(S, "#pquiz", /7 out of 10/);
  // A second go at tonight's quiz doesn't count: the server refuses a second record.
  assert.equal(await attempt(S, () => LIVE.api.score("night", 10, 10)), "permission-denied");

  await S.click('#pmode [data-pmode="speed"]');
  await S.click('#pquiz [data-qz="speed"]');
  assert.match(await text(S, "#pquiz .cprog"), /Question 1 of 10 \d+ s/i);
  for (let i = 0; i < 10; i++) await answer(S, true);
  await waitText(S, "#pquiz", /seconds/);
  assert.match(await text(S, "#pquiz"), /10 out of 10 right/);
  assert.match(await text(S, "#pquiz"), /Your first time on the board/);
  await S.click('#pquiz [data-qz="speed"]');
  for (let i = 0; i < 10; i++) await answer(S, i > 0);
  assert.match(await text(S, "#pquiz"), /9 out of 10 right, \+5 s for the misses/);

  const box = await card(M, "training");
  await waitText(M, box, /Sam Staff/);
  await M.click('[data-tr-open="Sam Staff"]');
  const t = await text(M, box);
  assert.match(t, /Quiz 70% \(1\)/);
  assert.match(t, /Speed 10\/10 in \d+ s/);
  assert.match(t, /0 of 8 signed off/);
  await M.click('[data-tr-sign="Sam Staff|London Cosmo"]');
  await S.waitForFunction(() => LIVE.signoffs.some((x) => x.drink === "London Cosmo"));
  await S.click('#pmode [data-pmode="starter"]');
  assert.match(await text(S, "#pstart"), /Signed off by a manager .* 1 of 8 so far/i);
  assert.match(await text(S, "#pstart"), /✅ London Cosmo/);
  assert.equal(await attempt(S, () => LIVE.api.signOff("Sam Staff", "Uptown Hustle")), "permission-denied");
  // Fastest perfect drill on the leaderboard.
  await M.click('[data-mg-reload="tr"]');
  await waitText(M, box, /🥇 Sam Staff \d+ s/);
  assert.deepEqual([...M.errs, ...S.errs], []);
});

test("change history puts back a removed label and an item, and undoes a label change", async () => {
  await resetEmulators();
  const { O, M } = await team(browser, site, people.slice(0, 1));
  await M.evaluate(() => LIVE.api.label(null, "added", { item: "Oat milk", side: "bar", life: 5, on: true }));
  await M.waitForFunction(() => LIVE.labels.some((x) => x.item === "Oat milk" && !x.pending));
  await M.evaluate(() => LIVE.api.label(LIVE.labels[0], "edited", { item: "Oat milk", side: "bar", life: 9, on: true, station: "" }));
  await M.waitForFunction(() => LIVE.labels[0]?.life === 9 && !LIVE.labels[0].pending);
  await M.evaluate(() => LIVE.api.label(null, "added", { item: "Egg whites", side: "bar", life: 2, on: true }));
  await M.waitForFunction(() => LIVE.labels.some((x) => x.item === "Egg whites" && !x.pending));
  await M.evaluate(() => LIVE.api.label(LIVE.labels.find((x) => x.item === "Egg whites"), "removed"));
  await M.waitForFunction(() => !LIVE.labels.some((x) => x.item === "Egg whites"));
  await O.evaluate(() => LIVE.api.addItem({ item: "Rubicon Mango", kind: "soft", group: "Soft drinks and mixers", side: "bar", store: "bottle", label: false, life: 0, close: "keep", note: "", found: "" }, true));
  await O.waitForFunction(() => LIVE.items.some((x) => x.item === "Rubicon Mango" && !x.pending));
  await O.evaluate(() => LIVE.api.dropItem(LIVE.items[0].id));
  await O.waitForFunction(() => !LIVE.items.length);

  const box = await card(M, "history");
  await waitText(M, box, /took Egg whites off the date labels/);
  await M.click("[data-hi-lb-undo]");
  await M.waitForFunction(() => LIVE.labels.find((x) => x.item === "Oat milk")?.life === 5);
  await M.click("[data-hi-lb-back]");
  await M.waitForFunction(() => LIVE.labels.some((x) => x.item === "Egg whites"));
  await waitText(M, box, /Only maintenance puts back an item/);

  const ob = await card(O, "history");
  await waitText(O, ob, /took off Rubicon Mango/);
  await O.locator("[data-hi-it]").first().click();
  await O.waitForFunction(() => LIVE.items.some((x) => x.item === "Rubicon Mango" && x.status === "live"));
  assert.deepEqual([...M.errs, ...O.errs], []);
});

test("backup has everything; restore shows what's different and puts it back without deleting", async () => {
  await resetEmulators();
  const { O } = await team(browser, site);
  await O.evaluate(() => LIVE.api.label(null, "added", { item: "Lime juice", side: "bar", life: 2, on: true }));
  await O.waitForFunction(() => LIVE.labels.some((x) => !x.pending));
  const data = await O.evaluate(() => LIVE.api.backup().then((d) => JSON.parse(mgJson(d))));
  assert.equal(data.labels.length, 1);
  assert.match(data.labels[0].at, /^\d{4}-\d{2}-\d{2}T/);
  await O.evaluate(() => LIVE.api.label(LIVE.labels[0], "removed"));
  await O.waitForFunction(() => !LIVE.labels.length);
  await card(O, "backup");
  await O.setInputFiles("[data-bk-file]", { name: "b.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ kind: "backup", made: new Date().toISOString(), by: "Olly Owner", data })) });
  await waitText(O, "#tc-backup", /Date labels missing now: Lime juice/);
  await O.click("[data-bk-go]");
  await O.waitForFunction(() => LIVE.labels.some((x) => x.item === "Lime juice"));
  await O.setInputFiles("[data-bk-file]", { name: "x.json", mimeType: "application/json", buffer: Buffer.from("{}") });
  await waitText(O, "#tc-backup", /That isn't a Bar Book backup file/);
  assert.deepEqual(O.errs, []);
});

test("health check, the pre-shift brief and Bar 101", async () => {
  await resetEmulators();
  const { S } = await team(browser, site, [["S", "Sam Staff", "sam", "staff"]]);
  const box = await card(S, "health");
  await waitText(S, box, /Bar Book's server Answered in \d+ ms/);
  assert.match(await text(S, box), /Everything on this phone has reached the server/);
  assert.match(await text(S, box), /Joined as Sam Staff/);
  await S.evaluate(() => LIVE.api.set86("Limes", true)); await S.waitForFunction(() => LIVE.out.has("Limes"));
  await S.evaluate(() => { pane = "morning"; show("tally"); });
  assert.match(await text(S, ".brief"), /Before you open 86'd Limes/i);
  assert.equal((await S.evaluate(() => SHARE.brief())).parts[0].lines[0], "Limes");
  await practise(S, "b101");
  assert.match(await text(S, "#pb101"), /Bar 101/i);
  await S.locator("[data-b101]").first().click();
  await waitText(S, "#pb101", /Say it:/);
  await S.click('#pb101 [data-qz="b101"]');
  for (let i = 0; i < 10; i++) await answer(S, true);
  await waitText(S, "#pquiz", /10 out of 10/);
  assert.deepEqual(S.errs, []);
});

test("Set up codes: one screen for every code, then a check that each one works", async () => {
  await resetEmulators();
  const { O } = await team(browser, site);
  await O.evaluate(() => { const n = { mgr: ["Hassan", "Ilias"], bar: ["Emily"], floor: ["Pema"] }; return LIVE.api.saveNames(n).then(() => Object.assign(STAFF, n)); });
  const box = await card(O, "setup");
  assert.match(await text(O, box), /0 of 4 done/i);
  await O.fill('[data-su-pin="owner"]', "4821"); await O.fill('[data-su-pin="m:Hassan"]', "4821"); await O.fill('[data-su-pin="m:Ilias"]', "7305");
  await O.click("[data-su-save]");
  assert.equal(await O.evaluate(() => $("#toast").textContent), "Two of those are the same. Each one must be different");
  await O.fill('[data-su-pin="m:Hassan"]', "6194");
  await O.click("[data-su-save]");
  await O.waitForFunction(() => LIVE.seniors.length === 3);
  await waitText(O, box, /2 of 4 done/);
  await O.fill('[data-su-pin="t:hassan"]', "6194"); await O.click('[data-su-test="hassan"]');
  await waitText(O, box, /Hassan 6194|Hassan.*Works/);
  await O.fill('[data-su-pin="t:ilias"]', "1111"); await O.click('[data-su-test="ilias"]');
  await waitText(O, box, /Doesn't match/);
  // Nothing was counted by the check.
  assert.deepEqual(await O.evaluate(() => LIVE.seniors.map((x) => x.tries)), [0, 0, 0]);
  assert.deepEqual(O.errs, []);
});

test("alerts: a banner when the app opens for urgent labels, items to check and new Log it entries", async () => {
  await resetEmulators();
  const { O, S } = await team(browser, site, [["S", "Sam Staff", "sam", "staff"]]);
  await O.evaluate(() => LIVE.api.label(null, "added", { item: "Lime juice", side: "bar", life: 1, on: true }));
  await S.waitForFunction(() => LIVE.labels.some((x) => !x.pending));
  await S.evaluate(() => LIVE.api.label(LIVE.labels[0], "opened", { useBy: shiftDay() }));
  await S.evaluate(() => LIVE.api.addItem({ item: "Rubicon Mango", kind: "soft", group: "Soft drinks and mixers", side: "bar", store: "bottle", label: false, life: 0, close: "keep", note: "", found: "" }, false));
  await O.waitForFunction(() => LIVE.items.some((x) => x.status === "waiting") && LIVE.labels.some((x) => x.state === "open"));
  await O.evaluate(() => renderAlerts(true));
  await waitText(O, "#alerts", /Needs you now/);
  const t = await text(O, "#alerts");
  assert.match(t, /URGENT: 1 date label to change now: Lime juice/);
  assert.match(t, /1 item to check: Rubicon Mango/);
  await O.click('#alerts [data-al-go="stock"]');
  assert.equal(await O.evaluate(() => cur), "tally");
  await O.evaluate(() => renderAlerts(true));
  assert.doesNotMatch(await text(O, "#alerts"), /Rubicon/);
  assert.deepEqual([...O.errs, ...S.errs], []);
});

test("tonight's brief plays as stories: bars, tap through, Go there, close", async () => {
  await resetEmulators();
  const { O, S } = await team(browser, site, [["S", "Sam Staff", "sam", "staff"]]);
  await S.evaluate(() => LIVE.api.set86("Limes", true)); await S.waitForFunction(() => LIVE.out.has("Limes"));
  // Off Morning, the ring rides at the top of Needs you now.
  await S.evaluate(() => { pane = "closing"; show("tally"); });
  await S.waitForSelector("#alerts:not([hidden]) [data-story]");
  await S.evaluate(() => { pane = "morning"; show("tally"); });
  assert.equal(await S.locator("#alerts [data-story]").count(), 0, "on Morning the ring is on the page, not twice");
  await S.click("#tally [data-story]");
  assert.equal(await S.locator("#story .sb").count(), 3);
  assert.match(await text(S, "#story"), /1 thing to know/i);
  // Readable in the light look too: the card is never white on white.
  assert.notEqual(await S.$eval("#story .sto-card", (e) => getComputedStyle(e).backgroundColor), "rgb(255, 255, 255)");
  await S.click("#story .st-next");
  assert.match(await text(S, "#story"), /86'd Limes/i);
  await S.click("#story [data-story-go]");
  assert.equal(await S.$eval("#story", (e) => e.hidden), true);
  assert.equal(await S.evaluate(() => pane), "stock");
  // Not to the end, so not watched: it opens again where it stopped.
  await S.evaluate(() => { pane = "morning"; renderTally(); });
  assert.doesNotMatch(await text(S, ".story-ring"), /Watched/);
  await S.click("#tally [data-story]");
  assert.match(await text(S, "#story"), /86'd Limes/i);
  // Hold to pause: the bars hide while it's held.
  await S.dispatchEvent("#story .st-next", "pointerdown");
  assert.equal(await S.evaluate(() => [sto.paused, $("#story").classList.contains("held")].join()), "1,true");
  await S.dispatchEvent("#story .st-next", "pointerup");
  await S.click("#story .st-next");
  assert.match(await text(S, "#story"), /Tonight's quiz/i);
  await S.click("#story [data-story-x]");
  assert.match(await text(S, ".story-ring"), /Watched/);
  await O.waitForFunction(() => (LIVE.seen || []).some((x) => x.name === "Sam Staff"));
  assert.deepEqual(S.errs, []);
});

test("pilot results: counted week by week from what the team did, no names; picture, message and spreadsheet", async () => {
  await resetEmulators();
  const { M, S } = await team(browser, site, people);
  await S.evaluate(() => LIVE.api.set86("Limes", true)); await S.waitForFunction(() => LIVE.out.has("Limes"));
  await S.evaluate(() => LIVE.api.setRun("close", "Bar close", "finished", 5, 5));
  await S.evaluate(() => LIVE.api.sendReport("bar", "Bar close done", "All done", []));
  await S.evaluate(() => LIVE.api.score("night", 8, 10));
  await M.evaluate(() => LIVE.api.label(null, "added", { item: "Apple juice", side: "bar", life: 3, on: true }));
  await M.waitForFunction(() => LIVE.labels.some((x) => x.item === "Apple juice" && !x.pending));
  // Staff don't get it, and can't read everyone's scores.
  await S.evaluate(() => show("notices"));
  assert.equal(await S.locator('[data-card="pilot"]').count(), 0);
  // The Guide lists it for staff too, marked for managers, with no Open it.
  assert.match(await S.evaluate(() => { const d = document.createElement("div"); d.innerHTML = featHtml(); return d.querySelector('[data-feat="pilot"]').innerText; }), /Managers only/i);
  assert.equal(await S.evaluate(() => { const d = document.createElement("div"); d.innerHTML = featHtml(); return d.querySelector('[data-feat="pilot"] [data-feat-go]'); }), null);

  const box = await card(M, "pilot");
  await waitText(M, box, /People using it/);
  const t = await text(M, box);
  assert.match(t, /Closes in the app 1\/1/i);
  assert.match(t, /86s logged 1/i);
  assert.match(t, /People 2/i);
  assert.match(t, /Closes finished in the app 1 of 1/);
  assert.match(t, /Closes done in full 100%/);
  assert.match(t, /Tonight's quiz, average 8\.0\/10/);
  assert.match(t, /Handover sent, usual time \d\d:\d\d/);
  assert.doesNotMatch(t, /Sam|Mia/);
  const m = await M.evaluate(() => SHARE.pilot());
  assert.match(m.title, /Bar Book pilot/);
  assert.doesNotMatch(JSON.stringify(m), /Sam|Mia/);
  assert.match(await M.evaluate(() => piCsv(MG.pilot)), /Week to,Closes finished in the app/);
  const img = await M.evaluate(async () => { const b = await mgPilotImage(); return [b.type, b.size]; });
  assert.equal(img[0], "image/jpeg");
  assert.ok(img[1] > 20000);
  assert.deepEqual([...M.errs, ...S.errs], []);
});

test("Bar 101 remembers what you know, asks the rest first, has its own speed drill, and reaches Training", async () => {
  await resetEmulators();
  const { M, S } = await team(browser, site, people);
  await practise(S, "b101");
  const n = await S.evaluate(() => B101.length);
  await waitText(S, "#pb101", new RegExp(`You know 0 of ${n}`));
  await S.click('#pb101 [data-qz="b101"]');
  const first = await S.evaluate(() => qz.qs.map((q) => q.name));
  for (let i = 0; i < 10; i++) await answer(S, true);
  await waitText(S, "#pquiz", /10 out of 10/);
  await S.click('#pquiz [data-qz="home"]');
  await waitText(S, "#pb101", new RegExp(`You know 10 of ${n}`));
  assert.match(await text(S, "#pb101"), /✓ known/i);
  // Next go: the ones not known yet come first.
  await S.click('#pb101 [data-qz="b101"]');
  const next = await S.evaluate(() => qz.qs.map((q) => q.name));
  assert.equal(next.filter((x) => first.includes(x)).length, Math.max(0, 10 - (n - 10)));
  await answer(S, false);
  for (let i = 1; i < 10; i++) await answer(S, true);
  await waitText(S, "#pquiz", /9 out of 10/);
  assert.match(await text(S, "#pquiz"), /Say it:/);
  await S.click("#pquiz [data-b101-read]");
  await S.waitForSelector('#pb101 .b101.on');
  // A missed card comes off the known list.
  const missed = next[0], known = await S.evaluate(() => Object.keys(b101Known()));
  assert.ok(!known.includes(missed));
  assert.equal(known.length, 10 + 9 - (first.includes(missed) ? 1 : 0));
  await waitText(S, "#pb101", new RegExp(`You know ${known.length} of ${n}`));
  // Its own speed drill, with its own best.
  await S.click('#pb101 [data-qz="speed101"]');
  for (let i = 0; i < 10; i++) await answer(S, true);
  await waitText(S, "#pquiz", /seconds/);
  assert.equal(await S.locator('#pquiz [data-qz="speed101"]').count(), 1);
  assert.ok(await S.evaluate(() => store.get("speedBest", {})["Bar 101"].secs > 0));

  const box = await card(M, "training");
  await waitText(M, box, /Most Bar 101 practice/);
  assert.match(await text(M, box), /Sam Staff 3 goes, best 10\/10/);
  assert.match((await M.evaluate(() => SHARE.training())).parts.find((p) => p.id === "b101").lines[0], /Sam Staff: 3 goes/);
  assert.deepEqual([...M.errs, ...S.errs], []);
});

test("Ready for Friday ticks itself off", async () => {
  await resetEmulators();
  const { O, M, S } = await team(browser, site, people);
  const box = await card(O, "ready");
  await waitText(O, box, /Firebase rules published.*match this version/);
  assert.match(await text(O, box), /Maintenance's code To do|To do Maintenance's code/);
  assert.match(await text(O, box), /This phone on the Home Screen/);
  await O.click(`${box} [data-ready-bk]`);
  await waitText(O, box, /Daily backups switched on Ticked/);
  await waitText(O, box, /Nothing waiting to send Everything on this phone has reached the server/);
  // A manager sees the same card; the rules and backups lines say they're for Maintenance's phone.
  const mb = await card(M, "ready");
  await waitText(M, mb, /Checked on Maintenance's phone/);
  assert.equal(await M.$$eval(`${mb} [data-ready-bk]`, (x) => x.length), 0);
  // Staff never see it.
  assert.equal(await S.evaluate(() => CARDS().some((c) => c[0] === "ready")), false);

  assert.deepEqual(O.errs, []); assert.deepEqual(M.errs, []); assert.deepEqual(S.errs, []);
});
