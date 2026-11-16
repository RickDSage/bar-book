// My pay: worked out on this phone only. live.js is blocked, so this is the site without a Firebase config.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, launch } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });

async function open({ start = "#w-ok", at, width = 390, recent } = {}) {
  const c = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, timezoneId: "Europe/London", colorScheme: "dark" });
  await c.route("**/live.js", (r) => r.abort());
  const p = await c.newPage();
  p.errs = [];
  p.on("pageerror", (e) => p.errs.push(e.message));
  if (at) await p.clock.setFixedTime(new Date(at));
  if (recent) await p.addInitScript((r) => localStorage.setItem("btbar.recent", r), recent);
  await p.goto(site.url);
  await p.click(start);
  return p;
}

const flat = (s) => s.replace(/\s+/g, " ").trim();

test("my pay: its own tab, September from Nory's figures to the penny, tronc on and off, any tax code", async () => {
  const p = await open({ at: "2026-09-20T12:00:00Z" });
  await p.click("[data-tab=pay]");
  const out = async () => flat(await p.$eval("#pay-out", (e) => e.innerText)), sum = async () => flat(await p.$eval("#pay-sum", (e) => e.innerText));
  assert.equal(await p.$eval("#pay-h", (e) => e.textContent), "September 2026");
  assert.match(await sum(), /pay day Friday 25 September/);
  assert.equal(await p.locator("#v-info #pay-h").count(), 0, "not in Bar info any more");
  assert.equal(await p.locator('[data-pay="tronc"], [data-pay-tronc], [data-pay="rota"]').count(), 0, "tronc is a fixed £5, and no rota hours box");
  await p.click("#pay-setup summary"); await p.fill('[data-pay="code"]', "992L");
  // Nory's hours this month, August's hours typed in for tronc at £5 each.
  await p.click("[data-imp-open]"); await p.click("#imp details:last-of-type summary");
  await p.fill('[data-nory="h"]', "246.39"); await p.fill('[data-pay-th="2026-08"]', "82");
  assert.match(await out(), /Hours pay \(246\.4 h at £12\.71\) £3,131\.62 Tronc \(82 h at £5\) £410\.00 Gross £3,541\.62 Income tax −£542\.80 National Insurance −£166\.69 Take-home £2,832\.13/);
  assert.match(await sum(), /^246\.4 Hours £3,541\.62 Gross £2,832\.13 Take-home From Nory's figures: an estimate/);
  assert.equal(await p.$eval("#pay-set", (e) => e.textContent), "£12.71 an hour · 992L");
  // Tronc off: tax follows.
  await p.uncheck('[data-pay-check="trOn"]');
  assert.doesNotMatch(await out(), /Tronc/);
  assert.match(await out(), /Gross £3,131\.62 Income tax −£460\.80 National Insurance −£166\.69 Take-home £2,504\.13/);
  // Nory's gross wage, two weeks added up, stands in for hours times the rate.
  await p.fill('[data-nory="g"]', "1000 + 545.95");
  assert.match(await out(), /Base pay from Nory \(246\.4 h\) £1,545\.95 Gross £1,545\.95 Income tax −£143\.60 National Insurance −£39\.84 Take-home £1,362\.51/);
  // Scotland: 19% on the first £330.58 of £497 taxable, 20% on the rest.
  await p.click('[data-pay-code="S1257L"]');
  assert.equal(await p.inputValue('[data-pay="code"]'), "S1257L");
  assert.match(await out(), /Income tax −£96\.09/);
  await p.click('[data-pay-code="BR"]'); assert.match(await out(), /Income tax −£309\.00/);
  await p.fill('[data-pay="code"]', "K100"); assert.match(await out(), /Check the tax code/);
  await p.reload(); await p.click("#w-ok").catch(() => {}); await p.click("[data-tab=pay]"); await p.click("[data-imp-open]");
  assert.equal(await p.inputValue('[data-nory="g"]'), "1000 + 545.95", "kept on this phone");
  assert.equal(await p.$eval('[data-pay-check="trOn"]', (e) => e.checked), false);
  assert.deepEqual(p.errs, []);
});

test("my hours: several shifts at once, planned ones, a month at a time, with a student loan, pension, deductions and bills", async () => {
  const p = await open({ at: "2026-11-20T12:00:00Z" });
  await p.click("[data-tab=pay]");
  const txt = async (sel) => flat(await p.$eval(sel, (e) => e.innerText));
  const toastIs = (t) => p.waitForFunction((x) => document.querySelector("#toast").textContent === x, t);
  const add = async (days, start, end, brk) => {
    if (!(await p.$("#hf"))) await p.click("[data-hf-open]");
    for (const d of days) await p.click(`[data-hf-day="${d}"]`);
    await p.fill('[data-hf="start"]', start); await p.fill('[data-hf="end"]', end);
    await p.click(`[data-hf-brk="${brk}"]`); await p.click("[data-hf-save]");
  };
  assert.match(await txt("#v-pay"), /No shifts logged this month\./);
  // Three days with the same times in one go; the form stays open with the times kept.
  await add(["2026-11-03", "2026-11-10", "2026-11-12"], "17:00", "23:00", 30); await toastIs("Saved 3 shifts, 16.5 h");
  assert.equal(await p.inputValue('[data-hf="start"]'), "17:00");
  assert.equal(await p.$$eval('[data-hf-day][aria-pressed="true"]', (x) => x.length), 0, "the days are cleared");
  assert.equal(await p.$$eval("[data-hf-day].has", (x) => x.length), 3, "logged days are marked");
  // One that overlaps is left out and named; the others still save.
  await add(["2026-11-12", "2026-11-13"], "22:00", "02:00", 0); await toastIs("Saved 4 h on Fri 13 Nov. Thu 12 Nov already has a shift then");
  await add([], "12:00", "18:00", 0); await toastIs("Tap the days you worked");
  await add(["2026-11-19"], "10:00", "10:30", 45); await toastIs("That comes to no hours. Check the times and the break");
  await p.click('[data-hf-day="2026-11-19"]');
  // A day still to come is a planned shift, counted in the month's estimate.
  await add(["2026-11-25"], "17:00", "23:00", 30); await toastIs("Saved 5.5 h on Wed 25 Nov");
  assert.deepEqual(await p.$$eval("[data-hf-times]", (x) => x.map((b) => b.textContent)), ["17:00–23:00", "22:00–02:00"]);
  await p.click("[data-hf-cancel]");
  assert.match(await txt("#pay-sum"), /^26 Hours .* 5 shifts, including 5\.5 h still to work/);
  assert.match(await txt("#v-pay"), /WEEK OF 23 NOV · 5\.5 H Wednesday 25 Nov 17:00–23:00 Planned · 5\.5 h after a 30 min break/);

  // October, from the arrow: one shift that runs past midnight. Next month is as far forward as it goes.
  await p.click('[data-pm="1"]'); assert.equal(await p.$eval('[data-pm="1"]', (b) => b.disabled), true); await p.click('[data-pm="-1"]');
  await p.click('[data-pm="-1"]');
  assert.equal(await p.$eval("#pay-h", (e) => e.textContent), "October 2026");
  await add(["2026-10-31"], "18:00", "03:00", 30); await toastIs("Saved 8.5 h on Sat 31 Oct");
  await p.click("[data-hf-cancel]"); await p.click('[data-pm="1"]');
  assert.match(await txt("#v-pay"), /Hours the month before 8\.5 h, logged/);
  assert.equal(await p.locator("[data-pay-th]").count(), 0, "the log replaces typed hours");

  // Nory's 167 hours stand in for November's log; tronc is £5 on October's 8.5 h.
  await p.click("[data-imp-open]"); await p.click("#imp details:last-of-type summary");
  await p.fill('[data-nory="h"]', "167");
  assert.match(await txt("#pay-sum"), /From Nory's figures, not the shifts logged: an estimate/);
  const out = () => txt("#pay-out");
  assert.match(await out(), /Hours pay \(167 h at £12\.71\) £2,122\.57 Tronc \(8\.5 h at £5\) £42\.50 Gross £2,165\.07 Income tax −£223\.20 National Insurance −£85\.97 Take-home £1,855\.90/);
  // Plan 5 takes 9% over £2,083.33 a month (£3.53, so £3) and a postgraduate loan 6% over £1,750 (£22.35, so £22).
  await p.click("#pay-setup summary");
  await p.click('[data-pay-loan="5"]'); await p.check('[data-pay-check="pgl"]');
  assert.match(await out(), /Student loan \(Plan 5 and postgraduate\) −£25\.00 Take-home £1,830\.90/);
  // 5% of the hours pay over £520 is £80.13, and tax relief pays a fifth: £64.10. The settings stay open.
  await p.check('[data-pay-check="pen"]');
  assert.equal(await p.$eval("#pay-setup", (d) => d.open), true);
  assert.equal(await p.inputValue('[data-pay="pension"]'), "5");
  assert.match(await out(), /Pension \(5%\) −£64\.10 Take-home £1,766\.80/);
  await p.fill('[data-money-name="ded"]', "Staff food"); await p.fill('[data-money-amt="ded"]', "20"); await p.click('[data-money-add="ded"]');
  assert.match(await out(), /Staff food −£20\.00 Take-home £1,746\.80/);
  assert.equal(await p.$eval("#pay-set", (e) => e.textContent), "£12.71 an hour · 1257L · Plan 5 · postgraduate loan · 5% pension · 1 other deduction");
  await p.fill('[data-pay="rate"]', "11");
  assert.match(await txt("#pay-rights"), /£11\.00 an hour is under £12\.71, the legal minimum for your age\. Tronc and tips can't count towards it\./);
  assert.match(await txt("#pay-sum"), /1 thing to check in Your rights/);
  await p.click('[data-pay-age="18"]');
  assert.doesNotMatch(await txt("#pay-rights"), /legal minimum/, "£10.85 at 18 to 20");
  await p.click('[data-pay-age="21"]'); await p.fill('[data-pay="rate"]', "12.71");
  assert.doesNotMatch(await txt("#pay-rights"), /legal minimum/);
  // Bills: what's left, a week at a time until the next pay day on 25 Dec, 4 weeks after 27 Nov.
  await p.click("[data-sec=bills] summary"); await p.click('[data-money-chip="bills:Rent"]'); await p.fill('[data-money-amt="bills"]', "650"); await p.click('[data-money-add="bills"]');
  assert.match(await txt("#pay-bills"), /Take-home £1,746\.80 Bills −£650\.00 Left over £1,096\.80 About £274\.20 a week until the next pay day, in 4 weeks\./);
  assert.match(await txt("#pay-sum"), /Left after bills: £1,096\.80/);
  await p.fill('[data-money-name="bills"]', "Car"); await p.fill('[data-money-amt="bills"]', "1200"); await p.click('[data-money-add="bills"]');
  assert.match(await txt("#pay-bills"), /Left over −£103\.20 Your bills come to £103\.20 more than this month's take-home\./);
  await p.click(`[data-money-del="bills:${await p.evaluate(() => pay.bills[1].id)}"]`);

  // Everything stays on this phone.
  p.once("dialog", (d) => d.accept());
  await p.click(`[data-hr-del="${await p.evaluate(() => hoursLog.find((x) => x.day === "2026-11-13").id)}"]`);
  await p.fill('[data-nory="h"]', "");
  await p.reload(); await p.click("#w-ok").catch(() => {}); await p.click("[data-tab=pay]");
  assert.match(await txt("#pay-sum"), /^22 Hours .* 4 shifts/);
  assert.equal(await p.$eval('[data-pay-loan="5"]', (b) => b.getAttribute("aria-pressed")), "true");
  assert.equal(await p.evaluate(() => pay.bills.map((b) => `${b.name} ${b.amt}`).join()), "Rent 650.00");
  assert.equal(await p.evaluate(() => shareText("hours", false)), "My hours for November\nIn all: 22 h from 4 shifts\n\nShifts (4)\n• Tue 3 Nov 17:00–23:00, 30 min break: 5.5 h\n• Tue 10 Nov 17:00–23:00, 30 min break: 5.5 h\n• Thu 12 Nov 17:00–23:00, 30 min break: 5.5 h\n• Wed 25 Nov 17:00–23:00, 30 min break: 5.5 h");
  await p.setViewportSize({ width: 320, height: 700 });
  await p.click("[data-hf-open]");
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), 320, "nothing wider than a small phone");
  assert.deepEqual(p.errs, []);
});

test("my pay: about how many hours a week, for a month with nothing logged", async () => {
  const p = await open({ at: "2026-11-20T12:00:00Z" });
  await p.click("[data-tab=pay]");
  const txt = async (sel) => flat(await p.$eval(sel, (e) => e.innerText));
  assert.deepEqual(await p.$$eval("[data-pay-wk]", (x) => x.map((b) => b.textContent)), ["Off", "20 h", "25 h", "30 h", "35 h", "40 h", "45 h", "50 h", "55 h", "60 h", "65 h", "70 h"]);
  await p.click("[data-sec=quick] summary"); await p.click('[data-pay-wk="40"]');
  // 40 h a week over November's 30 days is 171.43 h; October's 31 days, 177.14 h, for tronc.
  assert.match(await txt("#pay-sum"), /^171\.4 Hours .* From about 40 h a week: an estimate/);
  assert.match(await txt("#v-pay"), /Hours the month before 177\.1 h, about 40 h a week/);
  assert.match(await txt("#pay-out"), /Hours pay \(171\.4 h at £12\.71\) £2,178\.88 Tronc \(177\.1 h at £5\) £885\.70/);
  await p.click('[data-pay-wk="0"]');
  assert.match(await txt("#pay-sum"), /^0 Hours £0\.00 Gross/);
  assert.deepEqual(p.errs, []);
});

test("my pay: Nory's text fills everything in at once, with breaks to match its hours, the rate, and an undo", async () => {
  const p = await open({ at: "2026-11-03T12:00:00Z" });
  await p.click("[data-tab=pay]");
  await p.click('[data-pm="-1"]'); await p.click("#pay-setup summary"); await p.fill('[data-pay="rate"]', "11"); await p.click('[data-pm="1"]');
  await p.click("[data-imp-open]");
  // What the reader gets from a Nory Schedule screenshot: the rota's times, then the ticked clock-in times.
  const nory = `07:13\n=] 26 Oct - 01 Nov\n5 £386.60 30.42\nShifts Gross wage Hours\nTuesday 27 Oct 17:15 - 22:30\nSoho - Server v 17:15 - 22:30\nWednesday 28 Oct 16:00 - 21:00\nWestfield - Server v 16:00 - 21:30\nThursday 29 Oct 13:00 - 00:00\nSoho - Server v 13:04 - 22:40\nFriday 30 Oct 12:00 - 21:00\nSoho - Server v 12:11 - 18:15\nSaturday 31 Oct 11:00 - 17:00\nSoho - Server v 11:00 - 17:00\nSchedule`;
  await p.click("#imp details summary"); await p.fill("[data-imp-text]", nory); await p.click("[data-imp-read]");
  await p.waitForFunction(() => document.querySelector("#toast").textContent === "Saved 5 shifts, 30.42 h");
  // Clocked times win; 32.42 h clocked against Nory's 30.42 h is 24 min of break a shift.
  assert.equal(await p.$eval("#pay-h", (e) => e.textContent), "October 2026", "goes to the month imported");
  // Nory's 30.42 h is rounded: the clocked minutes less breaks come to 1,825, which is 30.417 h.
  assert.deepEqual(await p.evaluate(() => hoursLog.map((x) => `${x.day} ${x.start}-${x.end} ${x.brk}`)),
    ["2026-10-27 17:15-22:30 24", "2026-10-28 16:00-21:30 24", "2026-10-29 13:04-22:40 24", "2026-10-30 12:11-18:15 24", "2026-10-31 11:00-17:00 24"]);
  const imp = flat(await p.$eval("#imp", (e) => e.innerText));
  assert.match(imp, /Saved 5 shifts, 30\.42 h Breaks of 24 min each so the week matches Nory's 30\.4 h Hourly rate set to £12\.71 from Nory/);
  assert.equal(await p.evaluate(() => pay.rate), "12.71");
  assert.match(flat(await p.$eval("#pay-sum", (e) => e.innerText)), /^30\.4 Hours £386\.60 Gross .* 5 shifts$/);
  // Undo takes them all back out; the same week again isn't added twice.
  await p.click("[data-imp-undo]");
  assert.equal(await p.evaluate(() => hoursLog.length), 0);
  await p.click("#imp details summary"); await p.fill("[data-imp-text]", nory); await p.click("[data-imp-read]");
  await p.waitForFunction(() => document.querySelector("#toast").textContent === "Saved 5 shifts, 30.42 h");
  await p.click("[data-imp-cancel]"); await p.click("[data-imp-open]"); await p.click("#imp details summary"); await p.fill("[data-imp-text]", nory); await p.click("[data-imp-read]");
  await p.waitForFunction(() => document.querySelector("#toast").textContent === "Those shifts are already logged");
  // Nothing found says so, and the text stays to fix.
  await p.click("[data-imp-cancel]"); await p.click("[data-imp-open]"); await p.click("#imp details summary");
  await p.fill("[data-imp-text]", "nothing here"); await p.click("[data-imp-read]");
  assert.match(await p.textContent("#imp-st"), /No days with times found/);
  assert.equal(await p.inputValue("[data-imp-text]"), "nothing here");
  assert.deepEqual(p.errs, []);
});

// An October payslip laid out the way payroll often prints it: payments on the left, deductions on the right.
const SLIP = `BLACK TAP SOHO LTD
Pay Date 30/10/2026   Tax Code 1257L   Period 7
Payments Units Rate Amount   Deductions Amount
Basic Pay 120.00 12.71 1,525.20   PAYE Tax 203.00
Holiday Pay 7.00 12.71 88.97   National Insurance 45.29
Tronc 450.00   Pension 43.77
Employer Pension 32.83
Gross Pay 2,064.17   Net Pay 1,772.11
Taxable Pay YTD 12,000.00   Tax Paid YTD 1,450.00`;

test("my pay: a payslip read line by line, checked against the estimate, teaching it, and kept for the tax year", async () => {
  const p = await open({ at: "2026-11-16T12:00:00Z" });
  await p.click("[data-tab=pay]");
  const txt = async (sel) => flat(await p.$eval(sel, (e) => e.innerText));
  await p.click("[data-slip-open]"); await p.click("#slip details summary");
  await p.fill("[data-slip-text]", SLIP); await p.click("[data-slip-read]");
  // The pay date says October, so it's saved straight away and October is shown with it.
  assert.equal(await p.$eval("#pay-h", (e) => e.textContent), "October 2026");
  assert.match(await txt("#pay-sum"), /^120 Hours £2,064\.17 Gross £1,772\.11 Take-home From your payslip · pay day Friday 30 October/);
  assert.match(await txt("#v-pay"), /Updated from your payslip: Pension on, 90 h in September, from the tronc\./);
  assert.equal(await p.evaluate(() => pay.pension), "5", "5% worked out from £43.77");
  const card = await txt(".slipcard");
  assert.match(card, /October 2026 · paid Fri 30 Oct · 1257L £1,772\.11/);
  assert.match(card, /Basic Pay \(120 h at £12\.71\) £1,525\.20 PAYE Tax −£203\.00 Holiday Pay \(7 h at £12\.71\) £88\.97 National Insurance −£45\.29 Tronc £450\.00 Pension −£43\.77 Take-home £1,772\.11/);
  assert.doesNotMatch(card, /Employer/, "the employer's pension isn't taken from pay");
  assert.match(card, /Tax year to date, on this payslip Taxable pay £12,000\.00 Income tax £1,450\.00/i);
  // The estimate, worked out from the payslip's own hours, comes to the same.
  assert.match(card, /Gross £2,064\.17 \(app £2,064\.17\) Income tax £203\.00 \(app £203\.00\)/);
  assert.match(card, /Take-home £1,772\.11 \(app £1,772\.11\) Matches the estimate to the pound\./);
  // The tax year: tax paid so far against what's due on £12,000 by month 7 with 1257L.
  await p.click('[data-pay-view="year"]');
  assert.match(await txt("#pay-view"), /Tax year 2026 to 2027 October payslip £1,772\.11 November estimate £600\.00/i);
  // So far: the payslip's £12,000 and £1,450 tax to date, then November's £600 of tronc on top.
  assert.match(await txt("#pay-view"), /So far By April Gross £12,600\.00 .* Income tax £1,450\.00 /);
  assert.match(await txt("#pay-view"), /So far starts from the year-to-date figures on your October payslip\./);
  assert.match(await txt("#pay-view"), /Your October payslip shows £1,450\.00 tax paid this tax year on £12,000\.00\. About £932\.40 is due on that by now\. That's about £517\.60 too much\./);
  // Payslips: each one, opened to its lines, and removed.
  await p.click('[data-pay-view="slips"]');
  assert.match(await txt("#pay-view"), /October 2026/);
  await p.click('[data-pm="1"]');
  assert.match(await txt("#pay-sum"), /An estimate/, "November has no payslip");
  assert.equal(await p.evaluate(() => Object.keys(pay.slips).join()), "2026-10");
  // A payslip with no date asks which month it's for.
  await p.click("[data-slip-open]"); await p.click("#slip details summary");
  await p.fill("[data-slip-text]", "Basic Pay 10.00 12.71 127.10\nNet Pay 127.10"); await p.click("[data-slip-read]");
  assert.match(await txt("#slip"), /Which month is this payslip for\?/);
  await p.selectOption("[data-slip-m]", "2026-09"); await p.click("[data-slip-save]");
  assert.equal(await p.$eval("#pay-h", (e) => e.textContent), "September 2026");
  assert.equal(await p.evaluate(() => Object.keys(pay.slips).sort().join()), "2026-09,2026-10");
  // Nothing that looks like pay says so.
  await p.click("[data-slip-open]"); await p.click("#slip details summary");
  await p.fill("[data-slip-text]", "hello"); await p.click("[data-slip-read]");
  assert.match(await txt("#slip"), /\w/);
  assert.deepEqual(p.errs, []);
});

test("my pay: holiday builds up from the hours worked, and booking it shows what it's worth and adds it to that pay", async () => {
  const p = await open({ at: "2026-11-16T12:00:00Z" });
  await p.click("[data-tab=pay]");
  const txt = async (sel) => flat(await p.$eval(sel, (e) => e.innerText));
  await p.click("[data-hf-open]");
  for (const d of ["2026-11-02", "2026-11-03", "2026-11-05", "2026-11-06", "2026-11-09", "2026-11-10", "2026-11-12", "2026-11-13"]) await p.click(`[data-hf-day="${d}"]`);
  await p.fill('[data-hf="start"]', "16:00"); await p.fill('[data-hf="end"]', "23:30"); await p.click('[data-hf-brk="30"]'); await p.click("[data-hf-save]");
  await p.click("[data-hf-cancel]");
  // 56 h worked: 12.07% is 6.76 h, so 7 h to the nearest hour.
  assert.match(await txt("#pay-hol"), /^7 Built up 0 Taken or booked 7 h Left Worth about £88\.97 at £12\.71 an hour/);
  await p.click("[data-hol-book]");
  await p.click('[data-hf-day="2026-11-23"]'); await p.click('[data-hf-day="2026-11-24"]');
  assert.equal(await p.textContent("#hf-worth"), "14 h of holiday is worth £177.94 before tax, paid with that month's pay.");
  await p.fill('[data-hf="h"]', "3.5");
  assert.equal(await p.textContent("#hf-worth"), "7 h of holiday is worth £88.97 before tax, paid with that month's pay.");
  await p.click("[data-hf-save]");
  await p.waitForFunction(() => document.querySelector("#toast").textContent === "Booked 7 h of holiday, worth £88.97");
  assert.match(await txt("#pay-hol"), /^7 Built up 7 Taken or booked 0 h Left/);
  assert.match(await txt("#pay-out"), /Holiday pay \(7 h\) £88\.97/);
  assert.match(await txt("#pay-sum"), /8 shifts · 7 h holiday/);
  // Rolled-up holiday pay: 12.07% on top of every hour's pay, and nothing to book.
  await p.click("[data-hf-cancel]"); await p.click("#pay-setup summary"); await p.click('[data-pay-hol="rolled"]');
  assert.match(await txt("#pay-out"), /Hours pay \(56 h at £12\.71\) £711\.76 Rolled-up holiday pay \(12\.07%\) £85\.91/);
  assert.equal(await p.locator("[data-hol-book]").count(), 0);
  // The days, the weeks.
  await p.click('[data-pay-view="weeks"]');
  assert.match(await txt("#pay-view"), /Week of 2 Nov · 28 h/);
  await p.click('[data-pay-view="days"]');
  assert.match(await txt("#pay-view"), /Mon 2 Nov · 7 h/);
  assert.deepEqual(p.errs, []);
});

test("my pay: your rights, with the shifts logged checked for breaks, rest and hours", async () => {
  const p = await open({ at: "2026-11-16T12:00:00Z" });
  await p.click("[data-tab=pay]");
  const txt = async (sel) => flat(await p.$eval(sel, (e) => e.innerText));
  assert.match(await txt("#pay-rights"), /Nothing to flag in November's logged shifts/);
  const add = async (days, start, end, brk) => {
    if (!(await p.$("#hf"))) await p.click("[data-hf-open]");
    for (const d of days) await p.click(`[data-hf-day="${d}"]`);
    await p.fill('[data-hf="start"]', start); await p.fill('[data-hf="end"]', end); await p.click(`[data-hf-brk="${brk}"]`); await p.click("[data-hf-save]");
  };
  // 7 h with no break; then 23:30 to 08:00, only 8.5 h off; then every day of a week with no 24 h off.
  await add(["2026-11-02"], "12:00", "19:00", 0);
  await add(["2026-11-03"], "16:00", "23:30", 30);
  await add(["2026-11-04"], "08:00", "13:00", 0);
  await add(["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"], "18:00", "23:00", 0);
  await p.click("[data-hf-cancel]");
  const r = await txt("#pay-rights");
  assert.match(r, /^3 things to check in November/);
  assert.match(r, /Monday 2 Nov 7 h worked with no break\. Over 6 hours you should get an unbroken 20 minutes\./);
  assert.match(r, /Wednesday 4 Nov Only 8\.5 h off since your last shift\. You should get 11 hours between working days\./);
  assert.match(r, /Monday 9 Nov No 24 hours off in the week from this day\. You should get 24 hours off each week, or 48 hours each fortnight\./);
  assert.match(r, /Acas gives free, confidential advice on 0300 123 1100/);
  assert.match(await txt("#pay-sum"), /3 things to check in Your rights/);
  // Under 18: 30 minutes over 4.5 hours, 12 hours between days, 48 hours off a week, no more than 8 hours a day.
  await p.click("#pay-setup summary"); await p.click('[data-pay-age="16"]');
  const y = await txt("#pay-rights");
  assert.match(y, /Monday 9 Nov 5 h worked with no break\. Over 4\.5 hours you should get an unbroken 30 minutes\./);
  assert.match(y, /You should get 12 hours between working days/);
  assert.match(y, /Under 18 you should get 48 hours off each week/);
  await p.click('[data-pay-age="21"]');
  // What the law says, each part linked to GOV.UK, dated and not legal advice.
  await p.click("[data-sec=rights] summary");
  const law = await txt("[data-sec=rights]");
  for (const h of ["Working hours", "Breaks", "Rest between shifts", "Holiday", "Minimum wage", "Tips and service charge", "Payslips", "Sick pay"]) assert.match(law, new RegExp(h, "i"));
  assert.match(law, /checked on 16 November 2026\. It isn't legal advice/);
  const links = await p.$$eval("[data-sec=rights] a", (as) => as.map((a) => a.href));
  assert.equal(links.length, 9);
  assert.ok(links.every((h) => /^https:\/\/www\.(gov\.uk|acas\.org\.uk)\//.test(h)), links.join());
  await p.click("[data-rights-go]");
  assert.deepEqual(p.errs, []);
});
