// One search everywhere: the menu, Rapid fire and Make all find drinks by any ingredient or mixer, forgiving spacing and
// typos, and the Make picker finds every stocked mixer and bottle. Every Send page can go as a text message too.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, launch } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });

async function open() {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, timezoneId: "Europe/London" });
  await c.addInitScript(() => localStorage.setItem("btbar.introSeen", "true"));
  await c.route("**/live.js", (r) => r.abort());
  const p = await c.newPage();
  p.errs = []; p.on("pageerror", (e) => p.errs.push(e.message));
  await p.goto(site.url); await p.click("#w-ok");
  return p;
}
const menu = async (p, q) => { await p.fill("#q", q); return p.$$eval("#list .row .n", (xs) => xs.map((x) => x.textContent)); };

test("the menu finds drinks by mixer: red bull however it's typed, tonic, g&t, ginger beer, and gin without ginger", async () => {
  const p = await open();
  const rb = await menu(p, "red bull");
  assert.equal(rb[0], "Vodka Red Bull");
  assert.ok(rb.includes("Jägerbomb"));
  assert.ok(!rb.includes("Boulevardier") && !rb.includes("Old Fashioned"), "stirRED and BULLeit don't count");
  for (const q of ["redbull", "redbul", "Red Bull"]) assert.deepEqual(await menu(p, q), rb, q);
  // Still typing: the Red Bull drinks come first.
  assert.deepEqual((await menu(p, "red bul")).slice(0, rb.length), rb);
  const vrb = await menu(p, "vodka redbull");
  assert.equal(vrb[0], "Vodka Red Bull");
  assert.ok(vrb.every((n) => rb.includes(n)));
  const tonic = await menu(p, "tonic");
  assert.ok(tonic.includes("Gin & Tonic") && tonic.length >= 5);
  assert.deepEqual(await menu(p, "g&t"), tonic);
  assert.deepEqual(await menu(p, "g and t"), tonic);
  assert.deepEqual(await menu(p, "gingerbeer"), await menu(p, "ginger beer"));
  assert.ok((await menu(p, "ginger beer")).includes("Moscow Mule"));
  const gin = await menu(p, "gin");
  assert.ok(gin.includes("Negroni") && !gin.includes("Moscow Mule"), "gin finds the Tanqueray drinks, not ginger beer");
  assert.ok(!(await menu(p, "coke")).includes("Piña Colada"));
  assert.deepEqual(await menu(p, "jd and coke"), ["Jack & Coke"]);
  assert.deepEqual(p.errs, []);
});

test("Rapid fire and Make's quick search use the same search", async () => {
  const p = await open();
  await p.evaluate(() => show("rapid"));
  await p.fill("#rp-q", "redbull");
  const rapid = await p.$$eval("#rp-out [data-rp]", (xs) => xs.map((x) => D[+x.dataset.rp].name));
  assert.ok(rapid.includes("Vodka Red Bull") && rapid.includes("Jägerbomb"));
  const make = await p.evaluate(() => { mk.qs.q = "redbull"; return mkQsList(); });
  assert.match(make, /Vodka Red Bull/);
  assert.deepEqual(p.errs, []);
});

test("Make's ingredient picker finds every stocked mixer and bottle, and each can go on the 86 board with a swap", async () => {
  const p = await open();
  const sugg = (q) => p.evaluate((q) => mkSuggest(q)[0]?.n, q);
  assert.equal(await sugg("redbull"), "Red Bull");
  assert.equal(await sugg("red bull sugar free"), "Red Bull Sugarfree");
  assert.equal(await sugg("light tonic"), "Fever-Tree Light Tonic");
  assert.equal(await sugg("gingerbeer"), "Fever-Tree Ginger Beer");
  assert.equal(await sugg("ginger ale"), "Fever-Tree Ginger Ale");
  assert.equal(await sugg("corona cero"), "Corona Cero");
  assert.equal(await sugg("san miguel 0.0"), "San Miguel 0,0");
  assert.equal(await sugg("diet coke"), "Diet Coke");
  // Every one is on the 86 list, and stands for the right ingredient.
  const board = await p.evaluate(() => ["Tonic", "Light tonic", "Ginger beer", "Ginger ale", "Red Bull", "Red Bull Sugarfree", "Coke bottles", "Coke Zero bottles", "Diet Coke bottles", "Corona bottles", "Corona Cero", "San Miguel 0,0"]
    .map((n) => [n, STOCK_FLAT.includes(n), (MK.byKey.get(mkNorm(n)) || mkFind(n))?.n]));
  assert.deepEqual(board.filter(([, on, it]) => !on || !it), [], "missing from the 86 list or matched to nothing");
  // Red Bull out: the bombs swap to Sugarfree.
  const swap = await p.evaluate(() => { OUT_LOCAL.add("Red Bull"); return plSwapFor(D.find((d) => d.name === "Jägerbomb"), MK.byKey.get("red bull")); });
  assert.match(swap, /Red Bull Sugarfree/);
  assert.deepEqual(p.errs, []);
});

test("every Send page has a Text button that opens a text message with the words, without WhatsApp's stars", async () => {
  const p = await open();
  await p.evaluate(() => openSend("drink", String(D.find((d) => d.name === "Negroni").id)));
  await p.waitForSelector('#send a[data-via="sms"]');
  await p.evaluate(() => { const a = document.querySelector('#send a[data-via="sms"]'); a.addEventListener("click", (e) => e.preventDefault(), { once: true }); a.click(); });
  const href = await p.$eval('#send a[data-via="sms"]', (a) => a.href);
  assert.match(href, /^sms:[?&]body=/);
  const body = decodeURIComponent(href.replace(/^sms:[?&]body=/, ""));
  assert.match(body, /Negroni/);
  assert.doesNotMatch(body.split("\n")[0], /^\*/);
  assert.deepEqual(p.errs, []);
});

test("every message ends with a link back to the same thing, and the link opens it after Bar or Floor", async () => {
  const p = await open();
  const id = await p.evaluate(() => D.find((d) => d.name === "Espresso Martini").id);
  const msg = await p.evaluate((id) => shareText("drink", true, String(id)), id);
  const link = msg.split("\n").at(-1);
  assert.match(link, /^Open in Bar Book: http:\/\/127\.0\.0\.1:\d+\/#d=espresso-martini$/);
  assert.match(await p.evaluate(() => shareText("pars")), /\nOpen in Bar Book: .*#at=morning$/);
  assert.doesNotMatch(await p.evaluate(() => shareText("pars")), /join=/);
  // Opening it: the start screen, then straight to the spec.
  const q = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  await q.addInitScript(() => localStorage.setItem("btbar.introSeen", "true"));
  await q.route("**/live.js", (r) => r.abort());
  const r = await q.newPage();
  await r.goto(link.replace("Open in Bar Book: ", ""));
  await r.click("#w-ok");
  await r.waitForFunction(() => !document.querySelector("#sheet").hidden);
  assert.match(await r.$eval("#sheet", (e) => e.innerText), /Espresso Martini/);
  assert.equal(await r.evaluate(() => location.hash), "");
  assert.deepEqual(p.errs, []);
});
