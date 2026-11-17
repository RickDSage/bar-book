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
  await c.addInitScript(() => (localStorage.setItem("btbar.introSeen", "true"), localStorage.setItem("btbar.walk", JSON.stringify({ bar: 9, floor: 9, "bar:Angel": 9, "floor:Angel": 9 }))));
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
  // More: rows that open Allergens, Practise and Cheat sheets, then the Guide, the bar's reference folded away, then this
  // phone's settings. The More tab stays lit on its pages, and the back button returns to it.
  await p.click("[data-tab=info]");
  assert.deepEqual(await p.$$eval("#v-info .hrow2 b", (x) => x.map((h) => h.textContent)), ["Allergens", "Practise specs", "Cheat sheets", "Games and drills", "Bar station", "Guide: how Bar Book works", "Siri and shortcuts", "Send feedback"]);
  assert.deepEqual(await p.$$eval("#v-info .fold h2", (x) => x.map((h) => h.textContent)), ["Measures and the law", "Technique key and words we use", "Prep and batches",
    "Shot tray, step by step", "Put this app on your home screen", "Reset this phone"]);
  assert.equal(await p.locator("#v-info [data-fold=law][open]").count(), 0, "the reference starts folded");
  await p.click("[data-fold=law] summary");
  assert.match(await p.$eval("[data-fold=law]", (e) => e.innerText), /Jigger everything/);
  await p.click("[data-go=allergens]");
  assert.equal(await p.isVisible("#v-allergens"), true);
  assert.equal(await p.getAttribute("nav.tabs [data-tab=info]", "aria-current"), "page");
  await p.click("#v-allergens [data-back]");
  assert.equal(await p.isVisible("#v-info"), true);
  assert.equal(await p.locator("#v-info [data-fold=law][open]").count(), 1, "a fold stays open when you come back");
  // The tabs fit a 320px phone, each name on one line: Drinks, Shift, Team, My pay and More. Drinks has three modes
  // that fit on one line, never a row that scrolls sideways.
  await p.setViewportSize({ width: 320, height: 640 });
  assert.equal(await p.locator("nav.tabs button:not([hidden])").count(), 5);
  await p.click("nav.tabs [data-tab=drinks]");
  assert.deepEqual(await p.$$eval("#subnav [data-tab]", (x) => x.map((b) => b.textContent)), ["⚡ Rapid fire", "Menu", "Make"]);
  assert.ok(await p.$eval("#subnav", (e) => e.scrollWidth <= e.clientWidth), "the Drinks modes fit");
  // Drinks remembers its mode: Make, then Shift, then Drinks again opens Make.
  await p.click("#subnav [data-tab=make]"); await p.click("nav.tabs [data-tab=tally]"); await p.click("nav.tabs [data-tab=drinks]");
  assert.equal(await p.isVisible("#v-make"), true);
  await p.click("#subnav [data-tab=drinks]");
  // On Menu at the top, tapping Drinks again goes straight into the search.
  await p.click("nav.tabs [data-tab=drinks]");
  assert.equal(await p.evaluate(() => document.activeElement.id), "q");
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

test("recently opened drinks show when you tap the empty search box", async () => {
  const p = await open({ recent: "[3,7,12]" });
  assert.equal(await p.locator("#dpanel").isHidden(), true);
  await p.focus("#q");
  assert.equal(await p.$$eval("#dpanel [data-open]", (x) => x.length), 3);
  await p.fill("#q", "gin");
  assert.equal(await p.locator("#dpanel").isHidden(), true);
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
  assert.equal(await p.$eval('meta[name="theme-color"]', (m) => m.content), "#f3ecdf");
  // Every light text colour keeps WCAG AA (4.5:1) on both the paper page and the white cards.
  const low = await p.evaluate(() => {
    const css = getComputedStyle(document.documentElement), hex = (v) => css.getPropertyValue(v).trim();
    const lum = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
    const ratio = (a, b) => { const [x, y] = [lum(hex(a)), lum(hex(b))].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
    const out = [];
    for (const fg of ["--fg", "--muted", "--brass", "--warn", "--ok", "--cool", "--game"]) for (const bg of ["--bg", "--surface"]) if (ratio(fg, bg) < 4.5) out.push(`${fg} on ${bg}`);
    if (ratio("--brass-ink", "--brass") < 4.5) out.push("--brass-ink on --brass");
    return out;
  });
  assert.deepEqual(low, [], "light colours below 4.5:1");
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
  await p.click("nav.tabs [data-tab=info]"); await p.click("[data-go=allergens]");
  await p.click("[data-al=Sulphites]");
  const sul = await p.$eval("#allist", (e) => e.innerText);
  assert.match(sul, /Negroni/); assert.match(sul, /Aperol Spritz/);
  await p.click("[data-al=Gluten]");
  const glu = await p.$eval("#allist", (e) => e.innerText);
  assert.match(glu, /The Paddington/); assert.match(glu, /The Boilermaker/);
  assert.deepEqual(p.errs, []);
});
