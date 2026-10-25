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

// PINs are 6 to 12 digits for everyone; 6 is the shortest password Firebase accepts.
const USER = /^[a-z0-9.]{2,20}$/, PIN = /^\d{6,12}$/, MAX_PHOTOS = 8, CODE_MIN = 16;
const emailFor = (u) => `${u}-${crypto.randomUUID().slice(0, 8)}@users.example.com`;
// The 86 board keys each item by this, and the rules check it the same way.
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const ms = (t) => (t ? t.toMillis() : Date.now());
const err = (msg) => { throw new Error(msg); };
let stop = null, subs = {};
const unsub = (k) => { if (subs[k]) { subs[k](); delete subs[k]; } };
const unsubAll = () => { Object.keys(subs).forEach(unsub); if (stop) { stop(); stop = null; } };
// A listen the rules refuse (account not confirmed by the server yet) is dropped and retried on the next staff snapshot.
function sub(k, ref, fn) {
  if (subs[k]) return;
  subs[k] = onSnapshot(ref, (snap) => { LIVE.loaded.add(k); fn(snap); }, () => delete subs[k]);
}
// Something just written on this phone has no server time yet, so its "at" is null and it sorts as newest. (Firestore's
// own estimate is rounded down to the second, which can put it below something written a moment earlier.)
// Ids go into the page's HTML. The app only ever makes plain ones (letters, digits, dashes), so a record with any other
// id was written some other way, for example by a script using someone's login, and is skipped. The id goes after a
// record's own fields so that a field called id can't take its place.
const plain = (x) => /^[A-Za-z0-9-]+$/.test(x.id);
const rows = (snap) => snap.docs.filter(plain).map((x) => ({ ...x.data(), id: x.id, pending: x.metadata.hasPendingWrites })).sort((a, b) => ms(b.at) - ms(a.at));
const me = () => ({ uid: auth.currentUser.uid, name: LIVE.me, at: serverTimestamp() });

