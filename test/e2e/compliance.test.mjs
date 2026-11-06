// Safety and the law: who to call (Britain's lines, then the venue's own numbers), Challenge 25 and the refusals log,
// certificates with their dates, and the rota's warning when someone would get under 11 hours between shifts.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, part, ukDay } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });
const people = [["M", "Mia Manager", "mia", "manager"], ["S", "Sam Staff", "sam", "staff"]];
const flat = (s) => s.replace(/\s+/g, " ").trim();
const text = async (p, sel) => flat(await p.$eval(sel, (e) => e.innerText));
const waitToast = (p, re) => p.waitForFunction((s) => new RegExp(s).test(document.querySelector("#toast").textContent), re.source);
const forYou = (p) => p.$$eval("#foryou .fy", (x) => x.map((b) => `${b.innerText.replace(/\s*›$/, "").replace(/\s*\n+\s*/g, " | ")} > ${b.dataset.go}${b.classList.contains("hot") ? " (hot)" : ""}`));
const card = (p, k) => p.$eval(`#hub [data-tpane="${k}"]`, (b) => `${b.querySelector("b").textContent} | ${b.querySelector("small").textContent}${b.querySelector(".pc") ? ` (${b.querySelector(".pc").textContent}${b.classList.contains("hot") ? ", hot" : ""})` : ""}`);

test("who to call: Britain's lines for everyone, and the venue's own numbers, which managers keep", async () => {
  await resetEmulators();
  const { M, S } = await team(browser, site, people);
  await part(S, "call");
  assert.deepEqual(await S.$$eval("#call a.callrow", (x) => x.map((a) => `${a.getAttribute("href")} ${a.classList.contains("sos") ? "sos" : ""}`.trim())),
    ["tel:999 sos", "tel:101", "tel:111", "tel:105", "tel:0800111999", "tel:08003169800"]);
  assert.match(await text(S, "#call"), /^IN AN EMERGENCY Emergency Police, fire or ambulance: someone hurt or in danger, a fire, a crime happening now 999 Police, not an emergency .* Smell gas The gas emergency line, 24 hours 0800 111 999 Drains or sewage flooding Thames Water, 24 hours 0800 316 9800 OUR NUMBERS None yet\. A manager adds them\.$/);
  assert.equal(await S.$$eval("#call details", (x) => x.length), 0, "only managers add numbers");

  await part(M, "call");
  await M.click("#cl-form summary");
  await M.evaluate(() => renderCall());
  assert.equal(await M.$eval("#cl-form", (e) => e.open), true, "opened, it stays open when the page redraws");
  await M.click('[data-cl-eg="DPS"]');
  assert.equal(await M.inputValue('[data-cl="t"]'), "DPS");
  await M.fill('[data-cl="n"]', "Mia Manager");
  await M.fill('[data-cl="p"]', "call me");
  await M.click("#cl-add");
  await waitToast(M, /^Put in a phone number, digits and spaces only$/);
  await M.fill('[data-cl="p"]', "07700 900123");
  await M.click("#cl-add");
  await waitToast(M, /^Added$/);
  await S.waitForFunction(() => LIVE.contacts.length === 1);
  assert.match(await text(S, "#call"), /OUR NUMBERS DPS Mia Manager 07700 900123$/);
  assert.equal(await S.$eval("#call a.callrow:last-of-type", (a) => a.getAttribute("href")), "tel:07700900123");
  // The name is the venue's own words, so it's never translated.
  assert.equal(await S.$eval("#call a.callrow:last-of-type small", (e) => e.getAttribute("translate")), "no");

  // Removing one asks first, then it's gone for everyone.
  M.answer = undefined;
  await M.click('[data-cl-drop="0"]');
  await waitToast(M, /^Removed$/);
  await S.waitForFunction(() => LIVE.contacts.length === 0);
  assert.match(await text(S, "#call"), /None yet\. A manager adds them\.$/);
  assert.deepEqual([M.errs, S.errs], [[], []]);
});

