// Old records, training sign-off and hostile records end to end: what managers download, what staff see in Practise,
// and that nothing written outside the app can run code.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, toastOf, attempt, adminWrite } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });
const people = [["M", "Mia Manager", "mia", "manager"], ["S", "Sam Staff", "sam", "staff"]];
const text = (p, sel) => p.$eval(sel, (e) => e.textContent);
const rx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const waitText = (p, sel, re) => p.waitForFunction(([s, r]) => new RegExp(r).test(document.querySelector(s)?.textContent || ""), [sel, re.source]);
const waitToast = (p, re) => p.waitForFunction((s) => new RegExp(s).test(document.querySelector("#toast").textContent), re.source);
const managers = async (p, sub) => { await p.evaluate(() => show("notices")); await p.click("[data-tpane=managers]"); await p.click(`[data-msub=${sub}]`); };
// Prepares a download, then reads the file the Save button would give.
async function download(p, id) {
  await p.click(`#${id}-csv`);
  await p.waitForSelector(`#${id}-save`);
  return p.evaluate(async (i) => { const a = document.querySelector(`#${i}-save`); return { name: a.download, csv: (await (await fetch(a.href)).text()).replace(/^\ufeff/, "") }; }, id);
}

test("temperatures, waste and stock counts are left to Alert65 and Nory; what was saved before stays in the downloads", async () => {
  await resetEmulators();
  const { O, S } = await team(browser, site, people);
  const str = (s) => ({ stringValue: s }), num = (n) => ({ doubleValue: n }), at = { timestampValue: new Date(Date.now() - 3 * 864e5).toISOString() };
  await adminWrite("waste/w1", { item: str("Guinness"), qty: num(2), unit: str("pint"), reason: str("spilt"), note: str(""), side: str("bar"), day: str("2026-10-22"), uid: str("x"), name: str("Sam Staff"), at });
  await adminWrite("safety/r1", { kit: str("k1"), kitName: str("Back bar fridge"), kind: str("fridge"), side: str("bar"), c: num(9), note: str(""), day: str("2026-10-22"), uid: str("x"), name: str("Sam Staff"), at });
  const line = { mapValue: { fields: { item: str("Tanqueray"), group: str("Gin"), par: num(6), n: num(2) } } };
  await adminWrite("counts/c1", { lines: { arrayValue: { values: [line] } }, note: str("Sunday close"), uid: str("x"), name: str("Mia Manager"), at });

  // Shift has no Logs pane, Managers no Waste, Safety or Stock, and the app has no way left to write them.
  await S.click("[data-tab=tally]");
  assert.deepEqual(await S.$$eval(".ptabs [data-pane]", (x) => x.map((b) => b.dataset.pane)), ["open", "labels", "stock", "close", "send"]);
  await S.click("[data-mode=floor]");
  assert.deepEqual(await S.$$eval(".ptabs [data-pane]", (x) => x.map((b) => b.dataset.pane)), ["fset", "fshake", "stock", "fclose", "send"]);
  assert.deepEqual(await S.evaluate(() => ["waste", "logCheck", "addKit", "setPar", "saveCount"].filter((k) => LIVE.api[k])), []);
  await managers(O, "act");
  assert.deepEqual(await O.$$eval("#msub [data-msub]", (x) => x.map((b) => b.dataset.msub)), ["live", "act", "kpis", "nights", "incidents", "out", "training", "team", "feedback"]);

  // Managers download the old records from Activity.
  const safety = await download(O, "old-safety");
  assert.match(safety.name, /^black-tap-safety-checks-/);
  assert.match(safety.csv, /^Night,Time,Side,Equipment,Type,Reading \(°C\),Result,Note,By\r\n2026-10-22,\d\d:\d\d,Bar,Back bar fridge,Fridge,9,"Over 8°C, the legal limit for chilled food. Tell a manager",,Sam Staff$/);
  const waste = await download(O, "old-waste");
  assert.match(waste.csv, /^Night,Time,Side,Item,Quantity,Unit,Reason,Note,Logged by\r\n2026-10-22,\d\d:\d\d,Bar,Guinness,2,Pints,Spilt or dropped,,Sam Staff$/);
  const counts = await download(O, "old-counts");
  assert.match(counts.csv, /^Date,Time,Counted by,Item,Group,Par,Counted,To order\r\n\d{4}-\d\d-\d\d,\d\d:\d\d,Mia Manager,Tanqueray,Gin,6,2,4$/);
  assert.equal(await S.locator("#old-safety-csv").count(), 0, "staff don't get the downloads");

  // Accidents and near misses go in Alert65 now.
  await S.evaluate(() => show("notices")); await S.click("[data-tpane=me]"); await S.click("[data-mek=incident]");
  const kinds = await S.$$eval("[data-f=ikind] option", (x) => x.map((o) => o.textContent));
  assert.ok(!kinds.some((k) => /Accident|Near miss/.test(k)), kinds.join());
  assert.match(await text(S, "#me"), /Accidents, injuries and near misses go in Alert65/);
  assert.deepEqual([O.errs, S.errs], [[], []]);
});

