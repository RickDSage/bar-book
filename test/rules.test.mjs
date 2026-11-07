// Allow and deny tests for firestore.rules, run against the Firestore emulator (never a real project).
//   npm run test:rules           starts an emulator, runs these, stops it
//   node --test test/rules.test.mjs   uses an emulator that's already running on 127.0.0.1:8080
// Every write here mirrors a write the app makes, so a failing ALLOW means the app would break.
import { test, before, after, beforeEach, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection, query, where, orderBy, limit,
  writeBatch, serverTimestamp, Timestamp, deleteField, getCountFromServer, FieldPath,
} from "firebase/firestore";

const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080").split(":");
let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-bar-book-rules",
    firestore: { host, port: +port, rules: fs.readFileSync(new URL("../firestore.rules", import.meta.url), "utf8") },
  });
});
after(() => env?.cleanup());

// ---------- People (made-up names; no real staff) ----------
const TEAM = {
  owner1: { name: "Olly Owner", username: "olly", role: "owner" },
  mgr1: { name: "Mia Manager", username: "mia", role: "manager" },
  mgr2: { name: "Max Manager", username: "max", role: "manager" },
  staff1: { name: "Sam Staff", username: "sam", role: "staff" },
  staff2: { name: "Tia Staff", username: "tia", role: "staff" },
};
const SETUP_CODE = "correct-horse-battery-staple";
const emailOf = (u) => `${u}-1a2b3c4d@users.example.com`;
const db = (uid) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();
const seed = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));
const now = serverTimestamp;
const by = (uid) => ({ uid, name: TEAM[uid]?.name ?? "Stray", at: now() });
const daysAgo = (n) => Timestamp.fromMillis(Date.now() - n * 864e5);
// Business day in UK time, as the app works it out (rolls over at 6am).
const ukDay = (ms) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(ms).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
};
const today = () => ukDay(Date.now() - 6 * 36e5);
const dayFromNow = (n) => ukDay(Date.now() + n * 864e5);
// The night before tonight, worked out from today() so it differs from it even between midnight and 6am.
const dayBefore = (d) => new Date(Date.parse(`${d}T12:00Z`) - 864e5).toISOString().slice(0, 10);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const autoId = () => doc(collection(db("owner1"), "x")).id;

async function seedTeam({ withOwner = true } = {}) {
  await seed(async (s) => {
    for (const [uid, p] of Object.entries(TEAM)) {
      if (p.role === "owner" && !withOwner) continue;
      await setDoc(doc(s, "staff", uid), p);
      await setDoc(doc(s, "usernames", p.username), { email: emailOf(p.username), uid });
    }
    if (withOwner) await setDoc(doc(s, "config", "owner"), { uid: "owner1", proof: SETUP_CODE });
  });
}

// ---------- The app's account writes ----------
const auditEntry = (action, person, actor, actorName) => ({
  action, target: person.uid, targetName: person.name, username: person.username, role: person.role,
  uid: actor, name: actorName ?? TEAM[actor]?.name ?? "Stray Person", at: now(),
});
function setupBatch(d, uid, { name = "Olly Owner", username = "olly", code = SETUP_CODE, skip = [] } = {}) {
  const b = writeBatch(d), me = { uid, name, username, role: "owner" };
  if (!skip.includes("claim")) b.set(doc(d, "config", "owner"), { uid, proof: code });
  if (!skip.includes("staff")) b.set(doc(d, "staff", uid), { name, username, role: "owner" });
  if (!skip.includes("username")) b.set(doc(d, "usernames", username), { email: emailOf(username), uid });
  if (!skip.includes("audit")) b.set(doc(d, "audit", uid + "-in"), auditEntry("setup", me, uid, name));
  if (!skip.includes("pins")) b.delete(doc(d, "config", "pins"));
  return b;
}
function addBatch(d, actor, person, { skip = [], action = "add", actorName } = {}) {
  const b = writeBatch(d);
  if (!skip.includes("staff")) b.set(doc(d, "staff", person.uid), { name: person.name, username: person.username, role: person.role, ...(person.extra || {}) });
  if (!skip.includes("username")) b.set(doc(d, "usernames", person.username), { email: emailOf(person.username), uid: person.uid });
  if (!skip.includes("audit")) b.set(doc(d, "audit", person.uid + "-in"), auditEntry(action, person, actor, actorName));
  return b;
}
function resetBatch(d, actor, oldUid, newUid) {
  const p = TEAM[oldUid], b = writeBatch(d), fresh = { ...p, uid: newUid }, old = { ...p, uid: oldUid };
  b.set(doc(d, "staff", newUid), p);
  b.set(doc(d, "usernames", p.username), { email: `${p.username}-9z8y7x6w@users.example.com`, uid: newUid });
  b.delete(doc(d, "staff", oldUid));
  b.set(doc(d, "audit", newUid + "-in"), auditEntry("reset", fresh, actor));
  b.set(doc(d, "audit", oldUid + "-out"), auditEntry("reset", old, actor));
  return b;
}
function removeBatch(d, actor, uid, { skip = [] } = {}) {
  const p = TEAM[uid], b = writeBatch(d);
  if (!skip.includes("username")) b.delete(doc(d, "usernames", p.username));
  if (!skip.includes("staff")) b.delete(doc(d, "staff", uid));
  if (!skip.includes("audit")) b.set(doc(d, "audit", uid + "-out"), auditEntry("remove", { ...p, uid }, actor));
  return b;
}
function roleBatch(d, actor, uid, role) {
  const b = writeBatch(d);
  b.update(doc(d, "staff", uid), { role });
  b.set(doc(d, "audit", autoId()), auditEntry("role", { ...TEAM[uid], uid, role }, actor));
  return b;
}

// ---------- The app's other writes ----------
function out86(d, uid, itemName) {
  const item = slug(itemName), b = writeBatch(d), log = doc(collection(d, "outlog"));
  b.set(doc(d, "out", item), { itemName, log: log.id, ...by(uid) });
  b.set(log, { item, itemName, action: "out", ...by(uid) });
  return { b, log: log.id };
}
function back86(d, uid, itemName, log) {
  const item = slug(itemName), b = writeBatch(d);
  b.delete(doc(d, "out", item));
  b.set(doc(d, "outlog", log + "-back"), { item, itemName, action: "back", ...by(uid) });
  return b;
}
const report = (uid, extra = {}) => ({ side: "bar", text: "Opening checklist: 15 of 15 done", summary: "Bar · Opening 15/15", photos: 0, ...by(uid), ...extra });
const JPEG = "data:image/jpeg;base64," + "A".repeat(2000);
const photo = (uid, extra = {}) => ({ data: JPEG, note: "", report: null, ...by(uid), ...extra });
function sendReport(d, uid, photoIds, extra = {}) {
  const b = writeBatch(d), ref = doc(collection(d, "reports"));
  b.set(ref, report(uid, { photos: photoIds.length, ...extra }));
  photoIds.forEach((id) => b.update(doc(d, "photos", id), { report: ref.id }));
  return { b, id: ref.id };
}
// A refusal, saying which case it was if the write goes through after all.
const fails = (p, why) => assertFails(p).catch((e) => { throw new Error(`${why}: ${e.message}`); });
// What a record holds now, read past the rules (the app reads it from its live copy).
async function current(path) {
  let x = null;
  await seed(async (s) => { const d = await getDoc(doc(s, path)); x = d.exists() ? d.data() : null; });
  return x;
}
// Tonight's tasks and procedures, and restocking: each change writes the record and its event in one batch, from the
// record as it is now, as the app does. A give of null takes a task off whoever it was for.
const SIDE = { open: "bar", close: "bar", fset: "floor", fshake: "floor", fclose: "floor", kopen: "kitchen", kclose: "kitchen" };
async function taskBatch(d, uid, list, item, to, { note = "", give, day = today(), task = {}, event = {}, eventId } = {}) {
  const id = `${list}-${item}`, cur = await current(`shift/${day}/tasks/${id}`), v = (cur?.v || 0) + 1, from = cur?.status || "todo";
  const who = give === undefined ? cur?.who ?? null : give ? TEAM[give]?.name ?? "Gus Ghost" : null;
  const whoUid = give === undefined ? cur?.whoUid ?? null : give;
  const status = give === undefined ? to : from, b = writeBatch(d);
  b.set(doc(d, "shift", day, "tasks", id), { list, item, status, who, whoUid, note, v, ...by(uid), ...task });
  b.set(doc(d, "events", eventId || `t-${day}-${id}-${v}`), { kind: "task", day, list, item, label: "Ice well emptied", area: SIDE[list] ?? "bar", from, to: status, who, note, v, ...by(uid), ...event });
  return b;
}
async function runBatch(d, uid, list, to, { done = 0, required = 21, note = "", day = today(), run = {}, event = {} } = {}) {
  const cur = await current(`shift/${day}/runs/${list}`), v = (cur?.v || 0) + 1, from = cur?.status || "todo", b = writeBatch(d);
  b.set(doc(d, "shift", day, "runs", list), { list, status: to, done, required, note, v, ...by(uid), ...run });
  b.set(doc(d, "events", `r-${day}-${list}-${v}`), { kind: "run", day, list, label: "Closing checklist", area: SIDE[list] ?? "bar", from, to, done, required, note, v, ...by(uid), ...event });
  return b;
}
const DEST_SIDE = { up: "bar", down: "bar", shakes: "floor", floor: "floor", kitchen: "kitchen" };
function askBatch(d, uid, { item = "Limes", qty = 2, unit = "bag", dest = "up", detail = "", day = today(), r = {}, event = {} } = {}) {
  const ref = doc(collection(d, "restock")), b = writeBatch(d);
  b.set(ref, { item, qty, unit, dest, detail, day, status: "asked", who: null, whoUid: null, moved: null, got: null, note: "", v: 1, askedBy: TEAM[uid].name, askedUid: uid, askedAt: now(), ...by(uid), ...r });
  b.set(doc(d, "events", `s-${ref.id}-1`), { kind: "restock", day, ref: ref.id, label: item, area: DEST_SIDE[dest] ?? "bar", from: "new", to: "asked", who: null, qty, unit, dest, note: "", v: 1, ...by(uid), ...event });
  return { b, id: ref.id };
}
// Taking it on puts the taker's name on it, back to waiting takes every name and amount off, and anything else keeps
// them unless the test says otherwise.
async function moveBatch(d, uid, id, to, { note = "", give, moved, got, day = today(), r = {}, event = {}, eventId } = {}) {
  const cur = await current(`restock/${id}`), v = cur.v + 1, clear = to === "asked";
  const who = give !== undefined ? give && (TEAM[give]?.name ?? "Gus Ghost") : to === "doing" ? TEAM[uid].name : clear ? null : cur.who;
  const whoUid = give !== undefined ? give : to === "doing" ? uid : clear ? null : cur.whoUid;
  const m = moved !== undefined ? moved : clear ? null : cur.moved, g = got !== undefined ? got : clear ? null : cur.got, b = writeBatch(d);
  b.update(doc(d, "restock", id), { status: to, who, whoUid, moved: m, got: g, note, v, ...by(uid), ...r });
  b.set(doc(d, "events", eventId || `s-${id}-${v}`), { kind: "restock", day, ref: id, label: cur.item, area: DEST_SIDE[cur.dest], from: cur.status, to, who,
    qty: to === "delivered" ? m : to === "received" ? g : null, unit: cur.unit, dest: cur.dest, note, v, ...by(uid), ...event });
  return b;
}
// Date labels: each change writes the label and its event in one batch, from the label as it is now, as the app does.
// Opening and changing date it today, with the use-by its life gives it unless the test picks another.
const plusDays = (day, n) => new Date(Date.parse(day) + n * 864e5).toISOString().slice(0, 10);
async function labelBatch(d, uid, act, { id, def = {}, useBy, day = today(), l = {}, event = {}, eventId } = {}) {
  const add = act === "added", ref = id ? doc(d, "labels", id) : doc(collection(d, "labels")), cur = add ? null : await current(`labels/${id}`);
  const v = add ? 1 : cur.v + 1, open = act === "opened" || act === "changed", shut = add || act === "binned";
  const D = { ...(add ? { item: "Apple juice", side: "bar", life: 3, on: true } : { item: cur.item, side: cur.side, life: cur.life, on: cur.on }), ...def };
  const x = act === "removed" ? null : {
    ...D, state: open ? "open" : shut ? "none" : cur.state,
    openedOn: open ? day : shut ? null : cur.openedOn, useBy: open ? useBy ?? plusDays(day, D.life) : shut ? null : cur.useBy,
    openedBy: open ? TEAM[uid].name : shut ? null : cur.openedBy, openedUid: open ? uid : shut ? null : cur.openedUid,
    act, v, ...by(uid), ...l,
  };
  const b = writeBatch(d);
  if (x) b.set(ref, x); else b.delete(ref);
  b.set(doc(d, "events", eventId || `l-${ref.id}-${v}`), { kind: "label", day, ref: ref.id, label: D.item, area: D.side, act, life: D.life, on: D.on,
    useBy: x ? x.useBy : null, was: cur ? cur.useBy : null, note: "", v, ...by(uid), ...event });
  return { b, id: ref.id };
}
// The rota: a shift and, once it's published, its event, written in one batch from the shift as it is now, as the app
// does. A new shift is Sam's, on Saturday this week, 18:00 to 02:00 on the bar, as a draft.
const mondayOf = (day) => plusDays(day, -((new Date(Date.parse(day)).getUTCDay() + 6) % 7));
const SHIFT = () => ({ week: mondayOf(today()), day: plusDays(mondayOf(today()), 5), start: "18:00", end: "02:00", side: "bar", note: "", who: "staff1", whoName: "Sam Staff",
  offer: "", offerName: "", cover: "", wants: {}, pub: false });
const STAMPS = ["act", "v", "uid", "name", "at"];
async function shiftBatch(d, uid, act, { id, f = {}, s = {}, event = {}, eventId, noEvent } = {}) {
  const add = act === "added", ref = id ? doc(d, "shifts", id) : doc(collection(d, "shifts")), cur = add ? null : await current(`shifts/${id}`);
  const v = add ? 1 : cur.v + 1, base = add ? SHIFT() : Object.fromEntries(Object.entries(cur).filter(([k]) => !STAMPS.includes(k)));
  const x = act === "removed" ? null : { ...base, ...f, act, v, ...by(uid), ...s }, after = x || base, b = writeBatch(d);
  if (x) b.set(ref, x); else b.delete(ref);
  if (!noEvent && (after.pub === true && act !== "published")) b.set(doc(d, "events", eventId || `w-${ref.id}-${v}`), { kind: "shift", day: today(), ref: ref.id,
    label: `${after.day} ${after.start}-${after.end}`, area: after.side, act, sday: after.day, start: after.start, end: after.end, who: after.whoName, offer: after.offerName,
    cover: after.cover, was: cur ? { day: cur.day, start: cur.start, end: cur.end, side: cur.side, who: cur.whoName } : null, note: "", v, ...by(uid), ...event });
  return { b, id: ref.id };
}
const ask = (uid, kind, fields) => ({ kind, note: "", status: "pending", ...by(uid), ...fields });
const issue = (uid, extra = {}) => ({ title: "Glass washer leaking", detail: "", area: "bar", urgent: false, again: null, status: "open", ...by(uid), ...extra });

// =====================================================================================
describe("visitors who aren't logged in", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const PRIVATE = ["staff/staff1", "config/owner", "config/pins", "feed/a", "notices/a", "reports/a", "photos/a", "shift/2026-10-25/ticks/open-1",
    "shift/2026-10-25/tasks/open-1", "shift/2026-10-25/runs/open", "events/a", "restock/a",
    "requests/a", "out/gin", "outlog/a", "asks/a", "incidents/a", "reviews/a", "ratings/a", "audit/a", "issues/a", "seen/a-staff1",
    "waste/a", "kit/a", "safety/a", "pars/gin", "counts/a", "training/staff1-negroni", "concerns/a", "concernPhotos/a-0", "lists/close", "listlog/close-1", "labels/a", "shifts/a"];
  for (const p of PRIVATE) test(`can't read ${p}`, () => assertFails(getDoc(doc(db(), p))));
  for (const c of ["staff", "usernames", "feed", "notices", "seen", "reports", "photos", "requests", "out", "outlog", "asks", "incidents", "reviews", "ratings", "audit", "issues", "waste", "kit", "safety", "pars", "counts", "training", "concerns", "concernPhotos", "events", "restock", "lists", "listlog", "labels", "shifts"]) {
    test(`can't list ${c}`, () => assertFails(getDocs(collection(db(), c))));
  }
  test("can look up one username, and it holds only the sign-in address and uid", async () => {
    const snap = await assertSucceeds(getDoc(doc(db(), "usernames/sam")));
    assert.deepEqual(Object.keys(snap.data()).sort(), ["email", "uid"]);
    assert.match(snap.data().email, /@users\.example\.com$/);
  });
  test("can't write anything", async () => {
    await assertFails(setDoc(doc(db(), "feed/x"), { kind: "comment", text: "hi", uid: "x", name: "x", at: now() }));
    await assertFails(setDoc(doc(db(), "usernames/evil"), { email: emailOf("evil"), uid: "x" }));
    await assertFails(deleteDoc(doc(db(), "usernames/sam")));
  });
});

describe("signed in but not on the team", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  test("can't read team data", async () => {
    for (const p of ["staff/staff1", "feed/a", "reports/a", "out/gin"]) await assertFails(getDoc(doc(db("stranger"), p)));
    await assertFails(getDocs(collection(db("stranger"), "feed")));
  });
  test("can't add themselves as staff, manager or owner", async () => {
    for (const role of ["staff", "manager", "owner"]) {
      await assertFails(addBatch(db("stranger"), "stranger", { uid: "stranger", name: "Stray", username: "stray", role }).commit());
    }
  });
  test("can't claim owner once there is one, even with the code", async () => {
    await seed((s) => setDoc(doc(s, "config/pins"), { setup: SETUP_CODE }));
    await assertFails(setupBatch(db("stranger"), "stranger", { username: "stray" }).commit());
  });
  test("can't post to the board", () => assertFails(addDoc(collection(db("stranger"), "feed"), { kind: "comment", text: "hi", uid: "stranger", name: "Stray", at: now() })));
  test("can't read or change tonight's tasks, procedures, restocking or events", async () => {
    for (const p of [`shift/${today()}/tasks/open-1`, `shift/${today()}/runs/open`, "events/a", "restock/a"]) await assertFails(getDoc(doc(db("stranger"), p)));
    await assertFails(getDocs(query(collection(db("stranger"), "events"), where("day", "==", today()))));
    await assertFails((await taskBatch(db("stranger"), "stranger", "open", 1, "done")).commit());
    await assertFails((await runBatch(db("stranger"), "stranger", "open", "started")).commit());
  });
});

// =====================================================================================
describe("first-time owner setup", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam({ withOwner: false }); await seed((s) => setDoc(doc(s, "config/pins"), { setup: SETUP_CODE })); });

  test("works with the right code, burns the code, and leaves no secret on the staff record", async () => {
    await assertSucceeds(setupBatch(db("ownerX"), "ownerX").commit());
    await seed(async (s) => {
      assert.equal((await getDoc(doc(s, "config/pins"))).exists(), false, "setup code deleted");
      assert.deepEqual(Object.keys((await getDoc(doc(s, "staff/ownerX"))).data()).sort(), ["name", "role", "username"]);
      assert.equal((await getDoc(doc(s, "config/owner"))).data().uid, "ownerX");
    });
    // The new owner, and managers, can't read either config document.
    await assertFails(getDoc(doc(db("ownerX"), "config/owner")));
    await assertFails(getDoc(doc(db("mgr1"), "config/owner")));
  });
  test("fails with the wrong code", () => assertFails(setupBatch(db("ownerX"), "ownerX", { code: "wrong-code-wrong-code" }).commit()));
  test("fails with a code under 16 characters even if it matches", async () => {
    await seed((s) => setDoc(doc(s, "config/pins"), { setup: "short" }));
    await assertFails(setupBatch(db("ownerX"), "ownerX", { code: "short" }).commit());
  });
  test("fails before config/pins has been made", async () => {
    await seed((s) => deleteDoc(doc(s, "config/pins")));
    await assertFails(setupBatch(db("ownerX"), "ownerX").commit());
  });
  for (const part of ["claim", "staff", "username", "audit", "pins"]) {
    test(`fails without the ${part} write`, () => assertFails(setupBatch(db("ownerX"), "ownerX", { skip: [part] }).commit()));
  }
  test("works only once: a second account with the same code is refused", async () => {
    await assertSucceeds(setupBatch(db("ownerX"), "ownerX").commit());
    await seed((s) => setDoc(doc(s, "config/pins"), { setup: SETUP_CODE })); // even if the code were put back
    await assertFails(setupBatch(db("ownerY"), "ownerY", { username: "other" }).commit());
  });
  test("two phones setting up at the same moment: exactly one becomes owner", async () => {
    const results = await Promise.allSettled([
      setupBatch(db("ownerX"), "ownerX", { username: "olly" }).commit(),
      setupBatch(db("ownerY"), "ownerY", { username: "oscar" }).commit(),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    await seed(async (s) => {
      const owners = (await getDocs(collection(s, "staff"))).docs.filter((d) => d.data().role === "owner");
      assert.equal(owners.length, 1);
    });
  });
  test("an owner record can't be made without the claim, and the claim can't be changed or deleted", async () => {
    await assertFails(setupBatch(db("ownerX"), "ownerX", { skip: ["claim", "pins"] }).commit());
    await assertSucceeds(setupBatch(db("ownerX"), "ownerX").commit());
    await assertFails(setDoc(doc(db("ownerX"), "config/owner"), { uid: "mgr1", proof: SETUP_CODE }));
    await assertFails(deleteDoc(doc(db("ownerX"), "config/owner")));
  });
  test("staff records can't carry a setup field, for any role", async () => {
    await assertSucceeds(setupBatch(db("ownerX"), "ownerX").commit());
    const ned = { uid: "new1", name: "Ned", username: "ned", role: "staff" };
    await assertSucceeds(addBatch(db("ownerX"), "ownerX", ned, { actorName: "Olly Owner" }).commit());
    for (const role of ["staff", "manager"]) {
      await assertFails(addBatch(db("ownerX"), "ownerX", { uid: "new2" + role, name: "Nia", username: "nia" + role.slice(0, 1), role, extra: { setup: SETUP_CODE } }, { actorName: "Olly Owner" }).commit());
    }
  });
});

