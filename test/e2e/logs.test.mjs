// Waste, safety checks, stock counts and training sign-off end to end: what staff log, what managers see, and what the
// downloaded spreadsheets hold.
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
const logs = async (p) => { await p.click("[data-tab=tally]"); await p.click(".ptabs [data-pane=logs]"); };
const due = (p) => p.$eval(".ptabs [data-pane=logs] small", (e) => e.textContent);
// Prepares a download, then reads the file the Save button would give.
async function download(p, id) {
  await p.click(`#${id}-csv`);
  await p.waitForSelector(`#${id}-save`);
  return p.evaluate(async (i) => { const a = document.querySelector(`#${i}-save`); return { name: a.download, csv: (await (await fetch(a.href)).text()).replace(/^\ufeff/, "") }; }, id);
}

test("waste: a quantity and a reason, taken back within 15 minutes, and weekly totals for managers", async () => {
  await resetEmulators();
  const { O, M, S } = await team(browser, site, people);
  await logs(S);
  await S.selectOption("#w-item", "Guinness");
  assert.equal(await S.$eval("#w-unit", (e) => e.value), "pint", "draught is measured in pints");
  await S.fill("#w-qty", "2"); await S.selectOption("#w-reason", "spilt"); await S.click("#w-go");
  await waitToast(S, /^Logged: 2 pints Guinness$/);
  await S.selectOption("#w-item", "Tanqueray");
  assert.equal(await S.$eval("#w-unit", (e) => e.value), "single", "spirits are measured in 25 ml");
  await S.selectOption("#w-reason", "remade"); await S.click("#w-go");
  await S.selectOption("#w-item", "Other (write it in)"); await S.fill("#w-other", "Highball glass"); await S.selectOption("#w-reason", "other"); await S.click("#w-go");
  assert.equal(await toastOf(S), "Say what happened in the note");
  await S.fill("#w-note", "Chipped in the washer"); await S.click("#w-go");
  await S.waitForFunction(() => LIVE.waste.length === 3 && !LIVE.waste.some((w) => w.pending));
  assert.match(await text(S, "#tally"), /You've logged tonight.*Highball glass.*1 × 25 ml Tanqueray.*2 pints Guinness/s);
  await S.click(`[data-w-undo="${await S.evaluate(() => LIVE.waste.find((w) => w.item === "Tanqueray").id)}"]`);
  await S.waitForFunction(() => LIVE.waste.length === 2);
  await M.evaluate(() => LIVE.api.waste({ item: "Limes", qty: 6, unit: "each", reason: "expired", note: "", side: "floor" }));

  // Managers: this week's totals by item, reason and person, and the whole log as a spreadsheet.
  await managers(O, "waste");
  await waitText(O, "#mwaste", /3 entries/);
  const page = await text(O, "#mwaste");
  for (const re of [/2 pints Guinness/, /1 × Highball glass/, /6 × Limes/, /Spilt or dropped: 1/, /Sam Staff: 2/, /Mia Manager: 1/, /bar 2, floor 1/]) assert.match(page, re);
  const { name, csv } = await download(O, "waste");
  assert.match(name, /^black-tap-waste-\d{4}-\d\d-\d\d\.csv$/);
  const lines = csv.split("\r\n");
  assert.equal(lines[0], "Night,Time,Side,Item,Quantity,Unit,Reason,Note,Logged by");
  assert.equal(lines.length, 4);
  assert.ok(lines.some((l) => /^\d{4}-\d\d-\d\d,\d\d:\d\d,Bar,Guinness,2,Pints,Spilt or dropped,,Sam Staff$/.test(l)), csv);
  assert.ok(lines.some((l) => /,Bar,Highball glass,1,Each,Other \(say what in the note\),Chipped in the washer,Sam Staff$/.test(l)), csv);
  await O.click('[data-wweek="1"]');
  assert.match(await text(O, "#mwaste"), /Nothing logged last week/);
  assert.equal(await S.evaluate(() => LIVE.waste.length), 2, "staff only get their own");
  assert.deepEqual([O.errs, M.errs, S.errs], [[], [], []]);
});

test("safety checks: managers set up the equipment, staff log temperatures and line cleans, out of range stands out", async () => {
  await resetEmulators();
  const { O, M, S, T } = await team(browser, site, [...people, ["T", "Tia Staff", "tia", "staff"]]);
  await T.evaluate(() => setMode("floor"));
  await managers(O, "safety");
  await O.click("#msafety details > summary");
  for (const [name, kind, side] of [["Back bar fridge", "fridge", "bar"], ["Cellar", "cellar", "bar"], ["Upstairs lines", "lines", "bar"], ["Shake freezer", "freezer", "floor"]]) {
    await O.fill("#k-name", name); await O.selectOption("#k-kind", kind); await O.click(`[data-kit-side="${side}"]`); await O.click("#k-go");
    await O.waitForFunction((n) => LIVE.kit.some((k) => k.name === n && !k.pending), name);
  }
  assert.equal(await attempt(S, () => LIVE.api.addKit("Fake fridge", "fridge", "bar")), "permission-denied");

  // Each phone shows its own side's equipment and what's still to do tonight.
  await logs(S); await S.waitForFunction(() => LIVE.kit.length === 4);
  assert.equal(await due(S), "3 due");
  assert.doesNotMatch(await text(S, "#tally"), /Shake freezer/);
  await logs(T); await T.waitForFunction(() => LIVE.kit.length === 4);
  assert.equal(await due(T), "1 due");
  const id = (n) => S.evaluate((x) => LIVE.kit.find((k) => k.name === x).id, n);
  const [fridge, cellar, lines] = [await id("Back bar fridge"), await id("Cellar"), await id("Upstairs lines")];
  await S.fill(`[data-tc="${fridge}"]`, "9"); await S.click(`[data-temp="${fridge}"]`);
  await waitToast(S, /^Back bar fridge: 9°C logged\. Over 8°C, the legal limit for chilled food\. Tell a manager$/);
  await S.fill(`[data-tc="${cellar}"]`, "12"); await S.click(`[data-temp="${cellar}"]`);
  await S.fill(`[data-ln="${lines}"]`, "All six lines"); await S.click(`[data-clean="${lines}"]`);
  await S.waitForFunction(() => LIVE.safety.length === 3 && !LIVE.safety.some((r) => r.pending));
  assert.equal(await due(S), "", "nothing due once each one is logged");
  const nextClean = await S.evaluate(() => dayName(addDays(shiftDay(), 7)));
  assert.match(await text(S, "#tally"), new RegExp(`Upstairs lines Next due ${rx(nextClean)}`));

  // Managers see tonight at a glance, with the out-of-range reading flagged, and the record as a spreadsheet.
  await O.waitForFunction(() => /1 out of range/.test(document.querySelector("#msub").textContent));
  const page = await text(O, "#msafety");
  assert.match(page, /Back bar fridge Bar.*9°C Sam Staff · \d\d:\d\d · Over 8°C, the legal limit for chilled food/s);
  assert.match(page, /Shake freezer Floor No reading yet/);
  assert.match(await O.$eval("#dash", (e) => e.innerText.replace(/\n+/g, " ")), /1 readings out of range tonight/);
  const { csv } = await download(O, "safety");
  assert.equal(csv.split("\r\n")[0], "Night,Time,Side,Equipment,Type,Reading (°C),Result,Note,By");
  assert.match(csv, /,Bar,Back bar fridge,Fridge,9,"Over 8°C, the legal limit for chilled food. Tell a manager",,Sam Staff/);
  assert.match(csv, /,Bar,Cellar,Cellar,12,In range,,Sam Staff/);
  assert.match(csv, /,Bar,Upstairs lines,Beer lines,,Cleaned,All six lines,Sam Staff/);
  assert.deepEqual([O.errs, M.errs, S.errs, T.errs], [[], [], [], []]);
});

test("stock: par levels, a count, and the order list", async () => {
  await resetEmulators();
  const { O, S } = await team(browser, site, people);
  await managers(O, "stock");
  await O.waitForSelector('#mstock details[data-keep="pars"]');
  assert.equal(await O.$eval("#outlog", (e) => e.hidden), false, "the 86 log sits under Stock");
  await O.click('#mstock details[data-keep="pars"] > summary');
  await O.click('details[data-keep="par-Gin"] > summary');
  await O.fill('[data-par="Tanqueray"]', "6"); await O.$eval('[data-par="Tanqueray"]', (e) => e.blur());
  await O.evaluate(() => LIVE.api.setPar("Limes", 40));
  await O.waitForFunction(() => LIVE.pars.Tanqueray === 6 && LIVE.pars.Limes === 40 && document.querySelector('[data-cnt="Limes"]'));
  await O.click('#mstock details[data-keep="count"] > summary');
  await O.fill('[data-cnt="Tanqueray"]', "2"); await O.fill('[data-cnt="Limes"]', "45");
  await O.click("#cnt-go");
  await waitToast(O, /^Count saved: 2 items$/);
  await waitText(O, "#mstock", /1 item below par/);
  assert.match(await text(O, "#mstock"), /Tanqueray · order 4/);
  const order = await download(O, "order");
  assert.match(order.name, /^black-tap-order-list-/);
  assert.equal(order.csv, "Item,Group,Par,Counted,To order\r\nTanqueray,Gin,6,2,4");
  assert.equal(await attempt(S, () => LIVE.api.setPar("Tanqueray", 1)), "permission-denied");
  assert.equal(await attempt(S, () => LIVE.api.saveCount([{ item: "Tanqueray", group: "Gin", par: 6, n: 9 }], "")), "permission-denied");
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
  await adminWrite(`kit/${odd}`, { name: str("Back bar fridge"), kind: str("fridge"), side: str("bar") });
  // Count lines aren't checked one by one by the rules, so the page has to treat every value as text.
  const line = { mapValue: { fields: { item: str("Tanqueray"), group: str("Gin"), par: str("<z"), n: str('<img src=x onerror="window.pwned=2">') } } };
  await adminWrite("counts/a", { lines: { arrayValue: { values: [line] } }, note: str(""), uid: str("x"), name: str("Mia Manager"), at: now });
  // A plain id with a field called id that is HTML, and a concern whose photo count is HTML.
  await adminWrite("requests/plain", { id: str('"><img src=x onerror="window.pwned=5">'), item: str("Lemons"), note: str(""), done: { booleanValue: false }, uid: str("x"), name: str("Sam Staff"), at: now });
  await adminWrite("concerns/plain", { id: str('"><img src=x onerror="window.pwned=3">'), reason: str("hazard"), area: str("bar"), note: str("Ice bucket cracked"),
    to: str("all"), photos: str('<img src=x onerror="window.pwned=4">'), anon: { booleanValue: true }, status: str("open"), at: now });
  await S.evaluate(() => LIVE.api.request("Blue roll", ""));

  await managers(O, "stock");
  await waitText(O, "#mstock", /From the count on/);
  await O.click("[data-tpane=requests]");
  await waitText(O, "#requests", /Blue roll/);
  await O.click("[data-tpane=board]");
  await waitText(O, "#concerns", /Ice bucket cracked/);
  await O.click("[data-tpane=managers]"); await O.click("[data-msub=safety]");
  await O.waitForTimeout(300);
  assert.equal(await O.evaluate(() => window.pwned), undefined);
  assert.deepEqual(await O.evaluate(() => [LIVE.requests.length, LIVE.kit.length]), [2, 0], "records with odd ids are ignored");
  assert.equal(await O.evaluate(() => LIVE.requests.filter((x) => x.id === "plain").length), 1, "a field called id doesn't replace the id");
  assert.deepEqual([O.errs, S.errs], [[], []]);
});