test("refusals: Challenge 25 for everyone, logged in two taps, and a month's log for the licensing authority", async () => {
  await resetEmulators();
  const { O, M, S } = await team(browser, site, people);
  await part(S, "refusals");
  const card25 = await text(S, "#refusals .c25");
  assert.equal(card25, "Anyone who looks under 25 shows ID before they're served. Photo ID with a date of birth and a hologram or UV mark: a passport, a photo driving licence, a PASS card or UK Armed Forces ID. Digital ID only from a certified app, checked by scanning its code, and only if the venue takes it. Never a photo or a screenshot of ID. Not sure? Say no, politely, and log it here. Don't serve anyone who's drunk, or buying for someone under 18.");
  await S.click("#rf-go");
  await waitToast(S, /^Pick why first$/);
  await S.click('[data-rf-why="noid"]');
  await S.fill('[data-rf="what"]', "2 pints of lager");
  await S.fill('[data-rf="note"]', "Looked about 17");
  const told = waitToast(M, /^Sam Staff refused someone: no ID$/);
  await S.click("#rf-go");
  await waitToast(S, /^Logged$/);
  await told;
  await S.waitForFunction(() => LIVE.refusals.length === 1 && !LIVE.refusals[0].pending);
  const x = await S.evaluate(() => LIVE.refusals[0]);
  assert.deepEqual([x.reason, x.what, x.note, x.name, x.day], ["noid", "2 pints of lager", "Looked about 17", "Sam Staff", await S.evaluate(() => shiftDay())]);
  assert.match(await text(S, "#refusals"), /TONIGHT \(1\) \d\d:\d\d · No ID · 2 pints of lager Looked about 17 Sam Staff$/);
  assert.doesNotMatch(await text(S, "#refusals"), /The log/, "staff see tonight's, not the log");
  await part(S, "");
  assert.equal(await card(S, "refusals"), "Refusals | Tonight: 1");

  // Managers: the log by month, ready to send or print.
  await part(M, "refusals");
  assert.match(await text(M, "#refusals"), /THE LOG Every refusal from the last 100 days, ready for the licensing authority or the police\. .* \w{3} \d{1,2} \w{3} \d\d:\d\d · No ID · 2 pints of lager Looked about 17 Sam Staff Send or print this month$/);
  const title = await M.evaluate(() => `Refusals log · Black Tap Soho · ${monthName(monthOf(shiftDay()))}`);
  const msg = await M.evaluate(() => shareText("refusals", false));
  assert.match(msg, new RegExp(`^${title}\\n1 refusal: 1 no ID\\n\\nEach refusal \\(1\\)\\n• \\w{3} \\d{1,2} \\w{3} \\d\\d:\\d\\d, no ID: 2 pints of lager\\. Looked about 17 \\(Sam Staff\\)$`));
  await M.click("#refusals [data-send=refusals]");
  assert.deepEqual(await M.$$eval("#send [data-send-opt]", (x) => x.length), 3, "this month and the two before");

  // In Polish: the card, the reasons and the examples, while what was typed stays as it was.
  await S.evaluate(() => setLang("pl"));
  await part(S, "refusals");
  assert.equal(await S.$eval("#placebar .t", (e) => e.textContent), "Odmowy sprzedaży");
  assert.match(await text(S, "#refusals .c25"), /^Każdy, kto wygląda na mniej niż 25 lat, pokazuje dokument, zanim zostanie obsłużony\. /);
  assert.equal(await S.getAttribute('[data-rf="what"]', "placeholder"), "2 pinty lagera");
  assert.match(await text(S, "#refusals"), /DZIŚ WIECZOREM \(1\) \d\d:\d\d · Brak dokumentu · 2 pints of lager Looked about 17 Sam Staff$/);
  await S.evaluate(() => setLang(""));

  // Only the owner can delete one, for a test: the log is the venue's record.
  await part(O, "refusals");
  await O.click(`[data-rf-drop="${x.id}"]`);
  await waitToast(O, /^Deleted$/);
  await S.waitForFunction(() => LIVE.refusals.length === 0);
  assert.equal(await M.$$eval("[data-rf-drop]", (b) => b.length), 0);
  assert.deepEqual([O.errs, M.errs, S.errs], [[], [], []]);
});

