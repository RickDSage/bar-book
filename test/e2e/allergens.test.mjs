// Menu allergens end to end: nothing shows as confirmed until a manager confirms it, staff see it live with who and when,
// every change is kept, and managers can add an item the menu is missing.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, phone, attempt } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });
const people = [["M", "Mia Manager", "mia", "manager"], ["S", "Sam Staff", "sam", "staff"]];
const PICKLES = "snacks-hot-fried-pickles";
const ALL = ["celery", "gluten", "crustaceans", "eggs", "fish", "lupin", "milk", "molluscs", "mustard", "nuts", "peanuts", "sesame", "soya", "sulphites"];
// Answers No for every allergen, as a manager reading a sheet would before setting the ones it has.
const allNo = async (p) => { for (const k of ALL) await p.click(`[data-alset="${k}"][data-v="no"]`); };
const rowText = (p, id) => p.$eval(`[data-mi="${id}"]`, (e) => e.textContent);
const waitToast = (p, re) => p.waitForFunction((s) => new RegExp(s).test(document.querySelector("#toast").textContent), re.source);
async function openFood(p) {
  await p.evaluate(() => show("allergens"));
  await p.click('[data-altab="food"]');
}

test("logged out: the menu shows, with no allergens claimed", async () => {
  await resetEmulators();
  const p = await phone(browser, site);
  await openFood(p);
  assert.match(await p.$eval("#mhead", (e) => e.textContent), /Log in on the Team page/);
  assert.equal(await p.locator("#mlist [data-mi]").count() > 60, true);
  assert.equal(await p.locator("#mlist .pill").count(), 0);
  assert.equal(await p.locator("#mhead [data-mal]").count(), 0);
  await p.click('[data-altab="shakes"]');
  assert.match(await p.$eval("#mhead", (e) => e.textContent), /shake bar uses peanuts/);
  await p.click('[data-altab="cocktails"]');
  assert.equal(await p.locator("#algrid .tile").count(), 10);
  assert.deepEqual(p.errs, []);
  await p.context().close();
});

