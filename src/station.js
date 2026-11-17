
/* ---------- Bar station: the iPad on the bar, for express service ----------
   A mode the iPad stays in. While it's on, Bar Book opens straight onto it, the tab bar steps aside, and every other page
   has a "‹ Bar station" button back. Exit bar station (top right) turns it off.
   - Drinks: one big search across the whole book (typos fine, Enter opens the top match), groups one tap away, the
     signatures and the Top 10 first, then every drink A to Z. 86'd drinks are greyed with the swap.
   - On an iPad the spec sits next to the list in big type: glass, ice and garnish, the spec, numbered steps, ×2 to ×4,
     the next drink by swipe or arrow. On a phone a tap opens the usual drink page.
   - A round: + adds a drink (again for two), and the round shows every spec scaled, shaken drinks first and fizz last,
     with the glasses to pull.
   - Tonight: the 86 board, the close on both sides and the handover, live.
   - Left alone for 2 minutes, it clears the search and the open drink, so the next person starts clean. The round stays.
   Everything is the same live data every phone sees; nothing extra is saved to the team. The screen stays on. */
const SX = { q: "", grp: "all", id: store.get("sx.id", null), view: "drink", x: 1, ids: [], round: new Map(store.get("sx.round", [])) };
if (SX.id != null && !D[SX.id]) SX.id = null;
const SX_GROUPS = [["all", "Everything"], ["sig", "Signatures"], ["top", "Top 10"], ["ask", "Guests ask for"], ["shots", "Shots"], ["zero", "No alcohol"], ["serves", "Serves"]];
const sxWide = () => matchMedia("(min-width: 700px)").matches;
const sxSaveRound = () => store.set("sx.round", [...SX.round]);
const sxRoundN = () => [...SX.round.values()].reduce((a, b) => a + b, 0);
function sxGroup(k) {
  if (k === "top") return rushNames().map((n) => D.find((d) => d.name === n)).filter(Boolean);
  return rapidList(RAPID_GROUPS[{ sig: 0, ask: 1, shots: 2, zero: 3, serves: 4 }[k]][1]);
}
// The parts of the list: one group on its own, or (Everything, or any search) each drink once, house list first.
function sxParts() {
  const q = SX.q.trim(), words = q ? plQuery(q).words : [], hit = (d) => plHits(d, words);
  if (!q && SX.grp !== "all") return [[SX_GROUPS.find(([k]) => k === SX.grp)[1], sxGroup(SX.grp)]];
  const seen = new Set(), parts = [];
  for (const [k, t] of SX_GROUPS.slice(1)) {
    const ds = sxGroup(k).filter((d) => !seen.has(d.id) && hit(d)); ds.forEach((d) => seen.add(d.id));
    if (ds.length) parts.push([k === "sig" ? "Black Tap signatures" : t, ds]);
  }
  const rest = D.filter((d) => !seen.has(d.id) && hit(d)).sort((a, b) => a.name.localeCompare(b.name));
  if (rest.length) parts.push([q ? "Everything else" : "Every other drink, A to Z", rest]);
  return parts;
}
const sxSpecLine = (d) => d.spec.map((s) => s.replace(/^Top about /i, "Top ~")).join(" · ");
function sxRow(d) {
  const out = isOut(d.name), n = SX.round.get(d.id) || 0;
  return `<div class="sx-row${out ? " out" : ""}"><button class="sx-open" data-sx-id="${d.id}" aria-current="${d.id === SX.id && SX.view === "drink"}"><span class="g" aria-hidden="true">${glass(d)}</span>
    <span><span class="n" translate="no">${esc(d.name)}${out ? " <i>86'd</i>" : plOutTag(d)}</span><span class="s" translate="no">${esc(sxSpecLine(d))}</span></span></button>
    <button class="sx-add${n ? " on" : ""}" data-sx-add="${d.id}" aria-label="Add ${esc(d.name)} to the round">${n ? `×${n}` : "+"}</button></div>`;
}
function sxList() {
  const el = $("#sx-list"); if (!el) return;
  if (SX.view === "round" && !sxWide()) { el.innerHTML = sxRoundHtml(); return; }
  const parts = sxParts(), y = el.scrollTop;
  SX.ids = parts.flatMap(([, ds]) => ds.map((d) => d.id));
  el.innerHTML = parts.length ? parts.map(([t, ds]) => `<div class="sx-h">${esc(t)} <small>${ds.length}</small></div>${ds.map(sxRow).join("")}`).join("")
    : `<p class="note">Nothing matches “${esc(SX.q)}”. Try the spirit, the glass or one word of the name.</p>`;
  el.scrollTop = y;
}
function sxBars() {
  $$("#sx-grp [data-sx-grp]").forEach((b) => b.setAttribute("aria-pressed", !SX.q.trim() && b.dataset.sxGrp === SX.grp));
  const rec = recent.slice(0, 6).map((id) => D[id]).filter(Boolean), n = sxRoundN();
  $("#sx-recent").innerHTML = rec.length ? `<span class="sx-lab">Recent</span>${rec.map((d) => `<button class="chip" data-sx-id="${d.id}" translate="no">${esc(d.name)}</button>`).join("")}` : "";
  $("#sx-roundbar").hidden = !n;
  $("#sx-roundbar").innerHTML = n ? `<button class="btn pri" data-sx-round="show">Round: ${n} drink${n > 1 ? "s" : ""} ›</button><button class="btn" data-sx-round="clear">Clear</button>` : "";
}
// One drink, big: what to grab, the spec, the steps.
function sxSpecHtml(d) {
  const out = isOut(d.name), al = d.allergens && d.allergens !== "None" ? d.allergens : "", i = SX.ids.indexOf(d.id);
  const was = mult; mult = SX.x; const spec = d.spec.map(specRow).join(""); mult = was;
  const alts = out ? plAlts(d) : [], pv = i >= 0 && SX.ids.length > 1 ? D[SX.ids[(i - 1 + SX.ids.length) % SX.ids.length]] : null, nx = pv ? D[SX.ids[(i + 1) % SX.ids.length]] : null;
  return `<div class="sx-hero"><span class="g" aria-hidden="true">${heroArt(d)}</span><div><h3 translate="no">${esc(d.name)}</h3><div class="sub">${esc(d.section)} · ${esc(blurb(d))}</div></div></div>
    ${out ? `<div class="outbar on"><span><b>86'd tonight.</b> ${outBy(d.name) ? `By ${outBy(d.name)}. ` : ""}Offer something else.</span>${LIVE.me ? `<button class="btn" data-sx-86="${esc(d.name)}">Back in stock</button>` : ""}</div>
      ${alts.length ? `<div class="pl-alts">Offer instead: ${alts.map((x) => `<button class="chip" data-sx-id="${x.id}" translate="no">${esc(x.name)}</button>`).join("")}</div>` : ""}` : plOutBanner(d)}
    ${al ? `<div class="allergy"><b>Allergens:</b> <span translate="no">${esc(al)}</span></div>` : ""}
    <div class="sx-gig" translate="no"><div><span>Glass</span><b>${esc(d.glass)}</b></div><div><span>Ice</span><b>${esc(d.ice)}</b></div><div><span>Garnish</span><b>${esc(d.garnish)}</b></div></div>
    <div class="sx-k">Spec${SX.x > 1 ? ` for ${SX.x}` : ""}<span class="sx-x" role="group" aria-label="How many">${[1, 2, 3, 4].map((n) => `<button data-sx-x="${n}" aria-pressed="${n === SX.x}">×${n}</button>`).join("")}</span></div>
    <ul class="spec sx-specl" translate="no">${spec}</ul>
    <div class="sx-k">Method</div>${steps(d.method)}
    ${!out && d.subs ? `<details class="subs"><summary>Out of something?<span class="cnt">${d.subs.length}</span></summary><ul translate="no">${d.subs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></details>` : ""}
    <div class="sx-acts"><button class="btn pri" data-sx-add="${d.id}">+ Add to round${SX.round.get(d.id) ? ` (${SX.round.get(d.id)})` : ""}</button><button class="btn" data-sx-sheet="steps:${d.id}">Step by step</button><button class="btn" data-sx-sheet="spec:${d.id}">Full card and send</button>${!out && LIVE.me ? `<button class="btn" data-sx-86="${esc(d.name)}">86 it</button>` : ""}</div>
    ${nx ? `<div class="sx-pn"><button class="btn" data-sx-step="-1">‹ <span translate="no">${esc(pv.name)}</span></button><span>${i + 1} of ${SX.ids.length}</span><button class="btn" data-sx-step="1"><span translate="no">${esc(nx.name)}</span> ›</button></div>` : ""}`;
}
// The round: every drink scaled to how many, shaken and stirred first, built next, anything topped with fizz last so
// it doesn't go flat while the rest are made. The glasses to pull at the top.
const sxOrder = (d) => (/shake|stir/i.test(d.method) ? 0 : /^top/i.test(d.spec.at(-1) || "") || d.tags.includes("Fizzy") ? 2 : 1);
function sxRoundHtml() {
  const ds = [...SX.round].map(([id, n]) => [D[id], n]).filter(([d]) => d).sort((a, b) => sxOrder(a[0]) - sxOrder(b[0]));
  const back = `<button class="back" data-sx-round="back">‹ Drinks</button>`;
  if (!ds.length) return `${back}<p class="note">The round is empty. Tap + next to a drink to add it.</p>`;
  const gl = new Map(); ds.forEach(([d, n]) => gl.set(d.glass, (gl.get(d.glass) || 0) + n));
  const was = mult;
  const cards = ds.map(([d, n]) => { mult = n; const s = d.spec.map(specRow).join(""); mult = was;
    return `<div class="sx-rc${isOut(d.name) ? " out" : ""}"><div class="sx-rh"><b translate="no">${n} × ${esc(d.name)}${isOut(d.name) ? " <i>86'd</i>" : ""}</b>
      <span class="sx-x"><button data-sx-rn="${d.id}:-1" aria-label="One fewer">−</button><button data-sx-rn="${d.id}:1" aria-label="One more">+</button></span></div>
      <div class="sx-rm" translate="no">${esc(d.glass)} · ${esc(d.ice)} · ${esc(d.garnish)}</div>${plOutTag(d)}
      <ul class="spec sx-specl" translate="no">${s}</ul><p class="sx-rmeth" translate="no">${esc(d.method)}</p></div>`; }).join("");
  return `${back}<div class="sx-k">Round of ${sxRoundN()}<button class="linkbtn" data-sx-round="clear">Clear the round</button></div>
    <p class="sx-glasses"><b>Pull:</b> <span translate="no">${[...gl].map(([g, n]) => `${n} × ${esc(g)}`).join(", ")}</span></p>
    <p class="note" style="margin-top:0">In making order: shaken and stirred first, built next, fizz last so it stays lively.</p>${cards}`;
}
function sxSpec() {
  const el = $("#sx-spec"); if (!el || !sxWide()) return;
  if (SX.view === "round") { el.innerHTML = sxRoundHtml(); el.dataset.id = "round"; return; }
  const d = D[SX.id] ?? D[SX.ids[0]]; if (!d) { el.innerHTML = ""; return; }
  const same = el.dataset.id === String(d.id), y = el.scrollTop;
  SX.id = d.id; el.dataset.id = d.id; el.innerHTML = sxSpecHtml(d);
  el.scrollTop = same ? y : 0;
}
function sxTonight() {
  const el = $("#sx-tonight"); if (!el) return;
  if (!LIVE.me) { el.innerHTML = `<div class="st-tile st-join"><span class="st-k">Tonight</span><span class="st-s">Join the team on this iPad to see tonight's 86s, the close and the handover here, live.</span><button class="btn pri" data-st-go="notices">Join the team</button></div>`; return; }
  const out = [...outNow()].sort(), today = shiftDay();
  const side = (m) => {
    const p = progress(MODE_LISTS[m].at(-1)), r = LIVE.reports.find((x) => x.side === m && reportDay(x) === today);
    const last = LIVE.reports.find((x) => x.side === m && !x.pending && reportDay(x) !== today);
    return `<button class="st-tile" data-st-side="${m}"><span class="st-k">${esc(sideName(m))} closing</span>
      <b class="st-big">${p.n}/${p.of}</b><span class="st-bar"><i style="width:${p.pct}%"></i></span>
      <span class="st-s">${r ? (r.pending ? "Handover saved, waiting for signal" : `✅ Handover sent ${hhmm(new Date(ms(r.at)))} by ${esc(r.name)}`) : last ? `Last handover: ${esc(dayName(reportDay(last)))} by ${esc(last.name)}` : "No handover yet"}</span></button>`;
  };
  el.innerHTML = `<button class="st-tile st-86" data-st-go="stock"><span class="st-k">86'd tonight${out.length ? ` · ${out.length}` : ""}</span>
      ${out.length ? `<span class="st-list" translate="no">${out.map(esc).join("<br>")}</span>` : `<b class="st-big">Nothing</b>`}<span class="st-s">Tap to 86 something or put it back</span></button>
    ${side("bar")}${side("floor")}
    ${sharedDev ? "" : `<button class="st-hint" data-shared-pick="on">Shared iPad is off. Tap to turn it on: My pay hidden, codes lock after 5 minutes</button>`}`;
}
// Built once, then each part redraws on its own, so the search box keeps its text and focus while the 86s change.
function renderStation() {
  if (!$("#sx-list")) $("#v-station").innerHTML = `<div class="sx-top"><h2>Bar station</h2><button class="btn sx-exit" data-sx-exit>Exit bar station</button></div>
    <div class="sx" id="sx">
      <aside class="sx-tonight" id="sx-tonight" aria-label="Tonight"></aside>
      <section class="sx-drinks" aria-label="Drinks">
        <div class="search sx-search"><input id="sx-q" type="search" placeholder="Search any drink, spirit or glass" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="go" aria-label="Search drinks"></div>
        <div class="chips sx-chips" id="sx-grp" role="toolbar" aria-label="Groups">${SX_GROUPS.map(([k, t]) => `<button class="chip" data-sx-grp="${k}">${t}</button>`).join("")}</div>
        <div class="chips sx-chips" id="sx-recent"></div>
        <div class="sx-roundbar" id="sx-roundbar" hidden></div>
        <div id="sx-list"></div>
      </section>
      <section class="sx-spec" id="sx-spec" aria-label="Spec"></section>
    </div>`;
  sxBars(); sxList(); sxSpec(); sxTonight(); sxFit();
}
// On an iPad the columns scroll on their own and fill the screen to the bottom.
function sxFit() { const el = $("#sx"); if (el && cur === "station") el.style.setProperty("--sxh", `${Math.max(320, innerHeight - el.getBoundingClientRect().top - 12)}px`); }
addEventListener("resize", () => { if (cur === "station") { sxFit(); sxList(); sxSpec(); } });
function sxOpen(id) {
  SX.id = id; SX.view = "drink"; store.set("sx.id", id);
  recent = [id, ...recent.filter((r) => r !== id)].slice(0, 6); store.set("recent", recent);
  if (!sxWide()) return openSheet(id);
  $$("#sx-list [data-sx-id]").forEach((b) => b.setAttribute("aria-current", +b.dataset.sxId === id));
  sxSpec(); sxBars();
}
function sxStep(n) { const i = SX.ids.indexOf(SX.id); if (i < 0 || SX.ids.length < 2) return; haptic(); sxOpen(SX.ids[(i + n + SX.ids.length) % SX.ids.length]); $(`#sx-list [data-sx-id="${SX.id}"]`)?.scrollIntoView({ block: "nearest" }); }
function sxRound(id, n) {
  const v = Math.max(0, Math.min(20, (SX.round.get(id) || 0) + n));
  v ? SX.round.set(id, v) : SX.round.delete(id); sxSaveRound(); haptic();
  if (n > 0 && SX.view !== "round") toast(`${D[id].name} added: round of ${sxRoundN()}`);
  sxBars(); sxList(); sxSpec();
}
function stationSet(on) { stationOn = on; store.set("station", on); }
document.addEventListener("click", (e) => {
  if (cur !== "station") return;
  if (e.target.closest("[data-shared-pick]")) return sxTonight();
  if (e.target.closest("[data-sx-exit]")) { haptic(); stationSet(false); show("info"); toast("Bar station off. Turn it on again in More"); return; }
  const o = e.target.closest("[data-sx-id]"); if (o) { haptic(); SX.x = 1; return sxOpen(+o.dataset.sxId); }
  const a = e.target.closest("[data-sx-add]"); if (a) return sxRound(+a.dataset.sxAdd, 1);
  const rn = e.target.closest("[data-sx-rn]"); if (rn) { const [id, n] = rn.dataset.sxRn.split(":"); return sxRound(+id, +n); }
  const rb = e.target.closest("[data-sx-round]");
  if (rb) {
    haptic(); const k = rb.dataset.sxRound;
    if (k === "clear") { SX.round.clear(); sxSaveRound(); SX.view = "drink"; }
    else SX.view = k === "show" ? "round" : "drink";
    sxBars(); sxList(); sxSpec(); if (!sxWide()) window.scrollTo(0, $("#sx-list").offsetTop - 80); return;
  }
  const g = e.target.closest("[data-sx-grp]"); if (g) { haptic(); SX.grp = g.dataset.sxGrp; SX.q = ""; $("#sx-q").value = ""; SX.view = "drink"; $("#sx-list").scrollTop = 0; sxBars(); sxList(); sxSpec(); return; }
  const x = e.target.closest("[data-sx-x]"); if (x) { haptic(); SX.x = +x.dataset.sxX; return sxSpec(); }
  const s = e.target.closest("[data-sx-step]"); if (s) return sxStep(+s.dataset.sxStep);
  const sh = e.target.closest("[data-sx-sheet]"); if (sh) { const [v, id] = sh.dataset.sxSheet.split(":"); view = v; store.set("view", view); return openSheet(+id); }
  const o86 = e.target.closest("[data-sx-86]"); if (o86) { const n = o86.dataset.sx86, on = !isOut(n); setOut(n, on); toast(on ? `${n} marked 86'd` : `${n} back in stock`); return; }
  const sd = e.target.closest("[data-st-side]"); if (sd) { haptic(); setMode(sd.dataset.stSide); pane = closeList(); show("tally"); return; }
  const go = e.target.closest("[data-st-go]"); if (!go) return; haptic();
  if (go.dataset.stGo === "notices") return show("notices");
  pane = "stock"; show("tally");
});
document.addEventListener("input", (e) => { if (e.target.id !== "sx-q") return; SX.q = e.target.value; SX.view = "drink"; $("#sx-list").scrollTop = 0; sxBars(); sxList(); if (SX.q.trim() && SX.ids.length) sxOpenQuiet(SX.ids[0]); });
// Typing shows the top match on the iPad without stealing the keyboard; Enter opens it (on a phone, its page).
function sxOpenQuiet(id) { if (!sxWide()) return; SX.id = id; $$("#sx-list [data-sx-id]").forEach((b) => b.setAttribute("aria-current", +b.dataset.sxId === id)); sxSpec(); }
document.addEventListener("keydown", (e) => {
  if (cur !== "station" || !$("#sheet").hidden) return;
  if (e.target.id === "sx-q" && e.key === "Enter") { e.preventDefault(); if (SX.ids.length) { e.target.blur(); sxOpen(SX.ids[0]); } return; }
  if (e.target.closest("input, textarea, select")) return;
  if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); sxStep(1); }
  if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); sxStep(-1); }
  if (e.key === "/" || (e.key.length === 1 && /\w/.test(e.key) && !e.metaKey && !e.ctrlKey)) $("#sx-q").focus();
});
// A sideways swipe on the spec goes to the next or previous drink in the list.
let sxTouch = null;
document.addEventListener("touchstart", (e) => { const t = e.touches[0]; sxTouch = cur === "station" && e.touches.length === 1 && e.target.closest("#sx-spec") && SX.view === "drink" ? { x: t.clientX, y: t.clientY } : null; }, { passive: true });
document.addEventListener("touchend", (e) => {
  if (!sxTouch) return; const t = e.changedTouches[0], dx = t.clientX - sxTouch.x, dy = t.clientY - sxTouch.y; sxTouch = null;
  if (Math.abs(dx) > 70 && Math.abs(dx) > 2 * Math.abs(dy)) sxStep(dx < 0 ? 1 : -1);
}, { passive: true });
// The 86s change everything on the station; anything else only the Tonight panel.
function stationLive(what) {
  if (!$("#sx-list")) return renderStation();
  if (what === "out" || what === "me") { sxList(); sxSpec(); }
  sxTonight();
}
// Left alone for 2 minutes: clear the search and the open drink and go back to the top, ready for the next person.
setInterval(() => {
  if (cur !== "station" || document.hidden) return;
  sxTonight();
  if (Date.now() - lastTap < 2 * 6e4 || (!SX.q && SX.grp === "all" && SX.view === "drink" && $("#sheet").hidden && !$("#sx-list").scrollTop)) return;
  if (!$("#sheet").hidden) closeSheet();
  SX.q = ""; SX.grp = "all"; SX.view = "drink"; SX.x = 1; $("#sx-q").value = ""; $("#sx-q").blur(); $("#sx-list").scrollTop = 0; window.scrollTo(0, 0);
  sxBars(); sxList(); sxSpec();
}, 15e3);
// The screen lock lets go when the iPad sleeps or the app is put away; take it again on the way back.
document.addEventListener("visibilitychange", () => { if (!document.hidden && cur === "station") keepAwake(); });
document.head.insertAdjacentHTML("beforeend", `<style>
body.stmode .brandbar, body.stmode nav.tabs { display: none; }
body.stmode main { padding-top: 0; padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px)); }
.sx-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 0 8px; }
.sx-top h2 { font-size: 28px; }
.sx-exit { min-height: 44px; padding: 8px 14px; }
.sx { display: grid; gap: 14px; grid-template-areas: "tonight" "drinks"; }
.sx-tonight { grid-area: tonight; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.sx-tonight .st-86, .sx-tonight .st-hint, .sx-tonight .st-join { grid-column: 1 / -1; }
.sx-drinks { grid-area: drinks; min-width: 0; }
.sx-spec { grid-area: spec; display: none; }
.st-tile { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding: 14px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); color: var(--fg); text-align: left; min-width: 0; }
.st-tile:active { border-color: var(--brass); }
.st-tile .btn { margin-top: 4px; }
.st-k, .sx-k, .sx-h, .sx-gig span, .sx-lab { font-size: 13px; letter-spacing: .08em; text-transform: uppercase; color: var(--brass); font-weight: 700; }
.st-big { font-family: var(--display); font-size: 36px; line-height: 1; }
.st-list { font-size: 19px; font-weight: 700; line-height: 1.35; }
.st-s { color: var(--muted); font-size: 14.5px; margin-top: auto; }
.st-bar { display: block; width: 100%; height: 10px; border-radius: 999px; background: var(--line); overflow: hidden; }
.st-bar i { display: block; height: 100%; background: var(--brass); }
.st-hint { padding: 10px 12px; border: 1px dashed var(--line); border-radius: 12px; color: var(--muted); font-size: 14px; text-align: left; }
.sx-search { margin-top: 0; }
.sx-search input { font-size: 20px; padding: 14px 16px; border-radius: 12px; }
.sx-chips { margin: 0 !important; padding: 10px 0 2px !important; align-items: center; }
.sx-chips:empty { display: none; }
.sx-lab { flex: none; margin-right: 2px; }
.sx-roundbar { display: flex; gap: 8px; margin-top: 10px; }
.sx-roundbar[hidden] { display: none; }
.sx-roundbar .pri { flex: 1; }
.sx-h { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 1; background: var(--bg); padding: 14px 0 6px; }
.sx-h small { color: var(--muted); font-weight: 400; }
.sx-row { display: flex; align-items: stretch; border-bottom: 1px solid var(--line); }
.sx-row.out .sx-open { opacity: .55; }
.sx-open { flex: 1; min-width: 0; display: grid; grid-template-columns: 40px 1fr; gap: 12px; align-items: center; min-height: 66px; padding: 10px 8px; text-align: left; color: var(--fg); border-radius: 10px; }
.sx-open .g { width: 40px; height: 46px; } .sx-open .g svg { width: 100%; height: 100%; }
.sx-open .n { display: block; font-weight: 700; font-size: 19px; line-height: 1.2; }
.sx-open .s { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 14.5px; color: var(--muted); margin-top: 2px; }
.sx-open i, .sx-rc i { font-style: normal; font-size: 13px; color: var(--warn); font-weight: 700; }
.sx-open[aria-current="true"] { background: var(--surface); box-shadow: inset 4px 0 0 var(--brass); }
.sx-add { flex: none; width: 56px; font-size: 22px; font-weight: 700; color: var(--brass); }
.sx-add.on { font-size: 17px; }
.sx-add:active, .sx-open:active { opacity: .7; }
.sx-hero { display: flex; gap: 18px; align-items: center; }
.sx-hero .g { flex: none; width: 84px; height: 100px; } .sx-hero .g svg, .sx-hero .g img { width: 100%; height: 100%; object-fit: cover; border-radius: 12px; }
.sx-hero h3 { font-size: clamp(30px, 4vw, 46px); }
.sx-hero .sub { color: var(--muted); margin-top: 6px; font-size: 16px; }
.sx-gig { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin: 18px 0 4px; }
.sx-gig div { background: var(--bg); border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; }
.sx-gig b { display: block; font-size: 18px; margin-top: 2px; }
.sx-k { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 20px 0 4px; }
.sx-x { display: inline-flex; gap: 6px; }
.sx-x button { min-width: 48px; min-height: 40px; border: 1px solid var(--line); border-radius: 10px; font-size: 16px; font-weight: 700; color: var(--fg); letter-spacing: 0; text-transform: none; }
.sx-x button[aria-pressed="true"] { background: var(--brass); border-color: var(--brass); color: var(--brass-ink); }
.sx-specl li { font-size: 23px; grid-template-columns: 136px 1fr; padding: 11px 0; }
.sx-spec .steps { font-size: 20px; } .sx-spec .steps li { padding: 6px 0; }
.sx-acts { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px; }
.sx-pn { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); gap: 10px; align-items: center; margin-top: 16px; }
.sx-pn > span { color: var(--muted); font-size: 14px; }
.sx-pn .btn { min-width: 0; } .sx-pn .btn span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sx-glasses { font-size: 18px; margin: 6px 0; }
.sx-rc { border: 1px solid var(--line); border-radius: 14px; padding: 12px 14px; margin-top: 10px; background: var(--bg); }
.sx-rc.out { border-color: var(--warn); }
.sx-rh { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 21px; }
.sx-rm { color: var(--muted); font-size: 15px; margin-top: 2px; }
.sx-rc .sx-specl li { font-size: 20px; padding: 7px 0; }
.sx-rmeth { margin: 8px 0 0; font-size: 16px; }
.sx-back { position: fixed; right: max(16px, env(safe-area-inset-right, 0px)); bottom: calc(var(--tabh) + 14px + env(safe-area-inset-bottom, 0px)); z-index: 7; min-height: 48px; padding: 10px 18px; border-radius: 999px; background: var(--brass); color: var(--brass-ink); font-weight: 700; box-shadow: 0 6px 18px rgba(0,0,0,.35); }
.sx-back[hidden] { display: none; }
/* iPad upright: Tonight across the top, then the list and the spec side by side, each scrolling on its own. */
@media (min-width: 700px) {
  body.stmode main.gut { max-width: none; }
  .sx { grid-template-columns: minmax(300px, 360px) minmax(0, 1fr); grid-template-areas: "tonight tonight" "drinks spec"; grid-template-rows: auto minmax(0, 1fr); height: var(--sxh, 80vh); }
  .sx-tonight { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .sx-tonight .st-86 { grid-column: auto; }
  .sx-tonight .st-join { flex-direction: row; align-items: center; flex-wrap: wrap; }
  .sx-tonight .st-join .st-s { margin: 0; flex: 1; }
  .sx-tonight .st-86 .st-list { max-height: 4.1em; overflow-y: auto; font-size: 17px; }
  .sx-drinks { display: flex; flex-direction: column; min-height: 0; }
  .sx-h { top: 0; }
  #sx-list { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
  .sx-spec { display: block; min-height: 0; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; background: var(--surface); border: 1px solid var(--line); border-radius: 18px; padding: 22px 24px 28px; }
  .sx-spec .outbar, .sx-spec .allergy { font-size: 17px; }
}
/* iPad sideways (and big iPads): the list, the spec, and Tonight down the right. */
@media (min-width: 1100px) {
  .sx { grid-template-columns: 340px minmax(0, 1fr) 290px; grid-template-areas: "drinks spec tonight"; grid-template-rows: minmax(0, 1fr); }
  .sx-tonight { grid-template-columns: 1fr; align-content: start; min-height: 0; overflow-y: auto; }
  .sx-tonight .st-tile { padding: 16px; }
  .sx-tonight .st-big { font-size: 44px; }
  .sx-tonight .st-86 .st-list { max-height: none; font-size: 20px; }
}
</style>`);
$("#sx-back").addEventListener("click", () => { haptic(); show("station"); });
