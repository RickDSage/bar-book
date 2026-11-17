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
  const csv = await M.evaluate(() => toCsv(["Date", "Time", "Who", "Side", "Item", "What"], mgCsvRows().map((r) => r.slice(0, 6))));
  assert.match(csv, /Sam Staff,Bar,Apple juice,Discarded/);
  assert.match(csv, /Mia Manager,Bar,Apple juice,Added to the list/);
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
