// Everything we stock (src/facts.js): search any product and see what its maker says (size, strength, allergens, how
// long it keeps once opened and its use-by if opened today), each fact with its source. Reached from More, Find, the
// line-up and Labels. Never "free from"; anything not found says so.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, launch, phone } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });
const flat = (s) => s.replace(/\s+/g, " ").trim();
const text = async (p, sel) => flat(await p.$eval(sel, (e) => e.textContent));

test("search a product from More and read what the maker says, with its use-by if opened today", async () => {
  const p = await phone(browser, site);
  await p.evaluate(() => show("info"));
  await p.click('#v-info [data-fx-list]');
  await p.waitForSelector("#fx-q");
  await p.fill("#fx-q", "oat milk");
  await p.click('#fx-out [data-fx-open="Oat milk"]');
  const card = await text(p, "#sheet .fx-card");
  assert.match(card, /^Oatly Barista Edition/);
  assert.match(card, /Size1 litre carton/);
  assert.match(card, /Keeps 5 days once opened Maker's guidance/);
  const useBy = await p.evaluate(() => dayName(addDays(shiftDay(), 5)));
  assert.ok(card.includes(`Opened today? Use by ${useBy}`), card);
  // Details fold away; sources are listed with the date they were checked.
  assert.equal(await p.$$eval("#sheet details.fx-more", (xs) => xs.every((x) => !x.open)), true);
  assert.match(await text(p, "#sheet .fx-srcs"), /Oatly/);
  // Back to the list, then a product with an allergen.
  await p.click("#sheet [data-fx-list]");
  await p.fill("#fx-q", "baileys");
  await p.click('#fx-out [data-fx-open]');
  const b = await text(p, "#sheet .fx-card");
  assert.match(b, /Maker says it contains: Milk/);
  assert.match(b, /Always check the label/);
  assert.deepEqual(p.errs, []);
});

test("every card opens without an error, never says free from, and says what's still to find", async () => {
  const p = await phone(browser, site);
  const bad = await p.evaluate(() => fxAll().map((x) => [x.n, fxCardHtml(x.n)]).filter(([, h]) => /free from/i.test(h.replace(/<[^>]+>/g, " "))).map(([n]) => n));
  assert.deepEqual(bad, []);
  // A garnish with nothing from a maker still gets a card, which says so.
  await p.evaluate(() => openFacts("Limes"));
  assert.match(await text(p, "#sheet .fx-card"), /Not found yet/);
  // Sauces are DaVinci Gourmet, 500 g bottles counted each; orgeat is Giffard's 1 litre.
  assert.deepEqual(await p.evaluate(() => [factOf("Chocolate sauce").n, factOf("Chocolate sauce").contains[0], ctRows(true).find((r) => r.item === "Chocolate sauce").u, ctRows(true).find((r) => r.item === "Orgeat").ml]),
    ["DaVinci Belgian Chocolate Sauce", "Soya", "each", 1000]);
  // The count draws each bottle in its kind of outline, with what a full one is and a link to its facts.
  assert.deepEqual(await p.evaluate(() => [ctShape("Jack Daniel's").t, ctShape("Smirnoff").t, (ctBottle(40, "Grey Goose").match(/data-ct-lv/g) || []).length]), ["a square bottle", "a classic spirit bottle", 10]);
  assert.match(await p.evaluate(() => ctRefHtml(ctRows(true).find((r) => r.item === "Baileys"))), /A full one<\/b>: 70 cl[\s\S]*Full 1,370 g on the scale, empty 630 g \(estimate\)[\s\S]*data-fx-open="Baileys"/);
  assert.deepEqual(p.errs, []);
});

test("Find answers a product question, and the line-up opens a bottle's facts", async () => {
  const p = await phone(browser, site);
  await p.click(".brandr [data-guide]");
  await p.fill("#gd-q", "baileys allergens"); await p.waitForTimeout(300);
  assert.equal(await p.$eval("#gd-out .mini", (e) => e.textContent), "What we stock");
  await p.click('#gd-out [data-fx-open]');
  await p.waitForSelector("#sheet .fx-card");
  assert.match(await text(p, "#sheet .fx-card"), /Milk/);
  assert.match(await p.evaluate(() => btServeHtml(BT.find((x) => /Baileys/.test(x.name)))), /data-fx-open="[^"]*Baileys/);
  assert.deepEqual(p.errs, []);
});
