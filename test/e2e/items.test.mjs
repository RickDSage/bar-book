// Adding anything new (items.js): the phone looks it up (Wikipedia, stubbed here) and works out where it goes; staff
// and managers' adds wait for Maintenance; once on, it's on the 86 list, restocking, the date labels and closing.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, toastOf, attempt } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });
const people = [["M", "Mia Manager", "mia", "manager"], ["S", "Sam Staff", "sam", "staff"]];

const flat = (s) => s.replace(/\s+/g, " ").trim();
const text = async (p, sel) => flat(await p.$eval(sel, (e) => e.innerText));
const waitToast = (p, re) => p.waitForFunction((s) => new RegExp(s).test(document.querySelector("#toast").textContent), re.source);
const pane = async (p, k, side = "bar") => { await p.click("[data-tab=tally]"); await p.click(`[data-mode=${side}]`); await p.click(`.ptabs [data-pane=${k}]`); };
// What Wikipedia's search says, by what was typed. Anything else: nothing found.
const WIKI = {
  "Rubicon Mango": [["Rubicon Drinks", "UK soft drink manufacturer"], ["A.G. Barr", "Scottish soft drink producer"]],
  Strawberries: [["Fresh Strawberries", "2014 single by Franz Ferdinand"], ["Strawberry", "Edible fruit"]],
};
const wiki = (p, down = false) => p.route("https://en.wikipedia.org/**", (r) => {
  if (down) return r.abort();
  const q = new URL(r.request().url()).searchParams.get("gsrsearch");
  r.fulfill({ json: { query: { pages: (WIKI[q] || []).map(([title, description], i) => ({ title, description, index: i + 1 })) } } });
});
const look = async (p, name) => { if (!(await p.$eval("#it-add", (e) => e.open))) await p.click("#it-add summary"); await p.fill("#it-name", name); await p.click("#it-look"); await p.waitForSelector(".itf"); };
const opts = (p, sel) => p.$$eval(`${sel} optgroup`, (gs) => Object.fromEntries(gs.map((g) => [g.label, [...g.children].map((o) => o.textContent)])));

