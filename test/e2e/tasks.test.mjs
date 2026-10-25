// Tonight's tasks, lists and restocking end to end, on several phones at once: live statuses with who, when and why,
// corrections kept on the record, finishing and reopening a list, offline and clashing changes, the restocking board,
// and for managers Live, Activity's filters and History, the closing KPIs, the downloads, WhatsApp and email, a reload,
// and the layout on a phone and a desktop in light and dark.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, toastOf, attempt, adminWrite, ukDay } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });
const crew = [["M", "Mia Manager", "mia", "manager"], ["S", "Sam Staff", "sam", "staff"], ["T", "Tia Staff", "tia", "staff"]];
// SHOTS=folder saves a screenshot of each page in the layout check.
const SHOTS = process.env.SHOTS;

const flat = (s) => s.replace(/\s+/g, " ").trim();
const rx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const csv = (v) => (/[",\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const hm = (t) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const minsAgo = (m) => new Date(Date.now() - m * 6e4);
const row = (p, k, i) => p.$eval(`[data-list=${k}][data-i="${i}"]`, (e) => e.innerText.replace(/\s+/g, " ").trim());
const settled = (p, id, status) => p.waitForFunction(([id, s]) => LIVE.tasks[id]?.status === s && !LIVE.tasks[id].pending, [id, status]);
const waitToast = (p, re) => p.waitForFunction((s) => new RegExp(s).test(document.querySelector("#toast").textContent), re.source);
const shift = async (p, pane) => { await p.click("[data-tab=tally]"); await p.click(`.ptabs [data-pane=${pane}]`); };
const managers = async (p, sub) => { await p.evaluate(() => show("notices")); await p.click("[data-tpane=managers]"); await p.click(`#msub [data-msub=${sub}]`); };
// An item's ⋯ options stay open while the list changes, so this only opens them if they're closed.
const opts = async (p, id) => { if ((await p.getAttribute(`[data-more="${id}"]`, "aria-expanded")) !== "true") await p.click(`[data-more="${id}"]`); };
const pick = async (p, id, to) => { await opts(p, id); await p.click(`[data-task="${id}"][data-to="${to}"]`); };
// The rows under one heading on Live or the KPIs.
const section = (p, box, title) => p.$eval(box, (b, t) => {
  const out = []; let on = false;
  for (const el of b.children) { if (el.classList.contains("h3")) on = el.textContent === t; else if (on && el.classList.contains("staffrow")) out.push(el.innerText.replace(/\s+/g, " ").trim()); }
  return out;
}, title);
// Records written straight into the emulator, as the app would have written them: an earlier night, or something
// that has been waiting a while.
const val = (v) => (v === null ? { nullValue: null } : v instanceof Date ? { timestampValue: v.toISOString() } : typeof v === "boolean" ? { booleanValue: v }
  : Number.isInteger(v) ? { integerValue: String(v) } : typeof v === "number" ? { doubleValue: v } : { stringValue: v });
async function seed(path, o) {
  const r = await adminWrite(path, Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)])));
  assert.ok(r.ok, await r.text());
}
// Prepares a download, then reads the file its Save button would give.
async function download(p, id) {
  await p.click(`#${id}-csv`);
  await p.waitForSelector(`#${id}-save`);
  return p.evaluate(async (id) => {
    const a = document.querySelector(`#${id}-save`);
    return { name: a.download, lines: (await (await fetch(a.href)).text()).replace(/^\ufeff/, "").split("\r\n") };
  }, id);
}
// The address a WhatsApp or Email button opens, filled in as it's tapped. Opening it is stopped.
async function shared(p, box, via) {
  await p.evaluate(() => { if (!window.noOpen) { window.noOpen = true; addEventListener("click", (e) => { if (e.target.closest("a[data-share]")) e.preventDefault(); }, true); } });
  const a = `${box} [data-share][data-via=${via}]`;
  await p.click(a);
  const u = new URL(await p.getAttribute(a, "href"));
  return via === "wa" ? { host: u.host, text: u.searchParams.get("text") } : { scheme: u.protocol, subject: u.searchParams.get("subject"), body: u.searchParams.get("body") };
}

