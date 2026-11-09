// Cheat sheets: the laminate pages in the Drinks tab, previewed and printed from the same specs as the app.
// Logged out, so it needs no emulator data: live.js is blocked, as in local.test.mjs.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, launch } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });

async function open() {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, timezoneId: "Europe/London" });
  await c.route("**/live.js", (r) => r.abort());
  const p = await c.newPage();
  p.errs = [];
  p.on("pageerror", (e) => p.errs.push(e.message));
  await p.goto(site.url);
  await p.click("#w-ok");
  return p;
}

test("Cheat sheets: every drink on them is in the app, one sheet previews, and Print all prints them all", async () => {
  const p = await open();
  assert.deepEqual(await p.evaluate(() => CHEAT.missing(csByName)), []);
  await p.click('#subnav [data-tab="sheets"]');
  const n = await p.evaluate(() => CHEAT.SHEETS.length);
  assert.equal(await p.$$eval("#v-sheets [data-cs]", (x) => x.length), n);
  assert.equal(await p.$$eval("#cs-view .cs-row", (x) => x.length), 8);
  assert.match(await p.$eval("#cs-view .cs-page", (e) => e.textContent), /London Cosmo[\s\S]*35 ml/);
  await p.click(`#v-sheets [data-cs="${await p.evaluate(() => CHEAT.SHEETS.findIndex((x) => x.id === "shots"))}"]`);
  assert.equal(await p.$eval("#cs-view .cs-title", (e) => e.textContent), "Shots & Bombs");
  assert.equal(await p.$$eval("#cs-view .cs-row", (x) => x.length), 12);
  // The preview fits the phone's width, no sideways scroll.
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await p.evaluate(() => { window.print = () => { window.printed = document.querySelectorAll("#print .cs-page").length; }; });
  await p.click("[data-cs-all]");
  assert.equal(await p.evaluate(() => window.printed), n);
  await p.click("[data-cs-one]");
  assert.equal(await p.evaluate(() => window.printed), 1);
  assert.deepEqual(p.errs, []);
});

test("Cheat sheets: no spec, method or garnish runs past its row on any sheet", async () => {
  const p = await open();
  await p.evaluate(() => show("sheets"));
  await p.evaluate(() => document.fonts.ready);
  const over = [];
  for (let i = 0; i < (await p.evaluate(() => CHEAT.SHEETS.length)); i++) {
    await p.click(`#v-sheets [data-cs="${i}"]`);
    await p.evaluate(() => document.fonts.ready);
    over.push(...(await p.$$eval("#cs-view .cs-row", (rows) => rows.filter((r) => {
      const end = r.getBoundingClientRect().bottom + 0.5;
      return [...r.querySelectorAll("h3, li, p")].some((x) => x.getBoundingClientRect().bottom > end);
    }).map((r) => r.querySelector("h3").textContent))));
  }
  assert.deepEqual(over, []);
  assert.deepEqual(p.errs, []);
});
