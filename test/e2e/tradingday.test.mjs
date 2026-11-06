// A pretend trading day, start to finish, on six phones at once: the owner, a manager, and staff on the bar, the floor
// and the kitchen, with a test team on tonight's rota. Every part of a night happens on the same day, the way it does
// in service, and each phone has to see what the others did. It also counts the documents each phone reads from
// Firebase, which is what the free plan limits (50,000 a day for the whole venue), and prints them.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, part, phone, MANAGER_PIN, STAFF_PIN } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });
const people = [["M", "Mia Manager", "mia", "manager"], ["B", "Ben Bar", "ben", "staff"], ["F", "Fay Floor", "fay", "staff"], ["K", "Kit Kitchen", "kit", "staff"]];
const QS = ["depts", "sales", "cash", "voids", "tips", "breaks", "incidents", "complaints", "food", "faults", "security", "ready"];
const reads = (p) => p.evaluate(() => LIVE.api.reads());
// Every write this phone made has reached the server.
const settled = (p) => p.waitForFunction(() => !document.querySelector("#net")?.textContent.match(/waiting|saving/i)
  && !Object.values(LIVE).some((v) => Array.isArray(v) && v.some((x) => x && x.pending)), null, { timeout: 30000 });
const forYou = (p) => p.evaluate(() => forYou().map((x) => x.text).join(" | "));
// One listener per kind of record, so a quiet phone has finished loading once nothing new arrives for a second.
async function quiet(p) {
  let last = -1;
  for (let i = 0; i < 20; i++) { const n = (await reads(p)).n; if (n === last) return n; last = n; await p.waitForTimeout(1000); }
  return last;
}

