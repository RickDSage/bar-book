// The app with no team logins: drinks, allergens and practice work; the shift tools need a login.
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
  assert.equal(await p.locator("#sh-86").count(), 0, "no 86 button without a login");
  await p.evaluate(() => closeSheet());
  await p.click("[data-tab=tally]");
  assert.match(await p.$eval("#tally", (e) => e.innerText), /need team logins/);
  assert.equal(await p.locator("[data-list]").count(), 0, "no checklists without a login");
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), 390, "nothing wider than the screen");
  await p.evaluate(() => show("notices"));
  assert.match(await p.$eval("#team", (e) => e.innerText), /Team logins/i);
  // Bar info: what's in the app, then the bar's own reference, then this phone's settings.
  await p.click("[data-tab=info]");
  assert.deepEqual(await p.$$eval("#v-info h2", (x) => x.map((h) => h.textContent)), ["What's in the app", "Measures and the law", "Technique key", "Prep and batches",
    "Shot tray, step by step", "Feedback and ideas", "Language", "Light or dark", "Put this app on your home screen"]);
  // The tabs fit a 320px phone, each name on one line: Drinks, Shift, Team, My pay and Info, with Make one, Allergens
  // and Practise in the row under Drinks.
  await p.setViewportSize({ width: 320, height: 640 });
  assert.equal(await p.locator("nav.tabs button:not([hidden])").count(), 5);
  await p.click("nav.tabs [data-tab=drinks]");
  assert.deepEqual(await p.$$eval("#subnav [data-tab]", (x) => x.map((b) => b.textContent)), ["Menu", "Make one", "Allergens", "Practise"]);
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
    assert.equal(await p.evaluate(() => shown("fclose").some(([, t]) => t.includes("Toilets"))), toilets, label);
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

test("my pay: its own tab, September's payslip to the penny with tronc from August's hours", async () => {
  const p = await open({ at: "2026-09-20T12:00:00Z" });
  await p.click("[data-tab=pay]");
  const flat = (s) => s.replace(/\s+/g, " ").trim(), out = async () => flat(await p.$eval("#pay-out", (e) => e.innerText));
  assert.equal(await p.$eval("#pay-h", (e) => e.textContent), "September 2026");
  assert.match(flat(await p.$eval("#pay-sum", (e) => e.innerText)), /pay day Friday 25 September/);
  assert.equal(await p.locator("#v-info #pay-h").count(), 0, "not in Bar info any more");
  // Tronc starts at the £5 minimum, with whole-pound buttons.
  assert.equal(await p.inputValue('[data-pay="tronc"]'), "5.00");
  assert.deepEqual(await p.$$eval("[data-pay-tronc]", (bs) => bs.map((b) => b.textContent)), ["£5", "£6", "£7", "£8", "£9", "£10"]);
  await p.click("details.setup summary");
  await p.fill('[data-pay="code"]', "992L"); await p.fill('[data-pay="rota"]', "246.39"); await p.fill('[data-pay-th="2026-08"]', "82");
  await p.fill('[data-pay="tronc"]', "7.2311");
  assert.match(await out(), /Hours pay \(246\.4 h at £12\.71\) £3,131\.62 Tronc \(82 h at £7\.23\) £592\.95 Gross £3,724\.57 Income tax −£579\.40 National Insurance −£166\.69 Take-home £2,978\.48/);
  assert.match(flat(await p.$eval("#pay-sum", (e) => e.innerText)), /£2,978\.48 Take-home Gross £3,724\.57/);
  assert.match(await p.$eval("#pay-set", (e) => e.textContent), /^£12\.71 an hour · 992L$/);
  await p.click('[data-pay-tronc="6"]');
  assert.match(await out(), /Tronc \(82 h at £6\.00\) £492\.00/);
  assert.equal(await p.$eval('[data-pay-tronc="6"]', (b) => b.getAttribute("aria-pressed")), "true");
  await p.fill('[data-pay="tronc"]', "4");
  assert.match(await out(), /^Tronc is at least £5 an hour\./);
  await p.reload(); await p.click("#w-ok").catch(() => {}); await p.click("[data-tab=pay]");
  assert.equal(await p.$eval('[data-pay="code"]', (e) => e.value), "992L", "kept on this phone");
  await p.click("details.setup summary"); await p.fill('[data-pay="code"]', "S1257L");
  assert.match(await out(), /Check the tax code/);
  assert.deepEqual(p.errs, []);
});

