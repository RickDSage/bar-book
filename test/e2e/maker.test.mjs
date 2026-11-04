// The cocktail maker (Make tab): picking and typing ingredients, My bar, ranked matches, the randomiser and quick specs.
// It runs on the phone alone, so live.js is blocked here, as with no team logins.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, launch } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });

async function open(width = 390) {
  const c = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, timezoneId: "Europe/London", colorScheme: "dark", reducedMotion: "reduce" });
  await c.route("**/live.js", (r) => r.abort());
  const p = await c.newPage();
  p.errs = [];
  p.on("pageerror", (e) => p.errs.push(e.message));
  await p.goto(site.url);
  await p.click("#w-ok");
  await p.click("[data-tab=make]");
  return p;
}
const out = (p) => p.$eval("#mk-out", (e) => e.innerText);

test("every ingredient in every spec is in the maker's list", async () => {
  const p = await open();
  assert.deepEqual(await p.evaluate(() => MK.unmatched), []);
  assert.deepEqual(p.errs, []);
});

test("tapping an ingredient lists its drinks straight away, and each tap narrows them", async () => {
  const p = await open();
  await p.click(".mk-shelf [data-mk-pick='vodka']");
  const n1 = await p.evaluate(() => mkOrder().all.length);
  assert.ok(n1 > 30, `every vodka drink lists (${n1})`);
  assert.match(await out(p), /DRINKS WITH VODKA[\s\S]*Black Russian/i);
  // "Goes with" offers the next ingredient; tapping it keeps only drinks with both.
  await p.click(".mk-goes [data-mk-pick='cranberry juice']");
  const both = await p.evaluate(() => mkOrder().all.map((r) => r.d.name));
  assert.ok(both.includes("Woo Woo") && both.includes("Sea Breeze") && both.length < n1);
  assert.match(await out(p), /DRINKS WITH VODKA \+ CRANBERRY JUICE/i);
  // Typos and ml from the type box: El Jimador for "el jimandor", and a drink needing more than you have says so.
  await p.click("[data-mk=clear] >> nth=0");
  await p.fill("#mk-t-make", "el jimandor blanco"); await p.press("#mk-t-make", "Enter");
  await p.fill("#mk-t-make", "Cointreau 10ml"); await p.press("#mk-t-make", "Enter");
  assert.deepEqual(await p.evaluate(() => mk.pick), [{ k: "el jimador blanco" }, { k: "cointreau", ml: 10 }]);
  assert.match(await out(p), /Margarita[\s\S]*Needs 20 ml Cointreau \(you have 10\)/);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), 390, "nothing wider than the screen");
  assert.deepEqual(p.errs, []);
});

test("an order nothing in the book has gets the closest drinks and a make-your-own spec", async () => {
  const p = await open();
  await p.evaluate(() => { mk.pick = [{ k: "vodka" }, { k: "apple juice" }, { k: "vanilla syrup" }]; mkRedraw(); });
  const text = await out(p);
  assert.match(text, /No drink in the book has all of Vodka \+ Apple juice \+ Vanilla syrup/);
  assert.match(text, /MAKE YOUR OWN · A SOUR\s+50 ml Vodka\s+50 ml Apple juice\s+25 ml Lime juice\s+20 ml Vanilla syrup/i);
  assert.match(text, /CLOSEST IN THE BOOK[\s\S]*No apple juice/i);
  // Alcohol-free picks make a mocktail; Aperol and Prosecco make a spritz-style list from the book.
  await p.evaluate(() => { mk.pick = [{ k: "apple juice" }, { k: "vanilla syrup" }]; mkRedraw(); });
  assert.match(await out(p), /MAKE YOUR OWN · A MOCKTAIL/i);
  await p.evaluate(() => { mk.pick = [{ k: "aperol" }, { k: "prosecco" }]; mkRedraw(); });
  assert.ok((await p.evaluate(() => mkOrder().all.map((r) => r.d.name))).includes("Aperol Spritz"));
  // A generic pick covers every bottle of its kind; flavoured cousins count as a close swap.
  await p.evaluate(() => { mk.pick = [{ k: "vodka" }]; mkRedraw(); });
  const r = await p.evaluate(() => Object.fromEntries(mkOrder().all.map((x) => [x.d.name, x.cover])));
  assert.equal(r["Moscow Mule"], 1);
  assert.equal(r["London Cosmo"], 0.7, "Cîroc Red Berry is a flavoured vodka");
  assert.deepEqual(p.errs, []);
});

test("My bar is kept on the phone and drives the matches", async () => {
  const p = await open();
  await p.click("[data-mk-pane=bar]");
  await p.fill("#mk-t-bar", "aperol"); await p.press("#mk-t-bar", "Enter");
  await p.fill("#mk-t-bar", "prosecco"); await p.press("#mk-t-bar", "Enter");
  assert.deepEqual(await p.evaluate(() => JSON.parse(localStorage.getItem("btbar.mk.bar"))), ["aperol", "prosecco"]);
  await p.click("[data-mk=frombar] >> nth=0");
  assert.match(await out(p), /From My bar[\s\S]*MAKE IT NOW[\s\S]*Aperol Spritz/i);
  await p.reload(); await p.click("#w-ok"); await p.click("[data-tab=make]");
  assert.deepEqual(await p.evaluate(() => mk.bar), ["aperol", "prosecco"], "still there after a reload");
  await p.click("[data-mk=frombar]");
  assert.match(await out(p), /Aperol Spritz/);
  // Opening a match swipes through the other matches.
  await p.click("[data-mk-open] >> nth=0");
  assert.equal(await p.evaluate(() => ctx.length), await p.evaluate(() => MK.ids.length));
  await p.evaluate(() => closeSheet());
  // Loading the whole Black Tap bar makes every drink in the book.
  await p.click("[data-mk-pane=bar]"); await p.click("[data-mk=bt]");
  assert.equal(await p.evaluate(() => D.filter((d) => !mkCanMake(d)).map((d) => d.name).join(", ")), "");
  assert.deepEqual(p.errs, []);
});

test("the randomiser keeps to alcohol-free when asked, and quick specs search", async () => {
  const p = await open();
  await p.click("[data-mk-pane=rnd]"); await p.click("[data-mk-rmode=zero]");
  for (let i = 0; i < 6; i++) {
    await p.click("[data-mk=spin]");
    const id = await p.evaluate(() => mk.rnd.cur);
    assert.equal(await p.evaluate((n) => mkKids(D[n]), id), "zero");
  }
  await p.click("[data-mk-rmode=alc]"); await p.click("[data-mk-rkind=spritz]"); await p.click("[data-mk=spin]");
  assert.match(await p.evaluate(() => D[mk.rnd.cur].section), /Spritz/);
  await p.click("[data-mk-pane=qs]"); await p.fill("#mk-qs", "hugo");
  assert.match(await p.$eval("#mk-qlist", (e) => e.innerText), /Hugo Spritz[\s\S]*25 ml elderflower cordial/);
  assert.deepEqual(p.errs, []);
});