test("training: managers sign people off drink by drink, and staff see it in Practise", async () => {
  await resetEmulators();
  const { O, M, S } = await team(browser, site, people);
  await managers(M, "training");
  const sam = await M.evaluate(() => LIVE.staff.find((p) => p.name === "Sam Staff").uid);
  await M.click(`[data-tr-who="${sam}"]`);
  const first = await M.$eval("[data-tr-sign]", (b) => b.dataset.trSign);
  await M.click("[data-tr-sign] >> nth=0");
  await waitToast(M, new RegExp(`^Sam Staff signed off on ${rx(first)}$`));
  await waitText(M, "#mtrain", /Sam Staff: 1 of \d+ signed off/);
  await S.click("[data-tab=practice]");
  await S.waitForFunction(() => /^Signed off by a manager: 1 of \d+ Signatures$/.test(document.querySelector("#p-signed")?.textContent || ""));

  // Nobody signs themselves off, and staff can't sign anyone off.
  const mia = await M.evaluate(() => ({ uid: LIVE.uid, name: LIVE.me }));
  assert.equal(await attempt(M, (p) => LIVE.api.passDrink(p, "Negroni"), mia), "permission-denied");
  assert.equal(await attempt(S, (p) => LIVE.api.passDrink(p, "Negroni"), mia), "permission-denied");
  const cell = /[",]/.test(first) ? `"${first.replace(/"/g, '""')}"` : first;
  const { csv } = await download(M, "training");
  assert.match(csv, new RegExp(`^Person,Drink,Section,Signed off by,Date\\r\\nSam Staff,${rx(cell)},Black Tap Signatures,Mia Manager,\\d{4}-\\d\\d-\\d\\d$`));
  await M.click("[data-tr-undo]");
  await S.waitForFunction(() => /^Signed off by a manager: 0 of/.test(document.querySelector("#p-signed").textContent));
  assert.deepEqual([O.errs, M.errs, S.errs], [[], [], []]);
});

test("records written outside the app can't run code on a manager's phone", async () => {
  await resetEmulators();
  const { O, S } = await team(browser, site, [["S", "Sam Staff", "sam", "staff"]]);
  // A document id is free text to Firestore, so a login with a script could pick one that is HTML.
  const odd = encodeURIComponent('"><img src=x onerror="window.pwned=1">');
  const str = (s) => ({ stringValue: s }), now = { timestampValue: new Date().toISOString() };
  await adminWrite(`requests/${odd}`, { item: str("Limes"), note: str(""), done: { booleanValue: false }, uid: str("x"), name: str("Sam Staff"), at: now });
  // A plain id with a field called id that is HTML, and a concern whose photo count is HTML.
  await adminWrite("requests/plain", { id: str('"><img src=x onerror="window.pwned=5">'), item: str("Lemons"), note: str(""), done: { booleanValue: false }, uid: str("x"), name: str("Sam Staff"), at: now });
  await adminWrite("concerns/plain", { id: str('"><img src=x onerror="window.pwned=3">'), reason: str("hazard"), area: str("bar"), note: str("Ice bucket cracked"),
    to: str("all"), photos: str('<img src=x onerror="window.pwned=4">'), anon: { booleanValue: true }, status: str("open"), at: now });
  // Stock requests from before restocking still show to managers until they're cleared.
  await adminWrite("requests/blueroll0000000000000", { item: str("Blue roll"), note: str(""), done: { booleanValue: false }, uid: str("x"), name: str("Sam Staff"), at: now });
  // Tasks, events and restocks with HTML where text goes (only possible past the rules, which check every field).
  const day = str(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(Date.now() - 6 * 36e5)), html = (n) => str(`<img src=x onerror="window.pwned=${n}">`), int = (n) => ({ integerValue: String(n) }), nul = { nullValue: null };
  await adminWrite(`events/${odd}`, { kind: str("task"), day, list: str("close"), item: int(0), label: html(6), area: str("bar"), from: str("todo"), to: str("blocked"), who: nul, note: html(7), v: int(1), uid: str("x"), name: html(8), at: now });
  await adminWrite("events/plainevent", { kind: str("restock"), day, ref: str("plainrestock"), label: html(9), area: str("bar"), from: str("new"), to: str("asked"), who: nul, qty: int(1), unit: str("each"), dest: str("up"), note: html(10), v: int(1), uid: str("x"), name: html(11), at: now });
  await adminWrite("restock/plainrestock", { item: html(12), qty: int(1), unit: str("each"), dest: str("up"), detail: html(13), day, status: str("blocked"), who: html(14), whoUid: str("x"), moved: nul, got: nul, note: html(15), v: int(2),
    askedBy: html(16), askedUid: str("x"), askedAt: now, uid: str("x"), name: html(17), at: now });

  await O.evaluate(() => show("notices")); await O.click("[data-tpane=requests]");
  await waitText(O, "#requests", /Old stock requests[\s\S]*Blue roll/);
  await O.click("[data-tpane=managers]");
  await waitText(O, "#live", /Restock blocked/);
  await O.click("[data-msub=act]");
  await waitText(O, "#act", /asked for 1 <img/);
  await O.evaluate(() => { pane = "stock"; show("tally"); });
  await waitText(O, "#tally", /Restock blocked|Blocked/);
  await O.evaluate(() => show("notices"));
  await O.click("[data-tpane=board]");
  await waitText(O, "#concerns", /Ice bucket cracked/);
  await O.waitForTimeout(300);
  assert.equal(await O.evaluate(() => window.pwned), undefined);
  assert.equal(await O.evaluate(() => LIVE.requests.length), 2, "records with odd ids are ignored");
  assert.equal(await O.evaluate(() => LIVE.events.length), 1, "events with odd ids are ignored too");
  assert.equal(await O.evaluate(() => LIVE.requests.filter((x) => x.id === "plain").length), 1, "a field called id doesn't replace the id");
  assert.deepEqual([O.errs, S.errs], [[], []]);
});
