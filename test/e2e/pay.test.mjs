// My pay: worked out on this phone only. live.js is blocked, so this is the site without a Firebase config.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, launch } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });

async function open({ start = "#w-ok", at, width = 390 } = {}) {
  const c = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, timezoneId: "Europe/London", colorScheme: "dark" });
  await c.addInitScript(() => localStorage.setItem("btbar.introSeen", "true"));
  await c.route("**/live.js", (r) => r.abort());
  const p = await c.newPage();
  p.errs = [];
  p.on("pageerror", (e) => p.errs.push(e.message));
  if (at) await p.clock.setFixedTime(new Date(at));
  await p.goto(site.url);
  await p.click(start);
  await p.click("[data-tab=pay]");
  return p;
}

const flat = (s) => s.replace(/\s+/g, " ").trim();
const txt = async (p, sel) => flat(await p.$eval(sel, (e) => e.innerText));
const toastIs = (p, t) => p.waitForFunction((x) => document.querySelector("#toast").textContent === x, t);

// A real payroll layout (the figures from three real payslips; the name, address, NI number and employer are made up),
// as the PDF reader gives it: each row of the page as a line.
const slip = (o) => `PAID BY
Sample Bar Limited
1 Test Street
London
EMPLOYMENT DETAILS
Mr Sam Sample
2 Example Road
Tax Code: ${o.code}
Tax Basis: W1/M1
NI Number: QQ123456C
NI Category: A
Payroll ID: 1
Pay Period: 01/${o.mo}/2026 - ${o.end}/${o.mo}/2026 (Tax Month ${o.tm})
Payment Date:  ${o.paid}/${o.mo}/2026  Gross Pay:  £${o.gross}  Net Pay:  £${o.net}  Total Pay:  £${o.net}
THIS PAY  YTD
EARNINGS  QUANTITY  RATE
Regular Hours  ${o.h} hours  £12.71  £${o.basic}  £${o.basicY}
${o.tr ? `TRONC  1.0000 hours  £${o.tr}  £${o.tr}  £${o.trY}\n` : ""}TOTAL  £${o.gross}  £${o.grossY}
DEDUCTIONS
PAYE  £${o.paye}  £${o.payeY}
Employee National Insurance Contribution - A  £${o.ni}  £${o.niY}
TOTAL  £${o.ded}  £${o.dedY}
PAYMENT DETAILS  AMOUNT
Electronic Transfer  £${o.net}
EMPLOYER CONTRIBUTIONS
Employer National Insurance Contribution - A  £${o.er}  £${o.erY}
TOTAL  £${o.er}  £${o.erY}`;
const AUG = slip({ code: "1257L", mo: "08", end: "31", tm: 5, paid: "28", h: "82.0000", basic: "1,042.22", basicY: "1,042.22", gross: "1,042.22", grossY: "1,042.22",
  paye: "0.00", payeY: "0.00", ni: "0.00", niY: "0.00", ded: "0.00", dedY: "0.00", net: "1,042.22", er: "93.78", erY: "93.78" });
const SEP = slip({ code: "992L", mo: "09", end: "30", tm: 6, paid: "30", h: "246.3900", basic: "3,131.62", basicY: "4,173.84", tr: "592.95", trY: "592.95", gross: "3,724.57", grossY: "4,766.79",
  paye: "579.40", payeY: "579.40", ni: "166.69", niY: "166.69", ded: "746.09", dedY: "746.09", net: "2,978.48", er: "407.19", erY: "500.97" });
const OCT = slip({ code: "992L", mo: "10", end: "31", tm: 7, paid: "30", h: "130.2600", basic: "1,655.60", basicY: "5,829.44", tr: "915.59", trY: "1,508.54", gross: "2,571.19", grossY: "7,337.98",
  paye: "348.60", payeY: "928.00", ni: "48.61", niY: "215.30", ded: "397.21", dedY: "1,143.30", net: "2,173.98", er: "185.79", erY: "686.76" });