// =====================================================================================
describe("team accounts", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const ned = (role = "staff") => ({ uid: "new1", name: "Ned New", username: "ned", role });

  test("staff can't add anyone, change roles or read the team list", async () => {
    for (const role of ["staff", "manager", "owner"]) await assertFails(addBatch(db("staff1"), "staff1", ned(role)).commit());
    await assertFails(updateDoc(doc(db("staff1"), "staff/staff1"), { role: "manager" }));
    await assertFails(updateDoc(doc(db("staff1"), "staff/staff2"), { role: "manager" }));
    await assertFails(getDocs(collection(db("staff1"), "staff")));
    await assertFails(getDoc(doc(db("staff1"), "staff/staff2")));
    await assertSucceeds(getDoc(doc(db("staff1"), "staff/staff1")));
  });
  test("a manager adds staff, but not managers or owners", async () => {
    await assertSucceeds(addBatch(db("mgr1"), "mgr1", ned("staff")).commit());
    await env.clearFirestore(); await seedTeam();
    await assertFails(addBatch(db("mgr1"), "mgr1", ned("manager")).commit());
    await assertFails(addBatch(db("mgr1"), "mgr1", ned("owner")).commit());
  });
  test("adding needs the username and the audit entry in the same write", async () => {
    await assertFails(addBatch(db("mgr1"), "mgr1", ned(), { skip: ["username"] }).commit());
    await assertFails(addBatch(db("mgr1"), "mgr1", ned(), { skip: ["audit"] }).commit());
    await assertFails(addBatch(db("mgr1"), "mgr1", ned(), { skip: ["staff"] }).commit());
  });
  test("a username that's taken can't be grabbed", () => assertFails(addBatch(db("mgr1"), "mgr1", { ...ned(), username: "tia" }).commit()));
  test("the owner adds a manager, and can't add a second owner", async () => {
    await assertSucceeds(addBatch(db("owner1"), "owner1", ned("manager")).commit());
    await assertFails(addBatch(db("owner1"), "owner1", { uid: "new2", name: "Oz", username: "oz", role: "owner" }).commit());
  });
  test("bad names, usernames and extra fields are refused", async () => {
    await assertFails(addBatch(db("mgr1"), "mgr1", { ...ned(), name: "   " }).commit());
    await assertFails(addBatch(db("mgr1"), "mgr1", { ...ned(), name: "x".repeat(41) }).commit());
    await assertFails(addBatch(db("mgr1"), "mgr1", { ...ned(), username: "Ned" }).commit());
    await assertFails(addBatch(db("mgr1"), "mgr1", { ...ned(), extra: { active: true } }).commit());
  });
  test("a manager resets a staff PIN; the old account loses access", async () => {
    await assertSucceeds(resetBatch(db("mgr1"), "mgr1", "staff1", "staff1b").commit());
    await assertFails(getDocs(collection(db("staff1"), "feed")));
    await assertSucceeds(getDocs(collection(db("staff1b"), "feed")));
  });
  test("a manager can't reset another manager or the owner; the owner can reset a manager", async () => {
    await assertFails(resetBatch(db("mgr1"), "mgr1", "mgr2", "mgr2b").commit());
    await assertFails(resetBatch(db("mgr1"), "mgr1", "owner1", "owner1b").commit());
    await assertSucceeds(resetBatch(db("owner1"), "owner1", "mgr2", "mgr2b").commit());
  });
  test("nobody, the owner included, can move the owner to a new account", () => assertFails(resetBatch(db("owner1"), "owner1", "owner1", "owner1b").commit()));
  test("a manager removes staff; the username and audit entry go with it", async () => {
    await assertFails(removeBatch(db("mgr1"), "mgr1", "staff1", { skip: ["username"] }).commit());
    await assertFails(removeBatch(db("mgr1"), "mgr1", "staff1", { skip: ["audit"] }).commit());
    await assertFails(removeBatch(db("mgr1"), "mgr1", "staff1", { skip: ["staff"] }).commit());
    await assertSucceeds(removeBatch(db("mgr1"), "mgr1", "staff1").commit());
  });
  test("someone removed loses access at once, and their old posts keep their name", async () => {
    await seed((s) => addDoc(collection(s, "feed"), { kind: "comment", text: "Limes low", uid: "staff1", name: "Sam Staff", at: Timestamp.now() }));
    await assertSucceeds(removeBatch(db("mgr1"), "mgr1", "staff1").commit());
    await assertFails(getDocs(collection(db("staff1"), "feed")));
    await assertFails(addDoc(collection(db("staff1"), "feed"), { kind: "comment", text: "still here?", ...by("staff1") }));
    const posts = await getDocs(collection(db("staff2"), "feed"));
    assert.equal(posts.docs[0].data().name, "Sam Staff");
  });
  test("managers can't remove managers, the owner or themselves", async () => {
    await assertFails(removeBatch(db("mgr1"), "mgr1", "mgr2").commit());
    await assertFails(removeBatch(db("mgr1"), "mgr1", "owner1").commit());
    await assertFails(removeBatch(db("mgr1"), "mgr1", "mgr1").commit());
  });
  test("the owner removes a manager but can't remove or demote themselves", async () => {
    await assertSucceeds(removeBatch(db("owner1"), "owner1", "mgr2").commit());
    await assertFails(removeBatch(db("owner1"), "owner1", "owner1").commit());
    await assertFails(roleBatch(db("owner1"), "owner1", "owner1", "manager").commit());
  });
  test("only the owner promotes and demotes, and never to owner", async () => {
    await assertSucceeds(roleBatch(db("owner1"), "owner1", "staff1", "manager").commit());
    await assertSucceeds(roleBatch(db("owner1"), "owner1", "staff1", "staff").commit());
    await assertFails(roleBatch(db("owner1"), "owner1", "staff1", "owner").commit());
    await assertFails(roleBatch(db("mgr1"), "mgr1", "staff1", "manager").commit());
    await assertFails(updateDoc(doc(db("owner1"), "staff/staff1"), { name: "Renamed" }));
  });
  test("the owner's username can't be repointed or deleted, even by the owner", async () => {
    for (const actor of ["mgr1", "owner1"]) {
      await assertFails(setDoc(doc(db(actor), "usernames/olly"), { email: emailOf("olly"), uid: actor }));
      await assertFails(deleteDoc(doc(db(actor), "usernames/olly")));
    }
  });
  test("a username can't be pointed at an account that doesn't use it", async () => {
    await assertFails(setDoc(doc(db("owner1"), "usernames/sam"), { email: emailOf("sam"), uid: "staff2" }));
    await assertFails(setDoc(doc(db("owner1"), "usernames/sammy"), { email: "someone@example.org", uid: "staff1" }));
  });
  test("the audit trail: managers read it, staff don't, nobody fakes, edits or deletes it", async () => {
    await assertSucceeds(addBatch(db("mgr1"), "mgr1", ned()).commit());
    await assertSucceeds(getDocs(query(collection(db("mgr1"), "audit"), orderBy("at", "desc"), limit(50))));
    await assertFails(getDocs(collection(db("staff1"), "audit")));
    await assertFails(setDoc(doc(db("mgr1"), "audit/staff2-out"), auditEntry("remove", { ...TEAM.staff2, uid: "staff2" }, "mgr1")));
    await assertFails(setDoc(doc(db("mgr1"), "audit", autoId()), auditEntry("role", { ...TEAM.staff2, uid: "staff2" }, "mgr1")));
    await assertFails(setDoc(doc(db("owner1"), "audit/new1-in"), { ...auditEntry("add", ned(), "owner1") }));
    await assertFails(deleteDoc(doc(db("owner1"), "audit/new1-in")));
    await assertFails(setDoc(doc(db("staff1"), "audit", autoId()), auditEntry("add", ned(), "staff1")));
  });
});

// =====================================================================================
describe("tonight's tasks: statuses, with an event for every change", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const task = async (d, uid, list, item, to, o) => (await taskBatch(d, uid, list, item, to, o)).commit();
  const eventsOf = async (id) => (await getDocs(collection(db("mgr1"), "events"))).docs.filter((x) => x.id.startsWith(`t-${today()}-${id}-`))
    .map((x) => x.data()).sort((a, b) => a.v - b.v);

  test("anyone on the team starts and finishes a task, signed with their own name, and each change has its event", async () => {
    await assertSucceeds(task(db("staff1"), "staff1", "close", 10, "doing"));
    await assertSucceeds(task(db("staff1"), "staff1", "close", 10, "done"));
    const t = (await getDoc(doc(db("staff2"), "shift", today(), "tasks", "close-10"))).data();
    assert.deepEqual([t.status, t.v, t.uid, t.name], ["done", 2, "staff1", "Sam Staff"]);
    const ev = await eventsOf("close-10");
    assert.deepEqual(ev.map((e) => [e.from, e.to, e.v, e.name, e.area]), [["todo", "doing", 1, "Sam Staff", "bar"], ["doing", "done", 2, "Sam Staff", "bar"]]);
    assert.ok(ev.every((e) => e.at instanceof Timestamp), "stamped by the server's clock");
    await assertSucceeds(getDocs(query(collection(db("staff2"), "events"), where("day", "==", today()))));
  });
  test("a change without its event, or with an event that doesn't match it, is refused", async () => {
    const d = db("staff1");
    await fails(setDoc(doc(d, "shift", today(), "tasks", "open-1"), { list: "open", item: 1, status: "done", who: null, whoUid: null, note: "", v: 1, ...by("staff1") }), "no event");
    await fails(setDoc(doc(d, "events", `t-${today()}-open-1-1`), { kind: "task", day: today(), list: "open", item: 1, label: "Ice well", area: "bar", from: "todo", to: "done", who: null, note: "", v: 1, ...by("staff1") }), "an event with no change");
    for (const event of [{ from: "doing" }, { to: "doing" }, { area: "floor" }, { who: "Tia Staff" }, { note: "late" }, { label: " " }, { name: "Tia Staff" }, { uid: "staff2" },
      { at: Timestamp.now() }, { kind: "run" }, { kind: "note" }, { v: 2 }, { item: "1" }, { extra: 1 }]) {
      await fails(task(d, "staff1", "open", 1, "done", { event }), JSON.stringify(event));
    }
    await fails(task(d, "staff1", "open", 1, "done", { eventId: `t-${today()}-open-1-2` }), "event named for another version");
    await fails(task(d, "staff1", "open", 1, "done", { eventId: "anything" }), "event with a made-up name");
    assert.equal((await eventsOf("open-1")).length, 0);
  });
  test("tasks that don't match their list, item, version, name or time are refused", async () => {
    const d = db("staff1");
    for (const [why, list, item, o] of [["unknown list", "bins", 1, {}], ["item 1000", "open", 1000, {}], ["item -1", "open", -1, {}], ["id for another item", "open", 1, { task: { item: 2 }, event: { item: 2 } }],
      ["skipped version", "open", 1, { task: { v: 2 } }], ["long note", "open", 1, { note: "x".repeat(201) }], ["someone else's name", "open", 1, { task: { name: "Tia Staff" } }],
      ["someone else's uid", "open", 1, { task: { uid: "staff2" } }], ["phone's clock", "open", 1, { task: { at: Timestamp.now() } }], ["extra field", "open", 1, { task: { done: true } }]]) {
      await fails(task(d, "staff1", list, item, "done", o), why);
    }
    await fails(task(d, "staff1", "open", 1, "finished"), "unknown status");
  });
  test("the kitchen's lists work like the others, on the kitchen side, and an item's id can go up to 999", async () => {
    await assertSucceeds(task(db("staff1"), "staff1", "kopen", 3, "done"));
    await assertSucceeds(task(db("staff1"), "staff1", "kclose", 999, "done"));
    await fails(task(db("staff1"), "staff1", "kclose", 2, "done", { event: { area: "bar" } }), "a kitchen task on the bar's side");
    await fails(task(db("staff1"), "staff1", "open", 2, "done", { event: { area: "kitchen" } }), "a bar task on the kitchen's side");
    assert.deepEqual((await eventsOf("kopen-3")).map((e) => e.area), ["kitchen"]);
    await assertSucceeds((await runBatch(db("staff1"), "staff1", "kclose", "started", { required: 15 })).commit());
  });
  test("only tonight's business day (give or take a day for late syncing) can be changed", async () => {
    await assertSucceeds(task(db("staff1"), "staff1", "open", 1, "done", { day: dayFromNow(-1) }));
    for (const day of [dayFromNow(-5), dayFromNow(3), "2026-02-31", "tonight"]) await fails(task(db("staff1"), "staff1", "open", 1, "done", { day }), day);
  });
  test("blocked needs a reason, and anyone can unblock it or carry on", async () => {
    await fails(task(db("staff1"), "staff1", "fclose", 8, "blocked"), "no reason");
    await assertSucceeds(task(db("staff1"), "staff1", "fclose", 8, "blocked", { note: "Bin room locked" }));
    await assertSucceeds(task(db("staff2"), "staff2", "fclose", 8, "todo"));
    await assertSucceeds(task(db("staff2"), "staff2", "fclose", 8, "blocked", { note: "Still locked" }));
    await assertSucceeds(task(db("staff1"), "staff1", "fclose", 8, "doing"));
    await assertSucceeds(task(db("staff1"), "staff1", "fclose", 8, "done"));
    assert.deepEqual((await eventsOf("fclose-8")).map((e) => `${e.to}:${e.note}`), ["blocked:Bin room locked", "todo:", "blocked:Still locked", "doing:", "done:"]);
  });
  test("only managers mark a task not needed, with a reason, and only they bring it back", async () => {
    await fails(task(db("staff1"), "staff1", "fclose", 7, "cancelled", { note: "Not Sunday" }), "staff");
    await fails(task(db("mgr1"), "mgr1", "fclose", 7, "cancelled"), "no reason");
    await assertSucceeds(task(db("mgr1"), "mgr1", "fclose", 7, "cancelled", { note: "Cleaners did the toilets" }));
    await fails(task(db("staff1"), "staff1", "fclose", 7, "done"), "a task that isn't needed can't be done");
    await fails(task(db("staff1"), "staff1", "fclose", 7, "todo"), "staff bringing it back");
    await assertSucceeds(task(db("mgr2"), "mgr2", "fclose", 7, "todo"));
  });
  test("stopping a task: whoever started it, or a manager", async () => {
    await assertSucceeds(task(db("staff1"), "staff1", "close", 3, "doing"));
    await fails(task(db("staff2"), "staff2", "close", 3, "todo"), "someone else");
    await assertSucceeds(task(db("staff1"), "staff1", "close", 3, "todo"));
    await assertSucceeds(task(db("staff2"), "staff2", "close", 3, "doing"));
    await assertSucceeds(task(db("mgr1"), "mgr1", "close", 3, "todo"));
  });
  test("taking back a done task: a mis-tap within 5 minutes, otherwise with a reason, and never someone else's unless a manager", async () => {
    await assertSucceeds(task(db("staff1"), "staff1", "open", 4, "done"));
    await fails(task(db("staff2"), "staff2", "open", 4, "todo", { note: "Not done properly" }), "another member of staff");
    await assertSucceeds(task(db("staff1"), "staff1", "open", 4, "todo"));
    await assertSucceeds(task(db("staff1"), "staff1", "open", 4, "done"));
    await fails(task(db("mgr1"), "mgr1", "open", 4, "todo"), "a manager without a reason");
    await assertSucceeds(task(db("mgr1"), "mgr1", "open", 4, "todo", { note: "Glasses still cloudy" }));
    // Done six minutes ago.
    await seed((s) => setDoc(doc(s, "shift", today(), "tasks", "open-5"), { list: "open", item: 5, status: "done", who: null, whoUid: null, note: "", v: 1, uid: "staff1", name: "Sam Staff", at: Timestamp.fromMillis(Date.now() - 6 * 6e4) }));
    await fails(task(db("staff1"), "staff1", "open", 5, "todo"), "after 5 minutes without a reason");
    await assertSucceeds(task(db("staff1"), "staff1", "open", 5, "todo", { note: "Ticked the wrong one" }));
  });
  test("moves that make no sense are refused", async () => {
    await assertSucceeds(task(db("staff1"), "staff1", "open", 6, "done"));
    for (const to of ["done", "doing", "blocked", "cancelled", "started"]) await fails(task(db("mgr1"), "mgr1", "open", 6, to, { note: "Because" }), `done to ${to}`);
    await fails(task(db("staff1"), "staff1", "open", 7, "todo"), "not started to not started");
  });
  test("managers give a task to someone or take it off them; staff can't; a change of status keeps who it's for", async () => {
    await assertSucceeds(task(db("mgr1"), "mgr1", "close", 16, null, { give: "staff2" }));
    let t = (await getDoc(doc(db("staff2"), "shift", today(), "tasks", "close-16"))).data();
    assert.deepEqual([t.status, t.who, t.whoUid], ["todo", "Tia Staff", "staff2"]);
    await fails(task(db("staff1"), "staff1", "close", 16, null, { give: "staff1" }), "staff giving one to themselves");
    await fails(task(db("mgr1"), "mgr1", "close", 16, null, { give: "staff2" }), "to the same person again");
    await fails(task(db("mgr1"), "mgr1", "close", 16, null, { give: "ghost" }), "someone not on the team");
    await fails(task(db("mgr1"), "mgr1", "close", 16, null, { give: "staff1", task: { who: "Someone Else" }, event: { who: "Someone Else" } }), "under another name");
    await assertSucceeds(task(db("staff1"), "staff1", "close", 16, "done"));
    t = (await getDoc(doc(db("staff2"), "shift", today(), "tasks", "close-16"))).data();
    assert.deepEqual([t.status, t.who, t.name], ["done", "Tia Staff", "Sam Staff"]);
    await fails(task(db("mgr1"), "mgr1", "close", 16, null, { give: "staff1" }), "a done task");
    await assertSucceeds(task(db("mgr1"), "mgr1", "close", 17, null, { give: "staff1" }));
    await fails(task(db("staff1"), "staff1", "close", 17, "doing", { task: { who: null, whoUid: null }, event: { who: null } }), "starting it takes it off them");
    await assertSucceeds(task(db("mgr1"), "mgr1", "close", 17, null, { give: null }));
    assert.deepEqual((await eventsOf("close-17")).map((e) => [e.from, e.to, e.who]), [["todo", "todo", "Sam Staff"], ["todo", "todo", null]]);
  });
  test("a phone working from an old copy is refused, so two phones can't overwrite each other, and no second event appears", async () => {
    await assertSucceeds(task(db("staff1"), "staff1", "close", 12, "doing"));
    const [a, b] = await Promise.all([taskBatch(db("staff1"), "staff1", "close", 12, "done"), taskBatch(db("staff2"), "staff2", "close", 12, "blocked", { note: "No bags" })]);
    await assertSucceeds(a.commit());
    await fails(b.commit(), "built from the copy before");
    // The same change sent twice, as a retry would.
    const [c, again] = await Promise.all([taskBatch(db("staff1"), "staff1", "close", 12, "todo"), taskBatch(db("staff1"), "staff1", "close", 12, "todo")]);
    await assertSucceeds(c.commit());
    await fails(again.commit(), "sent twice");
    // Nor can a phone jump ahead a version to get round that.
    await fails(task(db("staff2"), "staff2", "close", 12, "doing", { task: { v: 9 }, event: { v: 9 }, eventId: `t-${today()}-close-12-9` }), "jumping a version");
    assert.deepEqual((await eventsOf("close-12")).map((e) => e.to), ["doing", "done", "todo"]);
  });
  test("nobody deletes a task, procedure or event, or edits an event, the owner included", async () => {
    await assertSucceeds(task(db("staff1"), "staff1", "open", 2, "done"));
    await assertSucceeds((await runBatch(db("staff1"), "staff1", "open", "started")).commit());
    for (const who of ["staff1", "mgr1", "owner1"]) {
      const d = db(who);
      await fails(deleteDoc(doc(d, "shift", today(), "tasks", "open-2")), `${who} deletes a task`);
      await fails(deleteDoc(doc(d, "shift", today(), "runs", "open")), `${who} deletes a procedure`);
      await fails(deleteDoc(doc(d, "events", `t-${today()}-open-2-1`)), `${who} deletes an event`);
      await fails(updateDoc(doc(d, "events", `t-${today()}-open-2-1`), { note: "Changed" }), `${who} edits an event`);
    }
  });
  test("ticks from before tasks stay readable, and nothing new is ticked or cleared", async () => {
    await seed((s) => setDoc(doc(s, "shift", "2026-10-24", "ticks", "open-1"), { list: "open", item: 1, uid: "staff1", name: "Sam Staff", at: daysAgo(1) }));
    await assertSucceeds(getDocs(collection(db("staff2"), "shift", "2026-10-24", "ticks")));
    await fails(setDoc(doc(db("staff1"), "shift", today(), "ticks", "open-2"), { list: "open", item: 2, ...by("staff1") }), "a new tick");
    await fails(deleteDoc(doc(db("mgr1"), "shift", "2026-10-24", "ticks", "open-1")), "clearing an old tick");
  });
  test("the old one-document-per-day checklist can't be written", () =>
    assertFails(setDoc(doc(db("staff1"), "shift", today()), { open: [], close: [] })));
});

describe("opening and closing procedures", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const run = async (d, uid, list, to, o) => (await runBatch(d, uid, list, to, o)).commit();
  const task = async (d, uid, list, item, to, o) => (await taskBatch(d, uid, list, item, to, o)).commit();
  const runEvents = async () => (await getDocs(collection(db("staff2"), "events"))).docs.map((x) => x.data()).filter((e) => e.kind === "run").sort((a, b) => a.v - b.v);

  test("starting is separate from finishing, and finishing with tasks left needs a manager and a reason", async () => {
    await assertSucceeds(run(db("staff1"), "staff1", "close", "started", { done: 0, required: 21 }));
    await fails(run(db("staff1"), "staff1", "close", "started", { done: 0, required: 21 }), "started twice");
    await fails(run(db("staff1"), "staff1", "close", "finished", { done: 20, required: 21, note: "Ran out of time" }), "staff with one left");
    await fails(run(db("mgr1"), "mgr1", "close", "finished", { done: 20, required: 21 }), "a manager without a reason");
    await assertSucceeds(run(db("mgr1"), "mgr1", "close", "finished", { done: 20, required: 21, note: "Fridge light fault, reported" }));
    await fails(run(db("mgr1"), "mgr1", "close", "finished", { done: 21, required: 21 }), "finished twice");
    assert.deepEqual((await runEvents()).map((e) => [e.from, e.to, e.done, e.required, e.name]), [["todo", "started", 0, 21, "Sam Staff"], ["started", "finished", 20, 21, "Mia Manager"]]);
  });
  test("anyone finishes once everything is done, and the counts must add up", async () => {
    // The phone counts done and required from tonight's tasks. The rules can't count tasks, so the tasks and their
    // events stay the record of what was done.
    await assertSucceeds(run(db("staff1"), "staff1", "open", "finished", { done: 15, required: 15 }));
    for (const [done, required] of [[16, 15], [-1, 15], [61, 61], [1.5, 15]]) await fails(run(db("staff1"), "staff1", "fset", "finished", { done, required }), `${done} of ${required}`);
    await fails(run(db("staff1"), "staff1", "fset", "finished", { done: 5, required: 5, event: { done: 4 } }), "event with other counts");
    await fails(run(db("staff1"), "staff1", "fset", "finished", { done: 5, required: 5, run: { list: "open" } }), "record for another list");
    await fails(run(db("staff1"), "staff1", "bins", "started"), "unknown list");
  });
  test("a finished procedure locks its tasks until a manager reopens it, with a reason", async () => {
    await assertSucceeds(task(db("staff1"), "staff1", "fshake", 0, "done"));
    await assertSucceeds(run(db("staff1"), "staff1", "fshake", "finished", { done: 8, required: 8 }));
    await fails(task(db("staff1"), "staff1", "fshake", 0, "todo"), "locked");
    await fails(task(db("mgr1"), "mgr1", "fshake", 1, "done"), "locked for managers too");
    await fails(run(db("staff1"), "staff1", "fshake", "started", { done: 8, required: 8, note: "Missed one" }), "staff reopening");
    await fails(run(db("mgr1"), "mgr1", "fshake", "started", { done: 8, required: 8 }), "reopening without a reason");
    await assertSucceeds(run(db("mgr1"), "mgr1", "fshake", "started", { done: 7, required: 8, note: "Drip tray not cleaned" }));
    await assertSucceeds(task(db("staff1"), "staff1", "fshake", 7, "done"));
    assert.deepEqual((await runEvents()).map((e) => `${e.from}>${e.to}`), ["todo>finished", "finished>started"]);
  });
});

describe("the lists themselves: managers change them, and every version is kept", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const ITEMS = [{ id: 0, t: "Fridges and freezers working" }, { id: 1, t: "Probe thermometer working" }, { id: 15, t: "Fryer oil changed", days: [1, 4] }];
  // A save as the app makes it, from the list as it is now: the list and its copy in the history, in one write.
  async function save(d, uid, key, { items = ITEMS, next = 16, list = {}, log = {}, logId } = {}) {
    const cur = await current(`lists/${key}`), v = (cur?.v || 0) + 1, b = writeBatch(d), x = { items, next, v, ...by(uid) };
    b.set(doc(d, "lists", key), { ...x, ...list });
    b.set(doc(d, "listlog", logId || `${key}-${v}`), { list: key, ...x, ...log });
    return b.commit();
  }
  test("a manager saves a list with its history in one write; everyone reads the list, only managers the history", async () => {
    await assertSucceeds(save(db("mgr1"), "mgr1", "kclose"));
    await assertSucceeds(save(db("owner1"), "owner1", "kclose", { items: ITEMS.slice(0, 2) }));
    const l = (await getDoc(doc(db("staff1"), "lists", "kclose"))).data();
    assert.deepEqual([l.v, l.name, l.items, l.next], [2, "Olly Owner", ITEMS.slice(0, 2), 16]);
    await assertSucceeds(getDocs(collection(db("staff1"), "lists")));
    await fails(getDocs(collection(db("staff1"), "listlog")), "staff reading the history");
    await fails(getDoc(doc(db("staff1"), "listlog", "kclose-1")), "staff reading a version");
    const h = await getDocs(query(collection(db("mgr2"), "listlog"), where("list", "==", "kclose")));
    assert.deepEqual(h.docs.map((x) => [x.id, x.data().v, x.data().name, x.data().items.length]).sort(), [["kclose-1", 1, "Mia Manager", 3], ["kclose-2", 2, "Olly Owner", 2]]);
  });
  test("staff can't change a list", () => fails(save(db("staff1"), "staff1", "close"), "staff saving"));
  test("a save without its history, or with a history that doesn't match it, is refused", async () => {
    const d = db("mgr1");
    await fails(setDoc(doc(d, "lists", "open"), { items: ITEMS, next: 16, v: 1, ...by("mgr1") }), "no history");
    await fails(setDoc(doc(d, "listlog", "open-1"), { list: "open", items: ITEMS, next: 16, v: 1, ...by("mgr1") }), "history with no list");
    for (const [why, log] of [["other items", { items: ITEMS.slice(1) }], ["other next", { next: 17 }], ["other version", { v: 2 }], ["other list", { list: "close" }],
      ["someone else's name", { name: "Max Manager" }], ["phone's clock", { at: Timestamp.now() }], ["extra field", { note: "Tidied" }]]) {
      await fails(save(d, "mgr1", "open", { log }), why);
    }
    await fails(save(d, "mgr1", "open", { logId: "open-2" }), "history named for another version");
    await assertSucceeds(save(d, "mgr1", "open"));
  });
  test("lists that don't fit are refused", async () => {
    const d = db("mgr1"), many = Array.from({ length: 61 }, (_, id) => ({ id, t: `Item ${id + 1}` }));
    for (const [why, key, o] of [["unknown list", "bins", {}], ["no items", "open", { items: [] }], ["61 items", "open", { items: many, next: 61 }], ["items not a list", "open", { items: "Fridges" }],
      ["next not a whole number", "open", { next: "16" }], ["next over 1000", "open", { next: 1001 }], ["skipped version", "open", { list: { v: 2 }, log: { v: 2 }, logId: "open-2" }],
      ["someone else's name", "open", { list: { name: "Max Manager" }, log: { name: "Max Manager" } }], ["phone's clock", "open", { list: { at: Timestamp.now() }, log: { at: Timestamp.now() } }],
      ["extra field", "open", { list: { title: "Opening" }, log: { title: "Opening" } }]]) {
      await fails(save(d, "mgr1", key, o), why);
    }
    await assertSucceeds(save(d, "mgr1", "open", { items: many.slice(0, 60), next: 60 }));
  });
  test("next never goes down, so no id is used for two items", async () => {
    await assertSucceeds(save(db("mgr1"), "mgr1", "fclose", { next: 16 }));
    await fails(save(db("mgr1"), "mgr1", "fclose", { next: 15 }), "next going down");
    await assertSucceeds(save(db("mgr1"), "mgr1", "fclose", { next: 16, items: ITEMS.slice(0, 1) }));
  });
  test("a manager saving from an old copy is refused, so two managers can't overwrite each other", async () => {
    await assertSucceeds(save(db("mgr1"), "mgr1", "close"));
    // Max is working from version 1, and Mia saves version 2 first.
    await assertSucceeds(save(db("mgr1"), "mgr1", "close", { items: ITEMS.slice(0, 2) }));
    const d = db("mgr2"), b = writeBatch(d), x = { items: ITEMS.slice(0, 1), next: 16, v: 2, ...by("mgr2") };
    b.set(doc(d, "lists", "close"), x); b.set(doc(d, "listlog", "close-2"), { list: "close", ...x });
    await fails(b.commit(), "a stale save");
    assert.deepEqual([(await current("lists/close")).name, (await current("listlog/close-2")).name], ["Mia Manager", "Mia Manager"]);
  });
  test("nobody deletes a list, or changes or deletes its history, the owner included", async () => {
    await assertSucceeds(save(db("mgr1"), "mgr1", "kopen"));
    for (const uid of ["mgr1", "owner1"]) {
      await fails(deleteDoc(doc(db(uid), "lists", "kopen")), `${uid} deleting the list`);
      await fails(deleteDoc(doc(db(uid), "listlog", "kopen-1")), `${uid} deleting a version`);
      await fails(updateDoc(doc(db(uid), "listlog", "kopen-1"), { name: "Someone Else" }), `${uid} editing a version`);
    }
  });
});

