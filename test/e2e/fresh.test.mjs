// Start fresh: the owner clears the shift work for everyone after trying the app out, with their PIN typed again, and
// the logins, lists, labels, calendar, games and records stay.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, OWNER_PIN } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });
const people = [["M", "Mia Manager", "mia", "manager"], ["S", "Sam Staff", "sam", "staff"]];

const flat = (s) => s.replace(/\s+/g, " ").trim();
const text = async (p, sel) => flat(await p.$eval(sel, (e) => e.innerText));
const waitToast = (p, re) => p.waitForFunction((s) => new RegExp(s).test(document.querySelector("#toast").textContent), re.source);
// What each phone holds of the shift work, and of what stays.
const work = (p) => p.evaluate(() => ({ reports: LIVE.reports.length, shifts: LIVE.shifts.length, tasks: Object.keys(LIVE.tasks).length, out: LIVE.out.size,
  restock: LIVE.restock.length, issues: LIVE.issues.length, notices: LIVE.notices.length, concerns: LIVE.concerns.length, events: LIVE.events.filter((e) => e.kind !== "label").length }));
const kept = (p) => p.evaluate(() => ({ cal: LIVE.cal.length, fixtures: LIVE.fixtures.length, labels: LIVE.labels.length, labelEvents: LIVE.events.filter((e) => e.kind === "label").length }));
async function teamPage(p) {
  await p.evaluate(() => show("notices"));
  await p.click("[data-tpane=managers]"); await p.click('[data-msub="team"]');
}

