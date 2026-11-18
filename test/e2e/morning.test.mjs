// The morning and a fresh start: last night's handover read back with today's order and the prep pars, the closing
// clock, Clear everything for anyone, and the owner's master clear.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, adminWrite, part, handOver, pick86, pickRows, pickClose } from "./helpers.mjs";

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
  // 11pm on the night before today's business day, whatever time the test runs.
  const night = await O.evaluate(() => Date.parse(lastNight() + "T23:00:00Z"));
  await adminWrite("reports/old", { side: { stringValue: "bar" }, text: { stringValue: text }, summary: { stringValue: "Bar · test" }, photos: { integerValue: "0" },
    uid: { stringValue: sam }, name: { stringValue: "Sam Staff" }, at: { timestampValue: new Date(night).toISOString() } });
  await O.evaluate(() => setOut("Prosecco bottle", true));
  await shift(O, "morning");
  await O.waitForSelector("#handover");
  const page = await O.$eval("#tally .pane", (e) => e.innerText);
  assert.match(page, /Last night's handover · Angel, Emily[\s\S]*Running low\s*Gas \(CO2\), Limes[\s\S]*Outstanding\s*Tap 3 dripping[\s\S]*For today\s*Prep: lime juice/i);
  assert.match(page, /Left from that shift:\s*Bar storage tidied[\s\S]*No closing photos: Camera broken/);
  assert.match(page, /Today's order\s*Gas \(CO2\), Limes, Prosecco bottle/i);
  assert.match(page, /Prep to par[\s\S]*Lime juice/i);
  assert.equal(await O.locator(".ptabs [data-pane=open]").count(), 0, "no opening checklist");
  assert.equal(await O.locator("#ho-stale").count(), 0);

  const msg = await O.evaluate(() => shareText("morning"));
  assert.match(msg, /^\*Black Tap Soho · Bar morning · .*\*\n✅ Last night's handover checked by Olly Owner\n\n\*Still outstanding\*\nTap 3 dripping\nBar storage tidied\n\n\*For today\*\nPrep: lime juice/);
  assert.match(await O.evaluate(() => shareText("order")), /To order or bring up today:\n\n\*Order \(3\)\*\n• Gas \(CO2\)\n• Limes\n• Prosecco bottle\n\nOpen in Bar Book: \S+#at=morning$/);
  assert.match(await O.evaluate(() => shareText("pars")), /\*Prep to par \(\d+\)\*\n⬜ Lime juice: /);
  // Mark as read: nothing goes on WhatsApp, and the managers see who read it and when.
  await O.click("[data-ho-read]");
  await O.waitForSelector("#tally .pill.ok");
  await O.waitForFunction(() => LIVE.sent.some((x) => x.k === "read" && !x.pending));
  await O.evaluate(() => show("notices"));
  assert.match(await O.$eval(".glance", (e) => e.textContent), /Bar[\s\S]*Last night's handover read · Olly Owner \d\d:\d\d[\s\S]*Floor/);
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

test("anyone clears everything for a fresh start and can undo it; the owner's master clear keeps issues and marks the inbox done", async () => {
  await resetEmulators();
  const { O, S, F } = await team(browser, site, [["S", "Sam Staff"], ["F", "Pema"]]);
  await F.evaluate(() => setMode("floor"));
  await shift(S, "close"); await shift(F, "fclose");
  await S.click('[data-list=close][data-i="0"]'); await F.click('[data-list=fclose][data-i="0"]');
  await S.evaluate(() => setOut("Limes", true));
  await S.click(".ptabs [data-pane=send]"); await S.fill("#ho-low", "Ice");
  await O.waitForFunction(() => LIVE.tasks["close-0"]?.status === "done" && LIVE.tasks["fclose-0"]?.status === "done" && LIVE.out.has("Limes"));
  await S.waitForFunction(() => LIVE.drafts.some((d) => d.side === "bar" && d.low === "Ice" && !d.pending));
  assert.equal(await S.locator("#master-clear").count(), 0);
  assert.equal(await S.locator("#undo-clear").count(), 0);

  S.answer = "yes"; await S.click("#clear-all");
  await waitToast(S, /^All clear\. Undo clear is there if that was a mistake$/);
  await O.waitForFunction(() => ["close-0", "fclose-0"].every((k) => LIVE.tasks[k].status === "todo") && !LIVE.out.size && !LIVE.drafts.length);
  assert.equal(await S.evaluate(() => ho.low), "");
  assert.equal(await S.$eval("#ho-low", (e) => e.value), "");

  // A mis-tap: Undo clear puts the ticks, the 86 and the handover back on every phone.
  await S.click("#undo-clear");
  await waitToast(S, /^Put back as it was$/);
  await O.waitForFunction(() => ["close-0", "fclose-0"].every((k) => LIVE.tasks[k].status === "done") && LIVE.out.has("Limes")
    && LIVE.drafts.some((d) => d.side === "bar" && d.low === "Ice"));
  assert.equal(await S.evaluate(() => ho.low), "Ice");
  assert.equal(await S.locator("#undo-clear").count(), 0);

  // The owner's master clear: the open issue stays for the next shift, and the inbox is marked done, not deleted.
  await S.evaluate(() => Promise.all([LIVE.api.raise({ title: "Tap 3 dripping", detail: "", area: "bar", urgent: false }),
    LIVE.api.ask({ kind: "fix", text: "Stool wobbles", when: "", anon: false })]));
  await O.waitForFunction(() => LIVE.issues.length === 1 && LIVE.asks.length === 1);
  await part(O, "mgr");
  O.answer = "yes"; await O.click("#master-clear");
  await waitToast(O, /^Master clear done\. Undo clear is on Shift$/);
  await O.waitForFunction(() => !LIVE.out.size && LIVE.asks.length === 1 && LIVE.asks[0].status === "done" && !LIVE.asks[0].pending);
  assert.equal(await O.evaluate(() => LIVE.issues.length), 1);
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

test("drafts: what's typed survives closing the app, Save draft puts it away, Discard wipes it and Clear everything leaves it", async () => {
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
  await waitToast(S, /^Unfinished draft: App feedback$/);
  await part(S, "tell");
  assert.equal(await S.$eval('[data-tell="text"]', (e) => e.value), "Add the house spritz");
  await S.click('[data-draft-drop="tell"]');
  await waitToast(S, /^Draft discarded$/);
  assert.equal(await S.$eval('[data-tell="text"]', (e) => e.value), "");
  assert.equal(await S.evaluate(() => JSON.parse(localStorage.getItem("btbar.draft.tell")).text), "");
  // Clear everything is for the team's lists: someone's half-written request or incident stays on their phone.
  await part(S, "ask");
  await S.fill('[data-ask="text"]', "Can I swap Saturday");
  S.answer = "yes"; await S.evaluate(() => { show("tally"); }); await S.click("#clear-all");
  await waitToast(S, /^All clear\. Undo clear is there if that was a mistake$/);
  assert.equal(await S.evaluate(() => askF.text), "Can I swap Saturday");
  assert.deepEqual([O.errs, S.errs], [[], []]);
});

test("with no signal, Clear everything on a finished list shows straight away and reaches every phone once the signal is back", async () => {
  await resetEmulators();
  const { O, S } = await team(browser, site, [["S", "Sam Staff"]]);
  await S.evaluate(() => setMode("floor")); await shift(S, "fclose");
  const ids = await S.evaluate(() => shown("fclose").map(([i]) => i));
  await S.evaluate((xs) => Promise.all(xs.map((i) => LIVE.api.setTask("fclose", i, itemText("fclose", i), "done"))), ids);
  await S.waitForFunction((xs) => xs.every((i) => LIVE.tasks[`fclose-${i}`]?.status === "done" && !LIVE.tasks[`fclose-${i}`].pending), ids);
  await S.evaluate((n) => LIVE.api.setRun("fclose", "Floor close", "finished", n, n), ids.length);
  await O.waitForFunction(() => LIVE.runs.fclose?.status === "finished" && !LIVE.runs.fclose.pending);

  await S.context().setOffline(true);
  await S.waitForFunction(() => !navigator.onLine);
  S.answer = "yes"; await S.click("#clear-all");
  // Before, the items waited for the reopen to reach the server, so with no signal nothing changed on the phone.
  await S.waitForFunction((xs) => LIVE.runs.fclose.status === "started" && xs.every((i) => LIVE.tasks[`fclose-${i}`].status === "todo"), ids);
  await S.context().setOffline(false);
  await O.waitForFunction((xs) => LIVE.runs.fclose.status === "started" && !LIVE.runs.fclose.pending
    && xs.every((i) => LIVE.tasks[`fclose-${i}`].status === "todo" && !LIVE.tasks[`fclose-${i}`].pending), ids);
  assert.deepEqual([O.errs, S.errs], [[], []]);
});

test("the morning never passes an older handover off as last night's, and the closer sees one still waiting for signal", async () => {
  await resetEmulators();
  const { O, S } = await team(browser, site, [["S", "Sam Staff"]]);
  const sam = await S.evaluate(() => LIVE.uid);
  // The last one that reached the server is from two nights ago: last night's is still on the closer's phone.
  const old = await O.evaluate(() => Date.parse(lastNight() + "T23:00:00Z") - 864e5);
  await adminWrite("reports/older", { side: { stringValue: "bar" }, text: { stringValue: "Bar shift\n\nNote for handover:\nRunning low: Ice\n\nClosed by: Sam Staff" },
    summary: { stringValue: "Bar · test" }, photos: { integerValue: "0" }, uid: { stringValue: sam }, name: { stringValue: "Sam Staff" }, at: { timestampValue: new Date(old).toISOString() } });
  await shift(O, "morning");
  await O.waitForSelector("#ho-stale");
  assert.match(await O.$eval("#ho-stale", (e) => e.innerText), /^Last night's handover hasn't arrived\. .* This one is from \w{3} \d+ \w{3}\.$/);
  assert.match(await O.$eval("#handover .meta", (e) => e.innerText), /^Latest handover · /);

  // The closer hands over with no signal: the Send page says it hasn't gone, then that it has.
  await shift(S, "send");
  await S.context().setOffline(true);
  await S.waitForFunction(() => !navigator.onLine);
  await handOver(S);
  await S.waitForSelector("#ho-wait");
  await S.context().setOffline(false);
  await S.waitForSelector("#ho-sent", { timeout: 20000 });
  assert.match(await S.$eval("#ho-sent", (e) => e.innerText), /^✅ Handover saved \d\d:\d\d by Sam Staff\. The morning team and every manager can open it\.$/);
  assert.deepEqual([O.errs, S.errs], [[], []]);
});

test("the bar station shows tonight's 86s and both closes live, and a tap opens the real page", async () => {
  await resetEmulators();
  const { O, S } = await team(browser, site, [["S", "Sam Staff"]]);
  await S.evaluate(() => show("station"));
  // On a phone Tonight is one line: a tap opens its boxes.
  await S.click("#sx-tsum");
  await O.evaluate(() => LIVE.api.set86("Corona", true));
  await S.waitForFunction(() => /Corona/.test($("#v-station .st-86").innerText));
  // An 86'd drink is greyed in the station's list as soon as it's 86'd on another phone.
  await O.evaluate(() => LIVE.api.set86("Mojito", true));
  await S.waitForFunction(() => [...$$("#sx-list .sx-row.out")].some((r) => /^Mojito/.test(r.innerText)));
  // Any ingredient typed on the station goes on the board under the stock list's name, and the spec shows the swap.
  await pick86(S, "lime juice", "Lime juice", "#sx-86q");
  await O.waitForFunction(() => LIVE.out.has("Lime juice"));
  // Several at once: tick them, then one 86 for all. Anything not on the list goes on as typed.
  await pickRows(S, "red bull", "#sx-86q"); await S.click('#pk-list [data-pk-tog="Red Bull"]'); await S.click('#pk-list [data-pk-tog="Red Bull Sugarfree"]');
  await S.click("[data-pk-go=out]");
  await O.waitForFunction(() => LIVE.out.has("Red Bull") && LIVE.out.has("Red Bull Sugarfree"));
  await S.fill("#pk-q", "Veggie burger"); await S.click("[data-pk-typed]"); await pickClose(S);
  await O.waitForFunction(() => LIVE.out.has("Veggie burger"));
  await S.waitForFunction(() => /Veggie burger/.test($("#v-station .st-86").innerText));
  await S.click('[data-sx-back="Veggie burger"]');
  await O.waitForFunction(() => !LIVE.out.has("Veggie burger"));
  // The photos card takes a photo for tonight's handover.
  assert.equal(await S.locator('#v-station label[for="ph-in"]').count(), 1);
  assert.match(await S.$eval("#v-station", (e) => e.innerText), /BAR CLOSING\s*0\/\d+[\s\S]*FLOOR CLOSING\s*0\/\d+/i);
  await O.evaluate(() => { setMode("bar"); pane = "close"; show("tally"); });
  await O.click("[data-list=close][data-i=\"0\"]");
  await S.waitForFunction(() => /BAR CLOSING\s*1\//i.test($("#v-station").innerText));
  await S.click('[data-st-side="floor"]');
  assert.equal(await S.evaluate(() => [cur, mode, pane].join()), "tally,floor,fclose");
  assert.deepEqual([O.errs, S.errs], [[], []]);
});