test("my pay: real payslips fill in every month, tronc an hour, the next pay and holiday by themselves", async () => {
  const p = await open({ at: "2026-11-16T12:00:00Z" });
  assert.equal(await p.locator("[data-imp-open], [data-pay-view]").count(), 0, "no Nory button and no view chips");
  // Read one at a time, every line lands where it should; the employer's section, the header and the name are left out.
  const R = await p.evaluate((t) => { const S = readSlip(t); return { ...S, items: S.items.map((x) => `${x.k} ${x.u} ${x.r} ${x.a}`) }; }, SEP);
  assert.deepEqual([R.m, R.date, R.period, R.code, R.basis, R.basicH, R.basicRate, R.basicAmt, R.tronc, R.gross, R.tax, R.ni, R.net], ["2026-09", "2026-09-30", 6, "992L", "M1", 246.39, 12.71, 3131.62, 592.95, 3724.57, 579.4, 166.69, 2978.48]);
  assert.deepEqual(R.items.filter((x) => !/^(gross|net) /.test(x)), ["basic 246.39 12.71 3131.62", "tronc 0 0 592.95", "tax 0 0 579.4", "ni 0 0 166.69", "dedtotal 0 0 746.09"]);
  assert.deepEqual(R.ytd, { gross: 4766.79, tax: 579.4, ni: 166.69 });
  assert.doesNotMatch(JSON.stringify(R), /Sample|QQ123456C|Example|407\.19/, "only the figures are kept");
  // Picked together, in any order: each is saved to its month and the latest one teaches the settings.
  await p.evaluate((ts) => slipTakeAll(ts), [OCT, AUG, SEP]);
  await toastIs(p, "3 payslips saved");
  assert.equal(await p.$eval("#pay-h", (e) => e.textContent), "October 2026");
  assert.equal(await p.evaluate(() => `${pay.code} ${pay.rate} ${pay.trOn}`), "992L 12.71 true");
  // October: paid on the 30th; its tronc is on September's 246.39 h, £3.72 an hour.
  assert.match(await txt(p, "#pay-sum"), /^Take-home £2,173\.98 From your payslip · paid Friday 30 October 130\.3 Hours £3\.72 Tronc an hour £2,571\.19 Gross Next pay, Monday 30 November: about £2,126\.78/);
  assert.match(await txt(p, "#pay-out"), /^£12\.71 an hour \+ £3\.72 tronc = £16\.43 an hour Regular Hours \(130\.26 h at £12\.71\) £1,655\.60 TRONC \(246\.39 h in September at £3\.72\) £915\.59 Gross £2,571\.19 PAYE −£348\.60 Employee National Insurance Contribution −£48\.61 Take-home £2,173\.98/);
  assert.match(await txt(p, "#pay-out"), /W1\/M1 \(emergency\) basis/);
  // The app's own working comes to the same, to the penny, with the real tronc.
  await p.click("[data-sec=check] summary");
  assert.match(await txt(p, "[data-sec=check]"), /Matches to the pound\./);
  // Every month, and the months to come: September's tronc is on August's 82 h, £7.23 an hour; August had none.
  assert.match(await txt(p, "#pay-months"), /January predicted 152\.9 h £4\.59\/h £2,209\.81 December predicted 152\.9 h £4\.59\/h £2,209\.81 November predicted 152\.9 h £4\.59\/h £2,126\.78 October payslip 130\.3 h £3\.72\/h £2,173\.98 September payslip 246\.4 h £7\.23\/h £2,978\.48 August payslip 82 h – £1,042\.22/);
  // November: the average of the three months' hours, and October's hours at the tronc an hour of September and
  // October together (£1,508.54 on 328.39 h).
  await p.click('#pay-months [data-pm-go="2026-11"]');
  assert.match(await txt(p, "#pay-sum"), /^Predicted take-home £2,126\.78 Predicted from your average of the last 3 months · pay day Monday 30 November 152\.9 Hours £4\.59 Tronc an hour £2,540\.99 Gross/);
  assert.match(await txt(p, "#pay-out"), /Hours pay \(152\.9 h at £12\.71\) £1,943\.10 Tronc \(130\.3 h in October at £4\.59\) £597\.89 Gross £2,540\.99 Income tax −£342\.60 National Insurance −£71\.61 Take-home £2,126\.78/);
  assert.match(await txt(p, "#pay-out"), /the average of your September and October payslips/);
  // Hours and tronc an hour can be changed to see what it would pay, and cleared to go back.
  assert.equal(await p.getAttribute("[data-pay-plan]", "placeholder"), "152.9");
  assert.equal(await p.getAttribute('[data-pay="trRate"]', "placeholder"), "4.59");
  await p.fill("[data-pay-plan]", "100"); await p.fill('[data-pay="trRate"]', "5");
  assert.match(await txt(p, "#pay-out"), /Hours pay \(100 h at £12\.71\) £1,271\.00 Tronc \(130\.3 h in October at £5\.00\) £651\.30 Gross £1,922\.30/);
  assert.match(await txt(p, "#pay-out"), /as you set it/);
  assert.match(await txt(p, "#pay-months"), /December predicted 152\.9 h £5\.00\/h £2,048\.49 November planned 100 h £5\.00\/h/, "December's tronc is on November's 100 h; its hours stay the payslips' average");
  await p.fill("[data-pay-plan]", ""); await p.fill('[data-pay="trRate"]', "");
  assert.match(await txt(p, "#pay-sum"), /£2,126\.78/);
  // Holiday from the payslips' hours: 10 + 30 + 16 h.
  assert.match(await txt(p, "#pay-sum"), /Holiday: 56 h left, worth about £711\.76/);
  await p.click('#pay-sum [data-go="hol"]');
  assert.match(await txt(p, "#pay-hol"), /^56 Built up 0 Taken or booked 56 h Left/);
  // The tax year so far from October's year-to-date figures; W1/M1 means there's no year-so-far tax to check.
  await p.click("[data-sec=year] summary");
  assert.match(await txt(p, "#pay-year"), /So far By April Gross £7,337\.98 £\d/);
  assert.match(await txt(p, "#pay-year"), /taxed on a W1\/M1 basis/);
  await p.click("[data-sec=slips] summary");
  assert.match(await txt(p, "[data-sec=slips]"), /October 2026 £2,173\.98 Gross £2,571\.19 · 130\.26 h · tronc £915\.59/);
  // An older payslip doesn't undo what the latest one taught.
  await p.evaluate((t) => slipTakeAll([t]), AUG);
  await toastIs(p, "Payslip for August saved");
  assert.equal(await p.evaluate(() => pay.code), "992L");
  // Kept on this phone, and nothing wider than a small phone.
  await p.reload(); await p.click("#w-ok").catch(() => {}); await p.click("[data-tab=pay]");
  assert.equal(await p.evaluate(() => Object.keys(pay.slips).sort().join()), "2026-08,2026-09,2026-10");
  await p.setViewportSize({ width: 320, height: 700 });
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), 320);
  assert.deepEqual(p.errs, []);
});

