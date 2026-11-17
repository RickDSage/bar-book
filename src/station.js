
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
const SX = { big: store.get("sx.big", false), q: "", grp: "all", id: store.get("sx.id", null), view: "drink", x: 1, ids: [], round: new Map(store.get("sx.round", [])) };
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
  if (SX.view === "round" && !sxWide()) { el.innerHTML = sxRoundHtml(); sxMark(el); return; }
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
// ×1 to ×4 for a table, ×6 and ×8 for a jug or a pitcher.
const SX_XS = [1, 2, 3, 4, 6, 8];
// The liquid in one drink, from its ml lines (toppings like "Top ~100 ml" count; a garnish doesn't).
const sxMl = (d) => Math.round(d.spec.reduce((t, l) => { const m = l.match(/^(?:top(?: about)?\s+|side:\s*)?(\d+(?:\.\d+)?)\s?ml\b/i); return t + (m ? +m[1] : 0); }, 0));
// The alcohol-free version a guest can have instead: the house list's own pairs, then any Virgin or No- drink named after it.
const SX_ZERO = { "Pornstar Martini": "No-Star Martini", "Espresso Martini": "Espresso No-tini", "Cosmopolitan": "Virgin Cosmo", "London Cosmo": "Virgin Cosmo", "Piña Colada": "Virgin Colada", "Hugo Spritz": "Virgin Hugo", "Bloody Mary": "Virgin Mary", "Moscow Mule": "Virgin Mule" };
const SX_ZEROS = D.filter((d) => /^(virgin|no-)/i.test(d.name) || /No-tini/.test(d.name));
function sxZero(d) {
  if (SX_ZEROS.includes(d) || d.section === "Zero Proof") return null;
  const n = SX_ZERO[d.name]; if (n) return D.find((x) => x.name === n) || null;
  const words = d.name.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  return SX_ZEROS.find((z) => { const w = z.name.toLowerCase().replace(/^virgin /, ""); return words.includes(w); }) || null;
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
    <div class="sx-k">Spec${SX.x > 1 ? ` for ${SX.x}` : ""}<span class="sx-x" role="group" aria-label="How many">${SX_XS.map((n) => `<button data-sx-x="${n}" aria-pressed="${n === SX.x}">×${n}</button>`).join("")}</span></div>
    <ul class="spec sx-specl" data-d="${d.id}" translate="no">${spec}</ul>
    ${SX.x > 1 && sxMl(d) ? `<p class="sx-tot">About ${sxMl(d) * SX.x} ml of liquid before ice${SX.x >= 6 ? ": batch it in a jug, then shake or pour a glass at a time" : ""}.</p>` : ""}
    ${sxZero(d) ? `<div class="sx-zero"><span>Alcohol-free?</span><button class="chip" data-sx-id="${sxZero(d).id}" translate="no">${esc(sxZero(d).name)} \u203a</button></div>` : ""}
    <div class="sx-k">Method</div>${steps(d.method)}
    ${!out && d.subs ? `<details class="subs"><summary>Out of something?<span class="cnt">${d.subs.length}</span></summary><ul translate="no">${d.subs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></details>` : ""}
    <div class="sx-acts"><button class="btn pri" data-sx-add="${d.id}">+ Add to round${SX.round.get(d.id) ? ` (${SX.round.get(d.id)})` : ""}</button><button class="btn" data-sx-sheet="steps:${d.id}">Step by step</button><button class="btn" data-sx-sheet="spec:${d.id}">Full card and send</button>${LIVE.admin ? `<label class="btn" for="dm-in" data-sx-dm="${d.id}">${mediaOf(d)?.photo ? "Change house photo" : "Add house photo"}</label>` : ""}${!out && LIVE.me ? `<button class="btn" data-sx-86="${esc(d.name)}">86 it</button>` : ""}</div>
    ${nx ? `<div class="sx-pn"><button class="btn" data-sx-step="-1">‹ <span translate="no">${esc(pv.name)}</span></button><span>${i + 1} of ${SX.ids.length}</span><button class="btn" data-sx-step="1"><span translate="no">${esc(nx.name)}</span> ›</button></div>` : ""}`;
}
// The round: every drink scaled to how many, in the bar's making order: the ones that hold longest first (stirred, then
// built), shaken next so the foam and chill are fresh, anything topped with fizz last so it doesn't go flat. The glasses to pull at the top.
const sxOrder = (d) => (/^top/i.test(d.spec.at(-1) || "") || d.tags.includes("Fizzy") ? 3 : /shake/i.test(d.method) ? 2 : /stir/i.test(d.method) ? 0 : 1);
const SX_BUILDS = ["Stir", "Build in the glass", "Shake together", "Top with fizz last"];
function sxRoundHtml() {
  const ds = [...SX.round].map(([id, n]) => [D[id], n]).filter(([d]) => d).sort((a, b) => sxOrder(a[0]) - sxOrder(b[0]));
  const back = `<button class="back" data-sx-round="back">‹ Drinks</button>`;
  if (!ds.length) return `${back}<p class="note">The round is empty. Tap + next to a drink to add it.</p>`;
  const tally = (f) => { const m = new Map(); ds.forEach(([d, n]) => { const k = f(d); if (k && !/^none/i.test(k)) m.set(k, (m.get(k) || 0) + n); }); return [...m].map(([k, n]) => `${n} \u00d7 ${esc(k)}`).join(", "); };
  const shaken = ds.filter(([d]) => sxOrder(d) === 2).reduce((a, [, n]) => a + n, 0);
  const was = mult;
  const card = ([d, n]) => { mult = n; const s = d.spec.map(specRow).join(""); mult = was;
    return `<div class="sx-rc${isOut(d.name) ? " out" : ""}"><div class="sx-rh"><b translate="no">${n} × ${esc(d.name)}${isOut(d.name) ? " <i>86'd</i>" : ""}</b>
      <span class="sx-x"><button data-sx-rn="${d.id}:-1" aria-label="One fewer">−</button><button data-sx-rn="${d.id}:1" aria-label="One more">+</button></span></div>
      <div class="sx-rm" translate="no">${esc(d.glass)} · ${esc(d.ice)} · ${esc(d.garnish)}</div>${plOutTag(d)}
      <ul class="spec sx-specl" data-d="${d.id}" translate="no">${s}</ul><p class="sx-rmeth" translate="no">${esc(d.method)}</p></div>`; };
  // Drinks made the same way sit together, so the shaken ones go in the tins in one go.
  const cards = SX_BUILDS.map((t, k) => { const g = ds.filter(([d]) => sxOrder(d) === k); return g.length ? `<div class="sx-bh">${t} \u00b7 ${g.reduce((a, [, n]) => a + n, 0)}</div>${g.map(card).join("")}` : ""; }).join("");
  return `${back}<div class="sx-k">Round of ${sxRoundN()}<button class="linkbtn" data-sx-round="clear">Clear the round</button></div>
    <dl class="sx-prep" translate="no"><dt>Glasses</dt><dd>${tally((d) => d.glass)}</dd><dt>Ice</dt><dd>${tally((d) => d.ice) || "None"}</dd><dt>Garnish</dt><dd>${tally((d) => d.garnish) || "None"}</dd>
      ${shaken ? `<dt>Tins</dt><dd>${shaken} to shake: ${Math.ceil(shaken / 2)} tin${shaken > 2 ? "s" : ""}, up to 2 drinks a tin</dd>` : ""}</dl>
    <p class="note" style="margin-top:0">In making order: stirred, then built, then shaken so the foam is fresh, fizz last so it stays lively.</p>${cards}`;
}
// What's 86'd tonight, on the spec line itself: struck through, with the swap beside it.
function sxMark(root) {
  for (const ul of root.querySelectorAll("ul.spec[data-d]")) for (const m of plOutOf(D[+ul.dataset.d]).miss) {
    const li = ul.children[m.i]; if (!li || li.classList.contains("pl-out")) continue;
    li.classList.add("pl-out");
    if (m.swap) li.insertAdjacentHTML("beforeend", `<em class="pl-swap" translate="no">\u2192 ${esc(m.swap)}</em>`);
  }
}
function sxSpec() {
  const el = $("#sx-spec"); if (!el || !sxWide()) return;
  if (SX.view === "round") { el.innerHTML = sxRoundHtml(); el.dataset.id = "round"; sxMark(el); return; }
  const d = D[SX.id] ?? D[SX.ids[0]]; if (!d) { el.innerHTML = ""; return; }
  const same = el.dataset.id === String(d.id), y = el.scrollTop;
  SX.id = d.id; el.dataset.id = d.id; el.innerHTML = sxSpecHtml(d); sxMark(el);
  // The drink's house photo shows at the top: one read as it opens, as on the drink page.
  if (!same && LIVE.me && LIVE.media?.drink !== d.name) LIVE.api?.watchMedia(d.name);
  el.scrollTop = same ? y : 0;
}
function sxTonight() {
  const el = $("#sx-live"); if (!el) return;
  $("#sx-tools").hidden = !LIVE.me;
  if (!LIVE.me) { el.innerHTML = `<div class="st-tile st-join"><span class="st-k">Tonight</span><span class="st-s">Join the team on this iPad to see tonight's 86s, the close and the handover here, live.</span><button class="btn pri" data-st-go="notices">Join the team</button></div>`; return; }
  const out = [...outNow()].sort(), today = shiftDay();
  const side = (m) => {
    const p = progress(MODE_LISTS[m].at(-1)), r = LIVE.reports.find((x) => x.side === m && reportDay(x) === today);
    const last = LIVE.reports.find((x) => x.side === m && !x.pending && reportDay(x) !== today);
    return `<button class="st-tile" data-st-side="${m}"><span class="st-k">${esc(sideName(m))} closing</span>
      <b class="st-big">${p.n}/${p.of}</b><span class="st-bar"><i style="width:${p.pct}%"></i></span>
      <span class="st-s">${r ? (r.pending ? "Handover saved, waiting for signal" : `✅ Handover sent ${hhmm(new Date(ms(r.at)))} by ${esc(r.name)}`) : last ? `Last handover: ${esc(dayName(reportDay(last)))} by ${esc(last.name)}` : "No handover yet"}</span></button>`;
  };
  const ph = draftPhotos(), lbNow = LIVE.loaded.has("labels") ? toChange([mode]) : [], lbSoon = LIVE.loaded.has("labels") ? labelsDue([mode]).filter((x) => labelDue(x) === "tomorrow") : [];
  el.innerHTML = `${lbNow.length ? `<button class="st-tile sx-lb" data-sx-labels><span class="st-k">\ud83d\udea8 Date labels to change now \u00b7 ${lbNow.length}</span><span class="st-list" translate="no">${lbNow.slice(0, 6).map((x) => esc(x.item)).join("<br>")}${lbNow.length > 6 ? "<br>\u2026" : ""}</span><span class="st-s">Tap to change them${lbSoon.length ? `. ${lbSoon.length} more due tomorrow` : ""}</span></button>` : ""}
    <div class="st-tile st-86"><span class="st-k">86'd tonight${out.length ? ` \u00b7 ${out.length}` : ""}</span>
      ${out.length ? `<ul class="sx-outl" translate="no">${out.map((n) => `<li><span>${esc(n)}</span><button class="chip" data-sx-back="${esc(n)}">Back in</button></li>`).join("")}</ul>` : `<b class="st-big">Nothing</b>`}
      <button class="linkbtn" data-st-go="stock">Open the 86 board \u203a</button></div>
    ${side("bar")}${side("floor")}
    <div class="st-tile sx-ph"><span class="st-k">Tonight's photos \u00b7 ${esc(sideName(mode))}${ph.length ? ` \u00b7 ${ph.length}` : ""}</span>
      ${ph.length ? `<div class="sx-thumbs">${ph.slice(-6).map((x) => `<img src="${x.data}" alt="${esc(x.note || "Closing photo")}">`).join("")}</div>` : ""}
      ${ph.length >= LIVE.api.MAX_PHOTOS ? `<span class="st-s">${LIVE.api.MAX_PHOTOS} photos is the most for one handover.</span>`
        : `<div class="sx-phb"><label class="btn pri" for="ph-in">Take a photo</label><label class="btn" for="ph-pick">Upload</label></div><span class="st-s">They go with tonight's handover. Notes and deleting: Shift, Closing.</span>`}</div>
    ${sharedDev ? "" : `<button class="st-hint" data-shared-pick="on">Shared iPad is off. Tap to turn it on: My pay hidden, codes lock after 5 minutes</button>`}`;
}
// Built once, then each part redraws on its own, so the search box keeps its text and focus while the 86s change.
function renderStation() {
  if (!$("#sx-list")) $("#v-station").innerHTML = `<div class="sx-top"><h2>Bar station</h2><span class="sx-tb"><button class="btn" data-sx-big aria-pressed="${SX.big}" aria-label="Big text">Aa</button><button class="btn sx-exit" data-sx-exit>Exit<span class="sx-wide"> bar station</span></button></span></div>
    <div class="sx" id="sx">
      <aside class="sx-tonight" id="sx-tonight" aria-label="Tonight"><div class="sx-live" id="sx-live"></div>
        <div class="st-tile sx-tools" id="sx-tools" hidden><label class="st-k" for="sx-86q">Ran out of something?</label>
          <div class="sx-86in"><input id="sx-86q" list="sx-86l" maxlength="80" autocomplete="off" autocorrect="off" placeholder="Any ingredient, bottle or drink" enterkeyhint="done"><button class="btn pri" data-sx-86go>86 it</button></div>
          <datalist id="sx-86l"></datalist><span class="st-s">Goes on the 86 board for everyone. Drinks that use it show the swap.</span></div></aside>
      <section class="sx-drinks" aria-label="Drinks">
        <div class="search sx-search"><input id="sx-q" type="search" placeholder="Search any drink, spirit or glass" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="go" aria-label="Search drinks"></div>
        <div class="chips sx-chips" id="sx-grp" role="toolbar" aria-label="Groups">${SX_GROUPS.map(([k, t]) => `<button class="chip" data-sx-grp="${k}">${t}</button>`).join("")}</div>
        <div class="chips sx-chips" id="sx-recent"></div>
        <div class="sx-roundbar" id="sx-roundbar" hidden></div>
        <div id="sx-list"></div>
      </section>
      <section class="sx-spec" id="sx-spec" aria-label="Spec"></section>
    </div>`;
  if (!$("#sx-86l").children.length) $("#sx-86l").innerHTML = sx86Names().map((n) => `<option value="${esc(n)}">`).join("");
  document.body.classList.toggle("sxbig", SX.big);
  sxBars(); sxList(); sxSpec(); sxTonight(); sxFit();
}
// Everything that can go on the 86 board: the stock list, every ingredient in a spec, every drink. Anything else typed
// still goes on, as typed (a burger, a glass).
const sx86Names = () => [...new Set([...STOCK_FLAT, ...MK.items.map((x) => x.n), ...D.map((d) => d.name)])].sort((a, b) => a.localeCompare(b));
function sx86Name(t) {
  const low = t.toLowerCase(), hit = sx86Names().find((n) => n.toLowerCase() === low) || t;
  if (OUT_DRINKS.has(hit) || STOCK_FLAT.includes(hit)) return hit;
  // An ingredient goes on under the stock list's own name, so the board and the drinks agree.
  const it = MK.byKey.get(mkNorm(hit)); return it ? plOutName(it) : hit;
}
function sx86Go() {
  const inp = $("#sx-86q"), t = inp.value.trim().replace(/\s+/g, " "); if (!t) return inp.focus();
  const n = sx86Name(t);
  if (isOut(n)) return toast(`${n} is already 86'd`);
  setOut(n, true); haptic(); inp.value = ""; inp.blur(); toast(`${n} 86'd for everyone`);
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
  if (e.target.closest("[data-sx-big]")) { SX.big = !SX.big; store.set("sx.big", SX.big); haptic(); document.body.classList.toggle("sxbig", SX.big); e.target.closest("[data-sx-big]").setAttribute("aria-pressed", SX.big); sxFit(); return; }
  const dm = e.target.closest("[data-sx-dm]"); if (dm) { curId = +dm.dataset.sxDm; return; }
  if (e.target.closest("[data-sx-86go]")) return sx86Go();
  const bk = e.target.closest("[data-sx-back]"); if (bk) { const n = bk.dataset.sxBack; haptic(); setOut(n, false); toast(`${n} back in stock`); return; }
  if (e.target.closest("[data-sx-labels]")) { haptic(); pane = labelPane(mode); show("tally"); return; }
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
  if (e.target.id === "sx-86q" && e.key === "Enter") { e.preventDefault(); return sx86Go(); }
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
  if (what === "out" || what === "me" || what === "media") { sxList(); sxSpec(); }
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
/* A station that's never closed looks after itself. Every minute, while it's on: take the screen lock back if iOS let
   it go. Once nobody has touched it for 5 minutes (nothing open or being typed, signal on): load a new release of Bar
   Book if one has arrived, and start fresh once a shift day (after 6am), so a page open for days stays quick. A reload
   made this way skips the start screen. The round empties when the shift day changes. */
const sxBootDay = shiftDay();
if (store.get("sx.roundDay", sxBootDay) !== sxBootDay) { SX.round.clear(); sxSaveRound(); }
store.set("sx.roundDay", sxBootDay);
const sxIdle = (min) => Date.now() - lastTap >= min * 6e4;
function sxCare() {
  if (!stationOn || document.hidden) return;
  if (cur === "station" && !lock) keepAwake();
  // After 10 quiet minutes the screen goes dark but for the time and tonight's 86 count; a tap wakes it.
  if (cur === "station" && sxIdle(10) && $("#sheet").hidden) sxDim(true);
  if (!sxIdle(5) || !$("#sheet").hidden || document.activeElement?.matches?.("input, textarea, select") || !navigator.onLine || !["station", "drinks"].includes(cur)) return;
  if (!$("#upd").hidden || shiftDay() !== sxBootDay) { try { sessionStorage.setItem("sx.auto", "1"); } catch {} location.reload(); }
}
setInterval(sxCare, 6e4);
function sxDim(on) {
  let el = $("#sx-dim");
  if (!on) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement("button"); el.id = "sx-dim"; el.className = "sx-dim"; el.setAttribute("aria-label", "Tap to wake the bar station"); document.body.append(el); }
  const n = outNow().size;
  el.innerHTML = `<b>${hhmm(new Date())}</b><span>${LIVE.me ? (n ? `${n} 86'd tonight` : "Nothing 86'd") : ""}</span><small>Tap to wake</small>`;
}
// The tap that wakes it does only that.
addEventListener("pointerdown", (e) => { if (e.target.closest?.("#sx-dim")) { e.preventDefault(); e.stopPropagation(); setTimeout(() => sxDim(false), 0); } }, true);
addEventListener("click", (e) => { if (e.target.closest?.("#sx-dim")) { e.preventDefault(); e.stopPropagation(); } }, true);
// The screen lock lets go when the iPad sleeps or the app is put away; take it again on the way back.
document.addEventListener("visibilitychange", () => { if (!document.hidden && cur === "station") keepAwake(); });
document.head.insertAdjacentHTML("beforeend", `<style>
body.stmode .brandbar, body.stmode nav.tabs { display: none; }
body.stmode main { padding-top: 0; padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px)); }
.sx-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 0 8px; }
.sx-top h2 { font-size: 28px; white-space: nowrap; }
@media (max-width: 699px) { .sx-wide { display: none; } }
.sx-exit { min-height: 44px; padding: 8px 14px; }
.sx { display: grid; gap: 14px; grid-template-areas: "tonight" "drinks"; }
.sx-tonight { grid-area: tonight; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
/* Phones and the iPad upright: Tonight is one strip of cards that scrolls sideways, so the drinks keep the screen. */
.sx-tonight { grid-template-columns: none; grid-auto-flow: column; grid-auto-columns: minmax(230px, 1fr); overflow-x: auto; overscroll-behavior-x: contain; scrollbar-width: none; padding-bottom: 2px; margin-inline: calc(-1 * max(16px, env(safe-area-inset-left, 0px))); padding-inline: max(16px, env(safe-area-inset-left, 0px)); }
.sx-tonight::-webkit-scrollbar { display: none; }
.sx-tonight > .sx-live > *, .sx-tonight > .sx-tools { height: 178px; overflow: hidden; }
.sx-tonight .sx-outl { max-height: 92px; }
.sx-tonight .sx-lb .st-list { font-size: 16px; }
.sx-tonight .st-s { font-size: 13.5px; }
.sx-tonight .st-join { grid-column: 1 / -1; height: auto; }
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
.sx-tb { display: flex; gap: 8px; }
.sx-tb [data-sx-big] { min-width: 52px; font-size: 18px; }
.sx-tb [data-sx-big][aria-pressed="true"] { background: var(--brass); border-color: var(--brass); color: var(--brass-ink); }
.sx-live { display: contents; }
.sx-tools[hidden] { display: none; }
.sx-86in { display: flex; gap: 8px; width: 100%; }
.sx-86in input { flex: 1; min-width: 0; font: inherit; font-size: 17px; color: var(--fg); background: var(--bg); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; }
.sx-outl { list-style: none; margin: 0; padding: 0; width: 100%; max-height: 14em; overflow-y: auto; }
.sx-outl li { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 4px 0; font-size: 18px; font-weight: 700; border-bottom: 1px solid var(--line); }
.sx-outl .chip { min-height: 34px; padding: 4px 12px; font-size: 14px; }
.sx-lb { border-color: var(--warn); }
.sx-lb .st-k { color: var(--warn); }
.sx-thumbs { display: flex; gap: 6px; flex-wrap: wrap; }
.sx-thumbs img { width: 56px; height: 56px; object-fit: cover; border-radius: 8px; }
.sx-phb { display: flex; gap: 8px; flex-wrap: wrap; }
.sx-phb .btn { cursor: pointer; }
.sx-tot { margin: 8px 0 0; font-size: 16px; color: var(--muted); }
.sx-zero { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 14px; font-weight: 700; }
.sx-bh { margin: 18px 0 2px; font-family: var(--display); font-size: 22px; text-transform: uppercase; color: var(--brass); }
.sx-dim { position: fixed; inset: 0; z-index: 50; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; background: #000; color: #8a8173; }
.sx-dim b { font-family: var(--display); font-size: 120px; line-height: 1; font-weight: 800; }
.sx-dim span { font-size: 26px; }
.sx-dim small { font-size: 16px; opacity: .7; }
/* Big text: read from a step back. */
body.sxbig .sx-open .n { font-size: 23px; }
body.sxbig .sx-open .s { font-size: 17px; }
body.sxbig .sx-specl li { font-size: 30px; grid-template-columns: 170px 1fr; }
body.sxbig .sx-spec .steps { font-size: 25px; }
body.sxbig .sx-gig b { font-size: 22px; }
body.sxbig .sx-hero h3 { font-size: clamp(36px, 5vw, 56px); }
body.sxbig .sx-rh { font-size: 26px; }
body.sxbig .sx-rc .sx-specl li { font-size: 25px; }
body.sxbig .sx-rmeth { font-size: 20px; }
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
.sx-prep { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 8px 0; font-size: 18px; }
.sx-prep dt { color: var(--brass); font-weight: 700; }
.sx-prep dd { margin: 0; }
body.sxbig .sx-prep { font-size: 22px; }
body.sxbig .sx-open { min-height: 80px; }
body.sxbig .sx-add { width: 68px; font-size: 26px; }
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
  .sx-tonight { grid-auto-flow: row; grid-auto-columns: auto; overflow-x: hidden; margin-inline: 0; padding-inline: 0; }
  .sx-tonight > .sx-live > *, .sx-tonight > .sx-tools { height: auto; overflow: visible; }
  .sx-tonight .sx-outl { max-height: 14em; }
}
</style>`);
$("#sx-back").addEventListener("click", () => { haptic(); show("station"); });
