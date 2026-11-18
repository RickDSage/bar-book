/* ---------- Games and drills, read-aloud, Siri shortcuts and "since you were last in" (fun.js) ----------
   Injected at the PLUS marker after the other modules, so the drinks, the quiz questions (quizMake), LIVE and the pages exist.
   Everything here stays on the phone except quiz night, which goes through Firebase (quiz/live, see firestore.rules). */

const FN = { view: "home", hide: false };
const fnDay = () => shiftDay();
const fnAdd = (day, n) => new Date(Date.parse(day + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const fnMonth = (day = fnDay()) => day.slice(0, 7);
const fnMonthName = (ym) => new Date(ym + "-15T12:00:00Z").toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
// Something running on this page that the bar station mustn't bounce away from after 2 idle minutes.
function funBusy() { return cur === "fun" && (!!DRUN || FN.view === "quiz" || !!PRUN); }

/* ---------- Read it out (bar station) ----------
   The iPad reads a drink's steps out loud in a British voice, one step at a time, with Back, Again and Next, so the
   bartender can keep both hands on the tins. Uses the browser's own speech (speechSynthesis): free, offline on iPad,
   nothing leaves the device. iPad Safari only speaks after a tap, so the first step always starts from one. */
const SAY_OK = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
const SAY = { id: null, i: 0, steps: [], auto: store.get("sayAuto", false), voice: null };
function sayVoice() {
  if (SAY.voice) return SAY.voice;
  const vs = speechSynthesis.getVoices();
  SAY.voice = vs.find((v) => v.lang === "en-GB" && /daniel|serena|kate|arthur|martha|google uk/i.test(v.name)) || vs.find((v) => v.lang === "en-GB") || vs.find((v) => /^en[-_]GB/i.test(v.lang)) || null;
  return SAY.voice;
}
if (SAY_OK) speechSynthesis.addEventListener?.("voiceschanged", () => { SAY.voice = null; });
// Bar talk: "50 ml" is said "50 mil", "×2" is "times 2".
const sayWords = (t) => String(t).replace(/(\d+(?:\.\d+)?)\s?ml\b/gi, "$1 mil").replace(/×\s?(\d)/g, "times $1").replace(/\s*·\s*/g, ". ").replace(/[•*_]/g, "");
function saySteps(d) {
  const g = DATA.guides[d.name];
  const head = `${d.name}. ${d.glass}${d.ice && !/none/i.test(d.ice) ? `, ${d.ice}` : ""}. Garnish: ${d.garnish}.`;
  const steps = (g?.steps || []).map((s) => {
    const items = s.items.map((x) => `${x.ml ? `${x.ml}${/^[\d.]+$/.test(x.ml) ? " ml" : ""} ` : ""}${x.item}`).join(", ");
    return { t: s.title, say: `${s.title}. ${items ? items + ". " : ""}${s.text || ""}` };
  });
  return [{ t: "What you need", say: head }, ...(steps.length ? steps : d.spec.map((l, i) => ({ t: `Line ${i + 1}`, say: l }))), { t: "Done", say: `That's the ${d.name}. Garnish: ${d.garnish}.` }];
}
function sayIt() {
  speechSynthesis.cancel();
  const s = SAY.steps[SAY.i]; if (!s) return;
  const u = new SpeechSynthesisUtterance(sayWords(s.say));
  u.lang = "en-GB"; u.rate = 0.95; const v = sayVoice(); if (v) u.voice = v;
  u.onend = () => { if (SAY.auto && SAY.id != null && SAY.i < SAY.steps.length - 1) setTimeout(() => { if (SAY.id != null && !speechSynthesis.speaking) { SAY.i++; sayBar(); sayIt(); } }, 1200); };
  speechSynthesis.speak(u);
}
function sayBar() {
  let el = $("#say");
  if (SAY.id == null) { if (el) el.hidden = true; return; }
  if (!el) { el = document.createElement("div"); el.id = "say"; el.setAttribute("role", "region"); el.setAttribute("aria-label", "Reading out"); document.body.append(el); }
  const d = D[SAY.id], s = SAY.steps[SAY.i];
  el.hidden = false;
  el.innerHTML = `<div class="say-top"><b translate="no">🔊 ${esc(d.name)}</b><span>${SAY.i + 1} of ${SAY.steps.length}</span><button class="say-x" data-say-go="stop" aria-label="Stop reading">×</button></div>
    <p class="say-t">${esc(s.t)}</p><p class="say-s" translate="no">${esc(s.say)}</p>
    <div class="say-b"><button class="btn" data-say-go="back"${SAY.i ? "" : " disabled"}>‹ Back</button><button class="btn" data-say-go="again">Again</button><button class="btn pri" data-say-go="next"${SAY.i < SAY.steps.length - 1 ? "" : " disabled"}>Next ›</button></div>
    <label class="check say-auto"><input type="checkbox" data-say-auto${SAY.auto ? " checked" : ""}> Keep going on its own</label>`;
}
function sayStart(id) {
  if (!SAY_OK) return toast("This device can't read out loud");
  haptic(); SAY.id = id; SAY.i = 0; SAY.steps = saySteps(D[id]); sayBar(); sayIt();
}
function sayStop() { if (SAY_OK) speechSynthesis.cancel(); SAY.id = null; sayBar(); }
document.addEventListener("click", (e) => {
  const s = e.target.closest("[data-say]"); if (s) return sayStart(+s.dataset.say);
  const g = e.target.closest("[data-say-go]"); if (!g) return;
  haptic(); const k = g.dataset.sayGo;
  if (k === "stop") return sayStop();
  if (k === "back" && SAY.i > 0) SAY.i--;
  if (k === "next" && SAY.i < SAY.steps.length - 1) SAY.i++;
  sayBar(); sayIt();
});
document.addEventListener("change", (e) => { if (e.target.matches?.("[data-say-auto]")) { SAY.auto = e.target.checked; store.set("sayAuto", SAY.auto); } });
// Leaving the station stops the voice.
addEventListener("pagehide", () => sayStop());
const sayBtn = (d) => (SAY_OK ? `<button class="btn" data-say="${d.id}">🔊 Read it out</button>` : "");

/* ---------- Daily drill ----------
   Two minutes a day on the specs. The drinks you get wrong come back sooner (spaced repetition, Leitner boxes: a right
   answer moves a drink up a box and further away, a wrong one puts it back to tomorrow), the ones you know drift off.
   A streak counts the days in a row you've done it. All of it is on this phone only (store "drill"): nobody else sees it. */
const DRILL_SECS = 120, DRILL_GAP = [1, 2, 4, 7, 14, 30];
const drillGet = () => ({ cards: {}, days: [], log: {}, best: 0, ...store.get("drill", {}) });
let DR = drillGet(), DRUN = null;
const drillSave = () => store.set("drill", DR);
function drillStreak() {
  const set = new Set(DR.days), today = fnDay();
  let d = set.has(today) ? today : fnAdd(today, -1), n = 0;
  while (set.has(d)) { n++; d = fnAdd(d, -1); }
  return n;
}
const drillLearnt = () => Object.values(DR.cards).filter((c) => c.b >= 3).length;
const drillDue = () => { const t = fnDay(); return D.filter((d) => DR.cards[d.name] && DR.cards[d.name].due <= t).length; };
// Today's drinks: the ones due back first (least known first), then ones never asked, the house signatures before the rest.
function drillPool() {
  const t = fnDay(), r = Math.random;
  const due = D.filter((d) => DR.cards[d.name] && DR.cards[d.name].due <= t).sort((a, b) => DR.cards[a.name].b - DR.cards[b.name].b);
  const sig = new Set(D.filter(POOLS.Signatures).map((d) => d.id));
  const fresh = shuffle(r, D.filter((d) => !DR.cards[d.name])).sort((a, b) => sig.has(b.id) - sig.has(a.id));
  const pool = [...due, ...fresh].slice(0, 12);
  return pool.length >= 4 ? pool : shuffle(r, D).slice(0, 12);
}
function drillStart() {
  haptic(); sayStop();
  DRUN = { end: Date.now() + DRILL_SECS * 1e3, qs: quizMake(drillPool(), Math.random), i: 0, right: 0, done: 0, miss: [], pick: null, again: new Set() };
  FN.view = "drill"; renderFun(); drillTick();
}
function drillTick() {
  clearTimeout(drillTick.h);
  if (!DRUN || DRUN.over) return;
  const left = Math.max(0, DRUN.end - Date.now()), bar = $("#dr-time");
  if (bar) { bar.style.width = `${(left / (DRILL_SECS * 1e3)) * 100}%`; $("#dr-secs").textContent = `${Math.ceil(left / 1e3)}s`; bar.parentElement.classList.toggle("hurry", left < 15e3); }
  if (!left) return drillEnd();
  drillTick.h = setTimeout(drillTick, 250);
}
function drillPick(o) {
  const z = DRUN; if (!z || z.pick != null || z.over) return;
  const q = z.qs[z.i], ok = o === q.answer, c = DR.cards[q.name] || { b: 0, due: fnDay() };
  z.pick = o; z.done++; haptic();
  if (ok) { z.right++; if (!z.again.has(q.name)) { c.b = Math.min(c.b + 1, DRILL_GAP.length - 1); c.due = fnAdd(fnDay(), DRILL_GAP[c.b]); } }
  else {
    c.b = 0; c.due = fnAdd(fnDay(), 1); z.miss.push(q);
    // Asked again a few questions later, with the answers in a new order.
    if (!z.again.has(q.name)) { z.again.add(q.name); z.qs.splice(Math.min(z.i + 4, z.qs.length), 0, { ...q, opts: shuffle(Math.random, q.opts) }); }
  }
  DR.cards[q.name] = c; drillSave(); renderFun();
  setTimeout(drillNext, ok ? 650 : 1600);
}
function drillNext() {
  const z = DRUN; if (!z || z.over) return;
  z.i++; z.pick = null;
  if (z.i >= z.qs.length) z.qs.push(...quizMake(shuffle(Math.random, D).slice(0, 12), Math.random));
  renderFun();
}
function drillEnd() {
  const z = DRUN; if (!z) return;
  z.over = true; clearTimeout(drillTick.h);
  if (z.done) {
    const t = fnDay();
    if (!DR.days.includes(t)) DR.days = [...DR.days, t].slice(-400);
    DR.log[t] = Math.max(DR.log[t] || 0, z.right);
    z.pb = z.right > (DR.best || 0); if (z.pb) DR.best = z.right;
    drillSave();
  }
  FN.view = "drillEnd"; renderFun();
}
function drillHtml() {
  const z = DRUN, q = z.qs[z.i], picked = z.pick != null, left = Math.max(0, z.end - Date.now());
  const opt = (o) => `<button class="btn wide${picked && o === q.answer ? " right" : picked && o === z.pick ? " wrong" : ""}" data-dr-pick="${esc(o)}"${picked ? " disabled" : ""}>${picked && o === q.answer ? "✓ " : picked && o === z.pick ? "✗ " : ""}${esc(o)}</button>`;
  return `<div class="dr-head"><b>Daily drill</b><span>${z.right} right</span><span id="dr-secs">${Math.ceil(left / 1e3)}s</span><button class="linkbtn" data-fn="drill-stop">Stop</button></div>
    <div class="dr-bar"><i id="dr-time" style="width:${(left / (DRILL_SECS * 1e3)) * 100}%"></i></div>
    <div class="card dr-q"><h2 translate="no">${esc(q.name)}</h2><p class="lead" style="margin:6px auto 0">${esc(q.ask)}</p>${q.of ? `<p class="qz-of" translate="no">${esc(q.of)}</p>` : ""}
      <div class="qz-opts"${q.app ? "" : ' translate="no"'}>${q.opts.map(opt).join("")}</div>
      ${picked && z.pick !== q.answer ? `<p class="qz-said" role="status"><b>It's ${esc(q.answer)}.</b> It'll come back.</p>` : ""}</div>`;
}
function drillEndHtml() {
  const z = DRUN, s = drillStreak(), miss = [...new Map(z.miss.map((q) => [q.name, q])).values()];
  return `<button class="back" data-fn="home">‹ Games and drills</button>
    <div class="card dr-end"><p class="dr-fire" aria-hidden="true">${s >= 2 ? "🔥" : "✅"}</p><h2>${z.right} right in 2 minutes</h2>
      <p class="lead" style="margin:6px auto 0">${z.pb ? "Your best yet." : z.right >= 15 ? "Fast hands." : z.right >= 8 ? "Solid." : "Every go counts."} ${s ? `${plural(s, "day")} in a row.` : ""}</p>
      <div class="dr-stats"><div><b>${s}</b><span>Day streak</span></div><div><b>${DR.best || 0}</b><span>Your best</span></div><div><b>${drillLearnt()}</b><span>Specs learnt</span></div></div></div>
    ${miss.length ? `<div class="sec">Back tomorrow</div><p class="note">You'll get these again tomorrow. A look now helps them stick.</p>${miss.map((q) => `<div class="staffrow"><div class="n" translate="no">${esc(q.name)}</div><div class="s"><span>${esc(q.ask)}</span> ${q.of ? `<span translate="no">${esc(q.of)}:</span> ` : ""}<b${q.app ? "" : ' translate="no"'}>${esc(q.answer)}</b></div><div class="actions"><button class="btn" data-mk-open="${q.id}">Open the drink</button></div></div>`).join("")}` : ""}
    <div class="actions"><button class="btn pri" data-fn="drill">Go again</button><button class="btn" data-fn="home">Done</button></div>`;
}

/* ---------- Your month (Wrapped) ----------
   A share card for the month: closing nights, jobs ticked, 86s called, specs learnt, drill days and best, quiz nights.
   Counted on this phone from what it sees (its own ticks and 86s), so it never asks the server for anyone's history and
   holds nothing private: first name and counts only. */
function wrapNote() {
  if (!LIVE.me || !LIVE.uid) return;
  const W = store.get("wrap", {}), day = fnDay(), m = (W[fnMonth(day)] ||= { days: {} }), x = (m.days[day] ||= { t: 0, o: 0 });
  const t = LIVE.events.filter((e) => e.kind === "task" && e.uid === LIVE.uid && e.to === "done").length;
  const o = LIVE.outlog.filter((e) => e.uid === LIVE.uid && e.action === "out" && e.at && bday(e.at) === day).length;
  if (t <= x.t && o <= x.o) return;
  x.t = Math.max(x.t, t); x.o = Math.max(x.o, o);
  for (const k of Object.keys(W).sort().slice(0, -3)) delete W[k];
  store.set("wrap", W);
}
// In the first week of a month it shows the month just gone, then this month so far.
const wrapWhich = () => { const t = fnDay(); return +t.slice(8, 10) <= 7 ? fnMonth(fnAdd(t.slice(0, 8) + "01", -1)) : fnMonth(t); };
function wrapStats(ym = wrapWhich()) {
  const m = store.get("wrap", {})[ym] || { days: {} }, ds = Object.values(m.days);
  const drillDays = DR.days.filter((d) => d.startsWith(ym)), qn = store.get("qnPlayed", []).filter((d) => d.startsWith(ym));
  return { ym, closes: ds.filter((x) => x.t > 0).length, ticks: ds.reduce((n, x) => n + x.t, 0), outs: ds.reduce((n, x) => n + x.o, 0),
    learnt: drillLearnt(), drillDays: drillDays.length, best: Math.max(0, ...drillDays.map((d) => DR.log[d] || 0)), quiz: qn.length };
}
// A title from your own month only. Never a comparison with anyone else.
function wrapTitle(s) {
  if (s.closes >= 8) return ["The Closer", "Lights off, bar spotless, again and again."];
  if (s.learnt >= 25) return ["Spec Machine", "The menu lives in your head now."];
  if (s.drillDays >= 10) return ["Daily Grinder", "Two minutes a day, every day."];
  if (s.quiz >= 2) return ["Quiz Night Regular", "Always up for a round."];
  if (s.ticks >= 40) return ["Safe Pair of Hands", "Jobs done, ticked, handed over."];
  return ["Rising Star", "Every month counts. Next one's yours."];
}
function wrapHtml() {
  const s = wrapStats(), [t, sub] = wrapTitle(s);
  const tile = (n, l) => `<span><b>${n}</b><small>${l}</small></span>`;
  return `<button class="wrap-card" data-fn="wrap"><span class="k">Your ${fnMonthName(s.ym)} in Bar Book</span><b class="t">${t}</b><span class="s">${sub}</span>
    <span class="dr-stats">${tile(s.closes, "Closing nights")}${tile(s.ticks, "Jobs ticked")}${tile(s.learnt, "Specs learnt")}</span>
    <span class="go">Share your card ›</span></button>`;
}
async function wrapShare() {
  haptic();
  const s = wrapStats(), [title, sub] = wrapTitle(s), W = 1080, H = 1350, c = document.createElement("canvas"), g = c.getContext("2d");
  c.width = W; c.height = H;
  try { await document.fonts.load('700 40px "Atkinson Hyperlegible"'); } catch {}
  const F = (w, z) => `${w} ${z}px "Atkinson Hyperlegible", -apple-system, system-ui, sans-serif`;
  const grd = g.createLinearGradient(0, 0, W, H); grd.addColorStop(0, "#2a2117"); grd.addColorStop(1, "#0f0d0a");
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  g.fillStyle = "#e0ad4f"; g.fillRect(0, 0, W, 14);
  g.textBaseline = "top"; g.textAlign = "left";
  g.fillStyle = "#e0ad4f"; g.font = F(700, 38); g.fillText(`${fnMonthName(s.ym).toUpperCase()} IN BAR BOOK`, 80, 96);
  g.fillStyle = "#f4eee4"; g.font = F(700, 64); g.fillText(LIVE.me || "Me", 80, 160);
  g.fillStyle = "#e0ad4f"; g.font = F(700, 104); g.fillText(title, 80, 270);
  g.fillStyle = "#b3a998"; g.font = F(400, 40); g.fillText(sub, 80, 400);
  const tiles = [[s.closes, "closing nights"], [s.ticks, "jobs ticked"], [s.learnt, "specs learnt"], [s.drillDays, "drill days"], [s.best, "best drill score"], [s.quiz, "quiz nights"]];
  tiles.forEach(([n, l], i) => {
    const x = 80 + (i % 2) * 470, y = 520 + Math.floor(i / 2) * 230;
    g.fillStyle = "rgba(255,255,255,0.06)"; g.beginPath(); g.roundRect ? g.roundRect(x, y, 440, 200, 28) : g.rect(x, y, 440, 200); g.fill();
    g.fillStyle = "#f4eee4"; g.font = F(700, 96); g.fillText(String(n), x + 36, y + 22);
    g.fillStyle = "#b3a998"; g.font = F(400, 36); g.fillText(l, x + 36, y + 136);
  });
  g.fillStyle = "#8a8579"; g.font = F(400, 30); g.fillText("Black Tap Soho · Bar Book", 80, H - 90);
  const blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.92));
  const file = new File([blob], `bar-book-${s.ym}.jpg`, { type: "image/jpeg" });
  if (navigator.canShare?.({ files: [file] })) return navigator.share({ files: [file] }).catch(() => {});
  const u = URL.createObjectURL(blob), a = document.createElement("a"); a.href = u; a.download = file.name; a.target = "_blank"; a.rel = "noopener";
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000);
}

/* ---------- Quiz night ----------
   One game at a time for the whole team (quiz/live). The host (the bar station iPad, or any phone) shows the question
   big; everyone answers on their own phone. Ten questions from our own specs. The scoreboard is kind: the top three
   get a cheer, everyone else is "also played" with no score, and the host can hide names altogether. */
const QN_STALE = 60 * 6e4;
const qnLive = () => { const q = LIVE.quiz; return q && q.state !== "end" && (q.host === LIVE.uid || Date.now() - ms(q.at) < QN_STALE) ? q : null; };
const qnHost = () => LIVE.quiz?.host === LIVE.uid;
const qnPlayers = () => (LIVE.quiz ? LIVE.quizPlayers.filter((p) => p.game === LIVE.quiz.game) : []);
const qnScore = (p, q = LIVE.quiz) => q.qs.reduce((n, x, j) => n + (p.picks?.[j] === x.answer ? 1 : 0), 0);
const QN_LETTER = ["A", "B", "C", "D"];
function qnNew() {
  const game = Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("");
  const qs = quizMake(D, Math.random).map((q) => ({ name: q.name, ask: q.ask, of: q.of || "", opts: q.opts, answer: q.answer, id: q.id }));
  track(LIVE.api.quizHost({ game, qs, i: 0, state: "lobby", hide: FN.hide }), "Quiz night is open. Everyone can join now", "Couldn't start it. Check the signal");
}
const qnMove = (patch, ok) => track(LIVE.api.quizMove(patch), ok, "Not saved. Check the signal");
function qnJoin() {
  const q = qnLive(); if (!q || qnHost() || !LIVE.me) return;
  const mine = LIVE.quizPlayers.find((p) => p.uid === LIVE.uid);
  if (mine?.game === q.game || qnJoin.busy === q.game) return;
  qnJoin.busy = q.game; LIVE.api.quizPick(q.game, {}).catch(() => { qnJoin.busy = null; });
  const day = fnDay(), pl = store.get("qnPlayed", []); if (!pl.includes(day)) store.set("qnPlayed", [...pl, day].slice(-60));
}
function qnPick(o) {
  const q = LIVE.quiz, me = LIVE.quizPlayers.find((p) => p.uid === LIVE.uid && p.game === q?.game);
  if (!q || q.state !== "q" || me?.picks?.[q.i] != null) return;
  haptic(); track(LIVE.api.quizPick(q.game, { ...(me?.picks || {}), [q.i]: o }), null, "Answer not sent. Check the signal");
}
function qnBoard(q) {
  const ps = qnPlayers().map((p) => ({ ...p, s: qnScore(p, q) })).sort((a, b) => b.s - a.s || a.name.localeCompare(b.name));
  const total = ps.reduce((n, p) => n + p.s, 0), of = ps.length * q.qs.length;
  const team = `<p class="qn-team">Team score: <b>${total}</b> of ${of} right${ps.length ? ` · ${plural(ps.length, "player")}` : ""}</p>`;
  if (q.hide || !ps.length) return `${team}<p class="note">Names are hidden. Everyone sees their own score on their phone.</p>`;
  const top = ps.filter((p) => p.s > 0).slice(0, 3), medal = ["🥇", "🥈", "🥉"], rest = ps.filter((p) => !top.includes(p));
  // A tie shares the medal.
  const place = (p) => top.findIndex((x) => x.s === p.s);
  return `${team}<div class="qn-pod">${top.map((p) => `<div><span class="m" aria-hidden="true">${medal[place(p)]}</span><b translate="no">${esc(p.name)}</b><span>${p.s} right</span></div>`).join("")}</div>
    ${rest.length ? `<p class="note">Also played: <span translate="no">${rest.map((p) => esc(p.name)).join(", ")}</span>. Nice one, all of you.</p>` : ""}`;
}
function qnHostHtml(q) {
  const ps = qnPlayers(), x = q.qs[q.i], n = ps.filter((p) => p.picks?.[q.i] != null).length;
  const names = q.hide ? `<p class="note">${plural(ps.length, "phone")} in</p>` : `<div class="recent">${ps.map((p) => `<span class="chip" translate="no">${esc(p.name)}</span>`).join("") || `<span class="note">Nobody yet</span>`}</div>`;
  const end = `<button class="btn" data-fn="qn-end">End quiz night</button>`;
  if (q.state === "lobby") return `<div class="card qn-big"><h2>Quiz night</h2><p class="lead">Everyone: open Bar Book on your phone, then More, Games and drills, Quiz night.</p>${names}
      <label class="check"><input type="checkbox" data-qn-hide${q.hide ? " checked" : ""}> Hide names on the scoreboard</label>
      <div class="actions"><button class="btn pri" data-fn="qn-go"${ps.length ? "" : " disabled"}>Start the first question</button>${end}</div></div>`;
  if (q.state === "end") return `<div class="card qn-big"><h2>Final scores</h2>${qnBoard(q)}<div class="actions"><button class="btn pri" data-fn="qn-new">Another quiz</button><button class="btn" data-fn="qn-close">Close it</button></div></div>`;
  const show = q.state === "show", cnt = (o) => ps.filter((p) => p.picks?.[q.i] === o).length;
  return `<div class="qn-prog"><b>Question ${q.i + 1} of ${q.qs.length}</b><span>${show ? "" : `${n} of ${ps.length} answered`}</span></div>
    <div class="card qn-big"><h2 translate="no">${esc(x.name)}</h2><p class="lead" style="margin:6px auto 0">${esc(x.ask)}</p>${x.of ? `<p class="qz-of" translate="no">${esc(x.of)}</p>` : ""}
      <div class="qn-opts">${x.opts.map((o, j) => `<div class="qn-o q${j}${show && o === x.answer ? " right" : show ? " dim" : ""}"><b>${QN_LETTER[j]}</b><span translate="no">${esc(o)}</span>${show ? `<i>${cnt(o)}</i>` : ""}</div>`).join("")}</div>
      <div class="actions">${show ? `<button class="btn pri" data-fn="qn-next">${q.i + 1 < q.qs.length ? "Next question" : "See the scores"}</button>` : `<button class="btn pri" data-fn="qn-show">Show the answer</button>`}${end}</div></div>`;
}
function qnPlayerHtml(q) {
  const me = qnPlayers().find((p) => p.uid === LIVE.uid), x = q.qs[q.i], mine = me?.picks?.[q.i];
  if (!me) return `<div class="card"><h2>Joining…</h2><p class="note">Needs signal.</p></div>`;
  if (q.state === "lobby") return `<div class="card qn-big"><p class="dr-fire" aria-hidden="true">🎉</p><h2>You're in</h2><p class="lead">Waiting for <span translate="no">${esc(q.hostName)}</span> to start. Keep this page open.</p></div>`;
  if (q.state === "end") {
    const s = qnScore(me, q), ps = qnPlayers().map((p) => qnScore(p, q)).sort((a, b) => b - a), place = ps.indexOf(s) + 1;
    return `<div class="card qn-big"><h2>You got ${s} of ${q.qs.length}</h2><p class="lead">${!q.hide && s > 0 && place <= 3 ? ["Top of the bar.", "Second place. So close.", "Third place. On the podium."][place - 1] : s >= 7 ? "Proper knowledge." : "Well played."}</p>${qnBoard(q)}</div>`;
  }
  const show = q.state === "show";
  return `<div class="qn-prog"><b>Question ${q.i + 1} of ${q.qs.length}</b><span>${mine != null && !show ? "Locked in" : ""}</span></div>
    <div class="card"><h2 translate="no">${esc(x.name)}</h2><p class="lead" style="margin:6px auto 0">${esc(x.ask)}</p>${x.of ? `<p class="qz-of" translate="no">${esc(x.of)}</p>` : ""}
    <div class="qn-opts">${x.opts.map((o, j) => `<button class="qn-o q${j}${mine === o ? " mine" : ""}${show && o === x.answer ? " right" : show ? " dim" : ""}" data-qn-pick="${esc(o)}"${mine != null || show ? " disabled" : ""}><b>${QN_LETTER[j]}</b><span translate="no">${esc(o)}</span></button>`).join("")}</div>
    ${show ? `<p class="qz-said" role="status"><b>${mine === x.answer ? "Right!" : mine == null ? "Too slow this time." : "Not this one."}</b></p>` : mine != null ? `<p class="note">Locked in. Watch the big screen.</p>` : ""}</div>`;
}
// Quiz night couldn't load: say why, with Try again, never an endless "Loading".
let qnWaitT = null;
function qnWaitHtml() {
  const e = LIVE.quizErr, why = e === "permission-denied" ? "Quiz night isn't switched on for the team yet: maintenance needs to publish the new Firebase rules. The daily drill and bar phrases work now."
    : e ? "Quiz night couldn't load. Check the signal and try again."
    : !navigator.onLine ? "No signal. Quiz night needs it, because everyone's answers go to the big screen."
    : qnWaitT === "slow" ? "Still loading. The signal may be weak." : "Loading quiz night…";
  if (!e && qnWaitT === null) qnWaitT = setTimeout(() => { qnWaitT = "slow"; if (cur === "fun" && FN.view === "quiz") renderFun(); }, 8000);
  return `<div class="card"><h2>Quiz night</h2><p class="note" role="status">${why}</p>${e || qnWaitT === "slow" || !navigator.onLine ? `<div class="actions"><button class="btn" data-fn="qn-retry">Try again</button><button class="btn" data-fn="home">Back to games</button></div>` : ""}</div>`;
}
function qnHtml() {
  const back = `<button class="back" data-fn="home">‹ Games and drills</button>`;
  if (!LIVE.me) return `${back}<div class="card"><h2>Quiz night</h2><p class="note">Join the team first: quiz night runs through the team side, so everyone's answers reach the big screen.</p><div class="actions"><button class="btn pri" data-fn="join">Join the team</button></div></div>`;
  if (LIVE.quizErr || !LIVE.loaded.has("quiz")) return back + qnWaitHtml();
  const q = qnLive(), z = LIVE.quiz;
  // Just finished: the host and everyone who played still see the scores, until someone starts the next one.
  if (!q && z?.state === "end" && Date.now() - ms(z.at) < QN_STALE && (qnHost() || qnPlayers().some((p) => p.uid === LIVE.uid)))
    return back + (qnHost() ? qnHostHtml(z) : `${qnPlayerHtml(z)}<div class="actions"><button class="btn" data-fn="qn-new">Host the next one</button></div>`);
  if (!q) return `${back}<div class="card qn-big"><h2>Quiz night</h2><p class="lead">Ten questions from our own specs. Best on the bar station iPad: it shows the questions big, and everyone answers on their phone.</p>
    <label class="check"><input type="checkbox" data-qn-hide${FN.hide ? " checked" : ""}> Hide names on the scoreboard</label>
    <div class="actions"><button class="btn pri" data-fn="qn-new">Host quiz night here</button></div>
    <p class="note">Nobody is hosting right now. Scores only show on the night, and nothing is kept afterwards.</p></div>`;
  return back + (qnHost() ? qnHostHtml(q) : qnPlayerHtml(q));
}

/* ---------- Siri and shortcuts ----------
   Each place in Bar Book has a link. Saved as a Shortcut, Siri opens it by name ("Hey Siri, Bar Book 86"), and the same
   Shortcut can go on the Home Screen or on Back Tap. Links hold only where to go, never the team code. */
const SC_LINKS = [
  ["Bar Book 86", "#at=stock", "The 86 board: what's out, and 86 something"],
  ["Bar Book rapid fire", "#at=tab:rapid", "Rapid fire: the top drinks as big cards"],
  ["Bar Book closing", "#at=close", "Your side's closing checklist"],
  ["Bar Book handover", "#at=send", "Hand over: send with photos, or just save"],
  ["Bar Book labels", "#at=labels", "Date labels: what to change now"],
  ["Bar Book station", "#at=tab:station", "The iPad bar station"],
  ["Bar Book drill", "#at=drill", "Today's two-minute drill"],
  ["Bar Book quiz", "#at=quiz", "Quiz night"],
  ["Bar Book phrases", "#at=phrases", "Bar phrases in French, Spanish or Italian"],
];
function openShortcuts() {
  lastFocus = document.activeElement;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  $("#sheet").innerHTML = `<div class="sheet-top"><div class="bar1"><button class="back" id="sh-close">‹ Back</button><span class="t">Siri and shortcuts</span><span></span></div></div>
    <div class="gut sc">
    <h2 id="sh-name" style="margin-top:12px">Say it, and Bar Book opens there</h2>
    <p class="lead">"Hey Siri, Bar Book 86" opens the 86 board. One-time set-up, about a minute each.</p>
    <div class="sec">${ios ? "On this iPhone or iPad" : "On an iPhone or iPad"}</div>
    <ol class="sc-steps"><li>Tap <b>Copy</b> next to the one you want below.</li><li>Open the <b>Shortcuts</b> app, tap <b>+</b>, then <b>Add Action</b>. Search <b>Open URLs</b> and tap it.</li>
      <li>Tap <b>URL</b>, paste, then tap the name at the top and call it what you'll say, like <b>Bar Book 86</b>. Tap <b>Done</b>.</li>
      <li>Say <b>"Hey Siri, Bar Book 86"</b>. Same Shortcut, no Siri: Settings, Accessibility, Touch, <b>Back Tap</b>, then pick it for a double tap on the back of the phone.</li></ol>
    <p class="note">A Shortcut opens Bar Book in Safari, not in the Home Screen app, and Safari keeps its own login. Join the team once in Safari too (your name and the team code) and the team pages work there. Drinks, Rapid fire and the drill need no login.</p>
    <div class="sec">On Android</div>
    <p class="note">Long-press the link below, then Add to Home screen, or say "Hey Google, open" and the link's name after saving it as a Chrome bookmark. With the app installed from Chrome, the links open in the app.</p>
    <div class="sec">The links</div>
    ${SC_LINKS.map(([n, h, w]) => `<div class="staffrow"><div class="n">${esc(n)}</div><div class="s">${esc(w)}</div><div class="s sc-url" translate="no">${esc(appUrl(h))}</div>
      <div class="actions"><button class="btn pri" data-sc-copy="${esc(h)}">Copy</button><a class="btn" href="${esc(h)}" data-sc-try>Try it</a></div></div>`).join("")}
    <p class="note">The links only say where to go. They never hold the team code, so they're safe in a group chat.</p></div>
    <button class="btn wide" id="sh-close2">Close</button>`;
  showSheet(false); $("#sheet").scrollTop = 0; $("#sh-close").focus();
}
$("#sheet").addEventListener("click", async (e) => {
  const c = e.target.closest("[data-sc-copy]");
  if (c) { haptic(); try { await navigator.clipboard.writeText(appUrl(c.dataset.scCopy)); toast("Link copied. Paste it into Shortcuts"); } catch { toast("Couldn't copy. Press and hold the link to copy it"); } return; }
  const t = e.target.closest("[data-sc-try]");
  if (t) { e.preventDefault(); haptic(); closeSheet(); setTimeout(() => openLink(t.getAttribute("href")), 50); }
});

/* ---------- Since you were last in ----------
   The first time the app opens on a new shift day, one card says what changed while you were away: specs changed in a
   new release (checked against a fingerprint of every spec kept on this phone), and from the team side the same changes
   the Team page lists (86s, closing reports, list changes), tonight's 86 board and the labels to change. Got it hides it
   until the next shift. The pre-shift brief on the Morning page shows the same parts (sinceLast). */
const fnHash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
const specFp = () => Object.fromEntries(D.map((d) => [d.name, fnHash([d.spec.join("|"), d.glass, d.ice, d.garnish, d.method].join("~"))]));
function specNews() {
  const was = store.get("specFp", null); if (!was) return null;
  const now = specFp(), names = Object.keys(now);
  return { added: names.filter((n) => !was[n]), changed: names.filter((n) => was[n] && was[n] !== now[n]), gone: Object.keys(was).filter((n) => !now[n]) };
}
if (!store.get("specFp", null)) store.set("specFp", specFp());
const lastIn = store.get("lastIn", { day: "", at: 0 });
function sinceLast(side = mode) {
  const parts = [], sn = specNews();
  if (sn && (sn.added.length || sn.changed.length || sn.gone.length)) parts.push({ id: "specs", k: "tab:drinks", label: "Specs changed since you were last in", hot: true,
    lines: [...sn.changed.map((n) => `Changed: ${n}`), ...sn.gone.map((n) => `Off the menu: ${n}`), ...sn.added.slice(0, 5).map((n) => `New: ${n}`), ...(sn.added.length > 5 ? [`And ${sn.added.length - 5} more new drinks`] : [])].slice(0, 12) });
  if (!LIVE.me || !lastIn.at) return parts;
  const ch = changesSince(lastIn.at).map((x) => x.msg);
  if (ch.length) parts.push({ id: "since", k: "notices", label: "While you were away", lines: ch.slice(0, 8) });
  const r = LIVE.reports.find((x) => x.side === side);
  if (r && ms(r.at) > lastIn.at) parts.push({ id: "handover", k: "morning", label: `Last ${lower(sideName(side))} handover`, lines: [r.summary] });
  return parts;
}
function sinceShow() {
  if ($("#welcome") || !$("#sheet").hidden || $("#since") || cur === "station" || (lastIn.day === fnDay())) return;
  if (LIVE.me && !["outlog", "reports"].every((k) => LIVE.loaded.has(k))) return;
  if (!LIVE.me && teamCode && sinceShow.tries++ < 20) return;
  const parts = sinceLast(), out = LIVE.me ? [...outNow()].sort() : [], lbs = LIVE.me ? toChange([mode]) : [];
  if (out.length) parts.push({ id: "out", k: "stock", label: "86'd right now", lines: [out.join(", ")] });
  if (lbs.length) parts.push({ id: "labels", k: "labels", label: "Date labels to change", lines: lbs.map((x) => x.item), hot: true });
  if (!parts.length || !lastIn.day) return sinceDone();
  const el = document.createElement("div"); el.id = "since"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Since you were last in");
  el.innerHTML = `<div class="since-card"><h2>Since you were last in</h2><p class="note">Only what's new for you. Tap a part to go there.</p>
    ${parts.map((p) => `<button class="since-p${p.hot ? " hot" : ""}" data-since-go="${esc(p.k)}"><b>${esc(p.label)}</b>${p.lines.map((l) => `<span translate="no">${esc(l)}</span>`).join("")}</button>`).join("")}
    <button class="btn pri wide" data-since-go="">Got it</button></div>`;
  document.body.append(el);
}
sinceShow.tries = 0;
function sinceDone() {
  store.set("specFp", specFp());
  Object.assign(lastIn, { day: fnDay(), at: Date.now() }); store.set("lastIn", lastIn);
  $("#since")?.remove();
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-since-go]"); if (!b) return;
  haptic(); const k = b.dataset.sinceGo; sinceDone(); if (k) { openAt(k); scrollTo(0, 0); }
});
// Each open after that on the same day moves "last in" on, so tomorrow's card covers only what's new since today.
const sinceMove = () => { if (lastIn.day === fnDay()) { lastIn.at = Date.now(); store.set("lastIn", lastIn); } };
addEventListener("pagehide", sinceMove);
document.addEventListener("visibilitychange", () => { if (document.hidden) sinceMove(); });
setTimeout(function sinceTry() { if (lastIn.day === fnDay() || $("#since")) return; sinceShow(); setTimeout(sinceTry, 3000); }, 1500);

