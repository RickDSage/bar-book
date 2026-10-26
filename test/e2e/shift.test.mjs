// Tonight's shift end to end: the 86 board, the handover, what's left before sign-off, old stock requests, notices, the board and reports.
// Tasks and restocking have their own file, tasks.test.mjs.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, toastOf, attempt, adminWrite, oldPost } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });
const people = [["M", "Mia Manager", "mia", "manager"], ["S", "Sam Staff", "sam", "staff"]];
const waitToast = (p, re) => p.waitForFunction((s) => new RegExp(s).test(document.querySelector("#toast").textContent), re.source);

test("the 86 board is shared, says who did it, and keeps a log managers can read", async () => {
  await resetEmulators();
  const { O, M, S } = await team(browser, site, people);
  await S.click("[data-tab=tally]"); await S.click(".ptabs [data-pane=stock]");
  await S.selectOption("#s-86", "Guinness");
  await O.waitForFunction(() => LIVE.out.has("Guinness"));
  await S.waitForSelector('[data-back="Guinness"]');
  assert.match(await S.$eval('[data-back="Guinness"]', (e) => e.parentElement.innerText), /86'd by Sam Staff/);

  await O.evaluate(() => openSheet(D.find((d) => d.name === "Negroni").id));
  await O.click("#sh-86");
  await S.waitForFunction(() => LIVE.out.has("Negroni"));
  await S.evaluate(() => openSheet(D.find((d) => d.name === "Negroni").id));
  assert.match(await S.$eval(".outbar", (e) => e.innerText), /By Olly Owner/);
  await S.evaluate(() => closeSheet());

  await S.click('[data-back="Guinness"]');
  await O.waitForFunction(() => !LIVE.out.has("Guinness") && LIVE.outlog.length === 3);
  assert.deepEqual(await O.evaluate(() => LIVE.outlog.map((x) => `${x.itemName} ${x.action} ${x.name}`).reverse()),
    ["Guinness out Sam Staff", "Negroni out Olly Owner", "Guinness back Sam Staff"]);
  assert.equal(await S.evaluate(() => LIVE.outlog.length), 0, "staff don't get the log");
  assert.equal(await attempt(S, () => LIVE.api.set86("Limes", false)), "It isn't on the 86 list");
  assert.equal(await attempt(M, () => LIVE.api.set86("Negroni", true)), "permission-denied", "an 86 already on the board can't be overwritten");
  assert.deepEqual([O.errs, M.errs, S.errs], [[], [], []]);
});

test("the next shift sees the last handover, the send page lists what's left, and the note starts empty each night", async () => {
  await resetEmulators();
  const { O, S } = await team(browser, site, people);
  const sam = await S.evaluate(() => LIVE.uid);
  const text = "Black Tap Soho bar shift, Sat 24 Oct 2026, 02:10\nRun by: Sam Staff\nClosing manager: (not picked)\n\nClosing checklist: 19 of 21 done\nNot done:\n- Ice well emptied, cleaned and dried\nBlocked:\n- Glass washer drained and cleaned (Part on order)\n\n86'd: nothing\n\nNote for handover:\nIce machine slow, engineer booked\n\nSigned off by: ____________";
  // Sent 30 hours ago, so always from an earlier shift.
  await adminWrite("reports/old", { side: { stringValue: "bar" }, text: { stringValue: text }, summary: { stringValue: "Bar · test" }, photos: { integerValue: "0" },
    uid: { stringValue: sam }, name: { stringValue: "Sam Staff" }, at: { timestampValue: new Date(Date.now() - 30 * 36e5).toISOString() } });
  await O.click("[data-tab=tally]"); await O.click(".ptabs [data-pane=open]");
  await O.waitForSelector("#handover");
  assert.match(await O.$eval("#handover", (e) => e.innerText), /Last handover · Sam Staff[\s\S]*Ice machine slow, engineer booked[\s\S]*Ice well emptied, cleaned and dried[\s\S]*Blocked: Glass washer drained and cleaned \(Part on order\)/);
  await O.evaluate(() => setMode("floor")); await O.click(".ptabs [data-pane=fset]");
  assert.equal(await O.locator("#handover").count(), 0, "the floor only sees floor reports");
  await O.evaluate(() => setMode("bar"));

  await S.click("[data-tab=tally]"); await S.click(".ptabs [data-pane=close]");
  await S.click('[data-list=close][data-i="0"]');
  await O.waitForFunction(() => LIVE.tasks["close-0"]?.status === "done");
  await O.click(".ptabs [data-pane=send]");
  assert.equal(await O.$eval("#todo", (e) => e.open), false, "a long list starts folded");
  await O.click("#todo summary");
  const left = await O.$eval("#todo", (e) => e.innerText);
  assert.match(left, /Still to do \(35\)\s*Upstairs restaurant floor[\s\S]*Fridges at 5°C/i, "20 closing items, then 15 opening ones");
  assert.doesNotMatch(left, /Last orders called/);
  assert.match(await O.$eval("#t-copy", (e) => e.textContent), /Send with 35 not done/);
  await O.click('[data-jump="close"][data-jump-i="1"]');
  assert.equal(await O.evaluate(() => pane), "close");

  await S.click(".ptabs [data-pane=send]"); await S.fill("#s-note", "Ice machine slow"); await S.click('[data-closer="Olaya"]');
  await S.evaluate(() => renderTally());
  assert.equal(await S.$eval("#s-note", (e) => e.value), "Ice machine slow", "kept through the night");
  await S.evaluate(() => { store.set("noteDay", "2000-01-01"); renderTally(); });
  assert.equal(await S.$eval("#s-note", (e) => e.value), "", "a new shift starts with an empty note");
  assert.equal(await S.locator('[data-closer][aria-pressed="true"]').count(), 0);
  assert.deepEqual(await S.evaluate(() => LIVE.tasks["close-0"].status), "done", "tonight's tasks stay");
  assert.deepEqual([O.errs, S.errs], [[], []]);
});

test("old stock requests from before restocking: only managers see them, and mark them ordered or turn them down", async () => {
  await resetEmulators();
  const { O, M, S } = await team(browser, site, people);
  const sam = await S.evaluate(() => LIVE.uid);
  const old = (item, note, mins) => ({ item: { stringValue: item }, note: { stringValue: note }, done: { booleanValue: false }, uid: { stringValue: sam },
    name: { stringValue: "Sam Staff" }, at: { timestampValue: new Date(Date.now() - mins * 6e4).toISOString() } });
  await adminWrite("requests/a", old("Blue roll", "2 rolls", 30));
  await adminWrite("requests/b", old("Large black bin liners", "", 20));
  await adminWrite("requests/c", old("Limes", "", 10));
  await O.waitForFunction(() => LIVE.requests.length === 3);
  assert.equal(await S.evaluate(() => LIVE.requests.length), 0, "staff don't load them any more");
  assert.equal(await attempt(S, () => LIVE.api.markOrdered("a")), "permission-denied");

  await O.evaluate(() => show("notices")); await O.click("[data-tpane=requests]");
  assert.match(await O.$eval("#requests", (e) => e.innerText), /Old stock requests[\s\S]*Limes[\s\S]*Large black bin liners[\s\S]*Blue roll\n2 rolls/i);
  await O.click('[data-ordered="b"]');
  await M.waitForFunction(() => LIVE.requests.find((r) => r.id === "b")?.done);
  assert.equal(await attempt(M, () => LIVE.api.cancelRequest("b")), "permission-denied", "an ordered request stays on record");
  await M.evaluate(() => show("notices")); await M.click("[data-tpane=requests]");
  await M.click('[data-rq-drop="c"]');
  await O.waitForFunction(() => LIVE.requests.length === 2);
  // Once the last one is cleared, the section goes.
  await M.click('[data-ordered="a"]');
  await O.waitForFunction(() => LIVE.requests.every((r) => r.done));
  assert.doesNotMatch(await O.$eval("#requests", (e) => e.innerText), /Old stock requests/i);
  assert.deepEqual(await O.evaluate(() => LIVE.requests.map((r) => [r.id, r.doneBy])), [["b", "Olly Owner"], ["a", "Mia Manager"]]);
  assert.deepEqual([O.errs, M.errs, S.errs], [[], [], []]);
});

test("notices and the team board: who can post and who can take things down", async () => {
  await resetEmulators();
  const { O, M, S } = await team(browser, site, people);
  await O.evaluate(() => show("notices"));
  await O.click("#pin-form summary"); await O.fill("#p-text", "Guinness line down tonight"); await O.click("#p-go");
  await waitToast(S, /^Broadcast: Guinness line down tonight$/);
  assert.equal(await S.$eval("#bell-n", (e) => (e.hidden ? "0" : e.textContent)), "1");
  assert.equal(await attempt(S, () => LIVE.api.pin("Free drinks", "all", true)), "permission-denied");

  await M.evaluate(() => show("notices"));
  await M.waitForFunction(() => LIVE.notices.length === 1);
  assert.equal(await M.locator("[data-unpin]").count(), 0, "no remove button on the owner's notice");
  const ownerNotice = await M.evaluate(() => LIVE.notices[0].id);
  assert.equal(await attempt(M, (id) => LIVE.api.unpin(id), ownerNotice), "permission-denied");
  await M.evaluate(() => LIVE.api.pin("Tasting at 4", "all", true));
  await O.waitForFunction(() => LIVE.notices.length === 2);
  assert.equal(await attempt(O, (id) => LIVE.api.unpin(id), await O.evaluate(() => LIVE.notices.find((x) => x.name === "Mia Manager").id)), "allowed");

  // The board is closed: old posts show folded away, and can still be taken down.
  await oldPost(await S.evaluate(() => LIVE.uid), "Sam Staff", "Limes low");
  await oldPost(await O.evaluate(() => LIVE.uid), "Olly Owner", "Team meeting Monday");
  await M.waitForFunction(() => LIVE.feed.length === 2);
  assert.equal(await M.locator("#c-text").count(), 0, "no Post box");
  assert.match(await M.$eval("#feed summary", (e) => e.textContent), /Old board posts \(2\)/);
  const post = (p, name) => p.evaluate((n) => LIVE.feed.find((x) => x.name === n).id, name);
  assert.equal(await attempt(M, (id) => LIVE.api.removePost(id), await post(M, "Olly Owner")), "permission-denied");
  assert.equal(await attempt(S, (id) => LIVE.api.removePost(id), await post(S, "Olly Owner")), "permission-denied");
  assert.equal(await attempt(M, (id) => LIVE.api.removePost(id), await post(M, "Sam Staff")), "allowed");
  assert.deepEqual([O.errs, M.errs, S.errs], [[], [], []]);
});

test("shift reports are sent once, signed off once, and show on Tonight", async () => {
  await resetEmulators();
  const { O, M, S } = await team(browser, site, people);
  await S.click("[data-tab=tally]"); await S.click(".ptabs [data-pane=send]");
  assert.equal(await S.locator("#s-who").count(), 0, "no name box: the login says who");
  await S.click("#t-copy");
  await waitToast(S, /^Sent to the managers for sign-off$/);
  await O.waitForFunction(() => LIVE.reports.length === 1);
  const r = await O.evaluate(() => LIVE.reports[0]);
  assert.equal(r.side, "bar");
  assert.match(r.summary, /^Bar · Opening 0\/\d+ · Closing 0\/\d+ · 0 86'd$/);
  assert.match(r.text, /Run by: Sam Staff/);
  assert.equal(await attempt(S, (id) => LIVE.api.signOff(id), r.id), "permission-denied");

  await O.evaluate(() => show("notices")); await O.click("[data-tpane=reports]"); await O.click("[data-sign]");
  await waitToast(S, /^Olly Owner signed off your shift report$/);
  assert.equal(await attempt(M, (id) => LIVE.api.signOff(id), r.id), "permission-denied", "a signed report can't be signed again");
  await O.waitForFunction(() => /Signed off by Olly Owner/.test(document.querySelector("#reports").textContent));

  await S.evaluate(() => setMode("floor")); await S.click(".ptabs [data-pane=send]"); await S.click("#t-copy");
  await O.waitForFunction(() => LIVE.reports.length === 2);
  assert.equal(await O.evaluate(() => LIVE.reports[0].side), "floor");
  await O.click("[data-tpane=board]");
  const dash = await O.$eval("#dash", (e) => e.innerText.replace(/\n+/g, " | "));
  assert.match(dash, /Sent \| bar report tonight \| Sent \| floor report tonight \| 1 \| reports to sign off/);
  assert.deepEqual([O.errs, M.errs, S.errs], [[], [], []]);
});
