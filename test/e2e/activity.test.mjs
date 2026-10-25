// Activity, spreadsheet downloads and broadcasts end to end: what managers and staff each see, and what the
// downloaded files contain.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, attempt } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });
const people = [["M", "Mia Manager", "mia", "manager"], ["S", "Sam Staff", "sam", "staff"]];
const text = (p, sel) => p.$eval(sel, (e) => e.textContent);
const rx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Prepares the download for the chosen section, then reads the file the Save button would give.
async function download(p, sec) {
  await p.click(`[data-act="${sec}"]`);
  await p.click("#act-csv");
  await p.waitForSelector("#act-save");
  return p.evaluate(async () => { const a = document.querySelector("#act-save"); return { name: a.download, csv: await (await fetch(a.href)).text() }; });
}

test("activity, downloads and broadcasts", async () => {
  await resetEmulators();
  const { O, M, S } = await team(browser, site, people);
  const drink = await S.evaluate(() => D[0].name);
  await S.evaluate(async (d) => {
    await LIVE.api.post("=1+1 limes, please");
    await LIVE.api.set86(d, true);
    await LIVE.api.tick("open", 0, true);
    await LIVE.api.request("Limes", "2 bags");
    await LIVE.api.raise({ title: "Glass washer leaking", detail: "", area: "bar", urgent: true });
  }, drink);

  // A broadcast sits at the top of every page for everyone else until they tap Got it.
  await M.evaluate(() => show("notices"));
  await M.click("#pin-form summary"); await M.fill("#p-text", "Tasting at 4"); await M.click("#p-go");
  await S.waitForSelector("#bcast .bcast");
  assert.match(await text(S, "#bcast"), /Broadcast from Mia Manager.*Tasting at 4/);
  await M.waitForFunction(() => LIVE.notices.length === 1 && !LIVE.notices[0].pending);
  assert.equal(await M.locator("#bcast .bcast").count(), 0, "not shown to whoever sent it");
  await S.click("[data-bc-ok]");
  await S.waitForSelector("#bcast .bcast", { state: "detached" });
  assert.equal(await S.evaluate(() => (renderBcast(), document.querySelectorAll("#bcast .bcast").length)), 0, "Got it is remembered");

  // Managers: Activity opens first in the Managers tab, with every section.
  await O.evaluate(() => show("notices")); await O.click("[data-tpane=managers]");
  await O.waitForFunction(() => LIVE.feed.length && LIVE.outlog.length && LIVE.issues.length && LIVE.requests.length && Object.keys(LIVE.tickBy).length);
  await O.waitForFunction(() => /sent a broadcast/.test(document.querySelector("#act").textContent));
  const act = await text(O, "#act");
  for (const re of [/Sam Staff posted on the board/, new RegExp(`Sam Staff 86'd ${rx(drink)}`), /Sam Staff ticked/, /Sam Staff asked for Limes/, /Sam Staff raised \(urgent\): Glass washer leaking/, /Mia Manager sent a broadcast/, /Olly Owner added Sam Staff \(staff\)/]) assert.match(act, re);
  assert.equal(await O.$$eval("#act [data-act]", (x) => x.length), 12);
  await O.click('[data-act="86"]');
  assert.deepEqual(await O.$$eval("#act .staffrow .n", (x) => x.map((e) => e.textContent)), [`Sam Staff 86'd ${drink}`]);

  // Downloads hold the full history as a spreadsheet, and a cell that starts like a formula can't run as one.
  const out = await download(O, "86");
  assert.match(out.name, /^black-tap-86-\d{4}-\d\d-\d\d\.csv$/);
  const lines = out.csv.replace(/^\ufeff/, "").split("\r\n");
  assert.equal(lines[0], "Date,Time,Item,Change,By");
  assert.equal(lines[1].split(",").slice(2).join(), `${drink},86'd,Sam Staff`);
  assert.match(lines[1], /^\d{4}-\d\d-\d\d,\d\d:\d\d,/);
  const board = await download(O, "board");
  assert.match(board.csv, /,Post,Sam Staff,,"'=1\+1 limes, please"(\r\n|$)/);
  assert.match(board.csv, /,Broadcast,Mia Manager,Everyone,Tasting at 4/);
  const all = await download(O, "all");
  assert.match(all.name, /^black-tap-activity-/);
  assert.match(all.csv, /,Team,Olly Owner,added Mia Manager \(manager\),/);
  assert.match((await download(O, "checks")).csv, /,Opening checklist,.*,Sam Staff/);

  // Managers' other pages are one tap away.
  await O.click("[data-msub=incidents]");
  assert.deepEqual(await O.evaluate(() => ["#act", "#incs", "#mgr"].map((s) => document.querySelector(s).hidden)), [true, false, true]);

  // Staff get their own Activity for their side of the venue, without the managers' sections or downloads.
  await S.evaluate(() => show("notices")); await S.click("[data-tpane=activity]");
  await S.waitForFunction(() => /86'd/.test(document.querySelector("#sact").textContent));
  assert.deepEqual(await S.$$eval("#sact [data-act]", (x) => x.map((e) => e.dataset.act)), ["all", "board", "checks", "86", "stock", "issues", "concerns", "reports"]);
  assert.equal(await S.locator("#act-csv").count(), 0);
  assert.match(await text(S, "#sact"), /Mia Manager sent a broadcast/);
  assert.doesNotMatch(await text(S, "#sact"), /added Sam Staff/);
  assert.deepEqual([O.errs, M.errs, S.errs], [[], [], []]);
});

test("broadcasts for the bar or the floor, managers left out, and who has read them", async () => {
  await resetEmulators();
  const { O, M, S, T } = await team(browser, site, [...people, ["T", "Tia Staff", "tia", "staff"]]);
  await T.evaluate(() => setMode("floor"));
  for (const p of [O, M]) await p.evaluate(() => show("notices"));

  // The owner sends one to the bar only and leaves managers out.
  await O.click("#pin-form summary"); await O.click('[data-bc-side="bar"]'); await O.uncheck("#p-mgrs");
  await O.fill("#p-text", "Bar team: new garnish tray"); await O.click("#p-go");
  await S.waitForSelector("#bcast .bcast");
  assert.match(await text(S, "#bcast"), /Bar team: new garnish tray/);
  await T.waitForFunction(() => LIVE.notices.length === 1);
  assert.equal(await T.locator("#bcast .bcast").count(), 0, "a phone set to the floor doesn't show a bar broadcast");
  await S.click("[data-bc-ok]");
  await O.waitForFunction(() => /Read by 1: Sam Staff/.test(document.querySelector("#pins").textContent));
  assert.match(await text(O, "#pins"), /Bar only.*Managers left out/);

  // Managers can't leave managers out, can't read one they were left out of, and see who has read theirs.
  assert.equal(await M.locator("#p-mgrs").count(), 0, "only the owner gets the managers switch");
  assert.equal(await attempt(M, () => LIVE.api.pin("Just us", "all", false)), "permission-denied");
  await M.click("#pin-form summary"); await M.fill("#p-text", "Tasting at 4"); await M.click("#p-go");
  await M.waitForFunction(() => LIVE.notices.length === 1 && !LIVE.notices[0].pending);
  assert.equal(await M.evaluate(() => LIVE.notices[0].text), "Tasting at 4");
  await T.waitForSelector("#bcast .bcast"); await T.click("[data-bc-ok]");
  await M.waitForFunction(() => /Read by 1: Tia Staff\. Not yet: Olly Owner, Sam Staff/.test(document.querySelector("#pins").textContent));
  assert.equal(await attempt(M, (id) => LIVE.api.gotIt({ id, managers: true }), await O.evaluate(() => LIVE.notices.find((x) => x.managers === false).id)), "permission-denied");

  // Got it follows the person, not the phone.
  await S.reload(); await S.click("#w-ok"); await S.waitForFunction(() => LIVE.me && LIVE.loaded.has("seen") && LIVE.notices.length === 2);
  assert.match(await text(S, "#bcast"), /Tasting at 4/);
  assert.doesNotMatch(await text(S, "#bcast"), /garnish tray/);
  assert.deepEqual([O.errs, M.errs, S.errs, T.errs], [[], [], [], []]);
});
