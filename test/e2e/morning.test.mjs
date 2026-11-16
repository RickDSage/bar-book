// The morning and a fresh start: last night's handover read back with today's order and the prep pars, the closing
// clock, Clear everything for anyone, and the owner's master clear.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, adminWrite, part, handOver } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });
const waitToast = (p, re) => p.waitForFunction((s) => new RegExp(s).test(document.querySelector("#toast").textContent), re.source);
const shift = async (p, pane) => { await p.click("[data-tab=tally]"); await p.click(`.ptabs [data-pane=${pane}]`); };

test("the morning reads last night's handover back, with today's order and the prep pars", async () => {
  await resetEmulators();
  const { O, S } = await team(browser, site, [["S", "Sam Staff"]]);
  // Last night's handover, dated the night before (the morning only shows an earlier shift's).
  const sam = await S.evaluate(() => LIVE.uid);
  const text = "Black Tap Soho bar shift, Sun 15 Nov 2026, 01:10\nRun by: Sam Staff\n\nClosing checklist: 37 of 38 done\nNot done:\n- Bar storage tidied\n\n86'd: nothing\n\nNote for handover:\nRunning low: Gas (CO2), Limes\nOutstanding: Tap 3 dripping\nFor tomorrow: Prep: lime juice\n\nClosed by: Angel, Emily\nNo closing photos: Camera broken";
  await adminWrite("reports/old", { side: { stringValue: "bar" }, text: { stringValue: text }, summary: { stringValue: "Bar · test" }, photos: { integerValue: "0" },
    uid: { stringValue: sam }, name: { stringValue: "Sam Staff" }, at: { timestampValue: new Date(Date.now() - 30 * 36e5).toISOString() } });
  await O.evaluate(() => setOut("Prosecco bottle", true));
  await shift(O, "morning");
  await O.waitForSelector("#handover");
  const page = await O.$eval("#tally .pane", (e) => e.innerText);
  assert.match(page, /Last night's handover · Angel, Emily[\s\S]*Running low\s*Gas \(CO2\), Limes[\s\S]*Outstanding\s*Tap 3 dripping[\s\S]*For today\s*Prep: lime juice/i);
  assert.match(page, /Left from that shift:\s*Bar storage tidied[\s\S]*No closing photos: Camera broken/);
  assert.match(page, /Today's order\s*Gas \(CO2\), Limes, Prosecco bottle/i);
  assert.match(page, /Prep to par[\s\S]*Lime juice/i);
  assert.equal(await O.locator(".ptabs [data-pane=open]").count(), 0, "no opening checklist");

  const msg = await O.evaluate(() => shareText("morning"));
  assert.match(msg, /^\*Black Tap Soho · Bar morning · .*\*\n✅ Last night's handover checked by Olly Owner\n\n\*Still outstanding\*\nTap 3 dripping\nBar storage tidied\n\n\*For today\*\nPrep: lime juice/);
  assert.match(await O.evaluate(() => shareText("order")), /To order or bring up today:\n\n\*Order \(3\)\*\n• Gas \(CO2\)\n• Limes\n• Prosecco bottle\n\nOpen in Bar Book: \S+#at=morning$/);
  assert.match(await O.evaluate(() => shareText("pars")), /\*Prep to par \(\d+\)\*\n⬜ Lime juice: /);
  assert.deepEqual([O.errs, S.errs], [[], []]);
});

test("the close shows when it started, how long it's taking and who has ticked what", async () => {
  await resetEmulators();
  const { O, S } = await team(browser, site, [["S", "Sam Staff"]]);
  await shift(S, "close");
  for (const i of [0, 1]) await S.click(`[data-list=close][data-i="${i}"]`);
  await S.waitForFunction(() => ["close-0", "close-1"].every((k) => LIVE.tasks[k]?.status === "done" && !LIVE.tasks[k].pending));
  await S.evaluate(() => renderTally());
  const top = await S.$eval("#tally .pane", (e) => e.innerText);
  assert.match(top, /Started\s*\d\d:\d\d\s*So far\s*\d+ min\s*Left\s*37/i);
  assert.match(top, /Still to do: Service 1 · /);
  assert.match(top, /Ticked: Sam Staff 2/);
  assert.match(await S.evaluate(() => shareText("shift")), /⏱ Closing started \d\d:\d\d, so far \d+ min/);
  assert.deepEqual([O.errs, S.errs], [[], []]);
});

test("anyone clears everything for a fresh start; the owner's master clear also empties restocks, the inbox and issues", async () => {
  await resetEmulators();
  const { O, S, F } = await team(browser, site, [["S", "Sam Staff"], ["F", "Pema"]]);
  await F.evaluate(() => setMode("floor"));
  await shift(S, "close"); await shift(F, "fclose");
  await S.click('[data-list=close][data-i="0"]'); await F.click('[data-list=fclose][data-i="0"]');
  await S.evaluate(() => setOut("Limes", true));
  await S.click(".ptabs [data-pane=send]"); await S.fill("#ho-low", "Ice");
  await O.waitForFunction(() => LIVE.tasks["close-0"]?.status === "done" && LIVE.tasks["fclose-0"]?.status === "done" && LIVE.out.has("Limes"));
  assert.equal(await S.locator("#master-clear").count(), 0);

  S.answer = "yes"; await S.click("#clear-all");
  await waitToast(S, /^All clear for a fresh start$/);
  await O.waitForFunction(() => ["close-0", "fclose-0"].every((k) => LIVE.tasks[k].status === "todo") && !LIVE.out.size);
  assert.equal(await S.evaluate(() => ho.low), "");
  assert.equal(await S.$eval("#ho-low", (e) => e.value), "");

  // The owner's master clear: an issue and something for the inbox both go.
  await S.evaluate(() => Promise.all([LIVE.api.raise({ title: "Tap 3 dripping", detail: "", area: "bar", urgent: false }),
    LIVE.api.ask({ kind: "fix", text: "Stool wobbles", when: "", anon: false })]));
  await O.waitForFunction(() => LIVE.issues.length === 1 && LIVE.asks.length === 1);
  await part(O, "mgr");
  O.answer = "yes"; await O.click("#master-clear");
  await waitToast(O, /^Master clear done$/);
  await O.waitForFunction(() => !LIVE.issues.length && !LIVE.asks.length);
  assert.deepEqual([O.errs, S.errs, F.errs], [[], [], []]);
});

test("Only what's left: a ticked item gets out of the way and one tap undoes it", async () => {
  await resetEmulators();
  const { O, S } = await team(browser, site, [["S", "Sam Staff"]]);
  await S.evaluate(() => { leftOnly = true; });
  await S.click("[data-tab=tally]"); await S.click(".ptabs [data-pane=close]");
  const first = await S.$eval("[data-list=close]", (e) => e.dataset.i);
  await S.click(`[data-list=close][data-i="${first}"]`);
  await S.waitForFunction((i) => LIVE.tasks[`close-${i}`]?.status === "done" && !document.querySelector(`[data-list=close][data-i="${i}"]`), first);
  assert.match(await S.$eval(".undo", (e) => e.textContent), /^↩ Undo Last orders called on time, then stop serving$/);
  await S.click(".undo");
  await S.waitForFunction((i) => LIVE.tasks[`close-${i}`]?.status === "todo" && !!document.querySelector(`[data-list=close][data-i="${i}"]`), first);
  // Off, ticked items stay in the list.
  await S.click("[data-left-only]");
  await S.click(`[data-list=close][data-i="${first}"]`);
  await S.waitForFunction((i) => LIVE.tasks[`close-${i}`]?.status === "done", first);
  assert.equal(await S.locator(`[data-list=close][data-i="${first}"]`).count(), 1);
  assert.deepEqual([O.errs, S.errs], [[], []]);
});

test("drafts: what's typed survives closing the app, Save draft puts it away, Discard and Clear everything wipe it", async () => {
  await resetEmulators();
  const { O, S } = await team(browser, site, [["S", "Sam Staff"]]);
  await part(S, "tell");
  await S.fill('[data-tell="text"]', "Add the house spritz");
  await S.click('[data-draft-save="tell"]');
  await waitToast(S, /^Draft saved\. It's here when you come back$/);
  assert.equal(await S.$eval('[data-card="tell"]', (d) => d.open), false);
  assert.match(await S.$eval('[data-card="tell"] summary', (e) => e.textContent), /Draft$/);
  // Closing and opening the app: the draft is still there, and the app says so.
  await S.reload();
  if (await S.locator("#w-ok").isVisible()) await S.click("#w-ok");
  await S.waitForFunction(() => LIVE.ready && LIVE.me);
  await waitToast(S, /^Unfinished draft: Tell Olly$/);
  await part(S, "tell");
  assert.equal(await S.$eval('[data-tell="text"]', (e) => e.value), "Add the house spritz");
  await S.click('[data-draft-drop="tell"]');
  await waitToast(S, /^Draft discarded$/);
  assert.equal(await S.$eval('[data-tell="text"]', (e) => e.value), "");
  assert.equal(await S.evaluate(() => JSON.parse(localStorage.getItem("btbar.draft.tell")).text), "");
  // Clear everything takes this phone's drafts too.
  await part(S, "ask");
  await S.fill('[data-ask="text"]', "Can I swap Saturday");
  S.answer = "yes"; await S.evaluate(() => { show("tally"); }); await S.click("#clear-all");
  await waitToast(S, /^All clear for a fresh start$/);
  assert.equal(await S.evaluate(() => askF.text), "");
  assert.deepEqual([O.errs, S.errs], [[], []]);
});
