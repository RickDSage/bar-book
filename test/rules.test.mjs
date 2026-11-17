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
  mgr1: { name: "Mia Manager", role: "manager", pin: "mia-manager" },
  mgr2: { name: "Max Manager", role: "manager", pin: "max-manager" },
  staff1: { name: "Sam Staff", role: "staff" },
  staff2: { name: "Tia Staff", role: "staff" },
};
// Every phone joins with the team code (config/team), signed in anonymously; a senior unlocks one with their 4 digit
// code; the owner has a login.
const TEAM_CODE = "582913";
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
// A business night n nights from tonight. Before 6am dayFromNow(-1) is tonight, so "another night" counts from today().
const nightFromTonight = (n) => ukDay(Date.now() - 6 * 36e5 + n * 864e5);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const autoId = () => doc(collection(db("owner1"), "x")).id;

// Seniors' codes, salted and hashed the way the app does it.
const PINS = { "mia-manager": "4821", "max-manager": "1937" };
const SALT = "0123456789abcdef0123456789abcdef";
const sha = async (t) => Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t))).toString("hex");
const pinOf = async (pin, salt = SALT) => ({ salt, hash: await sha(pin + ":" + salt) });

async function seedTeam() {
  await seed(async (s) => {
    await setDoc(doc(s, "config", "team"), { code: TEAM_CODE });
    for (const [uid, p] of Object.entries(TEAM)) {
      if (p.role === "staff") { await setDoc(doc(s, "staff", uid), { ...p, code: TEAM_CODE, at: Timestamp.now() }); continue; }
      if (p.role === "manager") {
        await setDoc(doc(s, "staff", uid), { ...p, code: TEAM_CODE, at: Timestamp.now() });
        await setDoc(doc(s, "seniors", p.pin), { name: p.name, tries: 0, lastTry: Timestamp.now() });
        await setDoc(doc(s, "pins", p.pin), await pinOf(PINS[p.pin]));
        continue;
      }
      await setDoc(doc(s, "staff", uid), p);
      await setDoc(doc(s, "usernames", p.username), { email: emailOf(p.username), uid });
    }
  });
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
const photo = (uid, extra = {}) => ({ data: JPEG, note: "", report: null, side: "bar", ...by(uid), ...extra });
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
const issue = (uid, extra = {}) => ({ title: "Glass washer leaking", detail: "", area: "bar", urgent: false, again: null, status: "open", ...by(uid), ...extra });

// =====================================================================================
describe("visitors who aren't logged in", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const PRIVATE = ["staff/staff1", "config/team", "tells/a", "sent/a", "asks/a", "reports/a", "photos/a", "shift/2026-10-25/tasks/open-1",
    "shift/2026-10-25/runs/open", "events/a", "restock/a", "out/gin", "outlog/a", "issues/a", "settings/contacts", "lists/close", "listlog/close-1", "labels/a", "fixtures/a", "drinkMedia/negroni"];
  for (const p of PRIVATE) test(`can't read ${p}`, () => assertFails(getDoc(doc(db(), p))));
  for (const c of ["staff", "usernames", "tells", "sent", "asks", "reports", "photos", "out", "outlog", "issues", "events", "restock", "lists", "listlog", "labels", "fixtures"]) {
    test(`can't list ${c}`, () => assertFails(getDocs(collection(db(), c))));
  }
  test("can look up one username, and it holds only the sign-in address and uid", async () => {
    const snap = await assertSucceeds(getDoc(doc(db(), "usernames/olly")));
    assert.deepEqual(Object.keys(snap.data()).sort(), ["email", "uid"]);
  });
  test("can't write anything", async () => {
    await assertFails(setDoc(doc(db(), "tells/x"), { kind: "add", text: "hi", status: "new", uid: "x", name: "x", at: now() }));
    await assertFails(setDoc(doc(db(), "usernames/evil"), { email: emailOf("evil"), uid: "x" }));
    await assertFails(deleteDoc(doc(db(), "usernames/olly")));
  });
});

