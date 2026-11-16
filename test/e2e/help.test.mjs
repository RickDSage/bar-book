// The ? help panels, the first-open tour and the setting that hides the ? buttons.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });

test("a new phone gets the tour once after Bar or Floor, it can be skipped, and it opens again from More", async () => {
  const c = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true });
  const p = await c.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(site.url); await p.click("#w-ok");
  await p.waitForSelector("#help:not([hidden])");
  assert.match(await p.textContent("#help-t"), /Welcome to Bar Book/);
  // Every card, Next to the end, each with a tip.
  const n = await p.evaluate(() => INTRO.length);
  for (let i = 1; i < n; i++) { await p.click("#help .btn.pri"); assert.match(await p.textContent("#help .cprog b"), new RegExp(`^${i + 1} of ${n}$`)); }
  await p.click("#help .btn.pri"); assert.equal(await p.isHidden("#help"), true);
  // Not again on the next open.
  await p.reload(); await p.click("#w-ok"); await p.waitForTimeout(600);
  assert.equal(await p.isHidden("#help"), true);
  // From More, and a card's "How ... works" chip opens the ? panel with a way back.
  await p.click("nav.tabs [data-tab=info]"); await p.click("#v-info [data-intro-open]");
  await p.click("#help [data-intro='1']"); await p.click("#help [data-help-topic]");
  assert.match(await p.textContent("#help-t"), /Rapid fire/);
  await p.click("#help [data-intro='1']"); assert.match(await p.textContent("#help .cprog b"), /^2 of/);
  await p.click("#help .hq-x"); assert.equal(await p.isHidden("#help"), true);
  // No card is wider than the phone.
  assert.deepEqual(errs, []);
  await c.close();
});

test("? buttons open the right panel for what's on screen, don't fold a card, and can all be hidden and shown again", async () => {
  await resetEmulators();
  const { S } = await team(browser, site, [["S", "Sam"]]);
  // Shift: the ? by the title follows the pane.
  await S.click("nav.tabs [data-tab=tally]"); await S.waitForSelector("#shift-title .hq");
  await S.evaluate(() => { pane = "stock"; renderTally(); });
  await S.click("#shift-title .hq"); assert.match(await S.textContent("#help-t"), /86 board/);
  // Tapping the same ? again shuts it.
  await S.click("#shift-title .hq", { force: true }); assert.equal(await S.isHidden("#help"), true);
  await S.click("#clear-all + .hq"); assert.match(await S.textContent("#help-t"), /Clear everything/);
  assert.match(await S.textContent("#help .help-b"), /Stays: sent handovers/);
  await S.click("#help .btn.pri");
  // A ? on a Team card's heading doesn't open or shut the card.
  await S.click("nav.tabs [data-tab=notices]"); await S.waitForSelector('[data-card="issues"] > summary .hq');
  const was = await S.evaluate(() => document.querySelector('[data-card="issues"]').open);
  await S.click('[data-card="issues"] > summary .hq');
  assert.match(await S.textContent("#help-t"), /Issues and faults/);
  assert.equal(await S.evaluate(() => document.querySelector('[data-card="issues"]').open), was);
  // Behind the scenes starts folded, and is remembered once opened.
  assert.equal(await S.evaluate(() => document.querySelector("#help .help-b").open), false);
  await S.click("#help .help-b summary"); await S.click("#help .btn.pri");
  await S.click('[data-card="ask"] > summary .hq');
  assert.equal(await S.evaluate(() => document.querySelector("#help .help-b").open), true);
  // Hide them all from a panel; More brings them back.
  await S.click("#help [data-help-hide]");
  assert.equal(await S.isVisible('[data-card="issues"] > summary .hq'), false);
  await S.click("nav.tabs [data-tab=info]"); await S.click('[data-help-pick="on"]');
  await S.click("nav.tabs [data-tab=notices]");
  await S.waitForSelector('[data-card="issues"] > summary .hq', { state: "visible" });
  // Every topic a ? can point at exists.
  assert.deepEqual(await S.evaluate(() => HELP_AT.map(([, k]) => k).filter((k) => typeof k === "string" && !HELP[k])), []);
  assert.deepEqual(await S.evaluate(() => INTRO.flatMap((c) => c.more || []).filter((k) => !HELP[k])), []);
  assert.deepEqual(S.errs, []);
});
