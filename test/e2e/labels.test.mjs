// Date labels: managers keep each side's list of what's dated once it's opened; anyone opens, changes or bins one, with
// their name and the time on it; what's due tomorrow, today or overdue shows on the Shift pages, the dashboard, Live and
// the closing report; and every change stays in the label's history, Activity and the download.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, toastOf, attempt, adminWrite } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });
const people = [["M", "Mia Manager", "mia", "manager"], ["S", "Sam Staff", "sam", "staff"], ["T", "Tia Staff", "tia", "staff"]];

const flat = (s) => s.replace(/\s+/g, " ").trim();
const text = async (p, sel) => flat(await p.$eval(sel, (e) => e.innerText));
const waitToast = (p, re) => p.waitForFunction((s) => new RegExp(s).test(document.querySelector("#toast").textContent), re.source);
const labels = async (p, side = "bar") => { await p.click("[data-tab=tally]"); await p.click(`[data-mode=${side}]`); await p.click(`.ptabs [data-pane=${side === "floor" ? "fshake" : "labels"}]`); };
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
  assert.deepEqual(await S.$$eval(".ptabs [data-pane]", (x) => x.map((b) => b.firstChild.textContent)), ["Open", "Labels", "Stock", "Close", "Send"]);
  assert.match(await text(S, "#tally"), /Nothing here yet\. A manager adds what needs a date label\./);
  assert.equal(await S.locator("#lb-add").count(), 0, "staff don't get the add form");
  assert.equal(await attempt(S, () => LIVE.api.label(null, "added", { item: "Apple juice", side: "bar", life: 3, on: true })), "permission-denied");

  // An idea fills in the name, and asks for the days when Bar Book's lists didn't have them.
  await M.click("#lb-add summary");
  await M.click('[data-lb-idea="Apple juice"]');
  assert.equal(await M.inputValue("#lb-item"), "Apple juice");
  assert.equal(await toastOf(M), "How many days does it keep once opened?");
  assert.equal(await M.evaluate(() => document.activeElement.id), "lb-life");
  await M.click("#lb-go");
  assert.equal(await toastOf(M), "Days it keeps once opened: a whole number from 1 to 365");
  await M.fill("#lb-life", "3");
  await M.click("#lb-go");
  await waitToast(M, /^Apple juice added\. Everyone on the bar can see it$/);
  for (const [item, life] of [["Cranberry juice", "4"], ["Orange juice", "3"], [" apple JUICE ", "3"]]) {
    await M.fill("#lb-item", item); await M.fill("#lb-life", life); await M.click("#lb-go");
  }
  assert.equal(await toastOf(M), "apple JUICE is on the list already");
  await S.waitForFunction(() => LIVE.labels.length === 3 && LIVE.labels.every((x) => !x.pending));
  // (The page isn't redrawn under someone typing, so the ideas catch up once they stop.)
  await M.evaluate(() => { document.activeElement.blur(); renderTally(); });
  assert.deepEqual(await M.$$eval("[data-lb-idea]", (x) => x.map((b) => b.dataset.lbIdea)), ["Pineapple juice", "Tomato juice", "Lime juice", "Lemon juice", "Sugar syrup", "Aquafaba"]);
  assert.equal(await rowText(S, "Apple juice"), "Apple juice Not open Keeps 3 days once opened Opened one");

  // Opening one: today plus its days, saved with who opened it.
  const d3 = await day(S, 3);
  await tap(S, "Apple juice", "opened");
  assert.equal(await S.$eval(".lbdate", (e) => e.textContent), `Use by ${await dn(S, d3)}`);
  await S.click("[data-lb-save]");
  await waitToast(S, new RegExp(`^Saved\\. Use by ${await dn(S, d3)}$`));
  await settled(M, "Apple juice", 2);
  const a = await lb(M, "Apple juice");
  assert.deepEqual([a.state, a.openedOn, a.useBy, a.openedBy], ["open", await day(M, 0), d3, "Sam Staff"]);
  assert.equal(await rowText(M, "Apple juice"), `Apple juice Open Use by ${await dn(M, d3)} · opened today by Sam Staff Changed it Binned…`);

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

  // The day before, the bar's Open and Close pages say so, and so does the Labels tab.
  await S.click(".ptabs [data-pane=open]");
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
  await S.click("[data-tab=tally]"); await S.click(".ptabs [data-pane=open]");
  assert.equal(await text(S, ".lbdue"), "Date labels: 1 overdue, 1 due today Orange juice, Cranberry juice ›");
  assert.equal(await S.$eval(".lbdue", (e) => e.classList.contains("late")), true);
  await S.click(".ptabs [data-pane=labels]");
  assert.equal(await rowText(S, "Orange juice"), `Orange juice Overdue Use by ${wasName}, 1 day ago · opened ${openedName} by Tia Staff Changed it Binned…`);
  assert.deepEqual(await S.$$eval("[data-lb-more]", (x) => x.map((b) => b.closest(".lb").querySelector("b").textContent)), ["Orange juice", "Cranberry juice", "Apple juice"], "most urgent first");

  // The dashboard (on this phone's side for staff), and Live for managers.
  await S.evaluate(() => show("notices"));
  assert.match(await text(S, "#dash"), /2 date labels to change/);
  await M.evaluate(() => show("notices"));
  assert.match(await text(M, "#dash"), /2 date labels to change/);
  await M.click("[data-tpane=managers]"); await M.click("#msub [data-msub=live]");
  const live = await text(M, "#live");
  // (Headings read in capitals: innerText follows the page's CSS.)
  assert.match(live, new RegExp(`Needs you now Label overdue Orange juice \\(Bar\\) Use by ${wasName} · Opened ${openedName} by Tia Staff · Date labels`, "i"));
  assert.match(live, new RegExp(`Date labels Orange juice Overdue Bar Use by ${wasName} · opened ${openedName} by Tia Staff · Date labels Cranberry juice Due today Bar Use by ${today} · opened today by Sam Staff`, "i"));
  assert.match(await M.evaluate(() => liveText()), new RegExp(`Date labels due: 2\\n- Orange juice \\(Bar\\): overdue, use by ${wasName}, opened ${openedName} by Tia Staff\\n- Cranberry juice \\(Bar\\): due today`));
  await M.click('#live [data-go="labels:bar"]');
  assert.deepEqual(await M.evaluate(() => [mode, pane, !document.querySelector("#v-tally").hidden]), ["bar", "labels", true]);

  // The closing report: what's still to change as it's sent, and who opened it.
  await S.click("[data-tab=tally]"); await S.click(".ptabs [data-pane=send]");
  assert.match(await text(S, ".sumcard"), /Labels due 2/i);
  assert.deepEqual(await S.$$eval("#todo .todo", (x) => x.slice(0, 2).map((b) => b.textContent)), ["Overdue Date label: Orange juice", "Due today Date label: Cranberry juice"]);
  assert.match(await S.$eval("#t-text", (e) => e.value), new RegExp(`\\n\\nDate labels:\\n- Overdue: Orange juice \\(use by ${wasName}, opened ${openedName} by Tia Staff\\)\\n- Due today: Cranberry juice \\(use by ${today}, opened today by Sam Staff\\)\\n\\n86'd: nothing`));
  await S.click("#t-copy");
  await O.waitForFunction(() => LIVE.reports[0] && !LIVE.reports[0].pending);
  assert.match(await O.evaluate(() => LIVE.reports[0].summary), /^Bar · Opening 0\/15 · Closing 0\/21 · 0 86'd · 2 date labels to change$/);

  // Sam changes it a day late. Tia's phone (on the bar) is told, and Live keeps it as an exception.
  await labels(T); await labels(S);
  await tap(S, "Orange juice", "changed");
  assert.match(await text(S, ".lbo"), /^Bin the old one, open a new one and write this on its label:/);
  await S.click("[data-lb-save]");
  await waitToast(T, /^Sam Staff changed Orange juice$/);
  await settled(M, "Orange juice", 3);
  await M.evaluate(() => show("notices"));
  await M.waitForFunction(() => /Label changed late/.test(document.querySelector("#live").innerText));
  assert.match(await text(M, "#live"), new RegExp(`Exceptions tonight Label changed late Orange juice \\(Bar\\) Its use-by was ${wasName} · Sam Staff, \\d\\d:\\d\\d · Date labels`, "i"));
  assert.doesNotMatch(await text(M, "#live"), /Label overdue/);

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

  // Activity: the changes in words, a filter for late changes, and the download.
  await M.click("[data-tpane=managers]"); await M.click("#msub [data-msub=act]");
  await M.click("#act [data-act=labels]");
  const act = await text(M, "#act-rows");
  for (const re of [/Sam Staff binned Cranberry juice/, /Sam Staff changed Orange juice, 1 day past its use-by\. New one, use by/, /Sam Staff opened Cranberry juice, use by/, /Mia Manager added Orange juice to the date labels: keeps 3 days/]) assert.match(act, re);
  await M.selectOption("#af-to", "lblate");
  assert.equal(await M.locator("#act-rows .staffrow").count(), 1);
  assert.match(await text(M, "#act-rows .staffrow"), /^Sam Staff changed Orange juice, 1 day past its use-by\. New one, use by .* History$/);
  await M.selectOption("#af-to", "");
  await M.click("[data-dl=labels]");
  await M.waitForSelector("#act-save");
  const csv = await M.evaluate(async () => (await (await fetch(actFile.url)).text()).replace(/^\uFEFF/, ""));
  const rows = csv.split("\r\n");
  assert.equal(rows[0], "Night,Time,Side,Item,Change,Use by,Use by before,Days after its use-by,Days it keeps,Needs a label,By");
  assert.equal(rows.length, 7, "3 added, Cranberry opened and binned, Orange changed");
  const changed = new RegExp(`^${await day(M, 0)},\\d\\d:\\d\\d,Bar,Orange juice,Changed,${await day(M, 3)},${was},1,3,Yes,Sam Staff$`);
  assert.ok(rows.some((r) => changed.test(r)), csv);
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
  assert.match(await text(S, "#tally"), /Date labels .* Salted caramel Not open Keeps 10 days once opened ⋯ Opened one .*Station checklist/i);

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
  assert.equal(await M.evaluate(() => evText(LIVE.events.find((e) => e.act === "removed"))), "took Salted caramel off the date labels");
  assert.deepEqual([O.errs, M.errs, S.errs], [[], [], []]);
});

test("two people at once: the second is told, and nothing is overwritten", async () => {
  await resetEmulators();
  const { M, S, T } = await team(browser, site, people);
  await add(M, "Pineapple juice", 3);
  await S.waitForFunction(() => LIVE.labels.length === 1 && !LIVE.labels[0].pending);
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
  // The add form open on the floor, with its longest idea, Jammie Dodger ice cream sandwiches · 2 days.
  await labels(O, "floor"); await O.click("#lb-add summary");
  assert.ok(await O.$$eval("[data-lb-idea]", (x) => x.length === 13 && x.every((e) => e.getBoundingClientRect().right <= 320)), "every idea is on screen");
  await add(O, "Jammie Dodger ice cream sandwiches", 2, "floor");
  await O.waitForFunction(() => LIVE.labels.length === 1 && !LIVE.labels[0].pending);
  for (const side of ["bar", "floor", "kitchen"]) {
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
