// Tonight's tasks, lists and restocking end to end, on several phones at once: live statuses with who, when and why,
// corrections kept on the record, finishing and reopening a list, offline and clashing changes, the restocking board,
// and for managers Live, Activity's filters and History, the closing KPIs, the downloads, WhatsApp and email, a reload,
// and the layout on a phone and a desktop in light and dark.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, toastOf, attempt, adminWrite, ukDay, part } from "./helpers.mjs";

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
// The list's status box, found and read in one go. ($eval finds it, then reads it in a second step; a teammate's change
// arriving in between redraws the list, and a box no longer on the page reads without its line breaks.)
const runBox = (p) => p.evaluate(() => document.querySelector(".run").innerText.replace(/\s+/g, " ").trim());
const settled = (p, id, status) => p.waitForFunction(([id, s]) => LIVE.tasks[id]?.status === s && !LIVE.tasks[id].pending, [id, status]);
const waitToast = (p, re) => p.waitForFunction((s) => new RegExp(s).test(document.querySelector("#toast").textContent), re.source);
const shift = async (p, pane) => { await p.click("[data-tab=tally]"); await p.click(`.ptabs [data-pane=${pane}]`); };
// An item's ⋯ options stay open while the list changes, so this only opens them if they're closed.
const opts = async (p, id) => { if ((await p.getAttribute(`[data-more="${id}"]`, "aria-expanded")) !== "true") await p.click(`[data-more="${id}"]`); };
const pick = async (p, id, to) => { await opts(p, id); await p.click(`[data-task="${id}"][data-to="${to}"]`); };
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
// The box's Send button opens the Send page; its WhatsApp or Email address is filled in as it's tapped. Opening it is stopped.
async function shared(p, box, via) {
  await p.evaluate(() => { if (!window.noOpen) { window.noOpen = true; addEventListener("click", (e) => { if (e.target.closest("a[data-share]")) e.preventDefault(); }, true); } });
  await p.click(`${box} [data-send]`);
  const a = `#send [data-share][data-via=${via}]`;
  await p.click(a);
  const u = new URL(await p.getAttribute(a, "href"));
  await p.evaluate(() => closeSheet());
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
  assert.match(await runBox(T), /^In progress Started by Sam Staff, \d\d:\d\d Finish shows once every item is done\.$/);

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

  // Anyone can take a done item back, straight away and with no reason; whoever did it is told, and the history keeps who.
  let asked = 0;
  T.on("dialog", () => asked++);
  await T.click('[data-list=close][data-i="0"]');
  await waitToast(S, /^Tia Staff took back your item: /);
  await settled(S, "close-0", "todo");
  assert.equal(await row(S, "close", 0), await S.evaluate(() => itemText("close", 0)));
  assert.equal(asked, 0, "no reason asked");

  // Clear: anyone puts the whole list back to not started on every phone, without a toast for each item.
  await S.click('[data-list=close][data-i="1"]');
  await settled(T, "close-1", "done");
  T.answer = "yes";
  await T.$eval("[data-clear-list=close]", (b) => b.click());
  await settled(S, "close-1", "todo");
  await settled(S, "close-3", "todo");
  assert.equal(await row(S, "close", 1), await S.evaluate(() => itemText("close", 1)), "no Reopened line on a cleared item");

  // Managers give an item to someone, who's told, and everyone sees who it's for.
  const sam = await S.evaluate(() => LIVE.uid);
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
  assert.deepEqual(await S.$$eval(".prog-head > *", (xs) => xs.map((e) => e.textContent)), ["0 of 5 done · 1 not needed tonight", "0%"]);
  await S.click('[data-list=fset][data-i="0"]');
  assert.equal(await toastOf(S), "Not needed tonight. A manager can bring it back");

  // Four of the five done: staff can't finish it yet, and the rules won't let a list finish short without a manager.
  for (const i of [5, 1, 2, 3]) await S.click(`[data-list=fset][data-i="${i}"]`);
  await M.waitForFunction(() => [5, 1, 2, 3].every((i) => LIVE.tasks[`fset-${i}`]?.status === "done" && !LIVE.tasks[`fset-${i}`].pending));
  assert.equal(await S.locator('[data-run="fset"][data-to="finished"]').count(), 0);
  assert.match(await runBox(S), /Finish shows once every item is done/);
  assert.equal(await attempt(S, () => LIVE.api.setRun("fset", "Tables and cutlery", "finished", 3, 4, "Done enough")), "permission-denied");

  // A manager can finish it anyway, saying why. The floor is told, and the list locks.
  M.answer = "Short staffed, last table done tomorrow";
  await M.click('[data-run="fset"][data-to="override"]');
  await waitToast(S, /^Tables and cutlery finished by Mia Manager, with 1 not done$/);
  await S.waitForFunction(() => LIVE.runs.fset?.status === "finished" && !LIVE.runs.fset.pending);
  assert.match(await runBox(S),
    /^Finished Started by Mia Manager, \d\d:\d\d\. Finished by Mia Manager, \d\d:\d\d, with 1 of 5 not done\. Reason: Short staffed, last table done tomorrow Reopen…$/);
  await S.click('[data-list=fset][data-i="4"]');
  assert.equal(await toastOf(S), "Tables and cutlery is finished. Reopen it to change anything");
  assert.equal(await attempt(S, () => LIVE.api.setTask("fset", 4, "x", "done")), "permission-denied");
  assert.equal(await attempt(S, () => LIVE.api.setRun("fset", "Tables and cutlery", "started", 3, 4, "")), "permission-denied", "reopening needs a reason");

  // Anyone can reopen it, with a reason. Then the last item can be done, and anyone can finish it.
  M.answer = "Last table needs laying";
  await M.click('[data-run="fset"][data-to="reopen"]');
  await waitToast(S, /^Tables and cutlery reopened by Mia Manager$/);
  await S.waitForFunction(() => LIVE.runs.fset?.status === "started" && !LIVE.runs.fset.pending);
  await S.click('[data-list=fset][data-i="4"]');
  await S.click('[data-run="fset"][data-to="finished"]');
  await M.waitForFunction(() => LIVE.runs.fset?.status === "finished" && LIVE.runs.fset.done === 5 && LIVE.runs.fset.required === 5 && !LIVE.runs.fset.pending);

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
  // innerText only spaces the buttons apart once the card is on screen.
  const card = async (p, id) => { await p.waitForSelector(`[data-rs-card="${id}"]`, { state: "visible" }); return p.$eval(`[data-rs-card="${id}"]`, (e) => e.innerText.replace(/\s+/g, " ").trim()); };
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
  // Sam's own confirmation says "sending…" until the server has it, which can be after Tia's toast.
  await S.waitForFunction(() => /confirmed by Sam Staff, \d\d:\d\d/.test(document.querySelector("#tally details.setup")?.textContent || ""));
  assert.match(flat(await S.$eval("#tally details.setup", (e) => e.textContent)), /^Done tonight \(1\).*1 bag arrived, confirmed by Sam Staff, \d\d:\d\d \(2 bags brought up by Tia Staff\)$/);
  assert.equal(await attempt(S, (id) => LIVE.api.moveRestock(LIVE.restock.find((r) => r.id === id), "received", { got: 2 }), id), "permission-denied", "confirmed once");

  // One left waiting too long stands out on the board.
  const sam = await S.evaluate(() => LIVE.uid), day = await S.evaluate(() => shiftDay()), t25 = minsAgo(25);
  await seed("restock/late1", { item: "Coke", qty: 1, unit: "case", dest: "down", detail: "", day, status: "asked", who: null, whoUid: null, moved: null, got: null, note: "",
    v: 1, askedBy: "Sam Staff", askedUid: sam, askedAt: t25, uid: sam, name: "Sam Staff", at: t25 });
  await M.waitForSelector('[data-rs-card="late1"]');
  assert.deepEqual(await M.$$eval('[data-rs-card="late1"] .pill', (xs) => xs.map((e) => e.textContent.replace(/2[56] min/, "25 min"))), ["Waiting", "Waiting 25 min"]);
  assert.deepEqual([O.errs, M.errs, S.errs, T.errs], [[], [], [], []]);
});

