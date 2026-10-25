// Live team layer: individual logins, shared feed (comments and shift reports) and a shared 86 list, synced through Firebase.
// Bundled by site.js into live.js. The app script owns the UI; this module fills in LIVE and calls liveChanged().
// Each person logs in with a username and a 6-digit PIN. Under the hood that is a Firebase email/password account
// with a made-up address; usernames/{username} maps the username to it. Access comes from having a staff/{uid} doc.
import { initializeApp } from "firebase/app";
import {
  getAuth, initializeAuth, inMemoryPersistence, connectAuthEmulator, onAuthStateChanged,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updatePassword,
} from "firebase/auth";
import {
  initializeFirestore, persistentLocalCache, connectFirestoreEmulator, doc, getDoc, setDoc, addDoc, deleteDoc, updateDoc,
  collection, query, orderBy, limit, onSnapshot, serverTimestamp, writeBatch, where, getDocs, Timestamp, arrayUnion, arrayRemove,
} from "firebase/firestore";

const app = initializeApp(__CONFIG__);
const auth = getAuth(app);
// A second auth instance creates accounts for other people without logging the manager out.
const maker = initializeAuth(initializeApp(__CONFIG__, "maker"), { persistence: inMemoryPersistence });
const db = initializeFirestore(app, { localCache: persistentLocalCache() });
if (__EMU__) {
  for (const a of [auth, maker]) connectAuthEmulator(a, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

const USER = /^[a-z0-9.]{2,20}$/, PIN = /^\d{6}$/;
const emailFor = (u) => `${u}-${Math.random().toString(36).slice(2, 8)}@users.example.com`;
const outId = (name) => encodeURIComponent(name);
const ms = (t) => (t ? t.toMillis() : Date.now());
const err = (msg) => { throw new Error(msg); };
let stop = null, subs = {}, settingUp = false;
const unsub = (k) => { if (subs[k]) { subs[k](); delete subs[k]; } };
const unsubAll = () => { Object.keys(subs).forEach(unsub); if (stop) { stop(); stop = null; } };
// A listen the rules refuse (account not confirmed by the server yet) is dropped and retried on the next staff snapshot.
function sub(k, ref, fn) { if (!subs[k]) subs[k] = onSnapshot(ref, fn, () => delete subs[k]); }

function listen(uid) {
  unsubAll();
  // Removal or a role change by a manager takes effect straight away.
  stop = onSnapshot(doc(db, "staff", uid), { includeMetadataChanges: true }, (d) => {
    if (!d.exists()) { if (!settingUp) signOut(auth); return; }
    const s = d.data();
    if (LIVE.me !== s.name || LIVE.role !== s.role) {
      LIVE.me = s.name; LIVE.username = s.username; LIVE.role = s.role;
      LIVE.admin = s.role === "manager" || s.role === "owner"; LIVE.owner = s.role === "owner";
      liveChanged("me");
    }
    if (d.metadata.hasPendingWrites) return;
    sub("feed", query(collection(db, "feed"), orderBy("at", "desc"), limit(40)), (snap) => {
      LIVE.feed = snap.docs.map((x) => ({ id: x.id, pending: x.metadata.hasPendingWrites, ...x.data({ serverTimestamps: "estimate" }) }));
      liveChanged("feed");
    });
    sub("out", collection(db, "out"), (snap) => {
      LIVE.outInfo = new Map(snap.docs.map((x) => [x.data().name, x.data({ serverTimestamps: "estimate" })]));
      LIVE.out = new Set(LIVE.outInfo.keys());
      liveChanged("out");
    });
    sub("notices", query(collection(db, "notices"), orderBy("at", "desc")), (snap) => {
      LIVE.notices = snap.docs.map((x) => ({ id: x.id, pending: x.metadata.hasPendingWrites, ...x.data({ serverTimestamps: "estimate" }) }));
      liveChanged("notices");
    });
    sub("reports", query(collection(db, "reports"), orderBy("at", "desc"), limit(30)), (snap) => {
      LIVE.reports = snap.docs.map((x) => ({ id: x.id, pending: x.metadata.hasPendingWrites, ...x.data({ serverTimestamps: "estimate" }) }));
      liveChanged("reports");
    });
    sub("requests", query(collection(db, "requests"), orderBy("at", "desc"), limit(50)), (snap) => {
      LIVE.requests = snap.docs.map((x) => ({ id: x.id, pending: x.metadata.hasPendingWrites, ...x.data({ serverTimestamps: "estimate" }) }));
      liveChanged("requests");
    });
    watchShift();
    // Closing photos this person has taken that aren't on a sent report yet.
    sub("myphotos", query(collection(db, "photos"), where("uid", "==", uid), where("report", "==", null)), (snap) => {
      LIVE.myPhotos = snap.docs.map((x) => ({ id: x.id, pending: x.metadata.hasPendingWrites, ...x.data({ serverTimestamps: "estimate" }) })).sort((a, b) => (a.at?.toMillis() || 0) - (b.at?.toMillis() || 0));
      liveChanged("photos");
    });
    const rows = (snap) => snap.docs.map((x) => ({ id: x.id, pending: x.metadata.hasPendingWrites, ...x.data({ serverTimestamps: "estimate" }) })).sort((a, b) => ms(b.at) - ms(a.at));
    // Time off, swaps and lateness: staff see their own, managers see everyone's.
    sub("asks", LIVE.admin ? query(collection(db, "asks"), orderBy("at", "desc"), limit(100)) : query(collection(db, "asks"), where("uid", "==", uid)), (snap) => {
      LIVE.asks = rows(snap); liveChanged("asks");
    });
    if (!LIVE.admin) { ["staff", "outlog", "incidents", "reviews", "ratings"].forEach(unsub); Object.assign(LIVE, { staff: [], outlog: [], incidents: [], reviews: [], ratings: [] }); return; }
    sub("incidents", query(collection(db, "incidents"), orderBy("at", "desc"), limit(50)), (snap) => { LIVE.incidents = rows(snap); liveChanged("incidents"); });
    sub("reviews", query(collection(db, "reviews"), orderBy("at", "desc"), limit(200)), (snap) => { LIVE.reviews = rows(snap); liveChanged("reviews"); });
    // Anonymous feedback: the owner reads all of it, a manager only what's about them.
    sub("ratings", LIVE.owner ? query(collection(db, "ratings"), orderBy("at", "desc"), limit(100)) : query(collection(db, "ratings"), where("about", "==", uid)), (snap) => {
      LIVE.ratings = rows(snap); liveChanged("ratings");
    });
    clearOldPhotos();
    sub("outlog", query(collection(db, "outlog"), orderBy("at", "desc"), limit(100)), (snap) => {
      LIVE.outlog = snap.docs.map((x) => ({ id: x.id, pending: x.metadata.hasPendingWrites, ...x.data({ serverTimestamps: "estimate" }) }));
      liveChanged("outlog");
    });
    sub("staff", collection(db, "staff"), (snap) => {
      LIVE.staff = snap.docs.map((x) => ({ uid: x.id, ...x.data() })).sort((a, b) => a.name.localeCompare(b.name));
      liveChanged("staff");
    });
  }, () => {});
}

// Photos live in the database (Firebase Storage needs a paid plan), so they're cleared after 30 days to stay free.
const KEEP_DAYS = 30;
async function clearOldPhotos() {
  const cutoff = Timestamp.fromMillis(Date.now() - KEEP_DAYS * 864e5);
  const old = await getDocs(query(collection(db, "photos"), where("at", "<", cutoff), limit(100))).catch(() => null);
  if (!old || old.empty) return;
  const b = writeBatch(db); old.docs.forEach((d) => b.delete(d.ref)); await b.commit().catch(() => {});
}

// Tonight's checklist ticks, shared by everyone on shift. A new business day starts a fresh list.
let shiftKey = null;
function watchShift() {
  if (shiftKey === shiftDay() && subs.shift) return;
  unsub("shift"); shiftKey = shiftDay();
  sub("shift", doc(db, "shift", shiftKey), (d) => {
    LIVE.ticks = d.data() || {};
    liveChanged("ticks");
  });
}
setInterval(() => { if (LIVE.me) watchShift(); }, 60000);

async function newAccount(username, pin) {
  const cred = await createUserWithEmailAndPassword(maker, emailFor(username), pin);
  await signOut(maker);
  return cred.user;
}

LIVE.api = {
  async login(username, pin) {
    const u = await getDoc(doc(db, "usernames", username));
    if (!u.exists()) err("Wrong username or PIN");
    await signInWithEmailAndPassword(auth, u.data().email, pin).catch(() => err("Wrong username or PIN"));
  },
  logout: () => signOut(auth),
  changePin: (pin) => updatePassword(auth.currentUser, pin),
  // The owner account, allowed by the one-off setup code in config/pins.
  async setup(name, username, pin, code) {
    if ((await getDoc(doc(db, "usernames", username))).exists()) err("That username is taken");
    settingUp = true;
    try {
      const user = await createUserWithEmailAndPassword(auth, emailFor(username), pin);
      await setDoc(doc(db, "staff", user.user.uid), { name, username, role: "owner", setup: code })
        .catch(async () => { await signOut(auth); err("That setup code didn't work"); });
      await setDoc(doc(db, "usernames", username), { email: user.user.email, uid: user.user.uid });
      // Burn the setup code so nobody else can ever become owner.
      await deleteDoc(doc(db, "config", "pins"));
    } finally { settingUp = false; }
  },
  async addPerson(name, username, pin, role) {
    if ((await getDoc(doc(db, "usernames", username))).exists()) err("That username is taken");
    const user = await newAccount(username, pin);
    const b = writeBatch(db);
    b.set(doc(db, "staff", user.uid), { name, username, role });
    b.set(doc(db, "usernames", username), { email: user.email, uid: user.uid });
    await b.commit();
  },
  // Firebase can't change someone else's password from the app, so a reset moves them to a fresh account.
  async resetPin(person, pin) {
    const user = await newAccount(person.username, pin);
    const b = writeBatch(db);
    b.set(doc(db, "staff", user.uid), { name: person.name, username: person.username, role: person.role });
    b.set(doc(db, "usernames", person.username), { email: user.email, uid: user.uid });
    b.delete(doc(db, "staff", person.uid));
    await b.commit();
  },
  async remove(person) {
    const b = writeBatch(db);
    b.delete(doc(db, "usernames", person.username));
    b.delete(doc(db, "staff", person.uid));
    await b.commit();
  },
  setRole: (person, role) => updateDoc(doc(db, "staff", person.uid), { role }),
  post: (text) => addDoc(collection(db, "feed"), { kind: "comment", text, uid: auth.currentUser.uid, name: LIVE.me, at: serverTimestamp() }),
  removePost: (id) => deleteDoc(doc(db, "feed", id)),
  pin: (text) => addDoc(collection(db, "notices"), { text, uid: auth.currentUser.uid, name: LIVE.me, at: serverTimestamp() }),
  unpin: (id) => deleteDoc(doc(db, "notices", id)),
  // The report and its photos go in one write, so the photos can't end up on the wrong report.
  sendReport(text, summary) {
    const b = writeBatch(db), ref = doc(collection(db, "reports"));
    b.set(ref, { text, summary, photos: LIVE.myPhotos.length, uid: auth.currentUser.uid, name: LIVE.me, at: serverTimestamp() });
    LIVE.myPhotos.forEach((p) => b.update(doc(db, "photos", p.id), { report: ref.id }));
    return b.commit();
  },
  tick: (list, i, on) => setDoc(doc(db, "shift", shiftDay()), { [list]: on ? arrayUnion(i) : arrayRemove(i) }, { merge: true }),
  // Clears one side (bar or floor) and leaves the other's ticks alone.
  clearTicks: (lists) => setDoc(doc(db, "shift", shiftDay()), Object.fromEntries(lists.map((k) => [k, []])), { merge: true }),
  request: (item, note) => addDoc(collection(db, "requests"), { item, note, done: false, uid: auth.currentUser.uid, name: LIVE.me, at: serverTimestamp() }),
  cancelRequest: (id) => deleteDoc(doc(db, "requests", id)),
  markOrdered: (id) => updateDoc(doc(db, "requests", id), { done: true, doneBy: LIVE.me, doneAt: serverTimestamp() }),
  addPhoto: (data) => addDoc(collection(db, "photos"), { data, note: "", report: null, uid: auth.currentUser.uid, name: LIVE.me, at: serverTimestamp() }),
  notePhoto: (id, note) => updateDoc(doc(db, "photos", id), { note }),
  deletePhoto: (id) => deleteDoc(doc(db, "photos", id)),
  loadPhotos: (reportId) => getDocs(query(collection(db, "photos"), where("report", "==", reportId))).then((s) => s.docs.map((x) => ({ id: x.id, ...x.data() })).sort((a, b) => a.at.toMillis() - b.at.toMillis())),
  KEEP_DAYS,
  signOff: (id) => updateDoc(doc(db, "reports", id), { signedBy: LIVE.me, signedAt: serverTimestamp() }),
  // Every 86 and back-in-stock also goes in the 86 log, so managers can spot what keeps running out.
  set86(name, on) {
    const b = writeBatch(db), ref = doc(db, "out", outId(name));
    on ? b.set(ref, { name, by: LIVE.me, at: serverTimestamp() }) : b.delete(ref);
    b.set(doc(collection(db, "outlog")), { name, action: on ? "out" : "back", by: LIVE.me, at: serverTimestamp() });
    return b.commit();
  },
  ask: (a) => addDoc(collection(db, "asks"), { kind: a.kind, date1: a.date1 || "", date2: a.date2 || "", eta: a.eta || "", with: a.with || "", note: a.note || "", status: "pending", uid: auth.currentUser.uid, name: LIVE.me, at: serverTimestamp() }),
  cancelAsk: (id) => deleteDoc(doc(db, "asks", id)),
  decide: (id, status) => updateDoc(doc(db, "asks", id), { status, by: LIVE.me, byAt: serverTimestamp() }),
  incident: (kind, text) => addDoc(collection(db, "incidents"), { kind, text, uid: auth.currentUser.uid, name: LIVE.me, at: serverTimestamp() }),
  review: (report, verdict, text) => addDoc(collection(db, "reviews"), { report, verdict, text, uid: auth.currentUser.uid, name: LIVE.me, at: serverTimestamp() }),
  removeReview: (id) => deleteDoc(doc(db, "reviews", id)),
  // No name or uid is saved, so nobody (the owner included) can tell who wrote it.
  rate: (person, score, text) => addDoc(collection(db, "ratings"), { about: person.uid, aboutName: person.name, score, text, at: serverTimestamp() }),
  USER, PIN,
};

onAuthStateChanged(auth, (u) => {
  LIVE.ready = true;
  if (u) { LIVE.uid = u.uid; listen(u.uid); return; }
  unsubAll();
  Object.assign(LIVE, { uid: null, me: null, username: null, role: null, admin: false, owner: false, feed: [], out: new Set(), outInfo: new Map(), notices: [], reports: [], outlog: [], staff: [], myPhotos: [], requests: [], ticks: {}, asks: [], incidents: [], reviews: [], ratings: [] });
  shiftKey = null;
  liveChanged("me");
});
liveChanged("me");
