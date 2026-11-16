// The app without the team side: drinks, allergens and practice work; the shift tools need it.
// live.js is blocked, so this is exactly the site built without a Firebase config.
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

test("logged out, drinks and allergens work, and the shift tools ask for a login", async () => {
  const p = await open();
  assert.equal(await p.evaluate(() => LIVE.api), null);
  await p.evaluate(() => openSheet(D.find((d) => d.name === "Negroni").id));
  assert.match(await p.$eval("#sheet", (e) => e.innerText), /Negroni[\s\S]*Spec/);
  assert.equal(await p.locator("#sh-86").count(), 0, "no 86 button off the team");
  await p.evaluate(() => closeSheet());
  await p.click("[data-tab=tally]");
  assert.match(await p.$eval("#tally", (e) => e.innerText), /need the team side/);
  assert.equal(await p.locator("[data-list]").count(), 0, "no checklists off the team");
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), 390, "nothing wider than the screen");
  await p.evaluate(() => show("notices"));
  assert.match(await p.$eval("#tm-top", (e) => e.innerText), /needs signal the first time/i);
  // Bar info: what's in the app, then the bar's own reference, then this phone's settings.
  await p.click("[data-tab=info]");
  assert.deepEqual(await p.$$eval("#v-info h2", (x) => x.map((h) => h.textContent)), ["What's in the app", "Measures and the law", "Technique key", "Prep and batches",
    "Shot tray, step by step", "Feedback and ideas", "Language", "Light or dark", "Put this app on your home screen", "Clear everything"]);
  // The tabs fit a 320px phone, each name on one line: Drinks, Shift, Team, My pay and Info, with Rapid fire, Make,
  // Practise and Allergens in the row under Drinks.
  await p.setViewportSize({ width: 320, height: 640 });
  assert.equal(await p.locator("nav.tabs button:not([hidden])").count(), 5);
  await p.click("nav.tabs [data-tab=drinks]");
  assert.deepEqual(await p.$$eval("#subnav [data-tab]", (x) => x.map((b) => b.textContent)), ["⚡ Rapid fire", "Menu", "Make", "Practise", "Allergens", "Cheat sheets"]);
  assert.ok(await p.evaluate(() => [...document.querySelectorAll("nav.tabs button:not([hidden])")].every((b) => { const r = document.createRange(); r.selectNodeContents(b.lastChild); return r.getClientRects().length === 1; })));
  assert.deepEqual(p.errs, []);
});

test("a drink's next and previous buttons and the arrow keys move through the list, round from the end", async () => {
  const p = await open();
  const [first, second, last] = await p.evaluate(() => [listIds[0], listIds[1], listIds.at(-1)].map((i) => D[i].name));
  const showing = (n) => p.waitForFunction((x) => document.querySelector("#sh-name")?.textContent === x, n);
  await p.evaluate(() => openSheet(listIds[0]));
  await p.click('#sheet [data-go="1"]'); await showing(second);
  await p.click('#sheet [data-go="-1"]'); await showing(first);
  await p.keyboard.press("ArrowLeft"); await showing(last);
  await p.keyboard.press("ArrowRight"); await showing(first);
  assert.deepEqual(p.errs, []);
});

test("recently opened drinks come back as shortcuts", async () => {
  const p = await open({ recent: "[3,7,12]" });
  assert.equal(await p.$$eval("#quick [data-open]", (x) => x.length), 3);
  assert.deepEqual(p.errs, []);
});