function listen(uid) {
  unsubAll();
  // Removal or a role change by a manager takes effect straight away.
  let seen = false;
  stop = onSnapshot(doc(db, "staff", uid), { includeMetadataChanges: true }, (d) => {
    // Only a record this phone has seen going away logs it out (removal, or a PIN reset). A record that isn't there yet
    // means a first launch with no signal, or first-time setup still saving, perhaps in another tab: wait for it.
    if (!d.exists()) { if (seen && !d.metadata.fromCache) leave(); return; }
    // A record still being saved doesn't count as seen: a refused setup takes it away again.
    if (!d.metadata.hasPendingWrites) seen = true;
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
    // Broadcasts. The owner can leave managers out of one, so a manager's phone asks only for the ones they may read.
    // (No orderBy: with the filter it would need an index made in the console. There are only ever a few.)
    sub("notices", LIVE.role === "manager" ? query(collection(db, "notices"), where("managers", "==", true)) : collection(db, "notices"), (snap) => {
      LIVE.notices = rows(snap); liveChanged("notices"); watchSeen(uid);
    });
    sub("reports", query(collection(db, "reports"), orderBy("at", "desc"), limit(30)), (snap) => { LIVE.reports = rows(snap); liveChanged("reports"); });
    sub("requests", query(collection(db, "requests"), orderBy("at", "desc"), limit(50)), (snap) => { LIVE.requests = rows(snap); liveChanged("requests"); });
    watchDays();
    // The equipment that gets temperature checks and line cleans. A short list, set up by managers.
    sub("kit", collection(db, "kit"), (snap) => {
      LIVE.kit = snap.docs.filter(plain).map((x) => ({ ...x.data(), id: x.id })).sort((a, b) => a.name.localeCompare(b.name));
      liveChanged("kit");
    });
    // The cleaning jobs that aren't done every night. Another short list set up by managers.
    sub("jobs", collection(db, "cleanJobs"), (snap) => {
      LIVE.jobs = snap.docs.filter(plain).map((x) => ({ ...x.data(), id: x.id })).sort((a, b) => a.name.localeCompare(b.name));
      liveChanged("jobs");
    });
    // Closing photos this person has taken that aren't on a sent report yet.
    sub("photos", query(collection(db, "photos"), where("uid", "==", uid), where("report", "==", null)), (snap) => {
      LIVE.myPhotos = rows(snap).reverse(); liveChanged("photos");
    });
    // Issues: everything still open, however old, plus the latest few including fixed ones.
    const issues = { open: [], recent: [] };
    const mergeIssues = () => { LIVE.issues = [...new Map([...issues.recent, ...issues.open].map((x) => [x.id, x])).values()].sort((a, b) => ms(b.at) - ms(a.at)); liveChanged("issues"); };
    sub("issues", query(collection(db, "issues"), where("status", "in", ["open", "taken"])), (snap) => { issues.open = rows(snap); mergeIssues(); });
    sub("issues-recent", query(collection(db, "issues"), orderBy("at", "desc"), limit(30)), (snap) => { issues.recent = rows(snap); mergeIssues(); });
    // Concerns: managers get every open one plus the latest 50; staff get the open ones sent to the team, and their own
    // named ones. (Anonymous ones carry no uid, so after sending, the sender sees them only if they went to the team.)
    const concerns = collection(db, "concerns"), cn = { open: [], more: [] };
    const mergeConcerns = () => { LIVE.concerns = [...new Map([...cn.more, ...cn.open].map((x) => [x.id, x])).values()].sort((a, b) => ms(b.at) - ms(a.at)); liveChanged("concerns"); };
    sub("concerns", LIVE.admin ? query(concerns, where("status", "==", "open")) : query(concerns, where("to", "in", ["all", "bar", "floor"]), where("status", "==", "open")), (snap) => { cn.open = rows(snap); mergeConcerns(); });
    sub("concerns-more", LIVE.admin ? query(concerns, orderBy("at", "desc"), limit(50)) : query(concerns, where("uid", "==", uid)), (snap) => { cn.more = rows(snap); mergeConcerns(); });
    // Time off, swaps and lateness: staff see their own, managers see everyone's.
    sub("asks", LIVE.admin ? query(collection(db, "asks"), orderBy("at", "desc"), limit(100)) : query(collection(db, "asks"), where("uid", "==", uid)), (snap) => {
      LIVE.asks = rows(snap); liveChanged("asks");
    });
    if (!LIVE.admin) { Object.assign(LIVE, { staff: [], outlog: [], incidents: [], reviews: [], ratings: [], audit: [], pars: {}, counts: [], training: [] }); return; }
    sub("incidents", query(collection(db, "incidents"), orderBy("at", "desc"), limit(50)), (snap) => { LIVE.incidents = rows(snap); liveChanged("incidents"); });
    sub("reviews", query(collection(db, "reviews"), orderBy("at", "desc"), limit(200)), (snap) => { LIVE.reviews = rows(snap); liveChanged("reviews"); });
    // Anonymous feedback: the owner reads all of it, a manager only what's about them.
    sub("ratings", LIVE.owner ? query(collection(db, "ratings"), orderBy("at", "desc"), limit(100)) : query(collection(db, "ratings"), where("about", "==", uid)), (snap) => {
      LIVE.ratings = rows(snap); liveChanged("ratings");
    });
    sub("outlog", query(collection(db, "outlog"), orderBy("at", "desc"), limit(100)), (snap) => { LIVE.outlog = rows(snap); liveChanged("outlog"); });
    sub("staff", collection(db, "staff"), (snap) => {
      LIVE.staff = snap.docs.filter(plain).map((x) => ({ ...x.data(), uid: x.id })).sort((a, b) => a.name.localeCompare(b.name));
      liveChanged("staff");
    });
    sub("audit", query(collection(db, "audit"), orderBy("at", "desc"), limit(30)), (snap) => { LIVE.audit = rows(snap); liveChanged("audit"); });
    clearOldPhotos();
  }, () => {});
}

