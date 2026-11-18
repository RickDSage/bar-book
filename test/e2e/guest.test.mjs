// Talk to a guest, language lessons, and the mic and search understanding loose words. Logged out, so it needs no
// emulator data: live.js is blocked and live translation is faked where a test needs it.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, launch } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });

async function open({ width = 390, ai = false } = {}) {
  const c = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 600, hasTouch: true, timezoneId: "Europe/London" });
  await c.addInitScript(() => (localStorage.setItem("btbar.introSeen", "true"), localStorage.setItem("btbar.walk", JSON.stringify({ bar: 99, floor: 99 }))));
  await c.route("**/live.js", (r) => r.abort());
  const p = await c.newPage();
  p.errs = [];
  p.on("pageerror", (e) => p.errs.push(e.message));
  await p.goto(site.url);
  await p.click("#w-ok");
  if (ai) await p.evaluate(() => { LIVE.api = { aiOn: () => true, aiStart: () => true, translate: async (xs, to) => xs.map((x) => `[${to}] ${x}`) }; });
  return p;
}
const said = (p, q) => p.evaluate((q) => { const h = sdParse(q); return [h.kind, h.say, h.wo || ""]; }, q);

test("🌍 at the top opens the guest hub: welcome by hand, menus, phrases and questions both ways, then back to staff", async () => {
  const p = await open();
  await p.click(".brandbar [data-guest-open]");
  await p.fill("#g-q", "espa");
  await p.click('[data-g-lang="es"]');
  assert.match(await p.textContent(".g-hello"), /¡Hola y bienvenidos a Black Tap!/);
  assert.match(await p.textContent(".g-hello"), /Aquí tienes nuestra carta\. Perdona, no hablo bien tu idioma/);
  await p.click('[data-g-step="main"]');
  assert.match(await p.textContent(".g-tabs"), /Hablar.*Carta.*Alergias/);
  // Use my language opens the menu; Food lists the website's menu with Spanish section names.
  await p.click('[data-g-menu="food"]');
  assert.ok((await p.$$(".g-food")).length > 40);
  assert.match(await p.textContent("#g-body"), /Hamburguesas/);
  await p.click('.g-food [data-g-want]');
  // Talk: a check-back in Spanish with its English, and a guest question shown in English.
  await p.click('[data-g-sec="check"]');
  await p.click('[data-g-phrase="howfood"]');
  await p.click('[data-g-reply="spicy"]');
  const log = await p.textContent("#g-log");
  assert.match(log, /¿Qué tal la comida\?/); assert.match(log, /How's the food\?/); assert.match(log, /Is this spicy\?/); assert.match(log, /I'd like: Hot fried pickles/);
  // Allergies opens the hand-written card.
  await p.click('[data-g-sec="allergy"]');
  await p.click('#g-body [data-g-tab="allergy"]');
  assert.match(await p.textContent(".g-alcard"), /alergia/i);
  await p.click("[data-g-x]");
  assert.equal(await p.isHidden("#guest"), true);
  // Back within 20 minutes: same guest, straight to talk.
  await p.click(".brandbar [data-guest-open]");
  assert.deepEqual(await p.evaluate(() => [GUEST.step, GUEST.c]), ["main", "es"]);
  await p.click("[data-g-new]");
  assert.equal(await p.evaluate(() => GUEST.step), "pick");
  // The language just used is first in the list next time.
  assert.equal(await p.getAttribute(".g-langs .g-lang", "data-g-lang"), "es");
  assert.deepEqual(p.errs, []);
});

test("Twi and Nepali welcome by hand; tapping a word shows what it means with live translation on", async () => {
  const p = await open({ ai: true });
  await p.evaluate(() => guestOpen());
  await p.click('[data-g-lang="tw"]');
  assert.match(await p.textContent(".g-hello"), /Akwaaba!/);
  await p.click('[data-g-step="pick"]');
  await p.click('[data-g-lang="ne"]');
  assert.match(await p.textContent(".g-hello"), /नमस्ते/);
  await p.click('[data-g-step="main"]');
  await p.click('[data-g-tab="talk"]');
  await p.click('[data-g-phrase="greet"]');
  await p.click(".gm-s .g-say .gw");
  await p.waitForFunction(() => !document.querySelector("#enpop").hidden);
  assert.match(await p.textContent("#enpop span"), /= \[English\]/);
  assert.deepEqual(p.errs, []);
});

