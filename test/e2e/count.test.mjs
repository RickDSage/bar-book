// The stock count (count.js): the count book on the phone. Every place in shelf order, bottles in tenths or weighed,
// said or typed, saved per line under who counted it, totals out as words, a picture table and a spreadsheet;
// deliveries and usage between counts; managers set it up.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, attempt } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });
const people = [["M", "Mia Manager", "mia", "manager"], ["S", "Sam Staff", "sam", "staff"]];
const flat = (s) => s.replace(/\s+/g, " ").trim();
const text = async (p, sel) => flat(await p.$eval(sel, (e) => e.innerText));
const waitToast = (p, re) => p.waitForFunction((s) => new RegExp(s).test(document.querySelector("#toast").textContent), re.source);
const openCount = async (p) => { await p.click("[data-tab=tally]"); await p.click(".ptabs [data-pane=stock]"); await p.click("[data-ct-open]"); await p.waitForSelector("#ct .ct-row"); };
const row = (area, item) => `[data-ct-row="${area}|${item}"].ct-line`;
const line = (p, item, area) => p.evaluate(([i, a]) => { const x = LIVE.counts.find((y) => y.item === i && (!a || y.area === a)); return x && !x.pending ? [x.full, x.open, x.name] : null; }, [item, area]);
const waitLine = (p, item, want, area) => p.waitForFunction(([i, w, a]) => { const x = LIVE.counts.find((y) => y.item === i && (!a || y.area === a)); return x && !x.pending && x.full === w[0] && x.open === w[1]; }, [item, want, area]);
const say = async (p, s) => { await p.fill("#ct-say", s); await p.press("#ct-say", "Enter"); };

