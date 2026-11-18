// Tonight's shift end to end: the 86 board, the handover, what's left before sign-off, old stock requests, notices, the board and reports.
// Tasks and restocking have their own file, tasks.test.mjs.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, toastOf, attempt, adminWrite, part, handOver, pick86, pickRows, pickClose } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });
const people = [["M", "Mia Manager", "mia", "manager"], ["S", "Sam Staff", "sam", "staff"]];
const waitToast = (p, re) => p.waitForFunction((s) => new RegExp(s).test(document.querySelector("#toast").textContent), re.source);

test("the 86 board is shared, says who did it, and keeps a log everyone can read", async () => {
  await resetEmulators();
  const { O, M, S } = await team(browser, site, people);
  await S.click("[data-tab=tally]"); await S.click(".ptabs [data-pane=stock]");
  await pick86(S, "guiness", "Guinness");
  await O.waitForFunction(() => LIVE.out.has("Guinness"));
  await S.waitForSelector('[data-out-back="Guinness"]');
  assert.match(await S.$eval('[data-out-back="Guinness"]', (e) => e.parentElement.innerText), /86'd by Sam Staff/);

  await O.evaluate(() => openSheet(D.find((d) => d.name === "Negroni").id));
  await O.click("#sh-86");
  await S.waitForFunction(() => LIVE.out.has("Negroni"));
  await S.evaluate(() => openSheet(D.find((d) => d.name === "Negroni").id));
  assert.match(await S.$eval(".outbar", (e) => e.innerText), /By Olly Owner/);
  await S.evaluate(() => closeSheet());

  await S.click('[data-out-back="Guinness"]');
  assert.equal(await S.evaluate(() => cur), "tally", "Back in stock stays on the Shift page");
  await O.waitForFunction(() => !LIVE.out.has("Guinness") && LIVE.outlog.length === 3);
  assert.deepEqual(await O.evaluate(() => LIVE.outlog.map((x) => `${x.itemName} ${x.action} ${x.name}`).reverse()),
    ["Guinness out Sam Staff", "Negroni out Olly Owner", "Guinness back Sam Staff"]);
  await S.waitForFunction(() => LIVE.outlog.length === 3); // Everyone on the team reads the log: it's the 86 updates in the banner.
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
  await O.click("[data-tab=tally]"); await O.click(".ptabs [data-pane=morning]");
  await O.waitForSelector("#handover");
  assert.match(await O.$eval("#handover", (e) => e.innerText), /Last night's handover · Sam Staff[\s\S]*For the opener \(\d+\)[\s\S]*Ice well emptied, cleaned and dried[\s\S]*Blocked: Glass washer drained and cleaned \(Part on order\)[\s\S]*Outstanding\s*Ice machine slow, engineer booked/);
  await O.evaluate(() => setMode("floor")); await O.click(".ptabs [data-pane=morning]");
  assert.equal(await O.locator("#handover").count(), 0, "the floor only sees floor reports");
  await O.evaluate(() => setMode("bar"));

  await S.click("[data-tab=tally]"); await S.click(".ptabs [data-pane=close]");
  await S.click('[data-list=close][data-i="0"]');
  await O.waitForFunction(() => LIVE.tasks["close-0"]?.status === "done");
  await O.click(".ptabs [data-pane=send]");
  assert.equal(await O.$eval("#todo", (e) => e.open), false, "a long list starts folded");
  await O.click("#todo summary");
  const left = await O.$eval("#todo", (e) => e.innerText);
  assert.match(left, /Still to do \(37\)\s*Open bar tabs closed/i, "37 closing items left, and no opening list");
  assert.doesNotMatch(left, /Last orders called/);
  assert.match(await O.$eval("#t-copy", (e) => e.textContent), /Hand over with 37 not done/);
  await O.click('[data-jump="close"][data-jump-i="1"]');
  assert.equal(await O.evaluate(() => pane), "close");

  await S.click(".ptabs [data-pane=send]"); await S.fill("#ho-issues", "Ice machine slow"); await S.click('[data-closer="Emily"]');
  await S.evaluate(() => renderTally());
  assert.equal(await S.$eval("#ho-issues", (e) => e.value), "Ice machine slow", "kept through the night");
  await S.evaluate(() => { store.set("noteDay", "2000-01-01"); renderTally(); });
  assert.equal(await S.$eval("#ho-issues", (e) => e.value), "", "a new shift starts with an empty handover");
  assert.equal(await S.locator('[data-closer][aria-pressed="true"]').count(), 0);
  assert.deepEqual(await S.evaluate(() => LIVE.tasks["close-0"].status), "done", "tonight's tasks stay");
  assert.deepEqual([O.errs, S.errs], [[], []]);
});

test("closing reports are sent once and the owner and manager read them", async () => {
  await resetEmulators();
  const { O, M, S } = await team(browser, site, people);
  await S.click("[data-tab=tally]"); await S.click(".ptabs [data-pane=send]");
  assert.equal(await S.locator("#s-who").count(), 0, "no name box: the login says who");
  S.answer = "Camera broken"; await S.click("#t-copy");
  await waitToast(S, /^Handover saved for the next shift$/);
  await S.click("#sh-close"); await S.waitForSelector("#sheet", { state: "hidden" });
  await O.waitForFunction(() => LIVE.reports.length === 1);
  const r = await O.evaluate(() => LIVE.reports[0]);
  assert.equal(r.side, "bar");
  assert.match(r.summary, /^Bar · Closing 0\/\d+ · 0 86'd$/);
  assert.match(r.text, /Run by: Sam Staff/);
  await S.evaluate(() => setMode("floor")); await S.click(".ptabs [data-pane=send]"); await handOver(S);
  await O.waitForFunction(() => LIVE.reports.length === 2);
  assert.equal(await O.evaluate(() => LIVE.reports[0].side), "floor");
  await part(O, "reports");
  assert.equal(await O.locator("#tc-reports details").count(), 2);
  assert.deepEqual([O.errs, M.errs, S.errs], [[], [], []]);
});

test("the handover covers the four closing points and needs photos or a reason", async () => {
  await resetEmulators();
  const { O, S } = await team(browser, site, people);
  await S.click("[data-tab=tally]"); await S.click(".ptabs [data-pane=send]");
  await S.click('[data-ho-add="low"][data-ho="Gas (CO2)"]'); await S.click('[data-ho-add="low"][data-ho="Garnishes"]');
  assert.equal(await S.$eval("#ho-low", (e) => e.value), "Gas (CO2), Garnishes");
  await S.click('[data-ho-add="next"][data-ho="Prep: "]'); await S.type("#ho-next", "lime juice");
  // No photos and no reason: off to take them, nothing sent.
  S.answer = ""; await S.click("#t-copy");
  await waitToast(S, /^Take the closing photos, then hand over$/);
  assert.equal(await S.evaluate(() => pane), "close");
  assert.equal(await S.evaluate(() => LIVE.reports.length), 0);
  await S.click(".ptabs [data-pane=send]");
  S.answer = "Phone camera broken"; await S.click("#t-copy");
  await waitToast(S, /^Handover saved for the next shift$/);
  const msg = await S.evaluate(() => shareText("shift"));
  assert.match(msg, /📷 No closing photos: Phone camera broken/);
  // What's missing never stops it: it goes at the top of the message, and on the Send page.
  assert.match(msg, /^\*Black Tap Soho · Bar shift · [^*]+\*\n⚠️ Missing: Closed by not picked\n/);
  await S.evaluate(() => openSend("shift"));
  assert.match(await S.innerText(".sendgap"), /Check before it goes\s*Closed by not picked[\s\S]*It still sends as it is/);
  await S.evaluate(() => closeSheet());
  assert.match(msg, /\*A · 1\. Cleaning and closing done \(\d+\)\*\n⬜ Service \(0\/3\)/);
  assert.match(msg, /\*A · 2\. Stock running low\*\nGas \(CO2\), Garnishes/);
  assert.match(msg, /\*A · 3\. Outstanding issues\*\nNone/);
  assert.match(msg, /\*R · 4\. For the opener \(with anything not done above\)\*\nPrep: lime juice/);
  // Laid out as SBAR: Situation, then Background (filled from tonight's record), then Assessment, then Recommendation.
  assert.match(msg, /\*S · Situation\*\n.*Closing checklist: \d+ of \d+ done[\s\S]*\*B · Background\*\n📷 No closing photos[\s\S]*\*A · 1\.[\s\S]*\*R · 4\./);
  await O.waitForFunction(() => LIVE.reports.length === 1);
  const text = await O.evaluate(() => LIVE.reports[0].text);
  assert.match(text, /Note for handover:\nRunning low: Gas \(CO2\), Garnishes\nFor the opener: Prep: lime juice\n\nClosed by: \(not picked\)\nNo closing photos: Phone camera broken$/);
  // The opening team sees it on the Morning page. (A copy dated last night, as only an earlier shift's handover shows.)
  const sam = await S.evaluate(() => LIVE.uid);
  await adminWrite("reports/old", { side: { stringValue: "bar" }, text: { stringValue: text }, summary: { stringValue: "Bar · test" }, photos: { integerValue: "0" },
    uid: { stringValue: sam }, name: { stringValue: "Sam Staff" }, at: { timestampValue: new Date(Date.now() - 30 * 36e5).toISOString() } });
  await O.click("[data-tab=tally]"); await O.click(".ptabs [data-pane=morning]");
  await O.waitForSelector("#handover");
  assert.match(await O.$eval("#handover", (e) => e.innerText), /Last night's handover · Sam Staff[\s\S]*For the opener \(\d+\)[\s\S]*Prep: lime juice[\s\S]*Running low\s*Gas \(CO2\), Garnishes[\s\S]*No closing photos: Phone camera broken/);
  assert.deepEqual([O.errs, S.errs], [[], []]);
});
