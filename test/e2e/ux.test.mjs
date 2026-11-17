// Finding your way and sending: the drinks search finds pages too, the section counts follow the search, the Team page's
// Send on WhatsApp card, the Handover pane, the bar station's Send tile and kinds of drink, typing a payslip in by hand,
// and nothing about health going into the team's copy.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, launch, resetEmulators, team } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });

test("the drinks search finds pages, and the section counts follow it", async () => {
  await resetEmulators();
  const { S } = await team(browser, site, [["S", "Kadir"]]);
  await S.click('nav.tabs [data-tab="drinks"]'); await S.click('#subnav [data-tab="drinks"]');
  await S.fill("#q", "handover");
  await S.waitForSelector('#quick [data-goto="send"]');
  await S.click('#quick [data-goto="send"]');
  await S.waitForSelector('#tally [data-pane="send"][aria-selected="true"]');
  assert.equal(await S.$eval('#tally [data-pane="send"]', (b) => b.firstChild.textContent), "Handover");
  await S.click('nav.tabs [data-tab="drinks"]');
  await S.fill("#q", "86");
  await S.waitForSelector('#quick [data-goto="stock"]');
  // A drink word brings no pages, and the row under the search says how many drinks are left.
  await S.fill("#q", "gin");
  assert.equal(await S.$("#quick [data-goto]"), null);
  const all = +(await S.$eval("#dbar .dj", (e) => e.textContent)).match(/\d+/)[0];
  assert.equal(all, await S.evaluate(() => listIds.length));
  assert.ok(all < 301);
  // Kinds of drink are in Filters.
  await S.fill("#q", "");
  await S.click("#dbar [data-dp=filters]");
  await S.click('#dpanel [data-pl-fam="martini"]');
  assert.equal(await S.$eval('#dpanel [data-pl-fam="martini"]', (b) => b.getAttribute("aria-pressed")), "true");
  assert.deepEqual(S.errs, []);
});

test("Send on WhatsApp is the first Team card, with tonight's report, the handover and your own messages", async () => {
  await resetEmulators();
  const { S } = await team(browser, site, [["S", "Kadir"]]);
  await S.click('nav.tabs [data-tab="notices"]');
  assert.equal(await S.$eval("#tm-cards details.tcard:not(.since)", (d) => d.dataset.card), "quick");
  assert.match(await S.$eval('[data-card="quick"] summary', (e) => e.textContent), /^Send on WhatsAppTonight's report, the handover/);
  await S.click('[data-card="quick"] > summary');
  for (const k of ["tonight", "out", "issues", "late", "sick", "swap"]) await S.waitForSelector(`#tc-quick [data-send="${k}"]`);
  await S.click('#tc-quick [data-goto="send"]');
  await S.waitForSelector('#tally [data-pane="send"][aria-selected="true"]');
  assert.deepEqual(S.errs, []);
});

test("an incident write-up stays off the team's database", async () => {
  await resetEmulators();
  const { S } = await team(browser, site, [["S", "Kadir"]]);
  await S.evaluate(() => { show("notices"); openAt("incident"); });
  await S.waitForSelector('#tc-incident [data-send="incident"]');
  assert.equal(await S.$("#inc-mgr"), null);
  assert.match(await S.$eval("#tc-incident", (e) => e.textContent), /never saves it to the team/);
});

test("the bar station sends tonight's report, hands over, and has the kinds of drink", async () => {
  await resetEmulators();
  const { S } = await team(browser, site, [["S", "Kadir"]]);
  await S.setViewportSize({ width: 1180, height: 820 });
  await S.evaluate(() => show("station"));
  await S.waitForSelector('#sx-live [data-send="tonight"]');
  await S.click("#sx-gbtn");
  await S.click('#sx-grp [data-sx-grp="f:margarita"]');
  assert.equal(await S.isVisible("#sx-grp"), false);
  const names = await S.$$eval("#sx-list .sx-open .n", (xs) => xs.map((x) => x.textContent));
  assert.ok(names.length > 2 && names.every((n) => /margarita|paloma|ranch water/i.test(n)), names.join(", "));
  await S.click('#sx-live [data-st-go="send"]');
  await S.waitForSelector('#tally [data-pane="send"][aria-selected="true"]');
  assert.deepEqual(S.errs, []);
});

test("My pay: a payslip typed in by hand is saved like a read one, on the phone only", async () => {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, timezoneId: "Europe/London" });
  await c.addInitScript(() => localStorage.setItem("btbar.introSeen", "true"));
  await c.route("**/live.js", (r) => r.abort());
  const p = await c.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(site.url); await p.click("#w-ok");
  await p.click('nav.tabs [data-tab="pay"]');
  await p.click("[data-ty-open]");
  await p.waitForSelector("#slip-ty");
  const m = await p.$eval("[data-ty-m]", (s) => s.value);
  for (const [k, v] of [["h", "100"], ["rate", "12.71"], ["tronc", "500"], ["tax", "150"], ["ni", "60"]]) await p.fill(`[data-ty="${k}"]`, v);
  await p.click("[data-ty-save]");
  const S = await p.evaluate((m) => JSON.parse(localStorage.getItem("btbar.pay")).slips[m], m);
  assert.equal(S.basicH, 100); assert.equal(S.basicAmt, 1271); assert.equal(S.tronc, 500);
  assert.equal(S.gross, 1771); assert.equal(S.net, 1561); assert.equal(S.typed, true);
  assert.deepEqual(errs, []);
  await c.close();
});
