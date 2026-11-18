// Each phone picks its own language and look. The app's own words change; drink names, specs and allergens never do.
// Logged out, so it needs no emulator data: live.js is blocked, as in local.test.mjs.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, launch } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });

async function open({ colorScheme = "dark" } = {}) {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, timezoneId: "Europe/London", colorScheme });
  await c.addInitScript(() => (localStorage.setItem("btbar.introSeen", "true"), localStorage.setItem("btbar.walk", JSON.stringify({ bar: 99, floor: 99, "bar:Angel": 99, "floor:Angel": 99 }))));
  await c.route("**/live.js", (r) => r.abort());
  const p = await c.newPage();
  p.errs = [];
  p.on("pageerror", (e) => p.errs.push(e.message));
  await p.goto(site.url);
  return p;
}
// The first time a language is picked its words are fetched, so wait for them.
const langIs = (p, c) => p.waitForFunction((c) => document.documentElement.lang === c, c);
const tabs = (p) => p.$$eval("nav.tabs button:not([hidden])", (x) => x.map((b) => b.textContent.trim()));
const text = (p, sel) => p.$eval(sel, (e) => e.textContent.trim());

test("Polish on the welcome screen changes the app's words, numbers included, and it stays after a reload", async () => {
  const p = await open();
  await p.selectOption("#w-lang", "pl"); await langIs(p, "pl");
  assert.equal(await p.evaluate(() => document.documentElement.lang), "pl");
  assert.match(await text(p, "#welcome"), /Każdy nasz napój w Twojej kieszeni\./);
  await p.click("#w-ok");
  assert.deepEqual(await tabs(p), ["Napoje", "Zmiana", "Zespół", "Więcej"]);
  // A phrase with numbers in it is matched with the numbers taken out, and they go back where Polish puts them.
  await p.fill("#q", "gin");
  const n = await p.evaluate(() => listIds.length);
  await p.waitForFunction((n) => document.querySelector("#count").textContent === `Napoje: ${n}`, n);
  await p.fill("#q", "");
  await p.evaluate(() => show("practice"));
  await p.waitForFunction(() => document.querySelector("#pcard .score")?.textContent === "Dobrze: 0, do powtórki: 0");
  await p.reload();
  await p.click("#w-ok");
  assert.deepEqual(await tabs(p), ["Napoje", "Zmiana", "Zespół", "Więcej"]);
  assert.deepEqual(p.errs, []);
});

test("drink names, specs and allergens stay in English, even if a word in them is in the dictionary", async () => {
  const p = await open();
  await p.selectOption("#w-lang", "pl"); await langIs(p, "pl");
  await p.click("#w-ok");
  const d = await p.evaluate(() => { const d = D.find((x) => x.allergens && x.allergens !== "None" && x.spec.length > 1); openSheet(d.id); return { name: d.name, allergens: d.allergens }; });
  await p.waitForFunction(() => document.querySelector("#sheet .how .lab")?.textContent === "Jak przygotować");
  const spec = await p.$$eval("#sheet ul.spec li", (x) => x.map((li) => li.textContent));
  // Put the drink's own words in the dictionary, then translate the whole page again: none of them may change.
  await p.evaluate(({ name, allergens }) => {
    for (const li of document.querySelectorAll("#sheet ul.spec li span")) TR.set(li.textContent.trim(), "ZZZ");
    TR.set(name, "ZZZ"); TR.set(allergens, "ZZZ");
    trTree(document.body);
  }, d);
  assert.equal(await text(p, "#sh-name"), d.name);
  assert.equal(await text(p, "#sheet .allergy span"), d.allergens);
  assert.deepEqual(await p.$$eval("#sheet ul.spec li", (x) => x.map((li) => li.textContent)), spec);
  assert.doesNotMatch(await text(p, "#sheet"), /ZZZ/);
  assert.deepEqual(p.errs, []);
});