test("a manager confirms an item; staff see it live with who and when, and can't change it", async () => {
  await resetEmulators();
  const { O, M, S } = await team(browser, site, people);
  await openFood(S);
  await S.waitForFunction(() => LIVE.menuAl instanceof Map);
  assert.match(await rowText(S, PICKLES), /Not confirmed/);
  assert.match(await S.$eval("#mhead", (e) => e.textContent), /0 of \d+ confirmed/);
  await S.click(`[data-mi="${PICKLES}"]`);
  assert.match(await S.$eval("#mlist .mdet", (e) => e.textContent), /Not confirmed\..*ask the kitchen/);
  assert.equal(await S.locator("[data-medit]").count(), 0, "staff get no edit button");
  assert.equal(await attempt(S, (id) => LIVE.api.confirmAllergens({ id, name: "Hot Fried Pickles", key: "snacks" }, { contains: [], may: [], note: "" }), PICKLES), "permission-denied");

  await openFood(M);
  await M.fill("#mq", "fried pickles");
  assert.equal(await M.locator("#mlist [data-mi]").count(), 1);
  await M.click(`[data-mi="${PICKLES}"]`);
  await M.click(`[data-medit="${PICKLES}"]`);
  assert.equal(await M.locator('#mlist [data-alset][aria-pressed="true"]').count(), 0, "nothing pre-answered");
  await M.click('[data-alset="gluten"][data-v="yes"]');
  await M.click("[data-msave]");
  await waitToast(M, /^Answer all 14 from the sheet\. 13 to go$/);
  await allNo(M);
  await M.click('[data-alset="gluten"][data-v="yes"]');
  await M.click('[data-alset="milk"][data-v="yes"]');
  await M.click('[data-alset="mustard"][data-v="may"]');
  await M.click('[data-alset="milk"][data-v="may"]');
  await M.click('[data-alset="milk"][data-v="yes"]');
  await M.fill("#m-note", "Shared fryer");
  await M.click("[data-msave]");
  await waitToast(M, /^Saved as confirmed$/);

  await S.waitForFunction((id) => LIVE.menuAl.get(id) && !LIVE.menuAl.get(id).pending, PICKLES);
  const r = await S.evaluate((id) => LIVE.menuAl.get(id), PICKLES);
  assert.deepEqual([r.contains, r.may, r.note, r.name, r.section, r.itemName], [["gluten", "milk"], ["mustard"], "Shared fryer", "Mia Manager", "snacks", "Hot Fried Pickles"]);
  await S.waitForFunction((id) => /Confirmed/.test(document.querySelector(`[data-mi="${id}"]`).textContent) && !/Not confirmed/.test(document.querySelector(`[data-mi="${id}"]`).textContent), PICKLES);
  assert.match(await rowText(S, PICKLES), /Contains Gluten, Milk\. May contain Mustard/);
  assert.match(await S.$eval("#mlist .mdet", (e) => e.textContent), /Confirmed by Mia Manager, \w{3}, \d+ \w{3} \d{4}, \d\d:\d\d/);
  assert.match(await S.$eval("#mhead", (e) => e.textContent), /1 of \d+ confirmed/);
  // The allergen tiles list only confirmed items.
  await S.click('[data-mal="mustard"]');
  assert.deepEqual(await S.$$eval("#mlist [data-mi]", (xs) => xs.map((x) => x.dataset.mi)), [PICKLES]);
  await S.click('[data-mal="mustard"]');

  // The owner changes it, then clears it; the history keeps all three, newest first.
  await openFood(O);
  await O.waitForFunction((id) => LIVE.menuAl?.get(id), PICKLES);
  await O.click(`[data-mi="${PICKLES}"]`);
  await O.click(`[data-medit="${PICKLES}"]`);
  await O.click('[data-alset="mustard"][data-v="no"]');
  await O.click("[data-msave]");
  await waitToast(O, /^Saved as confirmed$/);
  await O.waitForFunction((id) => LIVE.menuAl.get(id).name === "Olly Owner" && !LIVE.menuAl.get(id).pending, PICKLES);
  O.answer = undefined;
  await O.click(`[data-mclear="${PICKLES}"]`);
  await waitToast(O, /^Cleared$/);
  await S.waitForFunction((id) => !LIVE.menuAl.has(id), PICKLES);
  await S.waitForFunction((id) => /Not confirmed/.test(document.querySelector(`[data-mi="${id}"]`).textContent), PICKLES);
  await O.click(`[data-mhist="${PICKLES}"]`);
  await O.waitForSelector(".mhist li");
  const hist = await O.$$eval(".mhist li", (xs) => xs.map((x) => x.textContent));
  assert.equal(hist.length, 3);
  assert.match(hist[0], /^Olly Owner, .*: cleared$/);
  assert.match(hist[1], /^Olly Owner, .*: contains Gluten, Milk; note: Shared fryer$/);
  assert.match(hist[2], /^Mia Manager, .*: contains Gluten, Milk; may contain Mustard; note: Shared fryer$/);
  for (const x of [O, M, S]) assert.deepEqual(x.errs, []);
});

test("a manager adds an item the menu is missing, then removes it", async () => {
  await resetEmulators();
  const { M, S } = await team(browser, site, people);
  await openFood(S);
  await M.evaluate(() => show("allergens"));
  await M.click('[data-altab="shakes"]');
  await M.click("[data-madd]");
  await M.fill("#m-name", "Vanilla");
  await M.selectOption("#m-sec", "classic");
  await allNo(M);
  await M.click("[data-msave]");
  await waitToast(M, /^That item is already on the list$/);
  await M.fill("#m-name", "Pumpkin Spice Shake");
  await allNo(M);
  await M.click('[data-alset="milk"][data-v="yes"]');
  await M.click("[data-msave]");
  await waitToast(M, /^Saved as confirmed$/);
  const id = "added-classic-pumpkin-spice-shake";
  await M.waitForSelector(`[data-mi="${id}"]`);
  await S.click('[data-altab="shakes"]');
  await S.waitForSelector(`[data-mi="${id}"]`);
  assert.match(await rowText(S, id), /Pumpkin Spice Shake.*Contains Milk.*Confirmed/);
  await M.click(`[data-mclear="${id}"]`);
  await waitToast(M, /^Removed$/);
  await S.waitForFunction((x) => !document.querySelector(`[data-mi="${x}"]`), id);
  for (const x of [M, S]) assert.deepEqual(x.errs, []);
});