test("certificates: managers keep the dates, staff see their own, what's due shows under For you, right to work dates stay in the app", async () => {
  await resetEmulators();
  const { M, S } = await team(browser, site, people);
  const sam = await M.evaluate(() => LIVE.staff.find((p) => p.name === "Sam Staff").uid);
  await part(M, "certs");
  assert.match(await text(M, "#certs"), /None yet for Mia Manager, Olly Owner, Sam Staff\./);
  const add = async (kind, f) => {
    if (!(await M.$eval("#ct-box", (e) => e.open))) await M.click("#ct-box summary");
    await M.selectOption('[data-ct="who"]', sam);
    await M.click(`[data-ct-kind="${kind}"]`);
    for (const [k, v] of Object.entries(f)) await M.fill(`[data-ct="${k}"]`, v);
    const n = await M.evaluate(() => { $("#toast").textContent = ""; return LIVE.certs.length; });
    await M.click("#ct-save");
    await waitToast(M, /^Added$/);
    await M.waitForFunction((n) => LIVE.certs.length === n + 1, n);
  };
  await M.click("#ct-box summary");
  await M.evaluate(() => renderCerts());
  assert.equal(await M.$eval("#ct-box", (e) => e.open), true, "opened, it stays open when the page redraws");
  // First aid at work lasts three years, so the end is worked out from the day it was taken.
  await add("faw", { done: "2026-01-10" });
  await add("food", { done: "2023-10-01", ends: "2026-10-01" });
  const rtw = ukDay(Date.now() + 20 * 864e5);
  assert.equal(await M.$eval("#ct-box", (e) => e.open), true, "the form stays open for the next one");
  await M.selectOption('[data-ct="who"]', sam);
  await M.click('[data-ct-kind="rtw"]');
  assert.equal(await M.$$eval('[data-ct="done"]', (x) => x.length), 0, "right to work has only the day it ends");
  await M.click("#ct-save");
  await waitToast(M, /^Put in the day their permission to work ends$/);
  await M.fill('[data-ct="ends"]', rtw);
  await M.evaluate(() => ($("#toast").textContent = ""));
  await M.click("#ct-save");
  await waitToast(M, /^Added$/);
  await M.waitForFunction(() => LIVE.certs.length === 3 && LIVE.certs.every((c) => !c.pending));
  assert.equal(await M.evaluate(() => LIVE.certs.find((c) => c.kind === "faw").ends), "2029-01-10");
  const rtwLong = await M.evaluate((d) => longDate(d), rtw);

  // Managers: what's due first, on For you and the card, hot once something has run out.
  assert.match(await text(M, "#certs"), new RegExp(`DUE \\(2\\) Sam Staff: Food hygiene Ran out 1 Oct 2026 .* Sam Staff: Right to work Permission to work ends ${rtwLong}: check their right to work again before then`));
  await part(M, "");
  assert.deepEqual((await forYou(M)).filter((t) => /certificate/.test(t)), ["2 certificates due | Sam Staff: Food hygiene, Sam Staff: Right to work > certs (hot)"]);
  assert.equal(await card(M, "certs"), "Certificates | Due in the next 30 days: 2 (2, hot)");

  // Staff see their own, without what managers have to do.
  await S.waitForFunction(() => LIVE.certs.length === 3);
  await part(S, "certs");
  assert.equal(await text(S, "#certs"), `MY CERTIFICATES Your manager keeps these. Tell them when you do a course or get a new licence. First aid at work Runs out 10 Jan 2029 Food hygiene Ran out 1 Oct 2026 Right to work Permission to work ends ${rtwLong}`);
  await part(S, "");
  assert.equal(await card(S, "certs"), "My certificates | Licences and training, kept by your manager");

  // To send: what's due, with everyone's to tick, and never the right to work dates.
  const msg = await M.evaluate(() => shareText("certs", false));
  assert.equal(msg, "Certificates · Black Tap Soho\n1 certificate due in the next 30 days or overdue\n\nDue (1)\n• Sam Staff: Food hygiene, ran out 1 Oct 2026");
  const all = await M.evaluate(() => { const m = SHARE.certs(); return msgText(m, new Set(["due", "all"]), "", false); });
  assert.match(all, /Everyone's \(2\)\n• Sam Staff: First aid at work, runs out 10 Jan 2029\n• Sam Staff: Food hygiene, ran out 1 Oct 2026$/);
  assert.doesNotMatch(all, /Right to work|Permission/);

  // Change one, then remove it.
  await part(M, "certs");
  const faw = await M.evaluate(() => LIVE.certs.find((c) => c.kind === "faw").id);
  await M.click(`[data-ct-edit="${faw}"]`);
  assert.equal(await M.inputValue('[data-ct="done"]'), "2026-01-10");
  await M.fill('[data-ct="note"]', "St John Ambulance course");
  await M.click("#ct-save");
  await waitToast(M, /^Saved$/);
  await S.waitForFunction(() => LIVE.certs.find((c) => c.kind === "faw")?.note === "St John Ambulance course");
  await M.click(`[data-ct-drop="${faw}"]`);
  await waitToast(M, /^Removed$/);
  await S.waitForFunction(() => LIVE.certs.length === 2);
  assert.deepEqual([M.errs, S.errs], [[], []]);
});

test("the rota warns when someone would get under 11 hours off between shifts, or a day has no licence holder or first aider on", async () => {
  await resetEmulators();
  const { M } = await team(browser, site, people.slice(0, 1));
  const out = await M.evaluate(() => {
    const keep = LIVE.shifts;
    LIVE.shifts = [{ id: "a", who: "u1", day: "2026-11-20", start: "18:00", end: "02:00" }];
    const r = [["2026-11-21", "11:00", "17:00"], ["2026-11-21", "13:00", "19:00"], ["2026-11-20", "08:00", "12:00"], ["2026-11-19", "10:00", "16:00"]]
      .map(([day, start, end]) => roClash("u1", { day, start, end }, ""));
    LIVE.shifts = keep;
    return r;
  });
  assert.deepEqual(out, [
    "would have only 9 h off after Fri 20 Nov 18:00–02:00 (the law gives adults 11 h between shifts)",
    "",
    "would have only 6 h off before Fri 20 Nov 18:00–02:00 (the law gives adults 11 h between shifts)",
    "",
  ]);
  // Managers who keep certificates see a day with nobody on holding a personal licence, or first aid in date.
  const cover = await M.evaluate(() => {
    const keep = LIVE.certs, xs = [{ day: "2026-11-20", who: "u1" }, { day: "2026-11-21", who: "u2" }, { day: "2026-11-22", who: "" }, { day: "2026-11-23", who: "u1" }];
    const days = ["2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23"];
    LIVE.certs = [];
    const none = days.map((d) => roCover(d, xs));
    LIVE.certs = [{ who: "u1", kind: "plic", ends: "" }, { who: "u1", kind: "faw", ends: "2026-11-20" }, { who: "u2", kind: "efaw", ends: "2027-01-01" }];
    const some = days.map((d) => roCover(d, xs));
    LIVE.certs = keep;
    return [none, some];
  });
  assert.deepEqual(cover, [["", "", "", ""], ["", "No personal licence holder on", "", "No first aider on"]]);
  assert.deepEqual(M.errs, []);
});
