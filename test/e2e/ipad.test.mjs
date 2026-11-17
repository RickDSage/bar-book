// The restaurant iPad: a centred column at tablet width, and in Shared mode it asks who's using it, hides My pay and
// never stays unlocked. Logged out, so it needs no emulator data: live.js is blocked, as in local.test.mjs.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, launch } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });

async function open(shared) {
  const c = await browser.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true, timezoneId: "Europe/London" });
  await c.addInitScript((sh) => { localStorage.setItem("btbar.introSeen", "true"); localStorage.setItem("btbar.me", JSON.stringify("Angel")); if (sh) localStorage.setItem("btbar.shared", "true"); }, shared);
  await c.route("**/live.js", (r) => r.abort());
  const p = await c.newPage();
  p.errs = [];
  p.on("pageerror", (e) => p.errs.push(e.message));
  await p.goto(site.url);
  return p;
}

test("on an iPad the app is one centred column, not a stretched phone", async () => {
  const p = await open(false);
  assert.match(await p.textContent("#w-name"), /Hi Angel/);
  await p.click("#w-ok");
  const w = await p.$eval("main", (m) => m.getBoundingClientRect().width);
  assert.ok(w <= 760, `main is ${w}px wide`);
  assert.ok(await p.$eval('nav.tabs [data-tab="pay"]', (b) => !b.hidden));
  assert.deepEqual(p.errs, []);
});

test("a shared iPad asks who's using it, hides My pay and locks a senior's code after 5 idle minutes", async () => {
  const p = await open(true);
  assert.match(await p.textContent("#w-name"), /Shared iPad: who's using it\?/);
  await p.click("#w-ok");
  assert.ok(await p.$eval('nav.tabs [data-tab="pay"]', (b) => b.hidden));
  await p.evaluate(() => show("pay"));
  assert.ok(await p.$eval("#v-pay", (v) => v.hidden));
  // A senior unlocked it and walked off: the next tap after 5 minutes puts it back to the team's view.
  const locked = await p.evaluate(() => {
    let n = 0;
    Object.assign(LIVE, { ready: true, role: "manager", api: { ...LIVE.api, lock: async () => { n++; } } });
    sharedLock(); const early = n;
    lastTap = Date.now() - 6 * 6e4; sharedLock();
    return [early, n];
  });
  assert.deepEqual(locked, [0, 1]);
  // Back to someone's own phone: My pay is there again.
  await p.evaluate(() => show("info"));
  await p.click('[data-shared-pick="off"]');
  assert.ok(await p.$eval('nav.tabs [data-tab="pay"]', (b) => !b.hidden));
  assert.deepEqual(p.errs, []);
});

test("bar station mode: big search and spec side by side on an iPad, rounds, and a clear way in and out", async () => {
  const p = await open(false);
  await p.setViewportSize({ width: 1180, height: 820 });
  await p.click("#w-ok");
  await p.evaluate(() => show("info"));
  assert.match(await p.textContent('[data-go="station"]'), /Turn this iPad into the bar station/);
  await p.click('[data-go="station"]');
  // Station mode: the tab bar steps aside and the page uses the whole width.
  assert.ok(await p.$eval("body", (b) => b.classList.contains("stmode")));
  assert.equal(await p.isVisible("nav.tabs"), false);
  assert.ok(await p.$eval("main", (m) => m.getBoundingClientRect().width) > 1100);
  // Signatures first, then the Top 10, then every drink once.
  const heads = await p.$$eval("#sx-list .sx-h", (x) => x.map((h) => h.firstChild.textContent.trim()));
  assert.equal(heads[0], "Black Tap signatures"); assert.equal(heads[1], "Top 10");
  assert.equal(await p.evaluate(() => new Set(SX.ids).size), await p.evaluate(() => D.length));
  // A typo still finds it, and the spec shows next to the list, scaled on a tap.
  await p.fill("#sx-q", "pornstr");
  assert.match(await p.textContent("#sx-spec h3"), /Pornstar Martini/);
  assert.match(await p.$eval("#sx-spec", (e) => e.innerText), /50 ml\s+Smirnoff Vanilla/);
  await p.click('[data-sx-x="2"]');
  assert.match(await p.$eval("#sx-spec", (e) => e.innerText), /100 ml\s+Smirnoff Vanilla/);
  // Arrow keys go through the list.
  await p.fill("#sx-q", ""); await p.click("#sx-spec h3");
  const i = await p.evaluate(() => SX.ids.indexOf(SX.id));
  await p.keyboard.press("ArrowRight");
  assert.equal(await p.evaluate(() => SX.ids.indexOf(SX.id)), i + 1);
  // A round: two of one, one of another, scaled, with the glasses to pull.
  const [a, b] = await p.evaluate(() => [SX.ids[0], SX.ids[3]]);
  await p.click(`#sx-list [data-sx-add="${a}"]`); await p.click(`#sx-list [data-sx-add="${a}"]`); await p.click(`#sx-list [data-sx-add="${b}"]`);
  await p.click("[data-sx-round=show]");
  assert.match(await p.$eval("#sx-spec", (e) => e.innerText), /ROUND OF 3[\s\S]*Glasses[\s\S]*Tins/i);
  // Away from the station there's a way back; it reopens on the station; Exit turns it off.
  await p.evaluate(() => show("tally"));
  assert.equal(await p.isVisible("#sx-back"), true);
  await p.click("#sx-back");
  assert.equal(await p.evaluate(() => cur), "station");
  await p.reload(); await p.click("#w-ok");
  assert.equal(await p.evaluate(() => [cur, SX.round.size].join()), "station,2");
  await p.click("[data-sx-exit]");
  assert.equal(await p.evaluate(() => [cur, stationOn, document.body.classList.contains("stmode")].join()), "info,false,false");
  assert.equal(await p.isVisible("#sx-back"), false);
  assert.deepEqual(p.errs, []);
});

test("bar station on a phone: one column, a tap opens the drink page, nothing wider than the screen", async () => {
  const p = await open(false);
  await p.setViewportSize({ width: 390, height: 844 });
  await p.click("#w-ok");
  await p.evaluate(() => show("station"));
  assert.equal(await p.isVisible("#sx-spec"), false);
  await p.click("#sx-list [data-sx-id] >> nth=0");
  assert.equal(await p.isVisible("#sheet"), true);
  assert.equal(await p.evaluate(() => ctx.length), await p.evaluate(() => SX.ids.length));
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), 390);
  assert.deepEqual(p.errs, []);
});