describe("joining the team with the team code", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const gateTries = async () => (await current("gate/team"))?.tries ?? 0;
  // A guess at the team code: this phone's guess and a +1 on the team's count, in one write.
  const guess = async (uid, g, given) => {
    const n = given ?? (await gateTries()) + 1, d = db(uid), b = writeBatch(d);
    b.set(doc(d, "joins", uid), { guess: g, n, at: now() });
    b.set(doc(d, "gate", "team"), { tries: n, lastTry: now() });
    return b.commit();
  };
  // The join it allows, which sets the count back to 0.
  const joinOnly = (uid, extra = {}, reset = true) => {
    const d = db(uid), b = writeBatch(d);
    b.set(doc(d, "staff", uid), { name: "Kadir", role: "staff", code: TEAM_CODE, at: now(), ...extra });
    if (reset) b.set(doc(d, "gate", "team"), { tries: 0, lastTry: now() });
    return b.commit();
  };
  const join = async (uid, extra = {}) => { await guess(uid, extra.code ?? TEAM_CODE); return joinOnly(uid, extra); };
  test("a signed-in phone with the right code joins as staff after a counted guess, and the count goes back to 0", async () => {
    await assertSucceeds(guess("phone1", "111111"));
    await assertSucceeds(join("phone1"));
    assert.equal(await gateTries(), 0);
    await assertSucceeds(getDocs(collection(db("phone1"), "issues")));
    // A new name keeps the same code, with no guess.
    await assertSucceeds(setDoc(doc(db("phone1"), "staff", "phone1"), { name: "Kadir B", role: "staff", code: TEAM_CODE, at: now() }));
  });
  test("a join with no counted guess, a wrong guess, or an old guess someone has guessed since is refused", async () => {
    await fails(joinOnly("phone1"), "no guess");
    await assertSucceeds(guess("phone1", "111111"));
    await fails(joinOnly("phone1"), "wrong guess");
    await assertSucceeds(guess("phone1", TEAM_CODE));
    await assertSucceeds(guess("phone2", "222222"));
    await fails(joinOnly("phone1"), "not the latest guess");
    await fails(guess("phone3", "333333", 2), "a guess that skips the count");
    await fails(guess("phone3", "12", 4), "a guess that isn't 4 to 8 numbers");
    await assertFails(getDoc(doc(db("phone1"), "joins", "phone1")));
    await assertFails(setDoc(doc(db("phone1"), "joins", "phone1"), { guess: TEAM_CODE, n: 9, at: now() }));
  });
  test("a wrong code, another role, another phone's record or extra fields are refused", async () => {
    for (const [why, extra] of [["wrong code", { code: "999999" }], ["manager", { role: "manager" }], ["owner", { role: "owner" }],
      ["no name", { name: " " }], ["long name", { name: "x".repeat(31) }], ["phone's clock", { at: daysAgo(1) }], ["extra field", { username: "kadir" }]]) {
      await assertSucceeds(guess("phone1", extra.code ?? TEAM_CODE));
      await fails(joinOnly("phone1", extra), why);
    }
    await assertSucceeds(guess("phone1", TEAM_CODE));
    await assertFails(setDoc(doc(db("phone1"), "staff", "phone2"), { name: "Kadir", role: "staff", code: TEAM_CODE, at: now() }));
    await assertFails(getDoc(doc(db("phone1"), "config", "team")));
  });
  test("10 wrong codes free for the whole team, then one every 5 minutes, then none from 30 until the owner unlocks joining", async () => {
    for (let n = 1; n <= 10; n++) await assertSucceeds(guess(`phone${n}`, "000000", n));
    await fails(guess("phone11", TEAM_CODE, 11), "11th guess straight away");
    await seed((s) => updateDoc(doc(s, "gate", "team"), { lastTry: Timestamp.fromMillis(Date.now() - 6 * 6e4) }));
    await assertSucceeds(guess("phone11", "000000", 11));
    await fails(guess("phone12", TEAM_CODE, 12), "within 5 minutes");
    await seed((s) => setDoc(doc(s, "gate", "team"), { tries: 30, lastTry: Timestamp.fromMillis(Date.now() - 864e5) }));
    await fails(guess("phone12", TEAM_CODE, 31), "locked at 30");
    // Nobody but the owner resets it; a member rewriting their own record doesn't.
    await fails(setDoc(doc(db("staff1"), "gate", "team"), { tries: 0, lastTry: now() }), "staff reset");
    await fails(setDoc(doc(db("mgr1"), "gate", "team"), { tries: 0, lastTry: now() }), "senior reset");
    const d = db("staff1"), b = writeBatch(d);
    b.set(doc(d, "staff", "staff1"), { name: "Sam S", role: "staff", code: TEAM_CODE, at: now() }); b.set(doc(d, "gate", "team"), { tries: 0, lastTry: now() });
    await fails(b.commit(), "a member's rename resetting the count");
    await assertSucceeds(setDoc(doc(db("owner1"), "gate", "team"), { tries: 0, lastTry: now() }));
    await assertSucceeds(join("phone12"));
    await assertSucceeds(getDoc(doc(db("phone99"), "gate", "team")));
    await assertFails(getDoc(doc(db(), "gate", "team")));
  });
  test("can't make themselves the owner or a manager by changing their record", async () => {
    await join("phone1");
    await assertFails(updateDoc(doc(db("phone1"), "staff", "phone1"), { role: "manager" }));
    await assertFails(setDoc(doc(db("phone1"), "staff", "phone1"), { name: "Kadir", username: "kadir", role: "manager" }));
    await assertFails(setDoc(doc(db("phone1"), "staff", "phone1"), { name: "Kadir", role: "manager", code: TEAM_CODE, at: now(), pin: "mia-manager" }));
    await assertFails(setDoc(doc(db("phone1"), "staff", "phone1"), { name: "Kadir", role: "owner", code: TEAM_CODE, at: now(), pin: "owner" }));
    await assertFails(updateDoc(doc(db("mgr1"), "staff", "mgr1"), { role: "owner" }));
  });
  test("only the owner sets the team code, 4 to 8 numbers, and nobody reads it", async () => {
    for (const uid of ["staff1", "mgr1"]) await assertFails(setDoc(doc(db(uid), "config", "team"), { code: "640275" }));
    for (const code of ["12", "123456789", "abcd"]) await assertFails(setDoc(doc(db("owner1"), "config", "team"), { code }));
    await assertFails(setDoc(doc(db("owner1"), "config", "other"), { code: "640275" }));
    await assertSucceeds(setDoc(doc(db("owner1"), "config", "team"), { code: "640275" }));
    await assertFails(getDoc(doc(db("owner1"), "config", "team")));
  });
  test("a new code takes every phone off, seniors' too; the password owner keeps going; phones come back with a counted guess", async () => {
    await seed((s) => setDoc(doc(s, "config", "team"), { code: "640275" }));
    await assertFails(getDocs(collection(db("staff1"), "issues")));
    await assertFails(addDoc(collection(db("staff1"), "issues"), issue("staff1")));
    await assertFails(getDocs(collection(db("mgr1"), "issues")));
    await assertSucceeds(getDocs(collection(db("owner1"), "issues")));
    const back = { name: "Sam Staff", role: "staff", code: "640275", at: now() };
    await fails(setDoc(doc(db("staff1"), "staff", "staff1"), back), "back with no guess");
    await assertSucceeds(guess("staff1", "640275"));
    await assertSucceeds(setDoc(doc(db("staff1"), "staff", "staff1"), back));
    await assertSucceeds(getDocs(collection(db("staff1"), "issues")));
  });
  test("leaving: a phone takes itself off; the manager takes staff off; only the owner takes the manager off; nobody removes the password owner", async () => {
    await assertSucceeds(deleteDoc(doc(db("staff1"), "staff", "staff1")));
    await assertFails(deleteDoc(doc(db("staff2"), "staff", "mgr1")));
    await assertSucceeds(deleteDoc(doc(db("mgr1"), "staff", "staff2")));
    await assertFails(deleteDoc(doc(db("mgr1"), "staff", "mgr2")));
    await assertSucceeds(deleteDoc(doc(db("owner1"), "staff", "mgr2")));
    for (const uid of ["owner1", "mgr1"]) await assertFails(deleteDoc(doc(db(uid), "staff", "owner1")));
  });
});

