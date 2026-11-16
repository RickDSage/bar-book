// The manager changing the lists in the app: every phone gets the new version, tonight's ticks stay with their item,
// every version is kept in the history and can be put back, and two people at once can't overwrite each other without
// knowing.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, phone, team, toastOf, attempt, part, handOver } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });
const people = [["M", "Mia Manager", "mia", "manager"], ["S", "Sam Staff"]];

const flat = (s) => s.replace(/\s+/g, " ").trim();
const row = (p, k, i) => p.$eval(`[data-list=${k}][data-i="${i}"]`, (e) => e.innerText.replace(/\s+/g, " ").trim());
const waitToast = (p, re) => p.waitForFunction((s) => new RegExp(s).test(document.querySelector("#toast").textContent), re.source);
const saved = (p, k, v) => p.waitForFunction(([k, v]) => LIVE.lists[k]?.v === v && !LIVE.lists[k].pending, [k, v]);
const tally = (p) => p.$eval("#tally", (e) => e.innerText);

test("the manager changes a list: every phone gets it, ticks stay with their item, and every version is kept and can be put back", async () => {
  await resetEmulators();
  const { M, S } = await team(browser, site, people);
  for (const p of [S, M]) { await p.click("[data-tab=tally]"); await p.click(".ptabs [data-pane=close]"); }
  // Staff don't get the button, and the rules refuse them anyway.
  assert.equal(await S.locator("[data-le-open]").count(), 0);
  assert.equal(await attempt(S, (k) => LIVE.api.saveList(k, [{ id: 0, t: "Anything" }], 99), "close"), "permission-denied");

  await S.click('[data-list=close][data-i="2"]');
  await M.waitForFunction(() => LIVE.tasks["close-2"]?.status === "done" && !LIVE.tasks["close-2"].pending);
  const n = await M.evaluate(() => LISTS.close.items.length);
  await M.click("[data-le-open=close]");
  assert.equal(await M.locator("[data-le-t]").count(), n);
  await M.fill('[data-le-t="2"]', "Reworded by the manager");
  await M.click("[data-le-add]");
  await M.keyboard.type("A brand new item");
  await M.click("[data-le-save]");
  await waitToast(M, /saved\. Every phone has it now$/);

  // Every phone has it; the reworded item keeps tonight's tick.
  await saved(S, "close", 1);
  const two = await S.evaluate(() => LISTS.close.items[2].id);
  assert.match(await row(S, "close", two), /Reworded by the manager/);
  assert.match(await row(S, "close", two), /Done/);
  assert.equal(await S.evaluate(() => LISTS.close.items.at(-1).t), "A brand new item");

  // History: what changed, then the standard list can be put back as a new version.
  await M.click("[data-lh=close]");
  await M.waitForSelector("[data-lh-back='0']");
  assert.match(flat(await tally(M)), /Added: A brand new item/);
  await M.click("[data-lh-back='0']");
  await saved(S, "close", 2);
  assert.equal(await S.evaluate(() => LISTS.close.items.length), n);
  assert.deepEqual([M.errs, S.errs], [[], []]);
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
  await O.click("[data-tab=tally]"); await O.click(".ptabs [data-pane=close]");
  await O.click("[data-le-open=close]");
  await O.click('[data-le-more="0"]');
  assert.ok(await O.evaluate(() => document.documentElement.scrollWidth <= 320), "no sideways scrolling");
  const box = await O.$eval('[data-le-t="0"]', (e) => { const r = e.getBoundingClientRect(); return [r.left, r.right, parseFloat(getComputedStyle(e).fontSize)]; });
  assert.ok(box[0] >= 0 && box[1] <= 320, "the item's box is on screen");
  assert.ok(box[2] >= 16, "16px or more, so an iPhone doesn't zoom in");
  assert.deepEqual(O.errs, []);
});
