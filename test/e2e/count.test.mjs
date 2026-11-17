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
  // The scale comes first on a phone; no scale, the level is one tap away, and stays picked.
  await S.click('[data-ct-lvl="1"]');
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
  // One flow for a bottle: full ones, then the open one on the scale. No mode to pick.
  await S.click(row("Back bar", "Kraken"));
  assert.match(await text(S, ".ct-edit"), /1\. Full, sealed bottles .*2\. The open one On the scale, grams/);
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
  assert.match(await text(S, ".ct-edit"), /No weights for Foamer yet, so tap how full it is\. A manager sets them once/);
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
  await openCount(S);
  // The how-to is open the first time, and stays shut once closed.
  assert.match(await text(S, "#ct-how"), /Full, sealed bottles: tap \+ for each one\. The open bottle: take the pourer off, stand it on the scale/);
  assert.equal(await S.$eval("#ct-how", (d) => d.open), true);
  await S.click("#ct-how summary"); await S.waitForFunction(() => store.get("ctHow") === true);
  // Search looks in every place: milk is in two, and each line says where.
  await S.fill("#ct-say", "whole mil");
  await S.waitForFunction(() => document.querySelectorAll("#ct-list .ct-row").length === 2);
  assert.match(await text(S, "#ct-list"), /Found in every place Whole milk Bar fridge Whole milk Shake station/i);
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
  await S.click(row("Speed rail", "Smirnoff"));
  assert.match(await text(S, ".ct-edit"), /1\. Full, sealed bottles 70 cl/);
  assert.match(await text(S, ".ct-edit"), /70 cl: empty 420 g, full 1086 g\. A sealed one goes on Full\. Weights estimated\. A manager can check them\./);
  await S.fill("#ct-g", "753"); await waitLine(S, "Smirnoff", [0, 50]);
  assert.equal(await S.$("[data-ct-chk]"), null, "only managers check");
  await S.click(row("Bar fridge", "Tonic"));
  assert.match(await text(S, ".ct-edit"), /One is a 200 ml Fever-Tree bottle\./);
  // A manager weighs one sealed bottle: the empty weight follows, and it's checked for everyone.
  await openCount(M); await M.click('[data-ct-show="all"]');
  await M.click(row("Speed rail", "Smirnoff"));
  await M.click(".ct-wbox summary"); await M.fill('[data-ct-chk="Smirnoff"]', "1100"); await M.click('[data-ct-chkgo="Smirnoff"]');
  await waitToast(M, /^Smirnoff checked: empty 434 g, full 1100 g$/);
  await S.waitForFunction(() => { const r = ctRows().find((x) => x.item === "Smirnoff"); return r.e === 434 && r.f === 1100 && !r.est; });
  await S.click('[data-ct-show="all"]'); await S.click(row("Speed rail", "Smirnoff"));
  assert.match(await text(S, ".ct-edit"), /Weights checked\./);
  // Packs: a full one, packaging and all, gives what's in one.
  await M.click(row("Bar fridge", "Funkin purées")); await M.click(".ct-wbox summary");
  await M.fill('[data-ct-chk="Funkin purées"]', "1050"); await M.click('[data-ct-chkgo="Funkin purées"]');
  await waitToast(M, /^Funkin purées checked: 1020 g in one$/);
  // Setup shows which are estimated, and the spreadsheet has the size.
  assert.match(await S.evaluate(() => ctCsv()), /,Monkey 47,,bottle,50 cl,,/);
  await M.click("#ct-setup");
  assert.match(await text(M, '[data-ct-sk="Back bar|Grey Goose"] summary'), /bottle · 70 cl · weights estimated/);
  assert.match(await text(M, '[data-ct-sk="Speed rail|Smirnoff"] summary'), /weights checked/);
  for (const p of [M, S]) assert.deepEqual(p.errs, []);
});
