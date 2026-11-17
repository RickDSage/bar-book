/* ---------- Log it ----------
   One button, on every phone and the bar iPad, for anything someone sees, finds, does, is told or tells a manager. Each
   kind goes where it already belongs, so nothing is kept twice: an 86 goes on the 86 board, something broken goes on
   Issues, and the rest is saved with the name and the time in tonight's events (the same day log as the closing ticks).
   The handover, tonight's report and the morning read it from there by themselves, and Log it and send on WhatsApp
   opens the usual Send page so the team chat sees it straight away. */
const LOG_KINDS = [
  ["note", "Saw, found or did", "Goes in tonight's handover under Logged tonight."],
  ["told", "Told a manager", "Goes in tonight's handover under Logged tonight, with who you told."],
  ["low", "Running low", "Goes in the handover under 2. Stock running low, and on tomorrow's order."],
  ["out", "86: ran out", "Goes on the 86 board for everyone, and drinks that use it show the swap."],
  ["fix", "Broken or needs fixing", "Goes on Issues and faults until someone fixes it, and in the handover."],
  ["open", "Not finished", "Goes in the handover under 3. Outstanding issues."],
  ["next", "For tomorrow", "Goes in the handover under 4. For tomorrow."],
];
const LOG_NAME = Object.fromEntries(LOG_KINDS.map(([k, t]) => [k, t]));
// The kinds kept in the day log. 86 and broken live on the 86 board and Issues.
const LOG_SAVED = ["note", "told", "low", "open", "next"];
const LOG_MAX = 200;
// Tonight's log (the events listener only holds today's shift day), oldest first.
const logsOf = (side) => LIVE.events.filter((e) => e.kind === "log" && (!side || e.area === side)).sort((a, b) => ms(a.at) - ms(b.at));
const logLine = (e) => `${e.label} (${e.name} ${hhmm(new Date(ms(e.at)))})`;
const logLines = (id, side = mode) => logsOf(side).filter((e) => e.what === id).map(logLine);
// Logged tonight: what has no handover point of its own.
const loggedLines = (side = mode) => logsOf(side).filter((e) => ["note", "told"].includes(e.what)).map(logLine);
const canDropLog = (e) => e.uid === LIVE.uid || LIVE.admin;
let lg = { what: "note", side: "", text: store.get("logDraft", ""), told: "" }, lgLast = null, lgFrom = null;
document.body.insertAdjacentHTML("beforeend", `<div id="logit" class="help" hidden><div class="help-in" role="dialog" aria-modal="true" aria-labelledby="lg-t"></div></div>`);
function logOpen(what) {
  lgFrom = document.activeElement;
  lg.side = mode;
  if (what && LOG_NAME[what]) lg.what = what;
  logRender(); $("#logit").hidden = false; $("#logit .help-in").scrollTop = 0;
  $("#lg-text")?.focus();
}
function logClose() { if ($("#logit").hidden) return; $("#logit").hidden = true; lgFrom?.focus?.(); lgFrom = null; }
function logRender() {
  const head = `<div class="help-h"><h3 id="lg-t">Log it</h3><button class="hq-x" data-lg-x aria-label="Close">×</button></div>`;
  if (!LIVE.me) {
    $("#logit .help-in").innerHTML = `${head}<p class="lead">Join the team first, so what you log is saved with your name and every phone sees it.</p>
      <div class="help-f"><button class="btn" data-lg-x>Not now</button><button class="btn pri" data-lg-join>Join the team</button></div>`;
    return;
  }
  const k = LOG_KINDS.find((x) => x[0] === lg.what), mine = logsOf(lg.side).slice(-5).reverse();
  const ph = { note: "The ice machine is leaking under the bar", told: "Two lemons left, ordered more", low: "Limes", out: "Prosecco", fix: "Glass washer leaking", open: "Back bar fridge not restocked", next: "Change the CO2 first thing" }[lg.what];
  $("#logit .help-in").innerHTML = `${head}
    <p class="lead">Anything you see, find, do, are told or tell a manager. One line is enough: it saves with your name and the time.</p>
    <div class="lg-kinds" role="group" aria-label="What is it?">${LOG_KINDS.map(([id, t]) => `<button class="chip" data-lg-kind="${id}" aria-pressed="${id === lg.what}">${t}</button>`).join("")}</div>
    ${lg.what === "told" ? `<div class="mini">Who did you tell?</div><div class="recent" translate="no">${STAFF.mgr.map((n) => `<button class="chip" data-lg-told="${esc(n)}" aria-pressed="${lg.told === n}">${esc(n)}</button>`).join("")}</div>` : ""}
    <label class="fld">${lg.what === "out" ? "What ran out?" : lg.what === "low" ? "What's running low?" : "What happened?"}<textarea id="lg-text" rows="2" maxlength="${LOG_MAX - 30}" placeholder="${esc(ph)}">${esc(lg.text)}</textarea></label>
    <div class="lg-side"><span>For</span><div class="seg" role="group" aria-label="Bar or floor">${Object.keys(MODE_LISTS).map((m) => `<button data-lg-side="${m}" aria-pressed="${m === lg.side}">${sideName(m)}</button>`).join("")}</div></div>
    <p class="note lg-where">${k[2]}</p>
    <div class="lg-go"><button class="btn pri" data-lg-go>Log it</button><button class="btn" data-lg-go="send">Log it and send on WhatsApp</button></div>
    <p class="note lg-acc"><b>Someone hurt or an accident?</b> Tell the duty manager now and write it in the accident book. <button class="linkbtn" data-goto="incident">Incident or accident ›</button></p>
    ${mine.length ? `<div class="mini">Logged tonight, ${esc(lower(sideName(lg.side)))}</div><ul class="lg-list">${mine.map(logRow).join("")}</ul>` : ""}`;
}
const logRow = (e) => `<li><div><span class="pill">${esc(LOG_NAME[e.what] || "Logged")}</span><p>${ut(e.label)}</p><small><span translate="no">${esc(e.name)}</span> \u00b7 ${hhmm(new Date(ms(e.at)))}</small></div>${canDropLog(e) ? `<button class="lg-drop" data-lg-drop="${e.id}" aria-label="Take it off">\u00d7</button>` : ""}</li>`;
function logSave(send) {
  const raw = ($("#lg-text")?.value || "").trim().replace(/\s+/g, " ");
  if (!raw) { toast(lg.what === "out" ? "Say what ran out" : "Write what happened first"); $("#lg-text")?.focus(); return; }
  if (rude(raw)) return toast(RUDE);
  const side = lg.side, what = lg.what;
  if (what === "out") {
    const n = sx86Name(raw.slice(0, 80));
    if (outNow().has(n)) toast(`${n} is already 86'd`); else { setOut(n, true); toast(`${n} 86'd for everyone`); }
    renderList();
  } else if (what === "fix") {
    track(LIVE.api.raise({ title: raw.slice(0, 120), detail: raw.length > 120 ? raw : "", area: side, urgent: false }), "On Issues and faults", "Not saved. Try again");
  } else {
    const label = (what === "told" && lg.told ? `Told ${lg.told}: ${raw}` : raw).slice(0, LOG_MAX);
    lgLast = { what, side, label, name: LIVE.me, at: Date.now() };
    track(LIVE.api.logIt(side, what, label), send ? null : "Logged. It's in tonight's handover", "Not saved. Try again");
  }
  haptic();
  lg.text = ""; lg.told = ""; store.set("logDraft", "");
  logClose();
  if (send) openSend(what === "out" ? "out" : what === "fix" ? "issues" : "log");
}
$("#logit").addEventListener("input", (e) => { if (e.target.id === "lg-text") { lg.text = e.target.value; store.set("logDraft", lg.text); } });
$("#logit").addEventListener("click", (e) => {
  const t = e.target;
  if (t.id === "logit" || t.closest("[data-lg-x]")) return logClose();
  if (t.closest("[data-goto]")) return logClose(); // the page-wide handler then opens it
  if (t.closest("[data-lg-join]")) { logClose(); return openAt("people"); }
  const kd = t.closest("[data-lg-kind]"); if (kd) { haptic(); lg.what = kd.dataset.lgKind; logRender(); $("#lg-text")?.focus(); return; }
  const tl = t.closest("[data-lg-told]"); if (tl) { haptic(); lg.told = lg.told === tl.dataset.lgTold ? "" : tl.dataset.lgTold; logRender(); return; }
  const sd = t.closest("[data-lg-side]"); if (sd) { haptic(); lg.side = sd.dataset.lgSide; logRender(); return; }
  const go = t.closest("[data-lg-go]"); if (go) return logSave(go.dataset.lgGo === "send");
  const dr = t.closest("[data-lg-drop]"); if (dr) return logDrop(dr.dataset.lgDrop);
});
function logDrop(id) { haptic(); track(LIVE.api.dropLog(id), "Taken off tonight's log", "Not taken off. Try again"); }
$("#logit").addEventListener("keydown", (e) => { if (e.key === "Escape") logClose(); });
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-log]"); if (b) { haptic(); if (!$("#sheet").hidden) hideSheet(); return logOpen(b.dataset.log || ""); }
  const d = e.target.closest("[data-lg-drop]"); if (d && !e.target.closest("#logit")) logDrop(d.dataset.lgDrop);
});
// Redrawn when someone else logs, unless this person is typing.
const logLive = () => { if (!$("#logit").hidden && document.activeElement?.id !== "lg-text") logRender(); };
// On the Shift tab, above every pane: one tap from anywhere in the night.
const logBarHtml = () => `<div class="logbar"><button class="btn pri" data-log>＋ Log it</button><span>Saw, found, did, told a manager or ran out: one line, with your name</span></div>`;
// On the Handover: what the team logged tonight, already in the handover.
function logHoHtml() {
  const xs = logsOf(mode);
  return `<div class="sec">Logged tonight${xs.length ? ` (${xs.length})` : ""}</div>
    ${xs.length ? `<p class="note">Already in the handover: running low, not finished and for tomorrow under their points, the rest under Logged tonight.</p><ul class="lg-list">${xs.map(logRow).join("")}</ul>`
      : `<p class="note">Nothing logged on the ${esc(lower(sideName(mode)))} yet. Anything the team logs tonight goes in the handover by itself.</p>`}
    <div class="actions"><button class="btn" data-log>＋ Log it</button>${xs.length ? sendBtn("logs", "Send tonight's log") : ""}</div>`;
}
// One entry, straight after Log it and send.
SHARE.log = () => {
  const e = lgLast; if (!e) return null;
  return { what: "Logged", title: `Black Tap Soho · ${sideName(e.side)} · ${LOG_NAME[e.what]}`, head: [`Logged by ${e.name} at ${hhmm(new Date(e.at))}`],
    parts: [{ id: "log", label: LOG_NAME[e.what], one: true, lines: [e.label] }] };
};
// Everything logged tonight, both sides, by kind.
SHARE.logs = () => {
  const xs = logsOf(); if (!xs.length) return null;
  return { what: "Tonight's log", title: `Black Tap Soho · tonight's log · ${dayName(shiftDay())}`, head: [plural(xs.length, "thing") + " logged"],
    parts: LOG_KINDS.filter(([k]) => LOG_SAVED.includes(k)).map(([id, label]) => ({ id, label, lines: xs.filter((e) => e.what === id).map((e) => `${sideName(e.area)}: ${logLine(e)}`) })).filter((p) => p.lines.length) };
};
document.head.insertAdjacentHTML("beforeend", `<style>
.logbar{display:flex;align-items:center;gap:12px;margin:12px 0 4px;padding:10px 12px;border:1px solid var(--line);border-radius:14px;background:var(--surface)}
.logbar .btn{flex:none;margin:0}.logbar span{color:var(--muted);font-size:14px;line-height:1.3}
.lg-kinds{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 4px}.lg-kinds .chip,#logit .recent .chip{margin:0}
.lg-side{display:flex;align-items:center;gap:10px;margin:8px 0}.lg-side>span{color:var(--muted);font-weight:700}.lg-side .seg{flex:1;grid-template-columns:1fr 1fr;margin:0}
.lg-go{display:grid;grid-template-columns:1fr;gap:8px;margin:10px 0 6px}.lg-go .btn{width:100%;margin:0}
@media (min-width:520px){.lg-go{grid-template-columns:1fr 1.4fr}}
.lg-acc{border-left:3px solid var(--warn);padding-left:10px}
.lg-list{list-style:none;padding:0;margin:6px 0}.lg-list li{display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid var(--line)}
.lg-list li>div{flex:1;min-width:0}.lg-list p{margin:6px 0 2px;line-height:1.35}.lg-list small,.lg-list .s{color:var(--muted);font-size:13px}
.lg-list li:last-child{border-bottom:0}
.lg-drop{flex:none;background:none;border:0;color:var(--muted);font-size:24px;line-height:1;min-height:0;padding:4px 8px}
</style>`);