describe("seniors: the owner sets a 4 digit code, the server counts every guess", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const add = async (actor, id, name, pin, extra = {}) => {
    const d = db(actor), b = writeBatch(d);
    b.set(doc(d, "seniors", id), { name, tries: 0, lastTry: now(), ...extra });
    b.set(doc(d, "pins", id), await pinOf(pin));
    return b.commit();
  };
  // Saving a guess: the phone's latest guess and a +1 on that senior's count, in one write.
  const guess = async (uid, id, g, n) => {
    const d = db(uid), b = writeBatch(d);
    b.set(doc(d, "unlocks", uid), { id, guess: g, n, at: now() });
    b.update(doc(d, "seniors", id), { tries: n, lastTry: now() });
    return b.commit();
  };
  // Checking it: the phone becomes the senior's and the count goes back to 0.
  const unlock = (uid, id, name, extra = {}) => {
    const d = db(uid), b = writeBatch(d);
    b.update(doc(d, "staff", uid), { name, role: "manager", pin: id, at: now(), ...extra });
    b.update(doc(d, "seniors", id), { tries: 0, lastTry: now() });
    return b.commit();
  };
  const readTries = async (id) => { let t; await seed(async (s) => { t = (await getDoc(doc(s, "seniors", id))).data().tries; }); return t; };

  test("only the owner adds a senior, with a properly hashed code; only the owner reads codes; the team reads names", async () => {
    await assertSucceeds(add("owner1", "illias", "Illias", "5555"));
    await assertFails(add("mgr1", "hassan", "Hassan", "6666"));
    await assertFails(add("staff1", "hassan", "Hassan", "6666"));
    await assertFails(add("owner1", "hassan", "Hassan", "6666", { tries: 3 }));
    await assertFails(add("owner1", "Bad Id", "Hassan", "6666"));
    await assertFails(setDoc(doc(db("owner1"), "pins", "illias"), { salt: SALT, hash: "6666" }));
    await assertFails(setDoc(doc(db("owner1"), "seniors", "hassan"), { name: "Hassan", tries: 0, lastTry: now() }));
    await assertSucceeds(getDoc(doc(db("owner1"), "pins", "illias")));
    for (const uid of ["mgr1", "staff1"]) await assertFails(getDoc(doc(db(uid), "pins", "illias")));
    await assertSucceeds(getDocs(collection(db("staff1"), "seniors")));
    await assertFails(updateDoc(doc(db("mgr1"), "seniors", "illias"), { name: "Someone" }));
    await assertFails(getDocs(collection(db("phone9"), "seniors")));
  });
  test("a staff phone can't become a senior by writing its record, without a counted guess, or with a wrong code", async () => {
    await assertFails(updateDoc(doc(db("staff1"), "staff", "staff1"), { role: "manager", pin: "mia-manager" }));
    await assertFails(unlock("staff1", "mia-manager", "Mia Manager"));
    await assertSucceeds(guess("staff1", "mia-manager", "0000", 1));
    await assertFails(unlock("staff1", "mia-manager", "Mia Manager"));
    assert.equal(await readTries("mia-manager"), 1);
  });
  test("a guess can't skip the count, reuse a number or be read back", async () => {
    const d = db("staff1");
    await assertFails(setDoc(doc(d, "unlocks", "staff1"), { id: "mia-manager", guess: "4821", n: 1, at: now() }));
    await assertFails(guess("staff1", "mia-manager", "4821", 2));
    await assertFails(guess("staff1", "mia-manager", "48210", 1));
    await assertFails(guess("phone9", "mia-manager", "4821", 1));
    await assertSucceeds(guess("staff1", "mia-manager", "4821", 1));
    await assertFails(getDoc(doc(d, "unlocks", "staff1")));
  });
  test("the right code unlocks: the phone takes the senior's name and powers, and the count goes back to 0", async () => {
    await assertSucceeds(guess("staff1", "mia-manager", "1111", 1));
    await assertSucceeds(guess("staff1", "mia-manager", "4821", 2));
    await assertFails(unlock("staff1", "mia-manager", "Someone Else"));
    await assertFails(unlock("staff1", "max-manager", "Max Manager"));
    await assertSucceeds(unlock("staff1", "mia-manager", "Mia Manager"));
    assert.equal(await readTries("mia-manager"), 0);
    await assertSucceeds(getDocs(query(collection(db("staff1"), "sent"), orderBy("at", "desc"), limit(200))));
    // Lock: back to staff powers.
    await assertSucceeds(updateDoc(doc(db("staff1"), "staff", "staff1"), { role: "staff", pin: deleteField(), at: now() }));
    await assertFails(getDocs(query(collection(db("staff1"), "sent"), orderBy("at", "desc"), limit(200))));
  });
  test("an old right guess can't be used once someone has guessed since", async () => {
    await assertSucceeds(guess("staff1", "mia-manager", "4821", 1));
    await assertSucceeds(guess("staff2", "mia-manager", "0000", 2));
    await assertFails(unlock("staff1", "mia-manager", "Mia Manager"));
  });
  test("5 free guesses, then one every 15 minutes, then none after 10 until the owner resets it", async () => {
    for (let n = 1; n <= 5; n++) await assertSucceeds(guess("staff1", "mia-manager", "0000", n));
    await assertFails(guess("staff1", "mia-manager", "4821", 6));
    await seed((s) => updateDoc(doc(s, "seniors", "mia-manager"), { lastTry: Timestamp.fromMillis(Date.now() - 16 * 6e4) }));
    await assertSucceeds(guess("staff1", "mia-manager", "0000", 6));
    await assertFails(guess("staff1", "mia-manager", "4821", 7));
    await seed((s) => updateDoc(doc(s, "seniors", "mia-manager"), { tries: 10, lastTry: Timestamp.fromMillis(Date.now() - 864e5) }));
    await assertFails(guess("staff1", "mia-manager", "4821", 11));
    await assertFails(updateDoc(doc(db("mgr2"), "seniors", "mia-manager"), { tries: 0, lastTry: now() }));
    await assertFails(updateDoc(doc(db("staff1"), "seniors", "mia-manager"), { tries: 0, lastTry: now() }));
    await assertSucceeds(updateDoc(doc(db("owner1"), "seniors", "mia-manager"), { tries: 0, lastTry: now() }));
    await assertSucceeds(guess("staff1", "mia-manager", "4821", 1));
    await assertSucceeds(unlock("staff1", "mia-manager", "Mia Manager"));
  });
  test("taking a senior off takes away their powers on every phone; old password seniors no longer count", async () => {
    await assertSucceeds(getDocs(query(collection(db("mgr1"), "sent"), orderBy("at", "desc"), limit(200))));
    const d = db("owner1"), b = writeBatch(d);
    b.delete(doc(d, "seniors", "mia-manager")); b.delete(doc(d, "pins", "mia-manager"));
    await assertSucceeds(b.commit());
    await assertFails(getDocs(query(collection(db("mgr1"), "sent"), orderBy("at", "desc"), limit(200))));
    await seed((s) => setDoc(doc(s, "staff", "old1"), { name: "Old Senior", username: "old", role: "manager" }));
    await assertFails(getDocs(collection(db("old1"), "issues")));
    await assertSucceeds(deleteDoc(doc(db("owner1"), "staff", "old1")));
  });
  test("the owner sets their own code under 'owner'; picking it and typing it makes a phone the owner's, counted and locked the same", async () => {
    await assertFails(add("mgr1", "owner", "Derek", "7777"));
    await assertSucceeds(add("owner1", "owner", "Derek", "7777"));
    await assertSucceeds(guess("staff1", "owner", "1234", 1));
    await assertFails(unlock("staff1", "owner", "Derek"));
    await assertSucceeds(guess("staff1", "owner", "7777", 2));
    // Not as a manager, and not under another name.
    await assertFails(unlock("staff1", "owner", "Derek"));
    const asOwner = (uid, name = "Derek") => {
      const d = db(uid), b = writeBatch(d);
      b.update(doc(d, "staff", uid), { name, role: "owner", pin: "owner", at: now() });
      b.update(doc(d, "seniors", "owner"), { tries: 0, lastTry: now() });
      return b.commit();
    };
    await assertFails(asOwner("staff1", "Someone"));
    await assertSucceeds(asOwner("staff1"));
    assert.equal(await readTries("owner"), 0);
    // Owner powers: reads codes, reads Tell Derek, sets codes and the team code.
    await assertSucceeds(getDoc(doc(db("staff1"), "pins", "mia-manager")));
    await assertSucceeds(getDocs(query(collection(db("staff1"), "tells"), orderBy("at", "desc"), limit(200))));
    await assertSucceeds(add("staff1", "hassan", "Hassan", "6666"));
    // A senior's code can't make a phone the owner's.
    await assertSucceeds(guess("staff2", "mia-manager", "4821", 1));
    await assertFails(updateDoc(doc(db("staff2"), "staff", "staff2"), { name: "Mia Manager", role: "owner", pin: "mia-manager", at: now() }));
    // The password owner can take an owner-coded phone off; it can lock itself back to staff.
    await assertSucceeds(updateDoc(doc(db("staff1"), "staff", "staff1"), { name: "Sam Staff", role: "staff", pin: deleteField(), at: now() }));
    await assertFails(getDoc(doc(db("staff1"), "pins", "mia-manager")));
    await assertSucceeds(guess("staff1", "owner", "7777", 1));
    await assertSucceeds(asOwner("staff1"));
    await assertSucceeds(deleteDoc(doc(db("owner1"), "staff", "staff1")));
  });
  test("an owner-coded phone needs the current team code and the owner's code to still be set", async () => {
    await seed(async (s) => {
      await setDoc(doc(s, "staff", "ownph"), { name: "Derek", role: "owner", code: TEAM_CODE, pin: "owner", at: Timestamp.now() });
    });
    await assertFails(getDoc(doc(db("ownph"), "pins", "mia-manager")));
    await seed(async (s) => { await setDoc(doc(s, "seniors", "owner"), { name: "Derek", tries: 0, lastTry: Timestamp.now() }); await setDoc(doc(s, "pins", "owner"), await pinOf("7777")); });
    await assertSucceeds(getDoc(doc(db("ownph"), "pins", "mia-manager")));
    await seed((s) => setDoc(doc(s, "config", "team"), { code: "640275" }));
    await assertFails(getDocs(collection(db("ownph"), "issues")));
    await assertSucceeds(getDocs(collection(db("owner1"), "issues")));
  });
  test("nobody can make a login or an owner record from the app", async () => {
    await assertFails(setDoc(doc(db("owner1"), "usernames", "illias"), { email: emailOf("illias"), uid: "mgr1" }));
    await seed(async (s) => { await setDoc(doc(s, "staff", "old1"), { name: "Old Senior", username: "old", role: "manager" }); await setDoc(doc(s, "usernames", "old"), { email: emailOf("old"), uid: "old1" }); });
    await assertSucceeds(deleteDoc(doc(db("owner1"), "usernames", "old")));
    await assertFails(deleteDoc(doc(db("owner1"), "usernames", "olly")));
  });
});