test("my pay: payslips saved by the old reader are put right on opening, or named to add again", async () => {
  const p = await open({ at: "2026-11-16T12:00:00Z" });
  // How the old reader saved September and October: the rate and the tronc as "hours" lines, the totals as plain
  // TOTALs, and the take-home as the gross. July's can't be worked out, so it's named.
  const old = (m, date, rate, tronc, tot, ded, er, tax, ni, net) => ({ m, date, code: "992L", period: 0, ytd: {}, basicH: 0, basicAmt: Math.round((rate + tronc) * 100) / 100, basicRate: 0, holH: 0, holAmt: 0, holRate: 0,
    tronc: 0, tax, ni, loan: 0, pgl: 0, pen: 0, other: 0, gross: net, net,
    items: [{ l: "hours", k: "basic", u: 0, r: 0, a: rate }, ...(tronc ? [{ l: "hours", k: "basic", u: 0, r: 0, a: tronc }] : []), { l: "TOTAL", k: "other", u: 0, r: 0, a: tot }, { l: "PAYE", k: "tax", u: 0, r: 0, a: tax },
      { l: "Employee National Insurance Contribution", k: "ni", u: 0, r: 0, a: ni }, { l: "TOTAL", k: "other", u: 0, r: 0, a: ded }, { l: "Electronic Transfer", k: "net", u: 0, r: 0, a: net }, { l: "TOTAL", k: "other", u: 0, r: 0, a: er }] });
  await p.evaluate((xs) => { pay.slips = {}; for (const x of xs) pay.slips[x.m] = x; pay.code = "992L"; savePay(); }, [
    { m: "2026-07", date: "2026-07-31", code: "1257L", period: 0, ytd: {}, items: [{ l: "Basic", k: "basic", u: 0, r: 0, a: 100 }], basicH: 0, basicAmt: 100, basicRate: 0, holH: 0, holAmt: 0, holRate: 0, tronc: 0, tax: 0, ni: 0, loan: 0, pgl: 0, pen: 0, other: 0, gross: 100, net: 100 },
    old("2026-08", "2026-08-28", 12.71, 0, 1042.22, 0, 93.78, 0, 0, 1042.22),
    old("2026-09", "2026-09-30", 12.71, 592.95, 3724.57, 746.09, 407.19, 579.4, 166.69, 2978.48),
    old("2026-10", "2026-10-30", 12.71, 915.59, 2571.19, 397.21, 185.79, 348.6, 48.61, 2173.98),
  ]);
  await p.reload(); await p.click("#w-ok").catch(() => {}); await p.click("[data-tab=pay]");
  await p.click('[data-pm="-1"]');
  assert.match(await txt(p, "#pay-sum"), /^Take-home £2,173\.98 From your payslip · paid Friday 30 October 130\.3 Hours £3\.72 Tronc an hour £2,571\.19 Gross Next pay, Monday 30 November: about £2,126\.78/);
  assert.match(await txt(p, "#pay-out"), /Regular Hours \(130\.26 h at £12\.71\) £1,655\.60 TRONC \(246\.39 h in September at £3\.72\) £915\.59 Gross £2,571\.19 PAYE −£348\.60 Employee National Insurance Contribution −£48\.61 Take-home £2,173\.98/);
  assert.match(await txt(p, "#pay-months"), /September payslip 246\.4 h £7\.23\/h £2,978\.48 August payslip 82 h – £1,042\.22/);
  assert.match(await txt(p, "#pay-old"), /^Your July payslip was read before the payslip reader was fixed, so the hours and tronc are wrong\. Tap Add payslips and pick it again: it replaces the old one\.$/);
  assert.deepEqual(p.errs, []);
});

