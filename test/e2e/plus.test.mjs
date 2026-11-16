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
  await c.addInitScript(() => localStorage.setItem("btbar.introSeen", "true"));
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
  await p.click("[data-pl=filters] >> nth=0");
  await p.click('[data-pl-base="gin"]');
  await p.click('[data-pl-how="Stirred"]');
  const gin = await p.evaluate(() => listIds.map((id) => D[id]._b === "gin" && plHowOf(D[id]) === "Stirred"));
  assert.ok(gin.length > 0 && gin.every(Boolean));
  await p.click('[data-pl-sort="strong"]');
  const abvs = await p.evaluate(() => listIds.map((id) => plFacts(D[id]).abv));
  assert.deepEqual(abvs, [...abvs].sort((a, b) => b - a));
  // What the guest fancies is in the same place; Done shows how many match.
  await p.click('[data-pl-flav="Sweet"]');
  assert.ok(await p.evaluate(() => listIds.every((id) => flavHit(D[id]))));
  assert.match(await text(p, '.pl-row .btn.pri'), /^Show \d+ drinks?$/);
  await p.click('.pl-row .btn.pri');
  // Each filter that's on shows as a chip, and a tap takes just that one off.
  assert.deepEqual(await p.$$eval("#plf .pl-off", (x) => x.map((e) => e.textContent)), ["Gin", "Sweet", "Stirred"]);
  await p.click('#plf [data-pl-off="flav"]');
  assert.deepEqual(await p.$$eval("#plf .pl-off", (x) => x.map((e) => e.textContent)), ["Gin", "Stirred"]);
  await p.click('#plf [data-pl="clear"]');
  assert.equal(await p.evaluate(() => listIds.length), await p.evaluate(() => D.length));
  // A to Z: letters to jump to, and a heading over each letter.
  await p.click("[data-pl=filters] >> nth=0");
  await p.click('[data-pl-sort="az"]');
  await p.click('.pl-row .btn.pri');
  const letters = await p.$$eval("#list .azbar button", (x) => x.map((e) => e.textContent));
  assert.ok(letters.includes("A") && letters.includes("M"));
  await p.click('#list .azbar [data-az="M"]');
  await p.waitForFunction(() => Math.abs(document.querySelector("#az-M").getBoundingClientRect().top) < 400);
  assert.match(await text(p, "#secs"), /All \d+/);
  await p.click("[data-pl=filters] >> nth=0"); await p.click('[data-pl-sort="menu"]');
  await p.click('.pl-row .btn.pri');
  // Kinds of drink, one tap above the menu.
  await p.click('#quick [data-fam="margarita"]');
  const ritas = await p.$$eval("#list .row .n", (x) => x.map((e) => e.textContent));
  assert.ok(ritas.includes("Margarita") && ritas.includes("Paloma") && !ritas.includes("Mojito"));
  await p.click('#quick [data-fam="spritz"]');
  assert.ok((await p.$$eval("#list .row .n", (x) => x.map((e) => e.textContent))).includes("Aperol Spritz"));
  await p.click('#quick [data-fam="spritz"]');
  assert.equal(await p.evaluate(() => listIds.length), await p.evaluate(() => D.length));
  // Your own list: saved on the phone, opened in one tap, and deleted.
  await p.click('#quick [data-fam="martini"]');
  await p.click("[data-pl-share]");
  await p.fill("#pl-ln", "Tonight's specials");
  await p.click('[data-pl-l="save"]');
  await p.click("#sh-close");
  await p.click('#quick [data-fam="martini"]');
  await p.click('#quick [data-mylist="0"]');
  assert.match(await text(p, "#plf .pl-list"), /Tonight's specials · \d+ drinks/);
  assert.ok((await p.$$eval("#list .row .n", (x) => x.map((e) => e.textContent))).includes("Espresso Martini"));
  p.once("dialog", (d) => d.accept());
  await p.click('#plf [data-pl="droplist"]');
  assert.equal(await p.locator('#quick [data-mylist]').count(), 0);
  assert.deepEqual(p.errs, []);
});

test("spec of the day is the same drink all day, and a shared list opens on just its drinks", async () => {
  const p = await open();
  await p.evaluate(() => show("fun"));
  const name = await text(p, "#v-fun .pl-daily b");
  assert.equal(name, await p.evaluate(() => plDaily().name));
  const url = await p.evaluate(() => plListUrl("Tonight", D.filter((d) => ["Mojito", "Negroni", "Margarita"].includes(d.name)).map((d) => d.id)));
  const q = await open(url.slice(url.indexOf("#")));
  await q.waitForFunction(() => document.querySelector("#count").textContent === "3 drinks");
  assert.match(await text(q, "#plf .pl-list"), /Tonight · 3 drinks/);
  await q.click('#plf [data-pl="savelist"]');
  assert.equal(await q.evaluate(() => fav.size), 3);
  assert.deepEqual([...p.errs, ...q.errs], []);
});

