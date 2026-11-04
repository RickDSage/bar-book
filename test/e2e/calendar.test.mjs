// The calendar under the Rota tab: bank holidays and the big nights built in, school holidays, events and closed days
// that managers add, each person's shifts and time off, and asking for time off from a day.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, toastOf, attempt } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });
const people = [["M", "Mia Manager", "mia", "manager"], ["S", "Sam Staff", "sam", "staff"]];

const flat = (s) => s.replace(/\s+/g, " ").trim();
const text = async (p, sel) => flat(await p.$eval(sel, (e) => e.innerText));
const waitToast = (p, re) => p.waitForFunction((s) => new RegExp(s).test(document.querySelector("#toast").textContent), re.source);
const teamTabs = (p) => p.$$eval("[data-tpane]", (x) => x.map((b) => `${b.dataset.tpane}:${b.firstChild.textContent}`));
const switched = (p, off) => p.waitForFunction((o) => [...LIVE.off].sort().join() === o, [...off].sort().join());
// The calendar, from the Rota tab.
async function calendar(p) {
  await p.evaluate(() => show("notices")); await p.click("[data-tpane=rota]");
  if (await p.locator('#rota [data-roview="cal"]').count()) await p.click('#rota [data-roview="cal"]');
  await p.waitForSelector("#cal .calgrid");
}
const dayFromNow = (p, n) => p.evaluate((n) => addDays(shiftDay(), n), n);
// Opens a day, moving the calendar to its month with the arrows.
async function open(p, day) {
  for (let i = 0; i < 30 && (await p.evaluate(() => calMonth())) !== day.slice(0, 7); i++)
    await p.click(`[data-cal-mon="${(await p.evaluate(() => calMonth())) < day.slice(0, 7) ? 1 : -1}"]`);
  await p.click(`[data-cal-day="${day}"]`);
  await p.waitForFunction((d) => calDayShown === d, day);
}
const panel = (p) => text(p, "#cal-day");
// A day as its heading reads, and as the ask button names it.
const long = (p, d) => p.evaluate((d) => dayName(d, { weekday: "long", day: "numeric", month: "long" }).toUpperCase(), d);
const short = (p, d) => p.evaluate((d) => dayName(d, { weekday: "short", day: "numeric" }), d);
const cell = (p, day) => p.$eval(`[data-cal-day="${day}"]`, (b) => ({ cls: b.className, dots: [...b.querySelectorAll(".dots i")].map((i) => i.className), say: b.getAttribute("aria-label") }));

