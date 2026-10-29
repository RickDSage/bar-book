// Live team layer: individual logins, the team board, notices, shift reports, the shared 86 list, tonight's tasks and
// procedures, date labels, the rota, restocking from the cellar and the events behind them, synced through Firebase.
// Bundled by site.js into live.js. The app script owns the UI; this module fills in LIVE and calls liveChanged().
// Every write here has a matching rule in firestore.rules and a test in test/rules.test.mjs.
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
  terminate, clearIndexedDbPersistence, arrayRemove,
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
const SHIFT_KEYS = ["week", "day", "start", "end", "side", "note", "who", "whoName", "offer", "offerName", "cover", "wants", "pub"];
// A published shift's event: what was done, the shift after it (or as it was, when it's removed), and its day, times,
// side and person before.
const shiftEvent = (id, s, was) => ({ kind: "shift", day: shiftDay(), ref: id, label: `${s.day} ${s.start}-${s.end}`, area: s.side, act: s.act, sday: s.day, start: s.start,
  end: s.end, who: s.whoName, offer: s.offerName, cover: s.cover, was: was && { day: was.day, start: was.start, end: was.end, side: was.side, who: was.whoName }, note: "", v: s.v, ...me() });

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
    watchDays();
    // Managers' versions of the lists. A list with none here is the app's standard one.
    sub("lists", collection(db, "lists"), (snap) => {
      LIVE.lists = Object.fromEntries(snap.docs.filter(plain).map((x) => [x.id, { ...x.data({ serverTimestamps: "estimate" }), id: x.id, pending: x.metadata.hasPendingWrites }]));
      liveChanged("lists");
    });
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
    // Closing photos this person has taken that aren't on a sent report yet.
    sub("photos", query(collection(db, "photos"), where("uid", "==", uid), where("report", "==", null)), (snap) => {
      LIVE.myPhotos = rows(snap).reverse(); liveChanged("photos");
    });
    // Football: today's games and the ones coming up. Old ones drop off the screen by date.
    sub("fixtures", query(collection(db, "fixtures"), where("day", ">=", ukDay(Date.now() - 864e5)), orderBy("day"), limit(60)), (snap) => { LIVE.fixtures = rows(snap); liveChanged("fixtures"); });
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
    watchChats(uid);
    if (!LIVE.admin) { Object.assign(LIVE, { staff: [], outlog: [], incidents: [], reviews: [], ratings: [], audit: [], training: [], requests: [] }); return; }
    // Stock requests from before restocking, kept so managers can still clear the last ones.
    sub("requests", query(collection(db, "requests"), orderBy("at", "desc"), limit(50)), (snap) => { LIVE.requests = rows(snap); liveChanged("requests"); });
    sub("incidents", query(collection(db, "incidents"), orderBy("at", "desc"), limit(50)), (snap) => { LIVE.incidents = rows(snap); liveChanged("incidents"); });
    sub("reviews", query(collection(db, "reviews"), orderBy("at", "desc"), limit(200)), (snap) => { LIVE.reviews = rows(snap); liveChanged("reviews"); });
    // Anonymous feedback: the owner reads all of it, a manager only what's about them.
    sub("ratings", LIVE.owner ? query(collection(db, "ratings"), orderBy("at", "desc"), limit(100)) : query(collection(db, "ratings"), where("about", "==", uid)), (snap) => {
      LIVE.ratings = rows(snap); liveChanged("ratings");
    });
    sub("outlog", query(collection(db, "outlog"), orderBy("at", "desc"), limit(100)), (snap) => { LIVE.outlog = rows(snap); liveChanged("outlog"); });
    sub("staff", collection(db, "staff"), (snap) => {
      LIVE.staff = snap.docs.filter(plain).map((x) => ({ ...x.data(), uid: x.id })).sort((a, b) => a.name.localeCompare(b.name));
      staffSettled = !snap.metadata.hasPendingWrites; liveChanged("staff"); syncDirectory();
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

// Team chat: who's on the team (the directory), the chats this person is in, the team chat, and their pings. Messages
// load only for the chat that's open.
const byName = (a, b) => a.name.localeCompare(b.name);
function watchChats(uid) {
  sub("directory", collection(db, "directory"), (snap) => {
    LIVE.directory = snap.docs.filter(plain).map((x) => ({ ...x.data(), uid: x.id })).sort(byName);
    dirSettled = !snap.metadata.hasPendingWrites; liveChanged("directory"); syncDirectory();
  });
  const ch = { mine: [], team: [] };
  const merge = () => { LIVE.chats = [...ch.team, ...ch.mine].sort((a, b) => ms(b.lastAt) - ms(a.lastAt)); liveChanged("chats"); };
  sub("chats", query(collection(db, "chats"), where("members", "array-contains", uid)), (snap) => { ch.mine = rows(snap); merge(); });
  sub("team-chat", doc(db, "chats", "team"), (d) => { ch.team = d.exists() ? [{ ...d.data(), id: d.id, pending: d.metadata.hasPendingWrites }] : []; merge(); });
  sub("pings", query(collection(db, "pings"), where("to", "==", uid)), (snap) => { LIVE.pings = rows(snap); liveChanged("pings"); });
  clearOldChatPhotos(uid).catch(() => {});
}
// Each phone keeps its own directory entry matching its staff record; managers' phones keep everyone's and remove
// people who have left. Only from what the server has confirmed: a change still saving (a role change, say) may yet be
// refused, and a refused write makes the phone resend the writes queued behind it, which those can't survive (a role
// change's audit entry only matches the first time). A write the rules refuse isn't tried again until something changes.
const triedDir = new Set();
let staffSettled = false, dirSettled = false;
function syncDirectory() {
  if (!LIVE.loaded.has("directory") || !dirSettled || (LIVE.admin && (!LIVE.loaded.has("staff") || !staffSettled))) return;
  const want = LIVE.admin ? LIVE.staff : [{ uid: auth.currentUser.uid, name: LIVE.me, role: LIVE.role }];
  const have = new Map(LIVE.directory.map((p) => [p.uid, p]));
  // (After logging out the database is closed, and a write throws straight away.)
  const once = (k, write) => { if (!triedDir.has(k)) { triedDir.add(k); Promise.resolve().then(write).catch(() => {}); } };
  for (const p of want) {
    const h = have.get(p.uid);
    if (!h || h.name !== p.name || h.role !== p.role) once(`${p.uid}:${p.name}:${p.role}`, () => setDoc(doc(db, "directory", p.uid), { name: p.name, role: p.role }));
  }
  if (LIVE.admin) for (const h of LIVE.directory) if (!want.some((p) => p.uid === h.uid)) once(`${h.uid}:gone`, () => deleteDoc(doc(db, "directory", h.uid)));
}
// Chat photos are cleared by whoever sent them, 30 days on (Firebase Storage needs a paid plan). Each launch checks the
// week of business days just past that, one query per day (two equality filters need no index made in the console).
async function clearOldChatPhotos(uid) {
  for (let n = KEEP_DAYS + 1; n <= KEEP_DAYS + 7; n++) {
    const day = ukDay(Date.now() - 6 * 36e5 - n * 864e5);
    const old = await getDocs(query(collection(db, "chatPhotos"), where("uid", "==", uid), where("day", "==", day))).catch(() => null);
    if (old && !old.empty) { const b = writeBatch(db); old.docs.slice(0, 400).forEach((d) => b.delete(d.ref)); await b.commit().catch(() => {}); }
  }
}
// The chat that's open: its latest 60 messages.
let openChat = "";
function watchMessages(id) {
  if (id === openChat && subs.msgs) return;
  unsub("msgs"); openChat = id; LIVE.msgs = []; LIVE.loaded.delete("msgs");
  if (id) sub("msgs", query(collection(db, "chats", id, "msgs"), orderBy("at", "desc"), limit(60)), (snap) => { LIVE.msgs = rows(snap).reverse(); liveChanged("msgs"); });
}
const preview = (text) => [...(text || "Photo")].slice(0, 80).join("");

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

// Listeners tied to the business day (or its week) start again with the new query when it rolls over at 6am.
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
  watchRota();
}
// The rota. Managers get every shift from four weeks back, drafts included. Everyone else gets the published shifts
// from last week to the week after next, a week at a time: a query the rules can check, with no index to set up.
function watchRota() {
  const wk = weekOf(shiftDay());
  if (LIVE.admin) {
    subDay("shifts", () => query(collection(db, "shifts"), where("week", ">=", addDays(wk, -28))), (snap) => { LIVE.shifts = rows(snap); liveChanged("shifts"); }, wk);
    return;
  }
  const got = {};
  for (const n of [-1, 0, 1, 2]) {
    subDay(`shifts${n}`, () => query(collection(db, "shifts"), where("week", "==", addDays(wk, 7 * n)), where("pub", "==", true)), (snap) => {
      got[n] = rows(snap); LIVE.shifts = Object.values(got).flat();
      if (n === 0) LIVE.loaded.add("shifts");
      liveChanged("shifts");
    }, wk);
  }
}
setInterval(() => { if (LIVE.me) watchDays(); }, 60000);
// Which side of the venue each list and each restocking destination belongs to, as the rules work it out.
const SIDE = { open: "bar", close: "bar", fset: "floor", fshake: "floor", fclose: "floor", kopen: "kitchen", kclose: "kitchen" };
const DEST_SIDE = { up: "bar", down: "bar", shakes: "floor", floor: "floor", kitchen: "kitchen" };
const RS_OPEN = ["asked", "given", "doing", "blocked", "delivered"];

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
  removePost: (id) => deleteDoc(doc(db, "feed", id)),
  // side: "all", "bar", "floor" or "kitchen". managers: false leaves managers out (the owner only).
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
  // A change to one of tonight's tasks: to is todo, doing, done, blocked or cancelled (not needed), or give is someone
  // ({name, uid}, or null for nobody) to give it to without changing where it's up to. The task and its event go in one
  // write. Each change raises the version by one, so a change made from an old copy (two phones at once, or a phone
  // that was offline) is refused instead of overwriting the newer one, and a retried write can't add a second event.
  // Giving it to someone keeps the reason it's blocked, if it is.
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
  // A manager's version of a list: its items ({id, t, days}), the id the next new item gets, and a copy in the list's
  // history, in one write. The version goes up by one, so if two managers save at once the second is refused instead of
  // overwriting the first without knowing.
  saveList(key, items, next) {
    const v = (LIVE.lists[key]?.v || 0) + 1, x = { items, next, v, ...me() }, b = writeBatch(db);
    b.set(doc(db, "lists", key), x);
    b.set(doc(db, "listlog", `${key}-${v}`), { list: key, ...x });
    return b.commit();
  },
  // Every saved version of a list, newest first, read once when a manager opens its history.
  listHistory: (key) => getDocs(query(collection(db, "listlog"), where("list", "==", key))).then((s) => rows(s).sort((a, b) => b.v - a.v)),
  // A date label: added, edited or removed by a manager (item, side, life and on say what it is), or opened, changed or
  // binned by anyone (useBy is the date written on it). Opening and changing date it today and put this person's name on
  // it. The label and its event go in one write, and the version goes up by one, so a change made from an old copy is
  // refused. The event keeps the label's date before and after, so a late change shows.
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
  // Every change to one label, oldest first, read when someone opens its history.
  labelHistory: (id) => getDocs(query(collection(db, "events"), where("ref", "==", id))).then((s) => rows(s).filter((e) => e.kind === "label").sort((a, b) => a.v - b.v)),
  // The rota. Shifts for one week, as drafts (nothing for staff to see until it's published) or straight onto a week
  // that's out, each with its event. f is {week, day, start, end, side, note, who, whoName}.
  shiftsAdd(fs, pub) {
    const b = writeBatch(db);
    for (const f of fs) {
      const ref = doc(collection(db, "shifts")), s = { ...f, offer: "", offerName: "", cover: "", wants: {}, pub, act: "added", v: 1, ...me() };
      b.set(ref, s);
      if (pub) b.set(doc(db, "events", `w-${ref.id}-1`), shiftEvent(ref.id, s, null));
    }
    return b.commit();
  },
  // A change to one shift: f holds the fields that change. Once it's published, the change goes with its event, which
  // keeps the shift as it was before; the version goes up by one, so a change made from an old copy is refused.
  shift(x, act, f = {}) {
    const ref = doc(db, "shifts", x.id), v = x.v + 1, b = writeBatch(db);
    const s = { ...Object.fromEntries(SHIFT_KEYS.map((k) => [k, x[k]])), ...f, act, v, ...me() };
    if (act === "removed") b.delete(ref); else b.set(ref, s);
    if (x.pub) b.set(doc(db, "events", `w-${x.id}-${v}`), shiftEvent(x.id, act === "removed" ? { ...x, act, v } : s, x));
    return b.commit();
  },
  // Publishing a week: every draft in it, in one write, with no events (drafts have none).
  publish: (xs) => { const b = writeBatch(db); for (const x of xs) b.update(doc(db, "shifts", x.id), { pub: true, act: "published", v: x.v + 1, ...me() }); return b.commit(); },
  // Restocking from the cellar: what, how much, which unit, where it's going (up, down, shakes, floor or kitchen) and any detail.
  askRestock({ item, qty, unit, dest, detail }) {
    const day = shiftDay(), ref = doc(collection(db, "restock")), b = writeBatch(db);
    b.set(ref, { item, qty, unit, dest, detail, day, status: "asked", who: null, whoUid: null, moved: null, got: null, note: "", v: 1, askedBy: LIVE.me, askedUid: auth.currentUser.uid, askedAt: serverTimestamp(), ...me() });
    b.set(doc(db, "events", `s-${ref.id}-1`), { kind: "restock", day, ref: ref.id, label: item, area: DEST_SIDE[dest], from: "new", to: "asked", who: null, qty, unit, dest, note: "", v: 1, ...me() });
    return b.commit();
  },
  // to: given (to give, {name, uid}), doing (taken on by this person), delivered (moved: how much was brought up),
  // received (got: how much arrived), unavailable, blocked, cancelled, or asked (back to waiting, which clears who has
  // it and the amounts). Asked, moved and received stay separate, and no stock level changes here.
  moveRestock(r, to, { note = "", give, moved, got } = {}) {
    const v = r.v + 1, back = to === "asked";
    const p = to === "given" ? give : to === "doing" ? { name: LIVE.me, uid: auth.currentUser.uid } : back ? null : { name: r.who, uid: r.whoUid };
    const m = to === "delivered" ? moved : back ? null : r.moved, g = to === "received" ? got : back ? null : r.got, b = writeBatch(db);
    b.update(doc(db, "restock", r.id), { status: to, who: p?.name ?? null, whoUid: p?.uid ?? null, moved: m, got: g, note, v, ...me() });
    b.set(doc(db, "events", `s-${r.id}-${v}`), { kind: "restock", day: shiftDay(), ref: r.id, label: r.item, area: DEST_SIDE[r.dest], from: r.status, to, who: p?.name ?? null,
      qty: to === "delivered" ? m : to === "received" ? g : null, unit: r.unit, dest: r.dest, note, v, ...me() });
    return b.commit();
  },
  // Earlier nights, read once: the KPIs, Activity's earlier nights and the downloads. Newest nights first, so if there
  // are ever more than the limit, the oldest are the ones left out.
  eventsOn: (day) => getDocs(query(collection(db, "events"), where("day", "==", day), limit(2000))).then(rows),
  eventsFrom: (day) => getDocs(query(collection(db, "events"), where("day", ">=", day), orderBy("day", "desc"), limit(5000))).then(rows),
  restockFrom: (day) => getDocs(query(collection(db, "restock"), where("day", ">=", day), orderBy("day", "desc"), limit(2000))).then(rows),
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
  addFixture: (x) => addDoc(collection(db, "fixtures"), { day: x.day, ko: x.ko, home: x.home, away: x.away, comp: x.comp, channel: x.channel, screen: x.screen, ...me() }),
  dropFixture: (id) => deleteDoc(doc(db, "fixtures", id)),
  raise: (x) => addDoc(collection(db, "issues"), { title: x.title, detail: x.detail, area: x.area, urgent: x.urgent, again: x.again || null, status: "open", ...me() }),
  take: (id, person) => updateDoc(doc(db, "issues", id), { status: "taken", who: person.name, whoUid: person.uid, setBy: LIVE.me, setByUid: auth.currentUser.uid, setAt: serverTimestamp() }),
  fixed: (id, fix) => updateDoc(doc(db, "issues", id), { status: "fixed", fix, fixedBy: LIVE.me, fixedByUid: auth.currentUser.uid, fixedAt: serverTimestamp() }),
  withdrawIssue: (id) => deleteDoc(doc(db, "issues", id)),
  // Training sign-offs load the first time someone opens Practise or Training: staff their own, managers everyone's.
  watchTraining() {
    const t = collection(db, "training");
    sub("training", LIVE.admin ? t : query(t, where("trainee", "==", auth.currentUser.uid)), (snap) => { LIVE.training = rows(snap); liveChanged("training"); });
  },
  // One record per person per drink, named after both, so the same drink can't be signed off twice.
  passDrink: (person, drinkName) => setDoc(doc(db, "training", `${person.uid}-${slug(drinkName)}`), { trainee: person.uid, traineeName: person.name, drinkName, ...me() }),
  unpass: (id) => deleteDoc(doc(db, "training", id)),
  // Managers' spreadsheet downloads: the whole of one collection, read once (the live lists keep only the latest). Waste,
  // temperatures, line cleans and stock counts are read-only old records now (Alert65 and Nory took them over).
  history: (name) => getDocs(query(collection(db, name), orderBy("at", "desc"))).then(rows),
  // Checklist ticks from before tasks (24 and 25 October 2026), for the given business days.
  ticksFor: (days) => Promise.all(days.map((day) => getDocs(collection(db, "shift", day, "ticks")).then((s) => s.docs.map((x) => ({ day, ...x.data() }))))).then((xs) => xs.flat()),
  // Team chat. A private chat's id is both uids in order, so a pair only ever has one.
  dmId: (other) => [auth.currentUser.uid, other].sort().join("-"),
  newChat(kind, { other, title = "", members = [] } = {}) {
    const uid = auth.currentUser.uid, ref = kind === "team" ? doc(db, "chats", "team") : kind === "dm" ? doc(db, "chats", LIVE.api.dmId(other)) : doc(collection(db, "chats"));
    const ids = kind === "dm" ? [uid, other].sort() : kind === "group" ? [uid, ...members.filter((m) => m !== uid)] : [];
    return setDoc(ref, { kind, title, members: ids, by: uid, at: serverTimestamp(), lastId: "", lastText: "", lastName: "", lastUid: "", lastAt: serverTimestamp(), lastPings: [], read: {} }).then(() => ref.id);
  },
  watchMessages,
  // A message, the chat's preview, its photo and a ping for each person mentioned go in one write. In a private chat the
  // other person is always pinged.
  sendChat(c, text, photo, mentions = []) {
    const uid = auth.currentUser.uid, b = writeBatch(db), m = doc(collection(db, "chats", c.id, "msgs"));
    if (c.kind === "dm") mentions = c.members.filter((x) => x !== uid);
    b.set(m, { text, photo: !!photo, mentions, ...me() });
    b.update(doc(db, "chats", c.id), { lastId: m.id, lastText: preview(text), lastName: LIVE.me, lastUid: uid, lastAt: serverTimestamp(), lastPings: mentions, [`read.${uid}`]: serverTimestamp() });
    if (photo) b.set(doc(db, "chatPhotos", `${c.id}-${m.id}`), { chat: c.id, msg: m.id, day: shiftDay(), data: photo, ...me() });
    mentions.forEach((to) => b.set(doc(db, "pings", `${to}-${c.id}`), { to, chat: c.id, msg: m.id, text: preview(text), ...me() }));
    return b.commit();
  },
  // Takes back your own message and its photo. If it was the latest, the chat's preview clears.
  unsend(c, m) {
    const b = writeBatch(db);
    b.delete(doc(db, "chats", c.id, "msgs", m.id));
    if (m.photo) b.delete(doc(db, "chatPhotos", `${c.id}-${m.id}`));
    if (c.lastId === m.id) b.update(doc(db, "chats", c.id), { lastText: "" });
    return b.commit();
  },
  // Read up to now, and any ping for this chat cleared.
  markRead(c) {
    const uid = auth.currentUser.uid, b = writeBatch(db);
    b.update(doc(db, "chats", c.id), { [`read.${uid}`]: serverTimestamp() });
    if (LIVE.pings.some((p) => p.chat === c.id)) b.delete(doc(db, "pings", `${uid}-${c.id}`));
    return b.commit();
  },
  editGroup: (c, title, members) => updateDoc(doc(db, "chats", c.id), { title, members }),
  leaveGroup: (c) => updateDoc(doc(db, "chats", c.id), { members: arrayRemove(auth.currentUser.uid) }),
  // A photo's data, or null once it has been cleared after 30 days.
  chatPhoto: (c, m) => getDoc(doc(db, "chatPhotos", `${c.id}-${m.id}`)).then((x) => (x.exists() ? x.data().data : null)),
  USER, PIN, MAX_PHOTOS, CODE_MIN,
};

const EMPTY = () => ({ uid: null, me: null, username: null, role: null, admin: false, owner: false, feed: [], out: new Set(), outInfo: new Map(), notices: [], seen: [], reports: [], outlog: [], staff: [], myPhotos: [], requests: [], tasks: {}, runs: {}, events: [], lists: {}, labels: [], shifts: [], restock: [], fixtures: [], asks: [], incidents: [], reviews: [], ratings: [], issues: [], audit: [],
  training: [], concerns: [], directory: [], chats: [], msgs: [], pings: [] });
onAuthStateChanged(auth, (u) => {
  LIVE.ready = true;
  if (u) { LIVE.uid = u.uid; listen(u.uid); return; }
  unsubAll(); LIVE.loaded.clear(); openChat = "";
  Object.assign(LIVE, EMPTY());
  liveChanged("me");
});
liveChanged("me");