describe("date labels: managers keep the list, anyone opens, changes or bins one, and every change says who", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const act = async (uid, a, o) => (await labelBatch(db(uid), uid, a, o)).b.commit();
  const added = async (o = {}) => { const x = await labelBatch(db("mgr1"), "mgr1", "added", o); await x.b.commit(); return x.id; };
  const evs = async (id) => (await getDocs(query(collection(db("staff1"), "events"), where("ref", "==", id)))).docs.map((x) => x.data()).sort((a, b) => a.v - b.v);

  test("opened, changed and binned, each with who and when, and the dates on the label", async () => {
    const id = await added({ def: { item: "Cranberry juice", life: 4 } });
    await assertSucceeds(getDocs(collection(db("staff2"), "labels")));
    await assertSucceeds(act("staff1", "opened", { id }));
    let l = await current(`labels/${id}`);
    assert.deepEqual([l.state, l.openedOn, l.useBy, l.openedBy, l.openedUid, l.act, l.v], ["open", today(), plusDays(today(), 4), "Sam Staff", "staff1", "opened", 2]);
    await assertSucceeds(act("staff2", "changed", { id, useBy: plusDays(today(), 2) }));
    l = await current(`labels/${id}`);
    assert.deepEqual([l.openedBy, l.useBy], ["Tia Staff", plusDays(today(), 2)]);
    await assertSucceeds(act("staff1", "binned", { id }));
    l = await current(`labels/${id}`);
    assert.deepEqual([l.state, l.openedOn, l.useBy, l.openedBy, l.openedUid], ["none", null, null, null, null]);
    assert.deepEqual((await evs(id)).map((e) => [e.act, e.name, e.useBy, e.was, e.label, e.area]), [
      ["added", "Mia Manager", null, null, "Cranberry juice", "bar"], ["opened", "Sam Staff", plusDays(today(), 4), null, "Cranberry juice", "bar"],
      ["changed", "Tia Staff", plusDays(today(), 2), plusDays(today(), 4), "Cranberry juice", "bar"], ["binned", "Sam Staff", null, plusDays(today(), 2), "Cranberry juice", "bar"]]);
  });
  test("only managers add, change or remove items", async () => {
    await fails((await labelBatch(db("staff1"), "staff1", "added")).b.commit(), "staff adding");
    const id = await added();
    await fails(act("staff1", "edited", { id, def: { life: 5 } }), "staff changing its life");
    await fails(act("staff1", "removed", { id }), "staff removing it");
    await assertSucceeds(act("mgr2", "edited", { id, def: { item: "Apple juice (cloudy)", life: 5, side: "floor", on: false } }));
    const l = await current(`labels/${id}`);
    assert.deepEqual([l.item, l.life, l.side, l.on, l.name], ["Apple juice (cloudy)", 5, "floor", false, "Max Manager"]);
    await fails(act("mgr1", "edited", { id }), "a change that changes nothing");
    await assertSucceeds(act("owner1", "removed", { id }));
    assert.equal(await current(`labels/${id}`), null);
    assert.deepEqual((await evs(id)).map((e) => [e.act, e.name, e.label, e.area, e.life, e.on]), [["added", "Mia Manager", "Apple juice", "bar", 3, true],
      ["edited", "Max Manager", "Apple juice (cloudy)", "floor", 5, false], ["removed", "Olly Owner", "Apple juice (cloudy)", "floor", 5, false]]);
  });
  test("a manager's change leaves the dates alone, and nothing is removed without its event", async () => {
    const id = await added();
    await assertSucceeds(act("staff1", "opened", { id }));
    await fails(act("mgr1", "edited", { id, def: { life: 7 }, l: { useBy: plusDays(today(), 7) } }), "moving the use-by");
    await fails(act("mgr1", "edited", { id, def: { life: 7 }, l: { state: "none", openedOn: null, useBy: null, openedBy: null, openedUid: null } }), "closing it");
    await fails(act("mgr1", "edited", { id, def: { life: 7 }, l: { openedBy: "Mia Manager", openedUid: "mgr1" } }), "taking the opener's name off");
    await assertSucceeds(act("mgr1", "edited", { id, def: { life: 7 } }));
    assert.deepEqual([(await current(`labels/${id}`)).useBy, (await current(`labels/${id}`)).openedBy], [plusDays(today(), 3), "Sam Staff"]);
    await fails(deleteDoc(doc(db("mgr1"), "labels", id)), "removed with no event");
    await fails(act("mgr1", "removed", { id, event: { label: "Orange juice" } }), "an event for something else");
  });
  test("the use-by: from the day it's opened to its life at most, and opened today by whoever taps", async () => {
    const id = await added({ def: { life: 3 } });
    for (const [why, o] of [["a day past its life", { useBy: plusDays(today(), 4) }], ["before it was opened", { useBy: plusDays(today(), -1) }],
      ["opened days ago", { day: dayFromNow(-5) }], ["not a date", { useBy: "Friday" }], ["someone else's name as opener", { l: { openedBy: "Tia Staff" } }],
      ["someone else's uid as opener", { l: { openedUid: "staff2" } }], ["opened on another day than its event", { l: { openedOn: plusDays(today(), -1), useBy: plusDays(today(), 2) } }]]) {
      await fails(act("staff1", "opened", { id, ...o }), why);
    }
    await assertSucceeds(act("staff1", "opened", { id, useBy: today() }));
  });
  test("opening needs it not open; changing and binning need it open; a stale copy is refused", async () => {
    const id = await added();
    await fails(act("staff1", "changed", { id }), "changing one that isn't open");
    await fails(act("staff1", "binned", { id }), "binning one that isn't open");
    await assertSucceeds(act("staff1", "opened", { id }));
    await fails(act("staff2", "opened", { id }), "opening it twice");
    await fails(act("staff2", "changed", { id, def: { life: 30 }, useBy: plusDays(today(), 30) }), "a longer life while changing it");
    const [x, y] = await Promise.all([labelBatch(db("staff1"), "staff1", "changed", { id }), labelBatch(db("staff2"), "staff2", "binned", { id })]);
    await assertSucceeds(x.b.commit());
    await fails(y.b.commit(), "two people at once");
    await fails(act("staff1", "binned", { id, l: { v: 9 }, event: { v: 9 }, eventId: `l-${id}-9` }), "jumping a version");
    assert.equal((await current(`labels/${id}`)).openedBy, "Sam Staff");
  });
  test("every change needs its event, and the event has to match it", async () => {
    const id = await added();
    for (const [why, event] of [["another act", { act: "changed" }], ["another item", { label: "Orange juice" }], ["another side", { area: "floor" }], ["another life", { life: 5 }],
      ["another on", { on: false }], ["another use-by", { useBy: plusDays(today(), 1) }], ["another was", { was: today() }], ["a reason", { note: "Smelt off" }],
      ["an extra field", { who: "Sam Staff" }], ["another day", { day: plusDays(today(), -1) }], ["someone else's name", { name: "Tia Staff" }], ["phone's clock", { at: Timestamp.now() }]]) {
      await fails(act("staff1", "opened", { id, event }), why);
    }
    await fails(act("staff1", "opened", { id, eventId: `l-${id}-3` }), "an event for another version");
    const l = { item: "Apple juice", side: "bar", life: 3, on: true, state: "open", openedOn: today(), useBy: plusDays(today(), 3), openedBy: "Sam Staff", openedUid: "staff1", act: "opened", v: 2, ...by("staff1") };
    await fails(setDoc(doc(db("staff1"), "labels", id), l), "a label with no event");
    await fails(setDoc(doc(db("staff1"), "events", `l-${id}-2`), { kind: "label", day: today(), ref: id, label: "Apple juice", area: "bar", act: "opened", life: 3, on: true,
      useBy: plusDays(today(), 3), was: null, note: "", v: 2, ...by("staff1") }), "an event with no label");
    await assertSucceeds(act("staff1", "opened", { id }));
  });
  test("items that don't fit are refused", async () => {
    for (const [why, o] of [["no name", { def: { item: " " } }], ["a long name", { def: { item: "x".repeat(61) } }], ["unknown side", { def: { side: "cellar" } }],
      ["no life", { def: { life: 0 } }], ["over a year", { def: { life: 366 } }], ["life as text", { def: { life: "3" } }], ["part days", { def: { life: 2.5 } }],
      ["on as text", { def: { on: "yes" } }], ["extra field", { l: { note: "Top shelf" } }],
      ["already open", { l: { state: "open", openedOn: today(), useBy: plusDays(today(), 3), openedBy: "Mia Manager", openedUid: "mgr1" } }],
      ["another act", { l: { act: "opened" }, event: { act: "opened" } }], ["someone else's name", { l: { name: "Max Manager" }, event: { name: "Max Manager" } }],
      ["a made-up id", { id: "apple-juice" }]]) {
      await fails((await labelBatch(db("mgr1"), "mgr1", "added", o)).b.commit(), why);
    }
    const id = autoId();
    await fails((await labelBatch(db("mgr1"), "mgr1", "added", { id, l: { v: 2 }, event: { v: 2 }, eventId: `l-${id}-2` })).b.commit(), "starting at version 2");
    await assertSucceeds(act("mgr1", "added", { def: { item: "Philly cheese", side: "kitchen", life: 365, on: false } }));
  });
  test("nobody edits or deletes a label's history, the owner included", async () => {
    const id = await added();
    for (const uid of ["staff1", "mgr1", "owner1"]) {
      await fails(updateDoc(doc(db(uid), "events", `l-${id}-1`), { name: "Someone Else" }), `${uid} editing an event`);
      await fails(deleteDoc(doc(db(uid), "events", `l-${id}-1`)), `${uid} deleting an event`);
    }
  });
});

describe("the rota: managers draft a week and publish it; then every change says who, and staff answer for themselves", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const act = async (uid, a, o) => (await shiftBatch(db(uid), uid, a, o)).b.commit();
  const added = async (o = {}) => { const x = await shiftBatch(db("mgr1"), "mgr1", "added", o); await x.b.commit(); return x.id; };
  const live = async (o = {}) => { const id = await added(o); await act("mgr1", "published", { id, f: { pub: true } }); return id; };
  const open = { who: "", whoName: "" };
  const evs = async (id) => (await getDocs(query(collection(db("staff1"), "events"), where("ref", "==", id)))).docs.map((x) => x.data()).sort((a, b) => a.v - b.v);
  const week = (uid) => query(collection(db(uid), "shifts"), where("week", "==", mondayOf(today())), where("pub", "==", true));

  test("a draft is for managers only; publishing shows it to the team, and it can't go back", async () => {
    const id = await added();
    await fails(getDoc(doc(db("staff1"), "shifts", id)), "staff reading a draft");
    await fails(getDocs(query(collection(db("staff1"), "shifts"), where("week", "==", mondayOf(today())))), "staff asking for drafts too");
    assert.equal((await assertSucceeds(getDocs(week("staff1")))).size, 0);
    await assertSucceeds(getDoc(doc(db("mgr2"), "shifts", id)));
    await assertSucceeds(act("mgr2", "edited", { id, f: { start: "17:00" } }));
    await fails((await shiftBatch(db("staff1"), "staff1", "added")).b.commit(), "staff adding a shift");
    await fails(act("staff1", "edited", { id, f: { start: "16:00" } }), "staff changing a draft");
    await fails(act("staff1", "published", { id, f: { pub: true } }), "staff publishing");
    await fails(act("mgr1", "published", { id, f: { pub: true, start: "16:00" } }), "publishing with a change");
    await assertSucceeds(act("mgr1", "published", { id, f: { pub: true } }));
    assert.equal((await assertSucceeds(getDocs(week("staff1")))).size, 1);
    await fails(act("mgr1", "edited", { id, f: { pub: false } }), "back to a draft");
    await fails(act("mgr1", "published", { id, f: { pub: true } }), "publishing it twice");
    assert.deepEqual(await evs(id), [], "a draft and its publishing have no events");
    const gone = await added();
    await assertSucceeds(deleteDoc(doc(db("mgr1"), "shifts", gone)));
  });
  test("a whole week is copied in one write and published in another", async () => {
    const d = db("mgr1"), b = writeBatch(d), ids = [];
    for (let i = 0; i < 40; i++) { const r = doc(collection(d, "shifts")); ids.push(r.id); b.set(r, { ...SHIFT(), day: plusDays(mondayOf(today()), i % 7), act: "added", v: 1, ...by("mgr1") }); }
    await assertSucceeds(b.commit());
    const p = writeBatch(d);
    for (const id of ids) p.update(doc(d, "shifts", id), { pub: true, act: "published", v: 2, ...by("mgr1") });
    await assertSucceeds(p.commit());
    assert.equal((await getDocs(week("staff2"))).size, 40);
  });
  test("once published, every change needs its event, and the event has to match", async () => {
    const id = await live();
    await fails(act("mgr1", "edited", { id, f: { start: "17:00" }, noEvent: true }), "a change with no event");
    for (const [why, event] of [["another act", { act: "took" }], ["another day", { sday: plusDays(mondayOf(today()), 6) }], ["another start", { start: "19:00" }], ["another person", { who: "Tia Staff" }],
      ["another offer", { offer: "Tia Staff" }], ["a cover reason", { cover: "Sick" }], ["another side", { area: "floor" }], ["another label", { label: "Saturday" }], ["no was", { was: null }],
      ["another was", { was: { day: today(), start: "18:00", end: "02:00", side: "bar", who: "Sam Staff" } }], ["a note", { note: "Swapped" }], ["an extra field", { whoUid: "staff1" }],
      ["another night", { day: dayFromNow(-5) }], ["someone else's name", { name: "Max Manager" }], ["phone's clock", { at: Timestamp.now() }]]) {
      await fails(act("mgr1", "edited", { id, f: { start: "17:00" }, event }), why);
    }
    await fails(act("mgr1", "edited", { id, f: { start: "17:00" }, eventId: `w-${id}-9` }), "an event for another version");
    await assertSucceeds(act("mgr1", "edited", { id, f: { start: "17:00", who: "staff2", whoName: "Tia Staff" } }));
    await fails(deleteDoc(doc(db("mgr1"), "shifts", id)), "removed with no event");
    await fails(act("staff1", "removed", { id }), "staff removing it");
    await assertSucceeds(act("owner1", "removed", { id }));
    assert.deepEqual((await evs(id)).map((e) => [e.act, e.name, e.label, e.who, e.was?.who ?? null, e.was?.start ?? null]), [
      ["edited", "Mia Manager", `${plusDays(mondayOf(today()), 5)} 17:00-02:00`, "Tia Staff", "Sam Staff", "18:00"],
      ["removed", "Olly Owner", `${plusDays(mondayOf(today()), 5)} 17:00-02:00`, "Tia Staff", "Tia Staff", "17:00"]]);
    // A shift added to a week that's already out goes straight on, with its event.
    await fails(act("mgr1", "added", { f: { pub: true }, noEvent: true }), "added to a published week with no event");
    const late = await added({ f: { pub: true } });
    assert.deepEqual((await evs(late)).map((e) => [e.act, e.was]), [["added", null]]);
  });
  test("an open shift: anyone puts their hand up or takes it down, and a manager gives it to one of them", async () => {
    const id = await live({ f: open });
    await assertSucceeds(act("staff2", "wants", { id, f: { wants: { staff2: "Tia Staff" } } }));
    await fails(act("staff1", "wants", { id, f: { wants: { staff2: "Tia Staff", staff1: "Tia Staff" } } }), "someone else's name");
    await fails(act("staff1", "wants", { id, f: { wants: { staff1: "Sam Staff" } } }), "taking someone else's hand down");
    await fails(act("staff1", "wants", { id, f: { wants: { staff2: "Tia Staff", staff1: "Sam Staff" }, note: "Me please" } }), "changing the note too");
    await assertSucceeds(act("staff1", "wants", { id, f: { wants: { staff2: "Tia Staff", staff1: "Sam Staff" } } }));
    await assertSucceeds(act("staff2", "unwants", { id, f: { wants: { staff1: "Sam Staff" } } }));
    await fails(act("staff1", "took", { id, f: { who: "staff1", whoName: "Sam Staff", wants: {} } }), "taking it without an offer");
    await fails(act("staff1", "edited", { id, f: { who: "staff1", whoName: "Sam Staff", wants: {} } }), "giving it to themselves");
    await assertSucceeds(act("mgr1", "edited", { id, f: { who: "staff1", whoName: "Sam Staff", wants: {} } }));
    await fails(act("staff2", "wants", { id, f: { wants: { staff2: "Tia Staff" } } }), "a hand up for someone's shift");
    assert.deepEqual((await evs(id)).map((e) => [e.act, e.name, e.who]), [["wants", "Tia Staff", ""], ["wants", "Sam Staff", ""], ["unwants", "Tia Staff", ""], ["edited", "Mia Manager", "Sam Staff"]]);
  });
  test("an offer: only the person it's offered to takes it or turns it down", async () => {
    const id = await live({ f: open });
    await fails(act("mgr1", "edited", { id: await live(), f: { offer: "staff2", offerName: "Tia Staff" } }), "offering a shift someone has");
    await assertSucceeds(act("mgr1", "edited", { id, f: { offer: "staff2", offerName: "Tia Staff" } }));
    await fails(act("staff1", "took", { id, f: { who: "staff1", whoName: "Sam Staff", offer: "", offerName: "" } }), "taking someone else's offer");
    await fails(act("staff1", "declined", { id, f: { offer: "", offerName: "" } }), "turning down someone else's offer");
    await fails(act("staff2", "took", { id, f: { who: "staff2", whoName: "Sam Staff", offer: "", offerName: "" } }), "taking it under another name");
    await fails(act("staff2", "took", { id, f: { who: "staff2", whoName: "Tia Staff" } }), "taking it and leaving the offer");
    await assertSucceeds(act("staff2", "declined", { id, f: { offer: "", offerName: "" } }));
    await assertSucceeds(act("mgr2", "edited", { id, f: { offer: "staff2", offerName: "Tia Staff" } }));
    await assertSucceeds(act("staff2", "took", { id, f: { who: "staff2", whoName: "Tia Staff", offer: "", offerName: "" } }));
    assert.equal((await current(`shifts/${id}`)).who, "staff2");
    assert.deepEqual((await evs(id)).map((e) => [e.act, e.name, e.who, e.offer]), [["edited", "Mia Manager", "", "Tia Staff"], ["declined", "Tia Staff", "", ""],
      ["edited", "Max Manager", "", "Tia Staff"], ["took", "Tia Staff", "Tia Staff", ""]]);
  });
  test("cover: only for your own shift and with a reason; others put their hands up; keeping it clears them", async () => {
    const id = await live();
    await fails(act("staff2", "cover", { id, f: { cover: "Sick" } }), "someone else's shift");
    await fails(act("staff1", "cover", { id, f: { cover: " " } }), "no reason");
    await assertSucceeds(act("staff1", "cover", { id, f: { cover: "Sick" } }));
    await fails(act("staff1", "wants", { id, f: { wants: { staff1: "Sam Staff" } } }), "a hand up for their own shift");
    await assertSucceeds(act("staff2", "wants", { id, f: { wants: { staff2: "Tia Staff" } } }));
    await fails(act("staff1", "kept", { id, f: { cover: "" } }), "keeping it with hands still up");
    await assertSucceeds(act("staff1", "kept", { id, f: { cover: "", wants: {} } }));
    await assertSucceeds(act("staff1", "cover", { id, f: { cover: "Uni exam" } }));
    await assertSucceeds(act("mgr1", "edited", { id, f: { who: "staff2", whoName: "Tia Staff", cover: "" } }));
    await fails(act("staff1", "kept", { id, f: { cover: "", wants: {} } }), "keeping a shift that's been given away");
    assert.deepEqual((await evs(id)).map((e) => [e.act, e.who, e.cover]), [["cover", "Sam Staff", "Sick"], ["wants", "Sam Staff", "Sick"], ["kept", "Sam Staff", ""],
      ["cover", "Sam Staff", "Uni exam"], ["edited", "Tia Staff", ""]]);
  });
  test("two managers at once: the one working from an old copy is refused", async () => {
    const id = await live();
    const [x, y] = await Promise.all([shiftBatch(db("mgr1"), "mgr1", "edited", { id, f: { start: "17:00" } }), shiftBatch(db("mgr2"), "mgr2", "edited", { id, f: { end: "01:00" } })]);
    await assertSucceeds(x.b.commit());
    await fails(y.b.commit(), "the second");
    await fails(act("mgr1", "edited", { id, f: { end: "01:00" }, s: { v: 9 }, eventId: `w-${id}-9`, event: { v: 9 } }), "jumping a version");
  });
  test("shifts that don't fit are refused", async () => {
    const mon = mondayOf(today());
    for (const [why, f] of [["a week that isn't a Monday", { week: plusDays(mon, 1), day: plusDays(mon, 1) }], ["a day outside its week", { day: plusDays(mon, 7) }],
      ["no end", { end: "" }], ["the same start and end", { end: "18:00" }], ["25 o'clock", { start: "25:00" }], ["an unknown side", { side: "cellar" }], ["a long note", { note: "x".repeat(61) }],
      ["a name with nobody", { who: "", whoName: "Sam Staff" }], ["somebody with no name", { whoName: "" }], ["offered while someone has it", { offer: "staff2", offerName: "Tia Staff" }],
      ["cover with nobody on it", { ...open, cover: "Sick" }], ["hands up for someone's shift", { wants: { staff2: "Tia Staff" } }], ["pub as text", { pub: "yes" }],
      ["hands up as a list", { ...open, wants: ["staff2"] }], ["an extra field", { hours: 8 }]]) {
      await fails((await shiftBatch(db("mgr1"), "mgr1", "added", { f })).b.commit(), why);
    }
    await fails((await shiftBatch(db("mgr1"), "mgr1", "added", { id: "sat-bar" })).b.commit(), "a made-up id");
    await fails((await shiftBatch(db("mgr1"), "mgr1", "added", { s: { v: 2 } })).b.commit(), "starting at version 2");
    await fails((await shiftBatch(db("mgr1"), "mgr1", "added", { s: { name: "Max Manager" } })).b.commit(), "someone else's name");
    await assertSucceeds((await shiftBatch(db("mgr1"), "mgr1", "added", { f: { ...open, day: mon, start: "11:30", end: "17:00", side: "kitchen", note: "Prep" } })).b.commit());
  });
  test("nobody edits or deletes a shift's history, the owner included", async () => {
    const id = await live();
    await act("staff1", "cover", { id, f: { cover: "Sick" } });
    for (const uid of ["staff1", "mgr1", "owner1"]) {
      await fails(updateDoc(doc(db(uid), "events", `w-${id}-3`), { cover: "" }), `${uid} editing an event`);
      await fails(deleteDoc(doc(db(uid), "events", `w-${id}-3`)), `${uid} deleting an event`);
    }
  });
});

