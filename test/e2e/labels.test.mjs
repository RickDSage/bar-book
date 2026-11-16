// Date labels: managers keep each side's list of what's dated once it's opened; anyone opens, changes or bins one, with
// their name and the time on it; what's due tomorrow, today or overdue shows on the Shift pages, the dashboard, Live and
// the closing report; and every change stays in the label's history, Activity and the download.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, toastOf, attempt, adminWrite, part, handOver } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });
const people = [["M", "Mia Manager", "mia", "manager"], ["S", "Sam Staff", "sam", "staff"], ["T", "Tia Staff", "tia", "staff"]];

const flat = (s) => s.replace(/\s+/g, " ").trim();
const text = async (p, sel) => flat(await p.$eval(sel, (e) => e.innerText));
const waitToast = (p, re) => p.waitForFunction((s) => new RegExp(s).test(document.querySelector("#toast").textContent), re.source);
const labels = async (p, side = "bar") => { await p.click("[data-tab=tally]"); await p.click(`[data-mode=${side}]`); await p.click(`.ptabs [data-pane=labels]`); };
const idOf = (p, item) => p.evaluate((n) => LIVE.labels.find((x) => x.item === n)?.id, item);
const lb = (p, item) => p.evaluate((n) => LIVE.labels.find((x) => x.item === n), item);
const tap = async (p, item, act) => p.click(`[data-lb="${await idOf(p, item)}"][data-lb-act=${act}]`);
// A label's row as it reads, leaving out its ⋯ button.
const rowText = async (p, item) => flat(await p.$eval(`[data-lb-more="${await idOf(p, item)}"]`, (b) => b.closest(".lb").innerText)).replace(/ ⋯/g, "");
const settled = (p, item, v) => p.waitForFunction(([n, v]) => LIVE.labels.some((x) => x.item === n && x.v === v && !x.pending), [item, v]);
const day = (p, n) => p.evaluate((n) => addDays(shiftDay(), n), n);
const dn = (p, d) => p.evaluate((d) => dayName(d), d);
const add = (p, item, life, side = "bar", on = true) => p.evaluate((a) => LIVE.api.label(null, "added", a), { item, side, life, on });

