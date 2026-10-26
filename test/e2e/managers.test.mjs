// The Me and Managers tabs end to end: running late, time off, swaps, incidents, report reviews and
// anonymous feedback, and what each role can see and decide.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, toastOf, attempt, ukDay } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });
const people = [["M", "Mia Manager", "mia", "manager"], ["S", "Sam Staff", "sam", "staff"]];
const day = (n) => ukDay(Date.now() + n * 864e5);
const waitToast = (p, re) => p.waitForFunction((s) => new RegExp(s).test(document.querySelector("#toast").textContent), re.source);

test("staff ask for time off, swaps and lateness; managers decide", async () => {
  await resetEmulators();
  const { O, M, S } = await team(browser, site, people);
  for (const p of [O, M, S]) await p.evaluate(() => show("notices"));
  assert.equal(await S.$$eval("[data-tpane]", (x) => x.map((e) => e.dataset.tpane).join()), "board,chat,activity,reports,me");
  assert.equal(await O.$$eval("[data-tpane]", (x) => x.map((e) => e.dataset.tpane).join()), "board,chat,reports,requests,managers,me");

  await O.evaluate(() => show("drinks"));
  await S.click("[data-tpane=me]"); await S.click('[data-eta="15"]'); await S.fill("[data-f=note]", "Train delayed"); await S.click("#me-go");
  await waitToast(O, /^Sam Staff: Running late · ETA \d\d:\d\d$/);

  await S.click("[data-mek=off]"); await S.fill("[data-f=date1]", day(7)); await S.click("#me-go");
  assert.equal(await toastOf(S), "Pick the first and last day off");
  await S.fill("[data-f=date1]", day(-3)); await S.fill("[data-f=date2]", day(-2)); await S.click("#me-go");
  assert.equal(await toastOf(S), "That date has already gone");
  await S.fill("[data-f=date1]", day(7)); await S.fill("[data-f=date2]", day(9)); await S.click("#me-go");
  await S.click("[data-mek=swap]"); await S.fill("[data-f=date1]", day(3)); await S.fill("[data-f=with]", "Tia"); await S.click("#me-go");
  await S.click("[data-mek=incident]"); await S.selectOption("[data-f=ikind]", "Guest complaint");
  await S.fill("[data-f=itext]", "Table 12 waited 40 minutes for shakes"); await S.click("#me-go");
  await M.waitForFunction(() => LIVE.asks.length === 3 && LIVE.incidents.length === 1);
  const asks = await M.evaluate(() => LIVE.asks.map((a) => Object.keys(a).filter((k) => !["id", "pending"].includes(k)).sort().join()));
  assert.deepEqual(asks, ["at,date1,kind,name,note,status,uid,with", "at,date1,date2,kind,name,note,status,uid", "at,eta,kind,name,note,status,uid"], "each kind saves only its own fields");

  await S.evaluate(() => show("drinks"));
  await M.click("[data-tpane=requests]");
  await M.click("[data-to=seen]");
  await M.waitForFunction(() => !document.querySelector("[data-to=seen]"));
  await M.click("[data-to=approved] >> nth=0");
  await M.waitForFunction(() => document.querySelectorAll("[data-to=approved]").length === 1);
  await M.click("[data-to=declined] >> nth=0");
  await S.waitForFunction(() => LIVE.asks.every((a) => a.status !== "pending"));
  assert.deepEqual(await S.evaluate(() => LIVE.asks.map((a) => `${a.kind}:${a.status}:${a.by}`)), ["swap:approved:Mia Manager", "off:declined:Mia Manager", "late:seen:Mia Manager"]);
  await waitToast(S, / by Mia Manager: /);

  // "Seen" isn't a dead end: a seen request can still be approved, or cancelled by whoever sent it.
  const ask = (p, a) => p.evaluate((a) => LIVE.api.ask(a), a);
  await ask(S, { kind: "off", date1: day(20), date2: day(21), note: "" });
  await ask(S, { kind: "swap", date1: day(22), with: "Tia", note: "" });
  await M.waitForFunction(() => LIVE.asks.filter((a) => a.status === "pending").length === 2 && !LIVE.asks.some((a) => a.pending));
  const [swap, off] = await M.evaluate(() => LIVE.asks.filter((a) => a.status === "pending").map((a) => a.id));
  for (const id of [swap, off]) assert.equal(await attempt(M, (id) => LIVE.api.decide(id, "seen"), id), "allowed");
  assert.equal(await attempt(M, (id) => LIVE.api.decide(id, "approved"), off), "allowed");
  assert.equal(await attempt(S, (id) => LIVE.api.cancelAsk(id), swap), "allowed");
  assert.equal(await attempt(S, (id) => LIVE.api.cancelAsk(id), off), "permission-denied", "a decided request stays on record");
  assert.equal(await attempt(S, (id) => LIVE.api.decide(id, "approved"), off), "permission-denied");

  // Managers don't decide their own requests.
  await ask(M, { kind: "late", eta: "18:30", note: "" });
  await M.waitForFunction(() => /Another manager or the owner decides this one/.test(document.querySelector("#requests").innerText));
  const mine = await M.evaluate(() => LIVE.asks.find((a) => a.uid === LIVE.uid).id);
  assert.equal(await attempt(M, (id) => LIVE.api.decide(id, "seen"), mine), "permission-denied");
  assert.equal(await attempt(O, (id) => LIVE.api.decide(id, "seen"), mine), "allowed");
  assert.equal(await attempt(S, () => LIVE.api.ask({ kind: "late", eta: "", note: "" })), "permission-denied", "a late request needs an arrival time");
  assert.deepEqual([O.errs, M.errs, S.errs], [[], [], []]);
});