// Who has tapped Got it on a broadcast. Staff need only their own records; managers and the owner get the records for
// the broadcasts they can see (at most 30, Firestore's limit for "in"), and managers only those they weren't left out of.
let seenKey = "";
function watchSeen(uid) {
  const ids = LIVE.notices.map((x) => x.id).slice(0, 30), key = LIVE.admin ? ids.join() : uid;
  if (key === seenKey && subs.seen) return;
  unsub("seen"); seenKey = key;
  if (!ids.length && LIVE.admin) { LIVE.seen = []; liveChanged("seen"); return; }
  const seen = collection(db, "seen");
  sub("seen", !LIVE.admin ? query(seen, where("uid", "==", uid)) : LIVE.owner ? query(seen, where("notice", "in", ids))
    : query(seen, where("managers", "==", true), where("notice", "in", ids)), (snap) => { LIVE.seen = rows(snap); liveChanged("seen"); });
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
  for (const c of ["photos", "concernPhotos"]) {
    const old = await getDocs(query(collection(db, c), where("at", "<", cutoff), limit(100))).catch(() => null);
    if (!old || old.empty) continue;
    // Ten at a time: each delete is checked against the manager's staff record, and one batch may only make 20 such checks.
    for (let i = 0; i < old.docs.length; i += 10) {
      const b = writeBatch(db); old.docs.slice(i, i + 10).forEach((d) => b.delete(d.ref)); await b.commit().catch(() => {});
    }
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
// Listeners tied to the business day start again with that day's query when it rolls over at 6am.
const dayKeys = {};
function subDay(k, ref, fn) {
  if (dayKeys[k] === shiftDay() && subs[k]) return;
  unsub(k); dayKeys[k] = shiftDay();
  sub(k, ref(), fn);
}
function watchDays() {
  const uid = auth.currentUser.uid, waste = collection(db, "waste");
  watchShift();
  // Safety checks from the last 8 nights: tonight's readings, and when the lines were last cleaned (due every 7 days).
  subDay("safety", () => query(collection(db, "safety"), where("day", "in", lastNights(8))), (snap) => { LIVE.safety = rows(snap); liveChanged("safety"); });
  // Cleaning ticks from the last 5 weeks: enough to say when each job was last done, the longest gap being 4 weeks.
  subDay("cleans", () => query(collection(db, "cleans"), where("day", ">=", lastNights(35)[34])), (snap) => { LIVE.cleans = rows(snap); liveChanged("cleans"); });
  // Waste: staff get what they logged tonight; managers the last 14 nights, for this week's and last week's totals.
  subDay("waste", () => (LIVE.admin ? query(waste, where("day", "in", lastNights(14))) : query(waste, where("uid", "==", uid), where("day", "==", shiftDay()))),
    (snap) => { LIVE.waste = rows(snap); liveChanged("waste"); });
}
setInterval(() => { if (LIVE.me) watchDays(); }, 60000);
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
    const { user } = await createUserWithEmailAndPassword(auth, emailFor(username), pin);
    const owner = { uid: user.uid, name, username, role: "owner" }, b = writeBatch(db);
    b.set(doc(db, "config", "owner"), { uid: user.uid, proof: code });
    b.set(doc(db, "staff", user.uid), staffRecord(owner));
    b.set(doc(db, "usernames", username), { email: user.email, uid: user.uid });
    audit(b, user.uid + "-in", "setup", owner, owner);
    b.delete(doc(db, "config", "pins"));
    // The rules refuse a wrong code or a second owner. Anything else (no signal, say) isn't the code's fault.
    await b.commit().catch(async (e) => {
      await deleteUser(user).catch(() => {});
      err(e.code === "permission-denied" ? "That setup code didn't work, or setup has already been done" : "Setup didn't finish. Check your signal and try again");
    });
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
  // side: "all", "bar" or "floor". managers: false leaves managers out (the owner only).
  pin: (text, side, managers) => addDoc(collection(db, "notices"), { text, side, managers, ...me() }),
  // Got it: carries the broadcast's managers setting, as the rules require. Broadcasts from before audiences count as true.
  gotIt: (n) => setDoc(doc(db, "seen", `${n.id}-${auth.currentUser.uid}`), { notice: n.id, managers: n.managers ?? true, ...me() }),
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
  loadPhotos: (reportId) => getDocs(query(collection(db, "photos"), where("report", "==", reportId))).then((s) => s.docs.filter(plain).map((x) => ({ ...x.data(), id: x.id })).sort((a, b) => ms(a.at) - ms(b.at))),
  KEEP_DAYS,
  // A concern and its photos go in one write. An anonymous one carries no uid or name.
  reportConcern(c, photos) {
    const b = writeBatch(db), ref = doc(collection(db, "concerns"));
    b.set(ref, { ...c, photos: photos.length, status: "open", ...(c.anon ? { at: serverTimestamp() } : me()) });
    photos.forEach((data, n) => b.set(doc(db, "concernPhotos", `${ref.id}-${n}`), { concern: ref.id, n, to: c.to, data, at: serverTimestamp() }));
    return b.commit();
  },
  closeConcern: (id, fix) => updateDoc(doc(db, "concerns", id), { status: "closed", fix, fixedBy: LIVE.me, fixedByUid: auth.currentUser.uid, fixedAt: serverTimestamp() }),
  removeConcern(c) {
    const b = writeBatch(db);
    b.delete(doc(db, "concerns", c.id));
    for (let n = 0; n < c.photos; n++) b.delete(doc(db, "concernPhotos", `${c.id}-${n}`));
    return b.commit();
  },
  // Each photo's data, or null where it has been cleared after 30 days.
  concernPhotos: (c) => Promise.all(Array.from({ length: c.photos }, (_, n) => getDoc(doc(db, "concernPhotos", `${c.id}-${n}`)).then((x) => (x.exists() ? x.data().data : null)))),
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
  // Waste: quantities only. The business night goes with it, so the weekly totals add up by night.
  waste: (x) => addDoc(collection(db, "waste"), { item: x.item, qty: x.qty, unit: x.unit, reason: x.reason, note: x.note, side: x.side, day: shiftDay(), ...me() }),
  unwaste: (id) => deleteDoc(doc(db, "waste", id)),
  addKit: (name, kind, side) => addDoc(collection(db, "kit"), { name, kind, side }),
  removeKit: (id) => deleteDoc(doc(db, "kit", id)),
  // A temperature in °C, or null for a line clean. It carries its equipment's details, as the rules require.
  logCheck: (k, c, note) => addDoc(collection(db, "safety"), { kit: k.id, kitName: k.name, kind: k.kind, side: k.side, c, note, day: shiftDay(), ...me() }),
  unlogCheck: (id) => deleteDoc(doc(db, "safety", id)),
  // Cleaning jobs (managers) and their ticks. A tick carries its job's name and side, as the rules require.
  addJob: (name, every, side, how) => addDoc(collection(db, "cleanJobs"), { name, every, side, how }),
  removeJob: (id) => deleteDoc(doc(db, "cleanJobs", id)),
  logClean: (j, note) => addDoc(collection(db, "cleans"), { job: j.id, jobName: j.name, side: j.side, note, day: shiftDay(), ...me() }),
  unlogClean: (id) => deleteDoc(doc(db, "cleans", id)),
  // Par levels and counts load the first time a manager opens Stock, not on every launch.
  watchStock() {
    sub("pars", collection(db, "pars"), (snap) => { LIVE.pars = Object.fromEntries(snap.docs.map((x) => [x.data().item, x.data().par])); liveChanged("pars"); });
    sub("counts", query(collection(db, "counts"), orderBy("at", "desc"), limit(10)), (snap) => { LIVE.counts = rows(snap); liveChanged("counts"); });
  },
  // No par means the item isn't counted.
  setPar: (item, par) => (par ? setDoc(doc(db, "pars", slug(item)), { item, par, ...me() }) : deleteDoc(doc(db, "pars", slug(item)))),
  saveCount: (lines, note) => addDoc(collection(db, "counts"), { lines, note, ...me() }),
  // Training sign-offs load the first time someone opens Practise or Training: staff their own, managers everyone's.
  watchTraining() {
    const t = collection(db, "training");
    sub("training", LIVE.admin ? t : query(t, where("trainee", "==", auth.currentUser.uid)), (snap) => { LIVE.training = rows(snap); liveChanged("training"); });
  },
  // One record per person per drink, named after both, so the same drink can't be signed off twice.
  passDrink: (person, drinkName) => setDoc(doc(db, "training", `${person.uid}-${slug(drinkName)}`), { trainee: person.uid, traineeName: person.name, drinkName, ...me() }),
  unpass: (id) => deleteDoc(doc(db, "training", id)),
  // Managers' spreadsheet downloads: the whole of one collection, read once (the live lists keep only the latest).
  history: (name) => getDocs(query(collection(db, name), orderBy("at", "desc"))).then(rows),
  // Checklist ticks for the given business days.
  ticksFor: (days) => Promise.all(days.map((day) => getDocs(collection(db, "shift", day, "ticks")).then((s) => s.docs.map((x) => ({ day, ...x.data() }))))).then((xs) => xs.flat()),
  USER, PIN, MAX_PHOTOS, CODE_MIN,
};

const EMPTY = () => ({ uid: null, me: null, username: null, role: null, admin: false, owner: false, feed: [], out: new Set(), outInfo: new Map(), notices: [], seen: [], reports: [], outlog: [], staff: [], myPhotos: [], requests: [], ticks: {}, tickBy: {}, asks: [], incidents: [], reviews: [], ratings: [], issues: [], audit: [],
  waste: [], kit: [], safety: [], jobs: [], cleans: [], pars: {}, counts: [], training: [], concerns: [] });
onAuthStateChanged(auth, (u) => {
  LIVE.ready = true;
  if (u) { LIVE.uid = u.uid; listen(u.uid); return; }
  unsubAll(); LIVE.loaded.clear();
  Object.assign(LIVE, EMPTY());
  shiftKey = null;
  liveChanged("me");
});
liveChanged("me");