test("Urdu reads right to left and fits the screen; English puts every word back", async () => {
  const p = await open();
  await p.click("#w-ok");
  await p.evaluate(() => show("info"));
  await p.selectOption("#v-info select[data-lang]", "ur"); await langIs(p, "ur");
  assert.deepEqual(await p.evaluate(() => [document.documentElement.lang, document.documentElement.dir]), ["ur", "rtl"]);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), 390, "nothing wider than the screen");
  await p.selectOption("#v-info select[data-lang]", ""); await langIs(p, "en-GB");
  assert.deepEqual(await p.evaluate(() => [document.documentElement.lang, document.documentElement.dir]), ["en-GB", "ltr"]);
  assert.deepEqual(await tabs(p), ["Drinks", "Shift", "Team", "More"]);
  assert.equal(await p.locator("[data-en-placeholder],[data-en-aria-label]").count(), 0, "no attribute left translated");
  assert.deepEqual(p.errs, []);
});

test("Gold is black and gold whatever the phone is set to, and stays after a reload", async () => {
  const p = await open({ colorScheme: "light" });
  await p.click("#w-ok");
  await p.evaluate(() => show("info"));
  assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), "light");
  await p.click("[data-theme-pick=gold]");
  const look = () => p.evaluate(() => [document.documentElement.dataset.theme, document.querySelector('meta[name="theme-color"]').content, getComputedStyle(document.body).backgroundColor]);
  assert.deepEqual(await look(), ["gold", "#0a0a0a", "rgb(10, 10, 10)"]);
  assert.equal(await p.getAttribute("[data-theme-pick=gold]", "aria-pressed"), "true");
  await p.reload();
  assert.deepEqual(await look(), ["gold", "#0a0a0a", "rgb(10, 10, 10)"]);
  assert.deepEqual(p.errs, []);
});

test("dates, names in sentences and pop-ups are translated, and EN in the header switches straight back to English", async () => {
  const p = await open();
  await p.selectOption("#w-lang", "pl"); await langIs(p, "pl");
  await p.click("#w-ok");
  // Dates come from the phone's own calendar words; a name inside a sentence is kept as it is.
  const got = await p.evaluate(() => [trLook("Friday 6 November"), trLook("Given to Sam"), trLook("Week of 9 November")]);
  assert.match(got[0], /listopada/);
  assert.equal(got[1], "Przekazane: Sam");
  assert.match(got[2], /^Tydzień od .*listopada/);
  // A confirm() asks in Polish.
  const asked = new Promise((r) => p.once("dialog", async (d) => { r(d.message()); await d.dismiss(); }));
  p.evaluate(() => confirm("Delete this photo?"));
  assert.equal(await asked, "Usunąć to zdjęcie?");
  // One tap back to English, one tap back to Polish.
  assert.equal(await text(p, "#lang-btn"), "EN");
  await p.click("#lang-btn");
  assert.deepEqual(await tabs(p), ["Drinks", "Shift", "Team", "More"]);
  assert.equal(await text(p, "#lang-btn"), "PL");
  await p.click("#lang-btn");
  assert.deepEqual(await tabs(p), ["Napoje", "Zmiana", "Zespół", "Więcej"]);
  assert.deepEqual(p.errs, []);
});

test("what people write gets a Translate button that opens Google Translate in the phone's language", async () => {
  const p = await open();
  await p.selectOption("#w-lang", "pt"); await langIs(p, "pt");
  await p.click("#w-ok");
  await p.evaluate(() => document.querySelector("#welcome").insertAdjacentHTML("afterend", `<p id="ut-test">${ut("Ice machine slow, engineer booked")}</p>`));
  await p.waitForSelector("#ut-test .utx, #ut-test + .utx, #ut-test [data-utx]");
  // The note itself is never run through the app's dictionary.
  assert.equal(await p.$eval("#ut-test [data-ut]", (e) => e.textContent), "Ice machine slow, engineer booked");
  const url = await p.evaluate(() => { let u; const o = window.open; window.open = (x) => { u = x; }; document.querySelector("#ut-test [data-utx]").click(); window.open = o; return u; });
  assert.match(url, /^https:\/\/translate\.google\.com\/\?sl=auto&tl=pt-PT&text=Ice%20machine%20slow/);
  assert.deepEqual(p.errs, []);
});