test("Mic and typing understand loose words: no 'make', withouts, missing, slang and spelt-out names", async () => {
  const p = await open();
  assert.deepEqual(await said(p, "mojito no sugar"), ["drink", "Mojito without sugar syrup", "sugar syrup"]);
  assert.deepEqual(await said(p, "missing limes"), ["86", "86 Limes for everyone?", ""]);
  assert.deepEqual(await said(p, "no more limes"), ["86", "86 Limes for everyone?", ""]);
  assert.equal((await said(p, "I want a margarita"))[1], "Margarita");
  assert.equal((await said(p, "p star"))[1], "Pornstar Martini");
  assert.equal((await said(p, "g and t"))[1], "Gin & Tonic");
  assert.equal((await said(p, "M-O-J-I-T-O"))[1], "Mojito");
  assert.equal((await said(p, "86 the hielo"))[1], "86 Ice for everyone?");
  // Typed in the drinks search, it offers to do it; nothing changes until Yes.
  await p.fill("#q", "86 mint");
  assert.match(await p.textContent("#quick"), /86 Mint for everyone\?/);
  await p.click("#quick [data-sd-typed]");
  assert.match(await p.textContent("#sd-voice"), /Heard “86 mint”/);
  // A without opens the drink with the line marked.
  await p.evaluate(() => { SD.vc.heard = sdParse("mojito no sugar"); sdVoiceGo(); });
  await p.waitForSelector("#sheet .sd-wo");
  assert.match(await p.textContent("#sheet .sd-wo"), /Leave out for this one/);
  // The search box forgives slang too.
  await p.evaluate(() => hideSheet());
  await p.fill("#q", "mojeeto");
  assert.ok(await p.evaluate(() => listIds.map((i) => D[i].name).includes("Mojito")));
  assert.deepEqual(p.errs, []);
});

test("Language lessons: Twi small talk, five mixed questions, counts towards the streak", async () => {
  const p = await open();
  await p.evaluate(() => { PHS.lang = "tw"; PHS.side = "chat"; phSave(); openAt("phrases"); });
  await p.waitForSelector(".ph-say");
  assert.match(await p.textContent("#v-fun"), /Twi · Small talk/);
  for (let i = 0; i < 12 && (await p.$('[data-ph="next"]')); i++) await p.click('[data-ph="next"]');
  for (let i = 0; i < 5; i++) {
    await p.evaluate(() => {
      const q = PRUN.qs[PRUN.q];
      if (q.k === "tiles") { [...q.tiles].sort((a, b) => a.j - b.j).forEach((t) => document.querySelector(`[data-ph-tile="${q.tiles.indexOf(t)}"]`).click()); document.querySelector("[data-ph-tcheck]").click(); }
      else if (q.k === "speak") document.querySelector("[data-ph-sskip]").click();
      else [...document.querySelectorAll("[data-ph-ans]")].find((b) => b.dataset.phAns === q.answer).click();
    });
    await p.click('[data-ph="cnext"]');
  }
  assert.match(await p.textContent("#v-fun"), /Nice one!/);
  assert.ok(await p.evaluate(() => DR.days.includes(fnDay())));
  assert.deepEqual(p.errs, []);
});

test("The bar iPad has Guest in its top bar", async () => {
  const p = await open({ width: 1024 });
  await p.evaluate(() => openAt("tab:station"));
  await p.waitForSelector("#v-station [data-guest-open]");
  await p.click("#v-station [data-guest-open]");
  assert.equal(await p.isVisible("#guest"), true);
  assert.deepEqual(p.errs, []);
});