test("tasks change on every phone as they happen, with who, when and why, and corrections stay on the record", async () => {
  await resetEmulators();
  const { O, M, S, T } = await team(browser, site, crew);
  for (const p of [M, S, T]) await shift(p, "close");

  // Tapping an item marks it done. Every phone shows who and when, and the first change starts the list.
  await S.click('[data-list=close][data-i="0"]');
  await settled(T, "close-0", "done");
  assert.match(await row(T, "close", 0), /Done By Sam Staff, \d\d:\d\d$/);
  await T.waitForFunction(() => LIVE.runs.close?.status === "started" && !LIVE.runs.close.pending);
  assert.match(flat(await T.$eval(".run", (e) => e.innerText)), /^In progress Started by Sam Staff, \d\d:\d\d Finish shows once every item is done\.$/);

  // Started, then blocked with a reason: everyone on the bar and the managers are told.
  await pick(S, "close-3", "doing");
  await settled(T, "close-3", "doing");
  assert.match(await row(T, "close", 3), /In progress Started by Sam Staff, \d\d:\d\d$/);
  S.answer = "No hot water";
  await pick(S, "close-3", "blocked");
  const l3 = await T.evaluate(() => itemText("close", 3));
  await waitToast(T, new RegExp(`^Blocked: ${rx(l3)}: No hot water$`));
  await waitToast(M, new RegExp(`^Blocked: ${rx(l3)}: No hot water$`));
  await settled(M, "close-3", "blocked");
  assert.match(await row(M, "close", 3), /Blocked By Sam Staff, \d\d:\d\d: No hot water$/);

  // Staff can't block without saying why, or mark an item not needed, and the rules refuse both too.
  S.answer = "";
  await pick(S, "close-2", "blocked");
  assert.equal(await S.evaluate(() => LIVE.tasks["close-2"]), undefined, "no reason, no change");
  assert.equal(await S.locator('[data-task="close-2"][data-to="cancelled"]').count(), 0);
  assert.equal(await attempt(S, () => LIVE.api.setTask("close", 2, "Bins", "blocked", { note: "" })), "permission-denied");
  assert.equal(await attempt(S, () => LIVE.api.setTask("close", 2, "Bins", "cancelled", { note: "Quiet night" })), "permission-denied");

  // Anyone can unblock it.
  await pick(T, "close-3", "todo");
  await settled(S, "close-3", "todo");

  // A done item goes back only by whoever did it, or a manager. A mis-tap goes straight back...
  await T.click('[data-list=close][data-i="0"]');
  assert.equal(await toastOf(T), "Done by Sam Staff. Only they or a manager can take it back");
  assert.equal(await attempt(T, () => LIVE.api.setTask("close", 0, "x", "todo", { note: "Not done" })), "permission-denied");
  let asked = 0;
  S.on("dialog", () => asked++);
  await S.click('[data-list=close][data-i="0"]');
  await settled(T, "close-0", "todo");
  assert.equal(await row(T, "close", 0), await T.evaluate(() => itemText("close", 0)));
  assert.equal(asked, 0, "no reason needed straight after");

  // ...but one done a while ago needs a reason, which goes on the record.
  const day = await S.evaluate(() => shiftDay()), sam = await S.evaluate(() => LIVE.uid), l6 = await S.evaluate(() => itemText("close", 6)), t10 = minsAgo(10);
  await seed(`events/t-${day}-close-6-1`, { kind: "task", day, list: "close", item: 6, label: l6, area: "bar", from: "todo", to: "done", who: null, note: "", v: 1, uid: sam, name: "Sam Staff", at: t10 });
  await seed(`shift/${day}/tasks/close-6`, { list: "close", item: 6, status: "done", who: null, whoUid: null, note: "", v: 1, uid: sam, name: "Sam Staff", at: t10 });
  await settled(S, "close-6", "done");
  S.answer = "";
  await S.click('[data-list=close][data-i="6"]');
  assert.equal(await S.evaluate(() => LIVE.tasks["close-6"].status), "done", "no reason, no change");
  assert.equal(asked, 1);
  S.answer = "Ticked the wrong one";
  await S.click('[data-list=close][data-i="6"]');
  await settled(M, "close-6", "todo");
  assert.match(await row(M, "close", 6), /^.+ Reopened by Sam Staff, \d\d:\d\d: Ticked the wrong one$/);

  // A manager takes back someone else's, with a reason, and they're told.
  await T.click('[data-list=close][data-i="1"]');
  await settled(M, "close-1", "done");
  M.answer = "Bar top still sticky";
  await M.click('[data-list=close][data-i="1"]');
  await waitToast(T, /^Mia Manager took back your item: .+: Bar top still sticky$/);
  await settled(T, "close-1", "todo");
  assert.match(await row(T, "close", 1), /Reopened by Mia Manager, \d\d:\d\d: Bar top still sticky$/);

  // Managers give an item to someone, who's told, and everyone sees who it's for.
  const tia = await T.evaluate(() => LIVE.uid);
  await opts(M, "close-4");
  await M.selectOption('[data-give-task="close-4"]', tia);
  await waitToast(T, /^Mia Manager gave you: /);
  await S.waitForFunction(() => LIVE.tasks["close-4"]?.who === "Tia Staff" && !LIVE.tasks["close-4"].pending);
  assert.match(await row(S, "close", 4), /For Tia Staff$/);
  assert.equal(await S.locator("[data-give-task]").count(), 0, "only managers give tasks out");
  assert.equal(await attempt(S, (who) => LIVE.api.setTask("close", 5, "x", null, { give: who }), { name: "Sam Staff", uid: sam }), "permission-denied");

  // Every change is kept, oldest first, with who and why.
  await opts(T, "close-3");
  assert.deepEqual(await T.$$eval(".tmore .hist .s", (xs) => xs.map((e) => e.textContent.replace(/^\d\d:\d\d · /, ""))),
    ["Sam Staff: Not started → In progress", "Sam Staff: In progress → Blocked (No hot water)", "Tia Staff: Blocked → Not started"]);
  assert.deepEqual(await M.evaluate(() => LIVE.events.filter((e) => e.kind === "task" && e.item === 4).map((e) => [e.from, e.to, e.who, e.v, e.name])), [["todo", "todo", "Tia Staff", 1, "Mia Manager"]]);
  assert.deepEqual([O.errs, M.errs, S.errs, T.errs], [[], [], [], []]);
});