test("Rapid fire opens on the top 10 as big cards, and Spin (under More) takes a mood and a spirit", async () => {
  const p = await open();
  await p.evaluate(() => show("rapid"));
  assert.equal(await p.$$eval(".rush-card", (x) => x.length), 10);
  assert.ok(await p.$$eval(".rp-tile", (x) => x.length) > 10);
  await p.click('[data-rush="edit"]');
  await p.uncheck('[data-rush-pick="Mojito"]');
  await p.click('[data-rush="done"]');
  assert.equal(await p.$$eval(".rush-card", (x) => x.length), 9);
  await p.fill("#rp-q", "rum");
  assert.equal(await p.$$eval(".rush-card", (x) => x.length), 0);
  await p.click("nav.tabs [data-tab=info]"); await p.click("[data-go=fun]");
  assert.match(await text(p, "#v-fun .pl-daily b"), /\w/);
  await p.click('[data-mk-rmode="alc"]');
  await p.click('[data-mk-rbase="gin"]');
  assert.ok(await p.evaluate(() => mkPool().every((d) => d._b === "gin")));
  await p.click('#v-fun [data-mk="spin"]');
  await p.waitForSelector("#v-fun #mk-card");
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

test("We're out of Passoa: the drink, the menu, Rapid fire and Make all show the swap, and Back in clears it", async () => {
  const p = await open();
  const id = await p.evaluate(() => D.find((d) => d.name === "Pornstar Martini").id);
  await p.evaluate((i) => openSheet(i), id);
  await p.click('#sheet details.pl-outs summary');
  const key = await p.evaluate(() => mkFind("Passoa").k);
  await p.click(`#sheet [data-pl-out="${key}"]`);
  assert.match(await text(p, "#sheet .pl-outbar"), /No Passoa: .*Monin Passion Fruit/);
  assert.equal(await p.$$eval("#sheet ul.spec li.pl-out", (x) => x.length), 1);
  assert.match(await text(p, "#sheet ul.spec li.pl-out .pl-swap"), /Passion Fruit/);
  // Kept on this phone off the team.
  assert.deepEqual(await p.evaluate(() => store.get("outIng")), ["Passoa"]);
  await p.click("#sh-close");
  await p.waitForFunction(() => $("#sheet").hidden);
  assert.match(await p.$eval(`#list .row[data-id="${id}"] .s`, (e) => e.textContent), /Swap: no Passoa/);
  await p.evaluate(() => show("rapid"));
  assert.match(await p.$eval(`.rush-card[data-rp="${id}"]`, (e) => e.textContent), /Swap: no Passoa/);
  // Back in stock clears it everywhere.
  await p.evaluate((i) => openSheet(i), id);
  await p.click(`#sheet [data-pl-out="${key}"]`);
  assert.equal(await p.$$eval("#sheet .pl-outbar", (x) => x.length), 0);
  assert.deepEqual(await p.evaluate(() => store.get("outIng")), []);
  assert.deepEqual(p.errs, []);
});

test("out of an ingredient with no swap: the drink offers something close, and Spin, Spec of the day and My bar skip it", async () => {
  const p = await open();
  await p.evaluate(() => { store.set("outIng", []); OUT_LOCAL.clear(); OUT_LOCAL.add("Espresso beans"); plOutRefresh(); });
  const r = await p.evaluate(() => { const d = D.find((x) => x.name === "Espresso Martini"); const o = plOutOf(d); return { ok: o.ok, miss: o.miss.map((m) => m.it.n), alts: plAlts(d).map((x) => plOutOf(x).ok) }; });
  assert.equal(r.ok, false);
  assert.ok(r.miss.length >= 1);
  assert.ok(r.alts.length > 0 && r.alts.every(Boolean));
  await p.evaluate(() => openSheet(D.find((x) => x.name === "Espresso Martini").id));
  assert.match(await text(p, "#sheet .pl-outbar.no"), /Offer instead/);
  assert.ok(await p.evaluate(() => mkPool().every((d) => plOutOf(d).ok) && plOutOf(plDaily()).ok));
  // The filter hides it.
  await p.evaluate(() => { $("#sheet").hidden = true; PL.can = true; renderList(); });
  assert.ok(await p.evaluate(() => listIds.length < D.length && listIds.every((i) => plOutOf(D[i]).ok)));
  // WhatsApp spec carries the warning.
  assert.match((await p.evaluate(() => SHARE.drink(String(D.find((x) => x.name === "Espresso Martini").id)).head.join("\n"))), /No .* tonight/);
  assert.deepEqual(p.errs, []);
});
