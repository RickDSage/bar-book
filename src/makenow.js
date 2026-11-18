/* ---------- Make it now: one drink at a time, big enough to read from the well ----------
   On the bar iPad, a tap on a drink (or Enter in the search, or the voice) opens it as big step cards over the station:
   Get ready (glass, ice, garnish, tools and the whole spec at a glance), then the drink's own picture guide a step a
   card, each ingredient with its ml and which side of the 25/50 jigger. Tap the card when it's done and the next one
   comes up; the last card's Done goes back to the list. From the round, Make the round walks every drink in making
   order, scaled to how many, and marks each one Made. ×1 to ×4 scale it. Pitchers stay on the spec only.
   Set up has the switch for what a tap opens (Make it now, or just the spec next to the list). Phones keep the drink
   page, whose Step by step is the same guide. Nothing here is saved to the team; the switch is kept on this iPad. */
let SXM = null;
SX.mk = store.get("sx.mk", true);
const sxmOk = (d) => !!d && d.section !== "Pitchers" && !!DATA.guides[d.name];
// Which side of the 25/50 jigger, for amounts it measures (12.5 ml steps up to 150 ml). Anything else shows the ml alone.
function sxmJig(ml) {
  if (!ml || ml > 150 || ml % 12.5) return "";
  if (ml === 25) return "the 25 side"; if (ml === 50) return "the 50 side"; if (ml === 12.5) return "half a 25";
  const parts = Array(Math.floor(ml / 50)).fill("50"); let r = ml % 50;
  if (r >= 25) { parts.push("25"); r -= 25; } if (r) parts.push("half a 25");
  return parts.join(" + ");
}
// A tap on a drink in the station's list: the spec goes next to the list as ever, and on an iPad Make it now opens.
function sxTap(id) { sxOpen(id); if (SX.mk && sxWide() && sxmOk(D[id])) sxmOpen([id], "tap"); }
// ids: the drinks to make, in order. from: "tap" (one drink) or "round" (the round, scaled to how many of each).
function sxmOpen(ids, from) {
  ids = ids.filter((id) => sxmOk(D[id])); if (!ids.length) return;
  SXM = { ids, k: 0, from, i: 0, done: new Set(), x: from === "round" ? SX.round.get(ids[0]) || 1 : SX.x || 1 };
  haptic(); sxmRender();
}
function sxmClose() { SXM = null; $("#sxm")?.remove(); }
const sxmD = () => D[SXM.ids[SXM.k]];
// The cards: Get ready, then the guide's own steps. The last step is where Done sits.
function sxmCards(d) { return [{ ready: true, title: "Get ready" }, ...DATA.guides[d.name].steps]; }
function sxmItem(d, it, miss) {
  const x = SXM.x, ml = it.ml != null ? it.ml * x : null;
  const name = ml == null && x > 1 ? (/^\d/.test(it.item) ? sxScale(it.item, x) : `${it.item} ×${x}`) : it.item;
  const hint = ml == null ? "" : x === 1 && it.hint ? it.hint : sxmJig(ml);
  const low = it.item.toLowerCase(), m = miss.find((m) => (d.spec[m.i] || "").toLowerCase().includes(low) || low.includes(m.it.n.toLowerCase()));
  return `<li class="${m ? "out" : ""}"><b class="ml">${ml != null ? `${sxNum(ml)}<small>ml</small>` : "•"}</b><span><span class="it" translate="no">${esc(name)}</span>${hint ? `<em>${esc(hint)}</em>` : ""}${m ? `<em class="sw" translate="no">Out tonight${m.swap ? `: ${esc(m.swap)}` : ""}</em>` : ""}</span></li>`;
}
function sxmCardHtml(d, c, n, last) {
  if (c.ready) {
    const g = DATA.guides[d.name], was = mult; mult = SXM.x; const spec = d.spec.map(specRow).join(""); mult = was;
    const al = d.allergens && d.allergens !== "None" ? d.allergens : "", gar = ART.garnish(d.garnish);
    return `<div class="sxm-ready">
      ${isOut(d.name) ? `<div class="outbar on"><span><b>86'd tonight.</b> Check with the guest before you make it.</span></div>` : plOutBanner(d)}
      ${al ? `<div class="allergy"><b>Allergens:</b> <span translate="no">${esc(al)}</span></div>` : ""}
      <div class="sxm-gig" translate="no"><div><i class="pic" aria-hidden="true">${glass(d)}</i><p><span>Glass</span><b>${esc(d.glass)}</b></p></div>
        <div><p><span>Ice</span><b>${esc(d.ice)}</b></p></div>
        <div>${gar ? `<i class="pic gar" aria-hidden="true">${gar}</i>` : ""}<p><span>Garnish</span><b>${esc(d.garnish)}</b></p></div></div>
      <p class="sxm-need"><span>You need</span> ${g.tools.map(esc).join(", ")}</p>
      <div class="sxm-k">Spec${SXM.x > 1 ? ` for ${SXM.x}` : ""}</div><ul class="spec" data-d="${d.id}" translate="no">${spec}</ul></div>`;
  }
  const miss = plOutOf(d).miss, gar = last && /garnish|serve/i.test(c.title) ? ART.garnish(d.garnish) : "";
  return `<div class="sxm-step"><div class="sxm-txt"><h3><span class="n">${n}</span><span translate="no">${esc(c.title)}</span></h3><p translate="no">${esc(c.text)}</p>
      ${c.items.length ? `<ul class="sxm-ing">${c.items.map((it) => sxmItem(d, it, miss)).join("")}</ul>` : ""}
      ${gar ? `<p class="sxm-gar"><i class="pic gar" aria-hidden="true">${gar}</i><b translate="no">${esc(d.garnish)}</b></p>` : ""}</div>
    <div class="sxm-pic" aria-hidden="true">${DATA.scenes[c.sv]}</div></div>`;
}
function sxmRender() {
  if (!SXM) return;
  let el = $("#sxm");
  if (!el) { el = document.createElement("div"); el.id = "sxm"; el.className = "sxm"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Make it now"); $("#v-station").append(el); }
  const d = sxmD(), cs = sxmCards(d), i = SXM.i, last = i === cs.length - 1, round = SXM.from === "round";
  const nextId = round ? SXM.ids.slice(SXM.k + 1).find((id) => !SX.made.has(id)) : null;
  const doneLabel = nextId != null ? `Done: next <span translate="no">${esc(D[nextId].name)}</span> ›` : "Done ✓";
  el.innerHTML = `<div class="sxm-top"><button class="btn" data-sxm-x aria-label="Close Make it now">✕</button>
      <div class="sxm-t"><h2 translate="no">${SXM.x > 1 ? `${SXM.x} × ` : ""}${esc(d.name)}</h2><span>${round ? `Round: drink ${SXM.k + 1} of ${SXM.ids.length}` : esc(d.section)}</span></div>
      <span class="sx-x" role="group" aria-label="How many">${[1, 2, 3, 4].map((n) => `<button data-sxm-n="${n}" aria-pressed="${n === SXM.x}">×${n}</button>`).join("")}</span>
      ${sayBtn(d)}<button class="btn" data-sxm-spec>Spec</button></div>
    <div class="sxm-body"><ol class="sxm-rail">${cs.map((c, k) => `<li><button data-sxm-go="${k}" class="${k === i ? "on" : SXM.done.has(k) ? "ok" : ""}"><span class="n">${SXM.done.has(k) && k !== i ? "✓" : k || "•"}</span><span translate="no">${esc(c.title)}</span></button></li>`).join("")}</ol>
      <div class="sxm-card${SXM.done.has(i) ? " done" : ""}" data-sxm-tap role="button" tabindex="0"><span class="sxm-of">${i ? `Step ${i} of ${cs.length - 1}` : "Before you start"}<i>${last ? "Tap when it's done" : "Tap when done for the next step"}</i></span>${sxmCardHtml(d, cs[i], i, last)}</div></div>
    <div class="sxm-nav"><button class="btn" data-sxm-step="-1"${i ? "" : " disabled"}>‹ Back</button><button class="btn pri" data-sxm-step="1">${last ? doneLabel : i ? "Next step ›" : "Start ›"}</button></div>`;
  sxMark(el);
  if (!calm()) { const c = el.querySelector(".sxm-card"); c.classList.add("in"); }
}
function sxmGo(i) { const n = sxmCards(sxmD()).length; SXM.i = Math.max(0, Math.min(n - 1, i)); haptic(); sxmRender(); }
// Done: the drink is made. In a round it's marked Made and the next one comes up; otherwise back to the list, search cleared.
function sxmDone() {
  const id = SXM.ids[SXM.k]; haptic();
  if (SX.round.has(id)) SX.made.add(id);
  if (SXM.from === "round") {
    const k = SXM.ids.findIndex((x, j) => j > SXM.k && !SX.made.has(x));
    if (k >= 0) { Object.assign(SXM, { k, i: 0, done: new Set(), x: SX.round.get(SXM.ids[k]) || 1 }); sxList(); sxSpec(); return sxmRender(); }
    sxmClose(); SX.view = "round"; sxBars(); sxList(); sxSpec(); return;
  }
  sxmClose();
  if (SX.q) { SX.q = ""; $("#sx-q").value = ""; sxBars(); }
  sxList(); sxSpec();
}
function sxmNext() {
  const n = sxmCards(sxmD()).length; SXM.done.add(SXM.i);
  if (SXM.i >= n - 1) return sxmDone();
  sxmGo(SXM.i + 1);
}
// The round in making order (stirred, built, shaken, fizz last), only what's still to make.
const sxmRoundIds = () => [...SX.round.keys()].filter((id) => D[id] && !SX.made.has(id)).sort((a, b) => sxOrder(D[a]) - sxOrder(D[b]));
document.addEventListener("click", (e) => {
  if (cur !== "station") return;
  const one = e.target.closest("[data-sxm]"); if (one) { const id = +one.dataset.sxm; return sxmOpen([id], SX.round.has(id) && SX.view === "round" ? "round" : "tap"); }
  if (e.target.closest("[data-sxm-round]")) return sxmOpen(sxmRoundIds(), "round");
  if (e.target.closest("[data-sxm-pref]")) { SX.mk = !SX.mk; store.set("sx.mk", SX.mk); haptic(); toast(SX.mk ? "A tap on a drink opens Make it now" : "A tap on a drink shows its spec"); sxList(); sxSpec(); return; }
  if (!SXM || !e.target.closest("#sxm")) return;
  if (e.target.closest("[data-sxm-x]")) { haptic(); return sxmClose(); }
  if (e.target.closest("[data-sxm-spec]")) { haptic(); const d = sxmD(); SX.x = SXM.x; sxmClose(); SX.view = "drink"; sxOpen(d.id); return; }
  const n = e.target.closest("[data-sxm-n]"); if (n) { SXM.x = +n.dataset.sxmN; haptic(); return sxmRender(); }
  const g = e.target.closest("[data-sxm-go]"); if (g) return sxmGo(+g.dataset.sxmGo);
  const s = e.target.closest("[data-sxm-step]"); if (s) return +s.dataset.sxmStep > 0 ? sxmNext() : sxmGo(SXM.i - 1);
  // A tap anywhere on the card ticks it, but not one on a button or link inside it (Offer instead).
  if (e.target.closest("[data-sxm-tap]") && !e.target.closest("#sxm [data-sxm-tap] button, #sxm [data-sxm-tap] a")) sxmNext();
});
// Keys on an iPad keyboard: → or Enter for the next card, ← back, Esc closes. Nothing reaches the station underneath.
addEventListener("keydown", (e) => {
  if (!SXM || cur !== "station" || !$("#sheet").hidden || $("#help")?.hidden === false) return;
  const k = e.key;
  if (k === "ArrowRight" || k === "ArrowDown" || k === "Enter") sxmNext();
  else if (k === "ArrowLeft" || k === "ArrowUp") sxmGo(SXM.i - 1);
  else if (k === "Escape") sxmClose();
  else return;
  e.preventDefault(); e.stopImmediatePropagation();
}, true);
// A sideways swipe moves between cards.
let sxmTouch = null, sxmSwiped = 0;
document.addEventListener("touchstart", (e) => { const t = e.touches[0]; sxmTouch = SXM && e.touches.length === 1 && e.target.closest("#sxm .sxm-body") ? { x: t.clientX, y: t.clientY } : null; }, { passive: true });
document.addEventListener("touchend", (e) => {
  if (!sxmTouch || !SXM) return; const t = e.changedTouches[0], dx = t.clientX - sxmTouch.x, dy = t.clientY - sxmTouch.y; sxmTouch = null;
  if (Math.abs(dx) > 70 && Math.abs(dx) > 2 * Math.abs(dy)) { sxmSwiped = Date.now(); dx < 0 ? sxmNext() : sxmGo(SXM.i - 1); }
}, { passive: true });
// The swipe's own click doesn't tick the card a second time.
addEventListener("click", (e) => { if (Date.now() - sxmSwiped < 400 && e.target.closest?.("#sxm [data-sxm-tap]")) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
document.head.insertAdjacentHTML("beforeend", `<style>
.sxm { position: fixed; inset: 0; z-index: 19; display: grid; grid-template-rows: auto 1fr auto; gap: 10px; background: var(--bg); padding: calc(env(safe-area-inset-top, 0px) + 10px) 16px calc(env(safe-area-inset-bottom, 0px) + 12px); }
.sxm-top { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.sxm-top > .btn { min-height: 52px; min-width: 52px; font-size: 18px; }
.sxm-t { flex: 1 1 260px; min-width: 0; }
.sxm-t h2 { margin: 0; font-family: var(--display); font-size: clamp(30px, 4vw, 46px); line-height: 1; text-transform: uppercase; }
.sxm-t span { color: var(--muted); font-size: 16px; }
.sxm-top .sx-x button { min-height: 48px; min-width: 52px; font-size: 18px; }
.sxm-body { display: grid; grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); gap: 14px; min-height: 0; }
.sxm-rail { display: flex; flex-wrap: wrap; gap: 6px; list-style: none; margin: 0; padding: 0; }
.sxm-rail button { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 4px 12px 4px 4px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); color: var(--fg); font-size: 15px; text-align: left; }
.sxm-rail button span:last-child { display: none; }
.sxm-rail .n { display: inline-grid; place-items: center; min-width: 30px; height: 30px; border-radius: 50%; background: var(--line); font-weight: 700; }
.sxm-rail .on { border-color: var(--brass); } .sxm-rail .on .n { background: var(--brass); color: var(--brass-ink); }
.sxm-rail .ok .n { background: var(--ok); color: var(--bg); }
@media (min-width: 1000px) {
  .sxm-body { grid-template-columns: 250px 1fr; grid-template-rows: minmax(0, 1fr); }
  .sxm-rail { flex-direction: column; flex-wrap: nowrap; overflow-y: auto; }
  .sxm-rail button { width: 100%; border-radius: 12px; font-size: 17px; min-height: 52px; }
  .sxm-rail button span:last-child { display: inline; }
}
.sxm-card { display: flex; flex-direction: column; gap: 12px; min-height: 0; overflow-y: auto; padding: 18px 22px; border: 2px solid var(--line); border-radius: 18px; background: var(--surface); color: var(--fg); text-align: left; font: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.sxm-card.done { border-color: var(--ok); }
.sxm-card.in { animation: sxmIn .18s ease-out; }
@keyframes sxmIn { from { opacity: .3; transform: translateX(24px); } to { opacity: 1; transform: none; } }
.sxm-of { display: flex; justify-content: space-between; gap: 10px; color: var(--brass); font-weight: 700; text-transform: uppercase; letter-spacing: .06em; font-size: 15px; }
.sxm-of i { font-style: normal; color: var(--muted); text-transform: none; letter-spacing: 0; font-weight: 400; }
.sxm-step { display: grid; grid-template-columns: 1fr; gap: 16px; flex: 1; }
@media (min-width: 900px) { .sxm-step { grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); align-items: start; } }
.sxm-step h3 { display: flex; align-items: center; gap: 14px; margin: 0; font-family: var(--display); font-size: clamp(34px, 4.6vw, 58px); line-height: 1; text-transform: uppercase; }
.sxm-step h3 .n { flex: none; display: inline-grid; place-items: center; width: 1.3em; height: 1.3em; border-radius: 50%; background: var(--brass); color: var(--brass-ink); font-size: .7em; }
.sxm-card.done h3 .n { background: var(--ok); }
.sxm-step p { margin: 12px 0 0; font-size: clamp(21px, 2.5vw, 30px); line-height: 1.35; }
.sxm-ing { list-style: none; margin: 16px 0 0; padding: 0; display: grid; gap: 8px; }
.sxm-ing li { display: grid; grid-template-columns: 5.2em 1fr; align-items: center; gap: 14px; padding: 8px 12px; border-radius: 12px; background: var(--bg); }
.sxm-ing .ml { font-family: var(--display); font-size: clamp(34px, 4vw, 52px); line-height: 1; color: var(--brass); text-align: right; }
.sxm-ing .ml small { font-size: .45em; margin-left: 3px; }
.sxm-ing .it { display: block; font-size: clamp(22px, 2.6vw, 32px); font-weight: 700; }
.sxm-ing em { display: block; font-style: normal; color: var(--muted); font-size: clamp(16px, 1.8vw, 20px); }
.sxm-ing li.out .it { text-decoration: line-through; color: var(--muted); }
.sxm-ing em.sw { color: var(--warn); font-weight: 700; }
.sxm-pic { background: var(--paper); border-radius: 14px; padding: 8px; }
.sxm-pic svg { display: block; width: 100%; height: auto; max-height: 42vh; }
@media (max-width: 899px) { .sxm-pic { order: -1; } .sxm-pic svg { max-height: 26vh; } }
.sxm-gar { display: flex; align-items: center; gap: 12px; margin-top: 16px !important; font-size: clamp(22px, 2.6vw, 30px); }
.sxm .pic { flex: none; display: block; width: 56px; height: 70px; color: var(--fg); } .sxm .pic.gar { width: 52px; height: 52px; }
.sxm .pic svg { width: 100%; height: 100%; }
.sxm-gig { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.sxm-gig > div { display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 12px; background: var(--bg); }
.sxm-gig p { margin: 0; min-width: 0; } .sxm-gig span, .sxm-need span, .sxm-k { display: block; color: var(--muted); font-size: 14px; text-transform: uppercase; letter-spacing: .06em; }
.sxm-gig b { font-size: clamp(20px, 2.3vw, 28px); }
.sxm-need { margin: 12px 0 0; font-size: clamp(19px, 2vw, 24px); }
.sxm-k { margin-top: 14px; }
.sxm-ready .spec { font-size: clamp(22px, 2.5vw, 30px); }
.sxm-ready .outbar, .sxm-ready .pl-outbar, .sxm-ready .allergy { margin: 0 0 10px; }
@media (max-width: 700px) { .sxm-gig { grid-template-columns: 1fr; } }
.sxm-nav { display: grid; grid-template-columns: 1fr 2fr; gap: 10px; }
.sxm-nav .btn { min-height: 64px; font-size: 22px; }
.sxm-nav .btn[disabled] { opacity: .35; }
body.sxbig .sxm-step p { font-size: clamp(26px, 3vw, 36px); } body.sxbig .sxm-ing .it { font-size: clamp(26px, 3vw, 38px); }
.sx-mkgo { width: 100%; min-height: 60px; font-size: 22px; margin: 12px 0 2px; }
</style>`);
