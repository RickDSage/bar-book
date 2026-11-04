// The rota: managers draft a week, copy last week's and publish it; staff see the published weeks, put their hand up for
// an open shift, take or turn down one offered to them, and say when they can't make their own. Every change to a
// published shift keeps who made it, in the shift's history, Activity and the download.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, toastOf, attempt } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });
const people = [["M", "Mia Manager", "mia", "manager"], ["S", "Sam Staff", "sam", "staff"], ["T", "Tia Staff", "tia", "staff"]];

const flat = (s) => s.replace(/\s+/g, " ").trim();
const text = async (p, sel) => flat(await p.$eval(sel, (e) => e.innerText));
const waitToast = (p, re) => p.waitForFunction((s) => new RegExp(s).test(document.querySelector("#toast").textContent), re.source);
// The rota, showing the week with day n in it (days by number from this week's Monday, so 7 is next Monday).
const rota = async (p, n = 0) => { await p.evaluate(() => show("notices")); await p.click("[data-tpane=rota]"); if (n >= 7) await p.click('[data-ro-wk="7"]'); };
const week = (p, n = 0) => p.evaluate((n) => addDays(weekOf(shiftDay()), 7 * n), n);
const day = (p, n) => p.evaluate((n) => addDays(weekOf(shiftDay()), n), n);
// Two days still to come, whatever day the tests run: tomorrow and the day after, or next Monday and Tuesday when this
// week ends tomorrow, so both are in one week and in the next 7 days. Only a shift still to come can be taken, turned
// down or covered.
const soon = (p) => p.evaluate(() => { const n = (Date.parse(shiftDay()) - Date.parse(weekOf(shiftDay()))) / 864e5 + 1; return n >= 6 ? [7, 8] : [n, n + 1]; });
// One shift by its day and start time, and the row as it reads without the ⋯ button.
const idOf = (p, day, start) => p.evaluate(([d, s]) => LIVE.shifts.find((x) => x.day === d && x.start === s)?.id, [day, start]);
const rowText = async (p, d, start) => flat(await p.$eval(`[data-ro-more="${await idOf(p, d, start)}"]`, (b) => b.closest(".ro").innerText)).replace(/ ⋯/g, "");
const uidOf = (p, name) => p.evaluate((n) => LIVE.staff.find((s) => s.name === n)?.uid, name);
const settled = (p, n) => p.waitForFunction((n) => LIVE.shifts.length === n && LIVE.shifts.every((x) => !x.pending), n);
// Adds shifts through the form: the days by number in the week, the times, and who (a name) or nobody.
async function add(p, days, start, end, who = "", { side = "bar", offer = "", note = "" } = {}) {
  if (!(await p.$eval("#ro-add", (e) => e.open))) await p.click("#ro-add summary");
  for (const n of days) await p.click(`[data-ro-day="${await day(p, n)}"]`);
  await p.fill("[data-rof=start]", start); await p.fill("[data-rof=end]", end);
  await p.selectOption("[data-rof=side]", side);
  if (who) await p.selectOption("[data-rof=who]", await uidOf(p, who));
  else if (offer) await p.selectOption("[data-rof=offer]", await uidOf(p, offer));
  if (note) await p.fill("[data-rof=note]", note);
  await p.click("#ro-go");
}

