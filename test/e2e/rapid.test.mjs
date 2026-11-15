// Rapid fire (the house drinks as big buttons) and the Black Tap line-up in Make: one tap from the start page,
// specs on the page, the line-up's serve cards and classics, and several specs sent as one WhatsApp message.
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
  return p;
}

test("Rapid fire is one tap from the start page and lists the house cocktails first", async () => {
  const p = await open(320);
  await p.click("#w-rapid");
  assert.equal(await p.isVisible("#v-rapid"), true);
  const secs = await p.$$eval("#rp-out .sec", (x) => x.map((s) => s.firstChild.textContent));
  assert.deepEqual(secs, ["House cocktails", "Guests ask for", "Shots and bombs", "No alcohol", "Serves"]);
  const first = await p.$eval("#rp-out .rp-grid", (g) => [...g.querySelectorAll(".n")].map((n) => n.textContent));
  assert.ok(first.includes("London Cosmo") && first.includes("The Rockefeller"));
  // Specs on the page, kept on the phone; search reaches the whole book.
  await p.click("#rp-specs");
  assert.match(await p.$eval("#rp-out", (e) => e.innerText), /London Cosmo\s+35 ml Cîroc Red Berry · 15 ml Cointreau/);
  assert.equal(await p.evaluate(() => localStorage.getItem("btbar.rapid.specs")), "true");
  await p.fill("#rp-q", "zombie");
  assert.match(await p.$eval("#rp-out", (e) => e.innerText), /EVERYTHING ELSE[\s\S]*Zombie/i);
  // A tap opens the full spec, and swiping on stays in the same list.
  await p.fill("#rp-q", "");
  await p.click("[data-rp] >> nth=0");
  assert.equal(await p.evaluate(() => ctx.length), await p.evaluate(() => RAPID.ids.length));
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), 320, "nothing wider than the screen");
  assert.deepEqual(p.errs, []);
});

test("the Black Tap line-up: serve cards, classics, the shelf and My bar", async () => {
  const p = await open();
  await p.click("#w-ok");
  await p.click("nav.tabs [data-tab=drinks]"); await p.click("#subnav [data-tab=make]");
  // The shelf opens on the line-up.
  const shelf = await p.$$eval(".mk-shelf .chip", (x) => x.map((c) => c.textContent));
  for (const n of ["Sprite", "Fanta Orange Zero", "Monin Salted Caramel", "Funkin peach purée", "Tomato juice", "Smirnoff", "Cîroc Red Berry", "El Jimador Reposado", "Bulleit Bourbon", "Egg white", "Aquafaba", "Guinness", "Camden Off Menu IPA", "Kopparberg Mixed Fruit 0%", "Red Bull Sugarfree", "Coke Zero"])
    assert.ok(shelf.includes(n), n);
  await p.click("[data-mk-pane=bt]");
  const cls = await p.evaluate(() => btClassics("all"));
  assert.equal(cls.house.length, 8, "every house cocktail");
  assert.ok(cls.ready.some((r) => r.d.name === "Margarita") && cls.ready.some((r) => r.d.name === "Gin & Tonic"));
  assert.match(await p.$eval("#bt-out", (e) => e.innerText), /HOUSE COCKTAILS[\s\S]*READY WITH THE LINE-UP/i);
  await p.click("[data-bt-view=Draught]");
  const t = await p.$eval("#bt-out", (e) => e.innerText);
  assert.match(t, /Guinness\s+4\.2%[\s\S]*Two-part pour/);
  assert.match(t, /Pint, half or two-thirds/);
  await p.click("[data-bt-view='Postmix (gun)']");
  assert.match(await p.$eval("#bt-out", (e) => e.innerText), /Coke \(gun\)[\s\S]*Fanta Zero \(gun\)[\s\S]*Hold the gun just above the glass/);
  await p.click("[data-bt-view='Juices, syrups and purées']");
  assert.match(await p.$eval("#bt-out", (e) => e.innerText), /Tomato juice[\s\S]*Funkin passion fruit purée/);
  await p.click("[data-bt-view=Draught]");
  // Drinks with it starts an order from that one item.
  await p.click("[data-bt-use='guinness']");
  assert.deepEqual(await p.evaluate(() => mk.pick), [{ k: "guinness" }]);
  assert.match(await p.$eval("#mk-out", (e) => e.innerText), /DRINKS WITH GUINNESS[\s\S]*Black Velvet/i);
  // The line-up goes into My bar in one tap.
  await p.click("[data-mk-pane=bar]"); await p.click("[data-mk=btbar]");
  const bar = await p.evaluate(() => mk.bar);
  assert.ok(bar.includes("tanqueray") && bar.includes("kopparberg crisp apple") && bar.includes("orange juice"));
  assert.deepEqual(p.errs, []);
});

test("several specs go out as one WhatsApp message, a tick box each", async () => {
  const p = await open();
  await p.click("#w-ok");
  await p.click("#secs [data-sec='Signatures']");
  await p.click("#list [data-send=specs]");
  const boxes = await p.$$eval("#send [data-send-part]", (x) => x.map((b) => b.checked));
  assert.equal(boxes.length, 8); assert.ok(boxes.every(Boolean));
  const text = await p.evaluate(() => msgText(sndMsg(), snd.pick, "", true));
  assert.match(text, /^\*Drink specs · Black Tap Soho\*\n8 drinks\./);
  assert.match(text, /\*London Cosmo\*\n• 35 ml Cîroc Red Berry\n• 15 ml Cointreau[\s\S]*How: /);
  assert.doesNotMatch(text, /Garnish: None/);
  // Unticking a drink takes it out.
  await p.click("#send [data-send-part='d" + (await p.evaluate(() => D.find((d) => d.name === "London Cosmo").id)) + "']");
  assert.doesNotMatch(await p.$eval("#send-pre", (e) => e.innerText), /London Cosmo/);
  assert.deepEqual(p.errs, []);
});
