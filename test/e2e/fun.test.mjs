// Games and drills (daily drill, your month, quiz night), read it out on the bar station, Siri and shortcuts, and
// "since you were last in". The first ones run logged out with live.js blocked; quiz night uses the emulators.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });

// A phone (or an iPad) logged out. speechSynthesis is replaced so the test can hear what would be said.
async function open({ width = 390, height = 844, init } = {}) {
  const c = await browser.newContext({ viewport: { width, height }, isMobile: width < 700, hasTouch: true, timezoneId: "Europe/London" });
  await c.addInitScript(() => {
    localStorage.setItem("btbar.introSeen", "true");
    localStorage.setItem("btbar.walk", JSON.stringify({ bar: 99, floor: 99 }));
    window.SAID = [];
    window.SpeechSynthesisUtterance = function (t) { this.text = t; };
    Object.defineProperty(window, "speechSynthesis", { value: { speak: (u) => SAID.push(u), cancel: () => {}, getVoices: () => [{ name: "Daniel", lang: "en-GB" }], speaking: false } });
  });
  if (init) await c.addInitScript(init);
  await c.route("**/live.js", (r) => r.abort());
  const p = await c.newPage();
  p.errs = [];
  p.on("pageerror", (e) => p.errs.push(e.message));
  await p.goto(site.url);
  await p.click("#w-ok");
  return p;
}
const games = async (p) => { await p.click("nav.tabs [data-tab=info]"); await p.click('[data-go="fun"]'); };
// Answers the drill question on screen, right or wrong.
async function drillAnswer(p, right) {
  const i = await p.evaluate((r) => { const q = DRUN.qs[DRUN.i]; return q.opts.findIndex((o) => (o === q.answer) === r); }, right);
  await p.locator("[data-dr-pick]").nth(i).click();
  await p.waitForFunction((n) => DRUN.i === n, await p.evaluate(() => DRUN.i + 1), { timeout: 4000 });
}

test("daily drill: two minutes, a streak, and the drinks you miss come back tomorrow", async () => {
  const p = await open();
  await games(p);
  assert.match(await p.textContent(".dr-card"), /Start a streak today/);
  await p.click('.dr-card[data-fn="drill"]');
  assert.match(await p.textContent(".dr-head"), /Daily drill/);
  const missed = await p.evaluate(() => DRUN.qs[DRUN.i].name);
  await drillAnswer(p, false);
  // A missed one is asked again a few questions later.
  assert.ok(await p.evaluate((n) => DRUN.qs.slice(DRUN.i).some((q) => q.name === n), missed));
  await drillAnswer(p, true);
  await drillAnswer(p, true);
  await p.click('[data-fn="drill-stop"]');
  assert.match(await p.textContent(".dr-end"), /2 right in 2 minutes/);
  assert.match(await p.textContent("#v-fun"), /Back tomorrow/);
  const dr = await p.evaluate(() => JSON.parse(localStorage.getItem("btbar.drill")));
  assert.deepEqual(dr.days, [await p.evaluate(() => shiftDay())]);
  assert.equal(dr.cards[missed].b, 0);
  assert.equal(dr.cards[missed].due, await p.evaluate(() => fnAdd(shiftDay(), 1)));
  // Done today, and yesterday too: a two-day streak on the card.
  await p.evaluate(() => { DR.days.unshift(fnAdd(shiftDay(), -1)); drillSave(); });
  await p.click('[data-fn="home"]');
  assert.match(await p.textContent(".dr-card"), /2 days in a row/);
  assert.match(await p.textContent(".dr-card"), /Done today/);
  // Leaving mid-drill counts it, and the bar station doesn't snatch the page during one.
  await p.click('.dr-card[data-fn="drill"]');
  assert.equal(await p.evaluate(() => funBusy()), true);
  await p.click("nav.tabs [data-tab=drinks]");
  assert.equal(await p.evaluate(() => DRUN), null);
  assert.deepEqual(p.errs, []);
});

