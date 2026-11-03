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

test("typed bottles, typos and ml find the right drinks, ranked ready first", async () => {
  const p = await open();
  await p.fill("#mk-t-make", "el jimandor blanco"); await p.press("#mk-t-make", "Enter");
  await p.fill("#mk-t-make", "Cointreau 20ml"); await p.press("#mk-t-make", "Enter");
  assert.deepEqual(await p.evaluate(() => mk.pick), [{ k: "el jimador blanco" }, { k: "cointreau", ml: 20 }]);
  const text = await out(p);
  assert.match(text, /MAKE IT NOW[\s\S]*Margarita[\s\S]*Ready/i, "a Margarita is ready with the basics on");
  // Turning the basics off leaves the Margarita missing its lime.
  await p.click("[data-mk-opt=basics]");
  assert.match(await out(p), /Margarita[\s\S]*Missing Lime juice/);
  // 10 ml of Cointreau is less than the Margarita's 20 ml, so it says so.
  await p.click("[data-mk-opt=basics]");
  await p.click("[data-mk-ml=cointreau]"); await p.click("[data-mk-setml='10']");
  assert.match(await out(p), /Needs 20 ml Cointreau \(you have 10\)/);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), 390, "nothing wider than the screen");
  assert.deepEqual(p.errs, []);
});

test("a generic pick covers every bottle of its kind, and flavours count as a swap", async () => {
  const p = await open();
  await p.evaluate(() => { mk.pick = [{ k: "vodka" }]; mk.opt.kind = "cocktail"; mkRedraw(); });
  const r = await p.evaluate(() => Object.fromEntries(mkMatches().map((x) => [x.d.name, x])));
  assert.equal(r["Moscow Mule"]?.swaps.length, 0, "any vodka makes a Moscow Mule as it is");
  assert.ok(r["Moscow Mule"].miss.includes("Fever-Tree Ginger Beer"));
  assert.ok(r["London Cosmo"].swaps.some((s) => /Vodka for Cîroc Red Berry/.test(s)), "plain vodka stands in for Cîroc Red Berry");
  assert.deepEqual(p.errs, []);
});

test("My bar is kept on the phone and drives the matches", async () => {
  const p = await open();
  await p.click("[data-mk-pane=bar]");
  await p.fill("#mk-t-bar", "aperol"); await p.press("#mk-t-bar", "Enter");
  await p.fill("#mk-t-bar", "prosecco"); await p.press("#mk-t-bar", "Enter");
  assert.deepEqual(await p.evaluate(() => JSON.parse(localStorage.getItem("btbar.mk.bar"))), ["aperol", "prosecco"]);
  await p.click("[data-mk=frombar] >> nth=0");
  assert.match(await out(p), /MAKE IT NOW[\s\S]*Aperol Spritz/);
  await p.reload(); await p.click("#w-ok"); await p.click("[data-tab=make]");
  assert.match(await out(p), /Aperol Spritz/, "still there after a reload");
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
  assert.match(await p.$eval("#mk-qlist", (e) => e.innerText), /1 drink[\s\S]*Hugo Spritz[\s\S]*25 ml elderflower cordial/);
  assert.deepEqual(p.errs, []);
});