describe("restocking from the cellar", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const move = async (d, uid, id, to, o) => (await moveBatch(d, uid, id, to, o)).commit();
  const asked = async (uid = "staff1", o) => { const x = askBatch(db(uid), uid, o); await x.b.commit(); return x.id; };

  test("ask, take it on, bring it up and confirm what arrived: asked, moved and received are kept apart", async () => {
    const id = await asked("staff1", { item: "Limes", qty: 2, unit: "bag", dest: "up", detail: "For the weekend" });
    await assertSucceeds(move(db("staff2"), "staff2", id, "doing"));
    await fails(move(db("staff1"), "staff1", id, "delivered", { moved: 2 }), "not theirs to bring up");
    await fails(move(db("staff2"), "staff2", id, "delivered"), "without how much was moved");
    await assertSucceeds(move(db("staff2"), "staff2", id, "delivered", { moved: 1 }));
    await fails(move(db("staff1"), "staff1", id, "received", { got: 0 }), "nothing arrived");
    await fails(move(db("staff1"), "staff1", id, "received", { got: 1, moved: 2 }), "changing what was moved");
    await assertSucceeds(move(db("staff1"), "staff1", id, "received", { got: 1 }));
    const r = (await getDoc(doc(db("mgr1"), "restock", id))).data();
    assert.deepEqual([r.qty, r.moved, r.got, r.status, r.who, r.askedBy, r.detail], [2, 1, 1, "received", "Tia Staff", "Sam Staff", "For the weekend"]);
    const ev = (await getDocs(collection(db("mgr1"), "events"))).docs.map((x) => x.data()).sort((a, b) => a.v - b.v);
    assert.deepEqual(ev.map((e) => [e.from, e.to, e.qty, e.name, e.area]), [["new", "asked", 2, "Sam Staff", "bar"], ["asked", "doing", null, "Tia Staff", "bar"],
      ["doing", "delivered", 1, "Tia Staff", "bar"], ["delivered", "received", 1, "Sam Staff", "bar"]]);
  });
  test("the kitchen asks for things too, on the kitchen side", async () => {
    const id = await asked("staff1", { item: "Fryer oil", qty: 2, unit: "each", dest: "kitchen" });
    await fails(askBatch(db("staff1"), "staff1", { dest: "kitchen", event: { area: "floor" } }).b.commit(), "a kitchen restock on the floor's side");
    await assertSucceeds(move(db("staff2"), "staff2", id, "doing"));
    const ev = (await getDocs(collection(db("mgr1"), "events"))).docs.map((x) => x.data());
    assert.deepEqual(ev.map((e) => e.area), ["kitchen", "kitchen"]);
  });
  test("bad asks are refused", async () => {
    for (const [why, o] of [["no item", { item: " " }], ["nothing", { qty: 0 }], ["too much", { qty: 1001 }], ["amount as text", { qty: "2" }], ["unknown unit", { unit: "crate" }],
      ["unknown place", { dest: "roof" }], ["already taken", { r: { status: "doing" } }], ["someone else's name", { r: { askedBy: "Tia Staff" } }], ["phone's clock", { r: { askedAt: Timestamp.now() } }],
      ["moved already", { r: { moved: 2 } }], ["version", { r: { v: 2 } }], ["event amount", { event: { qty: 3 } }], ["event status", { event: { to: "doing" } }], ["event area", { event: { area: "floor" } }],
      ["event from", { event: { from: "asked" } }], ["event unit", { event: { unit: "box" } }], ["event place", { event: { dest: "down" } }], ["event item", { event: { label: "Lemons" } }], ["extra field", { r: { urgent: true } }], ["old night", { day: dayFromNow(-5) }], ["long detail", { detail: "x".repeat(201) }], ["a reason on asking", { r: { note: "Why" }, event: { note: "Why" } }]]) {
      await fails(askBatch(db("staff1"), "staff1", o).b.commit(), why);
    }
    const r = { item: "Limes", qty: 2, unit: "bag", dest: "up", detail: "", day: today(), status: "asked", who: null, whoUid: null, moved: null, got: null, note: "", v: 1, askedBy: "Sam Staff", askedUid: "staff1", askedAt: now(), ...by("staff1") };
    await fails(setDoc(doc(collection(db("staff1"), "restock")), r), "without its event");
    await fails(setDoc(doc(db("staff1"), "restock", "limes"), r), "a made-up id");
  });
  test("managers give it to someone, and then only that person or a manager takes it on", async () => {
    const id = await asked();
    await fails(move(db("staff1"), "staff1", id, "given", { give: "staff2" }), "staff giving it");
    await fails(move(db("mgr1"), "mgr1", id, "given", { give: "ghost" }), "someone not on the team");
    await assertSucceeds(move(db("mgr1"), "mgr1", id, "given", { give: "staff2" }));
    await fails(move(db("staff1"), "staff1", id, "doing"), "given to someone else");
    await assertSucceeds(move(db("staff2"), "staff2", id, "doing"));
    await assertSucceeds(move(db("mgr1"), "mgr1", id, "given", { give: "staff1" }));
    await assertSucceeds(move(db("mgr2"), "mgr2", id, "doing"));
  });
  test("not in the cellar, blocked with a reason, or cancelled by whoever asked (or a manager, with a reason)", async () => {
    const one = await asked();
    await assertSucceeds(move(db("staff2"), "staff2", one, "doing"));
    await fails(move(db("staff2"), "staff2", one, "blocked"), "blocked without a reason");
    await assertSucceeds(move(db("staff2"), "staff2", one, "blocked", { note: "Cellar door jammed" }));
    await assertSucceeds(move(db("staff2"), "staff2", one, "unavailable"));
    const two = await asked();
    await fails(move(db("staff2"), "staff2", two, "cancelled"), "someone else's ask");
    await fails(move(db("mgr1"), "mgr1", two, "cancelled"), "a manager without a reason");
    await assertSucceeds(move(db("staff1"), "staff1", two, "cancelled"));
    const three = await asked("staff2");
    await assertSucceeds(move(db("mgr1"), "mgr1", three, "cancelled", { note: "Asked twice" }));
  });
  test("back to waiting: let go by whoever has it, not there after all with a reason, or reopened by a manager with a reason", async () => {
    const id = await asked();
    await assertSucceeds(move(db("staff2"), "staff2", id, "doing"));
    await fails(move(db("staff1"), "staff1", id, "asked"), "letting go of someone else's");
    await assertSucceeds(move(db("staff2"), "staff2", id, "asked"));
    await assertSucceeds(move(db("staff2"), "staff2", id, "doing"));
    await assertSucceeds(move(db("staff2"), "staff2", id, "delivered", { moved: 2 }));
    await fails(move(db("staff1"), "staff1", id, "asked"), "not there after all, without a reason");
    await assertSucceeds(move(db("staff1"), "staff1", id, "asked", { note: "Not on the bar" }));
    await assertSucceeds(move(db("staff2"), "staff2", id, "doing"));
    await assertSucceeds(move(db("staff2"), "staff2", id, "delivered", { moved: 2 }));
    await assertSucceeds(move(db("staff1"), "staff1", id, "received", { got: 2 }));
    await fails(move(db("staff1"), "staff1", id, "asked", { note: "Need more" }), "staff reopening a received one");
    await assertSucceeds(move(db("mgr1"), "mgr1", id, "asked", { note: "Wrong limes" }));
  });
  test("a stale copy is refused, what was asked for never changes, and nobody deletes one", async () => {
    const id = await asked();
    const [x, y] = await Promise.all([moveBatch(db("staff1"), "staff1", id, "doing"), moveBatch(db("staff2"), "staff2", id, "doing")]);
    await assertSucceeds(x.commit());
    await fails(y.commit(), "two people taking it on at once");
    await fails(move(db("staff1"), "staff1", id, "asked", { r: { v: 5 }, event: { v: 5 }, eventId: `s-${id}-5` }), "jumping a version");
    for (const r of [{ item: "Lemons" }, { qty: 5 }, { dest: "down" }, { unit: "box" }, { detail: "Changed" }, { askedBy: "Tia Staff" }, { day: dayFromNow(-30) }]) {
      await fails(move(db("staff1"), "staff1", id, "delivered", { moved: 2, r }), JSON.stringify(r));
    }
    for (const who of ["staff1", "mgr1", "owner1"]) await fails(deleteDoc(doc(db(who), "restock", id)), `${who} deletes`);
  });
});

// =====================================================================================
describe("86 board and its history", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  test("86 then back in stock: board and log change together", async () => {
    const { b, log } = out86(db("staff1"), "staff1", "Cîroc Red Berry");
    await assertSucceeds(b.commit());
    assert.equal((await getDoc(doc(db("staff2"), "out", "c-roc-red-berry"))).data().log, log);
    await assertSucceeds(back86(db("staff2"), "staff2", "Cîroc Red Berry", log).commit());
    const logs = await getDocs(query(collection(db("mgr1"), "outlog"), orderBy("at", "desc"), limit(100)));
    assert.deepEqual(logs.docs.map((d) => d.data().action).sort(), ["back", "out"]);
  });
  test("the board can't change without its log entry, and a log entry can't be made up", async () => {
    const d = db("staff1");
    await assertFails(setDoc(doc(d, "out", "gin"), { itemName: "Gin", log: autoId(), ...by("staff1") }));
    await assertFails(setDoc(doc(d, "outlog", autoId()), { item: "gin", itemName: "Gin", action: "out", ...by("staff1") }));
    const { b, log } = out86(d, "staff1", "Gin"); await b.commit();
    await assertFails(deleteDoc(doc(d, "out", "gin")));
    await assertFails(setDoc(doc(d, "outlog", log + "-back"), { item: "gin", itemName: "Gin", action: "back", ...by("staff1") }));
  });
  test("an item can't be 86'd twice, or come back when it isn't out", async () => {
    const { b, log } = out86(db("staff1"), "staff1", "Limes"); await b.commit();
    await assertFails(out86(db("staff2"), "staff2", "Limes").b.commit());
    await back86(db("staff1"), "staff1", "Limes", log).commit();
    await assertFails(back86(db("staff2"), "staff2", "Limes", log).commit());
  });
  test("the item's record id must match its name, and the name can't be forged", async () => {
    const d = db("staff1"), b = writeBatch(d), log = doc(collection(d, "outlog"));
    b.set(doc(d, "out", "rum"), { itemName: "Gin", log: log.id, ...by("staff1") });
    b.set(log, { item: "rum", itemName: "Gin", action: "out", ...by("staff1") });
    await assertFails(b.commit());
    const b2 = writeBatch(d), log2 = doc(collection(d, "outlog"));
    b2.set(doc(d, "out", "gin"), { itemName: "Gin", log: log2.id, uid: "staff1", name: "Mia Manager", at: now() });
    b2.set(log2, { item: "gin", itemName: "Gin", action: "out", uid: "staff1", name: "Mia Manager", at: now() });
    await assertFails(b2.commit());
  });
  test("nobody, the owner included, can edit or delete the log; staff can't read it", async () => {
    const { b, log } = out86(db("staff1"), "staff1", "Mint"); await b.commit();
    for (const who of ["staff1", "mgr1", "owner1"]) {
      await assertFails(updateDoc(doc(db(who), "outlog", log), { action: "back" }));
      await assertFails(deleteDoc(doc(db(who), "outlog", log)));
    }
    await assertFails(getDocs(collection(db("staff1"), "outlog")));
    await assertSucceeds(getDocs(collection(db("staff1"), "out")));
  });
});

// =====================================================================================
describe("shift reports and photos", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  test("staff send a report; bad ones are refused", async () => {
    await assertSucceeds(addDoc(collection(db("staff1"), "reports"), report("staff1")));
    await assertSucceeds(addDoc(collection(db("staff1"), "reports"), report("staff1", { side: "floor" })));
    await assertSucceeds(addDoc(collection(db("staff1"), "reports"), report("staff1", { side: "kitchen" })));
    for (const bad of [{ side: "cellar" }, { text: "   " }, { photos: 9 }, { photos: -1 }, { photos: "2" }, { name: "Mia Manager" }, { uid: "staff2" }, { signedBy: "Sam Staff" }]) {
      await assertFails(addDoc(collection(db("staff1"), "reports"), report("staff1", bad)));
    }
    const { side, ...noSide } = report("staff1");
    await assertFails(addDoc(collection(db("staff1"), "reports"), noSide));
  });
  test("a manager signs off once, with their uid; then the report is locked", async () => {
    const ref = await addDoc(collection(db("staff1"), "reports"), report("staff1"));
    await assertFails(updateDoc(doc(db("staff2"), "reports", ref.id), { signedBy: "Tia Staff", signedByUid: "staff2", signedAt: now() }));
    await assertFails(updateDoc(doc(db("mgr1"), "reports", ref.id), { signedBy: "Mia Manager", signedAt: now() }));
    await assertSucceeds(updateDoc(doc(db("mgr1"), "reports", ref.id), { signedBy: "Mia Manager", signedByUid: "mgr1", signedAt: now() }));
    await assertFails(updateDoc(doc(db("mgr2"), "reports", ref.id), { signedBy: "Max Manager", signedByUid: "mgr2", signedAt: now() }));
    await assertFails(updateDoc(doc(db("owner1"), "reports", ref.id), { text: "Rewritten" }));
    await assertFails(updateDoc(doc(db("owner1"), "reports", ref.id), { signedBy: deleteField() }));
    for (const who of ["staff1", "mgr1", "owner1"]) await assertFails(deleteDoc(doc(db(who), "reports", ref.id)));
  });
  test("an unsigned report can't be edited or deleted either", async () => {
    const ref = await addDoc(collection(db("staff1"), "reports"), report("staff1"));
    await assertFails(updateDoc(doc(db("staff1"), "reports", ref.id), { text: "Changed my mind" }));
    await assertFails(deleteDoc(doc(db("mgr1"), "reports", ref.id)));
  });
  test("closing photos: bounded size, JPEG only, attached only in the report's own write", async () => {
    const d = db("staff1");
    await assertFails(addDoc(collection(d, "photos"), photo("staff1", { data: "data:image/png;base64,AAAA" })));
    await assertFails(addDoc(collection(d, "photos"), photo("staff1", { data: "data:image/jpeg;base64," + "A".repeat(700000) })));
    await assertFails(addDoc(collection(d, "photos"), photo("staff1", { report: "x" })));
    const p1 = await assertSucceeds(addDoc(collection(d, "photos"), photo("staff1")));
    const p2 = await assertSucceeds(addDoc(collection(d, "photos"), photo("staff1")));
    await assertSucceeds(updateDoc(doc(d, "photos", p1.id), { note: "Bar wiped down" }));
    const sent = sendReport(d, "staff1", [p1.id, p2.id]);
    await assertSucceeds(sent.b.commit());
    // After sending, nothing about the photos can change.
    await assertFails(updateDoc(doc(d, "photos", p1.id), { note: "edited later" }));
    await assertFails(updateDoc(doc(d, "photos", p1.id), { report: sent.id }));
    await assertFails(deleteDoc(doc(d, "photos", p1.id)));
  });
  test("a photo can't be attached to an older report, someone else's report, or by someone else", async () => {
    const d = db("staff1");
    const old = await addDoc(collection(d, "reports"), report("staff1"));
    const p = await addDoc(collection(d, "photos"), photo("staff1"));
    await assertFails(updateDoc(doc(d, "photos", p.id), { report: old.id }));
    const theirs = sendReport(db("staff2"), "staff2", []); await theirs.b.commit();
    await assertFails(updateDoc(doc(d, "photos", p.id), { report: theirs.id }));
    await assertFails(sendReport(db("staff2"), "staff2", [p.id]).b.commit());
  });
  test("photo privacy: others' drafts are hidden; photos on sent reports are visible to the team", async () => {
    const p = await addDoc(collection(db("staff1"), "photos"), photo("staff1"));
    await assertFails(getDoc(doc(db("staff2"), "photos", p.id)));
    await assertFails(getDocs(collection(db("staff2"), "photos")));
    await assertSucceeds(getDocs(query(collection(db("staff1"), "photos"), where("uid", "==", "staff1"), where("report", "==", null))));
    const sent = sendReport(db("staff1"), "staff1", [p.id]); await sent.b.commit();
    await assertSucceeds(getDoc(doc(db("staff2"), "photos", p.id)));
    await assertSucceeds(getDocs(query(collection(db("staff2"), "photos"), where("report", "==", sent.id))));
  });
  test("drafts can be binned by their owner; only photos over 30 days old can be cleared by managers", async () => {
    const p = await addDoc(collection(db("staff1"), "photos"), photo("staff1"));
    await assertFails(deleteDoc(doc(db("staff2"), "photos", p.id)));
    await assertFails(deleteDoc(doc(db("mgr1"), "photos", p.id)));
    await assertSucceeds(deleteDoc(doc(db("staff1"), "photos", p.id)));
    await seed((s) => setDoc(doc(s, "photos/old1"), { ...photo("staff1"), report: "abcdefghijabcdefghij", at: daysAgo(31) }));
    await assertFails(deleteDoc(doc(db("staff2"), "photos/old1")));
    await assertSucceeds(getDocs(query(collection(db("mgr1"), "photos"), where("at", "<", daysAgo(30)), limit(100))));
    await assertSucceeds(deleteDoc(doc(db("mgr1"), "photos/old1")));
  });
});

// =====================================================================================
describe("stock requests from before restocking (kept for the record)", () => {
  beforeEach(async () => {
    await env.clearFirestore(); await seedTeam();
    await seed(async (s) => { for (const id of ["r1", "r2", "r3"]) await setDoc(doc(s, "requests", id), { item: "Limes", note: "2 boxes", done: false, uid: "staff1", name: "Sam Staff", at: daysAgo(1) }); });
  });
  test("nothing new is asked for here", () =>
    assertFails(addDoc(collection(db("staff1"), "requests"), { item: "Limes", note: "", done: false, ...by("staff1") })));
  test("a manager marks an old one ordered once, with their uid", async () => {
    await assertFails(updateDoc(doc(db("staff2"), "requests", "r1"), { done: true, doneBy: "Tia Staff", doneByUid: "staff2", doneAt: now() }));
    await assertFails(updateDoc(doc(db("mgr1"), "requests", "r1"), { done: true, doneBy: "Mia Manager", doneAt: now() }));
    await assertFails(updateDoc(doc(db("mgr1"), "requests", "r1"), { done: true, doneBy: "Mia Manager", doneByUid: "mgr1", doneAt: now(), item: "Lemons" }));
    await assertSucceeds(updateDoc(doc(db("mgr1"), "requests", "r1"), { done: true, doneBy: "Mia Manager", doneByUid: "mgr1", doneAt: now() }));
    await assertFails(updateDoc(doc(db("mgr2"), "requests", "r1"), { done: true, doneBy: "Max Manager", doneByUid: "mgr2", doneAt: now() }));
    for (const who of ["staff1", "mgr1", "owner1"]) await assertFails(deleteDoc(doc(db(who), "requests", "r1")));
  });
  test("before it's ordered, the asker cancels it and a manager can turn it down; other staff can't", async () => {
    await assertFails(deleteDoc(doc(db("staff2"), "requests", "r2")));
    await assertSucceeds(deleteDoc(doc(db("staff1"), "requests", "r2")));
    await assertSucceeds(deleteDoc(doc(db("mgr1"), "requests", "r3")));
  });
});

// =====================================================================================
describe("running late, time off and swaps", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const add = (uid, a) => addDoc(collection(db(uid), "asks"), a);
  test("each kind needs its own complete, valid details", async () => {
    await assertSucceeds(add("staff1", ask("staff1", "late", { eta: "18:45" })));
    await assertSucceeds(add("staff1", ask("staff1", "off", { date1: dayFromNow(7), date2: dayFromNow(9) })));
    await assertSucceeds(add("staff1", ask("staff1", "swap", { date1: dayFromNow(3), with: "Tia" })));
    const bad = [
      ask("staff1", "late", {}), ask("staff1", "late", { eta: "" }), ask("staff1", "late", { eta: "25:00" }), ask("staff1", "late", { eta: "6pm" }),
      ask("staff1", "late", { eta: "18:45", date1: dayFromNow(1) }),
      ask("staff1", "off", { date1: dayFromNow(9), date2: dayFromNow(7) }), ask("staff1", "off", { date1: "2026-02-31", date2: "2026-03-02" }),
      ask("staff1", "off", { date1: dayFromNow(-30), date2: dayFromNow(-29) }), ask("staff1", "off", { date1: "", date2: "" }),
      ask("staff1", "off", { date1: dayFromNow(7) }),
      ask("staff1", "swap", { date1: dayFromNow(3) }), ask("staff1", "swap", { date1: dayFromNow(3), with: "   " }),
      ask("staff1", "holiday", { date1: dayFromNow(3) }),
      { ...ask("staff1", "late", { eta: "18:45" }), status: "approved" },
      { ...ask("staff1", "late", { eta: "18:45" }), name: "Tia Staff" },
    ];
    for (const a of bad) await assertFails(add("staff1", a));
  });
  test("seen isn't a dead end: it can still be approved; approved and declined are final", async () => {
    const ref = await add("staff1", ask("staff1", "off", { date1: dayFromNow(7), date2: dayFromNow(8) }));
    const decide = (uid, status) => updateDoc(doc(db(uid), "asks", ref.id), { status, by: TEAM[uid].name, byUid: uid, byAt: now() });
    await assertSucceeds(decide("mgr1", "seen"));
    await assertSucceeds(decide("mgr2", "approved"));
    await assertFails(decide("mgr1", "declined"));
    await assertFails(decide("mgr1", "pending"));
  });
  test("decisions keep the asker's details and record the manager's uid", async () => {
    const ref = await add("staff1", ask("staff1", "late", { eta: "19:00" }));
    await assertFails(updateDoc(doc(db("mgr1"), "asks", ref.id), { status: "seen", by: "Mia Manager", byAt: now() }));
    await assertFails(updateDoc(doc(db("mgr1"), "asks", ref.id), { status: "seen", by: "Mia Manager", byUid: "mgr1", byAt: now(), name: "Someone" }));
    await assertFails(updateDoc(doc(db("mgr1"), "asks", ref.id), { status: "seen", by: "Max Manager", byUid: "mgr1", byAt: now() }));
    await assertFails(updateDoc(doc(db("staff1"), "asks", ref.id), { eta: "20:00" }));
    await assertFails(updateDoc(doc(db("staff2"), "asks", ref.id), { status: "approved", by: "Tia Staff", byUid: "staff2", byAt: now() }));
    await assertSucceeds(updateDoc(doc(db("mgr1"), "asks", ref.id), { status: "seen", by: "Mia Manager", byUid: "mgr1", byAt: now() }));
  });
  test("managers can't approve their own; the owner can decide a manager's", async () => {
    const ref = await add("mgr1", ask("mgr1", "off", { date1: dayFromNow(10), date2: dayFromNow(11) }));
    await assertFails(updateDoc(doc(db("mgr1"), "asks", ref.id), { status: "approved", by: "Mia Manager", byUid: "mgr1", byAt: now() }));
    await assertSucceeds(updateDoc(doc(db("owner1"), "asks", ref.id), { status: "approved", by: "Olly Owner", byUid: "owner1", byAt: now() }));
  });
  test("staff see only their own; managers see all", async () => {
    const ref = await add("staff1", ask("staff1", "late", { eta: "19:00" }));
    await assertSucceeds(getDoc(doc(db("staff1"), "asks", ref.id)));
    await assertFails(getDoc(doc(db("staff2"), "asks", ref.id)));
    await assertFails(getDocs(collection(db("staff2"), "asks")));
    await assertSucceeds(getDocs(query(collection(db("staff2"), "asks"), where("uid", "==", "staff2"))));
    await assertSucceeds(getDocs(query(collection(db("mgr1"), "asks"), orderBy("at", "desc"), limit(100))));
  });
  test("the asker withdraws until it's decided; managers don't delete; the owner can", async () => {
    const a = await add("staff1", ask("staff1", "late", { eta: "19:00" }));
    await assertFails(deleteDoc(doc(db("mgr1"), "asks", a.id)));
    await assertSucceeds(deleteDoc(doc(db("staff1"), "asks", a.id)));
    const b = await add("staff1", ask("staff1", "swap", { date1: dayFromNow(2), with: "Tia" }));
    await updateDoc(doc(db("mgr1"), "asks", b.id), { status: "declined", by: "Mia Manager", byUid: "mgr1", byAt: now() });
    await assertFails(deleteDoc(doc(db("staff1"), "asks", b.id)));
    await assertSucceeds(deleteDoc(doc(db("owner1"), "asks", b.id)));
  });
});

// =====================================================================================
describe("incidents", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const inc = (uid, extra = {}) => ({ kind: "Guest complaint", text: "Table 12, burger sent back cold. Remade.", status: "open", ...by(uid), ...extra });
  test("anyone logs one; only managers read them", async () => {
    const ref = await assertSucceeds(addDoc(collection(db("staff1"), "incidents"), inc("staff1")));
    await assertFails(getDoc(doc(db("staff1"), "incidents", ref.id)));
    await assertFails(getDocs(collection(db("staff2"), "incidents")));
    await assertSucceeds(getDocs(query(collection(db("mgr1"), "incidents"), orderBy("at", "desc"), limit(50))));
  });
  test("bad incidents are refused", async () => {
    for (const bad of [{ text: "   " }, { kind: "" }, { status: "closed" }, { text: "x".repeat(1001) }, { guestPhone: "07..." }]) {
      await assertFails(addDoc(collection(db("staff1"), "incidents"), inc("staff1", bad)));
    }
  });
  test("a manager closes it once, saying what was done; the account itself can't be edited", async () => {
    const ref = await addDoc(collection(db("staff1"), "incidents"), inc("staff1"));
    const close = (uid, outcome, extra = {}) => updateDoc(doc(db(uid), "incidents", ref.id), { status: "closed", outcome, closedBy: TEAM[uid].name, closedByUid: uid, closedAt: now(), ...extra });
    await assertFails(close("staff2", "Sorted"));
    await assertFails(close("mgr1", "  "));
    await assertFails(close("mgr1", "Sorted", { text: "Something else" }));
    await assertSucceeds(close("mgr1", "Apologised, burger remade, no charge"));
    await assertFails(close("mgr2", "Second close"));
    await assertFails(updateDoc(doc(db("mgr1"), "incidents", ref.id), { status: "open" }));
  });
  test("only the owner deletes one", async () => {
    const ref = await addDoc(collection(db("staff1"), "incidents"), inc("staff1"));
    await assertFails(deleteDoc(doc(db("staff1"), "incidents", ref.id)));
    await assertFails(deleteDoc(doc(db("mgr1"), "incidents", ref.id)));
    await assertSucceeds(deleteDoc(doc(db("owner1"), "incidents", ref.id)));
  });
});

// =====================================================================================
describe("refusals: Challenge 25", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const rf = (uid, extra = {}) => ({ day: today(), reason: "noid", what: "2 pints of lager", note: "Looked about 17, said their ID was at home", ...by(uid), ...extra });
  test("anyone on the team logs one, and everyone on the team reads them", async () => {
    const ref = await assertSucceeds(addDoc(collection(db("staff1"), "refusals"), rf("staff1")));
    await assertSucceeds(addDoc(collection(db("mgr1"), "refusals"), rf("mgr1", { reason: "drunk", what: "", note: "" })));
    for (const uid of ["staff2", "mgr1", "owner1"]) await assertSucceeds(getDoc(doc(db(uid), "refusals", ref.id)));
    await assertSucceeds(getDocs(query(collection(db("staff2"), "refusals"), where("day", ">=", dayFromNow(-100)), limit(1000))));
    await assertFails(getDoc(doc(db("stranger"), "refusals", ref.id)));
    await assertFails(getDoc(doc(db(null), "refusals", ref.id)));
  });
  test("one without a reason we know, too long, on another day, in someone else's name or with extra fields is refused", async () => {
    for (const bad of [{ reason: "rude" }, { reason: "" }, { what: "x".repeat(81) }, { note: "x".repeat(301) }, { day: dayFromNow(-3) }, { day: dayFromNow(2) },
      { name: "Tia Staff" }, { uid: "staff2" }, { at: daysAgo(1) }, { guestName: "Jo Bloggs" }]) {
      await assertFails(addDoc(collection(db("staff1"), "refusals"), rf("staff1", bad)));
    }
    await assertFails(addDoc(collection(db("stranger"), "refusals"), rf("stranger")));
  });
  test("nobody changes one, and only the owner deletes one", async () => {
    const ref = await addDoc(collection(db("staff1"), "refusals"), rf("staff1"));
    for (const uid of ["staff1", "mgr1", "owner1"]) await assertFails(updateDoc(doc(db(uid), "refusals", ref.id), { note: "Changed" }));
    await assertFails(deleteDoc(doc(db("staff1"), "refusals", ref.id)));
    await assertFails(deleteDoc(doc(db("mgr1"), "refusals", ref.id)));
    await assertSucceeds(deleteDoc(doc(db("owner1"), "refusals", ref.id)));
  });
});