describe("Tell Derek: only the owner reads them", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const tell = (uid, extra = {}) => ({ kind: "missing", text: "A list for the glass washer", status: "new", ...by(uid), ...extra });
  test("anyone on the team sends one; the owner reads all; the sender sees their own; seniors and others don't", async () => {
    const a = await assertSucceeds(addDoc(collection(db("staff1"), "tells"), tell("staff1")));
    await assertSucceeds(addDoc(collection(db("mgr1"), "tells"), tell("mgr1", { kind: "wrong" })));
    await assertSucceeds(getDocs(query(collection(db("owner1"), "tells"), orderBy("at", "desc"), limit(200))));
    await assertSucceeds(getDoc(doc(db("staff1"), "tells", a.id)));
    await assertSucceeds(getDocs(query(collection(db("staff1"), "tells"), where("uid", "==", "staff1"))));
    await assertFails(getDoc(doc(db("staff2"), "tells", a.id)));
    await assertFails(getDoc(doc(db("mgr1"), "tells", a.id)));
    await assertFails(getDocs(collection(db("mgr1"), "tells")));
    await assertFails(addDoc(collection(db("stranger"), "tells"), tell("stranger")));
  });
  test("bad ones are refused", async () => {
    for (const bad of [{ kind: "rant" }, { text: " " }, { text: "x".repeat(1001) }, { status: "done" }, { name: "Mia Manager" }, { extra: 1 }]) {
      await fails(addDoc(collection(db("staff1"), "tells"), tell("staff1", bad)), JSON.stringify(bad).slice(0, 40));
    }
  });
  test("only the owner marks one done or removes it", async () => {
    const a = await addDoc(collection(db("staff1"), "tells"), tell("staff1"));
    await assertFails(updateDoc(doc(db("staff1"), "tells", a.id), { status: "done" }));
    await assertFails(updateDoc(doc(db("mgr1"), "tells", a.id), { status: "done" }));
    await assertFails(updateDoc(doc(db("owner1"), "tells", a.id), { status: "done", text: "Changed" }));
    await assertSucceeds(updateDoc(doc(db("owner1"), "tells", a.id), { status: "done" }));
    await assertFails(deleteDoc(doc(db("mgr1"), "tells", a.id)));
    await assertSucceeds(deleteDoc(doc(db("owner1"), "tells", a.id)));
  });
});

describe("everything sent: a copy for the owner and seniors", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const sent = (uid, extra = {}) => ({ k: "close", what: "Closing", text: "Bar closed", ...by(uid), ...extra });
  const rate = (extra = {}) => ({ k: "rate", what: "Rate the shift", text: "8/10", anon: true, at: now(), ...extra });
  test("anyone on the team logs a copy in their name; only the owner and seniors read them", async () => {
    const a = await assertSucceeds(addDoc(collection(db("staff1"), "sent"), sent("staff1")));
    for (const uid of ["mgr1", "owner1"]) {
      await assertSucceeds(getDoc(doc(db(uid), "sent", a.id)));
      await assertSucceeds(getDocs(query(collection(db(uid), "sent"), orderBy("at", "desc"), limit(150))));
    }
    for (const uid of ["staff1", "staff2", "stranger"]) await assertFails(getDoc(doc(db(uid), "sent", a.id)));
    await assertFails(addDoc(collection(db("stranger"), "sent"), sent("stranger")));
    await assertFails(updateDoc(doc(db("mgr1"), "sent", a.id), { text: "Changed" }));
    await assertFails(deleteDoc(doc(db("mgr1"), "sent", a.id)));
    await assertSucceeds(deleteDoc(doc(db("owner1"), "sent", a.id)));
  });
  test("rate the shift goes with no name, uid or phone details, and only that way", async () => {
    await assertSucceeds(addDoc(collection(db("staff1"), "sent"), rate()));
    for (const bad of [{ uid: "staff1" }, { name: "Sam Staff" }, { anon: false }, { at: daysAgo(1) }, { side: "bar" }]) {
      await fails(addDoc(collection(db("staff1"), "sent"), rate(bad)), JSON.stringify(bad).slice(0, 40));
    }
    await assertFails(addDoc(collection(db("staff1"), "sent"), sent("staff1", { k: "rate" })));
  });
  test("My pay and the team link are never copied, and bad ones are refused", async () => {
    await assertFails(addDoc(collection(db("staff1"), "sent"), sent("staff1", { k: "hours" })));
    await assertFails(addDoc(collection(db("staff1"), "sent"), sent("staff1", { k: "team" })));
    await assertFails(addDoc(collection(db("staff1"), "sent"), sent("staff1", { k: "pay" })));
    await assertFails(addDoc(collection(db("staff1"), "sent"), { k: "hours", what: "My pay", text: "x", anon: true, at: now() }));
    for (const bad of [{ k: "" }, { k: "x".repeat(21) }, { what: " " }, { text: "x".repeat(8001) }, { name: "Mia Manager" }, { anon: true }, { extra: 1 }]) {
      await fails(addDoc(collection(db("staff1"), "sent"), sent("staff1", bad)), JSON.stringify(bad).slice(0, 40));
    }
  });
});

describe("to the manager: named or anonymous", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const named = (uid, extra = {}) => ({ kind: "dayoff", text: "Family wedding", when: "Sat 22 Nov", anon: false, status: "new", ...by(uid), ...extra });
  const anon = (extra = {}) => ({ kind: "complaint", text: "Rota changed with no notice", when: "", anon: true, status: "new", at: now(), ...extra });
  test("staff send them; only the owner and manager read them all; staff read back their own named ones", async () => {
    const a = await assertSucceeds(addDoc(collection(db("staff1"), "asks"), named("staff1")));
    const b = await assertSucceeds(addDoc(collection(db("staff1"), "asks"), anon()));
    for (const uid of ["mgr1", "owner1"]) { await assertSucceeds(getDoc(doc(db(uid), "asks", b.id))); await assertSucceeds(getDocs(query(collection(db(uid), "asks"), orderBy("at", "desc"), limit(200)))); }
    await assertSucceeds(getDoc(doc(db("staff1"), "asks", a.id)));
    await assertSucceeds(getDocs(query(collection(db("staff1"), "asks"), where("uid", "==", "staff1"))));
    await assertFails(getDoc(doc(db("staff1"), "asks", b.id)));
    await assertFails(getDoc(doc(db("staff2"), "asks", a.id)));
    await assertFails(getDocs(collection(db("staff2"), "asks")));
  });
  test("an anonymous one can't carry a name or a phone id; a named one is in your own name", async () => {
    for (const bad of [{ uid: "staff1" }, { name: "Sam Staff" }, { anon: "yes" }]) await assertFails(addDoc(collection(db("staff1"), "asks"), anon(bad)));
    for (const bad of [{ name: "Tia Staff" }, { uid: "staff2" }, { kind: "pay rise" }, { status: "done" }, { text: "x".repeat(2001) }, { when: "x".repeat(61) }]) {
      await assertFails(addDoc(collection(db("staff1"), "asks"), named("staff1", bad)));
    }
    await assertFails(addDoc(collection(db("stranger"), "asks"), anon()));
  });
  test("the manager marks it seen or done with a reply, in their own name, and can remove it; staff can't", async () => {
    const a = await addDoc(collection(db("staff1"), "asks"), named("staff1"));
    await assertFails(updateDoc(doc(db("staff1"), "asks", a.id), { status: "done", reply: "", by: "Sam Staff", byAt: now() }));
    await assertFails(updateDoc(doc(db("mgr1"), "asks", a.id), { status: "done", reply: "Fine", by: "Olly Owner", byAt: now() }));
    await assertFails(updateDoc(doc(db("mgr1"), "asks", a.id), { status: "done", reply: "Fine", by: "Mia Manager", byAt: now(), text: "Changed" }));
    await assertSucceeds(updateDoc(doc(db("mgr1"), "asks", a.id), { status: "done", reply: "Fine, enjoy it", by: "Mia Manager", byAt: now() }));
    await assertFails(deleteDoc(doc(db("staff1"), "asks", a.id)));
    await assertSucceeds(deleteDoc(doc(db("mgr1"), "asks", a.id)));
  });
});