test("staff add Rubicon Mango: it's worked out, waits for Maintenance, then it's on the 86 list, restocking and closing", async () => {
  await resetEmulators();
  const { O, M, S } = await team(browser, site, people);
  for (const p of [O, M, S]) await wiki(p);
  await pane(S, "stock");
  assert.equal(await S.$eval("#it-add", (e) => e.open), false, "folded away until it's needed");
  await look(S, "Rubicon Mango");
  assert.match(await text(S, ".itf"), /Found online: Rubicon Drinks: UK soft drink manufacturer \(Wikipedia\)/);
  assert.match(await text(S, ".itf"), /Rubicon Mango looks like: Soft drink, mixer or water/);
  assert.deepEqual(await S.evaluate(() => [itF.kind, itF.side, itF.store, itF.label, itF.close]), ["soft", "bar", "bottle", false, "keep"]);
  assert.match(await text(S, ".itf"), /Goes under Soft drinks and mixers on the 86 list and restocking, and on the bar closing page/);
  assert.match(await text(S, "#it-save"), /^Send it to Maintenance to check$/);
  await S.click("#it-save");
  await waitToast(S, /^Sent\. Maintenance will check Rubicon Mango$/);
  await S.waitForFunction(() => LIVE.items.length === 1 && !LIVE.items[0].pending);
  assert.match(await text(S, "#it-add"), /Rubicon Mango Waiting for Maintenance/);
  // Not on the lists yet, and nobody but Maintenance can put it on.
  assert.equal((await opts(S, "#s-86"))["Soft drinks and mixers"].includes("Rubicon Mango"), false);
  const x = await S.evaluate(() => LIVE.items[0]);
  assert.equal(await attempt(S, (x) => LIVE.api.saveItem(x, x), x), "permission-denied");
  assert.equal(await attempt(M, (x) => LIVE.api.saveItem(x, x), x), "permission-denied");
  // Typing it again says it's waiting.
  await S.click("#it-cancel").catch(() => {});
  await S.fill("#it-name", "rubicon mango"); await S.click("#it-look");
  assert.equal(await toastOf(S), "Sam Staff has added it already: it's waiting for Maintenance");

  // Maintenance is told, checks it and approves it.
  await pane(O, "stock");
  assert.equal(await O.$eval("#it-add", (e) => e.open), true, "open for Maintenance while something waits");
  await O.click(`[data-it-edit="${x.id}"]`);
  assert.match(await text(O, "#it-save"), /^Approve and add it$/);
  await O.click("#it-save");
  await S.waitForFunction(() => LIVE.items[0].status === "live" && !LIVE.items[0].pending);
  await waitToast(S, /^✅ Rubicon Mango is on every phone now$/);
  const now = await S.evaluate(() => LIVE.items[0]);
  assert.equal(now.addedBy, "Sam Staff");
  await S.evaluate(() => { document.activeElement.blur(); renderTally(); });
  const g = await opts(S, "#s-86");
  assert.equal(g["Soft drinks and mixers"].filter((n) => n === "Rubicon Mango").length, 1, "on the 86 list once, beside the other softs");
  // 86 it from the list: the one board has it.
  await S.selectOption("#s-86", "Rubicon Mango");
  await O.waitForFunction(() => LIVE.out.has("Rubicon Mango"));
  // Restocking has it too, and the bar's closing page says what to do with it.
  assert.equal((await opts(S, "#rs-item"))["Soft drinks and mixers"].includes("Rubicon Mango"), true);
  await pane(S, "close");
  await S.click("#it-close summary");
  assert.match(await text(S, "#it-close"), /Putting away: 1 added item Leave it where it lives Rubicon Mango · Bottle fridge · Opened bottle or can left over: bin it\. Restock the fridge\./i);
  for (const p of [O, M, S]) assert.deepEqual(p.errs, []);
});