test("the owner sees what it clears and keeps, needs their PIN, and every phone has the fresh start", async () => {
  await resetEmulators();
  const { O, M, S } = await team(browser, site, people);
  const sam = await M.evaluate(() => LIVE.staff.find((p) => p.name === "Sam Staff").uid);
  const [d2, d7] = await M.evaluate(() => [addDays(shiftDay(), 2), addDays(shiftDay(), 7)]);
  // A night's shift work, plus what stays: the calendar, a game, a date label and an incident.
  await M.evaluate(async ([d, uid, d7]) => {
    const A = LIVE.api;
    await A.shiftsAdd([{ week: weekOf(d), day: d, start: "18:00", end: "02:00", side: "bar", note: "", who: uid, whoName: "Sam Staff", offer: "", offerName: "" }], true);
    await Promise.all([A.pin("Tasting at 4", "all", true), A.saveCal("", { title: "Half term", kind: "school", date1: d7, date2: d7, note: "" }),
      A.addFixture({ day: d, ko: "20:00", home: "Arsenal", away: "Chelsea", comp: "Premier League", channel: "Sky Sports Main Event", screen: "All screens" }),
      A.label(null, "added", { item: "Lime juice", side: "bar", life: 3, on: true })]);
  }, [d2, sam, d7]);
  await S.waitForFunction(() => LIVE.notices.length === 1 && LIVE.shifts.length === 1);
  await S.evaluate(async (d7) => {
    const A = LIVE.api;
    await Promise.all([A.setTask("close", 0, itemText("close", 0), "done"), A.set86("Limes", true), A.askRestock({ item: "Blue roll", qty: 1, unit: "each", dest: "up", detail: "" }),
      A.ask({ kind: "off", date1: d7, date2: d7, note: "Wedding" }), A.raise({ title: "Glass washer leaking", detail: "", area: "bar", urgent: false, again: null }),
      A.sendReport("bar", "Bar report", "Bar · test"), A.reportConcern({ reason: "cleaning", area: "toilets", note: "Sink blocked", to: "all", anon: false }, []),
      A.incident("Breakage or damage", "Glass washer door cracked"), A.gotIt(LIVE.notices[0])]);
  }, d7);
  await M.waitForFunction(() => LIVE.reports.length === 1 && LIVE.asks.length === 1 && LIVE.incidents.length === 1 && LIVE.concerns.length === 1);
  await M.evaluate(() => LIVE.api.review(LIVE.reports[0].id, "up", ""));
  for (const p of [M, S]) await p.waitForFunction(() => LIVE.out.size === 1 && LIVE.restock.length === 1 && LIVE.issues.length === 1 && Object.keys(LIVE.tasks).length === 1);
  const before = { reports: 1, shifts: 1, tasks: 1, out: 1, restock: 1, issues: 1, notices: 1, concerns: 1, events: 3 };
  assert.deepEqual(await work(S), before);

  // Only the owner has it, under Team members.
  await teamPage(M);
  assert.equal(await M.locator("#fresh-box").count(), 0, "managers don't");
  await teamPage(O);
  await O.click("#fresh-box summary");
  const box = await text(O, "#fresh");
  assert.match(box, /^Clears the shift work for everyone, for a clean start once you've finished trying the app out\. It can't be undone/);
  assert.match(box, /IT CLEARS The rota, time off and swap asks, shift reports with their photos, reviews and sign-offs, .* IT KEEPS Everyone's logins and PINs, the audit trail, /);
  assert.match(box, /FIRST, DOWNLOAD WHAT YOU WANT TO KEEP Everything in Activity The rota Photos aren't in the spreadsheets/);

  // What it would clear, kind by kind.
  await O.click("#fr-count");
  await O.waitForSelector("#fresh .frlist");
  const { total } = await O.evaluate(() => LIVE.api.freshCounts());
  assert.equal(total, 15);
  assert.match(await text(O, "#fresh"), /IT WOULD CLEAR 15 Shifts on the rota: 1 Time off, swaps and running late: 1 Shift reports: 1 Reviews of reports: 1 Changes in the activity history: 3 Restocks: 1 On the 86 board: 1 86 log entries: 1 Issues: 1 Concerns: 1 Broadcasts: 1 Got it taps on broadcasts: 1 Checklist items: 1 Your PIN/);

  // The wrong PIN, or the words not typed, clears nothing.
  await O.fill("#fr-pin", "999999"); await O.fill("#fr-words", "START FRESH"); await O.click("#fr-go");
  await O.waitForFunction(() => /That PIN isn't right\./.test($("#fresh").innerText));
  await O.fill("#fr-pin", OWNER_PIN); await O.fill("#fr-words", "start"); await O.click("#fr-go");
  await O.waitForFunction(() => /Type START FRESH to show you mean it\./.test($("#fresh").innerText));
  assert.equal((await O.evaluate(() => LIVE.api.freshCounts())).total, 15, "nothing cleared yet");

  // With both, it's cleared for everyone.
  await O.fill("#fr-pin", OWNER_PIN); await O.fill("#fr-words", "start fresh"); await O.click("#fr-go");
  await O.waitForFunction(() => /Done: 15 cleared\. Everyone's app has the fresh start\./.test($("#fresh").innerText), null, { timeout: 30000 });
  const none = { reports: 0, shifts: 0, tasks: 0, out: 0, restock: 0, issues: 0, notices: 0, concerns: 0, events: 0 };
  for (const p of [O, M, S]) await p.waitForFunction(() => !LIVE.reports.length && !LIVE.shifts.length && !Object.keys(LIVE.tasks).length && !LIVE.concerns.length);
  for (const p of [O, M, S]) assert.deepEqual(await work(p), none);
  assert.deepEqual(await M.evaluate(() => [LIVE.asks.length, LIVE.reviews.length, LIVE.outlog.length, LIVE.incidents.length, LIVE.staff.length]), [0, 0, 0, 1, 3]);
  assert.equal((await O.evaluate(() => LIVE.api.freshCounts())).total, 0);
  // What stays.
  for (const p of [O, S]) assert.deepEqual(await kept(p), { cal: 1, fixtures: 1, labels: 1, labelEvents: 1 });
  // The record, on the owner's phone, and the others are told.
  await waitToast(S, /^Olly Owner started the app fresh$/);
  await O.waitForFunction(() => /Last started fresh .* by Olly Owner, clearing 15\./.test($("#fresh").innerText));

  // The app carries on as normal: the same task again, and a new report.
  await S.evaluate(() => Promise.all([LIVE.api.setTask("close", 0, itemText("close", 0), "done"), LIVE.api.sendReport("bar", "Bar report", "Bar · after")]));
  await M.waitForFunction(() => LIVE.reports.length === 1 && Object.values(LIVE.tasks).some((t) => t.v === 1 && t.status === "done"));
  assert.deepEqual([O.errs, M.errs, S.errs], [[], [], []]);
});
