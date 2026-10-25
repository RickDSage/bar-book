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
  writeBatch, serverTimestamp, Timestamp, deleteField,
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
const SIDE = { open: "bar", close: "bar", fset: "floor", fshake: "floor", fclose: "floor" };
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
const DEST_SIDE = { up: "bar", down: "bar", shakes: "floor", floor: "floor" };
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
const ask = (uid, kind, fields) => ({ kind, note: "", status: "pending", ...by(uid), ...fields });
const issue = (uid, extra = {}) => ({ title: "Glass washer leaking", detail: "", area: "bar", urgent: false, again: null, status: "open", ...by(uid), ...extra });

// =====================================================================================
describe("visitors who aren't logged in", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const PRIVATE = ["staff/staff1", "config/owner", "config/pins", "feed/a", "notices/a", "reports/a", "photos/a", "shift/2026-10-25/ticks/open-1",
    "shift/2026-10-25/tasks/open-1", "shift/2026-10-25/runs/open", "events/a", "restock/a",
    "requests/a", "out/gin", "outlog/a", "asks/a", "incidents/a", "reviews/a", "ratings/a", "audit/a", "issues/a", "seen/a-staff1",
    "waste/a", "kit/a", "safety/a", "pars/gin", "counts/a", "training/staff1-negroni", "concerns/a", "concernPhotos/a-0"];
  for (const p of PRIVATE) test(`can't read ${p}`, () => assertFails(getDoc(doc(db(), p))));
  for (const c of ["staff", "usernames", "feed", "notices", "seen", "reports", "photos", "requests", "out", "outlog", "asks", "incidents", "reviews", "ratings", "audit", "issues", "waste", "kit", "safety", "pars", "counts", "training", "concerns", "concernPhotos", "events", "restock"]) {
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
    await assertSucceeds(addDoc(collection(db("staff1"), "feed"), { kind: "comment", text: "Limes low", ...by("staff1") }));
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
    for (const [why, list, item, o] of [["unknown list", "bins", 1, {}], ["item 60", "open", 60, {}], ["item -1", "open", -1, {}], ["id for another item", "open", 1, { task: { item: 2 }, event: { item: 2 } }],
      ["skipped version", "open", 1, { task: { v: 2 } }], ["long note", "open", 1, { note: "x".repeat(201) }], ["someone else's name", "open", 1, { task: { name: "Tia Staff" } }],
      ["someone else's uid", "open", 1, { task: { uid: "staff2" } }], ["phone's clock", "open", 1, { task: { at: Timestamp.now() } }], ["extra field", "open", 1, { task: { done: true } }]]) {
      await fails(task(d, "staff1", list, item, "done", o), why);
    }
    await fails(task(d, "staff1", "open", 1, "finished"), "unknown status");
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
    for (const r of [{ item: "Lemons" }, { qty: 5 }, { dest: "down" }, { unit: "box" }, { detail: "Changed" }, { askedBy: "Tia Staff" }, { day: dayFromNow(-1) }]) {
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
    for (const bad of [{ side: "kitchen" }, { text: "   " }, { photos: 9 }, { photos: -1 }, { photos: "2" }, { name: "Mia Manager" }, { uid: "staff2" }, { signedBy: "Sam Staff" }]) {
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
  const post = (uid, extra = {}) => addDoc(collection(db(uid), "feed"), { kind: "comment", text: "Guinness line down", ...by(uid), ...extra });
  const notice = (uid, extra = {}) => addDoc(collection(db(uid), "notices"), { text: "Tasting at 4", side: "all", managers: true, ...by(uid), ...extra });
  test("posts are signed by the real author", async () => {
    await assertSucceeds(post("staff1"));
    await assertFails(post("staff1", { name: "Olly Owner" }));
    await assertFails(post("staff1", { uid: "owner1" }));
    await assertFails(post("staff1", { text: "   " }));
    await assertFails(post("staff1", { kind: "notice" }));
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
  test("broadcasts go to everyone, the bar or the floor; only the owner can leave managers out", async () => {
    await assertSucceeds(notice("mgr1", { side: "bar" }));
    await assertSucceeds(notice("mgr1", { side: "floor" }));
    await assertFails(notice("mgr1", { side: "kitchen" }));
    await assertFails(notice("mgr1", { managers: "no" }));
    await assertFails(addDoc(collection(db("mgr1"), "notices"), { text: "No audience", ...by("mgr1") }));
    await assertFails(notice("mgr1", { managers: false }));
    const hidden = await assertSucceeds(notice("owner1", { managers: false }));
    await assertFails(getDoc(doc(db("mgr1"), "notices", hidden.id)));
    await assertSucceeds(getDoc(doc(db("staff1"), "notices", hidden.id)));
    await assertSucceeds(getDoc(doc(db("owner1"), "notices", hidden.id)));
    await assertFails(getDocs(collection(db("mgr1"), "notices")), "a manager can't list them all");
    const mine = await getDocs(query(collection(db("mgr1"), "notices"), where("managers", "==", true)));
    assert.equal(mine.size, 2);
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
  ];
  const managers = (d) => [
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

// =====================================================================================
describe("menu allergens", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const ITEM = "snacks-hot-fried-pickles";
  const by = (uid) => ({ uid, name: TEAM[uid]?.name ?? "Stray Person", at: now() });
  const al = (extra = {}) => ({ itemName: "Hot Fried Pickles", section: "snacks", contains: ["gluten", "milk"], may: ["mustard"], note: "", ...extra });
  // The record and its log entry in one write, as the app sends them. logExtra changes only the log entry.
  function save(uid, item = ITEM, extra = {}, logExtra = {}) {
    const d = db(uid), b = writeBatch(d), log = doc(collection(d, "menuAllergenLog"));
    b.set(doc(d, "menuAllergens", item), { ...al(extra), log: log.id, ...by(uid) });
    b.set(log, { item, ...al(extra), action: "set", ...by(uid), ...logExtra });
    return { b, log: log.id };
  }
  const saved = async (uid, item, extra) => { const x = save(uid, item, extra); await assertSucceeds(x.b.commit()); return x.log; };
  function clear(uid, item, logId, extra = {}) {
    const d = db(uid), b = writeBatch(d);
    b.delete(doc(d, "menuAllergens", item));
    b.set(doc(d, "menuAllergenLog", logId + "-clear"), { item, itemName: "Hot Fried Pickles", section: "snacks", contains: [], may: [], note: "", action: "clear", ...by(uid), ...extra });
    return b;
  }

  test("managers and the owner confirm and change an item's allergens; staff and strangers can't", async () => {
    await saved("mgr1");
    await saved("owner1", ITEM, { contains: [], may: [], note: "Checked with the kitchen" });
    await saved("mgr2", "added-snacks-chilli-poppers", { itemName: "Chilli Poppers", contains: ["milk", "gluten", "eggs"] });
    await assertFails(save("staff1").b.commit());
    await assertFails(save("stranger").b.commit());
    const r = (await getDoc(doc(db("staff1"), "menuAllergens", ITEM))).data();
    assert.deepEqual([r.name, r.contains, r.note], ["Olly Owner", [], "Checked with the kitchen"]);
  });

  test("only the 14 allergens, each once, never both contains and may contain", async () => {
    for (const bad of [{ contains: ["nuts", "nuts"] }, { contains: ["egg"] }, { contains: "milk" }, { may: ["milk"] }, { note: "x".repeat(301) },
      { itemName: " " }, { section: "Snacks" }, { contains: Array(15).fill("milk") }]) {
      await assertFails(save("mgr1", ITEM, bad).b.commit(), JSON.stringify(bad));
    }
    await assertFails(save("mgr1", "Bad id").b.commit(), "id isn't lower case and dashes");
    const all = ["celery", "gluten", "crustaceans", "eggs", "fish", "lupin", "milk", "molluscs", "mustard", "nuts", "peanuts", "sesame", "soya", "sulphites"];
    await saved("mgr1", ITEM, { contains: all.slice(0, 7), may: all.slice(7) });
  });

  test("the record and its log entry must match, carry who saved it, and go together", async () => {
    for (const bad of [{ contains: ["milk"] }, { may: [] }, { note: "different" }, { itemName: "Fried Pickles" }, { item: "snacks-queso-chips" }, { action: "clear" }]) {
      await assertFails(save("mgr1", ITEM, {}, bad).b.commit(), JSON.stringify(bad));
    }
    const d = db("mgr1"), b = writeBatch(d), log = doc(collection(d, "menuAllergenLog"));
    b.set(doc(d, "menuAllergens", ITEM), { ...al(), log: log.id, ...by("mgr1"), name: "Max Manager" });
    b.set(log, { item: ITEM, ...al(), action: "set", ...by("mgr1"), name: "Max Manager" });
    await assertFails(b.commit(), "someone else's name");
    await assertFails(setDoc(doc(d, "menuAllergens", ITEM), { ...al(), log: autoId(), ...by("mgr1") }), "no log entry");
    await assertFails(addDoc(collection(d, "menuAllergenLog"), { item: ITEM, ...al(), action: "set", ...by("mgr1") }), "log entry alone");
    await assertFails(setDoc(doc(d, "menuAllergens", ITEM), { ...al(), log: "x", ...by("mgr1") }), "made-up log id");
  });

  test("clearing writes its own log entry; the log can't be changed or deleted", async () => {
    const log = await saved("mgr1");
    await assertFails(deleteDoc(doc(db("mgr1"), "menuAllergens", ITEM)), "no log entry");
    await assertFails(clear("staff1", ITEM, log).commit());
    await assertFails(clear("mgr1", ITEM, "wrongid").commit());
    await assertFails(clear("mgr1", ITEM, log, { contains: ["milk"] }).commit());
    await assertFails(clear("mgr1", ITEM, log, { itemName: "Other" }).commit());
    await assertSucceeds(clear("mgr2", ITEM, log).commit());
    assert.equal((await getDoc(doc(db("staff1"), "menuAllergens", ITEM))).exists(), false);
    for (const uid of ["mgr1", "owner1"]) {
      await assertFails(updateDoc(doc(db(uid), "menuAllergenLog", log), { note: "edited" }));
      await assertFails(deleteDoc(doc(db(uid), "menuAllergenLog", log)));
      await assertFails(deleteDoc(doc(db(uid), "menuAllergenLog", log + "-clear")));
    }
    await saved("mgr1");
  });

  test("everyone on the team reads what's confirmed; only managers read the changes", async () => {
    const log = await saved("mgr1");
    for (const uid of ["staff1", "mgr1", "owner1"]) assert.equal((await getDocs(collection(db(uid), "menuAllergens"))).size, 1);
    await assertFails(getDocs(collection(db("stranger"), "menuAllergens")));
    await assertFails(getDocs(collection(db(null), "menuAllergens")));
    await assertFails(getDocs(query(collection(db("staff1"), "menuAllergenLog"), where("item", "==", ITEM))));
    await assertFails(getDoc(doc(db("staff1"), "menuAllergenLog", log)));
    for (const uid of ["mgr1", "owner1"]) assert.equal((await getDocs(query(collection(db(uid), "menuAllergenLog"), where("item", "==", ITEM)))).size, 1);
    assert.equal((await getDocs(query(collection(db("mgr1"), "menuAllergenLog"), orderBy("at", "desc")))).size, 1);
  });
});