test("strawberries are on the stock list already: adding them says where they're kept and puts them on the labels, once", async () => {
  await resetEmulators();
  const { O, S } = await team(browser, site, people);
  await wiki(O);
  await pane(O, "stock");
  await look(O, "Fresh strawberries");
  // The song comes first online, but the fruit is what it is; it keeps the stock list's own name.
  assert.match(await text(O, ".itf"), /Found online: Strawberry: Edible fruit/);
  assert.match(await text(O, ".itf"), /Strawberries looks like: Fresh fruit, herb or garnish/);
  assert.match(await text(O, ".itf"), /Strawberries is on the stock list already, under Fruit and garnish\. This adds where it's kept and what happens to it at close, and puts it on the date labels\./);
  assert.deepEqual(await O.evaluate(() => [itF.store, itF.label, itF.life, itF.close]), ["fridge", true, "", "cover"]);
  // Days from the pack: 3. Maintenance's go on straight away, with the date label.
  await O.fill('[data-it="life"]', "3");
  assert.match(await text(O, "#it-save"), /^Add it$/);
  await O.click("#it-save");
  await S.waitForFunction(() => LIVE.items.some((x) => x.item === "Strawberries" && x.status === "live" && !x.pending) && LIVE.labels.some((x) => x.item === "Strawberries" && !x.pending));
  assert.deepEqual(await S.evaluate(() => { const l = LIVE.labels.find((x) => x.item === "Strawberries"); return [l.side, l.life, l.on]; }), ["bar", 3, true]);
  await pane(S, "stock");
  assert.equal((await opts(S, "#s-86"))["Fruit and garnish"].filter((n) => n === "Strawberries").length, 1, "still one line on the 86 list");
  await S.click("#it-add summary");
  await S.click("#it-list summary");
  assert.match(await text(S, "#it-list"), /Strawberries Fruit and garnish Fridge · date label, keeps 3 days once opened · at close: cover, label and fridge/);
  // Only one each: typing it again is refused.
  await S.fill("#it-name", "strawberries"); await S.click("#it-look");
  assert.equal(await toastOf(S), "It's added already (Fruit and garnish)");
  for (const p of [O, S]) assert.deepEqual(p.errs, []);
});

test("no signal: it's worked out from the name; no days means it waits on Black Tap's label list; whoever added it can take it back", async () => {
  await resetEmulators();
  const { O, M, S } = await team(browser, site, people);
  await wiki(M, true); await wiki(O);
  await pane(M, "stock");
  await look(M, "Funkin passion fruit purée");
  assert.match(await text(M, ".itf"), /Couldn't look it up online \(no signal\?\)\. Worked out from the name\./);
  assert.deepEqual(await M.evaluate(() => [itF.kind, itF.store, itF.label, itF.close]), ["puree", "fridge", true, "fridge"]);
  // A change of kind fills in that kind's defaults.
  await M.selectOption('[data-it="kind"]', "dessert");
  assert.deepEqual(await M.evaluate(() => [itF.side, itF.life, itF.close]), ["floor", "2", "cover"]);
  await M.selectOption('[data-it="kind"]', "puree");
  // Funkin's typical days come in, marked as typical; clearing them leaves it for whoever has the pack.
  assert.equal(await M.inputValue('[data-it="life"]'), "8");
  assert.match(await text(M, ".itf"), /Shelf life · Fridge once opened Funkin purées: fridge once opened, 8 to 10 days \(the pack says which\)\. Typical only: the date on the pack always wins\./);
  assert.match(await text(M, ".itf"), /Filled in from the typical shelf life above\. Change it to what the pack says\./);
  await M.fill('[data-it="life"]', "");
  await M.click("#it-save");
  await M.waitForFunction(() => LIVE.items.length === 1 && !LIVE.items[0].pending);
  // A manager's waits too. Maintenance approves it with no days: it goes on Black Tap's label list for them.
  const id = await M.evaluate(() => LIVE.items[0].id);
  await pane(O, "stock");
  await O.click(`[data-it-edit="${id}"]`);
  await O.click("#it-save");
  await M.waitForFunction(() => LIVE.items[0].status === "live");
  await pane(M, "labels");
  await M.waitForSelector("#lb-list");
  assert.match(await text(M, "#lb-list"), /Added by the team Funkin passion fruit purée/i);
  assert.equal(await M.evaluate(() => LIVE.labels.length), 0, "no label made up without its days");

  // Staff take back their own while it waits; not anyone else's, and not once it's on.
  await wiki(S);
  await pane(S, "stock");
  await look(S, "Mango");
  assert.match(await text(S, ".itf"), /Mango looks like: Fresh fruit, herb or garnish/);
  await S.click("#it-save");
  await S.waitForFunction(() => LIVE.items.some((x) => x.item === "Mango" && !x.pending));
  S.answer = undefined;
  const mango = await S.evaluate(() => LIVE.items.find((x) => x.item === "Mango").id);
  await S.click(`[data-it-drop="${mango}"]`);
  await S.waitForFunction(() => !LIVE.items.some((x) => x.item === "Mango"));
  assert.equal(await attempt(S, (i) => LIVE.api.dropItem(i), id), "permission-denied");
  for (const p of [O, M, S]) assert.deepEqual(p.errs, []);
});

test("typos and other languages: lymes 86s Limes, strawbery is Strawberries, Hindi finds the English name, and shelf life shows for what we stock", async () => {
  await resetEmulators();
  const { O, S } = await team(browser, site, people.slice(1));
  await O.route("https://*.wikipedia.org/**", (r) => {
    const u = new URL(r.request().url()), q = u.searchParams.get("gsrsearch"), t = u.searchParams.get("titles");
    if (u.hostname.startsWith("hi.")) return r.fulfill({ json: { query: { pages: q === "स्ट्रॉबेरी" ? [{ title: "स्ट्रॉबेरी", index: 1, langlinks: [{ lang: "en", title: "Strawberry" }] }, { title: "हिल", index: 2, langlinks: [{ lang: "en", title: "Hill" }] }] : [] } } });
    if (t) return r.fulfill({ json: { query: { pages: t.split("|").map((x) => ({ title: x, description: x === "Strawberry" ? "Edible fruit" : "" })) } } });
    // A typo Wikipedia can't place finds a film: it doesn't share a word with what was typed, so it's ignored.
    r.fulfill({ json: { query: { pages: [{ title: "Dr. No (film)", description: "1962 film", index: 1 }, { title: "Tootsie Roll", description: "Chocolate flavored chewy candy", index: 2 }] } } });
  });
  // The 86 box takes a typo and 86s the stock list's own name, so the drinks see it.
  await pane(S, "stock");
  await S.fill("#s-86-own", "lymes"); await S.click("#s-86-go");
  await O.waitForFunction(() => LIVE.out.has("Limes"));
  assert.equal(await toastOf(S), "Limes 86'd (you typed “lymes”)");
  // A typo of something we stock is the stock list's item.
  await pane(O, "stock");
  await look(O, "strawbery");
  assert.match(await text(O, ".itf"), /You typed “strawbery”: it's Strawberries\./);
  assert.match(await text(O, ".itf"), /Nothing found online/, "the film and the sweets don't count");
  assert.match(await text(O, ".itf"), /Shelf life · Fridge once opened Cut fruit and garnish: use it the same day\. Whole: fridge\./);
  await O.click("#it-cancel");
  // Nothing known and nothing found: the closest things it knows, one tap away, and it can still be added.
  await look(O, "limez wedges");
  assert.ok((await O.$$eval("[data-it-pick]", (b) => b.map((x) => x.dataset.itPick))).includes("Limes"));
  await O.click('[data-it-pick="Limes"]');
  await O.waitForFunction(() => itF?.item === "Limes" && itF.kind);
  await O.click("#it-cancel");
  // In Hindi: looked up on Hindi Wikipedia, linked to the English page, and named as the stock list names it.
  await O.evaluate(() => { lang = "hi"; });
  await look(O, "स्ट्रॉबेरी");
  assert.equal(await O.evaluate(() => itF.item), "Strawberries");
  assert.match(await text(O, ".itf"), /Found online: Strawberry: Edible fruit/);
  await O.click("#it-cancel");
  await O.evaluate(() => { lang = ""; });
  // Typical shelf lives: oat milk from Oatly's pack, vermouth about a month, Baileys no fridge; a label's own days show.
  await O.evaluate(() => LIVE.api.label(null, "added", { item: "Oat milk", side: "bar", life: 4, on: true }));
  await O.waitForFunction(() => LIVE.labels.some((x) => x.item === "Oat milk" && !x.pending));
  await look(O, "oat milk");
  assert.equal(await O.inputValue('[data-it="life"]'), "5");
  assert.match(await text(O, ".it-keep"), /Oatly: keep in the fridge, use within 5 days once opened.*Bar: keeps 4 days once opened \(set on Labels\)/);
  await O.click("#it-cancel");
  assert.deepEqual(await O.evaluate(() => [itKeep("Martini Rosso").days, itKeep("Baileys").fridge, itKeep("Vanilla ice cream", "icecream").say]), [30, false, "Freezer, lid on"]);
  // Black Tap's label list shows what's typical, without filling it in.
  await pane(O, "labels");
  assert.equal(await O.getAttribute('[data-lbs-life="Whole milk"]', "placeholder"), "typ. 3");
  assert.equal(await O.inputValue('[data-lbs-life="Whole milk"]'), "");
  for (const p of [O, S]) assert.deepEqual(p.errs, []);
});