test("my hours: several shifts at once, a month at a time, with a student loan and a pension", async () => {
  const p = await open({ at: "2026-11-20T12:00:00Z" });
  await p.click("[data-tab=pay]");
  const flat = (s) => s.replace(/\s+/g, " ").trim();
  const txt = async (sel) => flat(await p.$eval(sel, (e) => e.innerText));
  const toastIs = (t) => p.waitForFunction((x) => document.querySelector("#toast").textContent === x, t);
  const add = async (days, start, end, brk) => {
    if (!(await p.$("#hf"))) await p.click("[data-hf-open]");
    for (const d of days) await p.click(`[data-hf-day="${d}"]`);
    await p.fill('[data-hf="start"]', start); await p.fill('[data-hf="end"]', end);
    await p.click(`[data-hf-brk="${brk}"]`); await p.click("[data-hf-save]");
  };
  assert.match(await txt("#v-pay"), /No shifts logged in November\./);
  // Three days with the same times in one go; the form stays open with the times kept.
  await add(["2026-11-03", "2026-11-10", "2026-11-12"], "17:00", "23:00", 30); await toastIs("Saved 3 shifts, 16.5 h");
  assert.equal(await p.inputValue('[data-hf="start"]'), "17:00");
  assert.equal(await p.$$eval('[data-hf-day][aria-pressed="true"]', (x) => x.length), 0, "the days are cleared");
  assert.equal(await p.$$eval("[data-hf-day].has", (x) => x.length), 3, "logged days are marked");
  // One that overlaps is left out and named; the others still save. Days after today can't be picked.
  await add(["2026-11-12", "2026-11-13"], "22:00", "02:00", 0); await toastIs("Saved 4 h on Fri 13 Nov. Thu 12 Nov already has a shift then");
  assert.equal(await p.$eval('[data-hf-day="2026-11-21"]', (b) => b.disabled), true);
  await add([], "12:00", "18:00", 0); await toastIs("Tap the days you worked");
  await add(["2026-11-19"], "10:00", "10:30", 45); await toastIs("That comes to no hours. Check the times and the break");
  await p.click('[data-hf-day="2026-11-19"]');
  // The most used times are one tap away.
  assert.deepEqual(await p.$$eval("[data-hf-times]", (x) => x.map((b) => b.textContent)), ["17:00–23:00", "22:00–02:00"]);
  await p.click("[data-hf-cancel]");
  assert.match(await txt("#pay-sum"), /^4 Shifts 20\.5 Hours/);
  assert.match(await txt("#v-pay"), /WEEK OF 2 NOV · 5\.5 H Tuesday 3 Nov 17:00–23:00 5\.5 h after a 30 min break · Remove WEEK OF 9 NOV · 15 H Tuesday 10 Nov/);

  // October, from the arrow: one shift that runs past midnight. Next month is as far as it goes.
  assert.equal(await p.$eval('[data-pm="1"]', (b) => b.disabled), true);
  await p.click('[data-pm="-1"]');
  assert.equal(await p.$eval("#pay-h", (e) => e.textContent), "October 2026");
  await p.click("[data-hf-open]");
  await add(["2026-10-31"], "18:00", "03:00", 30); await toastIs("Saved 8.5 h on Sat 31 Oct");
  await p.click("[data-hf-cancel]"); await p.click('[data-pm="1"]');
  assert.match(await txt("#v-pay"), /Hours in October 8\.5 h, logged/);
  assert.equal(await p.locator("[data-pay-th]").count(), 0, "the log replaces typed hours");

  // Remove the 4 h one: 16.5 h logged, plus 150.5 still to work is 167 h at £12.71, and tronc at £6 on October's 8.5 h.
  p.once("dialog", (d) => d.accept());
  await p.click(`[data-hr-del="${await p.evaluate(() => hoursLog.find((x) => x.day === "2026-11-13").id)}"]`);
  await p.fill('[data-pay="rota"]', "150.5"); await p.click('[data-pay-tronc="6"]');
  const out = () => txt("#pay-out");
  assert.match(await out(), /Hours pay \(167 h at £12\.71\) £2,122\.57 Tronc \(8\.5 h at £6\.00\) £51\.00 Gross £2,173\.57 Income tax −£225\.00 National Insurance −£85\.97 Take-home £1,862\.60/);
  // Plan 5 takes 9% over £2,083.33 a month (£3.53, so £3) and a postgraduate loan 6% over £1,750 (£22.35, so £22).
  await p.click("details.setup summary");
  await p.click('[data-pay-loan="5"]'); await p.check('[data-pay-check="pgl"]');
  assert.match(await out(), /Student loan \(Plan 5 and postgraduate\) −£25\.00 Take-home £1,837\.60/);
  // 5% of the hours pay over £520 is £80.13, and tax relief pays a fifth: £64.10.
  await p.fill('[data-pay="pension"]', "5");
  assert.match(await out(), /Pension \(5%\) −£64\.10 Take-home £1,773\.50/);
  assert.equal(await p.$eval("#pay-set", (e) => e.textContent), "£12.71 an hour · 1257L · Plan 5 · postgraduate loan · 5% pension");
  await p.fill('[data-pay="rate"]', "11");
  assert.match(await out(), /^£11\.00 an hour is under £12\.71, the legal minimum at 21 and over\./);
  await p.fill('[data-pay="rate"]', "12.71");
  assert.doesNotMatch(await out(), /legal minimum/);

  // Everything stays on this phone.
  await p.reload(); await p.click("#w-ok").catch(() => {}); await p.click("[data-tab=pay]");
  assert.match(await txt("#pay-sum"), /^3 Shifts 16\.5 Hours £1,773\.50 Take-home/);
  assert.equal(await p.$eval('[data-pay-loan="5"]', (b) => b.getAttribute("aria-pressed")), "true");
  assert.deepEqual(await p.evaluate(() => SHARE.hours()), ["My hours for November", "My hours for November\nTue 3 Nov 17:00–23:00, 30 min break: 5.5 h\nTue 10 Nov 17:00–23:00, 30 min break: 5.5 h\nThu 12 Nov 17:00–23:00, 30 min break: 5.5 h\nIn all: 16.5 h from 3 shifts"]);
  await p.setViewportSize({ width: 320, height: 700 });
  await p.click("[data-hf-open]");
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), 320, "nothing wider than a small phone");
  assert.deepEqual(p.errs, []);
});