test("the floor's lists follow the UK business day, which ends at 6am", async () => {
  // 25 Oct 2026 is when the clocks go back; Sunday and Monday nights add the toilets to the closing list.
  for (const [label, at, toilets] of [["Saturday 23:30 BST", "2026-10-24T22:30:00Z", false], ["Sunday 22:30 GMT", "2026-10-25T22:30:00Z", true], ["Tuesday 1am, still Monday's shift", "2026-10-27T01:00:00Z", true], ["Tuesday 7am, a new day", "2026-10-27T07:00:00Z", false]]) {
    const p = await open({ start: "#w-floor", at });
    assert.equal(await p.$eval("#shift-title", (e) => e.textContent), "Floor shift", label);
    if (!at.endsWith("07:00:00Z")) assert.equal(await p.evaluate(() => defaultPane()), "fclose", `${label}: late in the day opens on the closing list`);
    assert.equal(await p.evaluate(() => shown("fclose").some(([, t]) => t.includes("Toilets bleached"))), toilets, label);
    assert.deepEqual(p.errs, [], label);
    await p.context().close();
  }
  // Date labels count whole days from the business day, so the clocks going back moves no date.
  const p = await open({ start: "#w-floor", at: "2026-10-24T22:30:00Z" });
  assert.deepEqual(await p.evaluate(() => [2, 14, 28].map((n) => dayName(addDays(shiftDay(), n)))), ["Mon 26 Oct", "Sat 7 Nov", "Sat 21 Nov"]);
  const due = (useBy) => p.evaluate((u) => labelDue({ state: "open", useBy: u }), useBy);
  assert.deepEqual([await due("2026-10-23"), await due("2026-10-24"), await due("2026-10-25"), await due("2026-10-26")], ["overdue", "today", "tomorrow", "open"]);
  await p.evaluate(() => setMode("bar"));
  assert.equal(await p.$eval("#shift-title", (e) => e.textContent), "Bar shift");
  assert.deepEqual(p.errs, []);
});

test("light, dark or the phone's own setting, remembered on this phone", async () => {
  const bg = (p) => p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const p = await open();
  assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), "dark", "a phone set to dark (the test default) gets dark");
  const dark = await bg(p);
  await p.click("[data-tab=info]"); await p.click("[data-theme-pick=light]");
  assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), "light");
  assert.notEqual(await bg(p), dark);
  assert.equal(await p.$eval('meta[name="theme-color"]', (m) => m.content), "#f6f1e6");
  await p.reload(); await p.click("#w-ok").catch(() => {});
  assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), "light", "kept after a reload");
  // Auto follows the phone: switch the phone to light and back.
  await p.click("[data-tab=info]"); await p.click("[data-theme-pick=auto]");
  await p.emulateMedia({ colorScheme: "light" });
  await p.waitForFunction(() => document.documentElement.dataset.theme === "light");
  await p.emulateMedia({ colorScheme: "dark" });
  await p.waitForFunction(() => document.documentElement.dataset.theme === "dark");
  assert.equal(await p.$eval("[data-theme-pick=auto]", (b) => b.getAttribute("aria-pressed")), "true");
  assert.deepEqual(p.errs, []);
});

test("allergen tiles include sulphites, and oat milk shows under gluten", async () => {
  const p = await open();
  await p.click("nav.tabs [data-tab=drinks]"); await p.click("#subnav [data-tab=allergens]");
  await p.click("[data-al=Sulphites]");
  const sul = await p.$eval("#allist", (e) => e.innerText);
  assert.match(sul, /Negroni/); assert.match(sul, /Aperol Spritz/);
  await p.click("[data-al=Gluten]");
  const glu = await p.$eval("#allist", (e) => e.innerText);
  assert.match(glu, /The Paddington/); assert.match(glu, /The Boilermaker/);
  assert.deepEqual(p.errs, []);
});

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
  await p.fill('[data-nory="h"]', "246.39"); await p.fill('[data-pay-th="2026-08"]', "82");
  assert.match(await out(), /Hours pay \(246\.4 h at £12\.71\) £3,131\.62 Tronc \(82 h at £5\) £410\.00 Gross £3,541\.62 Income tax −£542\.80 National Insurance −£166\.69 Take-home £2,832\.13/);
  assert.match(await sum(), /£2,832\.13 Take-home Gross £3,541\.62 .* From Nory's figures: an estimate/);
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
  await p.reload(); await p.click("#w-ok").catch(() => {}); await p.click("[data-tab=pay]");
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
  assert.match(await txt("#pay-sum"), /^5 Shifts 26 Hours .* Includes 5\.5 h still to work/);
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
  assert.match(await out(), /^£11\.00 an hour is under £12\.71, the legal minimum at 21 and over\./);
  await p.fill('[data-pay="rate"]', "12.71");
  assert.doesNotMatch(await out(), /legal minimum/);
  // Bills: what's left, a week at a time until the next pay day on 25 Dec, 4 weeks after 27 Nov.
  await p.click('[data-money-chip="bills:Rent"]'); await p.fill('[data-money-amt="bills"]', "650"); await p.click('[data-money-add="bills"]');
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
  assert.match(await txt("#pay-sum"), /^4 Shifts 22 Hours/);
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
  await p.click('[data-pay-wk="40"]');
  // 40 h a week over November's 30 days is 171.43 h; October's 31 days, 177.14 h, for tronc.
  assert.match(await txt("#pay-sum"), /^0 Shifts 171\.43 Hours .* From about 40 h a week: an estimate/);
  assert.match(await txt("#v-pay"), /Hours the month before 177\.1 h, about 40 h a week/);
  assert.match(await txt("#pay-out"), /Hours pay \(171\.4 h at £12\.71\) £2,178\.88 Tronc \(177\.1 h at £5\) £885\.70/);
  await p.click('[data-pay-wk="0"]');
  assert.match(await txt("#pay-sum"), /^0 Shifts 0 Hours/);
  // The new words come translated.
  await p.evaluate(() => setLang("fr"));
  assert.match(await txt("#v-pay"), /ESTIMATION RAPIDE .* Je reçois le tronc : £5 par heure/);
  await p.evaluate(() => setLang(""));
  assert.deepEqual(p.errs, []);
});