describe("every query the app makes works for the people that make it", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const common = (d, uid) => [
    collection(d, "staff"),
    collection(d, "lists"),
    collection(d, "out"),
    query(collection(d, "outlog"), orderBy("at", "desc"), limit(100)),
    query(collection(d, "reports"), orderBy("at", "desc"), limit(30)),
    collection(d, "labels"),
    collection(d, "items"),
    collection(d, "shift", today(), "tasks"),
    collection(d, "shift", today(), "runs"),
    query(collection(d, "events"), where("day", "==", today()), limit(2000)),
    query(collection(d, "events"), where("ref", "==", autoId())),
    query(collection(d, "restock"), where("status", "in", ["asked", "given", "doing", "blocked", "delivered"])),
    query(collection(d, "restock"), orderBy("at", "desc"), limit(30)),
    query(collection(d, "photos"), where("report", "==", null)),
    query(collection(d, "drafts"), orderBy("at", "desc"), limit(6)),
    query(collection(d, "photos"), where("at", "<", daysAgo(31)), limit(100)),
    query(collection(d, "photos"), where("report", "==", "r1")),
    query(collection(d, "fixtures"), where("day", ">=", dayFromNow(-1)), orderBy("day"), limit(60)),
    query(collection(d, "issues"), where("status", "in", ["open", "taken"])),
    query(collection(d, "issues"), orderBy("at", "desc"), limit(30)),
  ];
  const managers = (d) => [
    query(collection(d, "asks"), orderBy("at", "desc"), limit(200)),
    query(collection(d, "sent"), orderBy("at", "desc"), limit(150)),
    query(collection(d, "listlog"), where("list", "==", "close")),
  ];
  test("staff", async () => {
    const d = db("staff1");
    for (const q of [...common(d, "staff1"), query(collection(d, "asks"), where("uid", "==", "staff1")), query(collection(d, "tells"), where("uid", "==", "staff1"))]) await assertSucceeds(getDocs(q));
    for (const q of managers(d)) await assertFails(getDocs(q));
    await assertSucceeds(getDoc(doc(d, "settings", "contacts")));
  });
  for (const uid of ["mgr1", "owner1"]) test(uid === "mgr1" ? "manager" : "owner", async () => {
    const d = db(uid);
    for (const q of [...common(d, uid), ...managers(d)]) await assertSucceeds(getDocs(q));
    await (uid === "owner1" ? assertSucceeds : assertFails)(getDocs(query(collection(d, "tells"), orderBy("at", "desc"), limit(200))));
    await assertSucceeds(getDocs(query(collection(d, "tells"), where("uid", "==", uid))));
  });
});
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
  test("stopping a task: anyone on the team", async () => {
    await assertSucceeds(task(db("staff1"), "staff1", "close", 3, "doing"));
    await assertSucceeds(task(db("staff2"), "staff2", "close", 3, "todo"));
    await assertSucceeds(task(db("staff2"), "staff2", "close", 3, "doing"));
    await assertSucceeds(task(db("mgr1"), "mgr1", "close", 3, "todo"));
  });
  test("taking back a done task (a mis-tap, or clearing the list): anyone on the team, with or without a reason", async () => {
    await assertSucceeds(task(db("staff1"), "staff1", "open", 4, "done"));
    await assertSucceeds(task(db("staff2"), "staff2", "open", 4, "todo"));
    await assertSucceeds(task(db("staff1"), "staff1", "open", 4, "done"));
    await assertSucceeds(task(db("mgr1"), "mgr1", "open", 4, "todo", { note: "Glasses still cloudy" }));
    // Done an hour ago by someone else.
    await seed((s) => setDoc(doc(s, "shift", today(), "tasks", "open-5"), { list: "open", item: 5, status: "done", who: null, whoUid: null, note: "", v: 1, uid: "staff1", name: "Sam Staff", at: Timestamp.fromMillis(Date.now() - 60 * 6e4) }));
    await assertSucceeds(task(db("staff2"), "staff2", "open", 5, "todo"));
    assert.deepEqual((await eventsOf("open-5")).map((e) => [e.from, e.to, e.name]), [["done", "todo", "Tia Staff"]]);
  });
  test("moves that make no sense are refused", async () => {
    await assertSucceeds(task(db("staff1"), "staff1", "open", 6, "done"));
    for (const to of ["done", "doing", "blocked", "cancelled", "started"]) await fails(task(db("mgr1"), "mgr1", "open", 6, to, { note: "Because" }), `done to ${to}`);
    await fails(task(db("staff1"), "staff1", "open", 7, "todo"), "not started to not started");
  });
  test("managers give a task to someone or take it off them; staff can't; a change of status keeps who it's for", async () => {
    await fails(task(db("staff1"), "staff1", "close", 15, null, { give: "staff1" }), "staff giving one to themselves");
    await assertSucceeds(task(db("mgr1"), "mgr1", "close", 16, null, { give: "staff2" }));
    let t = (await getDoc(doc(db("staff2"), "shift", today(), "tasks", "close-16"))).data();
    assert.deepEqual([t.status, t.who, t.whoUid], ["todo", "Tia Staff", "staff2"]);
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
  test("a finished procedure locks its tasks until someone reopens it, with a reason", async () => {
    await assertSucceeds(task(db("staff1"), "staff1", "fshake", 0, "done"));
    await assertSucceeds(run(db("staff1"), "staff1", "fshake", "finished", { done: 8, required: 8 }));
    await fails(task(db("staff1"), "staff1", "fshake", 0, "todo"), "locked");
    await fails(task(db("mgr1"), "mgr1", "fshake", 1, "done"), "locked for managers too");
    await fails(run(db("staff1"), "staff1", "fshake", "started", { done: 8, required: 8 }), "reopening without a reason");
    await assertSucceeds(run(db("staff1"), "staff1", "fshake", "started", { done: 7, required: 8, note: "Cleared" }));
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
    await assertSucceeds(save(db("mgr1"), "mgr1", "fclose"));
    await assertSucceeds(save(db("owner1"), "owner1", "fclose", { items: ITEMS.slice(0, 2) }));
    const l = (await getDoc(doc(db("staff1"), "lists", "fclose"))).data();
    assert.deepEqual([l.v, l.name, l.items, l.next], [2, "Olly Owner", ITEMS.slice(0, 2), 16]);
    await assertSucceeds(getDocs(collection(db("staff1"), "lists")));
    await fails(getDocs(collection(db("staff1"), "listlog")), "staff reading the history");
    await fails(getDoc(doc(db("staff1"), "listlog", "fclose-1")), "staff reading a version");
    const h = await getDocs(query(collection(db("mgr2"), "listlog"), where("list", "==", "fclose")));
    assert.deepEqual(h.docs.map((x) => [x.id, x.data().v, x.data().name, x.data().items.length]).sort(), [["fclose-1", 1, "Mia Manager", 3], ["fclose-2", 2, "Olly Owner", 2]]);
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
    await assertSucceeds(save(db("mgr1"), "mgr1", "fset"));
    for (const uid of ["mgr1", "owner1"]) {
      await fails(deleteDoc(doc(db(uid), "lists", "fset")), `${uid} deleting the list`);
      await fails(deleteDoc(doc(db(uid), "listlog", "fset-1")), `${uid} deleting a version`);
      await fails(updateDoc(doc(db(uid), "listlog", "fset-1"), { name: "Someone Else" }), `${uid} editing a version`);
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
    await assertSucceeds(act("mgr1", "added", { def: { item: "Philly cheese", side: "floor", life: 365, on: false } }));
  });
  test("nobody edits or deletes a label's history, the owner included", async () => {
    const id = await added();
    for (const uid of ["staff1", "mgr1", "owner1"]) {
      await fails(updateDoc(doc(db(uid), "events", `l-${id}-1`), { name: "Someone Else" }), `${uid} editing an event`);
      await fails(deleteDoc(doc(db(uid), "events", `l-${id}-1`)), `${uid} deleting an event`);
    }
  });
});

describe("date labels: stations, found open with no label, and photos", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  test("a station is optional, managers set or change it, and only as a change of details", async () => {
    const { b, id } = await labelBatch(db("mgr1"), "mgr1", "added", { l: { station: "Shake station" } });
    await assertSucceeds(b.commit());
    await fails((await labelBatch(db("mgr1"), "mgr1", "added", { l: { station: "x".repeat(31) } })).b.commit(), "station too long");
    await assertSucceeds((await labelBatch(db("mgr1"), "mgr1", "edited", { id, l: { station: "Cake fridge" } })).b.commit());
    await fails((await labelBatch(db("staff1"), "staff1", "opened", { id, l: { station: "Garnish station" } })).b.commit(), "staff moving it while opening");
    await assertSucceeds((await labelBatch(db("staff1"), "staff1", "opened", { id, l: { station: "Cake fridge" } })).b.commit());
  });
  // A label found open: dated back to the day it was opened, with a note, in the manager's name.
  async function found(uid, id, openedOn, { useBy, note = "Opened at Sunday's close, Hassan saw it", l = {} } = {}) {
    const d = db(uid), cur = await current(`labels/${id}`), v = cur.v + 1, b = writeBatch(d);
    const x = { item: cur.item, side: cur.side, life: cur.life, on: cur.on, state: "open", openedOn, useBy: useBy ?? plusDays(openedOn, cur.life), openedBy: TEAM[uid].name, openedUid: uid, act: "found", v, ...by(uid), ...l };
    b.set(doc(d, "labels", id), x);
    b.set(doc(d, "events", `l-${id}-${v}`), { kind: "label", day: today(), ref: id, label: cur.item, area: cur.side, act: "found", life: cur.life, on: cur.on, useBy: x.useBy, was: cur.useBy, note, v, ...by(uid) });
    return b.commit();
  }
  test("only managers date one found open, back to its life at most, with a note", async () => {
    const { b, id } = await labelBatch(db("mgr1"), "mgr1", "added", { def: { life: 3 } });
    await b.commit();
    await fails(found("staff1", id, plusDays(today(), -1)), "staff");
    await fails(found("mgr1", id, plusDays(today(), -1), { note: "" }), "no note");
    await fails(found("mgr1", id, plusDays(today(), 2)), "opened in the future");
    await fails(found("mgr1", id, plusDays(today(), -6)), "older than its life");
    await fails(found("mgr1", id, plusDays(today(), -1), { useBy: plusDays(today(), 5) }), "use-by past its life");
    await assertSucceeds(found("mgr1", id, plusDays(today(), -1)));
    const now = await current(`labels/${id}`);
    assert.equal(now.openedOn, plusDays(today(), -1)); assert.equal(now.useBy, plusDays(today(), 2)); assert.equal(now.openedBy, "Mia Manager");
    // A newer one found open on top of it: a manager dates that one too.
    await assertSucceeds(found("owner1", id, today()));
  });
  test("anyone on the team keeps a photo of a label's pack; managers remove it", async () => {
    const { b, id } = await labelBatch(db("mgr1"), "mgr1", "added");
    await b.commit();
    const ph = (uid, extra = {}) => ({ data: JPEG, label: "Apple juice", ...by(uid), ...extra });
    await assertSucceeds(setDoc(doc(db("staff1"), "labelPhotos", id), ph("staff1")));
    await assertSucceeds(setDoc(doc(db("staff2"), "labelPhotos", id), ph("staff2")));
    await assertSucceeds(getDoc(doc(db("staff1"), "labelPhotos", id)));
    await fails(setDoc(doc(db("staff1"), "labelPhotos", "nolabel123"), ph("staff1")), "no such label");
    await fails(setDoc(doc(db("staff1"), "labelPhotos", id), ph("staff1", { data: "data:image/png;base64,AAAA" })), "not a JPEG");
    await fails(setDoc(doc(db("staff1"), "labelPhotos", id), ph("staff1", { name: "Mia Manager" })), "someone else's name");
    await fails(deleteDoc(doc(db("staff1"), "labelPhotos", id)), "staff removing");
    await assertSucceeds(deleteDoc(doc(db("mgr1"), "labelPhotos", id)));
  });
});