test("my pay: where the venue uses the rota, the rest of the month's shifts are one tap away", async () => {
  const p = await open({ at: "2026-11-20T12:00:00Z" });
  // This person's published shifts: only those still to come this month count, before breaks.
  await p.evaluate(() => {
    Object.assign(LIVE, { me: "Sam Staff", uid: "u1" }); LIVE.loaded.add("shifts");
    const s = (day, start, end, x = {}) => ({ pub: true, who: "u1", day, start, end, ...x });
    LIVE.shifts = [s("2026-11-19", "18:00", "02:00"), s("2026-11-25", "18:00", "02:00"), s("2026-11-28", "12:00", "20:30"), s("2026-11-26", "12:00", "20:00", { pub: false }),
      s("2026-11-27", "12:00", "20:00", { who: "u2" }), s("2026-12-02", "12:00", "20:00")];
  });
  await p.click("[data-tab=pay]");
  await p.click("[data-pay-rota]");
  assert.equal(await p.inputValue('[data-pay="rota"]'), "16.5");
  assert.equal(await p.locator("[data-pay-rota]").count(), 0, "gone once it's used");
  await p.evaluate(() => LIVE.off.add("rota"));
  await p.evaluate(() => renderPay());
  await p.fill('[data-pay="rota"]', "3"); await p.evaluate(() => renderPay());
  assert.equal(await p.locator("[data-pay-rota]").count(), 0, "not where the rota is switched off");
  assert.deepEqual(p.errs, []);
});