test("my pay: the estimate to the penny, tronc on and off, any tax code", async () => {
  const p = await open({ at: "2026-09-20T12:00:00Z" });
  const out = () => txt(p, "#pay-out");
  assert.equal(await p.$eval("#pay-h", (e) => e.textContent), "September 2026");
  assert.match(await txt(p, "#pay-sum"), /pay day Friday 25 September/, "the last Friday with no payslips");
  await p.click("#pay-setup summary"); await p.fill('[data-pay="code"]', "992L");
  // August's hours for the tronc, at the suggested £6 with no payslips; September's typed in.
  await p.evaluate(() => { pay.plan["2026-08"] = "82"; savePay(); renderPay(); });
  await p.fill("[data-pay-plan]", "246.39");
  assert.match(await out(), /Hours pay \(246\.4 h at £12\.71\) £3,131\.62 Tronc \(82 h in August at £6\.00\) £492\.00 Gross £3,623\.62 Income tax −£559\.20 National Insurance −£166\.69 Take-home £2,897\.73/);
  assert.match(await out(), /a suggested figure, not guaranteed/);
  assert.match(await txt(p, "#pay-sum"), /^Predicted take-home £2,897\.73 From the hours you set/);
  assert.equal(await p.$eval("#pay-set", (e) => e.textContent), "£12.71 an hour · 992L");
  // Tronc off: tax follows.
  await p.uncheck('[data-pay-check="trOn"]');
  assert.doesNotMatch(await out(), /Tronc/);
  assert.match(await out(), /Gross £3,131\.62 Income tax −£460\.80 National Insurance −£166\.69 Take-home £2,504\.13/);
  // Scotland: 19%, 20% and 21% bands on £2,083 taxable. BR: 20% of it all. A K code can't be worked out.
  await p.click('[data-pay-code="S1257L"]');
  assert.equal(await p.inputValue('[data-pay="code"]'), "S1257L");
  assert.match(await out(), /Income tax −£419\.99/);
  await p.click('[data-pay-code="BR"]'); assert.match(await out(), /Income tax −£626\.20/);
  await p.fill('[data-pay="code"]', "K100"); assert.match(await out(), /Check the tax code/);
  await p.reload(); await p.click("#w-ok").catch(() => {}); await p.click("[data-tab=pay]");
  assert.equal(await p.inputValue("[data-pay-plan]"), "246.39", "kept on this phone");
  assert.deepEqual(p.errs, []);
});