test("bar station for express service: jugs, alcohol-free swaps, rounds by build, big text, dim and wake, self-refresh", async () => {
  const p = await open(false);
  await p.setViewportSize({ width: 1180, height: 820 });
  await p.click("#w-ok");
  await p.evaluate(() => show("station"));
  // A jug: x8 and the total liquid.
  await p.fill("#sx-q", "margarita"); await p.keyboard.press("Enter");
  await p.click('[data-sx-x="8"]');
  assert.match(await p.$eval("#sx-spec", (e) => e.innerText), /About \d+ ml of liquid before ice: batch it in a jug/);
  // The alcohol-free version is one tap away.
  await p.click(".sx-zero [data-sx-id]");
  assert.match(await p.textContent("#sx-spec h3"), /Virgin Margarita/);
  assert.equal(await p.evaluate(() => sxZero(D.find((d) => d.name === "Pornstar Martini")).name), "No-Star Martini");
  assert.equal(await p.evaluate(() => sxZero(D.find((d) => d.name === "Mojito")).name), "Virgin Mojito");
  // A round: grouped by how it's made, with what to get ready.
  for (const n of ["Negroni", "Margarita", "Daiquiri", "Aperol Spritz"]) await p.evaluate((n) => sxRound(D.find((d) => d.name === n).id, 1), n);
  await p.click("[data-sx-round=show]");
  const r = await p.$eval("#sx-spec", (e) => e.innerText);
  assert.match(r, /GLASSES[\s\S]*ICE[\s\S]*GARNISH[\s\S]*TINS\s+2 to shake: 1 tin/i);
  assert.match(r, /STIR · 1[\s\S]*SHAKE TOGETHER · 2[\s\S]*TOP WITH FIZZ LAST · 1/i);
  // Big text, kept on the iPad.
  await p.click("[data-sx-big]");
  assert.ok(await p.$eval("body", (b) => b.classList.contains("sxbig")));
  assert.equal(await p.evaluate(() => localStorage.getItem("btbar.sx.big")), "true");
  // Ten quiet minutes: dark but for the time; a tap only wakes it.
  await p.evaluate(() => { lastTap = Date.now() - 11 * 6e4; sxCare(); });
  assert.match(await p.textContent("#sx-dim"), /\d\d:\d\d[\s\S]*Tap to wake/);
  await p.click("#sx-dim");
  await p.waitForFunction(() => !document.querySelector("#sx-dim"));
  assert.equal(await p.evaluate(() => cur), "station");
  // A refresh it makes itself (a new release, the morning) goes straight back to the station, with no start screen.
  await p.evaluate(() => { sessionStorage.setItem("sx.auto", "1"); location.reload(); });
  await p.waitForFunction(() => typeof cur !== "undefined" && cur === "station");
  assert.equal(await p.locator("#welcome").count(), 0);
  assert.deepEqual(p.errs, []);
});
