// Strength, units and calories, serves and batching, ml or oz, ticks, smarter search, filters, spec of the day, lists,
// common mistakes, Rush, Spin by mood and spirit, best next bottles, My drinks and the new starter path.
// Logged out, so it needs no emulator data: live.js is blocked, as in local.test.mjs.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, launch } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });

async function open(hash = "") {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, timezoneId: "Europe/London" });
  await c.route("**/live.js", (r) => r.abort());
  const p = await c.newPage();
  p.errs = [];
  p.on("pageerror", (e) => p.errs.push(e.message));
  await p.goto(site.url + hash);
  await p.click("#w-ok");
  return p;
}
const text = (p, sel) => p.$eval(sel, (e) => e.textContent.trim());

test("every drink gets strength, units and calories, and alcohol-free drinks read as alcohol-free", async () => {
  const p = await open();
  const bad = await p.evaluate(() => D.filter((d) => { const f = plFacts(d); return !(f.vol > 0) || !(f.kcal >= 0) || f.abv > 45 || Number.isNaN(f.units); }).map((d) => d.name));
  assert.deepEqual(bad, []);
  const zero = await p.evaluate(() => D.filter((d) => d.section === "Zero Proof" && !plFacts(d).free).map((d) => d.name));
  assert.deepEqual(zero, []);
  // A Negroni is 75 ml at about 25%: two UK units, give or take.
  const n = await p.evaluate(() => plFacts(D.find((d) => d.name === "Negroni")));
  assert.ok(n.units > 1.8 && n.units < 2.4, `Negroni units ${n.units}`);
  assert.ok(n.abv > 15 && n.abv < 25, `Negroni ABV ${n.abv}`);
  assert.deepEqual(p.errs, []);
});

test("serves go up to 12 with a batching note, ml switches to oz, and spec lines tick off", async () => {
  const p = await open();
  await p.evaluate(() => openSheet(D.find((d) => d.name === "Negroni").id));
  assert.match(await text(p, "#sheet .pl-stats"), /UK units/);
  for (let i = 0; i < 5; i++) await p.click('#sheet .pl-serve button[aria-label="More"]');
  assert.equal(await text(p, "#sheet .pl-serve b"), "×8");
  assert.match(await text(p, "#sheet .pl-batch"), /jug with about \d+ ml of cold water/);
  assert.equal((await p.$$eval("#sheet ul.spec .q", (x) => x.map((e) => e.textContent)))[0], "200 ml");
  await p.click('#sheet [data-pl-oz="1"]');
  assert.match((await p.$$eval("#sheet ul.spec .q", (x) => x.map((e) => e.textContent)))[0], /oz$/);
  await p.click('#sheet [data-pl-oz="0"]');
  await p.click("#sheet ul.spec li >> nth=1");
  assert.equal(await p.$$eval("#sheet ul.spec li.pl-done", (x) => x.length), 1);
  assert.match(await text(p, "#sheet .pl-tips"), /Stir it, don't shake/);
  assert.deepEqual(p.errs, []);
});

test("search fixes typos, understands mocktail, and filters and sort narrow the menu", async () => {
  const p = await open();
  await p.fill("#q", "espreso martni");
  assert.equal(await text(p, "#list .row .n"), "Espresso Martini");
  assert.match(await text(p, "#quick"), /Showing results for/);
  await p.fill("#q", "mocktail");
  const zero = await p.$$eval("#list .row .n", (x) => x.map((e) => e.textContent));
  assert.ok(zero.length > 5 && zero.includes("Virgin Mojito"));
  await p.fill("#q", "");
  await p.click("[data-pl=filters]");
  await p.click('[data-pl-base="gin"]');
  await p.click('[data-pl-how="Stirred"]');
  const gin = await p.evaluate(() => listIds.map((id) => D[id]._b === "gin" && plHowOf(D[id]) === "Stirred"));
  assert.ok(gin.length > 0 && gin.every(Boolean));
  await p.click('[data-pl-sort="strong"]');
  const abvs = await p.evaluate(() => listIds.map((id) => plFacts(D[id]).abv));
  assert.deepEqual(abvs, [...abvs].sort((a, b) => b - a));
  await p.click('#plf [data-pl="clear"]');
  assert.equal(await p.evaluate(() => listIds.length), await p.evaluate(() => D.length));
  assert.deepEqual(p.errs, []);
});

test("spec of the day is the same drink all day, and a shared list opens on just its drinks", async () => {
  const p = await open();
  const name = await text(p, ".pl-daily b");
  assert.equal(name, await p.evaluate(() => plDaily().name));
  const url = await p.evaluate(() => plListUrl("Tonight", D.filter((d) => ["Mojito", "Negroni", "Margarita"].includes(d.name)).map((d) => d.id)));
  const q = await open(url.slice(url.indexOf("#")));
  await q.waitForFunction(() => document.querySelector("#count").textContent === "3 drinks");
  assert.match(await text(q, "#plf .pl-list"), /Tonight · 3 drinks/);
  await q.click('#plf [data-pl="savelist"]');
  assert.equal(await q.evaluate(() => fav.size), 3);
  assert.deepEqual([...p.errs, ...q.errs], []);
});

test("Rush shows ten big cards, and Spin takes a mood and a spirit", async () => {
  const p = await open();
  await p.evaluate(() => show("rapid"));
  await p.click("#rp-rush");
  assert.equal(await p.$$eval(".rush-card", (x) => x.length), 10);
  await p.click('[data-rush="edit"]');
  await p.uncheck('[data-rush-pick="Mojito"]');
  await p.click('[data-rush="done"]');
  assert.equal(await p.$$eval(".rush-card", (x) => x.length), 9);
  await p.click("#rp-rush");
  await p.evaluate(() => show("make"));
  await p.click('[data-mk-pane="rnd"]');
  await p.click('[data-mk-rmode="alc"]');
  await p.click('[data-mk-rbase="gin"]');
  assert.ok(await p.evaluate(() => mkPool().every((d) => d._b === "gin")));
  assert.deepEqual(p.errs, []);
});

test("My drinks saves a recipe on the phone, and the new starter path passes at 8 out of 10", async () => {
  const p = await open();
  await p.evaluate(() => show("make"));
  await p.click('[data-mk-pane="mine"]');
  await p.fill('#mine-form [name="name"]', "House Sour");
  await p.fill('#mine-form [name="spec"]', "50 ml bourbon\n25 ml lemon juice\n20 ml sugar syrup");
  await p.click('#mine-form [type="submit"]');
  assert.equal(await text(p, ".pl-mine .n span"), "House Sour");
  await p.evaluate(() => show("practice"));
  await p.click('[data-pmode="starter"]');
  assert.equal(await p.locator('#pstart [data-qz="starter"]').isDisabled(), true);
  for (let i = 0; i < 8; i++) await p.locator("[data-st-learnt]").nth(i).check();
  await p.click('#pstart [data-qz="starter"]');
  for (let i = 0; i < 10; i++) {
    const n = await p.evaluate(() => [...document.querySelectorAll("#pquiz [data-qz-pick]")].findIndex((x) => x.dataset.qzPick === qz.qs[qz.i].answer));
    await p.locator("#pquiz [data-qz-pick]").nth(n).click();
    await p.click('#pquiz [data-qz="next"]');
  }
  assert.match(await text(p, "#pquiz"), /Passed\. 10 out of 10/);
  assert.ok(await p.evaluate(() => stState().passed));
  assert.deepEqual(p.errs, []);
});