/* ---------- The Games and drills page (More) ---------- */
function funTopHtml() {
  const s = drillStreak(), today = DR.days.includes(fnDay()), due = drillDue(), q = LIVE.me && qnLive();
  return `<button class="dr-card${today ? " done" : ""}" data-fn="drill"><span class="k">Daily drill · 2 minutes</span>
      <b class="t">${s ? `🔥 ${plural(s, "day")} in a row` : "Start a streak today"}</b>
      <span class="s">${today ? `Done today: ${DR.log[fnDay()] || 0} right. Go again to beat it.` : due ? `${plural(due, "spec")} due back today, the ones you missed first.` : "Quick-fire questions on our specs. The ones you miss come back tomorrow."}</span>
      <span class="go">${today ? "Go again" : "Start"} ›</span></button>
    <button class="dr-card qn" data-fn="quiz"><span class="k">Quiz night</span><b class="t">${q ? (qnHost() ? "You're hosting" : `Join <span translate="no">${esc(q.hostName)}</span>'s quiz`) : "Play as a team"}</b>
      <span class="s">${q ? "It's on now. Tap to play." : "The iPad shows the questions, everyone answers on their phone."}</span><span class="go">${q ? "Play" : "Open"} ›</span></button>
    ${phCardHtml()}
    ${wrapHtml()}`;
}
// renderFun (maker.js) asks this first: a drill or quiz night takes over the page while it's on.
function funScreen() {
  const el = $("#v-fun");
  if (FN.view === "drill" && DRUN && !DRUN.over) { el.innerHTML = drillHtml(); return true; }
  if (FN.view === "drillEnd" && DRUN) { el.innerHTML = drillEndHtml(); return true; }
  if (LIVE.me) LIVE.api?.watchQuiz(true);
  if (FN.view === "quiz") { qnJoin(); el.innerHTML = qnHtml(); return true; }
  if (FN.view === "drill") { drillStart(); return true; }
  if (FN.view === "phr" && PRUN) { el.innerHTML = phHtml(); return true; }
  if (FN.view === "phrEnd" && PRUN) { el.innerHTML = phEndHtml(); return true; }
  if (FN.view === "phrCheck" && PRUN?.qs) { el.innerHTML = phCheckHtml(); return true; }
  if (FN.view === "phr") { phStart(); return true; }
  return false;
}
// Leaving the page: a drill in progress counts as done, and quiz night stops listening (it costs reads).
function funLeave() { clearTimeout(qnWaitT); qnWaitT = null; if (DRUN && !DRUN.over) drillEnd(); DRUN = null; PRUN = null; if (FN.view !== "quiz") FN.view = "home"; LIVE.api?.watchQuiz(false); }
function funGo(view) { FN.view = view; if (cur === "fun") renderFun(); else show("fun"); scrollTo(0, 0); }
$("#v-fun").addEventListener("click", (e) => {
  const b = e.target.closest("[data-fn], [data-dr-pick], [data-qn-pick]"); if (!b) return;
  if (b.dataset.drPick != null) return drillPick(b.dataset.drPick);
  if (b.dataset.qnPick != null) return qnPick(b.dataset.qnPick);
  const k = b.dataset.fn, q = LIVE.quiz; haptic();
  if (k === "home") { DRUN = null; PRUN = null; return funGo("home"); }
  if (k === "drill") return drillStart();
  if (k === "phr") return phStart();
  if (k === "drill-stop") return drillEnd();
  if (k === "quiz") return funGo("quiz");
  if (k === "wrap") return wrapShare();
  if (k === "qn-retry") { qnWaitT = null; LIVE.api?.watchQuiz(true, true); return renderFun(); }
  if (k === "qn-new") return qnNew();
  if (k === "qn-go") return qnMove({ state: "q", i: 0 });
  if (k === "qn-show") return qnMove({ state: "show" });
  if (k === "qn-next") return qnMove(q.i + 1 < q.qs.length ? { state: "q", i: q.i + 1 } : { state: "end" });
  if (k === "qn-end") { if (confirm("End quiz night for everyone?")) qnMove({ state: "end" }); return; }
  if (k === "qn-close") return funGo("home");
  if (k === "join") return show("notices");
});
document.addEventListener("change", (e) => {
  if (!e.target.matches?.("[data-qn-hide]")) return;
  FN.hide = e.target.checked;
  if (qnHost() && qnLive()) qnMove({ hide: FN.hide });
});
// Live changes: quiz night redraws, and Your month counts tonight's ticks and 86s.
function funLive(what) {
  if (what === "events" || what === "outlog") wrapNote();
  if ((what === "quiz" || what === "quizPlayers" || what === "me") && cur === "fun" && FN.view === "quiz") { qnJoin(); renderFun(); }
  if ((what === "quiz") && cur === "fun" && FN.view === "home") renderFun();
}
