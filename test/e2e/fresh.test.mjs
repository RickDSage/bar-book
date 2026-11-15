// Clear everything, on Info: anyone clears their own phone; the owner clears the team's data for everyone in the groups
// they tick, with their PIN and CLEAR typed, and the logins, lists and anything left unticked stay.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, OWNER_PIN, afterReload } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });
const people = [["M", "Mia Manager", "mia", "manager"], ["S", "Sam Staff", "sam", "staff"]];

const flat = (s) => s.replace(/\s+/g, " ").trim();
const text = async (p, sel) => flat(await p.$eval(sel, (e) => e.innerText));
const waitToast = (p, re) => p.waitForFunction((s) => new RegExp(s).test(document.querySelector("#toast").textContent), re.source);
// What each phone holds of the shift work, and of what stays.
const work = (p) => p.evaluate(() => ({ reports: LIVE.reports.length, shifts: LIVE.shifts.length, tasks: Object.keys(LIVE.tasks).length, out: LIVE.out.size,
  restock: LIVE.restock.length, issues: LIVE.issues.length, notices: LIVE.notices.length, concerns: LIVE.concerns.length, events: LIVE.events.filter((e) => e.kind !== "label").length }));

test("the owner ticks what goes, sees the counts, needs their PIN and CLEAR, and every phone has the clear", async () => {
  await resetEmulators();
  const { O, M, S } = await team(browser, site, people);
  const sam = await M.evaluate(() => LIVE.staff.find((p) => p.name === "Sam Staff").uid);
  const [d2, d7] = await M.evaluate(() => [addDays(shiftDay(), 2), addDays(shiftDay(), 7)]);
  // A night's shift work, plus what stays: the calendar, a game, a date label and an incident.
  await M.evaluate(async ([d, uid, d7]) => {
    const A = LIVE.api;
    await A.shiftsAdd([{ week: weekOf(d), day: d, start: "18:00", end: "02:00", side: "bar", note: "", who: uid, whoName: "Sam Staff", offer: "", offerName: "" }], true);
    await Promise.all([A.pin("Tasting at 4", "all", true), A.saveCal("", { title: "Half term", kind: "school", date1: d7, date2: d7, note: "" }),
      A.addFixture({ day: d, ko: "20:00", home: "Arsenal", away: "Chelsea", comp: "Premier League", channel: "Sky Sports Main Event", screen: "All screens" }),
      A.label(null, "added", { item: "Lime juice", side: "bar", life: 3, on: true })]);
  }, [d2, sam, d7]);
  await S.waitForFunction(() => LIVE.notices.length === 1 && LIVE.shifts.length === 1);
  await S.evaluate(async (d7) => {
    const A = LIVE.api;
    await Promise.all([A.setTask("close", 0, itemText("close", 0), "done"), A.set86("Limes", true), A.askRestock({ item: "Blue roll", qty: 1, unit: "each", dest: "up", detail: "" }),
      A.ask({ kind: "off", date1: d7, date2: d7, note: "Wedding" }), A.raise({ title: "Glass washer leaking", detail: "", area: "bar", urgent: false, again: null }),
      A.sendReport("bar", "Bar report", "Bar · test"), A.reportConcern({ reason: "cleaning", area: "toilets", note: "Sink blocked", to: "all", anon: false }, []),
      A.incident("Breakage or damage", "Glass washer door cracked"), A.gotIt(LIVE.notices[0])]);
  }, d7);
  await M.waitForFunction(() => LIVE.reports.length === 1 && LIVE.asks.length === 1 && LIVE.incidents.length === 1 && LIVE.concerns.length === 1);
  await M.evaluate(() => LIVE.api.review(LIVE.reports[0].id, "up", ""));
  for (const p of [M, S]) await p.waitForFunction(() => LIVE.out.size === 1 && LIVE.restock.length === 1 && LIVE.issues.length === 1 && Object.keys(LIVE.tasks).length === 1);
  const before = { reports: 1, shifts: 1, tasks: 1, out: 1, restock: 1, issues: 1, notices: 1, concerns: 1, events: 3 };
  assert.deepEqual(await work(S), before);

  // A private chat and someone's availability, which go with the chats and team records.
  await M.evaluate(async (uid) => { const A = LIVE.api, id = await A.newChat("dm", { other: uid }); await A.sendChat({ id, kind: "dm", members: [LIVE.uid, uid].sort() }, "Can you start at 5?"); }, sam);
  await S.evaluate(() => LIVE.api.saveAvail(["", "", "no", "", "", "", ""], ""));
  await S.waitForFunction(() => LIVE.chats.length === 1 && LIVE.pings.length === 1);

  // Everyone has Clear this phone at the bottom of Info; only the owner has Everyone's data.
  await M.evaluate(() => show("info"));
  assert.match(await text(M, "#v-info"), /CLEAR EVERYTHING THIS PHONE Clears everything the app keeps on this phone: .* Then it logs out\. Nobody else's phone changes\./);
  assert.equal(await text(M, "#fresh"), "", "managers don't get Everyone's data");
  await O.evaluate(() => show("info"));
  const box = await text(O, "#fresh");
  assert.match(box, /^EVERYONE'S DATA Clears the team's data for everyone, for a clean start\. It can't be undone/);
  assert.match(box, /ALWAYS KEPT Everyone's logins and PINs, the audit trail, the lists, .* FIRST, DOWNLOAD WHAT YOU WANT TO KEEP Everything in Activity The rota Photos and chats aren't in the spreadsheets/);
  assert.match(box, /TICK WHAT TO CLEAR Shift work The rota, .* Team records .* Chats .* Set-up .* Records the law may expect you to keep Incidents, Challenge 25 refusals/);
  // The legal records are off unless ticked.
  assert.deepEqual(await O.$$eval("[data-fr-group]", (x) => x.map((c) => [c.dataset.frGroup, c.checked])), [["work", true], ["team", true], ["chats", true], ["setup", true], ["records", false]]);

  // What it would clear, kind by kind, in what's ticked.
  await O.click("#fr-count");
  await O.waitForSelector("#fresh .frlist");
  assert.equal((await O.evaluate(() => LIVE.api.freshCounts(["work"]))).total, 15);
  assert.match(await text(O, "#fresh"), /Shifts on the rota: 1 Time off, swaps and running late: 1 Shift reports: 1 Reviews of reports: 1 Changes in the activity history: 3 Restocks: 1 On the 86 board: 1 86 log entries: 1 Issues: 1 Concerns: 1 Broadcasts: 1 Got it taps on broadcasts: 1 Checklist items: 1 Team records/);
  assert.match(await text(O, "#fresh"), /Calendar entries: 1 Games on the screens: 1 Availability: 1 .* Date labels: 1 Date label history: 1 .* Incidents: 1 IT WOULD CLEAR 20, AND EVERY CHAT Your PIN/);
  // Ticking the records adds the incident.
  await O.check('[data-fr-group="records"]');
  await O.waitForFunction(() => /IT WOULD CLEAR 21, AND EVERY CHAT/i.test($("#fresh").innerText));
  await O.uncheck('[data-fr-group="records"]');

  // The wrong PIN, or CLEAR not typed, clears nothing.
  await O.fill("#fr-pin", "999999"); await O.fill("#fr-words", "CLEAR"); await O.click("#fr-go");
  await O.waitForFunction(() => /That PIN isn't right\./.test($("#fresh").innerText));
  await O.fill("#fr-pin", OWNER_PIN); await O.fill("#fr-words", "clea"); await O.click("#fr-go");
  await O.waitForFunction(() => /Type CLEAR to show you mean it\./.test($("#fresh").innerText));
  assert.equal((await O.evaluate(() => LIVE.api.freshCounts())).total, 21, "nothing cleared yet");

  // With both, it's cleared for everyone: 20 counted, plus the chat, its message and the ping.
  await O.fill("#fr-pin", OWNER_PIN); await O.fill("#fr-words", "clear"); await O.click("#fr-go");
  await O.waitForFunction(() => /Done: 23 cleared for everyone\./.test($("#fresh").innerText), null, { timeout: 30000 });
  const none = { reports: 0, shifts: 0, tasks: 0, out: 0, restock: 0, issues: 0, notices: 0, concerns: 0, events: 0 };
  for (const p of [O, M, S]) await p.waitForFunction(() => !LIVE.reports.length && !LIVE.shifts.length && !Object.keys(LIVE.tasks).length && !LIVE.concerns.length);
  for (const p of [O, M, S]) assert.deepEqual(await work(p), none);
  assert.deepEqual(await M.evaluate(() => [LIVE.asks.length, LIVE.reviews.length, LIVE.outlog.length, LIVE.staff.length]), [0, 0, 0, 3]);
  for (const p of [O, S]) await p.waitForFunction(() => !LIVE.cal.length && !LIVE.fixtures.length && !LIVE.labels.length);
  await S.waitForFunction(() => !LIVE.chats.length && !LIVE.pings.length);
  // The legal records weren't ticked, so the incident stays; everything else ticked is gone.
  assert.equal(await M.evaluate(() => LIVE.incidents.length), 1);
  assert.deepEqual((await O.evaluate(() => LIVE.api.freshCounts())).counts.incidents, 1);
  assert.equal((await O.evaluate(() => LIVE.api.freshCounts())).total, 1);
  // The record, on the owner's phone, and the others are told.
  await waitToast(S, /^Olly Owner cleared the team's data$/);
  await O.waitForFunction(() => /Last cleared .* by Olly Owner, clearing 20\./.test($("#fresh").innerText));

  // The app carries on as normal: the same task again, and a new report.
  await S.evaluate(() => Promise.all([LIVE.api.setTask("close", 0, itemText("close", 0), "done"), LIVE.api.sendReport("bar", "Bar report", "Bar · after")]));
  await M.waitForFunction(() => LIVE.reports.length === 1 && Object.values(LIVE.tasks).some((t) => t.v === 1 && t.status === "done"));
  assert.deepEqual([O.errs, M.errs, S.errs], [[], [], []]);
});

test("anyone clears their own phone: what the app keeps on it goes, it logs out, and nobody else's phone changes", async () => {
  await resetEmulators();
  const { M, S } = await team(browser, site, people);
  await S.evaluate(() => { store.set("favs", ["Mojito"]); store.set("theme", "dark"); });
  await S.evaluate(() => show("info"));
  // CLEAR has to be typed.
  await S.fill("#cp-words", "cle"); await S.click("#cp-go");
  await waitToast(S, /^Type CLEAR to show you mean it$/);
  assert.equal(await S.evaluate(() => LIVE.uid !== null), true);
  await S.fill("#cp-words", "clear"); await S.click("#cp-go");
  await afterReload(S);
  assert.deepEqual(await S.evaluate(() => [localStorage.getItem("btbar.favs"), localStorage.getItem("btbar.theme")]), [null, null]);
  assert.equal(await M.evaluate(() => LIVE.uid !== null && LIVE.staff.length), 3, "the manager is still logged in");
  assert.deepEqual([M.errs, S.errs], [[], []]);
});