describe("certificates: licences, training and right to work dates", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const ct = (uid, extra = {}) => ({ who: "staff1", whoName: "Sam Staff", kind: "faw", label: "", done: "2026-01-10", ends: "2029-01-10", note: "St John Ambulance", ...by(uid), ...extra });
  test("managers keep everyone's; staff read only their own", async () => {
    const ref = await assertSucceeds(addDoc(collection(db("mgr1"), "certs"), ct("mgr1")));
    await assertSucceeds(setDoc(doc(db("owner1"), "certs", ref.id), ct("owner1", { note: "Refresher booked" })));
    await assertSucceeds(getDoc(doc(db("staff1"), "certs", ref.id)));
    await assertSucceeds(getDocs(query(collection(db("staff1"), "certs"), where("who", "==", "staff1"))));
    await assertFails(getDoc(doc(db("staff2"), "certs", ref.id)));
    await assertFails(getDocs(collection(db("staff2"), "certs")));
    await assertSucceeds(getDocs(query(collection(db("mgr2"), "certs"), limit(1000))));
    await assertFails(addDoc(collection(db("staff1"), "certs"), ct("staff1")));
    await assertFails(setDoc(doc(db("staff1"), "certs", ref.id), ct("staff1")));
    await assertFails(deleteDoc(doc(db("staff1"), "certs", ref.id)));
    await assertSucceeds(deleteDoc(doc(db("mgr2"), "certs", ref.id)));
  });
  test("each kind has what it needs, and nothing more", async () => {
    for (const ok of [{ kind: "plic", done: "2019-05-01", ends: "", note: "Licence number and council" }, { kind: "rtw", done: "", ends: "2027-03-31", note: "" },
      { kind: "other", label: "Cellar management", done: "", ends: "" }, { kind: "food", done: "", ends: "", note: "" }]) {
      await assertSucceeds(addDoc(collection(db("mgr1"), "certs"), ct("mgr1", ok)));
    }
    for (const bad of [{ kind: "visa" }, { kind: "other", label: "  " }, { kind: "rtw", ends: "" }, { done: "10/01/2026" }, { ends: "2029-01-10x" }, { note: "x".repeat(201) },
      { whoName: "Someone Else" }, { who: "nobody" }, { name: "Max Manager" }, { passport: "123456789" }]) {
      await assertFails(addDoc(collection(db("mgr1"), "certs"), ct("mgr1", bad)));
    }
  });
});

describe("who to call: the venue's own numbers", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const ref = (uid) => doc(db(uid), "settings", "contacts");
  const list = [{ t: "DPS", n: "Mia Manager", p: "07700 900123" }, { t: "Glass washer engineer", n: "The service company", p: "020 7946 0000" }];
  test("managers keep them, and everyone on the team reads them", async () => {
    await assertSucceeds(setDoc(ref("mgr1"), { list, ...by("mgr1") }));
    await assertSucceeds(setDoc(ref("owner1"), { list: [], ...by("owner1") }));
    for (const uid of ["staff1", "mgr2", "owner1"]) await assertSucceeds(getDoc(ref(uid)));
    await assertFails(getDoc(ref("stranger")));
    await assertFails(setDoc(ref("staff1"), { list, ...by("staff1") }));
    await assertFails(setDoc(ref("mgr1"), { list: Array(21).fill(list[0]), ...by("mgr1") }));
    await assertFails(setDoc(ref("mgr1"), { list: "DPS 07700 900123", ...by("mgr1") }));
    await assertFails(setDoc(ref("mgr1"), { list, ...by("mgr1"), extra: 1 }));
    await assertFails(setDoc(ref("mgr1"), { list, ...by("mgr1"), name: "Max Manager" }));
    await assertFails(deleteDoc(ref("mgr1")));
  });
});

// =====================================================================================
describe("availability: when each person can work", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const av = (uid, extra = {}) => ({ days: ["", "no", "18:00-23:00", "", "17:00-02:00", "", "no"], note: "Uni on Tuesdays", ...by(uid), ...extra });
  const ref = (uid, who = uid) => doc(db(uid), "avail", who);
  test("each person keeps their own; managers read everyone's, staff only their own", async () => {
    await assertSucceeds(setDoc(ref("staff1"), av("staff1")));
    await assertSucceeds(setDoc(ref("staff1"), av("staff1", { days: Array(7).fill(""), note: "" })));
    await assertSucceeds(setDoc(ref("mgr1"), av("mgr1")));
    await assertSucceeds(getDoc(ref("staff1")));
    await assertSucceeds(getDoc(ref("staff2")));
    await assertFails(getDoc(ref("staff2", "staff1")));
    await assertFails(getDocs(collection(db("staff1"), "avail")));
    for (const uid of ["mgr2", "owner1"]) { await assertSucceeds(getDoc(ref(uid, "staff1"))); await assertSucceeds(getDocs(collection(db(uid), "avail"))); }
    await assertFails(getDoc(ref("stranger", "staff1")));
    await assertFails(setDoc(ref("mgr1", "staff1"), av("mgr1")));
    await assertFails(setDoc(ref("staff2", "staff1"), av("staff1")));
    await assertFails(setDoc(ref("stranger"), av("stranger")));
    for (const uid of ["staff1", "mgr1"]) await assertFails(deleteDoc(ref(uid, "staff1")));
  });
  test("each day is any time, can't, or two times, and nothing else", async () => {
    for (const bad of [{ days: Array(6).fill("") }, { days: Array(8).fill("") }, { days: ["", "", "", "", "", "", "maybe"] }, { days: ["", "", "", "", "", "", "18:00"] },
      { days: ["", "", "", "", "", "", "24:00-02:00"] }, { days: ["", "", "", "", "", "", "18:00-23:00 "] }, { days: "no" }, { note: "x".repeat(121) },
      { name: "Tia Staff" }, { uid: "staff2" }, { at: daysAgo(1) }, { extra: 1 }]) {
      await assertFails(setDoc(ref("staff1"), av("staff1", bad)));
    }
  });
});

describe("shout-outs", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const sh = (uid, extra = {}) => ({ to: "staff2", toName: "Tia Staff", text: "Kept the bar moving on a slammed Friday", ...by(uid), ...extra });
  test("anyone thanks someone else, everyone on the team reads them, and the writer or a manager takes one down", async () => {
    const ref = await assertSucceeds(addDoc(collection(db("staff1"), "shouts"), sh("staff1")));
    await assertSucceeds(addDoc(collection(db("mgr1"), "shouts"), sh("mgr1", { to: "staff1", toName: "Sam Staff" })));
    for (const uid of ["staff2", "mgr1", "owner1"]) await assertSucceeds(getDoc(doc(db(uid), "shouts", ref.id)));
    await assertFails(getDoc(doc(db("stranger"), "shouts", ref.id)));
    for (const uid of ["staff1", "mgr1"]) await assertFails(updateDoc(doc(db(uid), "shouts", ref.id), { text: "Changed" }));
    await assertFails(deleteDoc(doc(db("staff2"), "shouts", ref.id)));
    await assertSucceeds(deleteDoc(doc(db("staff1"), "shouts", ref.id)));
    const r2 = await addDoc(collection(db("staff1"), "shouts"), sh("staff1"));
    await assertSucceeds(deleteDoc(doc(db("mgr2"), "shouts", r2.id)));
  });
  test("never to yourself, to someone on the team by their name, saying something short", async () => {
    for (const bad of [{ to: "staff1", toName: "Sam Staff" }, { toName: "Someone Else" }, { to: "nobody", toName: "Nobody" }, { text: "  " }, { text: "x".repeat(201) },
      { name: "Tia Staff" }, { uid: "staff2" }, { at: daysAgo(1) }, { extra: 1 }]) {
      await assertFails(addDoc(collection(db("staff1"), "shouts"), sh("staff1", bad)));
    }
    await assertFails(addDoc(collection(db("stranger"), "shouts"), sh("stranger")));
  });
});

describe("how was your shift", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const pu = (uid, extra = {}) => ({ day: today(), score: 4, note: "", ...by(uid), ...extra });
  const ref = (uid, who = uid, day = today()) => doc(db(uid), "pulse", `${day}-${who}`);
  test("one answer each a night, which they can change; managers read everyone's, staff their own", async () => {
    await assertSucceeds(setDoc(ref("staff1"), pu("staff1")));
    await assertSucceeds(setDoc(ref("staff1"), pu("staff1", { score: 2, note: "Two down on the bar all night" })));
    await assertSucceeds(getDoc(ref("staff1")));
    await assertSucceeds(getDoc(ref("staff2")));
    await assertFails(getDoc(ref("staff2", "staff1")));
    await assertFails(getDocs(query(collection(db("staff1"), "pulse"), where("day", ">=", dayFromNow(-14)))));
    for (const uid of ["mgr1", "owner1"]) await assertSucceeds(getDoc(ref(uid, "staff1")));
    for (const uid of ["staff1", "mgr1", "owner1"]) await assertFails(deleteDoc(ref(uid, "staff1")));
  });
  test("a whole score from 1 to 5 for a night close to today, in their own name and record", async () => {
    for (const bad of [{ score: 0 }, { score: 6 }, { score: 3.5 }, { score: "4" }, { note: "x".repeat(201) }, { name: "Tia Staff" }, { at: daysAgo(1) }, { extra: 1 }]) {
      await assertFails(setDoc(ref("staff1"), pu("staff1", bad)));
    }
    await assertFails(setDoc(ref("staff1", "staff1", dayFromNow(-3)), pu("staff1", { day: dayFromNow(-3) })));
    await assertFails(setDoc(ref("staff1", "staff2"), pu("staff1")));
    await assertFails(setDoc(ref("staff1", "staff1", dayBefore(today())), pu("staff1")));
    await assertFails(setDoc(ref("mgr1", "staff1"), pu("mgr1")));
  });
});

describe("tonight's quiz", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const qz = (uid, extra = {}) => ({ day: today(), right: "1111111000", ...by(uid), ...extra });
  const ref = (uid, who = uid, day = today()) => doc(db(uid), "quiz", `${day}-${who}`);
  const week = (uid) => getDocs(query(collection(db(uid), "quiz"), where("day", ">=", dayFromNow(-7))));
  test("one result each a night, from the first go, which nothing changes; managers read everyone's, staff their own", async () => {
    await assertSucceeds(setDoc(ref("staff1"), qz("staff1")));
    await assertFails(setDoc(ref("staff1"), qz("staff1", { right: "1111111111" })));
    await assertFails(updateDoc(ref("staff1"), { right: "1111111111" }));
    await assertSucceeds(getDoc(ref("staff1")));
    await assertSucceeds(getDoc(ref("staff2")));
    await assertFails(getDoc(ref("staff2", "staff1")));
    await assertFails(week("staff1"));
    for (const uid of ["mgr1", "owner1"]) { await assertSucceeds(getDoc(ref(uid, "staff1"))); await assertSucceeds(week(uid)); }
    for (const uid of ["staff1", "mgr1", "owner1"]) await assertFails(deleteDoc(ref(uid, "staff1")));
  });
  test("a 1 or 0 for each of the 10 questions, for a night close to today, in their own name and record", async () => {
    for (const bad of [{ right: "111111100" }, { right: "11111110001" }, { right: "111111100x" }, { right: 7 }, { right: ["1"] }, { score: 7 }, { name: "Tia Staff" }, { at: daysAgo(1) }, { extra: 1 }]) {
      await assertFails(setDoc(ref("staff1"), qz("staff1", bad)));
    }
    await assertFails(setDoc(ref("staff1", "staff1", dayFromNow(-3)), qz("staff1", { day: dayFromNow(-3) })));
    await assertFails(setDoc(ref("staff1", "staff2"), qz("staff1")));
    await assertFails(setDoc(ref("staff1", "staff1", dayBefore(today())), qz("staff1")));
    await assertFails(setDoc(ref("mgr1", "staff1"), qz("mgr1")));
    // A quiz started before 6am and finished after counts for the night it started.
    await assertSucceeds(setDoc(ref("staff1", "staff1", dayFromNow(-1)), qz("staff1", { day: dayFromNow(-1) })));
  });
});

describe("new starters", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const ob = (uid, extra = {}) => ({ who: "staff1", whoName: "Sam Staff", start: today(), done: {}, ...by(uid), ...extra });
  const ref = (uid, who = "staff1") => doc(db(uid), "onboard", who);
  const fire = "Fire safety: alarms, exits, assembly point and extinguishers";
  const tick = (uid, v) => updateDoc(ref(uid), new FieldPath("done", fire), v, "uid", uid, "name", TEAM[uid].name, "at", now());
  test("managers start one and tick things off one at a time; the new person reads their own", async () => {
    await assertSucceeds(setDoc(ref("mgr1"), ob("mgr1")));
    await assertSucceeds(tick("mgr2", { day: today(), by: "Max Manager" }));
    await assertSucceeds(tick("mgr1", deleteField()));
    await assertSucceeds(getDoc(ref("staff1")));
    await assertSucceeds(getDoc(ref("staff2", "staff2")));
    await assertFails(getDoc(ref("staff2")));
    await assertFails(getDocs(collection(db("staff1"), "onboard")));
    await assertSucceeds(getDocs(collection(db("owner1"), "onboard")));
    await assertFails(setDoc(ref("staff1"), ob("staff1")));
    await assertFails(tick("staff1", { day: today(), by: "Sam Staff" }));
    await assertFails(deleteDoc(ref("staff1")));
    await assertSucceeds(deleteDoc(ref("mgr2")));
  });
  test("it's for someone on the team, by their name, with a real first day", async () => {
    for (const bad of [{ whoName: "Someone Else" }, { who: "staff2" }, { start: "Monday" }, { done: [] }, { name: "Max Manager" }, { at: daysAgo(1) }, { extra: 1 }]) {
      await assertFails(setDoc(ref("mgr1"), ob("mgr1", bad)));
    }
    await assertFails(setDoc(ref("mgr1", "nobody"), ob("mgr1", { who: "nobody", whoName: "Nobody" })));
  });
  test("managers keep the venue's own checklist, up to 30 things, and everyone reads it", async () => {
    const ref = (uid) => doc(db(uid), "settings", "onboard");
    await assertSucceeds(setDoc(ref("mgr1"), { list: [fire, "Allergens: the allergen menu"], ...by("mgr1") }));
    await assertSucceeds(getDoc(ref("staff1")));
    for (const bad of [{ list: [] }, { list: Array(31).fill("x") }, { list: fire }, { extra: 1 }]) await assertFails(setDoc(ref("mgr1"), { list: [fire], ...by("mgr1"), ...bad }));
    await assertFails(setDoc(ref("staff1"), { list: [fire], ...by("staff1") }));
    await assertFails(deleteDoc(ref("mgr1")));
  });
});

// =====================================================================================
describe("manager reviews of reports", () => {
  let rep;
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); rep = (await addDoc(collection(db("staff1"), "reports"), report("staff1"))).id; });
  const rv = (uid, verdict, text, extra = {}) => ({ report: rep, verdict, text, ...by(uid), ...extra });
  test("thumbs up can stand alone; flags and comments must say something", async () => {
    await assertSucceeds(addDoc(collection(db("mgr1"), "reviews"), rv("mgr1", "up", "")));
    await assertSucceeds(addDoc(collection(db("mgr1"), "reviews"), rv("mgr1", "flag", "Ice well left dirty")));
    await assertSucceeds(addDoc(collection(db("mgr1"), "reviews"), rv("mgr1", "note", "Good close")));
    await assertFails(addDoc(collection(db("mgr1"), "reviews"), rv("mgr1", "flag", "")));
    await assertFails(addDoc(collection(db("mgr1"), "reviews"), rv("mgr1", "note", "   ")));
    await assertFails(addDoc(collection(db("mgr1"), "reviews"), rv("mgr1", "love", "")));
  });
  test("it must point at a report that exists", async () => {
    await assertFails(addDoc(collection(db("mgr1"), "reviews"), rv("mgr1", "up", "", { report: "abcdefghijabcdefghij" })));
    await assertFails(addDoc(collection(db("mgr1"), "reviews"), rv("mgr1", "up", "", { report: "" })));
  });
  test("staff can't review or read reviews", async () => {
    await assertFails(addDoc(collection(db("staff2"), "reviews"), rv("staff2", "up", "")));
    await assertFails(getDocs(collection(db("staff2"), "reviews")));
  });
  test("reviews can't be edited; the author or the owner can remove one", async () => {
    const r = await addDoc(collection(db("mgr1"), "reviews"), rv("mgr1", "flag", "Bins not done"));
    await assertFails(updateDoc(doc(db("mgr1"), "reviews", r.id), { text: "Edited" }));
    await assertFails(deleteDoc(doc(db("mgr2"), "reviews", r.id)));
    await assertSucceeds(deleteDoc(doc(db("mgr1"), "reviews", r.id)));
    const r2 = await addDoc(collection(db("mgr1"), "reviews"), rv("mgr1", "up", ""));
    await assertSucceeds(deleteDoc(doc(db("owner1"), "reviews", r2.id)));
  });
});

// =====================================================================================
describe("anonymous feedback between managers", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const rate = (uid, about, score, text, extra = {}) => addDoc(collection(db(uid), "ratings"), { about, aboutName: TEAM[about].name, score, text, at: now(), ...extra });
  test("a manager rates another manager or the owner, never themselves or staff", async () => {
    await assertSucceeds(rate("mgr1", "mgr2", "Excellent", ""));
    await assertSucceeds(rate("mgr1", "owner1", "Good", ""));
    await assertFails(rate("mgr1", "mgr1", "Excellent", ""));
    await assertFails(rate("mgr1", "staff1", "Good", ""));
    await assertFails(rate("staff1", "mgr1", "Good", ""));
  });
  test("Needs improvement must say why", async () => {
    await assertFails(rate("mgr1", "mgr2", "Needs improvement", ""));
    await assertFails(rate("mgr1", "mgr2", "Needs improvement", "    "));
    await assertSucceeds(rate("mgr1", "mgr2", "Needs improvement", "Left the close to the team again"));
  });
  test("it stays anonymous: no author fields allowed; repeat feedback is allowed", async () => {
    await assertFails(rate("mgr1", "mgr2", "Good", "", { uid: "mgr1" }));
    await assertFails(rate("mgr1", "mgr2", "Good", "", { name: "Mia Manager" }));
    await assertFails(rate("mgr1", "mgr2", "Great", ""));
    await assertFails(rate("mgr1", "mgr2", "Good", "", { aboutName: "Someone Else" }));
    await assertSucceeds(rate("mgr1", "mgr2", "Good", ""));
    await assertSucceeds(rate("mgr1", "mgr2", "Good", ""));
  });
  test("the owner reads all; a manager reads only feedback about them", async () => {
    await rate("mgr1", "mgr2", "Efficient", "");
    await assertSucceeds(getDocs(query(collection(db("owner1"), "ratings"), orderBy("at", "desc"), limit(100))));
    await assertSucceeds(getDocs(query(collection(db("mgr2"), "ratings"), where("about", "==", "mgr2"))));
    await assertFails(getDocs(collection(db("mgr1"), "ratings")));
    await assertFails(getDocs(query(collection(db("mgr1"), "ratings"), where("about", "==", "mgr2"))));
    await assertFails(getDocs(query(collection(db("staff1"), "ratings"), where("about", "==", "staff1"))));
  });
  test("only the owner deletes feedback; nobody edits it", async () => {
    const r = await rate("mgr1", "mgr2", "Good", "");
    await assertFails(updateDoc(doc(db("owner1"), "ratings", r.id), { score: "Excellent" }));
    await assertFails(deleteDoc(doc(db("mgr2"), "ratings", r.id)));
    await assertSucceeds(deleteDoc(doc(db("owner1"), "ratings", r.id)));
  });
});

// =====================================================================================
describe("team board and notices", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  // Posts from before the board closed, written past the rules.
  const post = async (uid) => { let id; await seed(async (s) => { id = (await addDoc(collection(s, "feed"), { kind: "comment", text: "Guinness line down", uid, name: TEAM[uid].name, at: Timestamp.now() })).id; }); return { id }; };
  const notice = (uid, extra = {}) => addDoc(collection(db(uid), "notices"), { text: "Tasting at 4", side: "all", managers: true, ...by(uid), ...extra });
  test("the board is closed: nobody posts, the owner included, and old posts are still readable", async () => {
    for (const uid of ["staff1", "mgr1", "owner1"]) await fails(addDoc(collection(db(uid), "feed"), { kind: "comment", text: "Limes low", ...by(uid) }), `${uid} posting`);
    await post("staff1");
    await assertSucceeds(getDocs(query(collection(db("staff2"), "feed"), orderBy("at", "desc"), limit(40))));
  });
  test("who can take a post down", async () => {
    const s = await post("staff1"), o = await post("owner1"), m = await post("mgr2");
    await assertFails(deleteDoc(doc(db("staff2"), "feed", s.id)));
    await assertSucceeds(deleteDoc(doc(db("mgr1"), "feed", s.id)));
    await assertFails(deleteDoc(doc(db("mgr1"), "feed", o.id)));
    await assertSucceeds(deleteDoc(doc(db("owner1"), "feed", m.id)));
    await assertSucceeds(deleteDoc(doc(db("owner1"), "feed", o.id)));
    await assertFails(updateDoc(doc(db("mgr1"), "feed", (await post("mgr1")).id), { text: "edited" }));
  });
  test("notices: managers pin them; staff can't; managers can't remove the owner's", async () => {
    await assertFails(notice("staff1"));
    const m = await assertSucceeds(notice("mgr1")), o = await assertSucceeds(notice("owner1"));
    await assertFails(updateDoc(doc(db("mgr1"), "notices", m.id), { text: "edited" }));
    await assertFails(deleteDoc(doc(db("staff1"), "notices", m.id)));
    await assertFails(deleteDoc(doc(db("mgr2"), "notices", o.id)));
    await assertSucceeds(deleteDoc(doc(db("mgr2"), "notices", m.id)));
    await assertSucceeds(deleteDoc(doc(db("owner1"), "notices", o.id)));
  });
  test("broadcasts go to everyone, the bar, the floor or the kitchen; only the owner can leave managers out", async () => {
    await assertSucceeds(notice("mgr1", { side: "bar" }));
    await assertSucceeds(notice("mgr1", { side: "floor" }));
    await assertSucceeds(notice("mgr1", { side: "kitchen" }));
    await assertFails(notice("mgr1", { side: "cellar" }));
    await assertFails(notice("mgr1", { managers: "no" }));
    await assertFails(addDoc(collection(db("mgr1"), "notices"), { text: "No audience", ...by("mgr1") }));
    await assertFails(notice("mgr1", { managers: false }));
    const hidden = await assertSucceeds(notice("owner1", { managers: false }));
    await assertFails(getDoc(doc(db("mgr1"), "notices", hidden.id)));
    await assertSucceeds(getDoc(doc(db("staff1"), "notices", hidden.id)));
    await assertSucceeds(getDoc(doc(db("owner1"), "notices", hidden.id)));
    await assertFails(getDocs(collection(db("mgr1"), "notices")), "a manager can't list them all");
    const mine = await getDocs(query(collection(db("mgr1"), "notices"), where("managers", "==", true)));
    assert.equal(mine.size, 3);
    await assertFails(deleteDoc(doc(db("mgr1"), "notices", hidden.id)));
    // One from before audiences existed has no managers field: staff and the owner still read it.
    await seed((s) => setDoc(doc(s, "notices/old"), { text: "Old notice", ...by("owner1") }));
    await assertSucceeds(getDoc(doc(db("staff1"), "notices/old")));
    await assertSucceeds(getDoc(doc(db("owner1"), "notices/old")));
    await assertFails(getDoc(doc(db("mgr1"), "notices/old")));
  });
  test("Got it: your own record, for a broadcast that exists, carrying its managers setting", async () => {
    const open = await notice("mgr1"), hidden = await notice("owner1", { managers: false });
    const seen = (uid, id, extra = {}) => setDoc(doc(db(uid), "seen", id), { notice: open.id, managers: true, ...by(uid), ...extra });
    await assertSucceeds(seen("staff1", `${open.id}-staff1`));
    await assertFails(seen("staff1", `${open.id}-staff2`), "the record's name is the broadcast and the reader");
    await assertFails(seen("staff2", `${open.id}-staff2`, { uid: "staff1", name: "Sam Staff" }));
    await assertFails(seen("staff2", "nope-staff2", { notice: "nope" }), "no such broadcast");
    await assertFails(seen("staff2", `${hidden.id}-staff2`, { notice: hidden.id }), "must say managers were left out");
    await assertSucceeds(seen("staff2", `${hidden.id}-staff2`, { notice: hidden.id, managers: false }));
    await assertSucceeds(seen("mgr2", `${open.id}-mgr2`));
    await assertFails(updateDoc(doc(db("staff1"), "seen", `${open.id}-staff1`), { at: now() }));
    await assertFails(deleteDoc(doc(db("staff1"), "seen", `${open.id}-staff1`)));
    // Staff read only their own; managers what they weren't left out of; the owner everything.
    await assertSucceeds(getDocs(query(collection(db("staff2"), "seen"), where("uid", "==", "staff2"))));
    await assertFails(getDocs(collection(db("staff2"), "seen")));
    await assertFails(getDoc(doc(db("staff2"), "seen", `${open.id}-staff1`)));
    const m = await getDocs(query(collection(db("mgr1"), "seen"), where("managers", "==", true), where("notice", "in", [open.id])));
    assert.equal(m.size, 2);
    await assertFails(getDoc(doc(db("mgr1"), "seen", `${hidden.id}-staff2`)));
    await assertFails(getDocs(query(collection(db("mgr1"), "seen"), where("notice", "in", [open.id, hidden.id]))));
    const o = await getDocs(query(collection(db("owner1"), "seen"), where("notice", "in", [open.id, hidden.id])));
    assert.equal(o.size, 3);
  });
});