test("incidents are for managers' eyes and close with what was done", async () => {
  await resetEmulators();
  const { M, S } = await team(browser, site, people);
  await S.evaluate(() => LIVE.api.incident("Breakage or damage", "Glass washer door cracked"));
  await M.waitForFunction(() => LIVE.incidents.length === 1);
  assert.equal(await S.evaluate(() => LIVE.incidents.length), 0, "staff can't read incidents, their own included");
  const id = await M.evaluate(() => LIVE.incidents[0].id);
  assert.equal(await attempt(S, (id) => LIVE.api.closeIncident(id, "Fixed"), id), "permission-denied");
  await M.evaluate(() => show("notices")); await M.click("[data-tpane=managers]"); await M.click("[data-msub=incidents]");
  await M.click("[data-inc-close]");
  assert.equal(await toastOf(M), "Say what was done about it first");
  await M.fill("[data-inct]", "Engineer booked for Tuesday"); await M.click("[data-inc-close]");
  await M.waitForFunction(() => LIVE.incidents[0].status === "closed" && !LIVE.incidents[0].pending);
  assert.match(await M.$eval("#incs", (e) => e.textContent), /What was done: Engineer booked for Tuesday · Mia Manager/);
  assert.equal(await attempt(M, (id) => LIVE.api.closeIncident(id, "Again"), id), "permission-denied", "a closed incident stays closed");
  assert.deepEqual([M.errs, S.errs], [[], []]);
});

test("managers review reports and leave each other anonymous feedback", async () => {
  await resetEmulators();
  const { O, M, S } = await team(browser, site, people);
  await S.click("[data-tab=tally]"); await S.click(".ptabs [data-pane=send]"); await S.click("#t-copy");
  await S.evaluate(() => setMode("floor")); await S.click(".ptabs [data-pane=send]"); await S.click("#t-copy");
  await O.waitForFunction(() => LIVE.reports.length === 2 && !LIVE.reports.some((r) => r.pending));
  await O.evaluate(() => show("notices")); await O.click("[data-tpane=reports]");
  await O.click("[data-rv][data-v=flag] >> nth=0");
  assert.equal(await toastOf(O), "Say what's wrong in the comment box, then flag it");
  await O.fill("[data-rvt] >> nth=0", "Good close, bins missed"); await O.click("[data-rv][data-v=flag] >> nth=0");
  await O.click("[data-rv][data-v=up] >> nth=1");
  await M.waitForFunction(() => LIVE.reviews.length === 2);
  assert.deepEqual(await M.evaluate(() => LIVE.reviews.map((v) => `${v.verdict}:${v.text}:${v.name}`).sort()), ["flag:Good close, bins missed:Olly Owner", "up::Olly Owner"]);
  assert.equal(await attempt(S, () => LIVE.api.review(LIVE.reports[0].id, "up", "")), "permission-denied");
  assert.equal(await attempt(O, () => LIVE.api.review("abcdefghijklmnopqrst", "up", "")), "permission-denied", "a review needs a real report");

  await M.evaluate(() => show("notices")); await M.click("[data-tpane=managers]"); await M.click("[data-msub=feedback]");
  await M.selectOption("[data-f=fbWho]", { label: "Olly Owner" }); await M.click('[data-score="Needs improvement"]'); await M.click("#fb-go");
  assert.equal(await toastOf(M), "Say what needs to improve");
  await M.fill("[data-f=fbText]", "Sign off faster please"); await M.click("#fb-go");
  await O.click("[data-tpane=managers]"); await O.click("[data-msub=feedback]");
  await O.selectOption("[data-f=fbWho]", { label: "Mia Manager" }); await O.click("[data-score=Excellent]"); await O.click("#fb-go");
  await O.waitForFunction(() => LIVE.ratings.length === 2);
  await M.waitForFunction(() => LIVE.ratings.length === 1);
  assert.equal(await M.evaluate(() => LIVE.ratings[0].score), "Excellent", "a manager sees only what's about them");
  assert.deepEqual(await O.evaluate(() => [...new Set(LIVE.ratings.flatMap((r) => Object.keys(r)))].sort()), ["about", "aboutName", "at", "id", "pending", "score", "text"], "nothing saved says who wrote it");
  assert.equal(await attempt(S, () => LIVE.api.rate({ uid: "x", name: "x" }, "Good", "")), "permission-denied");
  assert.equal(await attempt(M, () => LIVE.api.rate({ uid: LIVE.uid, name: LIVE.me }, "Good", "")), "permission-denied", "nobody rates themselves");
  assert.deepEqual(await S.evaluate(() => [LIVE.incidents.length, LIVE.reviews.length, LIVE.ratings.length]), [0, 0, 0]);
  assert.deepEqual([O.errs, M.errs, S.errs], [[], [], []]);
});