test("a manager drafts a week, copies last week's and publishes it", async () => {
  await resetEmulators();
  const { O, M, S } = await team(browser, site, people);
  await rota(M); await rota(S);
  assert.match(await text(S, "#rota"), /Nothing published for this week yet\./);
  assert.match(await text(S, "#rota"), /Need a day off\? Tap it on the calendar, or ask from the Me tab\./);
  assert.equal(await S.locator("#ro-add").count(), 0, "staff don't get the add form");
  assert.match(await text(M, "#rota"), /Nothing on this week yet\. Add shifts below\./);
  assert.equal(await M.locator("#ro-copy").count(), 0, "nothing to copy on an empty rota");

  // Nothing is saved until the day and the times are picked.
  await M.click("#ro-add summary"); await M.click("#ro-go");
  assert.equal(await toastOf(M), "Pick the day or days");
  await M.click(`[data-ro-day="${await day(M, 1)}"]`);
  await M.click("#ro-go");
  assert.equal(await toastOf(M), "Pick when it starts and ends");
  await M.fill("[data-rof=start]", "18:00"); await M.fill("[data-rof=end]", "18:00"); await M.click("#ro-go");
  assert.equal(await toastOf(M), "It can't start and end at the same time");

  await M.fill("[data-rof=end]", "02:00");
  await M.selectOption("[data-rof=who]", await uidOf(M, "Sam Staff"));
  await M.fill("[data-rof=note]", "Close");
  await M.click("#ro-go");
  await waitToast(M, /^Shift added to the draft$/);
  await add(M, [2, 3], "17:00", "01:00", "Tia Staff", { side: "floor" });
  await waitToast(M, /^2 shifts added to the draft$/);
  await add(M, [5], "18:00", "02:00");
  await settled(M, 4);
  // The draft is the managers' alone, and the hours add up from start to finish.
  assert.equal(await S.evaluate(() => LIVE.shifts.length), 0, "staff can't read a draft");
  assert.equal(await attempt(S, () => LIVE.api.publish(LIVE.shifts)), "allowed", "and so have nothing to publish");
  const draft = await text(M, "#rota");
  assert.match(draft, /Draft Only managers can see this week until it's published\. Publish 4 shifts/);
  assert.match(draft, /18:00–02:00 Sam Staff Draft Bar Close/);
  assert.match(draft, /17:00–01:00 Tia Staff Draft Floor/);
  assert.match(draft, /18:00–02:00 Draft Open shift Bar/);
  assert.match(draft, /HOURS THIS WEEK Sam Staff · 1 shift, 8 h Tia Staff · 2 shifts, 16 h Open shifts · 1 shift, 8 h/);
  assert.match(draft, /4 shifts, 32 h in all\. From start to finish, before breaks, drafts included\./);

  // Next week starts from this one: the same days a week on, with the same people.
  await M.click('[data-ro-wk="7"]');
  assert.match(await text(M, "#rota"), new RegExp(`Week of .* Next week`));
  await M.click("#ro-copy");
  await waitToast(M, /^Copied 4 shifts into a draft\. Check them, then publish$/);
  await settled(M, 8);
  assert.deepEqual(await M.evaluate((w) => LIVE.shifts.filter((x) => x.week === w).map((x) => `${x.day} ${x.start} ${x.whoName || "open"}`).sort(), await week(M, 1)),
    [`${await day(M, 8)} 18:00 Sam Staff`, `${await day(M, 9)} 17:00 Tia Staff`, `${await day(M, 10)} 17:00 Tia Staff`, `${await day(M, 12)} 18:00 open`]);
  assert.equal(await M.locator("#ro-copy").count(), 0, "a week with shifts isn't copied over");

  // Publishing is for the week on screen, and drafts have no history to show yet.
  await M.click('[data-ro-wk="-7"]');
  await M.click(`[data-ro-more="${await idOf(M, await day(M, 1), "18:00")}"]`);
  assert.match(await text(M, "#rota"), /A draft, last changed by Mia Manager, .*\. Its history starts when the week is published\./);
  await M.click(`[data-ro-more="${await idOf(M, await day(M, 1), "18:00")}"]`);
  await M.click("#ro-pub");
  await waitToast(M, /^Published\. Everyone can see the week of /);
  await settled(S, 4);
  assert.match(await text(M, "#rota"), /Published\. Everyone can see it, and each change is saved with who made it and when\./);
  assert.equal(await S.evaluate(() => LIVE.shifts.every((x) => x.pub && x.act === "published")), true);
  assert.equal(await M.evaluate(() => LIVE.events.filter((e) => e.kind === "shift").length), 0, "publishing a week writes no events");
  // Staff see the week, with their own shifts named as theirs.
  const out = await text(S, "#rota");
  assert.match(out, /You: 1 shift, 8 h/);
  assert.match(out, /18:00–02:00 You Bar Close/);
  assert.match(out, /18:00–02:00 Open shift Bar/);
  assert.equal(await S.locator(".ro").count(), 4);
  assert.equal(await attempt(S, () => LIVE.api.shift(LIVE.shifts.find((x) => !x.who), "edited", { who: LIVE.uid, whoName: LIVE.me })), "permission-denied", "only managers put people on shifts");
  assert.deepEqual([O.errs, M.errs, S.errs], [[], [], []]);
});

test("hands up for an open shift, and a manager gives it to someone", async () => {
  await resetEmulators();
  const { O, M, S, T } = await team(browser, site, people);
  const [n] = await soon(O);
  await rota(O, n);
  await add(O, [n], "18:00", "02:00");
  await settled(O, 1);
  await O.click("#ro-pub");
  await settled(S, 1);
  const d1 = await day(S, n);
  await rota(S, n); await rota(T, n);
  assert.match(await rowText(S, d1, "18:00"), /18:00–02:00 Open shift Bar I can do it/);

  await S.click(`[data-ro="${await idOf(S, d1, "18:00")}"][data-ro-act=wants]`);
  await waitToast(S, /^Hand up\. A manager picks who gets it$/);
  await T.click(`[data-ro="${await idOf(T, d1, "18:00")}"][data-ro-act=wants]`);
  for (const p of [O, S]) await p.waitForFunction(() => Object.keys(LIVE.shifts[0].wants).length === 2);
  assert.match(await rowText(S, d1, "18:00"), /Hands up: Sam Staff, Tia Staff Take my hand down/);
  // A hand down leaves the other.
  await T.click(`[data-ro="${await idOf(T, d1, "18:00")}"][data-ro-act=unwants]`);
  await O.waitForFunction(() => Object.keys(LIVE.shifts[0].wants).length === 1);
  assert.equal(await attempt(T, () => LIVE.api.shift(LIVE.shifts[0], "unwants", { wants: {} })), "permission-denied", "nobody takes someone else's hand down");

  // The manager picks from the hands up, and the shift is Sam's from then on.
  await O.evaluate(() => renderRota());
  await O.click(`[data-ro="${await idOf(O, d1, "18:00")}"][data-ro-give="${await uidOf(O, "Sam Staff")}"]`);
  await waitToast(O, /^Given to Sam Staff$/);
  await S.waitForFunction(() => LIVE.shifts[0].who === LIVE.uid);
  assert.match(await rowText(S, d1, "18:00"), /18:00–02:00 You Bar Can't make it…/);
  // Tia's phone can hear about it a moment after Sam's.
  await T.waitForFunction(() => LIVE.shifts[0].who);
  assert.equal(await T.locator("[data-ro-act=wants]").count(), 0, "a shift with someone on it isn't up for grabs");
  const w = await T.evaluate((d) => dayName(d), d1);
  assert.deepEqual(await O.evaluate(() => LIVE.events.filter((e) => e.kind === "shift").map((e) => `${e.name}: ${roText(e)}`)),
    [`Olly Owner: changed ${w} 18:00–02:00 (Bar): gave it to Sam Staff`, `Tia Staff: took their hand down for ${w} 18:00–02:00 (Bar)`,
      `Tia Staff: put a hand up for ${w} 18:00–02:00 (Bar)`, `Sam Staff: put a hand up for ${w} 18:00–02:00 (Bar)`]);
  assert.deepEqual([O.errs, M.errs, S.errs, T.errs], [[], [], [], []]);
});

test("a shift offered to someone is theirs to take or turn down", async () => {
  await resetEmulators();
  const { O, S, T } = await team(browser, site, people);
  const [n1, n2] = await soon(O);
  await rota(O, n1);
  await add(O, [n1, n2], "18:00", "02:00", "", { offer: "Sam Staff" });
  await settled(O, 2);
  await O.click("#ro-pub");
  await settled(S, 2); await settled(T, 2);
  const [d1, d2] = [await day(S, n1), await day(S, n2)];
  await rota(S, n1); await rota(T, n1);
  assert.match(await rowText(S, d1, "18:00"), /Offered to you Bar Take it No thanks/);
  assert.match(await rowText(T, d1, "18:00"), /Offered to Sam Staff Bar/);
  assert.equal(await T.locator("[data-ro-act=took]").count(), 0, "only the person it's offered to can take it");
  assert.equal(await attempt(T, () => LIVE.api.shift(LIVE.shifts[0], "took", { who: LIVE.uid, whoName: LIVE.me, offer: "", offerName: "", wants: {} })), "permission-denied");

  await S.click(`[data-ro="${await idOf(S, d1, "18:00")}"][data-ro-act=took]`);
  await waitToast(S, /^It's yours\. It's on the rota with your name$/);
  await S.click(`[data-ro="${await idOf(S, d2, "18:00")}"][data-ro-act=declined]`);
  await waitToast(S, /^Turned down\. The managers can see it's free$/);
  await O.waitForFunction(() => LIVE.shifts.filter((x) => x.who).length === 1 && LIVE.shifts.filter((x) => !x.who && !x.offer).length === 1);
  // A turned-down shift is open to anyone, and shows for the managers as one to fill.
  assert.match(await rowText(T, d2, "18:00"), /Open shift Bar I can do it/);
  await O.evaluate(() => renderDash());
  assert.match(await text(O, "#dash"), /1 shifts? to fill in the next 7 days/);
  assert.deepEqual(await O.evaluate(() => LIVE.events.filter((e) => e.kind === "shift").map((e) => e.act).sort()), ["declined", "took"]);
  assert.deepEqual([O.errs, S.errs, T.errs], [[], [], []]);
});

test("someone who can't make their shift says so, and can take it back", async () => {
  await resetEmulators();
  const { O, M, S, T } = await team(browser, site, people);
  const [n] = await soon(O);
  await rota(O, n);
  await add(O, [n], "18:00", "02:00", "Sam Staff");
  await settled(O, 1);
  await O.click("#ro-pub");
  await settled(S, 1);
  const d1 = await day(S, n);
  await rota(S, n); await rota(T, n);

  S.answer = "";
  await S.click(`[data-ro="${await idOf(S, d1, "18:00")}"][data-ro-act=cover]`);
  assert.equal(await S.evaluate(() => LIVE.shifts[0].cover), "", "no reason, no change");
  S.answer = "Hospital appointment";
  await S.click(`[data-ro="${await idOf(S, d1, "18:00")}"][data-ro-act=cover]`);
  await waitToast(S, /^Asked\. It's still yours until a manager gives it to someone else$/);
  await T.waitForFunction(() => LIVE.shifts[0].cover === "Hospital appointment");
  assert.match(await rowText(T, d1, "18:00"), /18:00–02:00 Sam Staff Needs cover Bar Sam Staff can't make it: Hospital appointment I can cover it/);
  assert.match(await rowText(S, d1, "18:00"), /You can't make it: Hospital appointment I can do it after all/);

  // A teammate puts their hand up to cover it; the manager can still leave it with Sam.
  await T.click(`[data-ro="${await idOf(T, d1, "18:00")}"][data-ro-act=wants]`);
  await O.waitForFunction(() => LIVE.shifts[0].wants && Object.keys(LIVE.shifts[0].wants).length === 1);
  await O.evaluate(() => renderRota());
  assert.match(await text(O, "#rota"), /Needs cover .*Hands up: Tia Staff .*Give it to Tia Staff/s);
  await S.click(`[data-ro="${await idOf(S, d1, "18:00")}"][data-ro-act=kept]`);
  await waitToast(S, /^Done\. It's still yours, and nobody needs to cover it$/);
  await T.waitForFunction(() => !LIVE.shifts[0].cover && !Object.keys(LIVE.shifts[0].wants).length);
  assert.equal(await T.locator("[data-ro-act=wants]").count(), 0);
  assert.equal(await attempt(T, () => LIVE.api.shift(LIVE.shifts[0], "cover", { cover: "not mine to give up" })), "permission-denied", "only the person on it asks for cover");
  assert.deepEqual([O.errs, M.errs, S.errs, T.errs], [[], [], [], []]);
});

test("a manager changes a published shift, with its history, warnings and the record", async () => {
  await resetEmulators();
  const { O, M, S, T } = await team(browser, site, people);
  // Tia has the day after tomorrow off, approved.
  const [d1, d2] = [await day(O, 1), await day(O, 2)];
  await T.evaluate((d) => LIVE.api.ask({ kind: "off", date1: d, date2: d, eta: "", with: "", note: "Wedding" }), d2);
  await O.waitForFunction(() => LIVE.asks.length === 1);
  await O.evaluate(() => LIVE.api.decide(LIVE.asks[0].id, "approved"));
  await O.waitForFunction(() => LIVE.asks[0].status === "approved");
  await rota(O); await rota(S); await rota(T);
  assert.match(await text(O, "#rota"), /Tia Staff is off/);

  // Putting someone on two shifts at once, or on a day off, is warned about but allowed.
  await add(O, [1], "18:00", "02:00", "Sam Staff", { note: "Close" });
  await settled(O, 1);
  await O.click("#ro-pub");
  await settled(S, 1);
  // Staff see their own time off on the week, not anyone else's.
  assert.match(await text(T, "#rota"), /You're off/);
  assert.doesNotMatch(await text(S, "#rota"), /is off|You're off/);
  O.answer = "yes";
  await add(O, [1], "20:00", "23:00", "Sam Staff");
  await waitToast(O, /^Shift added and published$/);
  await add(O, [2], "18:00", "02:00", "Tia Staff");
  await settled(O, 3);
  const live = await text(O, "#rota");
  assert.match(live, /Sam Staff is on .* 20:00–23:00 too/);
  assert.match(live, /Tia Staff is off on /);
  assert.equal(await S.evaluate(() => LIVE.shifts.length), 3, "a published week goes out as it's added to");

  // ⋯ opens the change form, which refuses a save that changes nothing.
  const id = await idOf(O, d1, "20:00");
  await O.click(`[data-ro-more="${id}"]`);
  await O.waitForSelector(`[data-ro-save="${id}"]`);
  await O.click(`[data-ro-save="${id}"]`);
  assert.equal(await toastOf(O), "Nothing changed");
  await O.selectOption("[data-roe=day]", d2);
  await O.fill("[data-roe=start]", "16:00");
  await O.selectOption("[data-roe=side]", "floor");
  await O.selectOption("[data-roe=who]", await uidOf(O, "Tia Staff"));
  await O.click(`[data-ro-save="${id}"]`);
  await waitToast(O, /^Saved\. Everyone can see the change$/);
  await S.waitForFunction((i) => LIVE.shifts.find((x) => x.id === i)?.whoName === "Tia Staff", id);
  // Its history reads as what changed, for everyone.
  await S.click(`[data-ro-more="${id}"]`);
  await S.waitForSelector("#rota .hist");
  const hist = await text(S, "#rota .tmore");
  assert.match(hist, /Olly Owner added it for Sam Staff/);
  assert.match(hist, new RegExp(`Olly Owner changed it: moved it from ${await O.evaluate((d) => dayName(d), d1)} 20:00–23:00 \\(Bar\\), gave it to Tia Staff instead of Sam Staff`));
  // A shift drafted and then published has nothing of its own in the history until it changes.
  const first = await idOf(S, d1, "18:00");
  await S.click(`[data-ro-more="${first}"]`);
  await S.waitForFunction((i) => /Published by Olly Owner/.test(document.querySelector(`[data-ro-more="${i}"]`).closest(".ro").innerText), first);
  assert.match(await rowText(S, d1, "18:00"), /Published by Olly Owner, .*, with the rest of the week\. Not changed since\./);

  // Removing one is on the record too, and the shift goes from every phone.
  O.answer = "yes";
  await O.click(`[data-ro-more="${id}"]`);
  await O.click(`[data-ro-drop="${id}"]`);
  await waitToast(O, /^Shift removed$/);
  await S.waitForFunction((i) => !LIVE.shifts.some((x) => x.id === i), id);
  assert.deepEqual(await O.evaluate(() => LIVE.events.filter((e) => e.kind === "shift").map((e) => e.act)), ["removed", "edited", "added", "added"]);
  assert.equal(await attempt(M, () => LIVE.api.eventsOf(LIVE.shifts[0].id, "shift")), "allowed");
  assert.equal(await attempt(O, () => { const x = LIVE.shifts.find((s) => s.v > 1); return LIVE.api.shift({ ...x, v: x.v - 1 }, "edited", { note: "stale" }); }), "permission-denied", "a change from an old copy is refused");

  // The rota is in Activity and in both spreadsheets.
  await O.click("[data-tpane=managers]"); await O.click("[data-msub=act]");
  await O.click('[data-act="rota"]');
  assert.match(await text(O, "#act"), /Olly Owner removed .*Olly Owner changed .*Olly Owner added /s);
  await O.click("#act-csv");
  await O.waitForSelector("#act-save");
  assert.match(await O.$eval("#act-save", (a) => a.download), /black-tap-rota-changes-/);
  await rota(O);
  await O.click("#rota-csv");
  await O.waitForSelector("#rota-save");
  assert.match(await O.$eval("#rota-save", (a) => a.textContent), /Save the spreadsheet \(2 rows\)/);
  assert.deepEqual([O.errs, M.errs, S.errs, T.errs], [[], [], [], []]);
});

test("the rota reads on a 320px phone, and the week arrows stop at the ends", async () => {
  await resetEmulators();
  const { O, S } = await team(browser, site, people);
  await O.setViewportSize({ width: 320, height: 640 });
  await rota(O);
  await add(O, [1], "18:00", "02:00", "Sam Staff", { note: "Close" });
  await settled(O, 1);
  await O.click("#ro-pub");
  await settled(S, 1);
  assert.ok(await O.evaluate(() => document.documentElement.scrollWidth <= 320), "no sideways scrolling for a manager");
  await S.setViewportSize({ width: 320, height: 640 });
  await rota(S);
  assert.ok(await S.evaluate(() => document.documentElement.scrollWidth <= 320), "or for staff");

  // Staff have last week to the week after next; managers plan further ahead.
  await S.click('[data-ro-wk="-7"]');
  assert.equal(await S.$eval('[data-ro-wk="-7"]', (b) => b.disabled), true);
  for (let i = 0; i < 3; i++) await S.click('[data-ro-wk="7"]');
  assert.equal(await S.$eval('[data-ro-wk="7"]', (b) => b.disabled), true);
  assert.match(await text(S, "#rota"), /In 2 weeks/);
  assert.equal(await O.$eval('[data-ro-wk="7"]', (b) => b.disabled), false);
  // The filter chips cut the week down to one side, or to just me.
  await S.evaluate(() => { roWk = weekOf(shiftDay()); renderRota(); });
  await S.click('[data-ro-side="me"]');
  assert.equal(await S.locator(".ro").count(), 1);
  await S.click('[data-ro-side="kitchen"]');
  assert.equal(await S.locator(".ro").count(), 0);
  assert.match(await text(S, "#rota"), /No shifts to show/);
  assert.deepEqual([O.errs, S.errs], [[], []]);
});
