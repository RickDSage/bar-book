// Tonight's shift end to end: the 86 board, shared checklists, stock requests, notices, the board and reports.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, toastOf, attempt } from "./helpers.mjs";

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

test("tonight's checklists are shared, and only whoever ticked it or a manager can untick", async () => {
  await resetEmulators();
  const { O, S } = await team(browser, site, people);
  for (const p of [O, S]) { await p.click("[data-tab=tally]"); await p.click(".ptabs [data-pane=close]"); }
  await S.click('[data-list=close][data-i="0"]'); await S.click('[data-list=close][data-i="3"]');
  await O.waitForFunction(() => (LIVE.ticks.close || []).length === 2 && !Object.values(LIVE.tickBy).some((t) => t.pending));
  await O.waitForFunction(() => /Sam Staff · \d\d:\d\d/.test(document.querySelector('[data-list=close][data-i="3"]').innerText));
  await O.click('[data-list=close][data-i="3"]');
  await S.waitForFunction(() => LIVE.ticks.close.length === 1);

  await O.click('[data-list=close][data-i="5"]');
  await S.waitForFunction(() => LIVE.ticks.close.includes(5));
  await S.click('[data-list=close][data-i="5"]');
  assert.equal(await toastOf(S), "Ticked by Olly Owner. Only they or a manager can untick it");
  assert.equal(await attempt(S, () => LIVE.api.tick("close", 5, false)), "permission-denied");
  assert.equal(await attempt(S, () => LIVE.api.tick("hack", 1, true)), "permission-denied");

  // Floor lists sit beside the bar ones. Staff starting a new night only clear their own note.
  await S.click("[data-mode=floor]"); await S.click(".ptabs [data-pane=fset]"); await S.click('[data-list=fset][data-i="1"]');
  await O.waitForFunction(() => (LIVE.ticks.fset || []).length === 1);
  await S.click(".ptabs [data-pane=send]"); await S.click("#t-reset"); await S.click("#t-yes");
  assert.equal(await toastOf(S), "Note cleared");
  await O.waitForTimeout(500);
  assert.equal(await O.evaluate(() => (LIVE.ticks.fset || []).length), 1);
  // A manager starting a new floor night clears the floor ticks for everyone and leaves the bar's alone.
  await O.click("[data-mode=floor]"); await O.click(".ptabs [data-pane=send]"); await O.click("#t-reset"); await O.click("#t-yes");
  await S.waitForFunction(() => !(LIVE.ticks.fset || []).length);
  assert.deepEqual(await S.evaluate(() => LIVE.ticks.close.sort()), [0, 5]);
  assert.deepEqual([O.errs, S.errs], [[], []]);
});

test("stock requests go to managers, who order or turn them down", async () => {
  await resetEmulators();
  const { O, M, S } = await team(browser, site, people);
  await S.click("[data-tab=tally]"); await S.click(".ptabs [data-pane=stock]");
  await S.selectOption("#rq-item", "Blue roll"); await S.fill("#rq-note", "2 rolls"); await S.click("#rq-go");
  await waitToast(S, /^Sent to management$/);
  await S.selectOption("#rq-item", "Other (write it in)"); await S.click("#rq-go");
  assert.equal(await toastOf(S), "Write what's needed in the box");
  await S.fill("#rq-note", "Large black bin liners"); await S.click("#rq-go");
  await S.selectOption("#rq-item", "Limes"); await S.click("#rq-go");
  await O.waitForFunction(() => LIVE.requests.length === 3);
  assert.deepEqual(await O.evaluate(() => LIVE.requests.map((r) => `${r.item}|${r.note}`).reverse()), ["Blue roll|2 rolls", "Large black bin liners|", "Limes|"]);

  assert.equal(await attempt(S, (id) => LIVE.api.markOrdered(id), await S.evaluate(() => LIVE.requests[0].id)), "permission-denied");
  await S.click('[data-rq-del]');
  await O.waitForFunction(() => LIVE.requests.length === 2);
  await O.evaluate(() => show("notices")); await O.click("[data-tpane=requests]");
  await O.click("[data-ordered] >> nth=0");
  await waitToast(S, /^Olly Owner ordered Large black bin liners$/);
  const ordered = await S.evaluate(() => LIVE.requests.find((r) => r.done).id);
  assert.equal(await attempt(S, (id) => LIVE.api.cancelRequest(id), ordered), "permission-denied", "an ordered request stays on record");
  await M.evaluate(() => show("notices")); await M.click("[data-tpane=requests]");
  await M.click("[data-rq-drop]");
  await S.waitForFunction(() => LIVE.requests.length === 1 && LIVE.requests[0].done);
  assert.deepEqual(await O.evaluate(() => LIVE.requests.map((r) => [r.doneBy, r.doneByUid === LIVE.uid])), [["Olly Owner", true]]);
  assert.deepEqual([O.errs, M.errs, S.errs], [[], [], []]);
});

test("notices and the team board: who can post and who can take things down", async () => {
  await resetEmulators();
  const { O, M, S } = await team(browser, site, people);
  await O.evaluate(() => show("notices"));
  await O.click("#pin-form summary"); await O.fill("#p-text", "Guinness line down tonight"); await O.click("#p-go");
  await waitToast(S, /^Broadcast: Guinness line down tonight$/);
  assert.equal(await S.$eval("#bell-n", (e) => (e.hidden ? "0" : e.textContent)), "1");
  assert.equal(await attempt(S, () => LIVE.api.pin("Free drinks")), "permission-denied");

  await M.evaluate(() => show("notices"));
  await M.waitForFunction(() => LIVE.notices.length === 1);
  assert.equal(await M.$("[data-unpin]"), null, "no remove button on the owner's notice");
  const ownerNotice = await M.evaluate(() => LIVE.notices[0].id);
  assert.equal(await attempt(M, (id) => LIVE.api.unpin(id), ownerNotice), "permission-denied");
  await M.evaluate(() => LIVE.api.pin("Tasting at 4"));
  await O.waitForFunction(() => LIVE.notices.length === 2);
  assert.equal(await attempt(O, (id) => LIVE.api.unpin(id), await O.evaluate(() => LIVE.notices.find((x) => x.name === "Mia Manager").id)), "allowed");

  await S.evaluate(() => LIVE.api.post("Limes low"));
  await O.evaluate(() => LIVE.api.post("Team meeting Monday"));
  await M.waitForFunction(() => LIVE.feed.length === 2 && !LIVE.feed.some((x) => x.pending));
  const post = (p, name) => p.evaluate((n) => LIVE.feed.find((x) => x.name === n).id, name);
  assert.equal(await attempt(M, (id) => LIVE.api.removePost(id), await post(M, "Olly Owner")), "permission-denied");
  assert.equal(await attempt(S, (id) => LIVE.api.removePost(id), await post(S, "Olly Owner")), "permission-denied");
  assert.equal(await attempt(M, (id) => LIVE.api.removePost(id), await post(M, "Sam Staff")), "allowed");
  assert.equal(await attempt(S, () => LIVE.api.post("   ")), "permission-denied", "blank posts are refused");
  assert.deepEqual([O.errs, M.errs, S.errs], [[], [], []]);
});

test("shift reports are sent once, signed off once, and show on Tonight", async () => {
  await resetEmulators();
  const { O, M, S } = await team(browser, site, people);
  await S.click("[data-tab=tally]"); await S.click(".ptabs [data-pane=send]");
  await S.fill("#s-who", "Sam Staff"); await S.click("#t-copy");
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
