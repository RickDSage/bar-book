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
const by = (uid) => ({ uid, name: TEAM[uid].name, at: now() });
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
const tick = (d, uid, list, item, day = today(), extra = {}) =>
  setDoc(doc(d, "shift", day, "ticks", `${list}-${item}`), { list, item, ...by(uid), ...extra });
const ask = (uid, kind, fields) => ({ kind, note: "", status: "pending", ...by(uid), ...fields });
const issue = (uid, extra = {}) => ({ title: "Glass washer leaking", detail: "", area: "bar", urgent: false, again: null, status: "open", ...by(uid), ...extra });

// =====================================================================================
describe("visitors who aren't logged in", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const PRIVATE = ["staff/staff1", "config/owner", "config/pins", "feed/a", "notices/a", "reports/a", "photos/a", "shift/2026-10-25/ticks/open-1",
    "requests/a", "out/gin", "outlog/a", "asks/a", "incidents/a", "reviews/a", "ratings/a", "audit/a", "issues/a", "seen/a-staff1"];
  for (const p of PRIVATE) test(`can't read ${p}`, () => assertFails(getDoc(doc(db(), p))));
  for (const c of ["staff", "usernames", "feed", "notices", "seen", "reports", "photos", "requests", "out", "outlog", "asks", "incidents", "reviews", "ratings", "audit", "issues"]) {
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
describe("tonight's checklists", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  test("anyone on the team ticks an item, signed with their own name", async () => {
    await assertSucceeds(tick(db("staff1"), "staff1", "open", 3));
    await assertSucceeds(getDocs(collection(db("staff2"), "shift", today(), "ticks")));
  });
  test("ticks that don't match the list, item, name or time are refused", async () => {
    const d = db("staff1");
    await assertFails(setDoc(doc(d, "shift", today(), "ticks", "open-4"), { list: "open", item: 3, ...by("staff1") }));
    await assertFails(tick(d, "staff1", "bins", 1));
    await assertFails(tick(d, "staff1", "open", 60));
    await assertFails(tick(d, "staff1", "open", -1));
    await assertFails(tick(d, "staff1", "open", 2, today(), { name: "Tia Staff" }));
    await assertFails(tick(d, "staff1", "open", 2, today(), { uid: "staff2" }));
    await assertFails(tick(d, "staff1", "open", 2, today(), { at: Timestamp.now() }));
    await assertFails(tick(d, "staff1", "open", 2, today(), { done: true }));
  });
  test("only today's business day (give or take a day for late syncing) can be ticked", async () => {
    await assertSucceeds(tick(db("staff1"), "staff1", "open", 1, dayFromNow(-1)));
    await assertFails(tick(db("staff1"), "staff1", "open", 1, dayFromNow(-5)));
    await assertFails(tick(db("staff1"), "staff1", "open", 1, dayFromNow(3)));
    await assertFails(tick(db("staff1"), "staff1", "open", 1, "2026-02-31"));
    await assertFails(tick(db("staff1"), "staff1", "open", 1, "tonight"));
  });
  test("staff can't untick or overwrite someone else's tick; managers can clear it", async () => {
    await assertSucceeds(tick(db("staff1"), "staff1", "close", 5));
    await assertFails(deleteDoc(doc(db("staff2"), "shift", today(), "ticks", "close-5")));
    await assertFails(tick(db("staff2"), "staff2", "close", 5));
    await assertSucceeds(deleteDoc(doc(db("mgr1"), "shift", today(), "ticks", "close-5")));
  });
  test("people untick their own", async () => {
    await assertSucceeds(tick(db("staff1"), "staff1", "fset", 0));
    await assertSucceeds(deleteDoc(doc(db("staff1"), "shift", today(), "ticks", "fset-0")));
  });
  test("two phones ticking at the same moment keep both ticks", async () => {
    await Promise.all([tick(db("staff1"), "staff1", "open", 1), tick(db("staff2"), "staff2", "open", 2)]);
    const all = await getDocs(collection(db("mgr1"), "shift", today(), "ticks"));
    assert.deepEqual(all.docs.map((d) => d.id).sort(), ["open-1", "open-2"]);
  });
  test("two phones ticking the same item: the first tick and its name stay", async () => {
    await assertSucceeds(tick(db("staff1"), "staff1", "open", 7));
    await assertFails(tick(db("staff2"), "staff2", "open", 7));
    const t = await getDoc(doc(db("mgr1"), "shift", today(), "ticks", "open-7"));
    assert.equal(t.data().uid, "staff1");
  });
  test("the old one-document-per-day checklist can't be written", () =>
    assertFails(setDoc(doc(db("staff1"), "shift", today()), { open: [], close: [] })));
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
describe("stock requests", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const rq = (uid, extra = {}) => ({ item: "Limes", note: "2 boxes", done: false, ...by(uid), ...extra });
  test("ask, then a manager marks it ordered once, with their uid", async () => {
    const ref = await assertSucceeds(addDoc(collection(db("staff1"), "requests"), rq("staff1")));
    await assertFails(updateDoc(doc(db("staff2"), "requests", ref.id), { done: true, doneBy: "Tia Staff", doneByUid: "staff2", doneAt: now() }));
    await assertFails(updateDoc(doc(db("mgr1"), "requests", ref.id), { done: true, doneBy: "Mia Manager", doneAt: now() }));
    await assertFails(updateDoc(doc(db("mgr1"), "requests", ref.id), { done: true, doneBy: "Mia Manager", doneByUid: "mgr1", doneAt: now(), item: "Lemons" }));
    await assertSucceeds(updateDoc(doc(db("mgr1"), "requests", ref.id), { done: true, doneBy: "Mia Manager", doneByUid: "mgr1", doneAt: now() }));
    await assertFails(updateDoc(doc(db("mgr2"), "requests", ref.id), { done: true, doneBy: "Max Manager", doneByUid: "mgr2", doneAt: now() }));
    for (const who of ["staff1", "mgr1", "owner1"]) await assertFails(deleteDoc(doc(db(who), "requests", ref.id)));
  });
  test("bad requests are refused", async () => {
    for (const bad of [{ item: "  " }, { done: true }, { note: "x".repeat(201) }, { name: "Someone Else" }, { extra: 1 }]) {
      await assertFails(addDoc(collection(db("staff1"), "requests"), rq("staff1", bad)));
    }
  });
  test("before it's ordered, the asker cancels it and a manager can turn it down; other staff can't", async () => {
    const a = await addDoc(collection(db("staff1"), "requests"), rq("staff1"));
    await assertFails(deleteDoc(doc(db("staff2"), "requests", a.id)));
    await assertSucceeds(deleteDoc(doc(db("staff1"), "requests", a.id)));
    const b = await addDoc(collection(db("staff1"), "requests"), rq("staff1"));
    await assertSucceeds(deleteDoc(doc(db("mgr1"), "requests", b.id)));
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
describe("every query the app makes works for the roles that make it", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const common = (d, uid) => [
    query(collection(d, "feed"), orderBy("at", "desc"), limit(40)),
    collection(d, "out"),
    query(collection(d, "reports"), orderBy("at", "desc"), limit(30)),
    query(collection(d, "requests"), orderBy("at", "desc"), limit(50)),
    collection(d, "shift", today(), "ticks"),
    query(collection(d, "photos"), where("uid", "==", uid), where("report", "==", null)),
    query(collection(d, "issues"), where("status", "in", ["open", "taken"])),
    query(collection(d, "issues"), orderBy("at", "desc"), limit(30)),
  ];
  const managers = (d) => [
    query(collection(d, "asks"), orderBy("at", "desc"), limit(100)),
    query(collection(d, "incidents"), orderBy("at", "desc"), limit(50)),
    query(collection(d, "reviews"), orderBy("at", "desc"), limit(200)),
    query(collection(d, "outlog"), orderBy("at", "desc"), limit(100)),
    collection(d, "staff"),
    query(collection(d, "audit"), orderBy("at", "desc"), limit(50)),
    query(collection(d, "photos"), where("at", "<", daysAgo(31)), limit(100)),
  ];
  test("staff", async () => {
    const d = db("staff1");
    for (const q of [...common(d, "staff1"), query(collection(d, "asks"), where("uid", "==", "staff1")), collection(d, "notices"), query(collection(d, "seen"), where("uid", "==", "staff1"))]) await assertSucceeds(getDocs(q));
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