test("bank holidays and the big nights are on it, and what a manager adds shows on every phone straight away", async () => {
  await resetEmulators();
  const { O, M, S } = await team(browser, site, people);
  await calendar(S);
  assert.match(await text(S, "#cal"), /^Shifts Calendar CALENDAR Bank holidays, school holidays and the big nights, with your shifts and time off\. Tap a day to see it or ask for it off\. ‹ [A-Z][a-z]+ 20\d\d This month › Mo Tu We Th Fr Sa Su /);
  assert.ok(await S.evaluate(() => $("#rota").hidden && !$("#cal").hidden), "the calendar shows instead of the week");
  const today = await dayFromNow(S, 0);
  assert.match((await cell(S, today)).cls, /\btoday\b/);
  assert.match(await panel(S), new RegExp(`^${await long(S, today)} · TODAY .*Ask for time off from ${await short(S, today)}$`));

  // The next Christmas, with Christmas Eve, Boxing Day and New Year's Eve in the month's list. At a weekend the bank
  // holiday moves to a weekday and the 25th is still Christmas Day.
  const xmas = await S.evaluate(() => { const y = +shiftDay().slice(0, 4); return shiftDay() <= `${y}-12-25` ? `${y}-12-25` : `${y + 1}-12-25`; });
  const bank = await S.evaluate((d) => !!BANK_HOLS[d], xmas);
  await open(S, xmas);
  const x = await cell(S, xmas);
  assert.equal(/\bbh\b/.test(x.cls), bank); assert.deepEqual(x.dots, ["d-hol"]);
  assert.equal(x.say, `${await S.evaluate((d) => dayName(d, { weekday: "long", day: "numeric", month: "long" }), xmas)}. Christmas Day`);
  assert.equal(await panel(S), `${await long(S, xmas)} Christmas Day${bank ? " Bank holiday England and Wales" : ""} Ask for time off from ${await short(S, xmas)}`);
  assert.match(await text(S, "#cal-list"), /^IN DECEMBER .*\w{3} 24 Dec Christmas Eve .*\w{3} 25 Dec Christmas Day.* \w{3} 2[678] Dec Boxing Day.* \w{3} 31 Dec New Year's Eve$/);
  assert.deepEqual(await S.evaluate(() => ["2027-12-25", "2027-12-26", "2027-12-27", "2027-12-28", "2028-01-01", "2028-01-03"].map((d) => calItems(d).map((i) => `${i.k}: ${i.t}`).join())),
    ["day: Christmas Day", "day: Boxing Day", "bank: Christmas Day (substitute day)", "bank: Boxing Day (substitute day)", "day: New Year's Day", "bank: New Year's Day (substitute day)"]);
  // The clocks go back in the early hours of a Sunday, so it's on the Saturday night before.
  const back = await S.evaluate(() => { const y = +shiftDay().slice(0, 4) + 1; return addDays(sundayOf(y, 10, 0), -1); });
  assert.equal(await S.evaluate((d) => new Date(d + "T12:00Z").getUTCDay(), back), 6);
  await open(S, back);
  assert.match(await panel(S), /^[A-Z]+ \d+ OCTOBER Clocks go back tonight At 2am they go back to 1am, so a shift that runs past 2am is an hour longer than its times say\. Ask for time off /);

  // A manager adds half term. Nothing is saved without a name or the days.
  await calendar(M);
  assert.match(await text(M, "#cal"), /with your shifts and time off, and everyone's time off\./);
  await M.click("#cal-add summary");
  await M.click("#cal-save");
  assert.equal(await toastOf(M), "Give it a name");
  await M.fill("[data-cale=title]", "Half term (Westminster schools)");
  await M.click("#cal-save");
  assert.equal(await toastOf(M), "Pick the first and last day");
  const [d1, d2] = [await dayFromNow(M, 40), await dayFromNow(M, 44)];
  await M.fill("[data-cale=date1]", d2); await M.fill("[data-cale=date2]", d1);
  assert.equal(await M.inputValue("[data-cale=date2]"), d2, "a last day before the first moves up to it");
  await M.fill("[data-cale=date1]", d1); await M.fill("[data-cale=date2]", d2);
  await M.fill("[data-cale=note]", "Some academies go back a day later");
  await M.click("#cal-save");
  await waitToast(M, /^Half term \(Westminster schools\) is on the calendar for everyone$/);
  await M.waitForFunction(() => LIVE.cal.length === 1 && !LIVE.cal[0].pending);

  // Staff see it at once: a line under each of its days, and the day says what it is, without the managers' buttons.
  await S.waitForFunction(() => LIVE.cal.length === 1);
  for (const d of [d1, d2]) { await open(S, d); assert.match((await cell(S, d)).cls, /\bsc\b/); }
  const after = await dayFromNow(S, 45);
  await open(S, after); assert.doesNotMatch((await cell(S, after)).cls, /\bsc\b/);
  const span = await S.evaluate(([a, b]) => `${dayName(a)} to ${dayName(b)}`, [d1, d2]);
  const mid = await dayFromNow(S, 42), extra = (await S.evaluate((d) => calItems(d).length, mid)) - 1;
  await open(S, mid);
  if (!extra) assert.equal(await panel(S), `${await long(S, mid)} Half term (Westminster schools) School holidays ${span} · Some academies go back a day later Ask for time off from ${await short(S, mid)}`);
  else assert.match(await panel(S), /Half term \(Westminster schools\) School holidays .* · Some academies go back a day later/);
  assert.equal(await S.locator("#cal-add, [data-cal-edit], [data-cal-drop]").count(), 0, "staff can't add, change or remove");
  assert.equal(await attempt(S, () => LIVE.api.saveCal("", { title: "Day off for everyone", kind: "event", date1: ukDay(Date.now()), date2: ukDay(Date.now()), note: "" })), "permission-denied");

  // The manager changes it, and the change shows on the staff phone; then removes it, after asking.
  await open(M, d1);
  assert.match(await panel(M), /Half term \(Westminster schools\) School holidays .* · Some academies go back a day later · Added by Mia Manager, .+ Change Remove/);
  await M.click(`[data-cal-edit="${await M.evaluate(() => LIVE.cal[0].id)}"]`);
  assert.equal(await M.inputValue("[data-cale=title]"), "Half term (Westminster schools)");
  assert.match(await text(M, "#cal-add"), /^Change an entry/);
  await M.fill("[data-cale=title]", "Half term (Westminster and Camden schools)");
  await M.click("#cal-save");
  await waitToast(M, /^Changed on the calendar for everyone$/);
  await S.waitForFunction(() => LIVE.cal[0]?.title === "Half term (Westminster and Camden schools)");
  await S.waitForFunction(() => /Westminster and Camden/.test($("#cal").innerText));
  // The test phones accept every confirm (helpers.mjs), so this only reads what it asked.
  const asked = new Promise((r) => M.once("dialog", (d) => r(d.message())));
  await M.click(`[data-cal-drop="${await M.evaluate(() => LIVE.cal[0].id)}"]`);
  assert.equal(await asked, "Remove Half term (Westminster and Camden schools) from the calendar for everyone?");
  await waitToast(M, /is off the calendar$/);
  await S.waitForFunction(() => LIVE.cal.length === 0);
  await open(S, d1); assert.doesNotMatch((await cell(S, d1)).cls, /\bsc\b/);
  assert.deepEqual([O.errs, M.errs, S.errs], [[], [], []]);
});

test("staff ask for time off from the calendar, see their shifts on it, and the answer shows there", async () => {
  await resetEmulators();
  const { O, M, S } = await team(browser, site, people);
  // A published shift for Sam in three days' time.
  const [a, b, c] = [await dayFromNow(M, 2), await dayFromNow(M, 3), await dayFromNow(M, 4)];
  const sam = await M.evaluate(() => LIVE.staff.find((p) => p.name === "Sam Staff").uid);
  await M.evaluate(([d, uid]) => LIVE.api.shiftsAdd([{ week: weekOf(d), day: d, start: "18:00", end: "02:00", side: "bar", note: "", who: uid, whoName: "Sam Staff", offer: "", offerName: "" }], true), [b, sam]);
  await S.waitForFunction((d) => LIVE.shifts.some((x) => x.day === d && x.pub), b);

  await calendar(S);
  await open(S, b);
  assert.ok((await cell(S, b)).dots.includes("d-on"));
  assert.match((await cell(S, b)).say, /You're on 18:00–02:00$/);
  assert.match(await panel(S), /You're on 18:00–02:00 Bar Ask for time off from \w{3} \d+$/);

  // A day that's gone can't be asked for.
  const yday = await dayFromNow(S, -1);
  await open(S, yday);
  assert.equal(await S.locator("#cal-ask").count(), 0);

  // From the first day, tap the last: the days between are marked, and the shift in them is pointed out.
  await open(S, a);
  await S.click("#cal-ask");
  assert.deepEqual([await S.inputValue("[data-calf=date1]"), await S.inputValue("[data-calf=date2]")], [a, a]);
  await open(S, c);
  assert.deepEqual([await S.inputValue("[data-calf=date1]"), await S.inputValue("[data-calf=date2]")], [a, c]);
  for (const d of [a, b, c]) assert.match((await cell(S, d)).cls, /\brng\b/);
  assert.match(await panel(S), /TIME OFF Tap the last day on the calendar, or pick the days here\. From To You're on \w{3} \d+ \w{3} 18:00–02:00\. Say in the note if someone could cover\. Note \(optional\) Send to managers Cancel$/);
  // A day before the first moves the start; a day that's gone is refused.
  await S.evaluate((d) => calPick(d), yday);
  assert.equal(await toastOf(S), "That day has gone");
  assert.equal(await S.inputValue("[data-calf=date1]"), a);
  await S.fill("[data-calf=note]", "Sister's wedding");
  await S.click("#cal-send");
  await waitToast(S, /^Sent to the managers$/);
  await S.waitForFunction(() => LIVE.asks.length === 1 && !LIVE.asks[0].pending);
  assert.deepEqual(await S.evaluate(() => { const x = LIVE.asks[0]; return [x.kind, x.date1, x.date2, x.note, x.status]; }), ["off", a, c, "Sister's wedding", "pending"]);
  assert.equal(await S.locator("[data-calf]").count(), 0, "the form closes once it's sent");
  assert.ok((await cell(S, a)).dots.includes("d-ask"));
  await open(S, a);
  assert.match(await panel(S), /You've asked for the day off .* · Sister's wedding/);

  // The manager sees who's asked on the calendar, approves it, and it shows as time off on the staff phone.
  await calendar(M);
  await open(M, a);
  assert.match(await panel(M), /Sam Staff has asked for the day off /);
  await M.click('#cal [data-roview="week"]');
  assert.ok(await M.evaluate(() => !$("#rota").hidden && $("#cal").hidden), "Shifts goes back to the week");
  await M.click(`[data-decide="${await M.evaluate(() => LIVE.asks[0].id)}"][data-to="approved"]`);
  await S.waitForFunction(() => LIVE.asks[0]?.status === "approved");
  await S.waitForFunction((d) => /You're off/.test($("#cal").innerText) && document.querySelector(`[data-cal-day="${d}"] .d-off`), a);
  await open(S, b);
  const bd = (await cell(S, b)).dots;
  assert.ok(bd.includes("d-on") && bd.includes("d-off"), bd.join());

  // The Me tab points to the calendar for picking days.
  await S.click("[data-tpane=me]"); await S.click('[data-mek="off"]');
  await S.click('#me [data-go="cal"]');
  assert.ok(await S.evaluate(() => tpane === "rota" && !$("#cal").hidden));
  assert.deepEqual([O.errs, M.errs, S.errs], [[], [], []]);
});

test("the owner can switch the calendar off, and with the rota off the calendar has the tab to itself", async () => {
  await resetEmulators();
  const { O, M, S } = await team(browser, site, people);
  await O.evaluate(() => LIVE.api.setOff(["rota"]));
  for (const p of [M, S]) await switched(p, ["rota"]);
  await S.evaluate(() => show("notices"));
  assert.deepEqual(await teamTabs(S), ["board:Board", "chat:Chat", "rota:Calendar", "activity:Activity", "reports:Reports", "me:Me"]);
  await S.click("[data-tpane=rota]");
  assert.ok(await S.evaluate(() => !$("#cal").hidden && $("#rota").hidden));
  assert.equal(await S.locator("[data-roview]").count(), 0, "no Shifts and Calendar switch without the rota");
  assert.doesNotMatch(await text(S, "#cal"), /You're on/, "no shifts in the key");
  await M.evaluate(() => show("notices"));
  assert.deepEqual(await teamTabs(M), ["board:Board", "chat:Chat", "rota:Calendar", "reports:Reports", "managers:Managers", "me:Me"]);

  // Calendar off too: the tab goes for staff, and managers keep it for requests.
  await O.evaluate(() => LIVE.api.setOff(["rota", "calendar"]));
  for (const p of [M, S]) await switched(p, ["rota", "calendar"]);
  assert.deepEqual(await teamTabs(S), ["board:Board", "chat:Chat", "activity:Activity", "reports:Reports", "me:Me"]);
  assert.deepEqual(await teamTabs(M), ["board:Board", "chat:Chat", "rota:Requests", "reports:Reports", "managers:Managers", "me:Me"]);
  await S.click("[data-tpane=me]"); await S.click('[data-mek="off"]');
  assert.equal(await S.locator('#me [data-go="cal"]').count(), 0);

  // Only the calendar off: the rota is as it was.
  await O.evaluate(() => LIVE.api.setOff(["calendar"]));
  for (const p of [M, S]) await switched(p, ["calendar"]);
  await S.click("[data-tpane=rota]");
  assert.equal(await S.locator("[data-roview]").count(), 0);
  assert.ok(await S.evaluate(() => !$("#rota").hidden && $("#cal").hidden && $("#cal").innerHTML === ""));
  assert.match(await text(S, "#rota"), /Need a day off\? Ask from the Me tab\./);
  assert.deepEqual([O.errs, M.errs, S.errs], [[], [], []]);
});