test("a pretend trading day: briefing, checklists, test team, 86, restock, issues, guests, refusals, reports, sales and the close, with every phone's reads counted", async (t) => {
  await resetEmulators();
  const ph = await team(browser, site, people);
  const { O, M, B, F, K } = ph;
  const all = Object.entries(ph);
  const day = await M.evaluate(() => shiftDay());
  const cold = {};
  for (const [k, p] of all) cold[k] = await quiet(p);

  // 4pm: the owner puts a practice team on tonight's rota, published, so it shows to everyone.
  await part(O, "team");
  await O.click("#test-box summary");
  for (const [k, n] of [["bar", "2"], ["floor", "3"], ["kitchen", "2"], ["manager", "1"]]) await O.fill(`#tt-n-${k}`, n);
  await O.click("#tt-fill");
  await O.waitForFunction(() => LIVE.tests.length === 8);
  await O.check("#tt-pub");
  await O.click("#tt-day");
  await B.waitForFunction(() => LIVE.shifts.filter((x) => x.pub && /^test-/.test(x.who)).length === 8, null, { timeout: 30000 });

  // 4.30: Mia posts the briefing; the bar reads it, and Mia sees who has.
  await M.evaluate(() => LIVE.api.saveBriefing({ covers: 180, bookings: "Party of 12 at 8pm", specials: "", allergies: "Table 4 nut allergy", sections: "", breaks: "", focus: "Upsell signatures", previous: "" }));
  await B.waitForFunction(() => LIVE.briefing?.v === 1);
  assert.match(await forYou(B), /briefing/i);
  await B.evaluate(() => LIVE.api.readBriefing());
  await M.waitForFunction((uid) => LIVE.briefReads.some((r) => r.uid === uid), await B.evaluate(() => LIVE.uid));

  // 5pm: opening checklists on every side, item by item, one doing it and the others watching.
  for (const [p, list] of [[B, "open"], [F, "fset"], [K, "kopen"]]) {
    const items = await p.evaluate((k) => shown(k), list);
    assert.ok(items.length > 3, `${list} has items`);
    for (const [i, label] of items) await p.evaluate(([k, i, l]) => LIVE.api.setTask(k, i, l, "done"), [list, i, label]);
    await M.waitForFunction(([k, n]) => Object.values(LIVE.tasks).filter((x) => x.list === k && x.status === "done").length === n, [list, items.length], { timeout: 30000 });
  }

  // 7pm: service. The floor gets busy, then slammed; the bar has a queue three times in an hour.
  await F.evaluate(() => LIVE.api.setStatus("floor", "busy", "Party of 12 seated"));
  await F.evaluate(() => LIVE.api.setStatus("floor", "slammed", "Walk-ins on top"));
  for (let i = 0; i < 3; i++) await B.evaluate(() => LIVE.api.addBlock("bar", "queue", ""));
  await M.waitForFunction(() => LIVE.status.some((s) => s.side === "floor" && s.level === "slammed") && LIVE.blocks.length === 3);
  assert.match(await forYou(M), /slammed/i);

  // Ben 86s a drink; the floor sees it straight away, and it comes back later.
  await B.evaluate(() => LIVE.api.set86("London Cosmo", "out"));
  await F.waitForFunction(() => LIVE.out.has("London Cosmo"));
  await K.waitForFunction(() => LIVE.out.has("London Cosmo"));

  // Limes from the cellar: asked, given to Ben, brought up, received on the floor.
  await B.evaluate(() => LIVE.api.askRestock({ item: "Limes", qty: 2, unit: "box", dest: "up", detail: "" }));
  await M.waitForFunction(() => LIVE.restock.some((r) => r.item === "Limes" && !r.pending));
  await M.evaluate(() => { const r = LIVE.restock.find((x) => x.item === "Limes"); const b = LIVE.staff.find((p) => p.username === "ben"); return LIVE.api.moveRestock(r, "given", { give: { name: b.name, uid: b.uid } }); });
  await B.waitForFunction(() => LIVE.restock.find((x) => x.item === "Limes")?.status === "given");
  await B.evaluate(() => LIVE.api.moveRestock(LIVE.restock.find((x) => x.item === "Limes"), "doing"));
  await B.waitForFunction(() => LIVE.restock.find((x) => x.item === "Limes")?.status === "doing" && !LIVE.restock.find((x) => x.item === "Limes").pending);
  await B.evaluate(() => LIVE.api.moveRestock(LIVE.restock.find((x) => x.item === "Limes"), "delivered", { moved: 2 }));
  await F.waitForFunction(() => LIVE.restock.find((x) => x.item === "Limes")?.status === "delivered");
  await F.evaluate(() => LIVE.api.moveRestock(LIVE.restock.find((x) => x.item === "Limes"), "received", { got: 2 }));
  await M.waitForFunction(() => LIVE.restock.find((x) => x.item === "Limes")?.status === "received");

  // The glass washer leaks: the kitchen raises it, Mia gives it to Ben, Ben fixes it.
  await K.evaluate(() => LIVE.api.raise({ title: "Glass washer leaking", detail: "Water under the bar", area: "bar", urgent: true }));
  await M.waitForFunction(() => LIVE.issues.some((x) => x.title === "Glass washer leaking" && !x.pending));
  await M.evaluate(() => { const x = LIVE.issues.find((i) => i.title === "Glass washer leaking"); const b = LIVE.staff.find((p) => p.username === "ben"); return LIVE.api.take(x.id, { name: b.name, uid: b.uid }); });
  await B.waitForFunction(() => LIVE.issues.find((i) => i.title === "Glass washer leaking")?.status === "taken");
  await B.evaluate(() => LIVE.api.fixed(LIVE.issues.find((i) => i.title === "Glass washer leaking").id, "Hose clip tightened"));
  await K.waitForFunction(() => LIVE.issues.find((i) => i.title === "Glass washer leaking")?.status === "fixed");

  // A slow main on table 7, escalated and closed by Mia; a refusal at the bar; Fay is running late tomorrow.
  await F.evaluate(() => LIVE.api.logGuest({ kind: "slow", table: "7", what: "Mains took 40 minutes", wants: "Nothing, just unhappy", done: "Apologised", comp: 0, escalate: true }));
  await M.waitForFunction(() => LIVE.guests.some((g) => g.table === "7" && !g.pending));
  assert.match(await forYou(M), /Guest needs a manager/);
  await M.evaluate(() => LIVE.api.closeGuest(LIVE.guests.find((g) => g.table === "7").id, "Desserts on us", 0, false));
  await F.waitForFunction(() => LIVE.guests.find((g) => g.table === "7")?.status !== "open");
  await B.evaluate(() => LIVE.api.refuse("noid", "Two pints", "Looked under 25, no ID"));
  await F.waitForFunction(() => LIVE.refusals.length === 1);
  await F.evaluate(() => LIVE.api.ask({ kind: "late", eta: "17:30", note: "Train strike" }));
  await M.waitForFunction(() => LIVE.asks.some((a) => a.kind === "late" && !a.pending));

  // 11pm: the drink is back, every side sends its report, Mia signs them off and puts in the night's figures.
  await B.evaluate(() => LIVE.api.set86("London Cosmo", null));
  await F.waitForFunction(() => !LIVE.out.has("London Cosmo"));
  for (const [p, side] of [[B, "bar"], [F, "floor"], [K, "kitchen"]]) await p.evaluate((s) => LIVE.api.sendReport(s, `${s} closed down clean`, `${s}: all good`), side);
  await M.waitForFunction(() => LIVE.reports.filter((r) => !r.pending).length === 3);
  for (const id of await M.evaluate(() => LIVE.reports.map((r) => r.id))) await M.evaluate((i) => LIVE.api.signOff(i), id);
  await M.evaluate((d) => LIVE.api.saveNight(d, { covers: 192, wet: 420000, dry: 515000, note: "" }), day);

  // Mia closes the night in the app, all yes; the owner accepts it.
  await part(M, "handover");
  await M.waitForSelector("#ho-go");
  for (const q of QS) await M.click(`[data-hoa="${q}"][data-v="yes"]`);
  await M.click("#ho-go");
  await M.waitForFunction(() => LIVE.handovers[0] && !LIVE.handovers[0].pending, null, { timeout: 30000 });
  await O.waitForFunction((d) => LIVE.handovers.some((h) => h.day === d), day);
  await O.evaluate((d) => LIVE.api.acceptHandover(d, ""), day);
  await M.waitForFunction(() => LIVE.handovers[0].ackBy === "Olly Owner");

  // Nothing is left waiting to send on any phone, and nothing went wrong on any of them.
  for (const [k, p] of all) { await settled(p); assert.deepEqual(p.errs, [], `page errors on ${k}`); }

  // Reads: each phone's first load, then the whole night on top.
  const night = {};
  for (const [k, p] of all) night[k] = await quiet(p);
  const by = await M.evaluate(() => LIVE.api.reads().by);
  t.diagnostic(`reads at first load: ${JSON.stringify(cold)}`);
  t.diagnostic(`reads after the night: ${JSON.stringify(night)}`);
  t.diagnostic(`manager's reads by listener: ${JSON.stringify(Object.entries(by).sort((a, b) => b[1] - a[1]))}`);
  for (const [k] of all) assert.ok(night[k] > cold[k], `${k} read tonight's changes`);
});