test("your month: a share card with first name and counts only", async () => {
  const p = await open({ init: () => {
    window.SHARED = [];
    navigator.canShare = () => true;
    navigator.share = async (x) => { SHARED.push(x.files.map((f) => [f.name, f.type, f.size > 20000])); };
  } });
  await p.evaluate(() => {
    const m = fnMonth(wrapWhich() + "-15");
    store.set("wrap", { [wrapWhich()]: { days: { [`${wrapWhich()}-03`]: { t: 12, o: 2 }, [`${wrapWhich()}-04`]: { t: 9, o: 0 } } } });
    return m;
  });
  await games(p);
  assert.match(await p.textContent(".wrap-card"), /2\s*Closing nights/);
  assert.match(await p.textContent(".wrap-card"), /21\s*Jobs ticked/);
  await p.click(".wrap-card");
  await p.waitForFunction(() => SHARED.length === 1);
  const [[name, type, big]] = (await p.evaluate(() => SHARED))[0];
  assert.match(name, /^bar-book-\d{4}-\d{2}\.jpg$/);
  assert.equal(type, "image/jpeg");
  assert.ok(big);
  assert.deepEqual(p.errs, []);
});

test("read it out on the bar station: a British voice, a step at a time, back, again and next", async () => {
  const p = await open({ width: 1180, height: 820 });
  await p.evaluate(() => show("station"));
  const id = await p.evaluate(() => D.find((d) => d.name === "Espresso Martini").id);
  await p.evaluate((id) => sxOpen(id), id);
  await p.click(`#sx-spec [data-say="${id}"]`);
  assert.ok(await p.$eval("#say", (e) => !e.hidden));
  assert.match(await p.textContent("#say"), /1 of \d+/);
  let said = await p.evaluate(() => SAID.map((u) => [u.text, u.lang, u.voice?.name]));
  assert.equal(said.length, 1);
  assert.match(said[0][0], /^Espresso Martini\./);
  assert.deepEqual(said[0].slice(1), ["en-GB", "Daniel"]);
  await p.click('#say [data-say-go="next"]');
  said = await p.evaluate(() => SAID.map((u) => u.text));
  assert.match(await p.textContent("#say"), /2 of/);
  // Bar talk: every amount is said "mil", never "m l".
  const all = await p.evaluate(() => SAY.steps.map((s) => sayWords(s.say)).join(" "));
  assert.match(all, /\d+ mil\b/);
  assert.doesNotMatch(all, /\bml\b/);
  await p.click('#say [data-say-go="back"]');
  assert.match(await p.textContent("#say"), /1 of/);
  await p.click('#say [data-say-go="stop"]');
  assert.ok(await p.$eval("#say", (e) => e.hidden));
  // The drink page's Step by step has it too.
  await p.evaluate((id) => { show("drinks"); openSheet(id); }, id);
  await p.click('#sheet [data-view="steps"]');
  assert.ok(await p.$(`#sheet [data-say="${id}"]`));
  assert.deepEqual(p.errs, []);
});