test("a list finishes once everything's done; finishing early takes a manager and a reason, and a finished list is locked until it's reopened", async () => {
  await resetEmulators();
  const { O, M, S } = await team(browser, site, crew.slice(0, 2));
  for (const p of [M, S]) { await p.evaluate(() => setMode("floor")); await shift(p, "fset"); }
  const l0 = await S.evaluate(() => itemText("fset", 0));

  // Not needed tonight is a manager's call, with a reason. It doesn't count towards what's required.
  M.answer = "Terrace closed";
  await pick(M, "fset-0", "cancelled");
  await settled(S, "fset-0", "cancelled");
  assert.match(await row(S, "fset", 0), /Not needed tonight By Mia Manager, \d\d:\d\d: Terrace closed$/);
  assert.deepEqual(await S.$$eval(".prog-head > *", (xs) => xs.map((e) => e.textContent)), ["0 of 4 done · 1 not needed tonight", "0%"]);
  await S.click('[data-list=fset][data-i="0"]');
  assert.equal(await toastOf(S), "Not needed tonight. A manager can bring it back");

  // Three of the four done: staff can't finish it yet, and the rules won't let a list finish short without a manager.
  for (const i of [1, 2, 3]) await S.click(`[data-list=fset][data-i="${i}"]`);
  await M.waitForFunction(() => [1, 2, 3].every((i) => LIVE.tasks[`fset-${i}`]?.status === "done" && !LIVE.tasks[`fset-${i}`].pending));
  assert.equal(await S.locator('[data-run="fset"][data-to="finished"]').count(), 0);
  assert.match(await S.$eval(".run", (e) => e.innerText), /Finish shows once every item is done/);
  assert.equal(await attempt(S, () => LIVE.api.setRun("fset", "Tables and cutlery", "finished", 3, 4, "Done enough")), "permission-denied");

  // A manager can finish it anyway, saying why. The floor is told, and the list locks.
  M.answer = "Short staffed, last table done tomorrow";
  await M.click('[data-run="fset"][data-to="override"]');
  await waitToast(S, /^Tables and cutlery finished by Mia Manager, with 1 not done$/);
  await S.waitForFunction(() => LIVE.runs.fset?.status === "finished" && !LIVE.runs.fset.pending);
  assert.match(flat(await S.$eval(".run", (e) => e.innerText)),
    /^Finished Started by Mia Manager, \d\d:\d\d\. Finished by Mia Manager, \d\d:\d\d, with 1 of 4 not done\. Reason: Short staffed, last table done tomorrow$/);
  await S.click('[data-list=fset][data-i="4"]');
  assert.equal(await toastOf(S), "Tables and cutlery is finished. A manager can reopen it");
  assert.equal(await attempt(S, () => LIVE.api.setTask("fset", 4, "x", "done")), "permission-denied");
  assert.equal(await attempt(S, () => LIVE.api.setRun("fset", "Tables and cutlery", "started", 3, 4, "Missed one")), "permission-denied");

  // Reopening takes a manager and a reason. Then the last item can be done, and anyone can finish it.
  M.answer = "Last table needs laying";
  await M.click('[data-run="fset"][data-to="reopen"]');
  await waitToast(S, /^Tables and cutlery reopened by Mia Manager$/);
  await S.waitForFunction(() => LIVE.runs.fset?.status === "started" && !LIVE.runs.fset.pending);
  await S.click('[data-list=fset][data-i="4"]');
  await S.click('[data-run="fset"][data-to="finished"]');
  await M.waitForFunction(() => LIVE.runs.fset?.status === "finished" && LIVE.runs.fset.done === 4 && LIVE.runs.fset.required === 4 && !LIVE.runs.fset.pending);

  // Managers see the exceptions on Live and in the KPIs, and they stay listed once dealt with.
  await managers(M, "live");
  const exc = await section(M, "#live", "Exceptions tonight");
  assert.equal(exc.length, 3);
  assert.match(exc[0], /^Reopened Tables and cutlery Last table needs laying · Mia Manager, \d\d:\d\d · Open the list$/);
  assert.match(exc[1], /^Finished with 1 of 4 not done Tables and cutlery Short staffed, last table done tomorrow · Mia Manager, \d\d:\d\d · Open the list$/);
  assert.match(exc[2], new RegExp(`^Not needed tonight ${rx(l0)} \\(Tables and cutlery\\) Terrace closed · Mia Manager, \\d\\d:\\d\\d · Open the list$`));
  const lists = await section(M, "#live", "Opening and closing");
  assert.match(lists[2], /^Tables and cutlery Finished Floor 4 of 4 done · 1 not needed tonight · Started by Mia Manager, \d\d:\d\d\. Finished by Sam Staff, \d\d:\d\d$/);
  await M.click("#msub [data-msub=kpis]");
  await M.waitForFunction(() => document.querySelector("#kpis p.txt"));
  assert.match(await M.$eval("#kpis p.txt", (e) => e.textContent), /^Tables and cutlery: started on 1 night and finished on 1, at \d\d:\d\d on average, taking \d+ min\.$/);
  assert.deepEqual((await section(M, "#kpis", "Night by night")).map((s) => s.replace(/^\w{3} \d{1,2} \w{3} · /, "")),
    [await M.evaluate(() => { const s = Math.min(...LIVE.events.map((e) => ms(e.at))), f = ms(LIVE.runs.fset.at); return `Tables and cutlery ${hhmm(new Date(s))} to ${hhmm(new Date(f))} (${dur(f - s)}), 4 of 4 done · 1 not needed · reopened once`; })]);
  assert.deepEqual([O.errs, M.errs, S.errs], [[], [], []]);
});

