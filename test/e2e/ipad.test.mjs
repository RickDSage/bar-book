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
  await c.addInitScript((sh) => { (localStorage.setItem("btbar.introSeen", "true"), localStorage.setItem("btbar.walk", JSON.stringify({ bar: 99, floor: 99, "bar:Angel": 99, "floor:Angel": 99 }))); localStorage.setItem("btbar.me", JSON.stringify("Angel")); if (localStorage.getItem("btbar.sx.mk") == null) localStorage.setItem("btbar.sx.mk", "false"); if (sh) localStorage.setItem("btbar.shared", "true"); }, shared);
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
    Object.assign(LIVE, { ready: true, role: "manager", pin: "illias", api: { ...LIVE.api, lock: async () => { n++; } } });
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
  await p.click("[data-sx-view=round]");
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
  await p.click("[data-sx-view=round]");
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

test("bar station extras: 86 strip, glass and garnish pictures, batches with one-tap labels, quiz, set up, manager lock, back after 2 minutes", async () => {
  const p = await open(true);
  await p.setViewportSize({ width: 1180, height: 820 });
  await p.click("#w-ok");
  await p.evaluate(() => show("station"));
  // Glass and garnish pictures next to the words.
  await p.fill("#sx-q", "mojito"); await p.keyboard.press("Enter");
  assert.equal(await p.locator("#sx-spec .sx-gig .pic svg").count(), 2);
  // On the team (stubbed): the 86 strip across the top, and a batch's label dated in one tap.
  const calls = await p.evaluate(() => {
    const calls = window.__calls = [];
    Object.assign(LIVE, { me: { name: "Angel" }, ready: true, admin: false, labels: [{ id: "l1", item: "Sugar syrup", side: "bar", on: true, life: 7, state: "none", v: 1 }, { id: "l2", item: "Egg whites", side: "bar", on: true, life: 2, state: "open", useBy: shiftDay(), openedOn: shiftDay(), openedBy: "Emily", v: 3 },
      { id: "l3", item: "Brownies", side: "floor", on: true, life: 2, state: "open", useBy: addDays(shiftDay(), 1), openedOn: shiftDay(), openedBy: "Pema", v: 2 }],
      api: { ...LIVE.api, label: async (x, act, o) => { calls.push([x.id, act, o.useBy]); }, watchMedia: () => {}, MAX_PHOTOS: 10 } });
    LIVE.loaded.add("labels");
    LIVE.out = new Set(["Lime juice"]); stationLive("out");
    return calls;
  });
  assert.deepEqual(calls, []);
  assert.match(await p.textContent("#sx-86s"), /86'd\s*Lime juice/);
  // Date labels on both sides, always on show: urgent now, and tomorrow's the day before.
  assert.match(await p.textContent("#sx-lbs .sx-lbn"), /Urgent: change now\s*Egg whites/);
  assert.match(await p.textContent("#sx-lbs .sx-lbt"), /Reminder: change tomorrow\s*Floor: Brownies/);
  await p.click('[data-sx-view="batch"]');
  const t = await p.$eval("#sx-spec", (e) => e.innerText);
  assert.match(t, /Sugar syrup[\s\S]*1 kg white caster sugar/);
  assert.match(t, /Lemon Iced Tea[\s\S]*1200 ml black tea batch/);
  assert.match(t, /EVERY BAR DATE LABEL[\s\S]*Egg whites/i);
  await p.click('[data-sx-bx="2"]');
  assert.match(await p.$eval("#sx-spec", (e) => e.innerText), /2 kg white caster sugar/);
  // Not opened yet: Opened. Open: Changed. Use-by is today plus the label's days.
  await p.click('[data-sx-lb="l1"]');
  assert.match(await p.$eval("#sx-spec", (e) => e.innerText), /Write on the label: Use by/);
  await p.click('[data-sx-lb="l2"]');
  assert.deepEqual(await p.evaluate(() => window.__calls), await p.evaluate(() => [["l1", "opened", addDays(shiftDay(), 7)], ["l2", "changed", addDays(shiftDay(), 2)]]));
  // A prep timer: counts down at the top, and when it's up the screen flashes until it's tapped.
  await p.click('[data-sx-tm="1"]');
  assert.match(await p.textContent("#sx-tms"), /\d:\d\d 1 min timer/);
  await p.evaluate(() => { SX.timers[0].end = Date.now() - 1; });
  await p.waitForSelector("#sx-up");
  assert.match(await p.textContent("#sx-up"), /Time's up/);
  await p.click("#sx-up");
  assert.equal(await p.locator("#sx-up").count(), 0);
  assert.equal(await p.isVisible("#sx-tms"), false);
  // A round: each drink ticked Made as it's done, then cleared for the next one.
  await p.evaluate(() => { for (const n of ["Negroni", "Daiquiri"]) sxRound(D.find((d) => d.name === n).id, 1); });
  await p.click("[data-sx-view=round]");
  await p.click('#sx-spec [data-sx-made][aria-pressed="false"] >> nth=0');
  assert.match(await p.textContent("#sx-spec .sx-rbar"), /1 to make/);
  await p.click('#sx-spec [data-sx-made][aria-pressed="false"] >> nth=0');
  assert.match(await p.textContent("#sx-spec .sx-done"), /Round made/);
  await p.click("#sx-spec .sx-done [data-sx-round=clear]");
  assert.equal(await p.evaluate(() => SX.round.size + SX.made.size), 0);
  // A spec line tapped as it goes in is ticked off.
  await p.fill("#sx-q", "negroni"); await p.keyboard.press("Enter");
  await p.click("#sx-spec ul.sx-specl > li >> nth=0");
  assert.equal(await p.locator("#sx-spec ul.sx-specl > li.got").count(), 1);
  // Quiz: one question, a pick shows right or wrong, then the next.
  await p.click('[data-sx-view="quiz"]');
  await p.click("#sx-spec [data-sx-qz] >> nth=0");
  assert.match(await p.textContent("#sx-spec .qz-said"), /Right\.|Not quite\./);
  assert.match(await p.textContent("#sx-spec .sx-qs"), /of 1 right/);
  await p.click("[data-sx-qznext]");
  assert.equal(await p.locator("#sx-spec .qz-said").count(), 0);
  // Set up: the Guided Access steps, with Shared ticked.
  await p.click('[data-sx-view="setup"]');
  assert.match(await p.$eval("#sx-spec", (e) => e.innerText), /Guided Access[\s\S]*three times/);
  assert.equal(await p.locator("#sx-spec .sx-set li.ok b", { hasText: "Shared iPad on" }).count(), 1);
  // Shared and on the team, not a manager: Exit needs a manager's code first.
  await p.click("[data-sx-exit]");
  assert.equal(await p.evaluate(() => [cur, stationOn].join()), "notices,true");
  // Left on another page for 2 minutes: back to the station.
  await p.evaluate(() => { lastTap = Date.now() - 3 * 6e4; });
  await p.waitForFunction(() => cur === "station", null, { timeout: 20000 });
  // A manager unlocked it: Exit works.
  await p.evaluate(() => { LIVE.admin = true; });
  await p.click("[data-sx-exit]");
  assert.equal(await p.evaluate(() => stationOn), false);
  assert.deepEqual(p.errs, []);
});

test("Make it now: a tap on the iPad opens big step cards with the jigger side, Done goes back, the round a drink at a time", async () => {
  const p = await open(false);
  await p.setViewportSize({ width: 1180, height: 820 });
  await p.click("#w-ok");
  await p.evaluate(() => { show("station"); SX.mk = true; });
  // Signatures first: the top drink opens straight into Get ready.
  await p.fill("#sx-q", "london cosmo"); await p.keyboard.press("Enter");
  assert.equal(await p.isVisible("#sxm"), true);
  assert.match(await p.textContent("#sxm h2"), /London Cosmo/);
  assert.match(await p.$eval("#sxm .sxm-card", (e) => e.innerText), /BEFORE YOU START[\s\S]*Chilled coupe[\s\S]*You need[\s\S]*35 ml\s+Cîroc Red Berry/i);
  const n = await p.evaluate(() => DATA.guides["London Cosmo"].steps.length);
  assert.equal(await p.locator("#sxm .sxm-rail li").count(), n + 1);
  // A tap on the card ticks it and the next comes up; the pour has each ml and the jigger side.
  await p.click("#sxm .sxm-card"); await p.click("#sxm .sxm-card");
  assert.match(await p.textContent("#sxm .sxm-of"), /Step 2 of/);
  assert.match(await p.$eval("#sxm .sxm-card", (e) => e.innerText), /25\s*ml\s*lime juice\s*the 25 side/);
  assert.equal(await p.locator("#sxm .sxm-rail .ok").count(), 2);
  // ×2 scales the card: 50 ml of lime is the 50 side.
  await p.click('#sxm [data-sxm-n="2"]');
  assert.match(await p.$eval("#sxm .sxm-card", (e) => e.innerText), /70\s*ml\s*Cîroc Red Berry[\s\S]*50\s*ml\s*lime juice\s*the 50 side/);
  assert.deepEqual(await p.evaluate(() => [sxmJig(75), sxmJig(37.5), sxmJig(35), sxmJig(12.5)]), ["50 + 25", "25 + half a 25", "", "half a 25"]);
  // The last card is Done: back to the list, search cleared, the spec still next to it.
  await p.evaluate(() => sxmGo(99));
  assert.match(await p.textContent('#sxm [data-sxm-step="1"]'), /Done/);
  await p.click("#sxm .sxm-card");
  assert.equal(await p.locator("#sxm").count(), 0);
  assert.equal(await p.inputValue("#sx-q"), "");
  assert.match(await p.textContent("#sx-spec h3"), /London Cosmo/);
  // Spec only is one tap: ▶ Make it now on the spec brings the cards back; Esc closes.
  await p.click("#sx-spec [data-sxm]");
  assert.equal(await p.isVisible("#sxm"), true);
  await p.keyboard.press("ArrowRight");
  assert.equal(await p.evaluate(() => SXM.i), 1);
  await p.keyboard.press("Escape");
  assert.equal(await p.locator("#sxm").count(), 0);
  // The round: in making order (stirred first), scaled, each one marked Made, then Round made.
  await p.evaluate(() => { for (const n of ["Daiquiri", "Negroni", "Negroni"]) sxRound(D.find((d) => d.name === n).id, 1); });
  await p.click("[data-sx-view=round]");
  await p.click("#sx-spec [data-sxm-round]");
  assert.match(await p.textContent("#sxm h2"), /2 × Negroni/);
  assert.match(await p.textContent("#sxm .sxm-t span"), /Round: drink 1 of 2/);
  await p.evaluate(() => sxmGo(99));
  assert.match(await p.textContent('#sxm [data-sxm-step="1"]'), /next Daiquiri/);
  await p.click('#sxm [data-sxm-step="1"]');
  assert.match(await p.textContent("#sxm h2"), /^Daiquiri$/);
  await p.evaluate(() => sxmGo(99)); await p.click('#sxm [data-sxm-step="1"]');
  assert.equal(await p.locator("#sxm").count(), 0);
  assert.match(await p.textContent("#sx-spec .sx-done"), /Round made/);
  // Left alone for 2 minutes it closes with the rest, ready for the next person.
  await p.evaluate(() => { sxTap(SX.ids[0]); lastTap = Date.now() - 3 * 6e4; });
  await p.waitForFunction(() => !document.querySelector("#sxm"), null, { timeout: 20000 });
  // Set up switches a tap to the spec only, kept on this iPad.
  await p.click("[data-sx-view=setup]");
  await p.click("#sx-spec [data-sxm-pref]");
  assert.equal(await p.evaluate(() => localStorage.getItem("btbar.sx.mk")), "false");
  await p.click("[data-sx-view=drink]");
  await p.click("#sx-list .sx-open >> nth=0");
  assert.equal(await p.locator("#sxm").count(), 0);
  // A phone keeps the drink page (its own Step by step).
  await p.evaluate(() => { SX.mk = true; });
  await p.setViewportSize({ width: 390, height: 844 });
  await p.click("#sx-list .sx-open >> nth=0");
  assert.equal(await p.isVisible("#sheet"), true);
  assert.equal(await p.locator("#sxm").count(), 0);
  assert.deepEqual(p.errs, []);
});

test("a big ticket: type drinks into the round, numbered in making order, only the next one open, on a phone too", async () => {
  const p = await open(false);
  await p.setViewportSize({ width: 390, height: 844 });
  await p.click("#w-ok");
  await p.evaluate(() => { localStorage.removeItem("btbar.sx.prepOpen"); show("station"); });
  // Set up is a cog on a phone, so Round keeps its whole name.
  assert.equal(await p.$eval('[data-sx-view="round"]', (b) => b.scrollWidth <= b.clientWidth), true);
  await p.click('[data-sx-view="round"]');
  // Type, Enter, and the next: "3 mojito" adds three, the box empties and keeps the keyboard.
  await p.click("#sx-rq");
  await p.keyboard.type("3 mojito"); await p.waitForSelector("#sx-rres .sx-rqr.top");
  assert.match(await p.textContent("#sx-rres .sx-rqr.top"), /Mojito\s*\+ 3/);
  await p.keyboard.press("Enter");
  assert.equal(await p.evaluate(() => [document.activeElement.id, $("#sx-rq").value].join()), "sx-rq,");
  await p.keyboard.type("negroni"); await p.keyboard.press("Enter");
  await p.keyboard.type("daiquiri x2"); await p.keyboard.press("Enter");
  assert.equal(await p.evaluate(() => sxRoundN()), 6);
  // Making order, numbered: stirred first. Only the next drink shows its spec; Get ready is one line on a phone.
  const heads = await p.$$eval("#sx-list .sx-rc .sx-rtt b", (xs) => xs.map((x) => x.textContent));
  assert.deepEqual(heads, ["1 × Negroni", "2 × Daiquiri", "3 × Mojito"]);
  assert.deepEqual(await p.$$eval("#sx-list .sx-rno", (xs) => xs.map((x) => x.textContent)), ["1", "2", "3"]);
  assert.equal(await p.locator("#sx-list .sx-rc ul.sx-specl").count(), 1);
  assert.equal(await p.$eval("#sx-list [data-sx-prep]", (d) => d.open), false);
  assert.match(await p.textContent("#sx-list .sx-prepd summary"), /6 glasses/);
  assert.match(await p.textContent("#sx-list .sx-rbar"), /Round of 6[\s\S]*3 to make[\s\S]*next: Negroni/i);
  // Made folds it away and opens the next; a tap opens any other; Open every spec opens the lot.
  await p.click('#sx-list [data-sx-made] >> nth=0');
  assert.match(await p.textContent("#sx-list .sx-rc.next .sx-rtt b"), /Daiquiri/);
  assert.equal(await p.locator("#sx-list .sx-rc.made ul.sx-specl").count(), 0);
  await p.click("#sx-list .sx-rc >> nth=2 >> [data-sx-rx]");
  assert.equal(await p.locator("#sx-list .sx-rc ul.sx-specl").count(), 2);
  await p.click("#sx-list [data-sx-rall]");
  assert.equal(await p.locator("#sx-list .sx-rc ul.sx-specl").count(), 3);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), 390);
  assert.deepEqual(p.errs, []);
});