// A month in: what a phone reads when it opens with four weeks of history behind it, for the free plan's daily budget.
// History is written straight into the emulator (past the rules), shaped as the app writes it.
const FS = "http://127.0.0.1:8080/v1/projects/demo-bar-book/databases/(default)/documents";
const val = (v) => (v === null ? { nullValue: null } : typeof v === "string" ? { stringValue: v } : typeof v === "boolean" ? { booleanValue: v }
  : typeof v === "number" ? { integerValue: String(v) } : v instanceof Date ? { timestampValue: v.toISOString() } : Array.isArray(v) ? { arrayValue: { values: v.map(val) } }
  : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, val(x)])) } });
async function seed(docs) {
  for (let i = 0; i < docs.length; i += 400) {
    const writes = docs.slice(i, i + 400).map(([path, o]) => ({ update: { name: `projects/demo-bar-book/databases/(default)/documents/${path}`, fields: Object.fromEntries(Object.entries(o).map(([k, x]) => [k, val(x)])) } }));
    const r = await fetch(`${FS}:commit`, { method: "POST", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" }, body: JSON.stringify({ writes }) });
    if (!r.ok) throw new Error(await r.text());
  }
}
const rid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 20);
const dayAdd = (d, n) => new Date(Date.parse(d + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const monday = (d) => dayAdd(d, -((new Date(d + "T12:00:00Z").getUTCDay() + 6) % 7));

test("a month in: what each phone reads when it opens, and what a day at a 25-person venue comes to", async (t) => {
  await resetEmulators();
  const { M } = await team(browser, site, [["M", "Mia Manager", "mia", "manager"], ["S", "Sam Staff", "sam", "staff"]]);
  const today = await M.evaluate(() => shiftDay()), now = Date.now();
  const by = { uid: "seed", name: "Seeded Manager" }, ago = (d, h = 20) => new Date(now - d * 864e5 + (h - 20) * 36e5);
  const docs = [], sides = ["bar", "floor", "kitchen"];
  // 24 more people: 20 staff and 4 managers.
  const ppl = Array.from({ length: 24 }, (_, i) => ({ uid: rid(), name: `Person ${i + 1}`, role: i < 4 ? "manager" : "staff" }));
  for (const p of ppl) { docs.push([`staff/${p.uid}`, { name: p.name, username: `person${p.uid.slice(0, 6).toLowerCase()}`, role: p.role }], [`directory/${p.uid}`, { name: p.name, role: p.role }]); }
  // The rota: five weeks back to next week, 14 shifts a day, published.
  for (let d = -28; d < 14; d++) {
    const day = dayAdd(today, d);
    for (let i = 0; i < 14; i++) {
      const p = ppl[(i + d + 28) % ppl.length];
      docs.push([`shifts/${rid()}`, { week: monday(day), day, start: "17:00", end: "23:00", side: sides[i % 3], note: "", who: p.uid, whoName: p.name, offer: "", offerName: "", cover: "", wants: {}, pub: true, act: "published", v: 2, ...by, at: ago(Math.max(d, 0) + 7) }]);
    }
  }
  for (let d = 1; d <= 28; d++) {
    const day = dayAdd(today, -d);
    for (let i = 0; i < 12; i++) docs.push([`blocks/${rid()}`, { day, side: sides[i % 3], kind: "queue", note: "", ...by, at: ago(d) }]);
    for (let i = 0; i < 2; i++) docs.push([`refusals/${rid()}`, { day, reason: "noid", what: "Pints", note: "", ...by, at: ago(d) }]);
    for (const s of sides) docs.push([`reports/${rid()}`, { side: s, text: "All good", summary: "All good", photos: 0, ...by, at: ago(d, 23) }]);
    docs.push([`nights/${day}`, { day, covers: 180, wet: 400000, dry: 500000, note: "", ...by, at: ago(d) }]);
    docs.push([`handovers/${day}`, { day, answers: Object.fromEntries(QS.map((q) => [q, "yes"])), follow: {}, extra: {}, risks: 0, exceptions: 0, lines: "", snap: {}, note: "", owner: "", ...by, at: ago(d, 23) }]);
    for (let i = 0; i < 4; i++) { const o = rid(); docs.push([`outlog/${o}`, { item: "london-cosmo", itemName: "London Cosmo", action: "out", ...by, at: ago(d, 19) }], [`outlog/${o}-back`, { item: "london-cosmo", itemName: "London Cosmo", action: "back", ...by, at: ago(d, 22) }]); }
    for (let i = 0; i < 4; i++) docs.push([`guests/${rid()}`, { kind: "slow", table: String(i + 1), what: "Slow mains", wants: "", done: "Apologised", comp: 0, escalate: false, status: "closed", resolution: "Done", extra: 0, followUp: false, closedBy: by.name, closedByUid: by.uid, closedAt: ago(d), ...by, at: ago(d) }]);
    for (let i = 0; i < 4; i++) docs.push([`asks/${rid()}`, { kind: "late", eta: "17:30", note: "", status: "approved", by: by.name, byUid: by.uid, byAt: ago(d), ...by, at: ago(d) }]);
    for (let i = 0; i < 8; i++) docs.push([`reviews/${rid()}`, { report: rid(), verdict: "up", text: "", ...by, at: ago(d) }]);
    docs.push([`issues/${rid()}`, { title: "Light out", detail: "", area: "bar", urgent: false, again: null, status: "fixed", fix: "Changed", fixedBy: by.name, fixedByUid: by.uid, fixedAt: ago(d), ...by, at: ago(d) }]);
    for (let i = 0; i < 2; i++) docs.push([`incidents/${rid()}`, { kind: "Accident", text: "Slip", status: "closed", outcome: "First aid", closedBy: by.name, closedByUid: by.uid, closedAt: ago(d), ...by, at: ago(d) }]);
  }
  for (const p of ppl) for (let i = 0; i < 12; i++) docs.push([`training/${rid()}`, { trainee: p.uid, traineeName: p.name, drinkName: `Drink ${i}`, ...by, at: ago(i + 1) }]);
  for (const p of ppl) for (const kind of ["licence", "firstaid", "food"]) docs.push([`certs/${rid()}`, { who: p.uid, whoName: p.name, kind, label: "", done: dayAdd(today, -100), ends: dayAdd(today, 600), note: "", ...by, at: ago(30) }]);
  for (let i = 0; i < 40; i++) docs.push([`labels/${rid()}`, { item: `Item ${i}`, side: sides[i % 3], life: 3, on: true, state: "none", openedOn: null, useBy: null, openedBy: null, openedUid: null, act: "added", v: 1, ...by, at: ago(20) }]);
  for (let i = 0; i < 20; i++) docs.push([`calendar/${rid()}`, { title: `Event ${i}`, kind: "event", date1: dayAdd(today, i * 3), date2: dayAdd(today, i * 3), note: "", ...by, at: ago(10) }]);
  // Tonight so far, at 9pm: every checklist item done once, with its event.
  const lists = await M.evaluate(() => Object.fromEntries(["open", "fset", "fshake", "kopen"].map((k) => [k, shown(k)])));
  for (const [list, items] of Object.entries(lists)) for (const [item, label] of items) {
    docs.push([`shift/${today}/tasks/${list}-${item}`, { list, item, status: "done", who: null, whoUid: null, note: "", v: 1, ...by, at: ago(0, 18) }]);
    docs.push([`events/t-${today}-${list}-${item}-1`, { kind: "task", day: today, list, item, label, area: "bar", from: "todo", to: "done", who: null, note: "", v: 1, ...by, at: ago(0, 18) }]);
  }
  await seed(docs);
  t.diagnostic(`history seeded: ${docs.length} records`);

  // Fresh phones, nothing cached: the first time someone opens the app, or a reopen after 30 minutes away.
  const coldOf = async (username, pin, role) => {
    const p = await phone(browser, site);
    await p.evaluate((a) => LIVE.api.login(...a), [username, pin]);
    await p.waitForFunction((r) => LIVE.role === r, role);
    const n = await quiet(p);
    const top = Object.entries((await reads(p)).by).sort((a, b) => b[1] - a[1]).filter(([, n]) => n > 1);
    assert.deepEqual(p.errs, []);
    await p.context().close();
    return { n, top };
  };
  const mgr = await coldOf("mia", MANAGER_PIN, "manager"), staff = await coldOf("sam", STAFF_PIN, "staff");
  t.diagnostic(`manager opening the app: ${mgr.n} reads; biggest: ${JSON.stringify(mgr.top)}`);
  t.diagnostic(`staff opening the app: ${staff.n} reads; biggest: ${JSON.stringify(staff.top)}`);
  // A day: about 12 people on shift open it 3 times each and 3 managers 6 times, each open a fresh read (phones are away
  // for over 30 minutes between them). The night's own changes come on top: the first test puts those at about 200 a phone.
  const day = 12 * 3 * staff.n + 3 * 6 * mgr.n + 15 * 200;
  t.diagnostic(`a day at a 25-person venue: about ${day} reads of the free 50,000`);
  // A manager's new phone used to take everyone off the chat directory and put them back (52 writes, read by every phone).
  assert.ok((Object.fromEntries(mgr.top).directory || 0) <= 27, "the directory is read once, not wiped and rebuilt");
  assert.ok(mgr.n < 900, `a manager's phone reads ${mgr.n} on opening`);
  assert.ok(staff.n < 560, `a staff phone reads ${staff.n} on opening`);
  assert.ok(day < 38000, `a day comes to ${day}`);
});