test("my pay: a rota's text, read into shifts to check, with clocked or rota times", async () => {
  const p = await open({ at: "2026-11-03T12:00:00Z" });
  await p.click("[data-tab=pay]");
  await p.click("[data-imp-open]");
  // What the reader gets from a Nory Schedule screenshot: the rota's times, then the ticked clock-in times.
  const nory = `07:13\n=] 26 Oct - 01 Nov\n5 £386.60 30.42\nShifts Gross wage Hours\nTuesday 27 Oct 17:15 - 22:30\nSoho - Server v 17:15 - 22:30\nWednesday 28 Oct 16:00 - 21:00\nWestfield - Server v 16:00 - 21:30\nThursday 29 Oct 13:00 - 00:00\nSoho - Server v 13:04 - 22:40\nFriday 30 Oct 12:00 - 21:00\nSoho - Server v 12:11 - 18:15\nSaturday 31 Oct 11:00 - 17:00\nSoho - Server v 11:00 - 17:00\nSchedule`;
  await p.click("#imp details summary"); await p.fill("[data-imp-text]", nory); await p.click("[data-imp-read]");
  const rows = () => p.$$eval(".improw", (rs) => rs.map((r) => [...r.querySelectorAll("input,select")].map((i) => (i.type === "checkbox" ? i.checked : i.value)).join(" ")));
  assert.deepEqual(await rows(), ["true 17:15 22:30 0", "true 16:00 21:30 0", "true 13:04 22:40 0", "true 12:11 18:15 0", "true 11:00 17:00 0"]);
  await p.click('[data-imp-use="plan"]');
  assert.equal((await rows())[2], "true 13:00 00:00 0");
  await p.click('[data-imp-use="clock"]'); await p.click('[data-imp-allbrk="30"]');
  await p.uncheck('[data-imp-on="3"]'); await p.fill('[data-imp-t="4:end"]', "17:30");
  assert.equal(await p.textContent("[data-imp-save]"), "Save 4 shifts");
  await p.click("[data-imp-save]");
  await p.waitForFunction(() => document.querySelector("#toast").textContent === "Saved 4 shifts, 24.85 h");
  assert.equal(await p.$eval("#pay-h", (e) => e.textContent), "October 2026", "goes to the month imported");
  assert.equal(await p.locator("#imp").count(), 0);
  // Nothing found says so; a day already logged isn't added twice.
  await p.click("[data-imp-open]"); await p.click("#imp details summary");
  await p.fill("[data-imp-text]", "nothing here"); await p.click("[data-imp-read]");
  assert.match(await p.textContent("#imp-st"), /No days with times found/);
  assert.equal(await p.inputValue("[data-imp-text]"), "nothing here", "the text stays to fix");
  await p.fill("[data-imp-text]", "27/10 17:15-22:30\n2026-11-02 18:00 - 23:00"); await p.click("[data-imp-read]");
  await p.click("[data-imp-save]");
  await p.waitForFunction(() => document.querySelector("#toast").textContent === "Saved 4.5 h on Mon 2 Nov. Tue 27 Oct already has a shift then");
  assert.deepEqual(p.errs, []);
});