test("my hours: several shifts at once, planned ones, a month at a time, with a student loan, pension, deductions and bills", async () => {
  const p = await open({ at: "2026-11-20T12:00:00Z" });
  const add = async (days, start, end, brk) => {
    if (!(await p.$("#hf"))) await p.click("[data-hf-open]");
    for (const d of days) await p.click(`[data-hf-day="${d}"]`);
    await p.fill('[data-hf="start"]', start); await p.fill('[data-hf="end"]', end);
    await p.click(`[data-hf-brk="${brk}"]`); await p.click("[data-hf-save]");
  };
  // Three days with the same times in one go; the form stays open with the times kept.
  await add(["2026-11-03", "2026-11-10", "2026-11-12"], "17:00", "23:00", 30); await toastIs(p, "Saved 3 shifts, 16.5 h");
  assert.equal(await p.inputValue('[data-hf="start"]'), "17:00");
  assert.equal(await p.$$eval('[data-hf-day][aria-pressed="true"]', (x) => x.length), 0, "the days are cleared");
  assert.equal(await p.$$eval("[data-hf-day].has", (x) => x.length), 3, "logged days are marked");
  // One that overlaps is left out and named; the others still save.
  await add(["2026-11-12", "2026-11-13"], "22:00", "02:00", 0); await toastIs(p, "Saved 4 h on Fri 13 Nov. Thu 12 Nov already has a shift then");
  await add([], "12:00", "18:00", 0); await toastIs(p, "Tap the days you worked");
  await add(["2026-11-19"], "10:00", "10:30", 45); await toastIs(p, "That comes to no hours. Check the times and the break");
  await p.click('[data-hf-day="2026-11-19"]');
  // A day still to come is a planned shift, counted in the month's estimate.
  await add(["2026-11-25"], "17:00", "23:00", 30); await toastIs(p, "Saved 5.5 h on Wed 25 Nov");
  assert.deepEqual(await p.$$eval("[data-hf-times]", (x) => x.map((b) => b.textContent)), ["17:00–23:00", "22:00–02:00"]);
  await p.click("[data-hf-cancel]");
  assert.match(await txt(p, "#pay-sum"), /From 5 shifts logged .* 26 Hours .* Including 5\.5 h still to work/);
  await p.click("[data-sec=shifts] summary");
  assert.match(await txt(p, "[data-sec=shifts]"), /WEEK OF 23 NOV · 5\.5 H Wednesday 25 Nov 17:00–23:00 Planned · 5\.5 h after a 30 min break/i);

  // October, from the arrow: one shift that runs past midnight, the hours November's tronc is paid on.
  await p.click('[data-pm="-1"]');
  assert.equal(await p.$eval("#pay-h", (e) => e.textContent), "October 2026");
  await add(["2026-10-31"], "18:00", "03:00", 30); await toastIs(p, "Saved 8.5 h on Sat 31 Oct");
  await p.click("[data-hf-cancel]"); await p.click('[data-pm="1"]');
  // November's hours typed in stand in for the shifts logged.
  await p.fill("[data-pay-plan]", "167");
  assert.match(await txt(p, "#pay-sum"), /From the hours you set/);
  const out = () => txt(p, "#pay-out");
  assert.match(await out(), /Hours pay \(167 h at £12\.71\) £2,122\.57 Tronc \(8\.5 h in October at £6\.00\) £51\.00 Gross £2,173\.57 Income tax −£225\.00 National Insurance −£85\.97 Take-home £1,862\.60/);
  // Plan 5 takes 9% over £2,083.33 a month (£3.53, so £3) and a postgraduate loan 6% over £1,750 (£22.35, so £22).
  await p.click("#pay-setup summary");
  await p.click('[data-pay-loan="5"]'); await p.check('[data-pay-check="pgl"]');
  assert.match(await out(), /Student loan \(Plan 5 and postgraduate\) −£25\.00 Take-home £1,837\.60/);
  // 5% of the hours pay over £520 is £80.13, and tax relief pays a fifth: £64.10. The settings stay open.
  await p.check('[data-pay-check="pen"]');
  assert.equal(await p.$eval("#pay-setup", (d) => d.open), true);
  assert.equal(await p.inputValue('[data-pay="pension"]'), "5");
  assert.match(await out(), /Pension \(5%\) −£64\.10 Take-home £1,773\.50/);
  await p.fill('[data-money-name="ded"]', "Staff food"); await p.fill('[data-money-amt="ded"]', "20"); await p.click('[data-money-add="ded"]');
  assert.match(await out(), /Staff food −£20\.00 Take-home £1,753\.50/);
  assert.equal(await p.$eval("#pay-set", (e) => e.textContent), "£12.71 an hour · 1257L · Plan 5 · postgraduate loan · 5% pension · 1 other deduction");
  await p.fill('[data-pay="rate"]', "11"); await p.click("[data-sec=rights] summary");
  assert.match(await txt(p, "#pay-rights"), /£11\.00 an hour is under £12\.71, the legal minimum for your age\. Tronc and tips can't count towards it\./);
  assert.match(await txt(p, "#pay-sum"), /1 thing to check in Your rights/);
  await p.click('[data-pay-age="18"]');
  assert.doesNotMatch(await txt(p, "#pay-rights"), /legal minimum/, "£10.85 at 18 to 20");
  await p.click('[data-pay-age="21"]'); await p.fill('[data-pay="rate"]', "12.71");
  // Bills: what's left, a week at a time until the next pay day on 25 Dec, 4 weeks after 27 Nov.
  await p.click("[data-sec=bills] summary"); await p.click('[data-money-chip="bills:Rent"]'); await p.fill('[data-money-amt="bills"]', "650"); await p.click('[data-money-add="bills"]');
  assert.match(await txt(p, "#pay-bills"), /Take-home £1,753\.50 Bills −£650\.00 Left over £1,103\.50 About £275\.88 a week until the next pay day, in 4 weeks\./);
  assert.match(await txt(p, "#pay-sum"), /Left after bills: £1,103\.50/);
  await p.fill('[data-money-name="bills"]', "Car"); await p.fill('[data-money-amt="bills"]', "1200"); await p.click('[data-money-add="bills"]');
  assert.match(await txt(p, "#pay-bills"), /Left over −£96\.50 Your bills come to £96\.50 more than this month's take-home\./);
  await p.click(`[data-money-del="bills:${await p.evaluate(() => pay.bills[1].id)}"]`);

  // Everything stays on this phone.
  p.once("dialog", (d) => d.accept());
  await p.click(`[data-hr-del="${await p.evaluate(() => hoursLog.find((x) => x.day === "2026-11-13").id)}"]`);
  await p.fill("[data-pay-plan]", "");
  await p.reload(); await p.click("#w-ok").catch(() => {}); await p.click("[data-tab=pay]");
  assert.match(await txt(p, "#pay-sum"), /From 4 shifts logged .* 22 Hours/);
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
  await p.click("#pay-setup summary");
  assert.deepEqual(await p.$$eval("[data-pay-wk]", (x) => x.map((b) => b.textContent)), ["Off", "20 h", "25 h", "30 h", "35 h", "40 h", "45 h", "50 h", "55 h", "60 h", "65 h", "70 h"]);
  await p.click('[data-pay-wk="40"]');
  // 40 h a week over November's 30 days is 171.43 h; October's 31 days, 177.14 h, for tronc.
  assert.match(await txt(p, "#pay-sum"), /From about 40 h a week .* 171\.4 Hours/);
  assert.match(await txt(p, "#pay-out"), /Hours pay \(171\.4 h at £12\.71\) £2,178\.88 Tronc \(177\.1 h in October at £6\.00\) £1,062\.84/);
  await p.click('[data-pay-wk="0"]');
  assert.match(await txt(p, "#pay-sum"), /Add a payslip or your hours .* 0 Hours .* £0\.00 Gross/);
  assert.deepEqual(p.errs, []);
});

// Another layout payroll often prints: payments on the left, deductions on the right, a pension and holiday pay.
const SIDE = `BLACK TAP SOHO LTD
Pay Date 30/10/2026   Tax Code 1257L   Period 7
Payments Units Rate Amount   Deductions Amount
Basic Pay 120.00 12.71 1,525.20   PAYE Tax 203.00
Holiday Pay 7.00 12.71 88.97   National Insurance 45.29
Tronc 450.00   Pension 43.77
Employer Pension 32.83
Gross Pay 2,064.17   Net Pay 1,772.11
Taxable Pay YTD 12,000.00   Tax Paid YTD 1,450.00`;

test("my pay: other payslip layouts, pasted, checked against the estimate, and a month asked for when there's no date", async () => {
  const p = await open({ at: "2026-11-16T12:00:00Z" });
  await p.click("[data-sec=slips] summary");
  await p.fill("[data-slip-text]", SIDE); await p.click("[data-slip-read]");
  await toastIs(p, "Payslip for October saved");
  assert.equal(await p.$eval("#pay-h", (e) => e.textContent), "October 2026");
  assert.match(await txt(p, "#pay-sum"), /^Take-home £1,772\.11 From your payslip · paid Friday 30 October 120 Hours/);
  assert.match(await txt(p, "#v-pay"), /Updated from your payslip: Pension on\./);
  assert.equal(await p.evaluate(() => pay.pension), "5", "5% worked out from £43.77");
  const out = await txt(p, "#pay-out");
  assert.match(out, /Basic Pay \(120 h at £12\.71\) £1,525\.20 Holiday Pay \(7 h at £12\.71\) £88\.97 Tronc £450\.00 Gross £2,064\.17 PAYE Tax −£203\.00 National Insurance −£45\.29 Pension −£43\.77 Take-home £1,772\.11/);
  assert.doesNotMatch(out, /Employer/, "the employer's pension isn't taken from pay");
  assert.match(out, /Add your September payslip to work out this tronc an hour/);
  assert.match(await p.evaluate(() => shareText("slip", false, "2026-10")), /^My payslip for October 2026\nGross £2,064\.17 · take-home £1,772\.11\n\nEvery line \(\d+\)\n• Basic Pay: £1,525\.20/);
  // The tax year: tax paid so far against what's due on £12,000 by month 7 with 1257L.
  await p.click("[data-sec=year] summary");
  assert.match(await txt(p, "#pay-year"), /So far By April Gross £12,000\.00 /);
  assert.match(await txt(p, "#pay-year"), /Your October payslip shows £1,450\.00 tax paid this tax year on £12,000\.00\. About £932\.40 is due on that by now\. That's about £517\.60 too much\./);
  // A payslip with no date asks which month it's for.
  await p.fill("[data-slip-text]", "Basic Pay 10.00 12.71 127.10\nNet Pay 127.10"); await p.click("[data-slip-read]");
  assert.match(await txt(p, "#slip"), /Which month is this payslip for\?/);
  await p.selectOption("[data-slip-m]", "2026-09"); await p.click("[data-slip-save]");
  assert.equal(await p.$eval("#pay-h", (e) => e.textContent), "September 2026");
  // Several at once: the dated ones are saved, then each undated one asks for its month.
  await p.evaluate(() => slipTakeAll(["Pay date 28/08/2026\nBasic Pay 50.00 12.71 635.50\nNet Pay 635.50", "Pay date 31/07/2026\nBasic Pay 40.00 12.71 508.40\nNet Pay 508.40", "Basic Pay 5.00 12.71 63.55\nNet Pay 63.55", "Basic Pay 6.00 12.71 76.26\nNet Pay 76.26"]));
  await toastIs(p, "2 payslips saved, 2 to put a month to");
  await p.selectOption("[data-slip-m]", "2026-06"); await p.click("[data-slip-save]");
  assert.match(await txt(p, "#slip"), /Which month is this payslip for\?/, "then the next one");
  await p.selectOption("[data-slip-m]", "2026-05"); await p.click("[data-slip-save]");
  assert.equal(await p.locator("#slip").count(), 0);
  assert.equal(await p.evaluate(() => Object.keys(pay.slips).sort().join()), "2026-05,2026-06,2026-07,2026-08,2026-09,2026-10");
  // Nothing that looks like pay says so.
  await p.fill("[data-slip-text]", "hello"); await p.click("[data-slip-read]");
  assert.match(await txt(p, "#slip-st"), /No pay figures found/);
  assert.deepEqual(p.errs, []);
});

test("my pay: holiday builds up from the hours worked, and booking it shows what it's worth and adds it to that pay", async () => {
  const p = await open({ at: "2026-11-16T12:00:00Z" });
  await p.click("[data-hf-open]");
  for (const d of ["2026-11-02", "2026-11-03", "2026-11-05", "2026-11-06", "2026-11-09", "2026-11-10", "2026-11-12", "2026-11-13"]) await p.click(`[data-hf-day="${d}"]`);
  await p.fill('[data-hf="start"]', "16:00"); await p.fill('[data-hf="end"]', "23:30"); await p.click('[data-hf-brk="30"]'); await p.click("[data-hf-save]");
  await p.click("[data-hf-cancel]");
  // 56 h worked: 12.07% is 6.76 h, so 7 h to the nearest hour.
  await p.click("[data-sec=hol] summary");
  assert.match(await txt(p, "#pay-hol"), /^7 Built up 0 Taken or booked 7 h Left Worth about £88\.97 at £12\.71 an hour/);
  await p.click("[data-hol-book]");
  await p.click('[data-hf-day="2026-11-23"]'); await p.click('[data-hf-day="2026-11-24"]');
  assert.equal(await p.textContent("#hf-worth"), "14 h of holiday is worth £177.94 before tax, paid with that month's pay.");
  await p.fill('[data-hf="h"]', "3.5");
  assert.equal(await p.textContent("#hf-worth"), "7 h of holiday is worth £88.97 before tax, paid with that month's pay.");
  await p.click("[data-hf-save]");
  await toastIs(p, "Booked 7 h of holiday, worth £88.97");
  assert.match(await txt(p, "#pay-hol"), /^7 Built up 7 Taken or booked 0 h Left/);
  assert.match(await txt(p, "#pay-out"), /Holiday pay \(7 h\) £88\.97/);
  // Rolled-up holiday pay: 12.07% on top of every hour's pay, and nothing to book.
  await p.click("[data-hf-cancel]"); await p.click("#pay-setup summary"); await p.click('[data-pay-hol="rolled"]');
  assert.match(await txt(p, "#pay-out"), /Hours pay \(56 h at £12\.71\) £711\.76 Rolled-up holiday pay \(12\.07%\) £85\.91/);
  assert.equal(await p.locator("[data-hol-book]").count(), 0);
  assert.deepEqual(p.errs, []);
});

test("my pay: your rights, with the shifts logged checked for breaks, rest and hours", async () => {
  const p = await open({ at: "2026-11-16T12:00:00Z" });
  await p.click("[data-sec=rights] summary");
  assert.match(await txt(p, "#pay-rights"), /Nothing to flag in November's logged shifts/);
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
  const r = await txt(p, "#pay-rights");
  assert.match(r, /^3 things to check in November/);
  assert.match(r, /Monday 2 Nov 7 h worked with no break\. Over 6 hours you should get an unbroken 20 minutes\./);
  assert.match(r, /Wednesday 4 Nov Only 8\.5 h off since your last shift\. You should get 11 hours between working days\./);
  assert.match(r, /Monday 9 Nov No 24 hours off in the week from this day\. You should get 24 hours off each week, or 48 hours each fortnight\./);
  assert.match(r, /Acas gives free, confidential advice on 0300 123 1100/);
  assert.match(await txt(p, "#pay-sum"), /3 things to check in Your rights/);
  // Under 18: 30 minutes over 4.5 hours, 12 hours between days, 48 hours off a week, no more than 8 hours a day.
  await p.click("#pay-setup summary"); await p.click('[data-pay-age="16"]');
  const y = await txt(p, "#pay-rights");
  assert.match(y, /Monday 9 Nov 5 h worked with no break\. Over 4\.5 hours you should get an unbroken 30 minutes\./);
  assert.match(y, /You should get 12 hours between working days/);
  assert.match(y, /Under 18 you should get 48 hours off each week/);
  await p.click('[data-pay-age="21"]');
  // What the law says, each part linked to GOV.UK, dated and not legal advice.
  const law = await txt(p, "[data-sec=rights]");
  for (const h of ["Working hours", "Breaks", "Rest between shifts", "Holiday", "Minimum wage", "Tips and service charge", "Payslips", "Sick pay"]) assert.match(law, new RegExp(h, "i"));
  assert.match(law, /checked on 16 November 2026\. It isn't legal advice/);
  const links = await p.$$eval("[data-sec=rights] a", (as) => as.map((a) => a.href));
  assert.equal(links.length, 9);
  assert.ok(links.every((h) => /^https:\/\/www\.(gov\.uk|acas\.org\.uk)\//.test(h)), links.join());
  await p.click('#pay-sum [data-go="rights"]');
  assert.deepEqual(p.errs, []);
});
