// The kitchen's side of the Shift tab, and managers changing the lists in the app: every phone gets the new version,
// tonight's ticks stay with their item, every version is kept in the history and can be put back, two managers at once
// can't overwrite each other without knowing, and the closing manager is picked from the team's logins.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, phone, team, toastOf, attempt } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });
const people = [["M", "Mia Manager", "mia", "manager"], ["S", "Sam Staff", "sam", "staff"]];

const flat = (s) => s.replace(/\s+/g, " ").trim();
const row = (p, k, i) => p.$eval(`[data-list=${k}][data-i="${i}"]`, (e) => e.innerText.replace(/\s+/g, " ").trim());
const waitToast = (p, re) => p.waitForFunction((s) => new RegExp(s).test(document.querySelector("#toast").textContent), re.source);
const kitchen = async (p, pane) => { await p.click("[data-tab=tally]"); await p.click("[data-mode=kitchen]"); await p.click(`.ptabs [data-pane=${pane}]`); };
const saved = (p, k, v) => p.waitForFunction(([k, v]) => LIVE.lists[k]?.v === v && !LIVE.lists[k].pending, [k, v]);
const tally = (p) => p.$eval("#tally", (e) => e.innerText);

test("the welcome screen's Kitchen button opens the kitchen's shift", async () => {
  const p = await phone(browser, site, { start: "#w-kitchen" });
  assert.equal(await p.evaluate(() => mode), "kitchen");
  assert.equal(await p.isVisible("#v-tally"), true);
  assert.equal(await p.$eval("#shift-title", (e) => e.textContent), "Kitchen shift");
  assert.deepEqual(p.errs, []);
  await p.context().close();
});

