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
const openCount = async (p) => { await p.click("[data-tab=count]"); await p.waitForSelector("#ct .ct-row"); };
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

  // Tap: +6 and −, then +1 twice... three full; by eye is first, and the level is the last tap: it saves and opens the next.
  await S.click(row("Speed rail", "Smirnoff"));
  await S.click('[data-ct-add="full:6"]'); for (let i = 0; i < 3; i++) await S.click('[data-ct-add="full:-1"]');
  await waitLine(S, "Smirnoff", [3, 0]);
  // None, quarters by eye on the line; tenths and the scale under More.
  assert.deepEqual(await S.$$eval(".ct-row.on .ct-quick [data-ct-lvp]", (b) => b.map((x) => x.textContent)), ["None", "¼", "½", "¾"]);
  await S.click("#ct-more summary"); assert.ok(await S.$("#ct-more #ct-g"), "the scale is under More");
  await S.click('#ct-more [data-ct-lvp="40"]');
  await waitLine(S, "Smirnoff", [3, 40]);
  assert.deepEqual(await line(S, "Smirnoff"), [3, 40, "Sam Staff"]);
  // It moves on by itself to the next on the shelf, which shows a worked example until it's counted.
  await S.waitForSelector('.ct-row.on [data-ct-next="Speed rail|Smirnoff Vanilla"]');
  assert.match(await text(S, ".ct-row.on .ct-eg"), /^For example: 3 full \+ 0?\.4 open = 3\.4 bottles of 70 cl · 700 ml = 238 cl · 2,380 ml \(2\.38 litres\)$/);
  await S.click('[data-ct-show="all"]');
  assert.match(await text(S, row("Speed rail", "Smirnoff")), /^Smirnoff 3\.4 bottles Sam Staff$/);
  await S.click('[data-ct-show="todo"]');
  // Next on a line not touched saves it as none.
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
  await S.waitForFunction(() => ctOpen && ctOpen !== "Cake fridge|Victoria sponge", null, { timeout: 3000 });
  await S.click("#ct-tot-box summary");
  assert.match(await text(S, ".ct-tot"), /Smirnoff 3\.4 bottles .*Whole milk 5\b/);

  // Live on every phone, with who counted it.
  await openCount(M);
  await M.waitForFunction(() => LIVE.counts.length >= 9);
  // Only what's left shows to start with; Counted shows what's done, with who did it.
  assert.equal(await M.$(row("Speed rail", "Smirnoff")), null, "counted lines are out of Not counted yet");
  assert.ok(await M.$(row("Back bar", "Grey Goose")));
  await M.click('[data-ct-show="done"]');
  await M.waitForSelector(row("Speed rail", "Smirnoff"));
  assert.equal(await M.$(row("Back bar", "Grey Goose")), null);
  assert.match(await text(M, row("Speed rail", "Smirnoff")), /3\.4 bottles Sam Staff/);
  await M.click('[data-ct-show="todo"]');
  // By kind: all the vodkas together, wherever they're kept, each saying where.
  await M.click('[data-ct-by="kind"]');
  assert.ok((await M.$$eval("#ct .sec", (xs) => xs.map((x) => x.textContent))).includes("Vodka"));
  assert.match(await text(M, "#ct-list"), /Vodka .*Grey Goose Back bar/i);
  // A to Z: every line by name under its letter, with the letter strip, and no place buttons; By place goes back.
  await M.click('[data-ct-by="az"]');
  assert.equal(await M.$(".ct-jump"), null);
  const names = await M.$$eval("#ct-list .ct-line > span", (xs) => xs.map((x) => x.firstChild.textContent));
  assert.ok(names.length > 20 && (await M.evaluate((n) => n.every((x, i) => !i || azCmp(n[i - 1], x) <= 0), names)));
  await M.waitForFunction(() => !$("#az-rail").hidden);
  await M.click('[data-ct-by="place"]');
  await M.waitForSelector(".ct-jump");
  assert.match(await text(M, ".ct-head"), /lines counted by Sam Staff/);

  // Sending: totals as words and a picture table; the spreadsheet has a row per product.
  const msg = await S.evaluate(() => shareText("count", false));
  assert.match(msg, /^Stock count, /); assert.match(msg, /Counted by Sam Staff/);
  assert.match(msg, /Smirnoff: 3\.4 bottles/); assert.match(msg, /Whole milk: 5\n/); assert.match(msg, /Victoria sponge: 1\.5\n/);
  assert.doesNotMatch(msg, /Not counted/, "not counted is left out unless ticked");
  assert.ok((await S.evaluate(() => SHARE.count().photos().then((x) => x.length))) >= 1);
  const csv = await S.evaluate(() => ctCsv());
  const day = await S.evaluate(() => ctDay);
  assert.ok(csv.startsWith("﻿Date,Item,Count,Unit,Size,Where,Counted by\r\n"));
  assert.ok(csv.includes(`\r\n${day},Smirnoff,3.4,bottle,70 cl,Speed rail 3.4,Sam Staff\r\n`));
  assert.ok(csv.includes(`\r\n${day},Whole milk,5,each,2 pint (1.14 litre) bottle,Bar fridge 2; Shake station 3,Sam Staff\r\n`));
  assert.ok(csv.includes(`\r\n${day},Grey Goose,,bottle,70 cl,,\r\n`), "not counted is a blank row");

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
  await M.click('[data-ct-wsave="Kraken"]'); await waitToast(M, /^Weights saved for Kraken\. Locked$/);
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
  // One flow for a bottle: full ones, then the open one by eye; ⚖️ Weigh it instead puts the scale first, and it stays.
  await S.click(row("Back bar", "Kraken"));
  assert.match(await text(S, ".ct-edit"), /^Full 70 cl 700 ml − 0 \+ \+6 Open None ¼ ½ ¾ For example: .* More/i);
  // cl ⇄ ml swaps which unit leads, everywhere on the count, and sticks.
  await S.click("[data-ct-unit]");
  assert.match(await text(S, ".ct-edit"), /^Full 700 ml 70 cl − 0/i);
  assert.equal(await S.evaluate(() => store.get("ctMlFirst")), true);
  await S.click("[data-ct-unit]");
  assert.match(await text(S, ".ct-edit"), /^Full 70 cl 700 ml − 0/i);
  assert.deepEqual(await S.evaluate(() => ["70 cl", "700ml", "70", "750", "1 litre", "0,7 l", "abc"].map(ctParseMl)), [700, 700, 700, 750, 1000, 700, 0]);
  // More stays open once it's opened, for anyone who weighs every bottle.
  await S.click("#ct-more summary");
  assert.match(await text(S, ".ct-edit"), /On the scale, grams/i);
  await S.fill("#ct-g", "932.5");
  assert.equal(await text(S, "#ct-g-out"), "Open bottle 0.5 · 350 ml · 35 cl");
  await S.press("#ct-g", "Enter"); await waitLine(S, "Kraken", [0, 50]);
  // A sealed one on the scale goes on Full by its +, so typing it twice never counts it twice.
  await S.fill("#ct-g", "1264"); assert.equal(await text(S, "#ct-g-out"), "That's a sealed one: tap + under Full instead");
  await S.press("#ct-g", "Enter"); await S.waitForTimeout(900); assert.deepEqual(await line(S, "Kraken"), [0, 50, "Sam Staff"]);
  await S.click('[data-ct-add="full:1"]'); await waitLine(S, "Kraken", [1, 50]);
  // Typed grams save by themselves a moment after typing stops, so Next straight after keeps them.
  await S.fill("#ct-g", "800"); await waitLine(S, "Kraken", [1, 30]);
  await say(S, "kraken 932 grams"); assert.match(await text(S, ".ct-heard"), /Kraken, Back bar: 1\.5 bottles/); await S.click("#ct-heard-ok"); await waitLine(S, "Kraken", [1, 50]);
  await say(S, "kraken 800"); assert.match(await text(S, ".ct-heard"), /Kraken, Back bar: 1\.3 bottles/, "a number no bottle count gets to is grams"); await S.click("#ct-heard-ok"); await waitLine(S, "Kraken", [1, 30]);
  // No weights: tap the level instead.
  await S.click(row("Prep and syrups", "Foamer"));
  assert.match(await text(S, ".ct-edit"), /No weights for Foamer yet\. A manager sets them once/);
  assert.ok(await S.$(".ct-edit [data-ct-lv]"), "the level is there straight away");

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
  assert.match(await S.evaluate(() => ctCsv()), new RegExp(`${today},Kraken,6,bottle,,,Sam Staff`));
  const rid = await S.evaluate(() => LIVE.received[0].id);
  await M.waitForFunction(() => LIVE.received.length === 1);
  assert.equal(await attempt(M, (i) => LIVE.api.dropReceived(i), rid), "allowed");
});