// =====================================================================================
describe("issues and handover", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const raise = (uid, extra) => addDoc(collection(db(uid), "issues"), issue(uid, extra));
  const take = (actor, id, whoUid) => updateDoc(doc(db(actor), "issues", id), { status: "taken", who: TEAM[whoUid].name, whoUid, setBy: TEAM[actor].name, setByUid: actor, setAt: now() });
  const fix = (actor, id, note, extra = {}) => updateDoc(doc(db(actor), "issues", id), { status: "fixed", fix: note, fixedBy: TEAM[actor].name, fixedByUid: actor, fixedAt: now(), ...extra });
  test("anyone raises one; bad ones are refused", async () => {
    await assertSucceeds(raise("staff1"));
    for (const bad of [{ title: "  " }, { area: "roof" }, { urgent: "yes" }, { status: "fixed" }, { again: "nope" }, { photo: "x" }]) await assertFails(raise("staff1", bad));
  });
  test("take it on yourself; only managers give it to someone else", async () => {
    const i = await raise("staff1");
    await assertFails(take("staff2", i.id, "staff1"));
    await assertSucceeds(take("staff2", i.id, "staff2"));
    await assertSucceeds(take("mgr1", i.id, "staff1"));
    await assertFails(updateDoc(doc(db("mgr1"), "issues", i.id), { status: "taken", who: "Nobody Real", whoUid: "staff1", setBy: "Mia Manager", setByUid: "mgr1", setAt: now() }));
  });
  test("fixed needs a note, is final, and the issue itself can't be rewritten", async () => {
    const i = await raise("staff1");
    await assertFails(fix("staff2", i.id, "   "));
    await assertFails(fix("staff2", i.id, "Tightened the hose", { title: "Something else" }));
    await assertFails(updateDoc(doc(db("staff1"), "issues", i.id), { title: "Renamed" }));
    await assertSucceeds(fix("staff2", i.id, "Tightened the hose"));
    await assertFails(take("staff1", i.id, "staff1"));
    await assertFails(updateDoc(doc(db("mgr1"), "issues", i.id), { status: "open" }));
  });
  test("'still broken' raises a new issue that links back", async () => {
    const i = await raise("staff1"); await fix("staff2", i.id, "Tightened the hose");
    await assertSucceeds(raise("staff1", { again: i.id }));
    await assertFails(raise("staff1", { again: "abcdefghijabcdefghij" }));
  });
  test("the raiser withdraws it only while nobody has taken it on", async () => {
    const i = await raise("staff1");
    await assertFails(deleteDoc(doc(db("staff2"), "issues", i.id)));
    await assertSucceeds(deleteDoc(doc(db("staff1"), "issues", i.id)));
    const j = await raise("staff1"); await take("staff2", j.id, "staff2");
    await assertFails(deleteDoc(doc(db("staff1"), "issues", j.id)));
    await assertFails(deleteDoc(doc(db("mgr1"), "issues", j.id)));
    await assertSucceeds(deleteDoc(doc(db("owner1"), "issues", j.id)));
  });
});

// =====================================================================================
describe("old records: waste, temperatures, line cleans and stock counts", () => {
  // Read-only since 25 October 2026: Alert65 and Nory took them over. What was saved before stays as the record.
  const at = Timestamp.fromMillis(Date.now() - 3 * 864e5);
  const waste = (uid) => ({ item: "Guinness", qty: 2, unit: "pint", reason: "spilt", note: "", side: "bar", day: dayFromNow(-3), uid, name: TEAM[uid].name, at });
  const kit = { name: "Back bar fridge", kind: "fridge", side: "bar" };
  const reading = { kit: "fridge1", kitName: "Back bar fridge", kind: "fridge", side: "bar", c: 3.5, note: "", day: dayFromNow(-3), uid: "staff1", name: "Sam Staff", at };
  const count = { lines: [{ item: "Tanqueray", group: "Gin", par: 6, n: 2 }], note: "", uid: "mgr1", name: "Mia Manager", at };
  beforeEach(async () => {
    await env.clearFirestore(); await seedTeam();
    await seed(async (s) => {
      await setDoc(doc(s, "waste/w1"), waste("staff1")); await setDoc(doc(s, "waste/w2"), waste("staff2"));
      await setDoc(doc(s, "kit/fridge1"), kit); await setDoc(doc(s, "safety/r1"), reading);
      await setDoc(doc(s, "pars/tanqueray"), { item: "Tanqueray", par: 6, uid: "mgr1", name: "Mia Manager", at });
      await setDoc(doc(s, "counts/c1"), count);
    });
  });
  test("managers read all of it for the downloads; staff read their own waste and the safety log", async () => {
    for (const c of ["waste", "safety", "counts"]) assert.equal((await getDocs(query(collection(db("mgr1"), c), orderBy("at", "desc")))).size, c === "waste" ? 2 : 1, c);
    await assertSucceeds(getDocs(collection(db("owner1"), "pars")));
    await assertSucceeds(getDoc(doc(db("staff1"), "waste/w1")));
    await assertFails(getDoc(doc(db("staff1"), "waste/w2")));
    await assertSucceeds(getDocs(collection(db("staff1"), "safety")));
    await assertSucceeds(getDocs(collection(db("staff1"), "kit")));
    await assertFails(getDocs(collection(db("staff1"), "counts")));
    await assertFails(getDocs(collection(db("staff1"), "pars")));
  });
  test("nobody, the owner included, adds, edits or deletes any of it", async () => {
    for (const uid of ["owner1", "mgr1", "staff1"]) {
      const d = db(uid), mine = { uid, name: TEAM[uid].name, at: now() };
      await assertFails(addDoc(collection(d, "waste"), { ...waste(uid), day: today(), ...mine }), uid);
      await assertFails(addDoc(collection(d, "kit"), kit), uid);
      await assertFails(addDoc(collection(d, "safety"), { ...reading, day: today(), ...mine }), uid);
      await assertFails(setDoc(doc(d, "pars", "limes"), { item: "Limes", par: 40, ...mine }), uid);
      await assertFails(addDoc(collection(d, "counts"), { ...count, ...mine }), uid);
      await assertFails(updateDoc(doc(d, "waste/w1"), { qty: 1 }), uid);
      await assertFails(updateDoc(doc(d, "safety/r1"), { c: 4 }), uid);
      await assertFails(updateDoc(doc(d, "pars/tanqueray"), { par: 8 }), uid);
      for (const p of ["waste/w1", "kit/fridge1", "safety/r1", "pars/tanqueray", "counts/c1"]) await assertFails(deleteDoc(doc(d, p)), `${uid} ${p}`);
    }
  });
});

// =====================================================================================
describe("training sign-off", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const sign = (uid, trainee, drinkName, extra = {}, id = `${trainee}-${slug(drinkName)}`) =>
    setDoc(doc(db(uid), "training", id), { trainee, traineeName: TEAM[trainee]?.name ?? "Nobody", drinkName, ...by(uid), ...extra });
  test("a manager signs someone else off on a drink, once", async () => {
    await assertSucceeds(sign("mgr1", "staff1", "London Cosmo"));
    await assertSucceeds(sign("owner1", "mgr2", "Negroni"));
    await assertFails(sign("mgr2", "staff1", "London Cosmo"), "already signed off: no second record");
    await assertFails(sign("mgr1", "staff1", "Negroni", {}, "staff1-something-else"), "the record is named after the person and the drink");
    await assertFails(sign("mgr1", "staff1", "Negroni", { traineeName: "Tia Staff" }));
    await assertFails(sign("mgr1", "mgr1", "Negroni"), "nobody signs themselves off");
    await assertFails(sign("mgr1", "ghost", "Negroni"), "only people on the team");
    await assertFails(sign("staff2", "staff1", "Negroni"));
    await assertFails(sign("mgr1", "staff1", "Negroni", { name: "Olly Owner" }));
    await assertFails(sign("mgr1", "staff1", "Negroni", { score: 10 }));
  });
  test("staff see their own; managers see everyone's and can take one back", async () => {
    await sign("mgr1", "staff1", "London Cosmo"); await sign("mgr1", "staff2", "Negroni");
    const mine = await getDocs(query(collection(db("staff1"), "training"), where("trainee", "==", "staff1")));
    assert.equal(mine.size, 1);
    await assertFails(getDocs(collection(db("staff1"), "training")));
    await assertFails(getDoc(doc(db("staff1"), "training", "staff2-negroni")));
    assert.equal((await getDocs(collection(db("mgr2"), "training"))).size, 2);
    await assertFails(updateDoc(doc(db("mgr1"), "training", "staff1-london-cosmo"), { drinkName: "Negroni" }));
    await assertFails(deleteDoc(doc(db("staff1"), "training", "staff1-london-cosmo")));
    await assertSucceeds(deleteDoc(doc(db("mgr2"), "training", "staff1-london-cosmo")));
  });
});

// =====================================================================================
describe("concerns", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const named = (uid, extra = {}) => ({ reason: "cleaning", area: "toilets", note: "", to: "managers", anon: false, status: "open", ...by(uid), ...extra });
  const anon = (extra = {}) => ({ reason: "unkempt", area: "terrace", note: "", to: "all", anon: true, status: "open", at: now(), ...extra });
  // The concern and its photos in one write, as the app sends them.
  function send(d, c, n = 0, photo = {}) {
    const b = writeBatch(d), ref = doc(collection(d, "concerns"));
    b.set(ref, { photos: n, ...c });
    for (let i = 0; i < n; i++) b.set(doc(d, "concernPhotos", `${ref.id}-${i}`), { concern: ref.id, n: i, to: c.to, data: JPEG, at: now(), ...photo });
    return { b, id: ref.id };
  }
  const sent = async (d, c, n) => { const x = send(d, c, n); await assertSucceeds(x.b.commit()); return x.id; };
  const close = (uid, id, extra = {}) => updateDoc(doc(db(uid), "concerns", id), { status: "closed", fix: "Cleaned", fixedBy: TEAM[uid].name, fixedByUid: uid, fixedAt: now(), ...extra });

  test("anyone on the team reports one, named or anonymous; bad ones are refused", async () => {
    await sent(db("staff1"), named("staff1"));
    await sent(db("staff1"), anon(), 3);
    await sent(db("staff2"), named("staff2", { reason: "other", note: "Bins by the back door", to: "floor" }));
    for (const bad of [{ reason: "rude" }, { area: "office" }, { reason: "other" }, { note: "x".repeat(301) }, { to: "kitchen" }, { photos: "1" },
      { status: "closed" }, { anon: "no" }, { uid: "staff2" }, { name: "Olly Owner" }, { extra: 1 }]) {
      await assertFails(send(db("staff1"), named("staff1", bad)).b.commit(), JSON.stringify(bad));
    }
    for (const bad of [{ uid: "staff1" }, { name: "Sam Staff" }, { anon: false }]) await assertFails(send(db("staff1"), anon(bad)).b.commit(), JSON.stringify(bad));
    await assertFails(send(db("staff1"), anon(), 4).b.commit(), "four photos");
    await assertFails(send(db("stranger"), anon()).b.commit(), "not on the team");
  });

  test("managers only concerns and their photos stay with managers; the team sees the rest", async () => {
    const mine = await sent(db("staff1"), named("staff1"), 1), secret = await sent(db("staff2"), anon({ to: "managers" }), 1), team = await sent(db("staff2"), anon(), 1);
    await assertSucceeds(getDoc(doc(db("staff1"), "concerns", mine)));
    await assertFails(getDoc(doc(db("staff2"), "concerns", mine)));
    await assertFails(getDoc(doc(db("staff2"), "concernPhotos", mine + "-0")));
    await assertFails(getDoc(doc(db("staff2"), "concerns", secret)), "not even the anonymous sender");
    await assertFails(getDoc(doc(db("staff1"), "concernPhotos", secret + "-0")));
    await assertSucceeds(getDoc(doc(db("staff1"), "concerns", team)));
    await assertSucceeds(getDoc(doc(db("staff1"), "concernPhotos", team + "-0")));
    for (const id of [mine, secret, team]) {
      await assertSucceeds(getDoc(doc(db("mgr1"), "concerns", id)));
      await assertSucceeds(getDoc(doc(db("mgr1"), "concernPhotos", id + "-0")));
    }
    assert.ok(!("uid" in (await getDoc(doc(db("owner1"), "concerns", secret))).data()), "no trace of who sent it");
    await assertFails(getDocs(collection(db("staff1"), "concerns")));
    const open = await getDocs(query(collection(db("staff1"), "concerns"), where("to", "in", ["all", "bar", "floor"]), where("status", "==", "open")));
    assert.deepEqual(open.docs.map((x) => x.id), [team]);
    assert.equal((await getDocs(query(collection(db("staff1"), "concerns"), where("uid", "==", "staff1")))).size, 1);
    assert.equal((await getDocs(collection(db("mgr1"), "concerns"))).size, 3);
  });

  test("photos only go in with a new concern, numbered, with its audience", async () => {
    await assertFails(send(db("staff1"), named("staff1"), 1, { to: "all" }).b.commit(), "audience differs");
    await assertFails(send(db("staff1"), named("staff1"), 1, { data: "data:image/png;base64,AAAA" }).b.commit(), "not a JPEG");
    await assertFails(send(db("staff1"), named("staff1"), 1, { data: "data:image/jpeg;base64," + "A".repeat(700000) }).b.commit(), "too big");
    await assertFails(send(db("staff1"), named("staff1"), 1, { uid: "staff1" }).b.commit(), "photos carry no uid");
    const d = db("staff1"), one = send(d, named("staff1"), 1);
    one.b.set(doc(d, "concernPhotos", `${one.id}-1`), { concern: one.id, n: 1, to: "managers", data: JPEG, at: now() });
    await assertFails(one.b.commit(), "more photos than the concern says");
    const id = await sent(d, named("staff1"), 1);
    await assertFails(setDoc(doc(d, "concernPhotos", `${id}-1`), { concern: id, n: 1, to: "managers", data: JPEG, at: now() }), "added later");
    await assertFails(setDoc(doc(d, "concernPhotos", `${id}-0`), { concern: id, n: 0, to: "managers", data: JPEG, at: now() }), "replaced later");
  });

  test("dealt with once; managers take any down; senders withdraw their own while it's open", async () => {
    const team = await sent(db("staff1"), named("staff1", { to: "bar" })), secret = await sent(db("staff1"), anon({ to: "managers" })), mine = await sent(db("staff1"), named("staff1"), 2);
    await assertFails(close("staff2", team, { fixedBy: "Olly Owner" }));
    await assertFails(close("staff2", team, { note: "edited" }));
    await assertSucceeds(close("staff2", team, { fix: "" }));
    await assertFails(close("mgr1", team), "only once");
    await assertFails(close("staff2", secret));
    await assertSucceeds(close("mgr1", secret));
    await assertFails(deleteDoc(doc(db("staff1"), "concerns", secret)), "anonymous: nobody can prove it's theirs");
    await assertFails(deleteDoc(doc(db("staff2"), "concerns", mine)));
    const d = db("staff1"), withdraw = writeBatch(d);
    withdraw.delete(doc(d, "concerns", mine));
    [0, 1].forEach((n) => withdraw.delete(doc(d, "concernPhotos", `${mine}-${n}`)));
    await assertSucceeds(withdraw.commit());
    await assertFails(deleteDoc(doc(db("staff1"), "concerns", team)), "dealt with: stays on record");
    await assertSucceeds(deleteDoc(doc(db("mgr1"), "concerns", team)));
    await assertSucceeds(deleteDoc(doc(db("mgr1"), "concerns", secret)));
    const kept = await sent(db("staff2"), anon(), 1);
    await assertFails(deleteDoc(doc(db("staff1"), "concernPhotos", `${kept}-0`)), "its concern is still there");
    await seed((s) => setDoc(doc(s, "concernPhotos/old-0"), { concern: kept, n: 0, to: "all", data: JPEG, at: daysAgo(31) }));
    await assertFails(deleteDoc(doc(db("staff1"), "concernPhotos/old-0")));
    await assertSucceeds(deleteDoc(doc(db("mgr1"), "concernPhotos/old-0")));
    await assertSucceeds(deleteDoc(doc(db("mgr1"), "concernPhotos/cleared-0")), "taking down an old concern names photos already cleared");
  });
});

// =====================================================================================
describe("football on the screens", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const game = (uid, extra = {}) => ({ day: today(), ko: "20:00", home: "Arsenal", away: "PSG", comp: "Champions League", channel: "TNT Sports 1", screen: "All screens", ...by(uid), ...extra });
  test("managers add and take down games; everyone on the team reads them", async () => {
    const ref = doc(collection(db("mgr1"), "fixtures"));
    await assertSucceeds(setDoc(ref, game("mgr1")));
    await assertSucceeds(addDoc(collection(db("owner1"), "fixtures"), game("owner1", { day: dayFromNow(30), comp: "", channel: "", screen: "" })));
    await assertSucceeds(getDocs(collection(db("staff1"), "fixtures")));
    await fails(getDocs(collection(db("stranger"), "fixtures")), "someone not on the team reading them");
    await fails(addDoc(collection(db("staff1"), "fixtures"), game("staff1")), "staff adding a game");
    await fails(deleteDoc(doc(db("staff1"), "fixtures", ref.id)), "staff taking one down");
    await fails(updateDoc(doc(db("mgr1"), "fixtures", ref.id), { ko: "19:45" }), "editing in place");
    await assertSucceeds(deleteDoc(doc(db("mgr1"), "fixtures", ref.id)));
  });
  test("a game must be a real day, a real time and two teams, signed by whoever adds it", async () => {
    const add = (extra) => addDoc(collection(db("mgr1"), "fixtures"), game("mgr1", extra));
    await fails(add({ ko: "25:00" }), "a time that doesn't exist");
    await fails(add({ day: "2026-02-31" }), "a day that doesn't exist");
    await fails(add({ day: dayFromNow(-5) }), "a game days ago");
    await fails(add({ day: dayFromNow(120) }), "a game months away");
    await fails(add({ home: " " }), "no home team");
    await fails(add({ away: "x".repeat(41) }), "a team name too long");
    await fails(add({ name: "Max Manager" }), "someone else's name");
    await fails(add({ extra: true }), "extra fields");
  });
});