test("Siri and shortcuts: a link for each place, no team code in any, and they open the right page", async () => {
  const p = await open({ init: () => localStorage.setItem("btbar.team", JSON.stringify("73019264")) });
  await p.click("nav.tabs [data-tab=info]");
  await p.click("[data-sc-open]");
  assert.match(await p.textContent("#sheet"), /Hey Siri, Bar Book 86/);
  const urls = await p.$$eval("#sheet .sc-url", (x) => x.map((e) => e.textContent));
  assert.equal(urls.length, 9);
  for (const u of urls) { assert.match(u, /#(at)=/); assert.doesNotMatch(u, /73019264/); }
  await p.click('#sheet [data-sc-try][href="#at=drill"]');
  await p.waitForFunction(() => cur === "fun" && !!DRUN);
  await p.click('[data-fn="drill-stop"]');
  await p.evaluate(() => openLink("#at=tab:rapid"));
  assert.equal(await p.evaluate(() => cur), "rapid");
  await p.evaluate(() => openLink("#at=close"));
  assert.equal(await p.evaluate(() => [cur, pane].join()), "tally,close");
  assert.deepEqual(p.errs, []);
});

test("since you were last in: a changed spec is a card in the brief, not a pop-up, and watching to the end clears it", async () => {
  const p = await open({ init: () => {
    if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", "1");
    localStorage.setItem("btbar.lastIn", JSON.stringify({ day: "2026-01-01", at: 1 }));
    localStorage.setItem("btbar.specFp", JSON.stringify({ "Espresso Martini": "old", "Gone Drink": "x" }));
  } });
  await p.waitForSelector("#alerts:not([hidden]) [data-story]", { timeout: 8000 });
  assert.equal(await p.$("#since"), null, "no pop-up over the app");
  await p.click("#alerts [data-story]");
  await p.click("#story .st-next");
  const t = await p.textContent("#story");
  assert.match(t, /Specs changed since you were last in/);
  assert.match(t, /Espresso Martini: spec changed/);
  assert.match(t, /Off the menu: Gone Drink/);
  // The cards move on by themselves, more slowly the more there is to read.
  assert.ok(await p.evaluate(() => storyMs(sto.xs[1]) > storyMs({ label: "86'd", lines: ["Limes"] })));
  await p.click("#story [data-story-x]");
  assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem("btbar.lastIn")).day), await p.evaluate(() => shiftDay()));
  assert.equal(await p.evaluate(() => specNews().changed.length), 0);
  await p.reload(); await p.click("#w-ok"); await p.waitForTimeout(3000);
  assert.equal(await p.isHidden("#alerts"), true);
  assert.deepEqual(p.errs, []);
});