describe("items the team adds: anyone suggests one, the owner approves it", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const item = (uid, extra = {}) => ({ item: "Rubicon Mango", kind: "soft", group: "Soft drinks and mixers", side: "bar", store: "bottle", label: false, life: 0,
    close: "keep", note: "", found: "Rubicon Drinks: UK soft drink manufacturer", status: "waiting", addedBy: TEAM[uid]?.name ?? "Stray", addedUid: uid, ...by(uid), ...extra });
  const add = (uid, extra) => addDoc(collection(db(uid), "items"), item(uid, extra));
  test("anyone on the team adds one, waiting; only the owner adds one live; everyone on the team reads them", async () => {
    const a = await assertSucceeds(add("staff1"));
    await assertSucceeds(add("mgr1", { item: "Fresh strawberries", kind: "fresh", group: "Fruit and garnish", store: "fridge", label: true, close: "cover" }));
    await fails(add("staff1", { status: "live" }), "staff adding live");
    await fails(add("mgr1", { status: "live" }), "a manager adding live");
    await assertSucceeds(add("owner1", { status: "live" }));
    await assertSucceeds(getDoc(doc(db("staff2"), "items", a.id)));
    await fails(add("stranger"), "not on the team");
    await fails(getDocs(collection(db("stranger"), "items")), "not on the team reading");
  });
  test("bad ones are refused", async () => {
    for (const bad of [{ item: " " }, { item: "x".repeat(61) }, { kind: "cocktail" }, { side: "kitchen" }, { store: "car" }, { close: "maybe" }, { label: "yes" },
      { life: -1 }, { life: 366 }, { life: 2.5 }, { note: "x".repeat(201) }, { addedBy: "Mia Manager" }, { addedUid: "mgr1" }, { name: "Mia Manager" }, { extra: 1 }]) {
      await fails(add("staff1", bad), JSON.stringify(bad).slice(0, 40));
    }
  });
  test("only the owner approves or changes one, and who added it never changes", async () => {
    const a = await add("staff1"), ref = (uid) => doc(db(uid), "items", a.id);
    await fails(updateDoc(ref("staff1"), { status: "live", ...by("staff1") }), "staff approving their own");
    await fails(updateDoc(ref("mgr1"), { status: "live", ...by("mgr1") }), "a manager approving");
    await fails(updateDoc(ref("owner1"), { status: "live", addedBy: "Olly Owner", ...by("owner1") }), "owner taking the credit");
    await assertSucceeds(updateDoc(ref("owner1"), { status: "live", life: 3, store: "fridge", ...by("owner1") }));
    const now = await current(`items/${a.id}`);
    assert.equal(now.addedBy, "Sam Staff"); assert.equal(now.status, "live");
  });
  test("whoever added one takes it back while it's waiting; the owner removes any; nobody else", async () => {
    const a = await add("staff1"), b = await add("staff2"), c = await add("staff1");
    await fails(deleteDoc(doc(db("staff2"), "items", a.id)), "someone else's");
    await fails(deleteDoc(doc(db("mgr1"), "items", a.id)), "a manager");
    await assertSucceeds(deleteDoc(doc(db("staff1"), "items", a.id)));
    await seed((s) => updateDoc(doc(s, "items", c.id), { status: "live" }));
    await fails(deleteDoc(doc(db("staff1"), "items", c.id)), "own one once it's live");
    await assertSucceeds(deleteDoc(doc(db("owner1"), "items", b.id)));
    await assertSucceeds(deleteDoc(doc(db("owner1"), "items", c.id)));
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
    for (const r of [{ item: "Lemons" }, { qty: 5 }, { dest: "down" }, { unit: "box" }, { detail: "Changed" }, { askedBy: "Tia Staff" }, { day: dayFromNow(-30) }]) {
      await fails(move(db("staff1"), "staff1", id, "delivered", { moved: 2, r }), JSON.stringify(r));
    }
    for (const who of ["staff1", "mgr1", "owner1"]) await fails(deleteDoc(doc(db(who), "restock", id)), `${who} deletes`);
  });
});

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
  test("nobody, the owner included, can edit or delete the log; everyone on the team reads it", async () => {
    const { b, log } = out86(db("staff1"), "staff1", "Mint"); await b.commit();
    for (const who of ["staff1", "mgr1", "owner1"]) {
      await assertFails(updateDoc(doc(db(who), "outlog", log), { action: "back" }));
      await assertFails(deleteDoc(doc(db(who), "outlog", log)));
    }
    await assertSucceeds(getDocs(collection(db("staff1"), "outlog")));
    await assertSucceeds(getDocs(collection(db("staff1"), "out")));
  });
});

