// Live team layer: who is on the team, live messages, the 86 board, tonight's checklists, date labels, restocking,
// closing photos and reports, issues, football, who to call, asks to the seniors, Tell Derek and a copy of everything sent, synced through Firebase.
// Bundled by site.js into live.js. The app script owns the UI; this module fills in LIVE and calls liveChanged().
// Every write here has a matching rule in firestore.rules and a test in test/rules.test.mjs.
//
// Bar and floor staff have no login: the phone signs in anonymously and joins with the team code from the team link,
// under the first name picked on the phone. Only the owner and the manager have a username and password (underneath, a
// Firebase email/password account with a made-up address; usernames/{username} points the login screen at it).
import { initializeApp } from "firebase/app";
import {
  getAuth, initializeAuth, inMemoryPersistence, connectAuthEmulator, onAuthStateChanged, signInAnonymously,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updatePassword, deleteUser,
} from "firebase/auth";
import {
  initializeFirestore, persistentLocalCache, connectFirestoreEmulator, doc, getDoc, setDoc, addDoc, deleteDoc, updateDoc,
  collection, query, orderBy, limit, onSnapshot, serverTimestamp, writeBatch, where, getDocs, Timestamp,
  terminate, clearIndexedDbPersistence,
} from "firebase/firestore";

const app = initializeApp(__CONFIG__);
const auth = getAuth(app);
// A second auth instance makes the manager's account without logging the owner out.
const maker = initializeAuth(initializeApp(__CONFIG__, "maker"), { persistence: inMemoryPersistence });
// Kept on the phone so the app works with no signal. Leaving clears it.
const db = initializeFirestore(app, { localCache: persistentLocalCache() });
if (__EMU__) {
  for (const a of [auth, maker]) connectAuthEmulator(a, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

// Passwords for the two accounts: 6 characters or more (Firebase's minimum). Team codes are 8 or more.
const USER = /^[a-z0-9.]{2,20}$/, PASSWORD_MIN = 6, CODE_MIN = 8, MAX_PHOTOS = 8;
const emailFor = (u) => `${u}-${crypto.randomUUID().slice(0, 8)}@users.example.com`;
// The 86 board keys each item by this, and the rules check it the same way.
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const ms = (t) => (t ? t.toMillis() : Date.now());
const err = (msg) => { throw new Error(msg); };
let stop = null, subs = {};
const unsub = (k) => { if (subs[k]) { subs[k](); delete subs[k]; } };
const unsubAll = () => { Object.keys(subs).forEach(unsub); if (stop) { stop(); stop = null; } };
// A listen the rules refuse (a join not confirmed by the server yet) is dropped and retried on the next staff snapshot.
function sub(k, ref, fn, failed) {
  if (subs[k]) return;
  subs[k] = onSnapshot(ref, (snap) => { LIVE.loaded.add(k); fn(snap); }, (e) => { delete subs[k]; failed?.(e); });
}
// Ids go into the page's HTML. The app only ever makes plain ones (letters, digits, dashes), so a record with any other
// id was written some other way and is skipped. The id goes after a record's own fields so a field called id can't
// take its place. Something just written on this phone has no server time yet, so it sorts as newest.
const plain = (x) => /^[A-Za-z0-9-]+$/.test(x.id);
const rows = (snap) => snap.docs.filter(plain).map((x) => ({ ...x.data(), id: x.id, pending: x.metadata.hasPendingWrites })).sort((a, b) => ms(b.at) - ms(a.at));
const me = () => ({ uid: auth.currentUser.uid, name: LIVE.me, at: serverTimestamp() });

function listen(uid) {
  unsubAll();
  // Being taken off the team (by the manager, or a new team code) takes effect straight away.
  let seen = false;
  stop = onSnapshot(doc(db, "staff", uid), { includeMetadataChanges: true }, (d) => {
    // A record this phone has seen going away means it was taken off the team. A record that isn't there yet means a
    // phone that has signed in but not joined (or a join still saving): the welcome screen asks for the team link.
    if (!d.exists()) {
      if (seen && !d.metadata.fromCache) { liveChanged("removed"); leave(); }
      else if (!d.metadata.hasPendingWrites && LIVE.me) { LIVE.me = null; liveChanged("me"); }
      return;
    }
    if (!d.metadata.hasPendingWrites) seen = true;
    const s = d.data();
    if (LIVE.me !== s.name || LIVE.role !== s.role) {
      if (LIVE.role && LIVE.role !== s.role) { Object.keys(subs).forEach(unsub); LIVE.loaded.clear(); }
      LIVE.me = s.name; LIVE.username = s.username || null; LIVE.role = s.role;
      LIVE.admin = s.role === "manager" || s.role === "owner"; LIVE.owner = s.role === "owner";
      liveChanged("me");
    }
    if (d.metadata.hasPendingWrites) return;
    // Who is on the team: everyone's phones and the owner and seniors. Used for giving someone a job.
    sub("staff", collection(db, "staff"), (snap) => {
      LIVE.staff = snap.docs.filter(plain).map((x) => ({ name: x.data().name, role: x.data().role, at: x.data().at || null, uid: x.id })).sort((a, b) => a.name.localeCompare(b.name));
      liveChanged("staff");
    // Only a refusal means this phone is off the team. Anything else (the free plan's daily limit used up, a server
    // hiccup) must not sign the phone out and wipe it: it keeps showing what it last saw and listens again later.
    }, (e) => { if (e?.code === "permission-denied" && !d.metadata.fromCache) { liveChanged("removed"); leave(); } });
    // Live messages, newest first, and who has tapped Got it on them.
    // The manager's versions of the closing lists. A list with none here is the app's standard one.
    sub("lists", collection(db, "lists"), (snap) => {
      LIVE.lists = Object.fromEntries(snap.docs.filter(plain).map((x) => [x.id, { ...x.data({ serverTimestamps: "estimate" }), id: x.id, pending: x.metadata.hasPendingWrites }]));
      liveChanged("lists");
    });
    sub("out", collection(db, "out"), (snap) => {
      LIVE.outInfo = new Map(snap.docs.map((x) => [x.data().itemName, x.data({ serverTimestamps: "estimate" })]));
      LIVE.out = new Set(LIVE.outInfo.keys());
      liveChanged("out");
    });
    sub("outlog", query(collection(db, "outlog"), orderBy("at", "desc"), limit(100)), (snap) => { LIVE.outlog = rows(snap); liveChanged("outlog"); });
    sub("reports", query(collection(db, "reports"), orderBy("at", "desc"), limit(30)), (snap) => { LIVE.reports = rows(snap); liveChanged("reports"); });
    watchDays();
    // Date labels: every item each side dates once it's opened. There are only ever a few dozen.
    sub("labels", collection(db, "labels"), (snap) => { LIVE.labels = rows(snap); liveChanged("labels"); });
    // Restocking: everything still open, however old, plus the latest few including finished ones. The two can hold the
    // same record a moment apart, so the newer version wins.
    const rs = { open: [], recent: [] };
    const mergeRestock = () => {
      const by = new Map();
      for (const x of [...rs.recent, ...rs.open]) if (!by.has(x.id) || x.v >= by.get(x.id).v) by.set(x.id, x);
      LIVE.restock = [...by.values()].sort((a, b) => ms(b.at) - ms(a.at)); liveChanged("restock");
    };
    sub("restock", query(collection(db, "restock"), where("status", "in", RS_OPEN)), (snap) => { rs.open = rows(snap); mergeRestock(); });
    sub("restock-recent", query(collection(db, "restock"), orderBy("at", "desc"), limit(30)), (snap) => { rs.recent = rows(snap); mergeRestock(); });
    // Tonight's closing photos that aren't on a sent report yet, whoever took them: the phone shows its side's.
    sub("photos", query(collection(db, "photos"), where("report", "==", null)), (snap) => {
      LIVE.draftPhotos = rows(snap).sort((a, b) => ms(a.at) - ms(b.at)); liveChanged("photos");
    });
    // Tonight's handover drafts, one per side, shared by everyone closing it.
    sub("drafts", query(collection(db, "drafts"), orderBy("at", "desc"), limit(6)), (snap) => {
      LIVE.drafts = rows(snap); liveChanged("drafts");
    });
    // Football: today's games and the ones coming up. Old ones drop off the screen by date.
    sub("fixtures", query(collection(db, "fixtures"), where("day", ">=", ukDay(Date.now() - 864e5)), orderBy("day"), limit(60)), (snap) => { LIVE.fixtures = rows(snap); liveChanged("fixtures"); });
    // Issues: everything still open, however old, plus the latest few including fixed ones.
    const issues = { open: [], recent: [] };
    const mergeIssues = () => { LIVE.issues = [...new Map([...issues.recent, ...issues.open].map((x) => [x.id, x])).values()].sort((a, b) => ms(b.at) - ms(a.at)); liveChanged("issues"); };
    sub("issues", query(collection(db, "issues"), where("status", "in", ["open", "taken"])), (snap) => { issues.open = rows(snap); mergeIssues(); });
    sub("issues-recent", query(collection(db, "issues"), orderBy("at", "desc"), limit(30)), (snap) => { issues.recent = rows(snap); mergeIssues(); });
    // To the manager: the manager and owner read all of them; staff read back their own named ones.
    sub("asks", LIVE.admin ? query(collection(db, "asks"), orderBy("at", "desc"), limit(200)) : query(collection(db, "asks"), where("uid", "==", uid)), (snap) => {
      LIVE.asks = rows(snap); liveChanged("asks");
    });
    // Tell Derek: the owner reads all of them; everyone else reads back their own.
    sub("tells", LIVE.owner ? query(collection(db, "tells"), orderBy("at", "desc"), limit(200)) : query(collection(db, "tells"), where("uid", "==", uid)), (snap) => {
      LIVE.tells = rows(snap); liveChanged("tells");
    });
    // A copy of everything the team sends on WhatsApp, email or print, for the seniors and the owner.
    if (LIVE.admin) sub("sent", query(collection(db, "sent"), orderBy("at", "desc"), limit(150)), (snap) => { LIVE.sent = rows(snap); liveChanged("sent"); });
    // Who to call: the venue's own numbers, kept by the manager.
    sub("contacts", doc(db, "settings", "contacts"), (x) => { LIVE.contacts = x.exists() ? x.data().list : []; liveChanged("contacts"); });
    if (LIVE.admin) clearOldPhotos();
  }, () => {});
}

// The house photo and how-to video of the drink that's open, kept live while it's open. LIVE.media says which drink
// it's for, so a drink just swiped to shows nothing of the last one's.
let mediaFor = "";
function watchMedia(drink) {
  if (drink === mediaFor && (subs.media || !drink)) return;
  unsub("media"); mediaFor = drink || ""; LIVE.media = null;
  const show = (m) => { LIVE.media = { photo: "", video: "", pending: false, ...m, drink }; liveChanged("media"); };
  if (drink) sub("media", doc(db, "drinkMedia", slug(drink)), (d) => show({ ...d.data({ serverTimestamps: "estimate" }), pending: d.metadata.hasPendingWrites }), () => show());
}

// Leaving, or being taken off the team, wipes this phone's copy of the team's data, then starts the app afresh.
let leaving = false;
async function leave() {
  if (leaving) return;
  leaving = true; unsubAll();
  await signOut(auth).catch(() => {});
  await terminate(db).catch(() => {});
  await clearIndexedDbPersistence(db).catch(() => {});
  location.reload();
}

// Photos live in the database (Firebase Storage needs a paid plan), so the owner's or the manager's phone clears them
// after 30 days to stay free. A day's margin keeps clear of the rule's own 30-day check if this phone's clock is a little out.
const KEEP_DAYS = 30;
async function clearOldPhotos() {
  const cutoff = Timestamp.fromMillis(Date.now() - (KEEP_DAYS + 1) * 864e5);
  const old = await getDocs(query(collection(db, "photos"), where("at", "<", cutoff), limit(100))).catch(() => null);
  if (!old || old.empty) return;
  for (let i = 0; i < old.docs.length; i += 10) {
    const b = writeBatch(db); old.docs.slice(i, i + 10).forEach((d) => b.delete(d.ref)); await b.commit().catch(() => {});
  }
}

// Listeners tied to the business day start again with the new query when it rolls over at 6am.
const dayKeys = {};
function subDay(k, ref, fn, when = shiftDay()) {
  if (dayKeys[k] === when && subs[k]) return;
  unsub(k); dayKeys[k] = when;
  sub(k, ref(), fn);
}
// Tonight's tasks (one record per checklist item), procedures (one per list) and every change to them or to restocking,
// for the business day. A record still saving shows the phone's estimate of the time, and says it's pending.
const byId = (snap) => Object.fromEntries(snap.docs.filter(plain).map((x) => [x.id, { ...x.data({ serverTimestamps: "estimate" }), id: x.id, pending: x.metadata.hasPendingWrites }]));
function watchDays() {
  subDay("tasks", () => collection(db, "shift", shiftDay(), "tasks"), (snap) => { LIVE.tasks = byId(snap); liveChanged("tasks"); });
  subDay("runs", () => collection(db, "shift", shiftDay(), "runs"), (snap) => { LIVE.runs = byId(snap); liveChanged("runs"); });
  subDay("events", () => query(collection(db, "events"), where("day", "==", shiftDay()), limit(2000)), (snap) => { LIVE.events = rows(snap); liveChanged("events"); });
}
setInterval(() => { if (LIVE.me) watchDays(); }, 60000);
// Which side of the venue each list and each restocking destination belongs to, as the rules work it out.
const SIDE = { open: "bar", close: "bar", fset: "floor", fshake: "floor", fclose: "floor" };
const DEST_SIDE = { up: "bar", down: "bar", shakes: "floor", floor: "floor" };
const RS_OPEN = ["asked", "given", "doing", "blocked", "delivered"];
const joinErr = (e) => err(e.code === "permission-denied" ? "That team link didn't work. Ask for the latest one in the staff group"
  : ["auth/operation-not-allowed", "auth/admin-restricted-operation"].includes(e.code) ? "Joining isn't switched on yet in Firebase (Anonymous sign-in)" : "Couldn't join. Check your signal and try again");

LIVE.api = {
  // A staff phone: signs in anonymously if it hasn't yet, then joins (or changes its name) with the team code.
  async join(code, name) {
    if (!auth.currentUser) await signInAnonymously(auth).catch(joinErr);
    await setDoc(doc(db, "staff", auth.currentUser.uid), { name, role: "staff", code, at: serverTimestamp() }).catch(joinErr);
  },
  // The owner and the manager.
  async login(username, password) {
    const u = await getDoc(doc(db, "usernames", username)).catch(() => err("Could not log in. Check your signal"));
    if (!u.exists()) err("Wrong username or password");
    // After many wrong tries Firebase locks the login for a while. Calling that a wrong password would send people round in circles.
    if (auth.currentUser?.isAnonymous) await deleteDoc(doc(db, "staff", auth.currentUser.uid)).catch(() => {});
    await signInWithEmailAndPassword(auth, u.data().email, password).catch((e) => err(e.code === "auth/too-many-requests" ? "Too many wrong tries. Wait a few minutes, then try again"
      : e.code === "auth/network-request-failed" ? "Could not log in. Check your signal" : "Wrong username or password"));
  },
  // Leaving the team on this phone. A staff phone's record goes too.
  async leave() {
    if (auth.currentUser?.isAnonymous) await deleteDoc(doc(db, "staff", auth.currentUser.uid)).catch(() => {});
    liveChanged("left");
    return leave();
  },
  changePassword: (pw) => updatePassword(auth.currentUser, pw),
  // The owner adds the manager's account: a username and a password the owner picks and gives them.
  async addManager(name, username, password) {
    if ((await getDoc(doc(db, "usernames", username))).exists()) err("That username is taken");
    const { user } = await createUserWithEmailAndPassword(maker, emailFor(username), password);
    try {
      const b = writeBatch(db);
      b.set(doc(db, "staff", user.uid), { name, username, role: "manager" });
      b.set(doc(db, "usernames", username), { email: user.email, uid: user.uid });
      await b.commit();
    } catch (e) { await deleteUser(user).catch(() => {}); throw e; } finally { await signOut(maker).catch(() => {}); }
  },
  // Takes a phone or the manager off the team. What they wrote keeps their name.
  remove(person) {
    const b = writeBatch(db);
    if (person.role === "manager" && person.username) b.delete(doc(db, "usernames", person.username));
    b.delete(doc(db, "staff", person.uid));
    return b.commit();
  },
  // Live messages. side: all, bar or floor. level: urgent, asap or info.
  // To the manager. An anonymous one holds no name and no device id.
  ask: (a) => addDoc(collection(db, "asks"), { kind: a.kind, text: a.text, when: a.when, anon: a.anon, status: "new", ...(a.anon ? { at: serverTimestamp() } : me()) }),
  answer: (id, status, reply = "") => updateDoc(doc(db, "asks", id), { status, reply, by: LIVE.me, byAt: serverTimestamp() }),
  dropAsk: (id) => deleteDoc(doc(db, "asks", id)),
  tell: (kind, text) => addDoc(collection(db, "tells"), { kind, text, status: "new", ...me() }),
  tellDone: (id) => updateDoc(doc(db, "tells", id), { status: "done" }),
  dropTell: (id) => deleteDoc(doc(db, "tells", id)),
  logSent: (k, what, text, anon) => addDoc(collection(db, "sent"), anon ? { k, what, text, anon: true, at: serverTimestamp() } : { k, what, text, ...me() }),
  // The manager's version of a list: its items, the id the next new item gets, and a copy in the list's history, in
  // one write. The version goes up by one, so a save made from an old copy is refused instead of overwriting.
  saveList(key, items, next) {
    const v = (LIVE.lists[key]?.v || 0) + 1, x = { items, next, v, ...me() }, b = writeBatch(db);
    b.set(doc(db, "lists", key), x);
    b.set(doc(db, "listlog", `${key}-${v}`), { list: key, ...x });
    return b.commit();
  },
  // Every saved version of a list, newest first, read once when the manager opens its history.
  listHistory: (key) => getDocs(query(collection(db, "listlog"), where("list", "==", key))).then((s) => rows(s).sort((a, b) => b.v - a.v)),
  // The report and its photos go in one write, so the photos can't end up on the wrong report.
  sendReport(side, text, summary, draft) {
    const b = writeBatch(db), ref = doc(collection(db, "reports")), photos = draft.slice(0, MAX_PHOTOS);
    b.set(ref, { side, text, summary, photos: photos.length, ...me() });
    photos.forEach((p) => b.update(doc(db, "photos", p.id), { report: ref.id }));
    return b.commit();
  },
  // A change to one of tonight's tasks: to is todo, doing, done, blocked or cancelled (not needed), or give is someone
  // ({name, uid}, or null for nobody) to give it to without changing where it's up to. The task and its event go in one
  // write. Each change raises the version by one, so a change made from an old copy (two phones at once, or a phone
  // that was offline) is refused instead of overwriting the newer one, and a retried write can't add a second event.
  setTask(list, item, label, to, { note, give } = {}) {
    const day = shiftDay(), id = `${list}-${item}`, cur = LIVE.tasks[id], v = (cur?.v || 0) + 1, from = cur?.status || "todo";
    note ??= give === undefined ? "" : cur?.note || "";
    const who = give === undefined ? cur?.who ?? null : give?.name ?? null, whoUid = give === undefined ? cur?.whoUid ?? null : give?.uid ?? null;
    const status = give === undefined ? to : from, b = writeBatch(db);
    b.set(doc(db, "shift", day, "tasks", id), { list, item, status, who, whoUid, note, v, ...me() });
    b.set(doc(db, "events", `t-${day}-${id}-${v}`), { kind: "task", day, list, item, label, area: SIDE[list], from, to: status, who, note, v, ...me() });
    return b.commit();
  },
  // A procedure (one list, tonight): started, then finished. done and required are counted from tonight's tasks.
  setRun(list, label, to, done, required, note = "") {
    const day = shiftDay(), cur = LIVE.runs[list], v = (cur?.v || 0) + 1, from = cur?.status || "todo", b = writeBatch(db);
    b.set(doc(db, "shift", day, "runs", list), { list, status: to, done, required, note, v, ...me() });
    b.set(doc(db, "events", `r-${day}-${list}-${v}`), { kind: "run", day, list, label, area: SIDE[list], from, to, done, required, note, v, ...me() });
    return b.commit();
  },
  // A date label: added, edited or removed (item, side, life and on say what it is), or opened, changed or binned
  // (useBy is the date written on it). Opening and changing date it today and put this person's name on it. The label
  // and its event go in one write, and the version goes up by one, so a change made from an old copy is refused.
  label(x, act, { item, side, life, on, useBy } = {}) {
    const day = shiftDay(), add = act === "added", ref = add ? doc(collection(db, "labels")) : doc(db, "labels", x.id), v = add ? 1 : x.v + 1;
    const def = add || act === "edited" ? { item, side, life, on } : { item: x.item, side: x.side, life: x.life, on: x.on };
    const open = act === "opened" || act === "changed", shut = add || act === "binned", keep = (k) => (shut ? null : x[k]);
    const now = act === "removed" ? null : {
      ...def, state: open ? "open" : shut ? "none" : x.state, openedOn: open ? day : keep("openedOn"), useBy: open ? useBy : keep("useBy"),
      openedBy: open ? LIVE.me : keep("openedBy"), openedUid: open ? auth.currentUser.uid : keep("openedUid"), act, v, ...me(),
    };
    const b = writeBatch(db);
    if (now) b.set(ref, now); else b.delete(ref);
    b.set(doc(db, "events", `l-${ref.id}-${v}`), { kind: "label", day, ref: ref.id, label: def.item, area: def.side, act, life: def.life, on: def.on,
      useBy: now ? now.useBy : null, was: add ? null : x.useBy, note: "", v, ...me() });
    return b.commit();
  },
  // Every change to one date label, oldest first, read when someone opens its history.
  eventsOf: (id, kind) => getDocs(query(collection(db, "events"), where("ref", "==", id))).then((s) => rows(s).filter((e) => e.kind === kind).sort((a, b) => a.v - b.v)),
  askRestock({ item, qty, unit, dest, detail }) {
    const day = shiftDay(), ref = doc(collection(db, "restock")), b = writeBatch(db);
    b.set(ref, { item, qty, unit, dest, detail, day, status: "asked", who: null, whoUid: null, moved: null, got: null, note: "", v: 1, askedBy: LIVE.me, askedUid: auth.currentUser.uid, askedAt: serverTimestamp(), ...me() });
    b.set(doc(db, "events", `s-${ref.id}-1`), { kind: "restock", day, ref: ref.id, label: item, area: DEST_SIDE[dest], from: "new", to: "asked", who: null, qty, unit, dest, note: "", v: 1, ...me() });
    return b.commit();
  },
  // to: given (to give, {name, uid}), doing (taken on by this person), delivered (moved: how much was brought up),
  // received (got: how much arrived), unavailable, blocked, cancelled, or asked (back to waiting, which clears who has
  // it and the amounts).
  moveRestock(r, to, { note = "", give, moved, got } = {}) {
    const v = r.v + 1, back = to === "asked";
    const p = to === "given" ? give : to === "doing" ? { name: LIVE.me, uid: auth.currentUser.uid } : back ? null : { name: r.who, uid: r.whoUid };
    const m = to === "delivered" ? moved : back ? null : r.moved, g = to === "received" ? got : back ? null : r.got, b = writeBatch(db);
    b.update(doc(db, "restock", r.id), { status: to, who: p?.name ?? null, whoUid: p?.uid ?? null, moved: m, got: g, note, v, ...me() });
    b.set(doc(db, "events", `s-${r.id}-${v}`), { kind: "restock", day: shiftDay(), ref: r.id, label: r.item, area: DEST_SIDE[r.dest], from: r.status, to, who: p?.name ?? null,
      qty: to === "delivered" ? m : to === "received" ? g : null, unit: r.unit, dest: r.dest, note, v, ...me() });
    return b.commit();
  },
  addPhoto: (data, side) => addDoc(collection(db, "photos"), { data, note: "", report: null, side, ...me() }),
  saveDraft: (side, x) => { const day = shiftDay(); return setDoc(doc(db, "drafts", `${day}-${side}`), { day, side, ...x, ...me() }); },
  dropDraft: (side) => deleteDoc(doc(db, "drafts", `${shiftDay()}-${side}`)),
  notePhoto: (id, note) => updateDoc(doc(db, "photos", id), { note }),
  deletePhoto: (id) => deleteDoc(doc(db, "photos", id)),
  loadPhotos: (reportId) => getDocs(query(collection(db, "photos"), where("report", "==", reportId))).then((s) => s.docs.filter(plain).map((x) => ({ ...x.data(), id: x.id })).sort((a, b) => ms(a.at) - ms(b.at))),
  KEEP_DAYS,
  // The board and its log change in one write. Back in stock writes "{the 86's log id}-back", so the two always match.
  set86(name, on) {
    const item = slug(name), ref = doc(db, "out", item), b = writeBatch(db);
    if (on) {
      const log = doc(collection(db, "outlog"));
      b.set(ref, { itemName: name, log: log.id, ...me() });
      b.set(log, { item, itemName: name, action: "out", ...me() });
    } else {
      const now = LIVE.outInfo.get(name);
      if (!now) return Promise.reject(new Error("It isn't on the 86 list"));
      b.delete(ref);
      b.set(doc(db, "outlog", now.log + "-back"), { item, itemName: name, action: "back", ...me() });
    }
    return b.commit();
  },
  addFixture: (x) => addDoc(collection(db, "fixtures"), { day: x.day, ko: x.ko, home: x.home, away: x.away, comp: x.comp, channel: x.channel, screen: x.screen, ...me() }),
  dropFixture: (id) => deleteDoc(doc(db, "fixtures", id)),
  // Issues: raise, take on (or give to someone), mark fixed. "Still broken" raises a new one linked back.
  raise: (x) => addDoc(collection(db, "issues"), { title: x.title, detail: x.detail, area: x.area, urgent: x.urgent, again: x.again || null, status: "open", ...me() }),
  take: (id, person) => updateDoc(doc(db, "issues", id), { status: "taken", who: person.name, whoUid: person.uid, setBy: LIVE.me, setByUid: auth.currentUser.uid, setAt: serverTimestamp() }),
  fixed: (id, fix) => updateDoc(doc(db, "issues", id), { status: "fixed", fix, fixedBy: LIVE.me, fixedByUid: auth.currentUser.uid, fixedAt: serverTimestamp() }),
  withdrawIssue: (id) => deleteDoc(doc(db, "issues", id)),
  saveContacts: (list) => setDoc(doc(db, "settings", "contacts"), { list, ...me() }),
  watchMedia,
  // A drink's photo and video link, saved together. With neither, the record goes.
  setMedia: (drink, photo, video) => (photo || video ? setDoc(doc(db, "drinkMedia", slug(drink)), { drink, photo, video, ...me() }) : deleteDoc(doc(db, "drinkMedia", slug(drink)))),
  USER, PASSWORD_MIN, CODE_MIN, MAX_PHOTOS,
};

const EMPTY = () => ({ lists: {}, uid: null, me: null, username: null, role: null, admin: false, owner: false, anon: false, staff: [], out: new Set(), outInfo: new Map(),
  outlog: [], reports: [], contacts: [], draftPhotos: [], drafts: [], tasks: {}, runs: {}, events: [], labels: [], restock: [], fixtures: [], issues: [], asks: [], tells: [], sent: [], media: null });
onAuthStateChanged(auth, (u) => {
  LIVE.ready = true;
  if (u) { LIVE.uid = u.uid; LIVE.anon = u.isAnonymous; listen(u.uid); liveChanged("me"); return; }
  unsubAll(); LIVE.loaded.clear();
  Object.assign(LIVE, EMPTY());
  liveChanged("me");
});
liveChanged("me");