test("offline, a change waits on the phone and is sent once; one made from an old copy is refused instead of saved over a newer one", async () => {
  await resetEmulators();
  const { O, S, T } = await team(browser, site, crew.slice(1));
  for (const p of [S, T]) await shift(p, "close");
  const net = () => S.$eval("#net", (e) => (e.hidden ? "" : e.textContent));

  await S.context().setOffline(true);
  await S.waitForFunction(() => !navigator.onLine && !document.querySelector("#net").hidden);
  assert.equal(await net(), "No signal. Showing what this phone last saw");
  await S.click('[data-list=close][data-i="4"]');
  await S.waitForFunction(() => LIVE.tasks["close-4"]?.pending);
  assert.match(await row(S, "close", 4), /Done By Sam Staff, sending…$/);
  assert.equal(await net(), "No signal. 1 change saved on this phone, sending when you're back online");
  await T.waitForTimeout(1000);
  assert.equal(await T.evaluate(() => LIVE.tasks["close-4"]), undefined, "not sent yet");

  // Back online it's sent: one change, one event, and the list started once.
  await S.context().setOffline(false);
  await settled(T, "close-4", "done");
  await S.waitForFunction(() => document.querySelector("#net").hidden && !LIVE.tasks["close-4"].pending);
  assert.match(await row(S, "close", 4), /Done By Sam Staff, \d\d:\d\d$/);
  await T.waitForFunction(() => LIVE.events.length === 2 && LIVE.events.every((e) => !e.pending));
  const day = await T.evaluate(() => shiftDay());
  assert.deepEqual(await T.evaluate(() => LIVE.events.map((e) => e.id).sort()), [`r-${day}-close-1`, `t-${day}-close-4-1`]);
  assert.deepEqual(await T.evaluate(() => [LIVE.runs.close.status, LIVE.runs.close.v, LIVE.tasks["close-4"].v]), ["started", 1, 1]);

  // Two phones change the same item. The one working from an old copy is refused and told; the newer change stands.
  await S.context().setOffline(true);
  await S.waitForFunction(() => !navigator.onLine);
  await S.click('[data-list=close][data-i="5"]');
  await pick(T, "close-5", "doing");
  await settled(T, "close-5", "doing");
  await S.context().setOffline(false);
  await waitToast(S, /^Not saved\. Someone may have just changed it$/);
  await S.waitForFunction(() => LIVE.tasks["close-5"]?.status === "doing" && !LIVE.tasks["close-5"].pending);
  assert.match(await row(S, "close", 5), /In progress Started by Tia Staff, \d\d:\d\d$/);
  await S.waitForFunction(() => LIVE.events.length === 3 && LIVE.events.every((e) => !e.pending));
  assert.deepEqual(await S.evaluate(() => LIVE.events.filter((e) => e.item === 5).map((e) => [e.name, e.from, e.to, e.v])), [["Tia Staff", "todo", "doing", 1]]);
  assert.deepEqual([O.errs, S.errs, T.errs], [[], [], []]);
});

