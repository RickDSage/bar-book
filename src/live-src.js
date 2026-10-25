// Live team layer: individual logins, the team board, notices, shift reports, the shared 86 list and checklists,
// synced through Firebase. Bundled by site.js into live.js. The app script owns the UI; this module fills in LIVE
// and calls liveChanged(). Every write here has a matching rule in firestore.rules and a test in test/rules.test.mjs.
// Each person logs in with a username and a PIN. Under the hood that is a Firebase email/password account with a
// made-up address; usernames/{username} maps the username to it. Access comes from having a staff/{uid} record.
import { initializeApp } from "firebase/app";
import {
  getAuth, initializeAuth, inMemoryPersistence, connectAuthEmulator, onAuthStateChanged,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updatePassword, deleteUser,
} from "firebase/auth";
import {
  initializeFirestore, persistentLocalCache, connectFirestoreEmulator, doc, getDoc, setDoc, addDoc, deleteDoc, updateDoc,
  collection, query, orderBy, limit, onSnapshot, serverTimestamp, writeBatch, where, getDocs, Timestamp,
  terminate, clearIndexedDbPersistence,
} from "firebase/firestore";

const app = initializeApp(__CONFIG__);
const auth = getAuth(app);
// A second auth instance creates accounts for other people without logging the manager out.
const maker = initializeAuth(initializeApp(__CONFIG__, "maker"), { persistence: inMemoryPersistence });
// Kept on the phone so the app works with no signal. Logging out clears it.
const db = initializeFirestore(app, { localCache: persistentLocalCache() });
if (__EMU__) {
  for (const a of [auth, maker]) connectAuthEmulator(a, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

// PINs are 6 to 12 digits. Managers and the owner can see far more, so theirs must be at least 8.
const USER = /^[a-z0-9.]{2,20}$/, PIN = /^\d{6,12}$/, BOSS_PIN = 8, MAX_PHOTOS = 8, CODE_MIN = 16;
const emailFor = (u) => `${u}-${crypto.randomUUID().slice(0, 8)}@users.example.com`;
// The 86 board keys each item by this, and the rules check it the same way.
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const ms = (t) => (t ? t.toMillis() : Date.now());
const err = (msg) => { throw new Error(msg); };
let stop = null, subs = {}, settingUp = false;
const unsub = (k) => { if (subs[k]) { subs[k](); delete subs[k]; } };
const unsubAll = () => { Object.keys(subs).forEach(unsub); if (stop) { stop(); stop = null; } };
// A listen the rules refuse (account not confirmed by the server yet) is dropped and retried on the next staff snapshot.
function sub(k, ref, fn) {
  if (subs[k]) return;
  subs[k] = onSnapshot(ref, (snap) => { LIVE.loaded.add(k); fn(snap); }, () => delete subs[k]);
}
// Something just written on this phone has no server time yet, so its "at" is null and it sorts as newest. (Firestore's
// own estimate is rounded down to the second, which can put it below something written a moment earlier.)
const rows = (snap) => snap.docs.map((x) => ({ id: x.id, pending: x.metadata.hasPendingWrites, ...x.data() })).sort((a, b) => ms(b.at) - ms(a.at));
const me = () => ({ uid: auth.currentUser.uid, name: LIVE.me, at: serverTimestamp() });

function listen(uid) {
  unsubAll();
  // Removal or a role change by a manager takes effect straight away.
  stop = onSnapshot(doc(db, "staff", uid), { includeMetadataChanges: true }, (d) => {
    // A first launch with no signal has nothing cached yet; wait for the server rather than logging out.
    if (!d.exists()) { if (!settingUp && !d.metadata.fromCache) leave(); return; }
    const s = d.data();
    if (LIVE.me !== s.name || LIVE.role !== s.role) {
      // What someone can read depends on their role, so a new role starts every listener again.
      if (LIVE.role && LIVE.role !== s.role) { Object.keys(subs).forEach(unsub); LIVE.loaded.clear(); }
      LIVE.me = s.name; LIVE.username = s.username; LIVE.role = s.role;
      LIVE.admin = s.role === "manager" || s.role === "owner"; LIVE.owner = s.role === "owner";
      liveChanged("me");
    }
    if (d.metadata.hasPendingWrites) return;
    sub("feed", query(collection(db, "feed"), orderBy("at", "desc"), limit(40)), (snap) => { LIVE.feed = rows(snap); liveChanged("feed"); });
    sub("out", collection(db, "out"), (snap) => {
      LIVE.outInfo = new Map(snap.docs.map((x) => [x.data().itemName, x.data({ serverTimestamps: "estimate" })]));
      LIVE.out = new Set(LIVE.outInfo.keys());
      liveChanged("out");
    });
    sub("notices", query(collection(db, "notices"), orderBy("at", "desc")), (snap) => { LIVE.notices = rows(snap); liveChanged("notices"); });
    sub("reports", query(collection(db, "reports"), orderBy("at", "desc"), limit(30)), (snap) => { LIVE.reports = rows(snap); liveChanged("reports"); });
    sub("requests", query(collection(db, "requests"), orderBy("at", "desc"), limit(50)), (snap) => { LIVE.requests = rows(snap); liveChanged("requests"); });
    watchShift();
    // Closing photos this person has taken that aren't on a sent report yet.
    sub("photos", query(collection(db, "photos"), where("uid", "==", uid), where("report", "==", null)), (snap) => {
      LIVE.myPhotos = rows(snap).reverse(); liveChanged("photos");
    });
    // Issues: everything still open, however old, plus the latest few including fixed ones.
    const issues = { open: [], recent: [] };
    const mergeIssues = () => { LIVE.issues = [...new Map([...issues.recent, ...issues.open].map((x) => [x.id, x])).values()].sort((a, b) => ms(b.at) - ms(a.at)); liveChanged("issues"); };
    sub("issues", query(collection(db, "issues"), where("status", "in", ["open", "taken"])), (snap) => { issues.open = rows(snap); mergeIssues(); });
    sub("issues-recent", query(collection(db, "issues"), orderBy("at", "desc"), limit(30)), (snap) => { issues.recent = rows(snap); mergeIssues(); });
    // Time off, swaps and lateness: staff see their own, managers see everyone's.
    sub("asks", LIVE.admin ? query(collection(db, "asks"), orderBy("at", "desc"), limit(100)) : query(collection(db, "asks"), where("uid", "==", uid)), (snap) => {
      LIVE.asks = rows(snap); liveChanged("asks");
    });
    if (!LIVE.admin) { Object.assign(LIVE, { staff: [], outlog: [], incidents: [], reviews: [], ratings: [], audit: [] }); return; }
    sub("incidents", query(collection(db, "incidents"), orderBy("at", "desc"), limit(50)), (snap) => { LIVE.incidents = rows(snap); liveChanged("incidents"); });
    sub("reviews", query(collection(db, "reviews"), orderBy("at", "desc"), limit(200)), (snap) => { LIVE.reviews = rows(snap); liveChanged("reviews"); });
    // Anonymous feedback: the owner reads all of it, a manager only what's about them.
    sub("ratings", LIVE.owner ? query(collection(db, "ratings"), orderBy("at", "desc"), limit(100)) : query(collection(db, "ratings"), where("about", "==", uid)), (snap) => {
      LIVE.ratings = rows(snap); liveChanged("ratings");
    });
    sub("outlog", query(collection(db, "outlog"), orderBy("at", "desc"), limit(100)), (snap) => { LIVE.outlog = rows(snap); liveChanged("outlog"); });
    sub("staff", collection(db, "staff"), (snap) => {
      LIVE.staff = snap.docs.map((x) => ({ uid: x.id, ...x.data() })).sort((a, b) => a.name.localeCompare(b.name));
      liveChanged("staff");
    });
    sub("audit", query(collection(db, "audit"), orderBy("at", "desc"), limit(30)), (snap) => { LIVE.audit = rows(snap); liveChanged("audit"); });
    clearOldPhotos();
  }, () => {});
}

// Logging out, or being removed, wipes this phone's copy of the team's data, then starts the app afresh.
let leaving = false;
async function leave() {
  if (leaving) return;
  leaving = true; unsubAll();
  await signOut(auth).catch(() => {});
  await terminate(db).catch(() => {});
  await clearIndexedDbPersistence(db).catch(() => {});
  location.reload();
}

// Photos live in the database (Firebase Storage needs a paid plan), so they're cleared after 30 days to stay free.
// A day's margin keeps clear of the rule's own 30-day check if this phone's clock is a little out.
const KEEP_DAYS = 30;
async function clearOldPhotos() {
  const cutoff = Timestamp.fromMillis(Date.now() - (KEEP_DAYS + 1) * 864e5);
  const old = await getDocs(query(collection(db, "photos"), where("at", "<", cutoff), limit(100))).catch(() => null);
  if (!old || old.empty) return;
  // Ten at a time: each delete is checked against the manager's staff record, and one batch may only make 20 such checks.
  for (let i = 0; i < old.docs.length; i += 10) {
    const b = writeBatch(db); old.docs.slice(i, i + 10).forEach((d) => b.delete(d.ref)); await b.commit().catch(() => {});
  }
}

// Tonight's checklist ticks: one small record per ticked item, shared by everyone on shift.
// A new business day starts a fresh list.
let shiftKey = null;
function watchShift() {
  if (shiftKey === shiftDay() && subs.shift) return;
  unsub("shift"); shiftKey = shiftDay();
  sub("shift", collection(db, "shift", shiftKey, "ticks"), (snap) => {
    const ticks = {}, by = {};
    for (const x of snap.docs) {
      const t = x.data({ serverTimestamps: "estimate" });
      (ticks[t.list] ||= []).push(t.item);
      by[x.id] = { ...t, pending: x.metadata.hasPendingWrites };
    }
    LIVE.ticks = ticks; LIVE.tickBy = by;
    liveChanged("ticks");
  });
}
setInterval(() => { if (LIVE.me) watchShift(); }, 60000);
const tickRef = (list, i) => doc(db, "shift", shiftDay(), "ticks", `${list}-${i}`);

// Makes a login for someone else, runs the database write, and deletes the login again if the write is refused.
async function withAccount(username, pin, write) {
  const { user } = await createUserWithEmailAndPassword(maker, emailFor(username), pin);
  try { await write(user); }
  catch (e) { await deleteUser(user).catch(() => {}); throw e; }
  finally { await signOut(maker).catch(() => {}); }
}
// Every account change writes one of these in the same batch; the rules refuse the change without it.
function audit(b, id, action, person, actor = { uid: auth.currentUser.uid, name: LIVE.me }) {
  b.set(doc(db, "audit", id), {
    action, target: person.uid, targetName: person.name, username: person.username, role: person.role,
    uid: actor.uid, name: actor.name, at: serverTimestamp(),
  });
}
const staffRecord = (p) => ({ name: p.name, username: p.username, role: p.role });

LIVE.api = {
  async login(username, pin) {
    const u = await getDoc(doc(db, "usernames", username));
    if (!u.exists()) err("Wrong username or PIN");
    // After many wrong PINs Firebase locks the login for a while. Calling that a wrong PIN would send people round in circles.
    await signInWithEmailAndPassword(auth, u.data().email, pin).catch((e) => err(e.code === "auth/too-many-requests" ? "Too many wrong PINs. Wait a few minutes, then try again"
      : e.code === "auth/network-request-failed" ? "Could not log in. Check your signal" : "Wrong username or PIN"));
  },
  logout: () => leave(),
  changePin: (pin) => updatePassword(auth.currentUser, pin),
  // First-time setup of the owner account, allowed once by the setup code in config/pins. One batch claims
  // config/owner, writes the owner's records and deletes the code, so it can't be used again.
  async setup(name, username, pin, code) {
    if ((await getDoc(doc(db, "usernames", username))).exists()) err("That username is taken");
    settingUp = true;
    try {
      const { user } = await createUserWithEmailAndPassword(auth, emailFor(username), pin);
      const owner = { uid: user.uid, name, username, role: "owner" }, b = writeBatch(db);
      b.set(doc(db, "config", "owner"), { uid: user.uid, proof: code });
      b.set(doc(db, "staff", user.uid), staffRecord(owner));
      b.set(doc(db, "usernames", username), { email: user.email, uid: user.uid });
      audit(b, user.uid + "-in", "setup", owner, owner);
      b.delete(doc(db, "config", "pins"));
      await b.commit().catch(async () => { await deleteUser(user).catch(() => {}); err("That setup code didn't work, or setup has already been done"); });
    } finally { settingUp = false; }
  },
  async addPerson(name, username, pin, role) {
    if ((await getDoc(doc(db, "usernames", username))).exists()) err("That username is taken");
    await withAccount(username, pin, (user) => {
      const p = { uid: user.uid, name, username, role }, b = writeBatch(db);
      b.set(doc(db, "staff", user.uid), staffRecord(p));
      b.set(doc(db, "usernames", username), { email: user.email, uid: user.uid });
      audit(b, user.uid + "-in", "add", p);
      return b.commit();
    });
  },
  // Firebase can't change someone else's password from the app, so a reset moves them to a fresh account.
  resetPin(person, pin) {
    return withAccount(person.username, pin, (user) => {
      const b = writeBatch(db);
      b.set(doc(db, "staff", user.uid), staffRecord(person));
      b.set(doc(db, "usernames", person.username), { email: user.email, uid: user.uid });
      b.delete(doc(db, "staff", person.uid));
      audit(b, user.uid + "-in", "reset", { ...person, uid: user.uid });
      audit(b, person.uid + "-out", "reset", person);
      return b.commit();
    });
  },
  // Removes their access and their username. What they wrote keeps their name.
  remove(person) {
    const b = writeBatch(db);
    b.delete(doc(db, "usernames", person.username));
    b.delete(doc(db, "staff", person.uid));
    audit(b, person.uid + "-out", "remove", person);
    return b.commit();
  },
  setRole(person, role) {
    const b = writeBatch(db);
    b.update(doc(db, "staff", person.uid), { role });
    audit(b, doc(collection(db, "audit")).id, "role", { ...person, role });
    return b.commit();
  },
  post: (text) => addDoc(collection(db, "feed"), { kind: "comment", text, ...me() }),
  removePost: (id) => deleteDoc(doc(db, "feed", id)),
  pin: (text) => addDoc(collection(db, "notices"), { text, ...me() }),
  unpin: (id) => deleteDoc(doc(db, "notices", id)),
  // The report and its photos go in one write, so the photos can't end up on the wrong report.
  sendReport(side, text, summary) {
    const b = writeBatch(db), ref = doc(collection(db, "reports")), photos = LIVE.myPhotos.slice(0, MAX_PHOTOS);
    b.set(ref, { side, text, summary, photos: photos.length, ...me() });
    photos.forEach((p) => b.update(doc(db, "photos", p.id), { report: ref.id }));
    return b.commit();
  },
  tick: (list, i, on) => (on ? setDoc(tickRef(list, i), { list, item: i, ...me() }) : deleteDoc(tickRef(list, i))),
  // Managers only: clears one side's ticks (bar or floor) for everyone and leaves the other side's alone.
  clearTicks: (lists) => Promise.all(Object.values(LIVE.tickBy).filter((t) => lists.includes(t.list)).map((t) => deleteDoc(tickRef(t.list, t.item)))),
  request: (item, note) => addDoc(collection(db, "requests"), { item, note, done: false, ...me() }),
  cancelRequest: (id) => deleteDoc(doc(db, "requests", id)),
  markOrdered: (id) => updateDoc(doc(db, "requests", id), { done: true, doneBy: LIVE.me, doneByUid: auth.currentUser.uid, doneAt: serverTimestamp() }),
  addPhoto: (data) => addDoc(collection(db, "photos"), { data, note: "", report: null, ...me() }),
  notePhoto: (id, note) => updateDoc(doc(db, "photos", id), { note }),
  deletePhoto: (id) => deleteDoc(doc(db, "photos", id)),
  loadPhotos: (reportId) => getDocs(query(collection(db, "photos"), where("report", "==", reportId))).then((s) => s.docs.map((x) => ({ id: x.id, ...x.data() })).sort((a, b) => ms(a.at) - ms(b.at))),
  KEEP_DAYS,
  signOff: (id) => updateDoc(doc(db, "reports", id), { signedBy: LIVE.me, signedByUid: auth.currentUser.uid, signedAt: serverTimestamp() }),
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
  // Only the fields each kind needs, so nothing left over from another form goes with it.
  ask(a) {
    const extra = { late: { eta: a.eta }, off: { date1: a.date1, date2: a.date2 }, swap: { date1: a.date1, with: a.with } }[a.kind];
    return addDoc(collection(db, "asks"), { kind: a.kind, ...extra, note: a.note, status: "pending", ...me() });
  },
  cancelAsk: (id) => deleteDoc(doc(db, "asks", id)),
  decide: (id, status) => updateDoc(doc(db, "asks", id), { status, by: LIVE.me, byUid: auth.currentUser.uid, byAt: serverTimestamp() }),
  incident: (kind, text) => addDoc(collection(db, "incidents"), { kind, text, status: "open", ...me() }),
  closeIncident: (id, outcome) => updateDoc(doc(db, "incidents", id), { status: "closed", outcome, closedBy: LIVE.me, closedByUid: auth.currentUser.uid, closedAt: serverTimestamp() }),
  review: (report, verdict, text) => addDoc(collection(db, "reviews"), { report, verdict, text, ...me() }),
  removeReview: (id) => deleteDoc(doc(db, "reviews", id)),
  // No name or uid is saved, so nobody (the owner included) can tell who wrote it.
  rate: (person, score, text) => addDoc(collection(db, "ratings"), { about: person.uid, aboutName: person.name, score, text, at: serverTimestamp() }),
  // Issues and handover: raise, take on (or give to someone), mark fixed. "Still broken" raises a new one linked back.
  raise: (x) => addDoc(collection(db, "issues"), { title: x.title, detail: x.detail, area: x.area, urgent: x.urgent, again: x.again || null, status: "open", ...me() }),
  take: (id, person) => updateDoc(doc(db, "issues", id), { status: "taken", who: person.name, whoUid: person.uid, setBy: LIVE.me, setByUid: auth.currentUser.uid, setAt: serverTimestamp() }),
  fixed: (id, fix) => updateDoc(doc(db, "issues", id), { status: "fixed", fix, fixedBy: LIVE.me, fixedByUid: auth.currentUser.uid, fixedAt: serverTimestamp() }),
  withdrawIssue: (id) => deleteDoc(doc(db, "issues", id)),
  USER, PIN, BOSS_PIN, MAX_PHOTOS, CODE_MIN,
};

const EMPTY = () => ({ uid: null, me: null, username: null, role: null, admin: false, owner: false, feed: [], out: new Set(), outInfo: new Map(), notices: [], reports: [], outlog: [], staff: [], myPhotos: [], requests: [], ticks: {}, tickBy: {}, asks: [], incidents: [], reviews: [], ratings: [], issues: [], audit: [] });
onAuthStateChanged(auth, (u) => {
  LIVE.ready = true;
  if (u) { LIVE.uid = u.uid; listen(u.uid); return; }
  unsubAll(); LIVE.loaded.clear();
  Object.assign(LIVE, EMPTY());
  shiftKey = null;
  liveChanged("me");
});
liveChanged("me");