test("the kitchen has its own opening and closing lists, restocking, report and place on Live and Nights", async () => {
  await resetEmulators();
  const { O, M, S } = await team(browser, site, people);
  await kitchen(S, "kopen");
  assert.equal(await S.$eval("#shift-title", (e) => e.textContent), "Kitchen shift");
  assert.deepEqual(await S.$$eval(".ptabs [data-pane]", (x) => x.map((b) => b.firstChild.textContent)), ["Open", "Stock", "Close", "Send"]);
  assert.equal(await S.locator("[data-list=kopen]").count(), 14);
  assert.match(await row(S, "kopen", 0), /^Fridges and freezers working, temperatures logged in Alert65/);

  // A tick is a task like any other, on the kitchen's side.
  await S.click('[data-list=kopen][data-i="0"]');
  await M.waitForFunction(() => LIVE.tasks["kopen-0"]?.status === "done" && LIVE.runs.kopen?.status === "started" && LIVE.events.some((e) => e.list === "kopen" && e.to === "done"));
  assert.equal(await M.evaluate(() => LIVE.events.find((e) => e.list === "kopen" && e.to === "done").area), "kitchen");
  await M.evaluate(() => show("notices")); await M.click("[data-tpane=managers]"); await M.click("#msub [data-msub=live]");
  const live = flat(await M.$eval("#live", (e) => e.innerText));
  assert.match(live, /Kitchen opening In progress Kitchen 1 of 14 done · Started by Sam Staff/);
  assert.match(live, /Kitchen closing Not started Kitchen 0 of 15 done/);

  // Restocking from a kitchen phone goes to the kitchen unless they pick somewhere else.
  await S.click(".ptabs [data-pane=stock]");
  assert.equal(await S.getAttribute('[data-rs-dest="kitchen"]', "aria-pressed"), "true");
  await S.selectOption("#rs-item", "Fryer oil");
  await S.click("#rs-go");
  await M.waitForFunction(() => LIVE.restock[0]?.dest === "kitchen" && !LIVE.restock[0].pending);
  assert.equal(await M.evaluate(() => LIVE.events.find((e) => e.kind === "restock").area), "kitchen");

  // The closing manager is one of the team's managers or the owner, never someone on staff.
  await S.click(".ptabs [data-pane=send]");
  await S.waitForSelector('[data-closer="Mia Manager"]');
  assert.deepEqual((await S.$$eval("[data-closer]", (x) => x.map((b) => b.dataset.closer))).sort(), ["Mia Manager", "Olly Owner"]);
  await S.click('[data-closer="Mia Manager"]');
  assert.match(await S.$eval("#t-text", (e) => e.value), /^Black Tap Soho kitchen shift, [\s\S]*Closing manager: Mia Manager\n\nKitchen opening: 1 of 14 done[\s\S]*Kitchen closing: 0 of 15 done/);
  await S.click("#t-copy");
  await O.waitForFunction(() => LIVE.reports[0]?.side === "kitchen" && !LIVE.reports[0].pending);
  assert.match(await O.evaluate(() => LIVE.reports[0].summary), /^Kitchen · Opening 1\/14 · Closing 0\/15 · 0 86'd · Closing manager Mia Manager$/);
  await M.click("#msub [data-msub=nights]");
  await M.waitForFunction(() => /Kitchen · Sam Staff/.test(document.querySelector("#mgrs").innerText));
  assert.match(flat(await M.$eval("#mgrs", (e) => e.innerText)), /Kitchen · Sam Staff Waiting Opening 1\/14 · Closing 0\/15/);

  // A broadcast for the kitchen shows on a kitchen phone and not on a bar one.
  await M.evaluate(() => LIVE.api.pin("Chef's tasting at 4", "kitchen", true));
  await S.waitForSelector("#bcast .bcast");
  await O.waitForFunction(() => LIVE.notices.length === 1);
  await O.evaluate(() => setMode("bar"));
  assert.equal(await O.evaluate(() => LIVE.notices.filter(forSide).length), 0);
  assert.deepEqual([O.errs, M.errs, S.errs], [[], [], []]);
});

test("a manager changes a list: every phone gets it, ticks stay with their item, and every version is kept and can be put back", async () => {
  await resetEmulators();
  const { O, M, S } = await team(browser, site, people);
  await kitchen(S, "kclose"); await kitchen(M, "kclose");
  // Staff don't get the button, and the rules refuse them anyway.
  assert.equal(await S.locator("[data-le-open]").count(), 0);
  assert.equal(await attempt(S, (k) => LIVE.api.saveList(k, [{ id: 0, t: "Anything" }], 15), "kclose"), "permission-denied");
  await S.waitForFunction(() => !LIVE.lists.kclose);

  await S.click('[data-list=kclose][data-i="2"]');
  await M.waitForFunction(() => LIVE.tasks["kclose-2"]?.status === "done" && !LIVE.tasks["kclose-2"].pending);
  const tonight = await S.evaluate(() => new Date(shiftDay()).getUTCDay()), other = (tonight + 1) % 7, dayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][other];

  await M.click("[data-le-open=kclose]");
  assert.equal(await M.locator("[data-le-t]").count(), 15);
  await M.fill('[data-le-t="2"]', "Grill and flat-top scraped, cleaned, oiled and off");
  await M.click("[data-le-add]");
  assert.equal(await M.evaluate(() => document.activeElement.dataset.leT), "15", "the new item's box is ready to type in");
  await M.keyboard.type("Walk-in door shut and alarm set");
  // A teammate's change while the manager is typing doesn't lose it.
  await S.click('[data-list=kclose][data-i="3"]');
  await M.waitForFunction(() => LIVE.tasks["kclose-3"]?.status === "done");
  await M.evaluate(() => renderTally());
  assert.equal(await M.inputValue('[data-le-t="15"]'), "Walk-in door shut and alarm set");
  await M.click('[data-le-more="0"]'); await M.click('[data-le-del="0"]');
  await M.click('[data-le-more="14"]'); await M.click('[data-le-move="14"][data-by="-1"]');
  await M.click('[data-le-more="3"]');
  await M.click(`[data-le-day="3"][data-d="${other}"]`);
  assert.equal(await M.$$eval(".le > .s", (x) => x[3].textContent), `Only on ${dayName}`);
  await M.click(`[data-le-day="3"][data-d="${other}"]`);
  assert.equal(await toastOf(M), "Pick at least one day, or Every day");
  // An empty item is left out when it's saved.
  await M.click("[data-le-add]");
  await M.click("[data-le-save]");
  await waitToast(M, /^Kitchen closing saved\. Every phone has it now$/);

  // Every phone has the new list. The reworded item keeps tonight's tick; the item taken off goes; the new one gets a
  // new id; the one for another day doesn't show tonight.
  await saved(S, "kclose", 1);
  assert.match(await row(S, "kclose", 2), /^✓ Grill and flat-top scraped, cleaned, oiled and off Done By Sam Staff/);
  assert.equal(await S.locator('[data-list=kclose][data-i="0"]').count(), 0);
  assert.equal(await S.locator('[data-list=kclose][data-i="4"]').count(), 0, "only on another day");
  assert.match(await row(S, "kclose", 15), /^Walk-in door shut and alarm set$/);
  const ids = await S.$$eval("[data-list=kclose]", (x) => x.map((b) => +b.dataset.i));
  assert.deepEqual(ids, [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 14]);
  assert.match(flat(await tally(S)), /List changed by Mia Manager, /);
  assert.match(flat(await tally(S)), /2 of 14 done/);

  // History: what changed, who and when, and the standard list underneath.
  await M.click("[data-lh=kclose]");
  await M.waitForSelector("[data-lh-back='0']");
  const hist = flat(await tally(M));
  assert.match(hist, /Version 1 Now Mia Manager, \w{3},? \d+ \w{3} \d{4}, \d\d:\d\d/);
  assert.match(hist, /Added: Walk-in door shut and alarm set/);
  assert.match(hist, /Taken off: All food covered, labelled, dated and in the fridge or freezer/);
  assert.match(hist, /Reworded: Grill and flat-top scraped, cleaned and off → Grill and flat-top scraped, cleaned, oiled and off/);
  assert.match(hist, new RegExp(`Days changed: Prep surfaces, boards, utensils and equipment cleaned and sanitised \\(only on ${dayName}\\)`));
  assert.doesNotMatch(hist, /Order changed/, "moving a new item doesn't change the order of the others");
  assert.match(hist, /The standard list 15 items, as Bar Book started Put the standard list back/);

  // Putting the standard list back is a new version. Tonight's tick is still on its item.
  await M.click("[data-lh-back='0']");
  await waitToast(M, /^The standard list is back$/);
  await saved(S, "kclose", 2);
  assert.match(await row(S, "kclose", 2), /^✓ Grill and flat-top scraped, cleaned and off Done By Sam Staff/);
  assert.equal(await S.locator("[data-list=kclose]").count(), 15);
  await M.waitForFunction(() => /Version 2 Now/.test(document.querySelector("#tally").innerText));
  assert.match(flat(await tally(M)), /The standard list Now/);

  // And version 1 can come back too.
  await M.click("[data-lh-back='1']");
  await waitToast(M, /^Version 1 is back$/);
  await saved(S, "kclose", 3);
  assert.match(await row(S, "kclose", 15), /^Walk-in door shut and alarm set$/);
  assert.equal(await O.evaluate(async () => (await LIVE.api.listHistory("kclose")).map((x) => x.v).join()), "3,2,1");
  assert.deepEqual([O.errs, M.errs, S.errs], [[], [], []]);
});