test("restocking: asked for, given to someone, brought up and confirmed, each step its own record, and late ones stand out", async () => {
  await resetEmulators();
  const { O, M, S, T } = await team(browser, site, crew);
  for (const p of [M, S, T]) await shift(p, "stock");
  const tia = await T.evaluate(() => LIVE.uid);
  const card = (p, id) => p.$eval(`[data-rs-card="${id}"]`, (e) => e.innerText.replace(/\s+/g, " ").trim());
  const ready = (p, st) => p.waitForFunction((st) => LIVE.restock[0]?.status === st && !LIVE.restock[0].pending, st);

  // Asked for: what, how many, where it's going and why. The team is told.
  await S.selectOption("#rs-item", "Limes"); await S.fill("#rs-qty", "2"); await S.selectOption("#rs-unit", "bag"); await S.fill("#rs-detail", "For the weekend");
  await S.click("#rs-go");
  await waitToast(S, /^Asked\. The team can see it now$/);
  await ready(T, "asked");
  await waitToast(T, /^Sam Staff asked for 2 bags of Limes for the upstairs bar$/);
  const id = await T.evaluate(() => LIVE.restock[0].id);
  assert.match(await card(T, id), /^Limes · 2 bags for the upstairs bar Waiting Asked by Sam Staff, \d\d:\d\d · For the weekend I'll get it Not in the cellar$/);

  // A manager gives it to someone, who's told. Only they, or a manager, can take it on now.
  await M.selectOption(`[data-give-rs="${id}"]`, tia);
  await waitToast(T, /^Mia Manager gave you the restock: Limes$/);
  await ready(S, "given");
  assert.match(await card(S, id), /Given to someone Asked by Sam Staff, \d\d:\d\d · For the weekend Given to Tia Staff \(Mia Manager, \d\d:\d\d\) Not in the cellar Cancel$/);
  assert.equal(await S.locator(`[data-rs="${id}"][data-to="doing"]`).count(), 0);
  assert.equal(await attempt(S, (id) => LIVE.api.moveRestock(LIVE.restock.find((r) => r.id === id), "doing"), id), "permission-denied");
  await T.click(`[data-rs="${id}"][data-to="doing"]`);
  await waitToast(T, /^It's yours\. Tap Brought it up when it's there$/);
  await ready(S, "doing");
  assert.match(await card(S, id), /Being brought up Asked by Sam Staff, \d\d:\d\d · For the weekend Tia Staff is bringing it up \(Tia Staff, \d\d:\d\d\)/);

  // Brought up, saying how many, and whoever is there confirms how many arrived. The three amounts are kept apart.
  T.answer = "2";
  await T.click(`[data-rs="${id}"][data-to="delivered"]`);
  await waitToast(S, /^Tia Staff brought up 2 bags of Limes\. Tap Got it to confirm$/);
  S.answer = "1";
  await S.click(`[data-rs="${id}"][data-to="received"]`);
  await waitToast(T, /^Sam Staff confirmed 1 bag of Limes arrived$/);
  await ready(T, "received");
  assert.deepEqual(await T.evaluate(() => { const r = LIVE.restock[0]; return [r.item, r.qty, r.unit, r.dest, r.detail, r.askedBy, r.who, r.moved, r.got, r.name, r.v]; }),
    ["Limes", 2, "bag", "up", "For the weekend", "Sam Staff", "Tia Staff", 2, 1, "Sam Staff", 5]);
  assert.deepEqual(await T.evaluate(() => LIVE.events.filter((e) => e.kind === "restock").sort((a, b) => a.v - b.v).map((e) => [e.from, e.to, e.who, e.qty, e.name])), [
    ["new", "asked", null, 2, "Sam Staff"], ["asked", "given", "Tia Staff", null, "Mia Manager"], ["given", "doing", "Tia Staff", null, "Tia Staff"],
    ["doing", "delivered", "Tia Staff", 2, "Tia Staff"], ["delivered", "received", "Tia Staff", 1, "Sam Staff"]]);
  await S.waitForFunction(() => document.querySelector("#tally details.setup"));
  assert.match(flat(await S.$eval("#tally details.setup", (e) => e.textContent)), /^Done tonight \(1\).*1 bag arrived, confirmed by Sam Staff, \d\d:\d\d \(2 bags brought up by Tia Staff\)$/);
  assert.equal(await attempt(S, (id) => LIVE.api.moveRestock(LIVE.restock.find((r) => r.id === id), "received", { got: 2 }), id), "permission-denied", "confirmed once");

  // One left waiting too long stands out on the board, on Tonight and on Live.
  const sam = await S.evaluate(() => LIVE.uid), day = await S.evaluate(() => shiftDay()), t25 = minsAgo(25);
  await seed("restock/late1", { item: "Coke", qty: 1, unit: "case", dest: "down", detail: "", day, status: "asked", who: null, whoUid: null, moved: null, got: null, note: "",
    v: 1, askedBy: "Sam Staff", askedUid: sam, askedAt: t25, uid: sam, name: "Sam Staff", at: t25 });
  await M.waitForSelector('[data-rs-card="late1"]');
  assert.deepEqual(await M.$$eval('[data-rs-card="late1"] .pill', (xs) => xs.map((e) => e.textContent.replace(/2[56] min/, "25 min"))), ["Waiting", "Waiting 25 min"]);
  await M.evaluate(() => show("notices"));
  assert.equal(flat(await M.$eval('#dash [data-go="stock"].hot', (e) => e.innerText)), "1 restock open, 1 waiting");
  await managers(M, "live");
  assert.deepEqual((await section(M, "#live", "Needs you now")).map((s) => s.replace(/2[56] min/, "25 min")), ["Waiting 25 min 1 case of Coke for the downstairs bar Asked by Sam Staff · Restock board"]);
  assert.match(await M.$eval("#live", (e) => e.textContent), /Tonight: 1 asked for, 1 brought up, 1 confirmed arrived\./);
  assert.deepEqual([O.errs, M.errs, S.errs, T.errs], [[], [], [], []]);
});

test("managers follow the night live, filter its history, read and download the closing KPIs, share them, and a reload loses nothing", async () => {
  await resetEmulators();
  const { O, M, S, T } = await team(browser, site, crew);
  const person = async (p) => ({ uid: await p.evaluate(() => LIVE.uid), name: await p.evaluate(() => LIVE.me) });
  const mia = await person(M), sam = await person(S), tia = await person(T);
  const L = await S.evaluate(() => Object.fromEntries([0, 1, 2, 3, 5].map((i) => [i, itemText("close", i)])));
  const y = await S.evaluate(() => lastNights(2)[1]), today = await S.evaluate(() => shiftDay());

  // Last night, as the app writes it: the close started, an item started then done, one blocked, one done and taken
  // back by a manager, a restock brought up, and the close finished early with a reason.
  const B = Date.now() - 864e5, at = (m) => new Date(B + m * 6e4);
  const ev = (id, m, p, x) => seed(`events/${id}`, { day: y, note: "", ...x, uid: p.uid, name: p.name, at: at(m) });
  const task = (i, v, from, to, note = "") => ({ kind: "task", list: "close", item: i, label: L[i], area: "bar", from, to, who: null, note, v });
  const run = (v, from, to, done, note = "") => ({ kind: "run", list: "close", label: "Closing checklist", area: "bar", from, to, done, required: 21, note, v });
  const stock = (v, from, to, qty) => ({ kind: "restock", ref: "old1", label: "Coke", area: "bar", from, to, who: from === "new" ? null : "Tia Staff", qty, unit: "case", dest: "up", v });
  await ev(`r-${y}-close-1`, 0, sam, run(1, "todo", "started", 0));
  await ev("s-old1-1", 2, sam, stock(1, "new", "asked", 2));
  await ev(`t-${y}-close-0-1`, 5, sam, task(0, 1, "todo", "doing"));
  await ev(`t-${y}-close-1-1`, 10, tia, task(1, 1, "todo", "done"));
  await ev("s-old1-2", 12, tia, stock(2, "asked", "doing", null));
  await ev(`t-${y}-close-2-1`, 15, tia, task(2, 1, "todo", "blocked", "No blue roll"));
  await ev("s-old1-3", 18, tia, stock(3, "doing", "delivered", 2));
  await ev("s-old1-4", 19, sam, stock(4, "delivered", "received", 2));
  await ev(`t-${y}-close-0-2`, 20, sam, task(0, 2, "doing", "done"));
  await ev(`t-${y}-close-1-2`, 30, mia, task(1, 2, "done", "todo", "Not wiped"));
  await ev(`r-${y}-close-2`, 45, mia, run(2, "started", "finished", 19, "Short staffed"));

  // Tonight so far: an item in progress for 35 minutes, one done, one blocked and a restock asked for.
  const t35 = minsAgo(35);
  await seed(`events/t-${today}-close-5-1`, { ...task(5, 1, "todo", "doing"), day: today, uid: tia.uid, name: tia.name, at: t35 });
  await seed(`shift/${today}/tasks/close-5`, { list: "close", item: 5, status: "doing", who: null, whoUid: null, note: "", v: 1, uid: tia.uid, name: tia.name, at: t35 });
  await shift(S, "close");
  await S.click('[data-list=close][data-i="0"]');
  S.answer = "No hot water";
  await pick(S, "close-3", "blocked");
  await S.click(".ptabs [data-pane=stock]");
  await S.selectOption("#rs-item", "Limes"); await S.fill("#rs-qty", "2"); await S.selectOption("#rs-unit", "bag"); await S.click("#rs-go");
  await M.waitForFunction(() => LIVE.events.length === 5 && LIVE.events.every((e) => !e.pending) && LIVE.restock.length === 1);

  // Live: what needs a manager now, longest waiting first, and where each list is up to.
  await managers(M, "live");
  const live = async () => ({ now: (await section(M, "#live", "Needs you now")).map((s) => s.replace(/Overdue: 3[5-7] min/, "Overdue: 35 min")), lists: await section(M, "#live", "Opening and closing") });
  const before = await live();
  assert.equal(before.now.length, 2);
  assert.match(before.now[0], new RegExp(`^Overdue: 35 min ${rx(L[5])} \\(Closing checklist\\) Started by Tia Staff, ${hm(t35)} · Open the list$`));
  assert.match(before.now[1], new RegExp(`^Blocked ${rx(L[3])} \\(Closing checklist\\) No hot water · Sam Staff, \\d\\d:\\d\\d · Open the list$`));
  assert.match(before.lists[1], /^Closing checklist In progress Bar 1 of 21 done · 1 in progress · 1 blocked · 1 overdue · Started by Sam Staff, \d\d:\d\d$/);
  const lw = await shared(M, "#live", "wa");
  assert.equal(lw.host, "wa.me");
  assert.match(lw.text, /^Black Tap Soho, \w{3} \d{1,2} \w{3}, at \d\d:\d\d\n/);
  assert.match(lw.text, /\nClosing checklist: In progress, 1 of 21 done, 1 blocked\. Started by Sam Staff, \d\d:\d\d\n/);
  assert.match(lw.text, /\nNeeds a manager:\n- Overdue: 3[5-7] min: .+ \(Closing checklist\)\. Started by Tia Staff, \d\d:\d\d\n- Blocked: .+ \(Closing checklist\) \(No hot water\)\. Sam Staff, \d\d:\d\d\n/);
  assert.match(lw.text, /\nRestocking open: 1\n- 2 bags of Limes for the upstairs bar: Waiting\n/);

  // A reload shows the same night: it's all saved, not held on the phone.
  await M.reload(); await M.click("#w-ok");
  await M.waitForFunction(() => LIVE.me && ["tasks", "runs", "events", "restock"].every((k) => LIVE.loaded.has(k)));
  await managers(M, "live");
  assert.deepEqual(await live(), before);

  // Activity: last night, then one person, one kind of change, or a word, and everything that happened to one item.
  await M.click("#msub [data-msub=act]");
  await M.selectOption("#af-night", y);
  await M.waitForFunction(() => /finished the closing checklist with 2 of 21 not done/.test(document.querySelector("#act-rows").textContent));
  const rows = () => M.$$eval("#act-rows .staffrow .n", (xs) => xs.map((e) => e.textContent.replace(/\s+/g, " ").trim()));
  const all = await rows();
  assert.equal(all.length, 10, "Sam's two routine changes on the close are one line");
  assert.ok(all.includes("Checklists Sam Staff made 2 checklist changes"));
  assert.equal(all[0], "Checklists Mia Manager finished the closing checklist with 2 of 21 not done");
  await M.selectOption("#af-who", "Tia Staff");
  assert.deepEqual(await rows(), ["Restocking Tia Staff brought up 2 cases of Coke for the upstairs bar", `Checklists Tia Staff blocked: ${L[2]}`,
    "Restocking Tia Staff started bringing up Coke for the upstairs bar", `Checklists Tia Staff completed: ${L[1]}`]);
  await M.selectOption("#af-who", "");
  await M.selectOption("#af-to", "back");
  assert.deepEqual(await rows(), [`Checklists Mia Manager took back: ${L[1]}`]);
  await M.selectOption("#af-to", "");
  await M.fill("#af-q", "wiped");
  assert.deepEqual(await rows(), [`Checklists Mia Manager took back: ${L[1]}`]);
  assert.match(await M.$eval("#act-rows .staffrow .s", (e) => e.textContent), /^\d\d:\d\d · Closing checklist · Reason: Not wiped · History$/);
  await M.click("#act-rows [data-hist]");
  const yName = await M.evaluate((y) => dayName(y), y);
  assert.deepEqual(await M.$$eval("#act-rows .hist .s", (xs) => xs.map((e) => e.textContent)),
    [`${yName}, ${hm(at(10))} · Tia Staff: completed: ${L[1]}`, `${yName}, ${hm(at(30))} · Mia Manager: took back: ${L[1]} (Not wiped)`]);
  await M.fill("#af-q", "");

  // The audit trail: every change on every night, with what it was before and after, who and why.
  const trail = await download(M, "trail");
  assert.match(trail.name, /^black-tap-audit-trail-\d{4}-\d\d-\d\d\.csv$/);
  assert.equal(trail.lines[0], "Event,Night,Date,Time,Kind,Record,What,Area,From,To,For,Amount,Unit,Done,Required,Reason,By");
  assert.equal(trail.lines.length, 1 + 11 + 5);
  const line = (xs) => xs.map(csv).join(",");
  for (const want of [
    [`r-${y}-close-2`, y, ukDay(at(45)), hm(at(45)), "Checklist", `r-${y}-close`, "Closing checklist", "Bar", "In progress", "Finished", "", "", "", 19, 21, "Short staffed", "Mia Manager"],
    [`t-${y}-close-1-2`, y, ukDay(at(30)), hm(at(30)), "Checklist item", `t-${y}-close-1`, L[1], "Bar", "Done", "Not started", "", "", "", "", "", "Not wiped", "Mia Manager"],
    ["s-old1-3", y, ukDay(at(18)), hm(at(18)), "Restock", "s-old1", "Coke", "Bar", "Being brought up", "Brought up", "Tia Staff", 2, "case", "", "", "", "Tia Staff"],
  ]) assert.ok(trail.lines.includes(line(want)), line(want));

  // The KPIs: each list night by night, then each person, worked out from the changes.
  await M.click("#msub [data-msub=kpis]");
  await M.waitForFunction(() => document.querySelector("#kpis p.txt"));
  const tName = await M.evaluate(() => dayName(shiftDay()));
  assert.equal(await M.$eval("#kpis p.txt", (e) => e.textContent), `Closing checklist: started on 2 nights and finished on 1, at ${hm(at(45))} on average, taking 45 min. 1 finished with items not done.`);
  assert.deepEqual(await section(M, "#kpis", "Night by night"), [`${tName} · Closing checklist Started ${hm(t35)}, not finished · 1 blocked`,
    `${yName} · Closing checklist ${hm(at(0))} to ${hm(at(45))} (45 min), 19 of 21 done. Finished with items left: Short staffed · 1 blocked · 1 taken back`]);
  assert.deepEqual(await section(M, "#kpis", "By person"), ["Mia Manager · 1 night 0 items done · longest gap between changes 15 min",
    "Sam Staff · 2 nights 2 items done · start to done 15 min on average, longest 15 min (1 item) · 1 confirmed arrived · 1 blocked · longest gap between changes 14 min",
    "Tia Staff · 2 nights 1 item done (1 taken back by someone else) · 1 restock brought up, 6 min on average from taking it on · 1 blocked · longest gap between changes 3 min"]);
  const kpis = await download(M, "kpis");
  assert.match(kpis.name, /^black-tap-closing-kpis-/);
  assert.deepEqual(kpis.lines, ["Night,Side,Checklist,Started,Finished,Minutes taken,Done,Required,Finished with items left,Reason,Reopened,Blocked,Taken back,Not needed",
    [today, "Bar", "Closing checklist", hm(t35), "Not finished", "", "", "", "", "", 0, 1, 0, 0].join(","),
    [y, "Bar", "Closing checklist", hm(at(0)), hm(at(45)), 45, 19, 21, "Yes", "Short staffed", 0, 1, 1, 0].join(",")]);
  const people = await download(M, "people");
  assert.deepEqual(people.lines, ["Person,Nights,Items done,Taken back by someone else,Items started then done,Average minutes start to done,Longest minutes start to done,Restocks brought up,Average minutes to bring up,Restocks confirmed,Blocked,Longest gap between changes (minutes)",
    "Mia Manager,1,0,0,0,,,0,,0,0,15", "Sam Staff,2,2,0,1,15,15,0,,1,1,14", "Tia Staff,2,1,1,0,,,1,6,0,1,3"]);

  // WhatsApp and Email carry the same text. Figures for each person stay in Bar Book and the spreadsheet.
  const kw = await shared(M, "#kpis", "wa"), km = await shared(M, "#kpis", "mail");
  assert.deepEqual([km.scheme, km.subject], ["mailto:", "Black Tap Soho closing KPIs"]);
  assert.equal(kw.text, km.body);
  assert.match(km.body, /^Black Tap Soho closing KPIs, the 7 nights to .+\n\nClosing checklist: started on 2 nights and finished on 1, /);
  assert.doesNotMatch(km.body, /Mia Manager|Sam Staff|Tia Staff/);
  await shift(S, "send");
  const sm = await shared(S, "#tally", "mail");
  assert.match(sm.subject, /^Black Tap Soho bar shift, /);
  assert.match(sm.body, /\nClosing checklist: 1 of 21 done\nStarted by Sam Staff, \d\d:\d\d\nNot done:\n/);
  assert.match(sm.body, new RegExp(`\\nBlocked:\\n- ${rx(L[3])} \\(No hot water\\)\\n`));

  // Light and dark, on a phone and on a desktop: nothing runs off the side.
  for (const scheme of ["light", "dark"]) for (const width of [390, 1280]) {
    for (const p of [M, S]) { await p.emulateMedia({ colorScheme: scheme }); await p.setViewportSize({ width, height: 900 }); }
    await M.waitForFunction((s) => document.documentElement.dataset.theme === s, scheme);
    const views = [["shift", S, async () => { await shift(S, "close"); await opts(S, "close-3"); }], ["stock", S, () => shift(S, "stock")],
      ["live", M, () => managers(M, "live")], ["activity", M, () => managers(M, "act")], ["kpis", M, () => managers(M, "kpis")]];
    for (const [name, p, go] of views) {
      await go();
      assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} fits ${width}px in ${scheme}`);
      // After the page's short fade-in.
      if (SHOTS) { await p.waitForTimeout(300); await p.screenshot({ path: `${SHOTS}/${name}-${scheme}-${width}.png`, fullPage: true }); }
    }
  }
  assert.deepEqual([O.errs, M.errs, S.errs, T.errs], [[], [], [], []]);
});
