// The ? help panels, the first-open tour and the setting that hides the ? buttons.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });

test("Bar on the start screen shows the bar walkthrough once, × closes it, and the Guide has it and the full tour", async () => {
  const c = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true });
  const p = await c.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(site.url); await p.click("#w-ok");
  await p.waitForSelector("#help:not([hidden])");
  assert.match(await p.textContent("#help-t"), /Your bar shift/);
  const n = await p.evaluate(() => WALK.bar.length);
  for (let i = 1; i < n; i++) { await p.click("#help .btn.pri"); assert.match(await p.textContent("#help .cprog b"), new RegExp(`^${i + 1} of ${n}$`)); }
  assert.match(await p.textContent("#help-t"), /Hand over/);
  await p.click("#help .btn.pri"); assert.equal(await p.isHidden("#help"), true);
  // Not again on the next open; Floor is its own walkthrough, the first time Shift opens on that side.
  await p.reload(); await p.click("#w-ok"); await p.waitForTimeout(700);
  assert.equal(await p.isHidden("#help"), true);
  await p.evaluate(() => setMode("floor")); await p.click("nav.tabs [data-tab=tally]");
  await p.waitForSelector("#help:not([hidden])"); assert.match(await p.textContent("#help-t"), /Your floor shift/);
  await p.click("#help .hq-x"); assert.equal(await p.isHidden("#help"), true);
  // The ? at the top: Start here has the walkthroughs and the full tour, whose chips open a ? panel with a way back.
  await p.click(".brandr [data-guide]"); assert.match(await p.textContent("#help-t"), /Guide/);
  assert.ok(n <= 4, "the walkthrough stays short");
  await p.click("#help [data-walk='bar:0']"); await p.click("#help .btn.pri"); assert.match(await p.textContent("#help-t"), /Opening and service/);
  await p.click("#help .hq-x"); await p.click(".brandr [data-guide]"); await p.click("#help .gd-tile[data-intro='0']");
  assert.match(await p.textContent("#help-t"), /Welcome to Bar Book/);
  await p.click("#help [data-intro='1']"); await p.click("#help [data-help-topic]");
  assert.match(await p.textContent("#help-t"), /Rapid fire/);
  await p.click("#help [data-intro='1']"); assert.match(await p.textContent("#help .cprog b"), /^2 of/);
  await p.click("#help .hq-x"); assert.equal(await p.isHidden("#help"), true);
  // 🔍 finds settings and actions, not just pages and drinks.
  const found = await p.evaluate(() => Object.fromEntries(["dark mode", "one hand", "undo", "what's new", "sounds", "my pay"].map((q) => [q, gdSearch(q).pages.map((f) => f.n)])));
  assert.ok(found["dark mode"].includes("This phone: look and settings"), JSON.stringify(found));
  assert.ok(found["one hand"].includes("This phone: look and settings"));
  assert.ok(found["sounds"].includes("This phone: look and settings"));
  assert.ok(found["undo"].includes("Clear and undo"));
  assert.ok(found["what's new"].includes("Tonight's brief"));
  assert.ok(found["my pay"].includes("My pay"));
  await p.click(".brandr [data-guide]"); await p.fill("#gd-q", "dark mode"); await p.click('#help [data-gd-go="phone"]');
  assert.equal(await p.evaluate(() => cur), "info");
  assert.deepEqual(errs, []);
  await c.close();
});

test("an older walkthrough never pops up: what's new is a card in the brief, and the Guide has the walkthroughs and the tour", async () => {
  const c = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true });
  await c.addInitScript(() => { if (localStorage.getItem("btbar.walk") == null) { localStorage.setItem("btbar.introSeen", "true"); localStorage.setItem("btbar.walk", JSON.stringify({ bar: 1 })); } });
  const p = await c.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(site.url); await p.click("#w-ok");
  // The ring at the top of Needs you now, on a phone that isn't on the team: nothing over the page.
  await p.waitForSelector("#alerts:not([hidden]) [data-story]");
  assert.equal(await p.isHidden("#help"), true);
  assert.match(await p.textContent("#alerts"), /What's new/);
  await p.click("#alerts [data-story]");
  assert.match(await p.textContent("#story"), /1 thing to know/);
  await p.click("#story .st-next");
  assert.match(await p.textContent("#story"), /New in Bar Book/);
  // The last card: reaching it is watching it, so the ring goes and the news is marked seen.
  await p.click("#story [data-story-walk]"); assert.match(await p.textContent("#help-t"), /Your bar shift/);
  await p.click("#help .hq-x");
  assert.equal(await p.evaluate(() => walkSeen("bar")), true);
  await p.reload(); await p.click("#w-ok"); await p.waitForTimeout(3000);
  assert.equal(await p.isHidden("#alerts"), true); assert.equal(await p.isHidden("#help"), true);
  // More has the Guide; the Guide has both walkthroughs and the full tour.
  await p.click("nav.tabs [data-tab=info]");
  assert.equal(await p.locator("#v-info [data-walk-open], #v-info [data-intro-open]").count(), 0, "no separate replay rows");
  await p.click("#v-info [data-guide]"); await p.click("#help [data-walk='floor:0']"); assert.match(await p.textContent("#help-t"), /Your floor shift/);
  await p.click("#help .hq-x");
  await p.click("#v-info [data-guide]"); await p.click("#help .gd-tile[data-intro='0']"); assert.match(await p.textContent("#help-t"), /Welcome to Bar Book/);
  assert.deepEqual(errs, []);
  await c.close();
});

test("? buttons open the right panel for what's on screen, don't fold a card, and can all be hidden and shown again", async () => {
  await resetEmulators();
  const { S } = await team(browser, site, [["S", "Sam"]]);
  // Shift: the ? by the title follows the pane.
  await S.click("nav.tabs [data-tab=tally]"); await S.waitForSelector("#shift-title .hq");
  await S.evaluate(() => { pane = "stock"; renderTally(); });
  // Tonight's brief ring comes in at the top; × puts it away for today, and it stays away.
  await S.click("#alerts:not([hidden]) [data-al-x]");
  await S.evaluate(() => renderAlerts(true)); assert.equal(await S.isHidden("#alerts"), true);
  await S.click("#shift-title .hq"); assert.match(await S.textContent("#help-t"), /86 and restock/);
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