test("count by tapping, saying or typing: saves per line under who counted, totals add places up, sends and exports", async () => {
  await resetEmulators();
  const { M, S } = await team(browser, site, people);
  await openCount(S);
  // Everything, place by place in walking order: the speed rail first, the milk counted in two places.
  const secs = await S.$$eval("#ct .sec", (xs) => xs.map((x) => x.textContent));
  assert.deepEqual(secs.slice(0, 5), ["Speed rail", "Back bar", "Prep and syrups", "Garnish station", "Bar fridge"]);
  for (const [a, i] of [["Speed rail", "Smirnoff"], ["Bar fridge", "Whole milk"], ["Shake station", "Whole milk"], ["Cake fridge", "Victoria sponge"], ["Freezer", "Ice cream"], ["Cellar", "Guinness"], ["Floor fridge", "Ketchup"]])
    assert.ok(await S.$(row(a, i)), `${i} in ${a}`);
  assert.equal(await S.$(row("Store room", "Ice")), null, "ice isn't counted");

  // Tap: three full, the open one at four tenths.
  await S.click(row("Speed rail", "Smirnoff"));
  for (let i = 0; i < 3; i++) await S.click('[data-ct-add="full:1"]');
  await S.click('[data-ct-lv="4"]');
  await waitLine(S, "Smirnoff", [3, 40]);
  assert.deepEqual(await line(S, "Smirnoff"), [3, 40, "Sam Staff"]);
  assert.match(await text(S, row("Speed rail", "Smirnoff")), /^Smirnoff 3\.4 bottles Sam Staff$/);
  assert.match(await text(S, ".ct-open"), /Open bottle 0\.4 · 280 ml/);
  // Next goes down the shelf; Next on a line not touched saves it as none.
  await S.click('[data-ct-next="Speed rail|Smirnoff"]');
  await S.waitForSelector('.ct-row.on [data-ct-next="Speed rail|Smirnoff Vanilla"]');
  await S.click('[data-ct-next="Speed rail|Smirnoff Vanilla"]');
  await waitLine(S, "Smirnoff Vanilla", [0, 0]);

  // Said or typed, typos and all: check what it heard, then save.
  await say(S, "tanquerey three and a half");
  assert.match(await text(S, ".ct-heard"), /Heard “tanquerey three and a half”: Tanqueray, Speed rail: 3\.5 bottles/);
  await S.click("#ct-heard-ok"); await waitLine(S, "Tanqueray", [3, 50]);
  await say(S, "Monkey 47 2 point 4"); assert.match(await text(S, ".ct-heard"), /Monkey 47, Back bar: 2\.4 bottles/); await S.click("#ct-heard-ok"); await waitLine(S, "Monkey 47", [2, 40]);
  await say(S, "talisker 10 one"); assert.match(await text(S, ".ct-heard"), /Talisker 10, Back bar: 1 bottle\b/); await S.click("#ct-heard-ok"); await waitLine(S, "Talisker 10", [1, 0]);
  await say(S, "limes twenty three"); assert.match(await text(S, ".ct-heard"), /Limes, Garnish station: 23\b/); await S.click("#ct-heard-ok"); await waitLine(S, "Limes", [23, 0]);
  await say(S, "the big blue thing"); assert.match(await text(S, ".warnline"), /couldn't tell what or how many/);
  // A product in two places: the next one said goes to the place not counted yet, and the total adds them.
  await say(S, "whole milk 2"); assert.match(await text(S, ".ct-heard"), /Whole milk, Bar fridge: 2\b/); await S.click("#ct-heard-ok"); await waitLine(S, "Whole milk", [2, 0], "Bar fridge");
  await say(S, "whole milk 3"); assert.match(await text(S, ".ct-heard"), /Whole milk, Shake station: 3\b/); await S.click("#ct-heard-ok"); await waitLine(S, "Whole milk", [3, 0], "Shake station");
  // Typed for things that aren't bottles: halves too.
  await S.click(row("Cake fridge", "Victoria sponge")); await S.fill("#ct-type", "1.5"); await S.press("#ct-type", "Enter");
  await waitLine(S, "Victoria sponge", [1, 50]);
  assert.match(await text(S, ".ct-tot"), /Smirnoff 3\.4 bottles .*Whole milk 5\b/);

  // Live on every phone, with who counted it.
  await openCount(M);
  await M.waitForFunction(() => LIVE.counts.length >= 9);
  assert.match(await text(M, row("Speed rail", "Smirnoff")), /3\.4 bottles Sam Staff/);
  assert.match(await text(M, ".ct-head"), /lines counted by Sam Staff/);

  // Sending: totals as words and a picture table; the spreadsheet has a row per product.
  const msg = await S.evaluate(() => shareText("count", false));
  assert.match(msg, /^Stock count, /); assert.match(msg, /Counted by Sam Staff/);
  assert.match(msg, /Smirnoff: 3\.4 bottles/); assert.match(msg, /Whole milk: 5\n/); assert.match(msg, /Victoria sponge: 1\.5\n/);
  assert.doesNotMatch(msg, /Not counted/, "not counted is left out unless ticked");
  assert.ok((await S.evaluate(() => SHARE.count().photos().then((x) => x.length))) >= 1);
  const csv = await S.evaluate(() => ctCsv());
  const day = await S.evaluate(() => ctDay);
  assert.ok(csv.startsWith("﻿Date,Item,Count,Unit,Where,Counted by\r\n"));
  assert.ok(csv.includes(`\r\n${day},Smirnoff,3.4,bottle,Speed rail 3.4,Sam Staff\r\n`));
  assert.ok(csv.includes(`\r\n${day},Whole milk,5,each,Bar fridge 2; Shake station 3,Sam Staff\r\n`));
  assert.ok(csv.includes(`\r\n${day},Grey Goose,,bottle,,\r\n`), "not counted is a blank row");

  // The rules: a line has to be filed under its own day, and only managers set the count up.
  const x = (o) => ({ day, area: "Back bar", item: "Kraken", unit: "bottle", full: 1, open: 0, ...o });
  assert.equal(await attempt(S, (i, v) => LIVE.api.countLine(i, v), `2020-01-01--back-bar--kraken`, x()), "permission-denied");
  assert.equal(await attempt(S, (i, v) => LIVE.api.countLine(i, v), `${day}--back-bar--kraken`, x({ open: 100 })), "permission-denied");
  assert.equal(await attempt(S, (i, v) => LIVE.api.countLine(i, v), `${day}--back-bar--kraken`, x({ full: 1.5 })), "permission-denied");
  assert.equal(await attempt(S, (v) => LIVE.api.saveCountSetup(v), { areas: ["Bar"], items: {}, order: {} }), "permission-denied");
  assert.equal(await S.$("#ct-setup"), null, "no setup button for staff");
});

test("managers set it up; weighing, deliveries and usage between counts", async () => {
  await resetEmulators();
  const { M, S } = await team(browser, site, people);
  await openCount(M);
  await M.click("#ct-setup");
  // Bottle weights for Kraken, then move it up the shelf.
  await M.click('[data-ct-sk="Back bar|Kraken"] summary');
  await M.waitForSelector('[data-ct-sk="Back bar|Kraken"] [data-ct-wf="e"]');
  await M.fill('[data-ct-sk="Back bar|Kraken"] [data-ct-wf="e"]', "600");
  await M.fill('[data-ct-sk="Back bar|Kraken"] [data-ct-wf="f"]', "590");
  await M.click('[data-ct-wsave="Kraken"]'); await waitToast(M, /unopened one has to weigh more/);
  await M.fill('[data-ct-sk="Back bar|Kraken"] [data-ct-wf="f"]', "1265");
  await M.click('[data-ct-wsave="Kraken"]'); await waitToast(M, /^Weights saved for Kraken$/);
  await M.waitForFunction(() => LIVE.countSetup?.items?.Kraken?.f === 1265);
  const before = await M.evaluate(() => ctRows().filter((r) => r.area === "Back bar").map((r) => r.item));
  await M.click('[data-ct-sk="Back bar|Kraken"] [data-ct-move="-1"]');
  await M.waitForFunction((b) => { const l = ctRows().filter((r) => r.area === "Back bar").map((r) => r.item); return l.indexOf("Kraken") === b.indexOf("Kraken") - 1; }, before);
  // Smirnoff kept in the store room too; limes counted in boxes.
  await M.click('[data-ct-sk="Speed rail|Smirnoff"] summary');
  await M.selectOption('[data-ct-sk="Speed rail|Smirnoff"] [data-ct-f="also"]', "Store room");
  await M.waitForFunction(() => ctRows().some((r) => r.area === "Store room" && r.item === "Smirnoff"));
  await M.click('[data-ct-sk="Garnish station|Limes"] summary');
  await M.selectOption('[data-ct-sk="Garnish station|Limes"] [data-ct-f="u"]', "box");
  await M.waitForFunction(() => ctRows().find((r) => r.item === "Limes").u === "box");
  // A new place, moved to the top.
  await M.fill("#ct-anew", "Keg room"); await M.click("#ct-aadd"); await waitToast(M, /^Keg room added$/);
  await M.waitForFunction(() => ctAreas().at(-1) === "Keg room");
  for (let i = 0; i < 11; i++) { const n = await M.evaluate(() => ctAreas().length - 1); await M.click(`[data-ct-amove="${n - i}:-1"]`); await M.waitForFunction((k) => ctAreas()[k] === "Keg room", n - i - 1); }
  await M.click('[data-ct-sk="Cellar|Guinness"] summary');
  await M.selectOption('[data-ct-sk="Cellar|Guinness"] [data-ct-f="area"]', "Keg room");
  await M.waitForFunction(() => ctRows()[0].area === "Keg room" && ctRows()[0].item === "Guinness");
  await M.click("#ct-setup-done");

  // Weighing on the scale: grams to the open bottle, with ml and cl. An unopened one goes on the full count.
  await openCount(S);
  await S.click('[data-ct-mode="weigh"]');
  await S.click(row("Back bar", "Kraken"));
  await S.fill("#ct-g", "932.5");
  assert.equal(await text(S, "#ct-g-out"), "Open bottle 0.5 · 350 ml · 35 cl");
  await S.press("#ct-g", "Enter"); await waitLine(S, "Kraken", [0, 50]);
  await S.fill("#ct-g", "1264"); await S.press("#ct-g", "Enter"); await waitLine(S, "Kraken", [1, 0]);
  await say(S, "kraken 800 grams"); assert.match(await text(S, ".ct-heard"), /Kraken, Back bar: 1\.3 bottles/); await S.click("#ct-heard-ok"); await waitLine(S, "Kraken", [1, 30]);
  // No weights: tap the level instead.
  await S.click(row("Back bar", "Grey Goose"));
  assert.match(await text(S, ".ct-edit"), /Grey Goose has no bottle weights yet, so tap the level\. A manager sets them once/);

  // Usage between counts: three counts, a delivery in between.
  const today = await S.evaluate(() => ctDay), d = (n) => S.evaluate(([t, k]) => addDays(t, k), [today, n]);
  const [d1, d2] = [await d(-6), await d(-3)];
  for (const [day, item, full] of [[d1, "Grey Goose", 10], [d2, "Grey Goose", 8], [today, "Grey Goose", 2], [d1, "Tanqueray", 5], [d2, "Tanqueray", 5], [today, "Tanqueray", 7], [d2, "Kraken", 3]])
    await S.evaluate(([day, item, full]) => { const r = ctRows().find((x) => x.item === item); return LIVE.api.countLine(ctId(day, r.area, item), { day, area: r.area, item, unit: r.u, full, open: 0 }); }, [day, item, full]);
  await S.click("#ct-in-box summary"); await S.fill("#ct-in", "Kraken 6"); await S.click("#ct-in-go"); await waitToast(S, /^Kraken: 6 bottles in$/);
  await S.waitForFunction(() => LIVE.received.some((x) => x.item === "Kraken" && !x.pending));
  await S.click("#ct-use-box summary"); await S.click("#ct-use-go");
  await S.waitForSelector("#ct-use-box .ct-tot");
  const use = await text(S, "#ct-use-box");
  assert.match(use, /Grey Goose More than usual \(usually 2\) 6 bottles/);
  assert.match(use, /Tanqueray Went up with no delivery logged -2 bottles/);
  assert.match(use, /Kraken 7\.7 bottles \(6 in\)/);
  const um = await S.evaluate(() => shareText("countuse", false));
  assert.match(um, /Flagged \(2\)/); assert.match(um, /Grey Goose: 6 bottles \(More than usual/);
  // Deliveries are in the spreadsheet too, and only whoever logged one (or a manager) takes it off.
  assert.match(await S.evaluate(() => ctCsv()), new RegExp(`${today},Kraken,6,bottle,,Sam Staff`));
  const rid = await S.evaluate(() => LIVE.received[0].id);
  await M.waitForFunction(() => LIVE.received.length === 1);
  assert.equal(await attempt(M, (i) => LIVE.api.dropReceived(i), rid), "allowed");
});