test("finding it when it isn't in shelf order: every place, not counted yet, Next past what's done, the how-to", async () => {
  await resetEmulators();
  const { S } = await team(browser, site, people);
  await S.evaluate(() => store.set("ctHow", false));
  // The first time: a walkthrough in plain words with pictures, before the list. The scale, then bottles, then not listed.
  await S.click("[data-tab=count]");
  await S.waitForSelector(".ct-intro");
  assert.match(await text(S, ".ct-intro"), /^1 of 9 Counting stock: how it works/i);
  assert.ok(await S.$(".ct-intro svg.ct-pic"));
  assert.equal(await S.$eval("#ct-find", (e) => e.hidden), true, "no find box while it's on");
  await S.click('[data-ct-intro="1"]'); assert.match(await text(S, ".ct-intro"), /Set up the scale .*flat, dry part of the bar top.*It should say 0 g\. If it doesn't, press Tare or Zero/i);
  await S.click('[data-ct-intro="2"]'); await S.click('[data-ct-intro="3"]'); assert.match(await text(S, ".ct-intro"), /2\. The open bottle Look at it level with your eye and tap None, ¼, ½ or ¾.*Photo check.*pourer off/i);
  await S.click('[data-ct-intro="4"]'); assert.match(await text(S, ".ct-intro"), /A worked example .*3 full \+ \.4 open = 3\.4 bottles of 70 cl = 238 cl, or 2,380 ml/i);
  for (const i of [5, 6, 7]) await S.click(`[data-ct-intro="${i}"]`);
  assert.match(await text(S, ".ct-intro"), /Can't find it\? .*📷 and scan the bottle's barcode.*＋ Add it and count it/i);
  await S.click('[data-ct-intro="8"]'); await S.click('[data-ct-intro="go"]');
  await S.waitForSelector("#ct .ct-row"); assert.equal(await S.evaluate(() => store.get("ctHow")), true);
  // Each line says what to do with it; How to count brings the walkthrough back.
  assert.match(await text(S, row("Speed rail", "Smirnoff")), /Smirnoff Full ones, then the open one: None, ¼, ½ or ¾/);
  assert.match(await text(S, row("Bar fridge", "Tonic")), /Tonic Count them: one is a 200 ml Fever-Tree bottle/);
  assert.match(await text(S, row("Bar fridge", "Funkin purées")), /Count them or weigh them: one is a 1 kg pouch/);
  await S.click('.ct-head [data-ct-intro="0"]'); await S.waitForSelector(".ct-intro"); await S.click('[data-ct-intro="go"]'); await S.waitForSelector("#ct .ct-row");
  // Search looks in every place: milk is in two, and each line says where.
  await S.fill("#ct-say", "whole mil");
  await S.waitForFunction(() => document.querySelectorAll("#ct-list .ct-row").length === 2);
  assert.match(await text(S, "#ct-list"), /Found in every place Whole milk Bar fridge .*Whole milk Shake station/i);
  // A typed count finds by its name, and Count it shows; Enter checks it before it saves.
  await S.fill("#ct-say", "grey goose 2");
  assert.equal(await S.$eval("#ct-say-go", (b) => b.hidden), false);
  assert.match(await text(S, "#ct-list"), /Found in Back bar Grey Goose/i);
  await S.press("#ct-say", "Enter");
  assert.match(await text(S, ".ct-heard"), /Grey Goose, Back bar: 2 bottles/);
  await S.click("#ct-heard-ok"); await waitLine(S, "Grey Goose", [2, 0]);
  assert.equal(await S.inputValue("#ct-say"), "", "the box clears for the next one");
  // Just a name and Go: the line opens. Nothing like it: says so.
  await S.fill("#ct-say", "xqzv"); assert.match(await text(S, "#ct-list"), /Nothing called “xqzv”/);
  await S.evaluate(() => { ctMoreOn = true; }); // Next sits under More on a bottle
  await S.fill("#ct-say", "smirnoff vanil"); await S.press("#ct-say", "Enter");
  await S.waitForSelector('.ct-row.on [data-ct-next="Speed rail|Smirnoff Vanilla"]');
  // Next goes past anything counted already while only what's left shows.
  await S.evaluate(() => { const r = ctRows().find((x) => x.item === "Tanqueray"); return LIVE.api.countLine(ctId(ctDay, r.area, r.item), { day: ctDay, area: r.area, item: r.item, unit: r.u, full: 1, open: 0 }); });
  await S.waitForFunction(() => LIVE.counts.some((x) => x.item === "Tanqueray" && !x.pending));
  const after = await S.evaluate(() => { const rs = ctRows(), i = rs.findIndex((r) => r.item === "Smirnoff Vanilla"); return rs.slice(i + 1).find((r) => !ctLine(r)).key; });
  assert.notEqual(after, "Speed rail|Tanqueray");
  await S.click('[data-ct-next="Speed rail|Smirnoff Vanilla"]');
  await S.waitForSelector(`.ct-row.on [data-ct-next="${after}"]`);
  // A place: the chip goes there; a place all counted shows everything.
  await S.click('[data-ct-jump="Freezer"]');
  assert.ok(await S.$(row("Freezer", "Ice cream")));
  assert.deepEqual(S.errs, []);
});

test("every bottle and pack comes filled in: size, empty and full weights, marked estimated until a manager checks one", async () => {
  await resetEmulators();
  const { M, S } = await team(browser, site, people);
  await openCount(S);
  // Filled in from measures.js: Smirnoff 70 cl, empty 420 g, full 420 + 700 × 0.952; Monkey 47 is a 50 cl bottle.
  const m = await S.evaluate(() => Object.fromEntries(["Smirnoff", "Monkey 47", "Baileys", "Drumshanbo Gunpowder", "Tonic", "Funkin purées", "Foamer"].map((n) => { const r = ctRows().find((x) => x.item === n); return [n, [r.u, r.ml, r.e, r.f, r.pw, r.est, r.size]]; })));
  assert.deepEqual(m.Smirnoff, ["bottle", 700, 420, 1086, 0, true, "70 cl"]);
  assert.deepEqual(m["Monkey 47"].slice(0, 2), ["bottle", 500]);
  assert.ok(m.Baileys[3] - m.Baileys[2] > 700, "a cream liqueur weighs more than its ml");
  assert.equal(m["Drumshanbo Gunpowder"][0], "bottle", "Gunpowder gin isn't a tub of powder");
  assert.deepEqual(m.Tonic.slice(0, 1).concat(m.Tonic.slice(6)), ["each", "200 ml Fever-Tree bottle"]);
  assert.deepEqual(m["Funkin purées"].slice(2, 7), [30, 0, 1000, true, "1 kg pouch"]);
  assert.deepEqual(m.Foamer.slice(2, 4), [0, 0], "nothing made up where the product isn't known");
  // Weighing works straight away, and says the weights are estimates.
  await S.evaluate(() => { ctMoreOn = true; });
  await S.click(row("Speed rail", "Smirnoff"));
  assert.match(await text(S, ".ct-edit"), /^Full 70 cl/);
  assert.match(await text(S, ".ct-edit"), /70 cl · 700 ml: empty 420 g, full 1086 g\. A sealed one goes on Full\. Weights estimated\. A manager can check them\./);
  await S.fill("#ct-g", "753"); await waitLine(S, "Smirnoff", [0, 50]);
  assert.equal(await S.$("[data-ct-chk]"), null, "only managers check");
  await S.click(row("Bar fridge", "Tonic"));
  assert.match(await text(S, ".ct-edit"), /One is a 200 ml Fever-Tree bottle\./);
  // A manager weighs one sealed bottle: the empty weight follows, and it's checked for everyone.
  await openCount(M); await M.click('[data-ct-show="all"]'); await M.evaluate(() => { ctMoreOn = true; });
  await M.click(row("Speed rail", "Smirnoff"));
  await M.click(".ct-wbox summary"); await M.fill('[data-ct-chk="Smirnoff"]', "1100"); await M.click('[data-ct-chkgo="Smirnoff"]');
  await waitToast(M, /^Smirnoff checked: empty 434 g, full 1100 g\. Locked$/);
  await S.waitForFunction(() => { const r = ctRows().find((x) => x.item === "Smirnoff"); return r.e === 434 && r.f === 1100 && !r.est; });
  await S.click('[data-ct-show="all"]'); await S.click(row("Speed rail", "Smirnoff"));
  assert.match(await text(S, ".ct-edit"), /🔒 Locked: weighed by Mia Manager/);
  // Packs: a full one, packaging and all, gives what's in one.
  await M.click(row("Bar fridge", "Funkin purées")); await M.click(".ct-wbox summary");
  await M.fill('[data-ct-chk="Funkin purées"]', "1050"); await M.click('[data-ct-chkgo="Funkin purées"]');
  await waitToast(M, /^Funkin purées checked: 1020 g in one\. Locked$/);
  // Setup shows which are estimated, and the spreadsheet has the size.
  assert.match(await S.evaluate(() => ctCsv()), /,Monkey 47,,bottle,50 cl,,/);
  await M.click("#ct-setup");
  assert.match(await text(M, '[data-ct-sk="Back bar|Grey Goose"] summary'), /bottle · 70 cl · 700 ml · weights estimated/);
  assert.match(await text(M, '[data-ct-sk="Speed rail|Smirnoff"] summary'), /🔒 weighed/);
  // Weighed is locked: no weights to edit by accident, until a deliberate Unlock, and it locks again once re-weighed.
  await M.click('[data-ct-sk="Speed rail|Smirnoff"] summary'); await M.waitForSelector('[data-ct-sk="Speed rail|Smirnoff"] [data-ct-unlock]');
  assert.match(await text(M, '[data-ct-sk="Speed rail|Smirnoff"] .ct-w'), /🔒 Locked: weighed by Mia Manager, .* Empty 434 g, full 1100 g/);
  assert.equal(await M.$('[data-ct-sk="Speed rail|Smirnoff"] [data-ct-wf="e"]'), null);
  await M.click('[data-ct-sk="Speed rail|Smirnoff"] [data-ct-unlock]');
  await M.fill('[data-ct-sk="Speed rail|Smirnoff"] [data-ct-wf="e"]', "430"); await M.fill('[data-ct-sk="Speed rail|Smirnoff"] [data-ct-wf="f"]', "1096");
  await M.click('[data-ct-wsave="Smirnoff"]'); await waitToast(M, /^Weights saved for Smirnoff\. Locked$/);
  await M.waitForSelector('[data-ct-sk="Speed rail|Smirnoff"] [data-ct-unlock]');
  assert.deepEqual(await M.evaluate(() => { const o = LIVE.countSetup.items.Smirnoff; return [o.e, o.f, o.wb]; }), [430, 1096, "Mia Manager"]);
  // A spreadsheet can't change a locked one.
  assert.deepEqual(await M.evaluate(() => [[{ item: "Smirnoff", unit: "bottle", ml: 700, e: 500, f: 1200 }], [{ item: "Smirnoff", unit: "bottle", ml: 700, e: 430, f: 1096 }]].map((xs) => IM_KINDS.setup.plan(xs)[0]).map((x) => x.why || x.st)), ["Weighed and locked. Unlock it on the stock count to re-weigh", "same"]);
  for (const p of [M, S]) assert.deepEqual(p.errs, []);
});

test("its own Stock tab: scan a barcode to find or link it, managers check it, use-by from the date labels, tips", async () => {
  await resetEmulators();
  const { M, S } = await team(browser, site, people);
  const code = "5410316983044";
  await S.route("https://world.openfoodfacts.org/**", (r) => r.fulfill({ json: { status: 1, product: { product_name: "Red Label Vodka", brands: "Smirnoff", categories_tags: ["en:vodkas"] } } }));
  // Stock is its own tab; Shift keeps the 86 board, with a pointer across.
  await S.click("[data-tab=tally]"); await S.click(".ptabs [data-pane=stock]");
  assert.match(await text(S, ".ptabs [data-pane=stock]"), /^86/);
  assert.match(await text(S, ".ct-move"), /own tab: Stock ›/);
  await S.click(".ct-move [data-goto=count]"); await S.waitForSelector("#ct .ct-row");
  assert.equal(await S.evaluate(() => cur), "count");
  assert.match(await text(S, "#ct-tips summary"), /Counting tips/i);
  await S.click("#ct-tips summary"); assert.match(await text(S, "#ct-tips"), /Top shelf to bottom, left to right, front to back.*Kegs and the postmix/);
  assert.ok(await S.$("#it-add"), "Add something new is here");
  // A barcode nobody has linked: what it is online, the closest lines, and picking one links it for everyone.
  await S.fill("#ct-say", code); await S.press("#ct-say", "Enter");
  await S.waitForSelector(".ct-scan [data-ct-link]");
  assert.match(await text(S, ".ct-scan"), /Which one is it\? Online it's “Smirnoff Red Label Vodka”/i);
  await S.click('.ct-scan [data-ct-link="Smirnoff"]');
  await waitToast(S, /^Linked to Smirnoff\. A manager checks it$/);
  assert.match(await text(S, ".ct-scan"), /Waiting for a manager to check Smirnoff Count it: Speed rail/i);
  await M.waitForFunction((c) => LIVE.codes.some((x) => x.code === c && x.item === "Smirnoff" && !x.ok && !x.pending), code);
  // Count it opens the line.
  await S.click('.ct-scan [data-ct-row="Speed rail|Smirnoff"]'); await S.waitForSelector(".ct-row.on");
  assert.match(await S.$eval(".ct-row.on", (e) => e.innerText), /Smirnoff/); assert.equal(await S.$(".ct-scan"), null);
  // A manager checks it.
  await openCount(M); await M.click("#ct-codes summary");
  assert.match(await text(M, "#ct-codes"), /Smirnoff 5410316983044 · Sam Staff/);
  await M.click(`#ct-codes [data-ct-code-ok="${code}"]`); await waitToast(M, /^Checked: Smirnoff$/);
  await S.waitForFunction((c) => LIVE.codes.some((x) => x.code === c && x.ok && !x.pending), code);
  // The rules: staff can't change a checked one or check their own; a manager can.
  assert.equal(await attempt(S, (c) => LIVE.api.linkCode(c, "Kraken", false), code), "permission-denied");
  assert.equal(await attempt(S, (c) => LIVE.api.linkCode(c, "Kraken", true), "5000000000001"), "permission-denied");
  assert.equal(await attempt(S, (c) => LIVE.api.linkCode(c, "Kraken", false), "12ab"), "permission-denied");
  assert.equal(await attempt(S, (c) => LIVE.api.dropCode(c), code), "permission-denied");
  // Use-by: a label opened today that keeps 2 days is in the next 3; Changed it on the Stock tab saves it in one tap.
  await M.evaluate(() => LIVE.api.label(null, "added", { item: "Lime juice", side: "bar", life: 2, on: true, station: "" }));
  await S.waitForFunction(() => LIVE.labels.some((x) => x.item === "Lime juice" && !x.pending));
  await S.evaluate(() => { const x = LIVE.labels.find((y) => y.item === "Lime juice"); return LIVE.api.label(x, "opened", { useBy: addDays(shiftDay(), 2) }); });
  await S.waitForSelector("#ct-useby");
  assert.match(await text(S, "#ct-useby summary"), /Use-by: 1 in the next 3 days/i);
  // Scanning the Smirnoff again finds it straight away, with no date label; a manager can give it one.
  await S.fill("#ct-say", code); await S.press("#ct-say", "Enter");
  await S.waitForSelector(".ct-scan h3");
  assert.match(await text(S, ".ct-scan"), /^Barcode 5410316983044 Smirnoff Count it: Speed rail.*No date label for Smirnoff\. If it goes off once it's opened, a manager adds one\./i);
  assert.equal(await S.$(".ct-scan [data-ct-relink]"), null, "staff can't change a checked one");
  await S.click(".ct-scan [data-ct-scan-x]");
  await S.click("#ct-useby summary").catch(() => {});
  if (!(await S.$eval("#ct-useby", (e) => e.open))) await S.click("#ct-useby summary");
  await S.click('#ct-useby [data-ct-lb-act="changed"]');
  await waitToast(S, /^Lime juice: use by /);
  await S.waitForFunction(() => LIVE.labels.find((x) => x.item === "Lime juice").act === "changed");
  // Same as last time: one tap does the line from the last count, and the next one opens.
  await S.evaluate(() => { const d = addDays(shiftDay(), -1), r = ctRows().find((x) => x.item === "Tanqueray"); return LIVE.api.countLine(ctId(d, r.area, r.item), { day: d, area: r.area, item: r.item, unit: r.u, full: 2, open: 30 }); });
  await S.evaluate(() => { ctPrevFor = ""; ctRender(true); });
  await S.waitForFunction(() => ctPrev?.lines.some((x) => x.item === "Tanqueray"));
  await S.click('[data-ct-show="all"]'); await S.click(row("Speed rail", "Tanqueray"));
  assert.match(await text(S, ".ct-same"), /Same as last time: 2\.3 bottles/i);
  await S.click(".ct-same"); await waitLine(S, "Tanqueray", [2, 30]);
  await S.waitForFunction(() => ctOpen && ctOpen !== "Speed rail|Tanqueray");
  // Photo check: their photo beside a sealed one; the first sealed one is kept for everyone.
  const jpg = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");
  await S.evaluate(() => { ctMoreOn = true; });
  await S.click(row("Back bar", "Kraken"));
  await S.setInputFiles("#ct-ph-in", { name: "open.jpg", mimeType: "image/jpeg", buffer: jpg });
  await S.waitForSelector(".ct-phc img");
  await S.waitForFunction(() => ctPh?.ref === null);
  assert.match(await text(S, ".ct-edit"), /Yours Sealed No photo of a sealed Kraken yet\. Compare the two, then tap the level/i);
  await S.setInputFiles("#ct-ref-in", { name: "sealed.jpg", mimeType: "image/jpeg", buffer: jpg });
  await waitToast(S, /^Sealed Kraken kept for everyone$/);
  assert.equal(await S.locator(".ct-phc img").count(), 2);
  assert.equal(await attempt(S, () => LIVE.api.countPhoto("kraken", "Kraken", "data:image/jpeg;base64,AAAA")), "permission-denied", "staff can't replace it");
  // Not on the count at all: add it from Find and count it straight away, before Maintenance checks it.
  await S.route("https://*.wikipedia.org/**", (r) => r.fulfill({ json: { query: { pages: [] } } }));
  await S.fill("#ct-say", "Biscoff crumb topping"); await S.waitForSelector("#ct-list [data-ct-new]");
  await S.click("#ct-list [data-ct-new]"); await S.waitForSelector(".itf");
  await S.click("#it-save");
  await waitToast(S, /^Biscoff crumb topping is on the count: count it now$/);
  assert.match(await S.$eval(".ct-row.on", (e) => e.innerText), /Biscoff crumb topping/);
  await S.click('.ct-row.on [data-ct-add="full:1"]'); await waitLine(S, "Biscoff crumb topping", [1, 0]);
  // › goes to that side's date labels on Shift.
  await S.click("[data-tab=count]"); if (!(await S.$eval("#ct-useby", (e) => e.open))) await S.click("#ct-useby summary");
  await S.click("#ct-useby [data-ct-lbgo=bar]");
  assert.equal(await S.evaluate(() => [cur, pane].join()), "tally,labels");
  for (const p of [M, S]) assert.deepEqual(p.errs, []);
});