describe("team chat", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const chat = (uid, kind, members = [], extra = {}) => ({ kind, title: "", members, by: uid, at: now(), lastId: "", lastText: "", lastName: "", lastUid: "", lastAt: now(), lastPings: [], read: {}, ...extra });
  const dmId = (a, b) => [a, b].sort().join("-");
  const makeDm = (uid, other) => setDoc(doc(db(uid), "chats", dmId(uid, other)), chat(uid, "dm", [uid, other].sort()));
  async function makeGroup(uid, members, title = "Floor team") {
    const id = autoId();
    await assertSucceeds(setDoc(doc(db(uid), "chats", id), chat(uid, "group", members, { title })));
    return id;
  }
  // A message, its chat's preview, its photo and its pings in one write, as the app sends them.
  function send(d, uid, chatId, { text = "Can someone grab limes?", photo = false, mentions = [], pings = mentions, skip = [], msg = {}, last = {}, pic = {}, ping = {} } = {}) {
    const b = writeBatch(d), m = doc(collection(d, "chats", chatId, "msgs"));
    if (!skip.includes("msg")) b.set(m, { text, photo, mentions, ...by(uid), ...msg });
    if (!skip.includes("last")) b.update(doc(d, "chats", chatId), { lastId: m.id, lastText: text || "Photo", lastName: TEAM[uid].name, lastUid: uid, lastAt: now(), lastPings: mentions, [`read.${uid}`]: now(), ...last });
    if (photo && !skip.includes("photo")) b.set(doc(d, "chatPhotos", `${chatId}-${m.id}`), { chat: chatId, msg: m.id, day: today(), data: JPEG, ...by(uid), ...pic });
    for (const to of pings) b.set(doc(d, "pings", `${to}-${chatId}`), { to, chat: chatId, msg: m.id, text, ...by(uid), ...ping });
    return { b, id: m.id };
  }
  const sent = async (d, uid, chatId, o) => { const x = send(d, uid, chatId, o); await assertSucceeds(x.b.commit()); return x.id; };
  const msgs = (uid, chatId) => getDocs(query(collection(db(uid), "chats", chatId, "msgs"), orderBy("at", "desc"), limit(60)));

  test("the directory: everyone keeps their own entry, managers keep everyone's, and it always matches the staff record", async () => {
    await assertSucceeds(setDoc(doc(db("staff1"), "directory", "staff1"), { name: "Sam Staff", role: "staff" }));
    await fails(setDoc(doc(db("staff1"), "directory", "staff2"), { name: "Tia Staff", role: "staff" }), "staff writing someone else's");
    await fails(setDoc(doc(db("staff1"), "directory", "staff1"), { name: "Sam Staff", role: "manager" }), "staff calling themselves a manager");
    await fails(setDoc(doc(db("staff1"), "directory", "staff1"), { name: "Sam the Boss", role: "staff" }), "a name that isn't theirs");
    await fails(setDoc(doc(db("staff1"), "directory", "staff1"), { name: "Sam Staff", role: "staff", username: "sam" }), "extra fields");
    await assertSucceeds(setDoc(doc(db("mgr1"), "directory", "staff2"), { name: "Tia Staff", role: "staff" }));
    await assertSucceeds(setDoc(doc(db("mgr1"), "directory", "owner1"), { name: "Olly Owner", role: "owner" }));
    await assertSucceeds(getDocs(collection(db("staff2"), "directory")));
    await fails(getDocs(collection(db("stranger"), "directory")), "someone not on the team reading it");
    await fails(setDoc(doc(db("stranger"), "directory", "stranger"), { name: "Stray", role: "staff" }), "someone not on the team adding themselves");
    await fails(deleteDoc(doc(db("mgr1"), "directory", "staff2")), "a manager deleting a current member's entry");
    await assertSucceeds(removeBatch(db("mgr1"), "mgr1", "staff2").commit());
    await fails(deleteDoc(doc(db("staff1"), "directory", "staff2")), "staff tidying up");
    await assertSucceeds(deleteDoc(doc(db("mgr1"), "directory", "staff2")));
  });

  test("the team chat: anyone makes it once, everyone reads and writes it, and each message updates the preview", async () => {
    await assertSucceeds(getDoc(doc(db("staff1"), "chats", "team")));
    await fails(setDoc(doc(db("stranger"), "chats", "team"), chat("stranger", "team")), "someone not on the team making it");
    await fails(setDoc(doc(db("staff1"), "chats", "team"), chat("staff1", "team", ["staff1"])), "the team chat with members");
    await fails(setDoc(doc(db("staff1"), "chats", "team"), chat("staff1", "team", [], { lastText: "Hi" })), "a made-up preview");
    await assertSucceeds(setDoc(doc(db("staff1"), "chats", "team"), chat("staff1", "team")));
    await fails(setDoc(doc(db("staff2"), "chats", "team"), chat("staff2", "team")), "making it again over the top");
    const id = await sent(db("staff2"), "staff2", "team", { text: "Ice machine is fixed" });
    const c = await current("chats/team");
    assert.deepEqual([c.lastId, c.lastText, c.lastName, c.lastUid, Object.keys(c.read)], [id, "Ice machine is fixed", "Tia Staff", "staff2", ["staff2"]]);
    for (const who of ["staff1", "mgr1", "owner1"]) { await assertSucceeds(getDoc(doc(db(who), "chats", "team"))); await assertSucceeds(msgs(who, "team")); }
    await fails(getDoc(doc(db("stranger"), "chats", "team")), "someone not on the team reading it");
    await fails(msgs("stranger", "team"), "someone not on the team reading its messages");
    await sent(db("owner1"), "owner1", "team", { mentions: ["staff1", "mgr1"] });
  });

  test("a message and its preview go together, signed by the sender, and messages can't be edited", async () => {
    await assertSucceeds(setDoc(doc(db("staff1"), "chats", "team"), chat("staff1", "team")));
    await fails(send(db("staff1"), "staff1", "team", { skip: ["last"] }).b.commit(), "a message without the preview");
    await fails(send(db("staff1"), "staff1", "team", { skip: ["msg"] }).b.commit(), "a preview without the message");
    await fails(send(db("staff1"), "staff1", "team", { last: { lastName: "Tia Staff" } }).b.commit(), "a preview under someone else's name");
    await fails(send(db("staff1"), "staff1", "team", { last: { lastUid: "staff2" } }).b.commit(), "a preview under someone else's uid");
    await fails(send(db("staff1"), "staff1", "team", { last: { "read.staff2": now() } }).b.commit(), "marking it read for someone else");
    await fails(send(db("staff1"), "staff1", "team", { mentions: ["staff2"], last: { lastPings: [] } }).b.commit(), "a preview that hides who was pinged");
    await fails(send(db("staff1"), "staff1", "team", { msg: { name: "Tia Staff" } }).b.commit(), "a message under someone else's name");
    for (const msg of [{ text: "" }, { text: "   " }, { text: "x".repeat(1001) }, { photo: "no" }, { mentions: "staff2" }, { mentions: ["a", "b", "c", "d", "e", "f"] }, { mentions: ["staff1"] }, { extra: 1 }]) {
      await fails(send(db("staff1"), "staff1", "team", { msg, pings: [] }).b.commit(), JSON.stringify(msg).slice(0, 60));
    }
    const id = await sent(db("staff1"), "staff1", "team");
    await fails(updateDoc(doc(db("staff1"), "chats", "team", "msgs", id), { text: "Changed" }), "editing a message");
    await fails(updateDoc(doc(db("staff1"), "chats", "team"), { lastText: "Changed" }), "changing the preview on its own");
  });

  test("read times: each person marks only their own, at the server's clock", async () => {
    await assertSucceeds(setDoc(doc(db("staff1"), "chats", "team"), chat("staff1", "team")));
    await sent(db("staff1"), "staff1", "team");
    await assertSucceeds(updateDoc(doc(db("staff2"), "chats", "team"), { "read.staff2": now() }));
    await fails(updateDoc(doc(db("staff2"), "chats", "team"), { "read.staff1": now() }), "someone else's read time");
    await fails(updateDoc(doc(db("staff2"), "chats", "team"), { "read.staff2": Timestamp.fromMillis(Date.now() + 864e5) }), "a read time in the future");
    await fails(updateDoc(doc(db("staff2"), "chats", "team"), { "read.staff2": now(), lastText: "x" }), "a read time with another change");
  });

  test("private chats: one per pair, only the two of them read it, not managers or the owner", async () => {
    await fails(setDoc(doc(db("staff1"), "chats", "staff2-staff1"), chat("staff1", "dm", ["staff2", "staff1"])), "the uids out of order");
    await fails(setDoc(doc(db("staff1"), "chats", "mgr1-staff2"), chat("staff1", "dm", ["mgr1", "staff2"])), "a chat for two other people");
    await fails(setDoc(doc(db("staff1"), "chats", dmId("staff1", "ghost")), chat("staff1", "dm", [ "ghost", "staff1"].sort())), "a chat with someone not on the team");
    await fails(setDoc(doc(db("staff1"), "chats", "staff1-staff2"), chat("staff1", "dm", ["staff1", "staff2"], { title: "Us" })), "a private chat with a name");
    await assertSucceeds(makeDm("staff1", "staff2"));
    await fails(makeDm("staff2", "staff1"), "a second chat for the same pair");
    const id = dmId("staff1", "staff2");
    await sent(db("staff1"), "staff1", id, { text: "Can you cover Friday?", mentions: ["staff2"] });
    await sent(db("staff2"), "staff2", id, { text: "Yes", mentions: ["staff1"] });
    for (const who of ["staff1", "staff2"]) { await assertSucceeds(getDoc(doc(db(who), "chats", id))); await assertSucceeds(msgs(who, id)); }
    for (const who of ["mgr1", "owner1"]) {
      await fails(getDoc(doc(db(who), "chats", id)), `${who} reading the chat`);
      await fails(msgs(who, id), `${who} reading its messages`);
      await fails(send(db(who), who, id).b.commit(), `${who} writing in it`);
      await fails(updateDoc(doc(db(who), "chats", id), { [`read.${who}`]: now() }), `${who} marking it read`);
    }
    await fails(send(db("staff1"), "staff1", id, { mentions: ["mgr1"] }).b.commit(), "pinging someone who isn't in it");
    await assertSucceeds(getDocs(query(collection(db("staff1"), "chats"), where("members", "array-contains", "staff1"))));
    await fails(getDocs(query(collection(db("mgr1"), "chats"), where("members", "array-contains", "staff1"))), "listing someone else's chats");
    await fails(getDocs(collection(db("owner1"), "chats")), "listing every chat");
  });

  test("groups: whoever starts one, or a manager in it, changes it; anyone leaves; outsiders can't read it", async () => {
    for (const bad of [{ title: "" }, { title: "x".repeat(41) }, { members: ["staff1"] }, { members: ["staff2", "mgr1"] }, { members: "staff1,staff2" }]) {
      await fails(setDoc(doc(db("staff1"), "chats", autoId()), chat("staff1", "group", ["staff1", "staff2"], { title: "Floor", ...bad })), JSON.stringify(bad));
    }
    await fails(setDoc(doc(db("staff1"), "chats", "floor"), chat("staff1", "group", ["staff1", "staff2"], { title: "Floor" })), "a group with a made-up id");
    const id = await makeGroup("staff1", ["staff1", "staff2", "mgr2"]);
    await sent(db("staff2"), "staff2", id, { mentions: ["staff1", "mgr2"] });
    await fails(send(db("staff2"), "staff2", id, { mentions: ["mgr1"] }).b.commit(), "pinging someone who isn't in it");
    for (const who of ["mgr1", "owner1"]) { await fails(getDoc(doc(db(who), "chats", id)), `${who} reading it`); await fails(msgs(who, id), `${who} reading its messages`); }
    await assertSucceeds(updateDoc(doc(db("staff1"), "chats", id), { title: "Floor crew", members: ["staff1", "staff2", "mgr2", "mgr1"] }));
    await assertSucceeds(msgs("mgr1", id));
    await fails(updateDoc(doc(db("staff2"), "chats", id), { members: ["staff1", "staff2"] }), "a member who didn't start it removing someone");
    await fails(updateDoc(doc(db("staff2"), "chats", id), { title: "Mine" }), "a member who didn't start it renaming it");
    await fails(updateDoc(doc(db("owner1"), "chats", id), { members: ["staff1", "staff2", "mgr2", "mgr1", "owner1"] }), "the owner adding themselves to a group they aren't in");
    await assertSucceeds(updateDoc(doc(db("mgr2"), "chats", id), { members: ["staff1", "staff2", "mgr2"] }));
    await fails(updateDoc(doc(db("staff2"), "chats", id), { members: ["staff2"] }), "leaving and taking someone with you");
    await assertSucceeds(updateDoc(doc(db("staff2"), "chats", id), { members: ["staff1", "mgr2"] }));
    await fails(msgs("staff2", id), "reading it after leaving");
    await fails(updateDoc(doc(db("staff1"), "chats", id), { members: ["staff1"] }), "the starter cutting it down to just themselves");
  });

  test("pings: only for someone mentioned in a message sent in the same write; only they read and clear it", async () => {
    await assertSucceeds(setDoc(doc(db("staff1"), "chats", "team"), chat("staff1", "team")));
    await sent(db("staff1"), "staff1", "team", { text: "Tia, the keg needs changing", mentions: ["staff2"] });
    await fails(send(db("staff1"), "staff1", "team", { mentions: [], pings: ["staff2"] }).b.commit(), "a ping for someone who isn't mentioned");
    await fails(send(db("staff1"), "staff1", "team", { mentions: ["ghost"] }).b.commit(), "a ping for someone not on the team");
    await fails(send(db("staff1"), "staff1", "team", { mentions: ["staff2"], ping: { name: "Mia Manager" } }).b.commit(), "a ping under someone else's name");
    await fails(setDoc(doc(db("staff1"), "pings", "staff2-team"), { to: "staff2", chat: "team", msg: autoId(), text: "hi", ...by("staff1") }), "a ping with no message");
    await assertSucceeds(getDocs(query(collection(db("staff2"), "pings"), where("to", "==", "staff2"))));
    await fails(getDoc(doc(db("staff1"), "pings", "staff2-team")), "the sender reading it");
    await fails(getDoc(doc(db("owner1"), "pings", "staff2-team")), "the owner reading it");
    await fails(getDocs(collection(db("mgr1"), "pings")), "listing everyone's pings");
    await fails(deleteDoc(doc(db("staff1"), "pings", "staff2-team")), "someone else clearing it");
    await assertSucceeds(deleteDoc(doc(db("staff2"), "pings", "staff2-team")));
  });

  test("photos: added only with their message, read by the people in the chat, cleared by the sender", async () => {
    await assertSucceeds(makeDm("staff1", "staff2"));
    const id = dmId("staff1", "staff2");
    const m = await sent(db("staff1"), "staff1", id, { text: "", photo: true, mentions: ["staff2"] });
    assert.equal((await current(`chats/${id}`)).lastText, "Photo");
    await assertSucceeds(getDoc(doc(db("staff2"), "chatPhotos", `${id}-${m}`)));
    for (const who of ["mgr1", "owner1"]) await fails(getDoc(doc(db(who), "chatPhotos", `${id}-${m}`)), `${who} seeing it`);
    await fails(send(db("staff1"), "staff1", id, { text: "", photo: true, skip: ["photo"] }).b.commit(), "a photo message without its photo");
    await fails(send(db("staff1"), "staff1", id, { photo: true, pic: { data: "data:image/png;base64,AAAA" } }).b.commit(), "something that isn't a JPEG");
    await fails(send(db("staff1"), "staff1", id, { photo: true, pic: { data: "data:image/jpeg;base64," + "A".repeat(700001) } }).b.commit(), "a photo that's too big");
    await fails(send(db("staff1"), "staff1", id, { photo: true, pic: { day: dayFromNow(-5) } }).b.commit(), "a photo dated days ago");
    await fails(setDoc(doc(db("staff1"), "chatPhotos", `${id}-${m}x`), { chat: id, msg: m, day: today(), data: JPEG, ...by("staff1") }), "a photo added to an old message");
    await assertSucceeds(getDocs(query(collection(db("staff1"), "chatPhotos"), where("uid", "==", "staff1"), where("day", "==", dayFromNow(-31)))));
    await fails(deleteDoc(doc(db("staff2"), "chatPhotos", `${id}-${m}`)), "the other person clearing it");
    await assertSucceeds(deleteDoc(doc(db("staff1"), "chatPhotos", `${id}-${m}`)));
  });

  test("unsending: the sender takes back a message with its photo, and the preview clears if it was the latest", async () => {
    await assertSucceeds(setDoc(doc(db("staff1"), "chats", "team"), chat("staff1", "team")));
    const m = await sent(db("staff1"), "staff1", "team", { text: "Wrong chat", photo: true });
    for (const who of ["staff2", "mgr1", "owner1"]) await fails(deleteDoc(doc(db(who), "chats", "team", "msgs", m)), `${who} deleting it`);
    await fails(deleteDoc(doc(db("staff1"), "chats", "team", "msgs", m)), "leaving the photo behind");
    await fails(updateDoc(doc(db("staff1"), "chats", "team"), { lastText: "" }), "clearing the preview with the message still there");
    const d = db("staff1"), b = writeBatch(d);
    b.delete(doc(d, "chats", "team", "msgs", m));
    b.delete(doc(d, "chatPhotos", `team-${m}`));
    b.update(doc(d, "chats", "team"), { lastText: "" });
    await assertSucceeds(b.commit());
    await sent(db("staff2"), "staff2", "team");
    await fails(updateDoc(doc(db("staff1"), "chats", "team"), { lastText: "" }), "clearing someone else's preview");
  });

  test("someone removed from the team loses every chat at once", async () => {
    await assertSucceeds(makeDm("staff1", "staff2"));
    await assertSucceeds(removeBatch(db("mgr1"), "mgr1", "staff2").commit());
    await fails(msgs("staff2", dmId("staff1", "staff2")), "reading their old private chat");
    await fails(getDocs(query(collection(db("staff2"), "chats"), where("members", "array-contains", "staff2"))), "listing their chats");
  });
});

describe("features the owner switches off for the venue", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  // Everything the app lets the owner switch off.
  const ALL = ["allergens", "practice", "pay", "football", "chat", "rota", "calendar", "asks", "incidents", "kpis", "training", "feedback", "handover", "briefing", "guests", "refusals", "certs",
    "shouts", "pulse", "onboard"];
  const ref = (uid, id = "features") => doc(db(uid), "settings", id);
  const set = (uid, off, extra = {}) => setDoc(ref(uid), { off, ...by(uid), ...extra });
  test("only the owner switches features off and on, and everyone on the team reads it", async () => {
    await assertSucceeds(set("owner1", ["rota", "asks"]));
    await assertSucceeds(set("owner1", ALL));
    await assertSucceeds(set("owner1", []));
    for (const uid of ["staff1", "mgr1", "owner1"]) await assertSucceeds(getDoc(ref(uid)));
    await fails(getDoc(ref("stranger")), "someone not on the team reading it");
    await fails(getDoc(ref(null)), "reading it logged out");
    await fails(set("mgr1", ["rota"]), "a manager switching one off");
    await fails(set("staff1", ["rota"]), "staff switching one off");
    await fails(deleteDoc(ref("owner1")), "deleting it");
  });
  test("it lists only what can be switched off, and says who changed it", async () => {
    await fails(set("owner1", ["drinks"]), "the drinks");
    await fails(set("owner1", ["reports"]), "something that can't be switched off");
    await fails(set("owner1", "rota"), "not a list");
    await fails(set("owner1", [...ALL, "rota"]), "more entries than there are features");
    await fails(set("owner1", ["rota"], { name: "Mia Manager" }), "someone else's name");
    await fails(set("owner1", ["rota"], { at: daysAgo(1) }), "a time that isn't now");
    await fails(set("owner1", ["rota"], { extra: true }), "extra fields");
    await fails(setDoc(ref("owner1", "other"), { off: [], ...by("owner1") }), "any other settings record");
  });
});

describe("test staff: made-up people for a practice day, never logins", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const tid = () => "test-" + autoId();
  const person = (uid, extra = {}) => ({ who: "Test Bartender 1", side: "bar", role: "staff", ...by(uid), ...extra });
  test("managers and the owner add and remove them; only they can read them", async () => {
    const id = tid();
    await assertSucceeds(setDoc(doc(db("mgr1"), "teststaff", id), person("mgr1")));
    await assertSucceeds(setDoc(doc(db("owner1"), "teststaff", tid()), person("owner1", { who: "Test Manager 1", side: "floor", role: "manager" })));
    await assertSucceeds(getDocs(collection(db("mgr2"), "teststaff")));
    await fails(getDocs(collection(db("staff1"), "teststaff")), "staff listing them");
    await fails(getDoc(doc(db("staff1"), "teststaff", id)), "staff reading one");
    await fails(setDoc(doc(db("staff1"), "teststaff", tid()), person("staff1")), "staff adding one");
    await fails(deleteDoc(doc(db("staff1"), "teststaff", id)), "staff removing one");
    await fails(updateDoc(doc(db("mgr1"), "teststaff", id), { who: "Someone else" }), "changing one");
    await assertSucceeds(deleteDoc(doc(db("mgr2"), "teststaff", id)));
  });
  test("an id that starts test-, a name, a side, staff or manager, and who added them", async () => {
    const add = (id, x) => setDoc(doc(db("mgr1"), "teststaff", id), x);
    await fails(add(autoId(), person("mgr1")), "an id without test-, which could pass for a real uid");
    await fails(add("test-short", person("mgr1")), "an id that isn't an automatic one");
    await fails(add(tid(), person("mgr1", { who: " " })), "no name");
    await fails(add(tid(), person("mgr1", { who: "x".repeat(41) })), "a name over 40");
    await fails(add(tid(), person("mgr1", { side: "cellar" })), "another side");
    await fails(add(tid(), person("mgr1", { role: "owner" })), "an owner");
    await fails(add(tid(), person("mgr1", { name: "Olly Owner" })), "signed as someone else");
    await fails(add(tid(), { ...person("mgr1"), username: "fake" }), "a username, as if it were a login");
  });
  test("a manager puts a test person on a shift, drafted or published, and takes it off", async () => {
    const id = tid();
    await assertSucceeds(setDoc(doc(db("mgr1"), "teststaff", id), person("mgr1")));
    const x = await shiftBatch(db("mgr1"), "mgr1", "added", { f: { who: id, whoName: "Test Bartender 1", note: "Test" } });
    await assertSucceeds(x.b.commit());
    await assertSucceeds(deleteDoc(doc(db("mgr1"), "shifts", x.id)));
  });
});

describe("the calendar: school holidays, events and days the venue is shut", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const ref = (uid, id = "half-term") => doc(db(uid), "calendar", id);
  const entry = (uid, extra = {}) => ({ title: "Half term (Westminster schools)", kind: "school", date1: dayFromNow(20), date2: dayFromNow(24), note: "", ...by(uid), ...extra });
  test("managers and the owner add, change and remove them, and everyone on the team reads them", async () => {
    await assertSucceeds(setDoc(ref("mgr1"), entry("mgr1")));
    await assertSucceeds(addDoc(collection(db("owner1"), "calendar"), entry("owner1", { title: "Closed for the refit", kind: "closed", date1: dayFromNow(60), date2: dayFromNow(60) })));
    await assertSucceeds(addDoc(collection(db("mgr2"), "calendar"), entry("mgr2", { title: "Pride in London", kind: "event", note: "Busy from noon. Extra floor staff." })));
    // A change is the whole entry again, signed by whoever makes it.
    await assertSucceeds(setDoc(ref("mgr2"), entry("mgr2", { date2: dayFromNow(25), note: "Some academies go back a day later" })));
    for (const uid of ["staff1", "mgr1", "owner1"]) {
      await assertSucceeds(getDoc(ref(uid)));
      await assertSucceeds(getDocs(query(collection(db(uid), "calendar"), where("date2", ">=", dayFromNow(-100)))));
    }
    await fails(getDoc(ref("stranger")), "someone not on the team reading one");
    await fails(getDocs(collection(db(null), "calendar")), "reading them logged out");
    await fails(setDoc(ref("staff1", "mine"), entry("staff1")), "staff adding one");
    await fails(setDoc(ref("staff1"), entry("staff1", { title: "Half term" })), "staff changing one");
    await fails(deleteDoc(ref("staff1")), "staff removing one");
    await assertSucceeds(deleteDoc(ref("mgr1")));
  });
  test("a title, one of three kinds, real days in order within about three years, and who added it", async () => {
    const add = (extra) => setDoc(ref("mgr1"), entry("mgr1", extra));
    await assertSucceeds(add({ date1: dayFromNow(-300), date2: dayFromNow(-290) }));
    await assertSucceeds(add({ date1: dayFromNow(1000), date2: dayFromNow(1050), note: "x".repeat(200) }));
    await fails(add({ title: " " }), "no title");
    await fails(add({ title: "x".repeat(61) }), "a title too long");
    await fails(add({ kind: "bank" }), "a kind the app doesn't have (bank holidays are built in)");
    await fails(add({ date1: "2026-02-31", date2: "2026-03-02" }), "a day that doesn't exist");
    await fails(add({ date1: "26-11-04" }), "not a date");
    await fails(add({ date1: dayFromNow(24), date2: dayFromNow(20) }), "ending before it starts");
    await fails(add({ date1: dayFromNow(-420), date2: dayFromNow(-410) }), "more than a year ago");
    await fails(add({ date2: dayFromNow(1120) }), "more than three years ahead");
    await fails(add({ note: "x".repeat(201) }), "a note too long");
    await fails(add({ note: null }), "a note that isn't text");
    await fails(add({ name: "Max Manager" }), "someone else's name");
    await fails(add({ at: daysAgo(1) }), "a time that isn't now");
    await fails(add({ extra: true }), "extra fields");
  });
});

describe("house photos and how-to videos on the drinks", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const ref = (uid, id = "negroni") => doc(db(uid), "drinkMedia", id);
  const media = (uid, extra = {}) => ({ drink: "Negroni", photo: JPEG, video: "https://youtu.be/abc123", ...by(uid), ...extra });
  test("managers and the owner add and change them, everyone on the team sees them", async () => {
    await assertSucceeds(setDoc(ref("mgr1"), media("mgr1")));
    await assertSucceeds(setDoc(ref("owner1"), media("owner1", { video: "" })));
    await assertSucceeds(setDoc(ref("mgr2"), media("mgr2", { photo: "" })));
    await assertSucceeds(setDoc(ref("mgr1", "espresso-martini"), media("mgr1", { drink: "Espresso Martini" })));
    // The app's id for a name with an accent: the rules lower-case and dash it the same way.
    await assertSucceeds(setDoc(ref("mgr1", "pi-a-colada"), media("mgr1", { drink: "Piña Colada" })));
    for (const uid of ["staff1", "mgr1", "owner1"]) await assertSucceeds(getDoc(ref(uid)));
    await fails(getDoc(ref("stranger")), "someone not on the team reading one");
    await fails(getDoc(ref(null)), "reading one logged out");
    await fails(setDoc(ref("staff1"), media("staff1")), "staff adding one");
    await fails(deleteDoc(ref("staff1")), "staff removing one");
    await assertSucceeds(deleteDoc(ref("mgr2")));
  });
  test("a JPEG photo of bounded size and a link to a video site, under the drink's own name", async () => {
    await fails(setDoc(ref("mgr1", "martini"), media("mgr1")), "another drink's record");
    await fails(setDoc(ref("mgr1"), media("mgr1", { drink: "" })), "no drink");
    await fails(setDoc(ref("mgr1"), media("mgr1", { photo: "data:image/png;base64,AAAA" })), "not a JPEG");
    await fails(setDoc(ref("mgr1"), media("mgr1", { photo: "data:image/jpeg;base64," + "A".repeat(700000) })), "too big");
    await fails(setDoc(ref("mgr1"), media("mgr1", { photo: "", video: "" })), "nothing in it");
    for (const v of ["http://youtu.be/abc", "https://youtube.com.evil.example/watch", "https://evil.example/youtube.com/", "javascript:alert(1)", "https://youtu.be/a b", "https://youtu.be/" + "a".repeat(290)])
      await fails(setDoc(ref("mgr1"), media("mgr1", { video: v })), `the link ${v.slice(0, 40)}`);
    for (const v of ["https://www.youtube.com/watch?v=abc&t=10s", "https://m.youtube.com/shorts/abc", "https://vimeo.com/123", "https://www.instagram.com/reel/abc/", "https://www.tiktok.com/@bar/video/1", "https://drive.google.com/file/d/abc/view"])
      await assertSucceeds(setDoc(ref("mgr1"), media("mgr1", { video: v })));
    await fails(setDoc(ref("mgr1"), media("mgr1", { name: "Max Manager" })), "someone else's name");
    await fails(setDoc(ref("mgr1"), media("mgr1", { at: daysAgo(1) })), "a time that isn't now");
    await fails(setDoc(ref("mgr1"), media("mgr1", { extra: true })), "extra fields");
  });
});

describe("manager close and handover", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const Q = ["sales", "cash", "voids", "tips", "breaks", "incidents", "complaints", "depts", "food", "faults", "security", "ready"];
  const allYes = () => Object.fromEntries(Q.map((q) => [q, "yes"]));
  const ho = (uid, extra = {}, day = today()) => ({ day, answers: allYes(), follow: {}, extra: {}, risks: 0, exceptions: 0, lines: "", snap: { missing: 0 }, note: "Delivery at 10", owner: "", ...by(uid), ...extra });
  const ref = (uid, day = today()) => doc(db(uid), "handovers", day);
  // The app's write: the handover and, for food safety, equipment or security, an urgent issue h-{day}-{q}, together.
  const send = (uid, h, raise = [], day = today()) => {
    const d = db(uid), b = writeBatch(d);
    for (const q of raise) b.set(doc(d, "issues", `h-${day}-${q}`), issue(uid, { title: `Security: back door`, area: "other", urgent: true }));
    b.set(doc(d, "handovers", day), h);
    return b.commit();
  };
  const accept = (uid, note = "", extra = {}) => updateDoc(ref(uid), { ackBy: TEAM[uid].name, ackByUid: uid, ackAt: now(), ackNote: note, ...extra });
  test("managers and the owner send one a night and read them; staff can't do either", async () => {
    await fails(send("staff1", ho("staff1")), "staff sending one");
    await assertSucceeds(send("mgr1", ho("mgr1")));
    await fails(send("mgr2", ho("mgr2")), "a second one for the same night");
    await assertSucceeds(send("owner1", ho("owner1", {}, plusDays(today(), 1)), [], plusDays(today(), 1)));
    for (const uid of ["mgr1", "mgr2", "owner1"]) await assertSucceeds(getDoc(ref(uid)));
    await fails(getDoc(ref("staff1")), "staff reading one (it has the cash figures)");
    await fails(getDocs(collection(db("staff1"), "handovers")), "staff listing them");
  });
  test("every question is answered; a no needs its follow-ups; some can't be n/a", async () => {
    const { cash, ...short } = allYes();
    await fails(send("mgr1", ho("mgr1", { answers: short })), "a question left out");
    await fails(send("mgr1", ho("mgr1", { answers: { ...allYes(), extra: "yes" } })), "a question that doesn't exist");
    await fails(send("mgr1", ho("mgr1", { answers: { ...allYes(), sales: "maybe" } })), "an answer that isn't yes, no or n/a");
    await fails(send("mgr1", ho("mgr1", { answers: { ...allYes(), security: "na" } })), "security n/a");
    await fails(send("mgr1", ho("mgr1", { answers: { ...allYes(), cash: "na" } })), "cash n/a");
    await assertSucceeds(send("mgr1", ho("mgr1", { answers: { ...allYes(), sales: "na", tips: "na" } })));
    await fails(send("mgr2", ho("mgr2", { answers: { ...allYes(), breaks: "no" } }, plusDays(today(), 1)), [], plusDays(today(), 1)), "a no with nothing said about it");
    await assertSucceeds(send("mgr2", ho("mgr2", { answers: { ...allYes(), breaks: "no" }, follow: { breaks: { who: "Sam, short on the floor" } } }, plusDays(today(), 1)), [], plusDays(today(), 1)));
  });
  test("a no on food safety, equipment or security can't be saved without its urgent issue; cash stays with managers", async () => {
    const sec = { answers: { ...allYes(), security: "no" }, follow: { security: { what: "Back door won't lock" } }, risks: 1 };
    await fails(send("mgr1", ho("mgr1", sec)), "a security no with no issue raised");
    await fails(send("mgr1", ho("mgr1", { ...sec, risks: 0 }), ["security"]), "risks not counted");
    await assertSucceeds(send("mgr1", ho("mgr1", sec), ["security"]));
    const i = await getDoc(doc(db("staff1"), "issues", `h-${today()}-security`));
    assert.equal(i.data().urgent, true);
    const cash = { answers: { ...allYes(), cash: "no" }, follow: { cash: { amount: "£20 short" } }, risks: 1 };
    await assertSucceeds(send("mgr1", ho("mgr1", cash, plusDays(today(), 1)), [], plusDays(today(), 1)));
  });
  test("signed by whoever sends it, for a night near now, with nothing extra", async () => {
    await fails(send("mgr1", ho("mgr1", { name: "Max Manager" })), "someone else's name");
    await fails(send("mgr1", ho("mgr1", { at: daysAgo(1) })), "a time that isn't now");
    await fails(send("mgr1", ho("mgr1", { day: plusDays(today(), 1) })), "a day that isn't its id");
    await fails(send("mgr1", ho("mgr1", {}, plusDays(today(), -5)), [], plusDays(today(), -5)), "a night long gone");
    await fails(send("mgr1", ho("mgr1", { extra: 1 })), "an extra field");
    await fails(send("mgr1", ho("mgr1", { note: "x".repeat(2001) })), "a note too long");
  });
  test("the venue's own questions: managers keep up to 10, and a critical no among them counts as a risk", async () => {
    const qs = (n) => Array.from({ length: n }, (_, i) => ({ id: `q${i}`, t: `Question ${i}`, crit: i === 0 }));
    await fails(setDoc(doc(db("staff1"), "settings", "hoq"), { qs: qs(1), ...by("staff1") }), "staff adding questions");
    await fails(setDoc(doc(db("mgr1"), "settings", "hoq"), { qs: qs(11), ...by("mgr1") }), "more than 10");
    await assertSucceeds(setDoc(doc(db("mgr1"), "settings", "hoq"), { qs: qs(2), ...by("mgr1") }));
    await assertSucceeds(getDoc(doc(db("staff1"), "settings", "hoq")));
    const extra = { q0: { t: "Question 0", crit: true, a: "no", what: "Keg room left open", told: "GM" } };
    await fails(send("mgr1", ho("mgr1", { extra, risks: 2 })), "more risks than there could be");
    await assertSucceeds(send("mgr1", ho("mgr1", { extra, risks: 1 })));
  });
  test("once sent it can't be changed or deleted; the next manager accepts it once, saying what they'll do about risks", async () => {
    await send("mgr1", ho("mgr1", { answers: { ...allYes(), cash: "no" }, follow: { cash: { amount: "£20 short" } }, risks: 1 }));
    await fails(updateDoc(ref("mgr1"), { note: "Changed" }), "changing it");
    await fails(deleteDoc(ref("owner1")), "deleting it");
    await fails(accept("staff1"), "staff accepting it");
    await fails(accept("mgr2", "  "), "accepting a risk with nothing said");
    await fails(accept("mgr2", "Recount at 10", { ackBy: "Mia Manager" }), "in someone else's name");
    await fails(accept("mgr2", "Recount at 10", { note: "Changed" }), "changing it while accepting");
    await assertSucceeds(accept("mgr2", "Recount at 10 with the GM"));
    await fails(accept("owner1", "Again"), "accepting it twice");
  });
});