describe("shift reports and photos", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  test("staff send a report; bad ones are refused", async () => {
    await assertSucceeds(addDoc(collection(db("staff1"), "reports"), report("staff1")));
    await assertSucceeds(addDoc(collection(db("staff1"), "reports"), report("staff1", { side: "floor" })));
    await assertFails(addDoc(collection(db("staff1"), "reports"), report("staff1", { side: "kitchen" })));
    for (const bad of [{ side: "cellar" }, { text: "   " }, { photos: 9 }, { photos: -1 }, { photos: "2" }, { name: "Mia Manager" }, { uid: "staff2" }, { signedBy: "Sam Staff" }]) {
      await assertFails(addDoc(collection(db("staff1"), "reports"), report("staff1", bad)));
    }
    const { side, ...noSide } = report("staff1");
    await assertFails(addDoc(collection(db("staff1"), "reports"), noSide));
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
  test("a photo can't be attached to an older report, someone else's report, or the other side's", async () => {
    const d = db("staff1");
    const old = await addDoc(collection(d, "reports"), report("staff1"));
    const p = await addDoc(collection(d, "photos"), photo("staff1"));
    await assertFails(updateDoc(doc(d, "photos", p.id), { report: old.id }));
    const theirs = sendReport(db("staff2"), "staff2", []); await theirs.b.commit();
    await assertFails(updateDoc(doc(d, "photos", p.id), { report: theirs.id }));
    await assertFails(sendReport(db("staff2"), "staff2", [p.id], { side: "floor" }).b.commit());
    await assertFails(addDoc(collection(d, "photos"), photo("staff1", { side: "kitchen" })));
    const { side: _s, ...noSide } = photo("staff1");
    await assertFails(addDoc(collection(d, "photos"), noSide));
  });
  test("tonight's unsent photos are shared: anyone closing the same side sees them, adds a note and sends them", async () => {
    const p = await addDoc(collection(db("staff1"), "photos"), photo("staff1"));
    await assertSucceeds(getDoc(doc(db("staff2"), "photos", p.id)));
    await assertSucceeds(getDocs(query(collection(db("staff2"), "photos"), where("report", "==", null))));
    await assertFails(getDocs(collection(db("stranger"), "photos")));
    await assertSucceeds(updateDoc(doc(db("staff2"), "photos", p.id), { note: "Back bar wiped" }));
    const sent = sendReport(db("staff2"), "staff2", [p.id]); await sent.b.commit();
    await assertSucceeds(getDocs(query(collection(db("staff1"), "photos"), where("report", "==", sent.id))));
    await assertFails(updateDoc(doc(db("staff1"), "photos", p.id), { note: "edited later" }));
    // An old draft from before photos had a side goes with whichever side sends it.
    await seed((s) => setDoc(doc(s, "photos/nos1"), { data: JPEG, note: "", report: null, uid: "staff1", name: "Sam Staff", at: now() }));
    await assertSucceeds(sendReport(db("staff1"), "staff1", ["nos1"], { side: "floor" }).b.commit());
  });
  test("unsent photos can be binned by anyone on the team; only photos over 30 days old can be cleared by managers", async () => {
    const p = await addDoc(collection(db("staff1"), "photos"), photo("staff1"));
    await assertFails(deleteDoc(doc(db("stranger"), "photos", p.id)));
    await assertSucceeds(deleteDoc(doc(db("staff2"), "photos", p.id)));
    await seed((s) => setDoc(doc(s, "photos/old1"), { ...photo("staff1"), report: "abcdefghijabcdefghij", at: daysAgo(31) }));
    await assertFails(deleteDoc(doc(db("staff2"), "photos/old1")));
    await assertSucceeds(getDocs(query(collection(db("mgr1"), "photos"), where("at", "<", daysAgo(30)), limit(100))));
    await assertSucceeds(deleteDoc(doc(db("mgr1"), "photos/old1")));
  });
});

describe("tonight's handover draft, one per side, shared live", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const day = today();
  const draft = (uid, extra = {}) => ({ day, side: "bar", low: "Limes", issues: "", next: "Prep: mint", closer: "Sam Staff", noPhotos: "", ...by(uid), ...extra });
  test("anyone on the team writes it, everyone on the team reads it, and anyone clears it", async () => {
    await assertSucceeds(setDoc(doc(db("staff1"), "drafts", `${day}-bar`), draft("staff1")));
    await assertSucceeds(setDoc(doc(db("staff2"), "drafts", `${day}-bar`), draft("staff2", { low: "Limes, mint" })));
    for (const uid of ["staff1", "mgr1", "owner1"]) assert.equal((await getDoc(doc(db(uid), "drafts", `${day}-bar`))).data().low, "Limes, mint");
    await assertFails(getDoc(doc(db("stranger"), "drafts", `${day}-bar`)));
    await assertFails(setDoc(doc(db("stranger"), "drafts", `${day}-bar`), draft("stranger")));
    await assertSucceeds(deleteDoc(doc(db("staff1"), "drafts", `${day}-bar`)));
  });
  test("the id matches its night and side; bad ones are refused", async () => {
    await assertFails(setDoc(doc(db("staff1"), "drafts", `${day}-floor`), draft("staff1")));
    await assertFails(setDoc(doc(db("staff1"), "drafts", "2020-01-01-bar"), draft("staff1", { day: "2020-01-01" })));
    for (const bad of [{ side: "kitchen" }, { low: "x".repeat(2001) }, { closer: "x".repeat(301) }, { name: "Mia Manager" }, { at: daysAgo(1) }, { extra: 1 }]) {
      await fails(setDoc(doc(db("staff1"), "drafts", `${day}-${bad.side || "bar"}`), draft("staff1", bad)), JSON.stringify(bad).slice(0, 40));
    }
  });
});

describe("Log it: one line for tonight's handover, in the day's events", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const day = today();
  const line = (uid, extra = {}) => ({ kind: "log", day, area: "bar", what: "note", label: "Ice machine leaking", note: "", ...by(uid), ...extra });
  const id = () => `g-${autoId()}`;
  test("anyone on the team logs, everyone on the team reads it, and only its writer or a manager takes it off", async () => {
    const a = id(), b = id();
    await assertSucceeds(setDoc(doc(db("staff1"), "events", a), line("staff1")));
    await assertSucceeds(setDoc(doc(db("staff1"), "events", b), line("staff1", { what: "told", label: "Told Mia: two kegs left" })));
    for (const uid of ["staff2", "mgr1", "owner1"]) assert.equal((await getDoc(doc(db(uid), "events", a))).data().label, "Ice machine leaking");
    await assertFails(getDoc(doc(db("stranger"), "events", a)));
    await fails(deleteDoc(doc(db("staff2"), "events", a)), "someone else took it off");
    await assertFails(updateDoc(doc(db("staff1"), "events", a), { label: "changed" }));
    await assertSucceeds(deleteDoc(doc(db("staff1"), "events", a)));
    await assertSucceeds(deleteDoc(doc(db("mgr1"), "events", b)));
  });
  test("a closing tick's history can't be deleted, even by a manager", async () => {
    await seed((s) => setDoc(doc(s, "events", "t-x"), { kind: "task", day }));
    await assertFails(deleteDoc(doc(db("owner1"), "events", "t-x")));
  });
  test("the shape is fixed: a real kind, side and id, the writer's own name and the server's time", async () => {
    await fails(setDoc(doc(db("stranger"), "events", id()), line("stranger")), "not on the team");
    await fails(setDoc(doc(db("staff1"), "events", "g-short"), line("staff1")), "bad id");
    await fails(setDoc(doc(db("staff1"), "events", `t-${autoId()}`), line("staff1")), "a log under a task id");
    for (const bad of [{ what: "gossip" }, { what: "out" }, { area: "kitchen" }, { label: "" }, { label: "x".repeat(201) }, { note: "x" }, { name: "Mia Manager" }, { at: daysAgo(1) }, { day: "2020-01-01" }, { extra: 1 }]) {
      await fails(setDoc(doc(db("staff1"), "events", id()), line("staff1", bad)), JSON.stringify(bad).slice(0, 40));
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
    await assertFails(setDoc(ref("mgr1"), { list: Array(31).fill(list[0]), ...by("mgr1") }));
    await assertFails(setDoc(ref("mgr1"), { list: "DPS 07700 900123", ...by("mgr1") }));
    await assertFails(setDoc(ref("mgr1"), { list, ...by("mgr1"), extra: 1 }));
    await assertFails(setDoc(ref("mgr1"), { list, ...by("mgr1"), name: "Max Manager" }));
    await assertFails(deleteDoc(ref("mgr1")));
  });
});