test("two managers changing the same list: the second is told before saving over it, and a refused save keeps the changes", async () => {
  await resetEmulators();
  const { O, M } = await team(browser, site, people);
  for (const p of [O, M]) { await p.click("[data-tab=tally]"); await p.click(".ptabs [data-pane=close]"); await p.click("[data-le-open=close]"); }
  await O.fill('[data-le-t="0"]', "Last orders called at 10.45, then stop serving");
  await O.click("[data-le-save]");
  await saved(M, "close", 1);
  const asked = [];
  M.on("dialog", (d) => asked.push(d.message()));
  await M.fill('[data-le-t="1"]', "Upstairs floor: host station restocked and wiped");
  await M.click("[data-le-save]");
  await saved(O, "close", 2);
  assert.match(asked[0], /^Olly Owner changed this list while you were changing it\. Save yours over theirs\? Theirs stays in the history\.$/);
  assert.equal(await O.evaluate(() => itemText("close", 1)), "Upstairs floor: host station restocked and wiped");
  assert.equal(await O.evaluate(() => itemText("close", 0)), "Last orders called on time, then stop serving", "Mia saved her whole list over the owner's");

  // Refused (here, by a stand-in for the rules): the editor comes back with the changes in it.
  await M.click("[data-le-open=close]");
  await M.fill('[data-le-t="2"]', "Milkshake bar closed and wiped");
  await M.evaluate(() => { LIVE.api.saveList = () => Promise.reject(Object.assign(new Error("refused"), { code: "permission-denied" })); });
  await M.click("[data-le-save]");
  await waitToast(M, /^Not saved\. Your changes are still there$/);
  assert.equal(await M.inputValue('[data-le-t="2"]'), "Milkshake bar closed and wiped");

  // Nothing changed means nothing is saved.
  await O.click("[data-le-open=close]");
  await O.click("[data-le-save]");
  assert.equal(await toastOf(O), "Nothing changed");
  assert.equal(await O.evaluate(() => LIVE.lists.close.v), 2);
  assert.deepEqual([O.errs, M.errs], [[], []]);
});

test("changing a list fits a small phone", async () => {
  await resetEmulators();
  const { O } = await team(browser, site, []);
  await O.setViewportSize({ width: 320, height: 640 });
  await kitchen(O, "kclose");
  await O.click("[data-le-open=kclose]");
  await O.click('[data-le-more="0"]');
  assert.ok(await O.evaluate(() => document.documentElement.scrollWidth <= 320), "no sideways scrolling");
  const box = await O.$eval('[data-le-t="0"]', (e) => { const r = e.getBoundingClientRect(); return [r.left, r.right, parseFloat(getComputedStyle(e).fontSize)]; });
  assert.ok(box[0] >= 0 && box[1] <= 320, "the item's box is on screen");
  assert.ok(box[2] >= 16, "16px or more, so an iPhone doesn't zoom in");
  assert.deepEqual(O.errs, []);
});