test("a manager sets up the bar's labels, and opening one gives the date to write on it", async () => {
  await resetEmulators();
  const { O, M, S, T } = await team(browser, site, people);
  await labels(M); await labels(S);
  assert.deepEqual(await S.$$eval(".ptabs [data-pane]", (x) => x.map((b) => b.firstChild.textContent)), ["Morning", "Labels", "Stock", "Closing", "Send"]);
  assert.match(await text(S, "#tally"), /Nothing here yet\. A manager adds what needs a date label\./);
  assert.equal(await S.locator("#lb-add").count(), 0, "staff don't get the add form");
  assert.equal(await attempt(S, () => LIVE.api.label(null, "added", { item: "Apple juice", side: "bar", life: 3, on: true })), "permission-denied");

  // Black Tap's list starts open on an empty side, every item ticked, with days only where the venue gives them.
  assert.equal(await M.$eval("#lb-list", (e) => e.open), true);
  assert.match(await text(M, "#lb-list summary"), /^Black Tap's list: 27 not added yet$/);
  assert.equal(await M.inputValue('[data-lbs-life="Maraschino cherries"]'), "28");
  assert.equal(await M.inputValue('[data-lbs-life="Egg whites"]'), "");
  // Untick everything but three. None of them has days yet, so it asks for them.
  await M.$$eval("[data-lbs-on]", (xs) => xs.forEach((x) => { if (!["Egg whites", "Aquafaba", "Mint"].includes(x.dataset.lbsOn)) x.click(); }));
  await M.click("#lbs-go");
  assert.equal(await toastOf(M), "Fill in the days it keeps once opened: a whole number from 1 to 365");
  // Give two of them days and add: those two go in, the third waits for its days.
  await M.fill('[data-lbs-life="Egg whites"]', "2"); await M.fill('[data-lbs-life="Aquafaba"]', "3");
  await M.click("#lbs-go");
  await waitToast(M, /^2 added\. 1 still need their days$/);
  await S.waitForFunction(() => LIVE.labels.length === 2 && LIVE.labels.every((x) => !x.pending));
  assert.deepEqual(await S.evaluate(() => LIVE.labels.map((x) => [x.item, x.life, x.side, x.on]).sort()), [["Aquafaba", 3, "bar", true], ["Egg whites", 2, "bar", true]]);
  await M.evaluate(() => { document.activeElement.blur(); renderTally(); });
  assert.match(await text(M, "#lb-list summary"), /^Black Tap's list: 25 not added yet$/);
  assert.equal(await M.locator('[data-lbs-on="Egg whites"]').count(), 0, "added ones leave the list");
  for (const x of ["Egg whites", "Aquafaba"]) await M.evaluate((n) => LIVE.api.label(LIVE.labels.find((x) => x.item === n), "removed"), x);
  await S.waitForFunction(() => LIVE.labels.length === 0);

  // Anything else goes in the add form.
  await M.click("#lb-add summary");
  await M.fill("#lb-item", "Apple juice");
  await M.click("#lb-go");
  assert.equal(await toastOf(M), "Days it keeps once opened: a whole number from 1 to 365");
  await M.fill("#lb-life", "3");
  await M.click("#lb-go");
  await waitToast(M, /^Apple juice added\. Everyone on the bar can see it$/);
  // Each one is saved before the next, or its "added" could come back after the duplicate's message and replace it.
  for (const [item, life] of [["Cranberry juice", "4"], ["Orange juice", "3"]]) {
    await M.fill("#lb-item", item); await M.fill("#lb-life", life); await M.click("#lb-go");
    await waitToast(M, new RegExp(`^${item} added\\.`));
  }
  await M.fill("#lb-item", " apple JUICE "); await M.fill("#lb-life", "3"); await M.click("#lb-go");
  assert.equal(await toastOf(M), "apple JUICE is on the list already");
  await S.waitForFunction(() => LIVE.labels.length === 3 && LIVE.labels.every((x) => !x.pending));
  // (The page isn't redrawn under someone typing, so the list catches up once they stop.)
  await M.evaluate(() => { document.activeElement.blur(); renderTally(); });
  assert.equal(await M.locator('[data-lbs-on="Apple juice"]').count(), 0, "added by hand, so it leaves Black Tap's list");
  assert.equal(await rowText(S, "Apple juice"), "Apple juice Not opened Keeps 3 days once opened Opened one");

  // Opening one: today plus its days, saved with who opened it.
  const d3 = await day(S, 3);
  await tap(S, "Apple juice", "opened");
  assert.equal(await S.$eval(".lbdate", (e) => e.textContent), `Use by ${await dn(S, d3)}`);
  await S.click("[data-lb-save]");
  await waitToast(S, new RegExp(`^Saved\\. Use by ${await dn(S, d3)}$`));
  await settled(M, "Apple juice", 2);
  const a = await lb(M, "Apple juice");
  assert.deepEqual([a.state, a.openedOn, a.useBy, a.openedBy], ["open", await day(M, 0), d3, "Sam Staff"]);
  assert.equal(await rowText(M, "Apple juice"), `Apple juice Opened Use by ${await dn(M, d3)} · opened today by Sam Staff Changed it Binned…`);

  // The pack's own date is sooner: it can be brought forward, never past its days.
  await labels(T);
  await tap(T, "Cranberry juice", "opened");
  await T.fill("[data-lb-date]", await day(T, 9));
  await T.click("[data-lb-save]");
  assert.equal(await toastOf(T), `Pick a date from today to ${await dn(T, await day(T, 4))}`);
  const d1 = await day(T, 1);
  await T.fill("[data-lb-date]", d1);
  assert.equal(await T.$eval(".lbdate", (e) => e.textContent), `Use by ${await dn(T, d1)}`);
  await T.click("[data-lb-save]");
  await settled(S, "Cranberry juice", 2);
  assert.deepEqual(await lb(S, "Cranberry juice").then((x) => [x.useBy, x.openedBy]), [d1, "Tia Staff"]);
  assert.match(await rowText(S, "Cranberry juice"), /^Cranberry juice Due tomorrow Use by .* · opened today by Tia Staff Changed it Binned…$/);

  // The day before, the bar's Morning and Closing pages say so, and so does the Labels tab.
  await S.click(".ptabs [data-pane=morning]");
  assert.equal(await text(S, ".lbdue"), "Date labels: 1 due tomorrow Cranberry juice ›");
  assert.equal(await S.$eval(".ptabs [data-pane=labels] small", (e) => e.textContent), "1 due");
  await S.click(".ptabs [data-pane=close]");
  assert.equal(await text(S, ".lbdue"), "Date labels: 1 due tomorrow Cranberry juice ›");
  await S.click(".lbdue");
  assert.equal(await S.evaluate(() => pane), "labels");
  assert.deepEqual([O.errs, M.errs, S.errs, T.errs], [[], [], [], []]);
});

test("an overdue label shows everywhere it matters, and changing it late is on the record", async () => {
  await resetEmulators();
  const { O, M, S, T } = await team(browser, site, people);
  for (const [item, life] of [["Apple juice", 3], ["Cranberry juice", 4], ["Orange juice", 3]]) await add(M, item, life);
  await S.waitForFunction(() => LIVE.labels.length === 3 && LIVE.labels.every((x) => !x.pending));
  // Orange juice was opened by Tia four days ago, and nobody has changed it since its use-by yesterday.
  const oj = await idOf(M, "Orange juice"), opened = await day(M, -4), was = await day(M, -1), tia = await T.evaluate(() => LIVE.uid), str = (v) => ({ stringValue: v });
  await adminWrite(`labels/${oj}`, { item: str("Orange juice"), side: str("bar"), life: { integerValue: "3" }, on: { booleanValue: true }, state: str("open"),
    openedOn: str(opened), useBy: str(was), openedBy: str("Tia Staff"), openedUid: str(tia), act: str("opened"), v: { integerValue: "2" },
    uid: str(tia), name: str("Tia Staff"), at: { timestampValue: new Date(Date.now() - 4 * 864e5).toISOString() } });
  const cran = await S.evaluate(() => LIVE.labels.find((x) => x.item === "Cranberry juice"));
  await S.evaluate(([x, d]) => LIVE.api.label(x, "opened", { useBy: d }), [cran, await day(S, 0)]);
  await M.waitForFunction(() => LIVE.labels.filter((x) => x.state === "open" && !x.pending).length === 2);
  const [wasName, openedName, today] = [await dn(S, was), await dn(S, opened), await dn(S, await day(S, 0))];

  // The Shift pages.
  await S.click("[data-tab=tally]"); await S.click(".ptabs [data-pane=morning]");
  assert.equal(await text(S, ".lbdue"), "Date labels: 1 overdue, 1 due today Orange juice, Cranberry juice ›");
  assert.equal(await S.$eval(".lbdue", (e) => e.classList.contains("late")), true);
  await S.click(".ptabs [data-pane=labels]");
  assert.equal(await rowText(S, "Orange juice"), `Orange juice Overdue Use by ${wasName}, 1 day ago · opened ${openedName} by Tia Staff Changed it Binned…`);
  assert.deepEqual(await S.$$eval("[data-lb-more]", (x) => x.map((b) => b.closest(".lb").querySelector("b").textContent)), ["Orange juice", "Cranberry juice", "Apple juice"], "most urgent first");

  // The closing report: what's still to change as it's sent, and who opened it.
  await S.click("[data-tab=tally]"); await S.click(".ptabs [data-pane=send]");
  assert.match(await text(S, ".sumcard"), /Labels due 2/i);
  assert.deepEqual(await S.$$eval("#todo .todo", (x) => x.slice(0, 2).map((b) => b.textContent)), ["Overdue Date label: Orange juice", "Due today Date label: Cranberry juice"]);
  assert.match(await S.evaluate(() => tallyText()), new RegExp(`\\n\\nDate labels:\\n- Overdue: Orange juice \\(use by ${wasName}, opened ${openedName} by Tia Staff\\)\\n- Due today: Cranberry juice \\(use by ${today}, opened today by Sam Staff\\)\\n\\n86'd: nothing`));
  await handOver(S);
  await O.waitForFunction(() => LIVE.reports[0] && !LIVE.reports[0].pending);
  assert.match(await O.evaluate(() => LIVE.reports[0].summary), /^Bar · Closing 0\/39 · 0 86'd · 2 date labels to change$/);

  // Sam changes it a day late. Tia's phone (on the bar) is told, and Live keeps it as an exception.
  await labels(T); await labels(S);
  await tap(S, "Orange juice", "changed");
  assert.match(await text(S, ".lbo"), /^Bin the old one, open a new one and write this on its label:/);
  await S.click("[data-lb-save]");
  await waitToast(T, /^Sam Staff changed Orange juice$/);
  await settled(M, "Orange juice", 3);
  // The label's history: who did what, and that it was late.
  await S.click(`[data-lb-more="${oj}"]`);
  await S.waitForFunction(() => document.querySelector(".lb .hist"));
  assert.match(await text(S, ".lb .hist"), new RegExp(`^${today}, \\d\\d:\\d\\d · Mia Manager added it: keeps 3 days ${today}, \\d\\d:\\d\\d · Sam Staff changed it, 1 day past its use-by\\. New one, use by ${await dn(S, await day(S, 3))}$`));
  await S.click(`[data-lb-more="${oj}"]`);
  await S.click(`[data-lb-more="${await idOf(S, "Apple juice")}"]`);
  await S.waitForFunction(() => document.querySelector(".lb .hist"));
  assert.match(await text(S, ".lb .hist"), /^\w{3},? \d+ \w{3}, \d\d:\d\d · Mia Manager added it: keeps 3 days$/);

  // Binned: used up, with no new one opened.
  await tap(S, "Cranberry juice", "binned");
  await settled(M, "Cranberry juice", 3);
  assert.deepEqual(await lb(M, "Cranberry juice").then((x) => [x.state, x.useBy, x.openedBy]), ["none", null, null]);

  assert.deepEqual([O.errs, M.errs, S.errs, T.errs], [[], [], [], []]);
});

test("managers change an item, move it to another side, switch its label off or take it off; staff can't", async () => {
  await resetEmulators();
  const { O, M, S } = await team(browser, site, people);
  await add(M, "Salted caramel sauce", 7);
  await S.waitForFunction(() => LIVE.labels.length === 1 && !LIVE.labels[0].pending);
  const x = await lb(S, "Salted caramel sauce");
  assert.equal(await attempt(S, (x) => LIVE.api.label(x, "edited", { item: x.item, side: x.side, life: 30, on: true }), x), "permission-denied");
  assert.equal(await attempt(S, (x) => LIVE.api.label(x, "removed"), x), "permission-denied");
  await labels(M); await labels(S);
  assert.equal(await S.locator("[data-lb-edit]").count(), 0);

  // Renamed, kept longer and moved to the floor, where it's on the Shakes page.
  await M.click(`[data-lb-more="${x.id}"]`);
  await M.fill('[data-lbe="item"]', "Salted caramel");
  await M.fill('[data-lbe="life"]', "0");
  await M.click(`[data-lb-edit="${x.id}"]`);
  assert.equal(await toastOf(M), "Days it keeps: a whole number from 1 to 365");
  await M.fill('[data-lbe="life"]', "10");
  await M.selectOption('[data-lbe="side"]', "floor");
  await M.click(`[data-lb-edit="${x.id}"]`);
  await waitToast(M, /^Saved\. It's on the floor's labels now$/);
  await settled(S, "Salted caramel", 2);
  assert.match(await text(S, "#tally"), /Nothing here yet/);
  await labels(S, "floor");
  assert.match(await text(S, "#tally"), /Date labels .* Salted caramel Not opened Keeps 10 days once opened ⋯ Opened one/i);

  // Switched off: no label needed, so the team doesn't see it; managers still do.
  await labels(M, "floor");
  await M.click(`[data-lb-more="${x.id}"]`);
  await M.waitForFunction(() => document.querySelector(".lb .hist"));
  assert.match(await text(M, ".lb .hist"), /Mia Manager changed its details: renamed from Salted caramel sauce, keeps 10 days, moved to the floor$/);
  await M.uncheck('[data-lbe="on"]');
  await M.click(`[data-lb-edit="${x.id}"]`);
  await settled(S, "Salted caramel", 3); await settled(M, "Salted caramel", 3);
  assert.equal(await S.locator(`[data-lb-more="${x.id}"]`).count(), 0);
  assert.match(await rowText(M, "Salted caramel"), /^Salted caramel No label needed Keeps 10 days once opened/);
  await M.click(`[data-lb-edit="${x.id}"]`);
  assert.equal(await toastOf(M), "Nothing changed");

  // Taken off the list: gone from every phone, and its history stays in Activity.
  await M.click(`[data-lb-del="${x.id}"]`);
  await S.waitForFunction(() => LIVE.labels.length === 0);
  await M.waitForFunction(() => LIVE.events.some((e) => e.kind === "label" && e.act === "removed" && !e.pending));
  assert.deepEqual([O.errs, M.errs, S.errs], [[], [], []]);
});

test("two people at once: the second is told, and nothing is overwritten", async () => {
  await resetEmulators();
  const { M, S, T } = await team(browser, site, people);
  await add(M, "Pineapple juice", 3);
  for (const p of [S, T]) await p.waitForFunction(() => LIVE.labels.length === 1 && !LIVE.labels[0].pending);
  await labels(S); await labels(T);
  await tap(S, "Pineapple juice", "opened"); await tap(T, "Pineapple juice", "opened");
  await S.click("[data-lb-save]");
  await settled(T, "Pineapple juice", 2);
  await T.click("[data-lb-save]");
  assert.equal(await toastOf(T), "Sam Staff has just opened it. Check it and try again");
  assert.equal(await T.locator(".lbo").count(), 0);
  assert.equal((await lb(M, "Pineapple juice")).openedBy, "Sam Staff");

  // Taken off the list while someone is changing it: their date box stays put while they use it, and Save tells them.
  await tap(T, "Pineapple juice", "changed"); await T.focus("[data-lb-date]");
  await M.evaluate(() => LIVE.api.label(LIVE.labels[0], "removed"));
  await T.waitForFunction(() => LIVE.labels.length === 0);
  assert.equal(await T.locator(".lbo").count(), 1);
  await T.click("[data-lb-save]");
  assert.equal(await toastOf(T), "Someone has just taken it off the list");
  assert.equal(await T.locator(".lb").count(), 0);
  assert.deepEqual([M.errs, S.errs, T.errs], [[], [], []]);
});

test("the Labels page fits a small phone", async () => {
  await resetEmulators();
  const { O } = await team(browser, site, []);
  await O.setViewportSize({ width: 320, height: 640 });
  // Black Tap's list open on the floor: every row and its days box on screen, the boxes 16px so an iPhone doesn't zoom.
  await labels(O, "floor"); await O.waitForSelector("#lb-list");
  assert.deepEqual(await O.$$eval("[data-lbs-life]", (x) => [x.length, x.filter((e) => e.getBoundingClientRect().right > 320 || parseFloat(getComputedStyle(e).fontSize) < 16).map((e) => e.dataset.lbsLife)]), [39, []], "every row is on screen");
  await add(O, "Jammie Dodger ice cream sandwiches", 2, "floor");
  await O.waitForFunction(() => LIVE.labels.length === 1 && !LIVE.labels[0].pending);
  for (const side of ["bar", "floor"]) {
    await labels(O, side);
    assert.ok(await O.evaluate(() => document.documentElement.scrollWidth <= 320), `${side}: no sideways scrolling`);
  }
  await labels(O, "floor");
  await tap(O, "Jammie Dodger ice cream sandwiches", "opened");
  const box = await O.$eval("[data-lb-date]", (e) => { const r = e.getBoundingClientRect(); return [r.left, r.right, parseFloat(getComputedStyle(e).fontSize)]; });
  assert.ok(box[0] >= 0 && box[1] <= 320, "the date box is on screen");
  assert.ok(box[2] >= 16, "16px or more, so an iPhone doesn't zoom in");
  assert.ok(await O.evaluate(() => document.documentElement.scrollWidth <= 320), "no sideways scrolling with the date box open");
  assert.deepEqual(O.errs, []);
});