describe("no messaging inside the app", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  for (const c of ["notices", "seen", "templates", "shouts", "chat", "bcast"]) test(`${c} is closed to everyone`, async () => {
    for (const uid of ["staff1", "mgr1", "owner1"]) {
      await assertFails(getDocs(collection(db(uid), c)));
      await assertFails(addDoc(collection(db(uid), c), { text: "hi", ...by(uid) }));
    }
  });
});

describe("the names to pick from: the managers keep them", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const names = (uid, extra = {}) => setDoc(doc(db(uid), "settings", "names"), { mgr: ["Mia"], bar: ["Sam"], floor: ["Tia"], ...by(uid), ...extra });
  test("managers and the owner save them, everyone on the team reads them, nobody else", async () => {
    await assertSucceeds(names("mgr1"));
    await assertSucceeds(names("owner1"));
    await assertFails(names("staff1"));
    await assertFails(names("mgr1", { bar: Array(41).fill("x") }));
    await assertFails(names("mgr1", { kitchen: ["Chef"] }));
    await assertSucceeds(getDoc(doc(db("staff1"), "settings", "names")));
    await assertFails(getDoc(doc(db("phone9"), "settings", "names")));
    await assertFails(getDoc(doc(db(), "settings", "names")));
  });
});

describe("issues and handover", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const raise = (uid, extra) => addDoc(collection(db(uid), "issues"), issue(uid, extra));
  const take = (actor, id, whoUid) => updateDoc(doc(db(actor), "issues", id), { status: "taken", who: TEAM[whoUid].name, whoUid, setBy: TEAM[actor].name, setByUid: actor, setAt: now() });
  const fix = (actor, id, note, extra = {}) => updateDoc(doc(db(actor), "issues", id), { status: "fixed", fix: note, fixedBy: TEAM[actor].name, fixedByUid: actor, fixedAt: now(), ...extra });
  test("anyone raises one; bad ones are refused", async () => {
    await assertSucceeds(raise("staff1"));
    for (const bad of [{ title: "  " }, { area: "roof" }, { urgent: "yes" }, { status: "fixed" }, { again: "nope" }, { photo: "x" }]) await assertFails(raise("staff1", bad));
  });
  test("take it on yourself, or give it to someone else on the team", async () => {
    const i = await raise("staff1");
    await assertSucceeds(take("staff2", i.id, "staff2"));
    await assertSucceeds(take("staff2", i.id, "staff1"));
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
    await assertSucceeds(deleteDoc(doc(db("mgr1"), "issues", j.id)));
  });
});

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

describe("stock count: lines, deliveries and the setup", () => {
  beforeEach(async () => { await env.clearFirestore(); await seedTeam(); });
  const line = (uid, o = {}) => ({ day: today(), area: "Back bar", item: "Kraken", unit: "bottle", full: 3, open: 40, ...by(uid), ...o });
  const id = (d = today()) => `${d}--back-bar--kraken`;
  test("anyone on the team counts a line under their own name, filed under its own day", async () => {
    await assertSucceeds(setDoc(doc(db("staff1"), "counts", id()), line("staff1")));
    await assertSucceeds(setDoc(doc(db("staff2"), "counts", id()), line("staff2", { full: 4, open: 0 })));
    await assertSucceeds(getDocs(query(collection(db("staff1"), "counts"), where("day", "==", today()))));
    await fails(setDoc(doc(db("staff1"), "counts", id("2020-01-01")), line("staff1")), "filed under another day");
    await fails(setDoc(doc(db("staff1"), "counts", id()), line("staff1", { open: 100 })), "open is under one");
    await fails(setDoc(doc(db("staff1"), "counts", id()), line("staff1", { full: 1.5 })), "whole ones are whole");
    await fails(setDoc(doc(db("staff1"), "counts", id()), line("staff1", { full: -1 })), "negative");
    await fails(setDoc(doc(db("staff1"), "counts", id()), { ...line("staff1"), name: "Tia Staff" }), "someone else's name");
    await fails(setDoc(doc(db("staff1"), "counts", id()), line("staff1", { price: 20 })), "anything else");
    await fails(setDoc(doc(db(null), "counts", id()), line("staff1")), "not on the team");
    await assertSucceeds(deleteDoc(doc(db("staff1"), "counts", id())));
  });
  test("deliveries: whoever logged one or a manager takes it off", async () => {
    const r = (uid, o = {}) => ({ day: today(), item: "Kraken", unit: "bottle", qty: 600, ...by(uid), ...o });
    const ref = doc(collection(db("staff1"), "received"));
    await assertSucceeds(setDoc(ref, r("staff1")));
    await fails(addDoc(collection(db("staff1"), "received"), r("staff1", { qty: 0 })), "nothing came in");
    await fails(addDoc(collection(db("staff1"), "received"), r("staff1", { qty: 1.5 })), "hundredths are whole");
    await fails(deleteDoc(doc(db("staff2"), "received", ref.id)), "someone else's");
    await assertSucceeds(deleteDoc(doc(db("mgr1"), "received", ref.id)));
  });
  test("only managers set the count up", async () => {
    const s = (uid, o = {}) => ({ areas: ["Speed rail", "Back bar"], items: { Kraken: { a: ["Back bar"], u: "bottle", e: 600, f: 1265, ml: 700, pw: 0, off: false } }, order: { "Back bar": ["Kraken"] }, ...by(uid), ...o });
    await fails(setDoc(doc(db("staff1"), "countSetup", "main"), s("staff1")), "staff");
    await assertSucceeds(setDoc(doc(db("mgr1"), "countSetup", "main"), s("mgr1")));
    await assertSucceeds(setDoc(doc(db("owner1"), "countSetup", "main"), s("owner1")));
    await fails(setDoc(doc(db("mgr1"), "countSetup", "other"), s("mgr1")), "only main");
    await fails(setDoc(doc(db("mgr1"), "countSetup", "main"), s("mgr1", { areas: "Bar" })), "places are a list");
    await assertSucceeds(getDoc(doc(db("staff1"), "countSetup", "main")));
  });
});

describe("which rules these are", () => {
  test("the build's fingerprint can be asked for; any other is refused, and nothing can be written", async () => {
    const id = fs.readFileSync(new URL("../firestore.rules", import.meta.url), "utf8").match(/v == '([0-9a-f]{12})'; \/\/ RULES-FINGERPRINT/)[1];
    await assertSucceeds(getDoc(doc(db("staff1"), "rulesv", id)));
    await fails(getDoc(doc(db("staff1"), "rulesv", "0123456789ab")), "a different build's fingerprint");
    await fails(getDoc(doc(db(null), "rulesv", id)), "not signed in");
    await fails(setDoc(doc(db("owner1"), "rulesv", id), { x: 1 }), "writing one");
  });
});