describe("tonight's status and bottlenecks", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const st = (uid, extra = {}) => ({ day: today(), side: "bar", level: "busy", note: "", ...by(uid), ...extra });
  const bk = (uid, extra = {}) => ({ day: today(), side: "bar", kind: "queue", note: "", ...by(uid), ...extra });
  test("anyone on the team sets a department's status and reports a hold-up; everyone reads them", async () => {
    await assertSucceeds(setDoc(doc(db("staff1"), "status", `${today()}-bar`), st("staff1")));
    await assertSucceeds(setDoc(doc(db("staff2"), "status", `${today()}-bar`), st("staff2", { level: "slammed", note: "Two parties of 12" })));
    await assertSucceeds(addDoc(collection(db("staff1"), "blocks"), bk("staff1")));
    for (const uid of ["staff2", "mgr1"]) await assertSucceeds(getDocs(query(collection(db(uid), "blocks"), where("day", "==", today()))));
    await fails(getDoc(doc(db("stranger"), "status", `${today()}-bar`)), "someone not on the team");
    await fails(deleteDoc(doc(db("mgr1"), "status", `${today()}-bar`)), "deleting a status");
  });
  test("checked: its id, the department, the level or kind, the night, signed", async () => {
    await fails(setDoc(doc(db("staff1"), "status", `${today()}-floor`), st("staff1")), "an id that isn't its day and department");
    await fails(setDoc(doc(db("staff1"), "status", `${today()}-cellar`), st("staff1", { side: "cellar" })), "a department that isn't one");
    await fails(setDoc(doc(db("staff1"), "status", `${today()}-bar`), st("staff1", { level: "chaos" })), "a level that isn't one");
    await fails(setDoc(doc(db("staff1"), "status", `${plusDays(today(), -5)}-bar`), st("staff1", { day: plusDays(today(), -5) })), "a night long gone");
    await fails(addDoc(collection(db("staff1"), "blocks"), bk("staff1", { kind: "boredom" })), "a kind that isn't one");
    await fails(addDoc(collection(db("staff1"), "blocks"), bk("staff1", { note: "x".repeat(141) })), "too long");
    await fails(addDoc(collection(db("staff1"), "blocks"), bk("staff1", { name: "Max Manager" })), "someone else's name");
  });
});

describe("sales and covers", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const nt = (uid, extra = {}, day = today()) => ({ day, covers: 180, wet: 420000, dry: 310050, note: "", ...by(uid), ...extra });
  const ref = (uid, day = today()) => doc(db(uid), "nights", day);
  test("managers put in a night's figures, past nights too, and correct them; staff can't see or write them", async () => {
    await fails(setDoc(ref("staff1"), nt("staff1")), "staff writing them");
    await assertSucceeds(setDoc(ref("mgr1"), nt("mgr1")));
    await assertSucceeds(setDoc(ref("mgr2"), nt("mgr2", { covers: 190 })));
    const past = plusDays(today(), -90);
    await assertSucceeds(setDoc(ref("owner1", past), nt("owner1", {}, past)));
    for (const uid of ["mgr1", "owner1"]) await assertSucceeds(getDoc(ref(uid)));
    await fails(getDoc(ref("staff1")), "staff reading them");
    await fails(getDocs(collection(db("staff1"), "nights")), "staff listing them");
    await fails(deleteDoc(ref("mgr1")), "deleting them");
  });
  test("checked: the day, whole numbers in pence, no more than a year back, signed", async () => {
    await fails(setDoc(ref("mgr1", plusDays(today(), 3)), nt("mgr1", {}, plusDays(today(), 3))), "a night that hasn't happened");
    await fails(setDoc(ref("mgr1", plusDays(today(), -420)), nt("mgr1", {}, plusDays(today(), -420))), "over 400 days back");
    await fails(setDoc(ref("mgr1"), nt("mgr1", { day: plusDays(today(), -1) })), "a day that isn't its id");
    await fails(setDoc(ref("mgr1"), nt("mgr1", { wet: 4200.5 })), "pounds, not pence");
    await fails(setDoc(ref("mgr1"), nt("mgr1", { dry: -1 })), "below nothing");
    await fails(setDoc(ref("mgr1"), nt("mgr1", { covers: "180" })), "covers as text");
    await fails(setDoc(ref("mgr1"), nt("mgr1", { name: "Max Manager" })), "someone else's name");
    await fails(setDoc(ref("mgr1"), nt("mgr1", { tips: 1 })), "an extra field");
  });
});

describe("pre-service briefing", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const br = (uid, extra = {}, day = today()) => ({ day, covers: 180, bookings: "Party of 20 at 8", specials: "", allergies: "Table 12 coeliac", sections: "", breaks: "", focus: "", previous: "", v: 1, ...by(uid), ...extra });
  const ref = (uid, day = today()) => doc(db(uid), "briefings", day);
  const read = (uid, v = 1, extra = {}) => setDoc(doc(db(uid), "briefReads", `${today()}-${uid}`), { day: today(), v, ...by(uid), ...extra });
  test("managers post and change it, a version at a time; everyone reads it; staff can't write it", async () => {
    await fails(setDoc(ref("staff1"), br("staff1")), "staff posting it");
    await fails(setDoc(ref("mgr1"), br("mgr1", { v: 2 })), "a new one not at version 1");
    await assertSucceeds(setDoc(ref("mgr1"), br("mgr1")));
    await fails(setDoc(ref("mgr2"), br("mgr2", { v: 1 })), "a change that doesn't raise the version");
    await assertSucceeds(setDoc(ref("mgr2"), br("mgr2", { v: 2, covers: 200 })));
    for (const uid of ["staff1", "mgr1", "owner1"]) await assertSucceeds(getDoc(ref(uid)));
    await fails(getDoc(ref("stranger")), "someone not on the team");
    await fails(deleteDoc(ref("mgr1")), "deleting it");
  });
  test("checked like everything else: its day, its fields, signed by whoever saves it", async () => {
    await fails(setDoc(ref("mgr1"), br("mgr1", { day: plusDays(today(), 1) })), "a day that isn't its id");
    await fails(setDoc(ref("mgr1", plusDays(today(), -5)), br("mgr1", {}, plusDays(today(), -5))), "a night long gone");
    await fails(setDoc(ref("mgr1"), br("mgr1", { covers: -1 })), "covers below nothing");
    await fails(setDoc(ref("mgr1"), br("mgr1", { covers: "180" })), "covers as text");
    await fails(setDoc(ref("mgr1"), br("mgr1", { focus: "x".repeat(1001) })), "too long");
    await fails(setDoc(ref("mgr1"), br("mgr1", { name: "Max Manager" })), "someone else's name");
    await fails(setDoc(ref("mgr1"), br("mgr1", { extra: 1 })), "an extra field");
  });
  test("each person marks the version they read; staff see only their own, managers everyone's", async () => {
    await seed((s) => setDoc(doc(s, "briefings", today()), { ...br("mgr1"), v: 2, at: Timestamp.now() }));
    await fails(read("staff1", 1), "an old version");
    await assertSucceeds(read("staff1", 2));
    await fails(setDoc(doc(db("staff1"), "briefReads", `${today()}-staff2`), { day: today(), v: 2, ...by("staff1") }), "marking it for someone else");
    await assertSucceeds(read("staff2", 2));
    await assertSucceeds(getDoc(doc(db("staff1"), "briefReads", `${today()}-staff1`)));
    await assertSucceeds(getDoc(doc(db("staff1"), "briefReads", `${plusDays(today(), 1)}-staff1`)));
    await fails(getDoc(doc(db("staff1"), "briefReads", `${today()}-staff2`)), "staff reading someone else's");
    await fails(getDocs(query(collection(db("staff1"), "briefReads"), where("day", "==", today()))), "staff listing them");
    await assertSucceeds(getDocs(query(collection(db("mgr1"), "briefReads"), where("day", "==", today()))));
    await fails(setDoc(doc(db("staff1"), "briefReads", `${plusDays(today(), 1)}-staff1`), { day: plusDays(today(), 1), v: 1, ...by("staff1") }), "a night with no briefing");
  });
});

describe("guest recovery", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const g = (uid, extra = {}) => ({ kind: "cold", table: "12", what: "Fries cold", wants: "Fresh fries", done: "Remade them", comp: 0, escalate: false, status: "open", ...by(uid), ...extra });
  const log = (uid, extra) => addDoc(collection(db(uid), "guests"), g(uid, extra));
  const limits = (uid, staff, manager, extra = {}) => setDoc(doc(db(uid), "settings", "comp"), { staff, manager, ...by(uid), ...extra });
  const close = (uid, id, extra = {}) => updateDoc(doc(db(uid), "guests", id), { status: "closed", resolution: "Dessert on us", extra: 0, followUp: false, closedBy: TEAM[uid].name, closedByUid: uid, closedAt: now(), ...extra });
  test("anyone logs one, and everyone on the team reads them; bad ones are refused", async () => {
    await assertSucceeds(log("staff1"));
    await assertSucceeds(log("staff1", { escalate: true, table: "", wants: "", done: "" }));
    for (const [bad, why] of [[{ kind: "rude" }, "a kind that isn't listed"], [{ what: " " }, "nothing said"], [{ table: "x".repeat(11) }, "a long table"], [{ escalate: "yes" }, "escalate not true or false"],
      [{ status: "closed" }, "logged already closed"], [{ comp: -100 }, "a negative value"], [{ comp: 2.5 }, "pence that aren't whole"], [{ guestName: "Jo" }, "a guest's name"], [{ name: "Tia Staff" }, "someone else's name"]]) await fails(log("staff1", bad), why);
    for (const uid of ["staff2", "mgr1"]) await assertSucceeds(getDocs(query(collection(db(uid), "guests"), orderBy("at", "desc"), limit(100))));
    await fails(getDocs(collection(db("stranger"), "guests")), "someone not on the team");
  });
  test("nobody but the owner gives anything until the owner sets the limits; then each role up to its own", async () => {
    await fails(log("staff1", { comp: 100 }), "staff giving £1 with no limits set");
    await fails(log("mgr1", { comp: 100 }), "a manager giving £1 with no limits set");
    await assertSucceeds(log("owner1", { comp: 5000 }));
    await fails(limits("mgr1", 500, 2000), "a manager setting the limits");
    await fails(limits("owner1", 500, -1), "a negative limit");
    await fails(limits("owner1", 500, 2000, { owner: 1 }), "an extra field");
    await assertSucceeds(limits("owner1", 500, 2000));
    await assertSucceeds(log("staff1", { comp: 500 }));
    await fails(log("staff1", { comp: 501 }), "staff over their limit");
    await assertSucceeds(log("mgr1", { comp: 2000 }));
    await fails(log("mgr1", { comp: 2001 }), "a manager over theirs");
    await assertSucceeds(getDoc(doc(db("staff1"), "settings", "comp")));
  });
  test("a manager closes it once, with what was done, within their limit; it can't be rewritten", async () => {
    await limits("owner1", 0, 1000);
    const x = await log("staff1", { escalate: true });
    await fails(close("staff1", x.id), "staff closing it");
    await fails(close("mgr1", x.id, { resolution: "  " }), "nothing said");
    await fails(close("mgr1", x.id, { extra: 1500 }), "a manager giving more than their limit");
    await fails(close("mgr1", x.id, { what: "Changed" }), "rewriting what happened");
    await fails(updateDoc(doc(db("staff1"), "guests", x.id), { what: "Changed" }), "the logger rewriting it");
    await assertSucceeds(close("mgr1", x.id, { extra: 1000, followUp: true }));
    await fails(close("owner1", x.id), "closing it twice");
    await fails(deleteDoc(doc(db("owner1"), "guests", x.id)), "deleting it outside Start fresh");
  });
});

describe("starting fresh: the owner clears the shift work for everyone", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  // The app signs the owner in afresh for it. Other logins have an old sign-in (the test library's default is 1970).
  // A sign-in's record is resets/{uid}-{auth_time}.
  const signIn = (uid, minsAgo = 0) => {
    const t = Math.floor(Date.now() / 1000) - minsAgo * 60;
    return { d: env.authenticatedContext(uid, { auth_time: t }).firestore(), id: `${uid}-${t}`, t };
  };
  // One record of each kind it clears, written past the rules, plus the ones it leaves.
  const WORK = [["shifts", "s1"], ["asks", "a1"], ["reports", "r1"], ["photos", "p1"], ["reviews", "v1"], ["events", "t-1"], ["restock", "x1"],
    ["out", "lime"], ["outlog", "o1"], ["issues", "i1"], ["concerns", "c1"], ["concernPhotos", "c1-0"], ["notices", "n1"], ["seen", "n1-staff1"],
    ["feed", "f1"], ["requests", "q1"], ["handovers", "2026-10-24"], ["briefings", "2026-10-24"], ["briefReads", "2026-10-24-staff1"], ["guests", "g1"], ["shift/2026-10-24/ticks", "k1"],
    ["quiz", "2026-10-24-staff1"]];
  const work = () => [...WORK, [`shift/${today()}/tasks`, "open-1"], [`shift/${today()}/runs`, "open"]];
  const seedWork = () => seed(async (s) => {
    const x = { uid: "staff1", name: "Sam Staff", at: daysAgo(1), kind: "task", done: true, pub: true, report: "r1", concern: "c1", to: "all", managers: true, status: "approved", log: "o1" };
    for (const [c, id] of work()) await setDoc(doc(s, c, id), x);
    await setDoc(doc(s, "events", "l-lb1-1"), { ...x, kind: "label" });
    await setDoc(doc(s, "labels", "lb1"), { item: "Lime juice", v: 1 });
  });
  const record = (uid, extra = {}) => ({ counts: { shifts: 1, reports: 1, checklists: 2 }, total: 4, ...by(uid), ...extra });
  // A record already there for a sign-in, written past the rules.
  const seedRecord = (id, uid) => seed((s) => setDoc(doc(s, "resets", id), { ...record(uid), at: Timestamp.now() }));
  const SAMPLE = [["reports", "r1"], ["events", "t-1"], ["outlog", "o1"], ["seen", "n1-staff1"], ["restock", "x1"], ["shift/2026-10-24/ticks", "k1"],
    [`shift/${today()}/tasks`, "open-1"], ["photos", "p1"], ["requests", "q1"], ["concernPhotos", "c1-0"], ["out", "lime"], ["shifts", "s1"]];

  test("signed in in the last 15 minutes, the owner records it and then clears each kind, five at a time", async () => {
    await seedWork();
    const { d, id } = signIn("owner1", 14);
    await assertSucceeds(setDoc(doc(d, "resets", id), record("owner1")));
    for (const [c, x] of work()) await assertSucceeds(deleteDoc(doc(d, c, x)));
    // Five in one write, as the app does them: each delete checks the owner's staff record and this record, and one
    // write may make 20 checks.
    await seed(async (s) => { for (let i = 0; i < 5; i++) await setDoc(doc(s, "events", `t-${i}`), { kind: "task", at: daysAgo(1) }); });
    const b = writeBatch(d);
    for (let i = 0; i < 5; i++) b.delete(doc(d, "events", `t-${i}`));
    await assertSucceeds(b.commit());
  });
  test("nothing goes without this sign-in's record, so an owner who has just logged in can't delete", async () => {
    await seedWork();
    const { d, t } = signIn("owner1");
    for (const [c, x] of SAMPLE) await fails(deleteDoc(doc(d, c, x)), `deleting ${c}/${x} with no record`);
    // A record from the owner's earlier sign-in doesn't count for this one.
    await seedRecord(`owner1-${t - 60}`, "owner1");
    for (const [c, x] of SAMPLE) await fails(deleteDoc(doc(d, c, x)), `deleting ${c}/${x} on an earlier sign-in's record`);
  });
  test("an older sign-in, a manager or staff can't, even with a record, and date labels keep their history", async () => {
    await seedWork();
    const late = signIn("owner1", 16), mgr = signIn("mgr1"), staff = signIn("staff1");
    for (const [{ d, id }, uid, who] of [[late, "owner1", "the owner 16 minutes after signing in"], [{ d: db("owner1"), id: "owner1-0" }, "owner1", "the owner on an old sign-in"],
      [mgr, "mgr1", "a manager"], [staff, "staff1", "staff"]]) {
      await fails(setDoc(doc(d, "resets", id), record(uid)), `${who} recording a start fresh`);
      await seedRecord(id, uid);
      for (const [c, x] of SAMPLE) await fails(deleteDoc(doc(d, c, x)), `${who} deleting ${c}/${x}`);
    }
    const { d, id } = signIn("owner1");
    await assertSucceeds(setDoc(doc(d, "resets", id), record("owner1")));
    await fails(deleteDoc(doc(d, "events", "l-lb1-1")), "a date label's event going");
    await fails(deleteDoc(doc(d, "labels", "lb1")), "a date label going without its event");
  });
  test("each record is this sign-in's, says what it found and who, can't be changed or deleted, and everyone on the team reads the latest", async () => {
    const { d, id, t } = signIn("owner1"), ref = doc(d, "resets", id);
    await fails(setDoc(doc(d, "resets", "latest"), record("owner1")), "an id the app doesn't make");
    await fails(setDoc(doc(collection(d, "resets")), record("owner1")), "an automatic id");
    await fails(setDoc(doc(d, "resets", `owner1-${t - 60}`), record("owner1")), "another sign-in's id");
    await fails(setDoc(ref, record("owner1", { note: "x" })), "an extra field");
    await fails(setDoc(ref, record("owner1", { counts: [1, 2] })), "counts that aren't a map");
    await fails(setDoc(ref, record("owner1", { total: -1 })), "a total below nothing");
    await fails(setDoc(ref, record("owner1", { name: "Mia Manager" })), "someone else's name");
    await fails(setDoc(ref, record("owner1", { at: daysAgo(1) })), "a time that isn't now");
    await assertSucceeds(setDoc(ref, record("owner1")));
    await fails(setDoc(ref, record("owner1")), "writing it again");
    await fails(updateDoc(ref, { total: 0 }), "changing it");
    await fails(deleteDoc(ref), "deleting it");
    for (const uid of ["staff1", "mgr1", "owner1"]) await assertSucceeds(getDocs(query(collection(db(uid), "resets"), orderBy("at", "desc"), limit(1))));
    await fails(getDocs(collection(db("stranger"), "resets")), "someone not on the team");
    await fails(getDocs(collection(db(null), "resets")), "reading them logged out");
  });
  test("the owner can count and list everything it clears", async () => {
    const { d } = signIn("owner1"), qs = [...["shifts", "asks", "reports", "photos", "reviews", "restock", "out", "outlog", "issues", "concerns", "concernPhotos", "notices", "seen", "feed", "requests", "handovers", "briefings", "briefReads", "guests"]
      .map((c) => collection(d, c)), query(collection(d, "events"), where("kind", "in", ["task", "run", "restock", "shift"])),
      ...["tasks", "runs", "ticks"].map((p) => collection(d, "shift", today(), p))];
    for (const q of qs) { await assertSucceeds(getCountFromServer(q)); await assertSucceeds(getDocs(query(q, limit(100)))); }
  });
});

describe("every query the app makes works for the roles that make it", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const common = (d, uid) => [
    query(collection(d, "feed"), orderBy("at", "desc"), limit(40)),
    collection(d, "out"),
    query(collection(d, "reports"), orderBy("at", "desc"), limit(30)),
    query(collection(d, "requests"), orderBy("at", "desc"), limit(50)),
    collection(d, "shift", today(), "ticks"),
    collection(d, "shift", today(), "tasks"),
    collection(d, "shift", today(), "runs"),
    query(collection(d, "events"), where("day", "==", today()), limit(2000)),
    query(collection(d, "restock"), where("status", "in", ["asked", "given", "doing", "blocked", "delivered"])),
    query(collection(d, "restock"), orderBy("at", "desc"), limit(30)),
    // The KPIs, Activity's earlier nights and the downloads: a range of nights.
    query(collection(d, "events"), where("day", ">=", dayFromNow(-31)), orderBy("day", "desc"), limit(5000)),
    query(collection(d, "restock"), where("day", ">=", dayFromNow(-31)), orderBy("day", "desc"), limit(2000)),
    query(collection(d, "photos"), where("uid", "==", uid), where("report", "==", null)),
    query(collection(d, "issues"), where("status", "in", ["open", "taken"])),
    query(collection(d, "issues"), orderBy("at", "desc"), limit(30)),
    query(collection(d, "concerns"), where("uid", "==", uid)),
    collection(d, "directory"),
    query(collection(d, "chats"), where("members", "array-contains", uid)),
    query(collection(d, "pings"), where("to", "==", uid)),
    query(collection(d, "chatPhotos"), where("uid", "==", uid), where("day", "==", dayFromNow(-31))),
    query(collection(d, "fixtures"), where("day", ">=", dayFromNow(-1)), orderBy("day"), limit(60)),
    query(collection(d, "calendar"), where("date2", ">=", dayFromNow(-100)), limit(300)),
    query(collection(d, "resets"), orderBy("at", "desc"), limit(1)),
    query(collection(d, "guests"), orderBy("at", "desc"), limit(100)),
    query(collection(d, "refusals"), where("day", ">=", dayFromNow(-100)), limit(1000)),
    query(collection(d, "certs"), where("who", "==", uid)),
    query(collection(d, "shouts"), orderBy("at", "desc"), limit(50)),
    collection(d, "lists"),
    collection(d, "labels"),
    // One date label's or shift's history.
    query(collection(d, "events"), where("ref", "==", autoId())),
    // The rota, a week at a time, as published.
    query(collection(d, "shifts"), where("week", "==", mondayOf(today())), where("pub", "==", true)),
    // The Reports tab's "Show older".
    query(collection(d, "reports"), where("at", "<", Timestamp.now()), orderBy("at", "desc"), limit(30)),
  ];
  const managers = (d) => [
    query(collection(d, "incidents"), where("at", "<", Timestamp.now()), orderBy("at", "desc"), limit(30)),
    query(collection(d, "reviews"), where("report", "in", ["r1", "r2"])),
    query(collection(d, "asks"), orderBy("at", "desc"), limit(100)),
    query(collection(d, "incidents"), orderBy("at", "desc"), limit(50)),
    query(collection(d, "reviews"), orderBy("at", "desc"), limit(200)),
    query(collection(d, "outlog"), orderBy("at", "desc"), limit(100)),
    collection(d, "staff"),
    query(collection(d, "audit"), orderBy("at", "desc"), limit(50)),
    query(collection(d, "photos"), where("at", "<", daysAgo(31)), limit(100)),
    // The old records' downloads.
    query(collection(d, "waste"), orderBy("at", "desc")),
    query(collection(d, "counts"), orderBy("at", "desc")),
    collection(d, "training"),
    query(collection(d, "concerns"), where("status", "==", "open")),
    query(collection(d, "concerns"), orderBy("at", "desc"), limit(50)),
    query(collection(d, "concernPhotos"), where("at", "<", daysAgo(31)), limit(100)),
    // The rota with its drafts, from four weeks back.
    query(collection(d, "shifts"), where("week", ">=", plusDays(mondayOf(today()), -28))),
    query(collection(d, "handovers"), orderBy("at", "desc"), limit(14)),
    query(collection(d, "briefReads"), where("day", "==", today())),
    query(collection(d, "certs"), limit(1000)),
    collection(d, "avail"),
    collection(d, "onboard"),
    query(collection(d, "pulse"), where("day", ">=", dayFromNow(-14))),
    query(collection(d, "quiz"), where("day", ">=", dayFromNow(-7))),
  ];
  test("staff", async () => {
    const d = db("staff1");
    for (const q of [...common(d, "staff1"), query(collection(d, "asks"), where("uid", "==", "staff1")), collection(d, "notices"), query(collection(d, "seen"), where("uid", "==", "staff1")),
      query(collection(d, "training"), where("trainee", "==", "staff1")),
      query(collection(d, "concerns"), where("to", "in", ["all", "bar", "floor"]), where("status", "==", "open"))]) await assertSucceeds(getDocs(q));
    for (const q of managers(d)) await assertFails(getDocs(q));
  });
  test("manager", async () => {
    const d = db("mgr1");
    for (const q of [...common(d, "mgr1"), ...managers(d), query(collection(d, "ratings"), where("about", "==", "mgr1")), query(collection(d, "notices"), where("managers", "==", true)),
      query(collection(d, "seen"), where("managers", "==", true), where("notice", "in", ["a", "b"]))]) await assertSucceeds(getDocs(q));
    await assertFails(getDocs(query(collection(d, "ratings"), orderBy("at", "desc"), limit(100))));
  });
  test("owner", async () => {
    const d = db("owner1");
    for (const q of [...common(d, "owner1"), ...managers(d), query(collection(d, "ratings"), orderBy("at", "desc"), limit(100)), collection(d, "notices"), query(collection(d, "seen"), where("notice", "in", ["a", "b"]))]) await assertSucceeds(getDocs(q));
  });
});
