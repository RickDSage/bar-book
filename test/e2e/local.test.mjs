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
  await p.click("[data-tab=allergens]");
  await p.click("[data-al=Sulphites]");
  const sul = await p.$eval("#allist", (e) => e.innerText);
  assert.match(sul, /Negroni/); assert.match(sul, /Aperol Spritz/);
  await p.click("[data-al=Gluten]");
  const glu = await p.$eval("#allist", (e) => e.innerText);
  assert.match(glu, /The Paddington/); assert.match(glu, /The Boilermaker/);
  assert.deepEqual(p.errs, []);
});

test("my pay: September's payslip comes out to the penny, tronc from August's hours", async () => {
  const p = await open({ at: "2026-09-20T12:00:00Z" });
  await p.click("[data-tab=info]");
  assert.match(await p.$eval("#v-info", (e) => e.innerText), /Pay day is usually the last Friday: Friday 25 September/);
  const put = async (k, v) => { await p.fill(`[data-pay="${k}"]`, v); };
  await put("code", "992L"); await put("worked", "200"); await put("rota", "46.39"); await put("lastHours", "82");
  // The payslip helper: £592.95 of tronc for August's 82 hours.
  await p.click("details.setup:has([data-pay=slipTronc]) summary");
  await put("slipTronc", "592.95"); await put("slipHours", "82");
  await p.click("[data-pay-slip]");
  const out = await p.$eval("#pay-out", (e) => e.innerText.replace(/\s+/g, " "));
  assert.match(out, /Hours pay \(246\.4 h\) £3,131\.62 Tronc £592\.95 Gross £3,724\.57 Income tax −£579\.40 National Insurance −£166\.69 Take-home, a month £2,978\.48/);
  // A quiet and a busy month: the same hours, tronc at £5 and £9 an hour of last month's 82.
  await put("low", "5"); await put("high", "9");
  assert.match(await p.$eval("#pay-out", (e) => e.innerText.replace(/\s+/g, " ")), /Quiet month \(£5\.00\/h\) £2,832\.13 Busy month \(£9\.00\/h\) £3,094\.53/);
  await p.click("[data-pay-per=year]");
  assert.match(await p.$eval("#pay-out", (e) => e.innerText.replace(/\s+/g, " ")), /Gross £44,694\.84 .*Take-home, a year £35,741\.76/);
  await p.click("[data-pay-per=week]");
  assert.match(await p.$eval("#pay-out", (e) => e.innerText.replace(/\s+/g, " ")), /Take-home, a week £687\.34/);
  await p.click("[data-pay-per=month]");
  await p.click('[data-pay-tronc="1.00"]');
  assert.match(await p.$eval("#pay-out", (e) => e.innerText), /£82\.00/);
  await p.reload(); await p.click("#w-ok").catch(() => {}); await p.click("[data-tab=info]");
  assert.equal(await p.$eval('[data-pay="code"]', (e) => e.value), "992L", "kept on this phone");
  await put("code", "S1257L");
  assert.match(await p.$eval("#pay-out", (e) => e.innerText), /Check the tax code/);
  assert.deepEqual(p.errs, []);
});