test("quiz night: the iPad hosts, phones answer, a kind scoreboard, and names can be hidden", async () => {
  await resetEmulators();
  const { O, S, T } = await team(browser, site, [["S", "Sam Staff"], ["T", "Tia Staff"]]);
  await O.setViewportSize({ width: 1180, height: 820 });
  for (const p of [O, S, T]) await p.evaluate(() => openAt("quiz"));
  await O.click('[data-fn="qn-new"]');
  await S.waitForFunction(() => qnLive() && LIVE.quizPlayers.some((x) => x.uid === LIVE.uid));
  await T.waitForFunction(() => qnLive() && LIVE.quizPlayers.some((x) => x.uid === LIVE.uid));
  await O.waitForFunction(() => qnPlayers().length === 2);
  assert.match(await O.textContent("#v-fun"), /Sam Staff/);
  assert.match(await S.textContent("#v-fun"), /You're in/);
  await O.click('[data-fn="qn-go"]');
  for (let j = 0; j < 10; j++) {
    await S.waitForFunction((j) => LIVE.quiz.state === "q" && LIVE.quiz.i === j, j);
    await T.waitForFunction((j) => LIVE.quiz.state === "q" && LIVE.quiz.i === j, j);
    // Sam gets every one right; Tia gets the first three right.
    const right = await S.evaluate(() => LIVE.quiz.qs[LIVE.quiz.i].answer);
    const wrong = await S.evaluate(() => LIVE.quiz.qs[LIVE.quiz.i].opts.find((o) => o !== LIVE.quiz.qs[LIVE.quiz.i].answer));
    await S.click(`#v-fun [data-qn-pick="${right.replace(/"/g, '\\"')}"]`);
    await T.click(`#v-fun [data-qn-pick="${(j < 3 ? right : wrong).replace(/"/g, '\\"')}"]`);
    await O.waitForFunction((j) => qnPlayers().filter((p) => p.picks?.[j] != null).length === 2, j);
    await O.click('[data-fn="qn-show"]');
    await S.waitForFunction(() => LIVE.quiz.state === "show");
    assert.match(await S.textContent("#v-fun"), /Right!/);
    // Once the answer is shown, nobody can change theirs.
    const late = await T.evaluate(() => LIVE.api.quizPick(LIVE.quiz.game, { ...LIVE.quizPlayers.find((p) => p.uid === LIVE.uid).picks, [LIVE.quiz.i]: LIVE.quiz.qs[LIVE.quiz.i].answer }).then(() => "allowed", (e) => e.code));
    assert.equal(late, "permission-denied");
    await O.click('[data-fn="qn-next"]');
  }
  await S.waitForFunction(() => LIVE.quiz.state === "end");
  await T.waitForFunction(() => LIVE.quiz.state === "end");
  await O.waitForFunction(() => /Final scores/.test(document.querySelector("#v-fun").textContent));
  const board = await O.textContent("#v-fun");
  assert.match(board, /Team score: 13 of 20 right/);
  assert.match(board, /Sam Staff\s*10 right/, board);
  await S.waitForFunction(() => /You got 10 of 10/.test(document.querySelector("#v-fun").textContent));
  await T.waitForFunction(() => /You got 3 of 10/.test(document.querySelector("#v-fun").textContent));
  assert.match(await S.textContent("#v-fun"), /Top of the bar/);
  // A new game with names hidden: the board shows only the team's score.
  await O.click('[data-fn="qn-new"]');
  await O.waitForFunction(() => LIVE.quiz.state === "lobby");
  await O.check("[data-qn-hide]");
  await O.waitForFunction(() => LIVE.quiz.hide === true);
  await O.evaluate(() => LIVE.api.quizMove({ state: "end" }));
  await O.waitForFunction(() => /Names are hidden/.test(document.querySelector("#v-fun").textContent));
  assert.doesNotMatch(await O.textContent("#v-fun"), /Sam Staff|Tia Staff/);
  for (const p of [O, S, T]) assert.deepEqual(p.errs, []);
});

test("bar phrases: French, Spanish or Italian, bar or floor, one big card at a time, hear it, toggles, streak", async () => {
  const p = await open();
  await games(p);
  assert.deepEqual(await p.$$eval("[data-ph-lang]", (x) => x.map((b) => b.textContent)), ["Français", "Español", "Italiano"]);
  await p.click('[data-ph-side="floor"]');
  await p.click('.dr-card.ph [data-fn="phr"]');
  assert.match(await p.textContent(".ph-say"), /J'apprends encore le français/);
  assert.match(await p.textContent(".ph-en"), /still learning French/);
  assert.ok(await p.$(".ph-pron"));
  await p.click(".ph-hear:not([data-ph-slow])");
  assert.deepEqual(await p.evaluate(() => SAID.map((u) => u.lang)), ["fr-FR"]);
  // Floor has the burgers; bar doesn't.
  const floor = await p.evaluate(() => phCards().map((r) => r[0]));
  assert.ok(floor.includes("burger") && !floor.includes("single"));
  // The English and the sound-it-out line switch off.
  await p.uncheck('[data-ph-tg="en"]');
  await p.uncheck('[data-ph-tg="say"]');
  assert.equal(await p.$(".ph-en"), null);
  assert.equal(await p.$(".ph-pron"), null);
  for (let i = 1; i < floor.length; i++) await p.click('[data-ph="next"]');
  await p.click('[data-ph="next"]');
  // Then a quick check: hear it, pick the meaning. Slow plays it slower.
  assert.match(await p.textContent(".dr-head"), /Quick check/);
  await p.click('.ph-hear[data-ph-slow]');
  assert.ok(await p.evaluate(() => SAID.at(-1).rate < 0.7));
  for (let j = 0; j < 4; j++) {
    const i = await p.evaluate(() => { const q = PRUN.qs[PRUN.q]; return q.opts.indexOf(q.answer); });
    await p.locator("[data-ph-ans]").nth(i).click();
    await p.click('[data-ph="cnext"]');
  }
  assert.match(await p.textContent(".dr-end"), /Nice one/);
  assert.match(await p.textContent(".dr-end"), /4 of 4 heard right/);
  assert.deepEqual(await p.evaluate(() => DR.days), [await p.evaluate(() => shiftDay())]);
  // Spanish, at the bar.
  await p.click('[data-fn="home"]');
  await p.click('[data-ph-lang="es"]');
  await p.click('[data-ph-side="bar"]');
  await p.click('.dr-card.ph [data-fn="phr"]');
  await p.click('[data-ph="next"]');
  await p.click('[data-ph="next"]');
  assert.match(await p.textContent(".ph-say"), /¿Sencillo o doble\?/);
  await p.click(".ph-hear:not([data-ph-slow])");
  assert.equal(await p.evaluate(() => SAID.at(-1).lang), "es-ES");
  assert.deepEqual(p.errs, []);
});
