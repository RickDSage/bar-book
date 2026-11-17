/* ---------- Your shift, and the Guide ----------
   Bar or Floor on the start screen (or the first time someone opens Shift, after going straight to the drinks) shows a
   short walkthrough of that side's night: opening, Log it, closing and the handover. Once per person on each side: on a
   shared iPad, once per name. When the walkthrough changes, WALK_V goes up and everyone sees it once more.
   The ? at the top of every screen opens the Guide: start here, every part of Bar Book by section, and one search that
   answers "how do I make…", "how do I…" and "what's…" with the drink, the page or the meaning, or says it isn't in Bar
   Book and sends it to maintenance to add. The same search sits in Practise and on the bar station. */
const WALK_V = 3;
const WALK_NAV = { t: "Getting around", how: [
  "The tabs along the bottom go anywhere: Drinks, Shift, Team, My pay and More.",
  "‹ Back at the top of a page goes back one step, and so does your phone's own back (on an iPhone, swipe in from the left edge).",
  "⌂ at the top right always takes you home: the drinks, or the bar station on the iPad.",
  "? at the top right opens the Guide: every part of Bar Book by section, and a search for anything, like “how do I make a mojito” or “what's a dry shake”.",
], tip: "× closes this at any time. It's always in the Guide under Start here." };
const WALK_LOG = (side) => ({ t: "During service: Log it", how: [
  `Saw something, found something, did something, told a manager or someone told you? Tap ＋ Log it on Shift${side === "bar" ? " or on the bar station" : ""}. One line is enough.`,
  "Pick what it is. 86 goes on the 86 board for everyone and Broken goes on Issues. Running low, Not finished and For tomorrow go straight into tonight's handover. The rest goes under Logged tonight.",
  "Log it and send on WhatsApp puts it in the team chat from your phone, so everyone knows now.",
], tip: "Someone hurt or an accident: tell the duty manager straight away and write it in the accident book. Bar Book isn't the accident book." });
const WALK_SEND = { t: "Hand over and send", how: [
  "Shift, Handover: tap who closed, then check Running low, Outstanding and For tomorrow. Whatever the team logged is already in.",
  "Tap Hand over and send on WhatsApp. It saves for the morning team and opens WhatsApp with the whole close in tick boxes: pick the team chat and send.",
  "Bar Book never sends anything by itself. If it isn't sent from a phone, the chat doesn't see it.",
  "Closed on the iPad? Send it from your own phone: Team, Send on WhatsApp, then the last handover.",
], tip: "On an iPhone with photos: Copy the words, tap Send with photos, then paste the words as the caption." };
const WALK = {
  bar: [
    { t: "Your bar shift", how: [
      "Shift, Bar has the night in order, left to right: Morning, Labels, Stock, Closing, Handover.",
      "Everything you tick, 86 or log saves with your name and the time, and every phone on the team sees it straight away.",
      "Drinks has every spec, with Rapid fire for the rush. The bar iPad has both on the bar station, with tonight's 86s across the top.",
      "Ran out? Stock, Search everything to 86: a few letters (lymes finds Limes) or a kind, then 86. Tick several to do them together. Every drink that uses it shows the swap.",
    ], tip: "Seen it before? × closes it. It's always in the Guide: tap ? at the top." },
    WALK_NAV,
    { t: "Opening", how: [
      "Shift, Morning: read last night's handover and tap Mark as read.",
      "Sort what's outstanding. Anything you can't, tell the duty manager, then tap Checked: send on WhatsApp.",
      "Send today's order and prep to par. Date labels due today show at the top: change those first.",
    ], tip: "No handover from last night? Ask whoever closed to open Bar Book with signal: it may be waiting on their phone." },
    WALK_LOG("bar"),
    { t: "Closing the bar", how: [
      "Shift, Closing: tick each job as you do it, or Tick all under a heading.",
      "Two of you? Tap I'll do this on a heading, so the other person takes a different part.",
      "Can't do one? Tap ⋯, then Blocked, and say why. It goes in the handover.",
      "Take the closing photos (they're required) and change any date label marked URGENT.",
    ], tip: "Only what's left is on, so the next job is always at the top." },
    { t: "Stock count", how: [
      "Shift, Stock, Count stock: the count book on your phone, every place in the order you walk it.",
      "Tap a line, + and − for full ones, tap how full the open bottle is, then Next. Or say it: “Smirnoff two and a half”.",
      "Send the totals on WhatsApp or as a spreadsheet for whoever puts it into Nory.",
    ], tip: "No signal in the cellar? It saves anyway and sends when you're back." },
    WALK_SEND,
  ],
  floor: [
    { t: "Your floor shift", how: [
      "Shift, Floor has the night in order, left to right: Morning, Labels, Stock, Closing, Handover.",
      "Everything you tick, 86 or log saves with your name and the time, and every phone on the team sees it straight away.",
      "86 anything, food too: Stock, Search everything to 86, a few letters, then 86. Tick several to do them together. Not on the list? It goes on as you typed it.",
    ], tip: "Seen it before? × closes it. It's always in the Guide: tap ? at the top." },
    WALK_NAV,
    { t: "Opening", how: [
      "Shift, Morning: read last night's floor handover and tap Mark as read.",
      "Sort what's outstanding. Anything you can't, tell the duty manager, then tap Checked: send on WhatsApp.",
      "Send today's order and prep to par (napkins, cutlery, desserts). Date labels due today show at the top.",
    ], tip: "No handover from last night? Ask whoever closed to open Bar Book with signal: it may be waiting on their phone." },
    WALK_LOG("floor"),
    { t: "Closing the floor", how: [
      "Shift, Closing: the floor close heading by heading, shake station included. Tick as you go, or Tick all under a heading.",
      "Splitting it? Tap I'll do this on a heading, so everyone takes a different part.",
      "Can't do one? Tap ⋯, then Blocked, and say why. It goes in the handover.",
      "Take the closing photos (they're required) and change any date label marked URGENT.",
    ], tip: "Only what's left is on, so the next job is always at the top." },
    { t: "Stock count", how: [
      "Shift, Stock, Count stock: the count book on your phone, every place in the order you walk it.",
      "Tap a line, + and − for full ones, tap how full the open bottle is, then Next. Or say it: “Smirnoff two and a half”.",
      "Send the totals on WhatsApp or as a spreadsheet for whoever puts it into Nory.",
    ], tip: "No signal in the cellar? It saves anyway and sends when you're back." },
    WALK_SEND,
  ],
};
const walkKey = (side) => (sharedDev ? `${side}:${myName}` : side);
const walkSeen = (side) => (store.get("walk", {})[walkKey(side)] || 0) >= WALK_V;
function walkMark(side) { const w = store.get("walk", {}); w[walkKey(side)] = WALK_V; store.set("walk", w); }
// Once per person and side, when nothing else is open over the app.
function walkMaybe(side, wait = 0) {
  if (!WALK[side]) return;
  setTimeout(() => { if (walkSeen(side) || !$("#help").hidden || !$("#logit").hidden || $("#welcome")) return; walkOpen(side, 0); }, wait);
}
function walkOpen(side, i = 0) {
  const xs = WALK[side], c = xs[i], last = i === xs.length - 1;
  walkMark(side); introAt = -1;
  $("#help .help-in").innerHTML = `<div class="help-h"><h3 id="help-t">${esc(c.t)}</h3><button class="hq-x" data-help-x aria-label="Close">×</button></div>
    <div class="cprog"><b>${i + 1} of ${xs.length}</b><span class="dots" aria-hidden="true">${xs.map((_, j) => `<i class="${j === i ? "on" : j < i ? "ok" : ""}"></i>`).join("")}</span></div>
    <ul>${c.how.map((x) => `<li>${esc(x)}</li>`).join("")}</ul><p class="note"><b>Tip:</b> ${esc(c.tip)}</p>
    <div class="help-f">${i ? `<button class="btn" data-walk="${side}:${i - 1}">Back</button>` : `<button class="btn" data-help-x>Skip</button>`}${last ? `<button class="btn" data-guide>Open the Guide</button>` : ""}<button class="btn pri" ${last ? "data-help-x" : `data-walk="${side}:${i + 1}"`}>${last ? "Done" : "Next"}</button></div>`;
  $("#help").hidden = false; $("#help .help-in").scrollTop = 0; $("#help .btn.pri").focus();
}
// Meanings, for "what's a…". The Technique key in More is drawn from the same list.
const GLOSSARY = [
  ["Dry shake", "Shake without ice to whip the foam, then add ice and shake again."],
  ["Reverse dry shake", "Shake with ice, strain out the ice, then shake again without it for a thicker foam."],
  ["Double strain", "Hawthorne strainer plus a fine strainer, so no ice chips or pulp."],
  ["Foamer", "2 drops, as on the house cards. Used for foam instead of egg white."],
  ["Build", "Pour straight into the glass over ice. No shaker."],
  ["Stir", "Stir with ice in a mixing glass to chill and dilute without bubbles, then strain. For drinks that are all spirit."],
  ["Muddle", "Press fruit, herbs or sugar in the tin or glass to release the juice and oils. Press mint gently: it goes bitter if it's shredded."],
  ["Float", "Pour slowly over the back of a bar spoon so it sits on top."],
  ["Top", "Fill the rest of the glass with the mixer or fizz, last."],
  ["Rim", "Salt or sugar round the outside edge of the glass. Wet the edge with a citrus wedge first."],
  ["Twist", "A strip of citrus peel squeezed over the drink to spray its oils, then dropped in or on the rim."],
  ["Jigger", "The measure. Every pour is jiggered: no free pouring."],
  ["86", "Ran out, or not available tonight. Put it on the 86 board once and every phone knows."],
  ["Par", "How much of something to have ready at the start of the shift. Prep to par is on Morning."],
  ["Handover", "The end of the night for the next shift: what's done, what's low, what's outstanding and what tomorrow needs, with photos."],
  ["Tronc", "The team's share of service charge and tips, paid through payroll on last month's hours."],
  ["Date label", "The sticker on anything opened: what it is, the day it was opened and the day to use it by."],
];
const glossHtml = () => `<dl class="kv">${GLOSSARY.map(([t, d]) => `<dt>${esc(t)}</dt><dd>${esc(d)}</dd>`).join("")}</dl>`;
// Where each part of the app is explained in a ? panel.
const GD_HELP = { drinks: "drink", make: "make", rapid: "rapid", pay: "pay", morning: "morning", lists: "closing", labels: "labels", stock: "stock", send: "handover", ask: "ask", incident: "incident", issues: "issues", tell: "tell", rate: "rate", people: "people", sent: "sent", logit: "logit", station: "station" };
// Everything the Guide lists: the app's features plus Log it and the bar station.
const gdItems = () => [
  ...FEATURES.filter((f) => !(f.k === "tell" && LIVE.owner)),
  { g: "Shift", k: "logit", n: "Log it", go: "log", team: 1, what: "Anything you see, find, do, are told or tell a manager, in one line with your name and the time. It goes in tonight's handover by itself." },
  { g: "Drinks", k: "station", n: "Bar station (iPad)", go: "tab:station", what: "The iPad on the bar: any drink in big type, rounds, tonight's 86s, date labels and photos, with one tap to closing and the handover." },
];
const GD_KW = { ...PLACE_KW, logit: "log note report told manager saw found did tell everyone whatsapp", station: "ipad tablet bar station big screen", drinks: "spec recipe cocktail drink menu glass", make: "cocktail maker ingredients what can i make" };
const GD_STOP = new Set(["how", "do", "does", "i", "we", "you", "to", "make", "a", "an", "the", "what", "whats", "what's", "is", "are", "where", "can", "my", "of", "for", "in", "on", "it", "find", "get", "use"]);
const gdWords = (q) => plNorm(q).replace(/'/g, "").split(/[\s,?!.]+/).filter(Boolean);
// What was asked: a drink, a page or a meaning. Every word left after the question words has to match, typos allowed.
function gdSearch(q) {
  const all = gdWords(q), ws = all.filter((w) => !GD_STOP.has(w));
  if (!ws.length) return null;
  const words = (s) => plNorm(s).split(/[^a-z0-9]+/).filter(Boolean);
  const hit = (s) => { const xs = words(s); return ws.every((w) => mkWordHit(w, xs)); };
  const pq = plQuery(ws.join(" "));
  const drinks = plRank(D.filter((d) => plHits(d, pq.words)), pq.words).slice(0, 4);
  const pages = gdItems().filter((f) => hit(`${f.n} ${f.what} ${f.staff || ""} ${GD_KW[f.k] || ""} ${HELP[GD_HELP[f.k]]?.how.join(" ") || ""}`)).slice(0, 4);
  const terms = GLOSSARY.filter(([t, d]) => hit(t) || (ws.length > 1 && hit(`${t} ${d}`))).slice(0, 3);
  const asksHow = /\b(how|make|recipe|spec)\b/.test(all.join(" ")), asksWhat = /^(what|whats)\b/.test(all.join(" "));
  return { q, words: ws, drinks, pages, terms, fixed: pq.fixed, order: asksWhat ? ["terms", "drinks", "pages"] : asksHow ? ["drinks", "pages", "terms"] : ["pages", "drinks", "terms"] };
}
let gdQ = "", gdAsked = "";
function gdResultsHtml() {
  const r = gdSearch(gdQ);
  if (!r) return gdHomeHtml();
  const drinkRow = (d) => `<button class="gd-row" data-gd-drink="${d.id}"><span class="g" aria-hidden="true">${glass(d)}</span><span><b translate="no">${esc(d.name)}</b><small>${esc(d.glass)} · spec and step by step</small></span><i>›</i></button>`;
  const pageRow = (f) => `<button class="gd-row" data-gd-go="${f.k}"><span><b>${esc(f.n)}</b><small>${esc(f.what)}</small></span><i>›</i></button>`;
  const termRow = ([t, d]) => `<div class="gd-term"><b>${esc(t)}</b><span>${esc(d)}</span></div>`;
  const parts = { drinks: r.drinks.length && `<div class="mini">Drinks</div>${r.drinks.map(drinkRow).join("")}`, pages: r.pages.length && `<div class="mini">In Bar Book</div>${r.pages.map(pageRow).join("")}`,
    terms: r.terms.length && `<div class="mini">What it means</div>${r.terms.map(termRow).join("")}` };
  const body = r.order.map((k) => parts[k]).filter(Boolean).join("");
  const asked = gdAsked === gdQ.trim().toLowerCase();
  const miss = `<div class="gd-miss${body ? " soft" : ""}"><b>${body ? "Not what you meant?" : "That isn't in Bar Book yet."}</b><span>${asked ? "Sent to maintenance to add. Thanks." : "Send it to maintenance to add. They check it first, so nothing goes in until it's right."}</span>
    ${asked ? "" : `<button class="btn${body ? "" : " pri"}" data-gd-add>Add it</button>`}${body ? "" : `<button class="linkbtn" data-gd-new>A new bottle or ingredient? Add something new ›</button>`}</div>`;
  return `${r.fixed.length ? `<p class="note">Showing results for <b>${esc(r.fixed.join(", "))}</b>.</p>` : ""}${body}${miss}`;
}
function gdHomeHtml() {
  const groups = [...new Set(gdItems().map((f) => f.g))];
  return `<div class="mini">Start here</div><div class="gd-start">
      <button class="gd-tile" data-walk="bar:0"><b>A bar shift</b><small>Opening to handover</small></button>
      <button class="gd-tile" data-walk="floor:0"><b>A floor shift</b><small>Opening to handover</small></button>
      <button class="gd-tile" data-walk="bar:1"><b>Getting around</b><small>Back, home and this Guide</small></button>
      <button class="gd-tile" data-intro="0"><b>Everything Bar Book does</b><small>The full tour, ${INTRO.length} cards</small></button></div>
    ${groups.map((g) => `<details class="gd-sec"><summary>${esc(g)}<span>${gdItems().filter((f) => f.g === g).length}</span></summary>${gdItems().filter((f) => f.g === g).map((f) => `<div class="gd-item"><button class="gd-row" data-gd-go="${f.k}"><span><b>${esc(f.n)}</b><small>${esc(f.what)}</small></span><i>›</i></button>${GD_HELP[f.k] && HELP[GD_HELP[f.k]] ? `<button class="linkbtn" data-gd-help="${GD_HELP[f.k]}">How it works</button>` : ""}</div>`).join("")}</details>`).join("")}
    <details class="gd-sec"><summary>Words we use<span>${GLOSSARY.length}</span></summary>${GLOSSARY.map(([t, d]) => `<div class="gd-term"><b>${esc(t)}</b><span>${esc(d)}</span></div>`).join("")}</details>`;
}
// The search box itself, for the Guide, Practise and the bar station.
const gdBoxHtml = (id, ph = "Ask: how do I make a mojito?") => `<div class="search gd-search"><input id="${id}" class="gd-in" type="search" placeholder="${esc(ph)}" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="search" aria-label="Ask Bar Book"></div>`;
function guideOpen(q = "") {
  if (!$("#help").hidden && $("#gd-q")) { $("#gd-q").focus(); return; }
  helpFrom = helpFrom || document.activeElement; introAt = -1; gdQ = q;
  $("#help .help-in").innerHTML = `<div class="help-h"><h3 id="help-t">Guide</h3><button class="hq-x" data-help-x aria-label="Close">×</button></div>
    <p class="lead">Ask anything, or pick a section. A tap takes you straight there.</p>${gdBoxHtml("gd-q")}<div id="gd-out">${gdResultsHtml()}</div>
    <p class="note gd-foot">‹ Back or your phone's back goes back a step. ⌂ goes home. This Guide is always on the ? at the top.</p>`;
  $("#gd-q").value = q; $("#help").hidden = false; $("#help .help-in").scrollTop = 0;
  if (!matchMedia("(pointer: coarse)").matches || q) $("#gd-q").focus();
}
let gdT = 0;
document.addEventListener("input", (e) => {
  if (!e.target.matches?.(".gd-in")) return;
  // Practise or the bar station: the answers open in the Guide, which takes over the typing.
  if (e.target.id !== "gd-q") { const v = e.target.value; e.target.value = ""; return guideOpen(v); }
  clearTimeout(gdT); gdT = setTimeout(() => { gdQ = e.target.value; $("#gd-out").innerHTML = gdResultsHtml(); }, 120);
});
document.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches?.(".gd-in")) { e.preventDefault(); e.target.blur(); } });
// Asked for, and not in Bar Book: to maintenance as App feedback (Something missing), with what Wikipedia says it is.
async function gdAdd(btn) {
  const q = gdQ.trim().slice(0, 200); if (!q) return;
  if (!LIVE.me) { helpClose(); return openAt("people"); }
  await busy(btn, "Looking it up…", (async () => {
    let wiki = "";
    try { const t = gdSearch(q).words.join(" "); const p = (await itLookup(t))[0]; if (p) wiki = `\nWikipedia: ${p.title}${p.desc ? `, ${p.desc}` : ""}`; } catch {}
    track(LIVE.api.tell("missing", `Searched Bar Book for: “${q}”. Nothing found. Please add it.${wiki}`), "Sent to maintenance to add", "Not sent. Try again");
    gdAsked = q.toLowerCase(); haptic();
  })());
  $("#gd-out").innerHTML = gdResultsHtml();
}
$("#help").addEventListener("click", (e) => {
  const t = e.target;
  const w = t.closest("[data-walk]"); if (w) { haptic(); const [s, i] = w.dataset.walk.split(":"); return walkOpen(s, +i); }
  const go = t.closest("[data-gd-go]"); if (go) {
    const f = gdItems().find((x) => x.k === go.dataset.gdGo); haptic(); helpClose();
    if (!$("#sheet").hidden) hideSheet();
    if (f.go === "log") return logOpen(); openAt(f.go); scrollTo(0, 0); return;
  }
  const dk = t.closest("[data-gd-drink]"); if (dk) { haptic(); helpClose(); view = "steps"; store.set("view", view); return openSheet(+dk.dataset.gdDrink); }
  const hp = t.closest("[data-gd-help]"); if (hp) { helpOpen(hp.dataset.gdHelp, helpFrom); $("#help .help-f").firstElementChild.outerHTML = `<button class="btn" data-guide>‹ Back to the Guide</button>`; return; }
  if (t.closest("[data-gd-add]")) return gdAdd(t.closest("[data-gd-add]"));
  if (t.closest("[data-gd-new]")) { helpClose(); pane = "stock"; show("tally"); return; }
});
// Home: the drinks, or the bar station while it's on. Anything open over the page shuts first.
function goHome() {
  haptic(); helpClose(); logClose();
  if (!$("#sheet").hidden) hideSheet();
  show(stationOn ? "station" : "drinks"); scrollTo(0, 0);
}
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-guide]")) { e.preventDefault(); haptic(); const was = !$("#help").hidden; if (was) $("#help").hidden = true; return guideOpen(); }
  if (e.target.closest("[data-home]")) { e.preventDefault(); return goHome(); }
  const wo = e.target.closest("[data-walk-open]"); if (wo) { haptic(); return walkOpen(wo.dataset.walkOpen || mode, 0); }
});
document.head.insertAdjacentHTML("beforeend", `<style>
.hbtn{font-size:22px;font-weight:800;color:var(--brass);border:1px solid var(--line);border-radius:50%;width:40px;height:40px;background:none;padding:0;min-height:0}
.hbtn svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.gd-search{margin:10px 0 6px}.gd-search input{width:100%}
.gd-row{display:flex;align-items:center;gap:12px;width:100%;text-align:left;padding:12px 4px;border:0;border-bottom:1px solid var(--line);background:none;color:var(--fg);min-height:56px;font:inherit}
.gd-row>span:not(.g){flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}.gd-row small{color:var(--muted);font-size:13px;line-height:1.35}
.gd-row .g{flex:none;width:34px;height:34px;display:grid;place-items:center;color:var(--brass)}.gd-row .g svg{width:30px;height:30px}
.gd-row i{flex:none;font-style:normal;color:var(--brass);font-size:22px}
.gd-item{border-bottom:1px solid var(--line)}.gd-item .gd-row{border-bottom:0;padding-bottom:4px}.gd-item .linkbtn{margin:0 0 10px 4px;font-size:14px}
.gd-term{display:flex;flex-direction:column;gap:2px;padding:10px 4px;border-bottom:1px solid var(--line)}.gd-term span{color:var(--muted);font-size:14px;line-height:1.4}
.gd-start{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:6px 0 10px}
.gd-tile{display:flex;flex-direction:column;align-items:flex-start;gap:3px;padding:12px;border:1px solid var(--line);border-radius:14px;background:var(--surface);color:var(--fg);text-align:left;min-height:68px;font:inherit}
.gd-tile b{font-size:15px}.gd-tile small{color:var(--muted);font-size:12.5px;line-height:1.3}
.gd-sec{border-top:1px solid var(--line)}.gd-sec>summary{display:flex;align-items:center;justify-content:space-between;min-height:50px;font-weight:800;font-size:17px;cursor:pointer;list-style:none}
.gd-sec>summary::-webkit-details-marker{display:none}.gd-sec>summary span{color:var(--muted);font-weight:600;font-size:14px}
.gd-sec>summary::after{content:"▾";color:var(--brass);margin-left:8px}.gd-sec[open]>summary::after{content:"▴"}.gd-sec>summary span{margin-left:auto}
.gd-miss{display:flex;flex-direction:column;align-items:flex-start;gap:8px;margin:14px 0 4px;padding:12px;border:1px dashed var(--line);border-radius:14px}
.gd-miss span{color:var(--muted);font-size:14px;line-height:1.4}.gd-miss .btn{margin:0}.gd-miss .linkbtn{text-align:left;padding:0;font-size:14px}
.gd-miss.soft{display:grid;grid-template-columns:1fr auto;align-items:center;column-gap:12px;border-style:solid;padding:10px 12px}.gd-miss.soft b{font-size:15px}.gd-miss.soft span{grid-column:1}.gd-miss.soft .btn{grid-column:2;grid-row:1/3}
.gd-foot{margin-top:14px}
.gd-ask{margin:4px 0 14px}.gd-ask .mini{margin-bottom:4px}
</style>`);
