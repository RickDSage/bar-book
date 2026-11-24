/* ---------- Rapid fire: the house drinks as big buttons, for answering a guest fast ----------
   One tap from opening the app (the start page's Rapid fire button, or the first chip under Drinks). The signatures,
   then what guests ask for most, shots, alcohol-free and serves. Tap a button for the full spec; swipe on from there
   through the same list. "Specs on" shows each spec right on the page, so most questions need no tap at all. */
const RAPID_GROUPS = [
  ["Black Tap signatures", (d) => d.section === "Black Tap Signatures"],
  // The classics UK guests ask for most (CGA and trade top-seller lists), in the order the bar hears them.
  ["Guests ask for", ["Pornstar Martini", "Espresso Martini", "Mojito", "Aperol Spritz", "Margarita", "Piña Colada", "Long Island Iced Tea", "Daiquiri", "Strawberry Daiquiri",
    "Sex on the Beach", "Cosmopolitan", "Old Fashioned", "Negroni", "Hugo Spritz", "Spicy Margarita", "Tommy's Margarita", "Paloma", "Moscow Mule", "Whiskey Sour", "Amaretto Sour",
    "French Martini", "Woo Woo", "Mai Tai", "Bloody Mary", "Passion Fruit Mojito", "Salted Caramel Espresso Martini", "Dirty Martini", "Tequila Sunrise"]],
  ["Shots and bombs", ["Tequila, Salt & Lime", "Baby Guinness", "Jägerbomb", "Pornstar Shot", "Mini Espresso Martini", "B-52", "Sour Apple", "Cherry Bakewell", "Skittle Bomb", "Kamikaze", "Pickleback"]],
  ["No alcohol", ["Virgin Mojito", "No-Star Martini", "Virgin Colada", "Espresso No-tini", "Virgin Margarita", "Virgin Cosmo", "Shirley Temple", "Strawberry Lemonade", "Virgin Hugo", "Lime & Soda"]],
  ["Serves", ["Gin & Tonic", "Vodka Red Bull", "Rum & Coke", "Jack & Coke", "Vodka Lemonade", "Vodka Cranberry", "Jameson, Ginger & Lime", "Malibu & Pineapple", "Pink Gin & Lemonade", "Archers & Lemonade"]],
];
const RAPID = { ids: [], q: "", specs: store.get("rapid.specs", false), rushEdit: false, g: null, gAll: false, gUndo: null };
/* ---------- What do they like? Picking a drink with a guest, face to face ----------
   At the bar or the table, tap what the guest says as they say it: what they like (tap again for "not that"), a spirit
   (or not that spirit), long, short, a shot or no alcohol, and anything they must avoid. The drinks that fit come up
   straight away, best first, each with the spec and why it fits, so it can be read out, rung in or made there and then.
   It only ranks drinks already in the book: it never makes up a spec. Allergens come from the specs, so the venue's
   allergen matrix is still the final word. Nothing is saved: Start again clears it for the next guest. */
const RG_SPIRITS = [["Vodka", BASES[0][1]], ["Gin", BASES[1][1]], ["Rum", BASES[2][1]], ["Tequila", BASES[3][1]], ["Whisky", BASES[4][1]],
  ["Brandy", /cognac|brandy|hennessy|martell|courvoisier|r[ée]my|calvados|pisco/i]];
const RG_STYLES = [["Long", "long"], ["Short", "short"], ["Shot", "shot"], ["No alcohol", "zero"]];
const RG_AVOID = [["Milk", /milk/i], ["Nuts", /nut|almond|hazelnut|peanut/i], ["Gluten", /gluten/i], ["Egg", /egg/i], ["Sulphites", /sulphite/i]];
const rgNew = () => ({ like: new Set(), not: new Set(), sp: new Set(), spNot: new Set(), style: "", avoid: new Set() });
const rgEmpty = (g) => !g.like.size && !g.not.size && !g.sp.size && !g.spNot.size && !g.style && !g.avoid.size;
const rgCopy = (g) => ({ like: new Set(g.like), not: new Set(g.not), sp: new Set(g.sp), spNot: new Set(g.spNot), style: g.style, avoid: new Set(g.avoid) });
const rgFlav = (d, k) => d.tags.some((t) => FLAVOURS[k].includes(t));
const rgSpirit = (d, k) => RG_SPIRITS.find(([n]) => n === k)[1].test(d.spec.join(" "));
const rgZero = (d) => d.section === "Zero Proof" || d.tags.includes("No alcohol");
const rgStyle = (d) => (rgZero(d) ? "zero" : d._k === "shot" ? "shot" : /highball|spritz|wine|half|pint|collins|copa/i.test(d.glass) ? "long" : "short");
// Best first: the most of what they like, then the house cards, then what guests order most.
function rgMatches(g, words) {
  const ask = new Set(RAPID_GROUPS[1][1]), out = [];
  let off = 0;
  for (const d of D) {
    if (!plHits(d, words)) continue;
    if (g.style && rgStyle(d) !== g.style) continue;
    if (g.style !== "zero" && (g.sp.size && ![...g.sp].some((k) => rgSpirit(d, k)) || [...g.spNot].some((k) => rgSpirit(d, k)))) continue;
    if ([...g.not].some((k) => rgFlav(d, k)) || [...g.avoid].some((k) => RG_AVOID.find(([n]) => n === k)[1].test(d.allergens || ""))) continue;
    const hit = [...g.like].filter((k) => rgFlav(d, k));
    if (g.like.size && !hit.length) continue;
    if (isOut(d.name)) { off++; continue; }
    out.push({ d, hit, score: hit.length * 10 + (d.section === "Black Tap Signatures" ? 3 : 0) + (ask.has(d.name) ? 2 : 0) + (d.official ? 1 : 0) });
  }
  out.sort((a, b) => b.score - a.score || a.d.name.localeCompare(b.d.name));
  return { out, off };
}
// A chip that goes off, then ✓ likes it, then ✕ not that. Its words say which, never colour alone.
function rgTri(k, on, no, attr) {
  const st = on.has(k) ? "y" : no.has(k) ? "n" : "";
  return `<button class="chip gk-c${st ? ` gk-${st}` : ""}" ${attr}="${esc(k)}" aria-pressed="${!!st}" aria-label="${esc(k)}: ${st === "y" ? "likes it" : st === "n" ? "not this" : "off"}">${st === "y" ? "✓ " : st === "n" ? "✕ No " : ""}${esc(k)}</button>`;
}
function rgPanelHtml(g) {
  const one = (k, on, attr, v = k) => `<button class="chip gk-c${on ? " gk-y" : ""}" ${attr}="${esc(v)}" aria-pressed="${on}">${on ? "✓ " : ""}${esc(k)}</button>`;
  return `<div class="gk" id="gk"><div class="gk-h"><b>What do they like?</b>${rgEmpty(g) && RAPID.gUndo ? `<button class="chip" data-rg-undo>↩ Undo</button>` : `<button class="chip" data-rg-clear${rgEmpty(g) ? " disabled" : ""}>↺ Start again</button>`}</div>
    ${rgEmpty(g) ? `<p class="s">Tap what the guest says. Tap again for “not that”.</p>` : ""}
    <div class="mini">Taste</div><div class="chips">${Object.keys(FLAVOURS).map((k) => rgTri(k, g.like, g.not, "data-rg-f")).join("")}</div>
    <div class="mini">Spirit</div><div class="chips">${RG_SPIRITS.map(([k]) => rgTri(k, g.sp, g.spNot, "data-rg-s")).join("")}</div>
    <div class="mini">How</div><div class="chips">${RG_STYLES.map(([k, v]) => one(k, g.style === v, "data-rg-st", v)).join("")}</div>
    <div class="mini">Can't have</div><div class="chips">${RG_AVOID.map(([k]) => one(k, g.avoid.has(k), "data-rg-a")).join("")}</div></div>`;
}
function rgRow(m) {
  const d = m.d, why = [...m.hit, ...[...RAPID.g.sp].filter((k) => rgSpirit(d, k))];
  return `<button class="rp-row gk-row" data-rp="${d.id}"><span class="g" aria-hidden="true">${glass(d)}</span><span><span class="n" translate="no">${esc(d.name)}${plOutTag(d)}</span>${why.length ? `<span class="gk-why">✓ ${esc(why.join(" · "))}</span>` : ""}<span class="s" translate="no">${esc(rapidSpec(d))}</span><span class="m" translate="no">${esc(d.glass)} · ${esc(d.ice)} · ${esc(d.garnish)}</span>${d.allergens && d.allergens !== "None" ? `<span class="m gk-al" translate="no">Allergens: ${esc(d.allergens)}</span>` : ""}</span></button>`;
}
function renderRg(words) {
  const g = RAPID.g, { out, off } = rgMatches(g, words), n = RAPID.gAll ? out.length : 12;
  RAPID.ids = out.map((m) => m.d.id);
  $("#rp-out").innerHTML = rgPanelHtml(g)
    + `<div class="sec" aria-live="polite">${rgEmpty(g) && !words.length ? "Most asked for first" : out.length ? `${plural(out.length, "drink")} fit${out.length === 1 ? "s" : ""}` : "Nothing fits all of that"}<span class="cnt">${out.length}</span></div>`
    + (out.length ? `<div class="rp-list">${out.slice(0, n).map(rgRow).join("")}</div>${out.length > n ? `<button class="btn wide" data-rg-all>Show all ${out.length}</button>` : ""}`
      : `<p class="empty">Take one away (the last ✓ or ✕) and it'll find the closest.</p>`)
    + (off ? `<p class="note">${plural(off, "more drink")} would fit but ${off === 1 ? "is" : "are"} 86'd tonight.</p>` : "")
    + (g.avoid.size ? `<p class="note warnline">Allergens are from our specs only. Check the venue's allergen matrix before it goes out.</p>` : "");
}
$("#v-rapid").addEventListener("click", (e) => {
  const b = e.target.closest("[data-rg-f],[data-rg-s],[data-rg-st],[data-rg-a],[data-rg-clear],[data-rg-undo],[data-rg-all],#rp-guest"); if (!b) return;
  haptic();
  if (b.id === "rp-guest") { RAPID.g = RAPID.g ? null : rgNew(); RAPID.gAll = false; RAPID.gUndo = null; renderRapid(); return scrollTo(0, 0); }
  const g = RAPID.g; if (!g) return;
  const tri = (k, on, no) => (on.has(k) ? (on.delete(k), no.add(k)) : no.has(k) ? no.delete(k) : on.add(k));
  if (b.dataset.rgF) tri(b.dataset.rgF, g.like, g.not);
  if (b.dataset.rgS) tri(b.dataset.rgS, g.sp, g.spNot);
  if (b.dataset.rgSt) g.style = g.style === b.dataset.rgSt ? "" : b.dataset.rgSt;
  if (b.dataset.rgA) g.avoid.has(b.dataset.rgA) ? g.avoid.delete(b.dataset.rgA) : g.avoid.add(b.dataset.rgA);
  if ("rgAll" in b.dataset) RAPID.gAll = true;
  if ("rgClear" in b.dataset) { RAPID.gUndo = rgCopy(g); RAPID.g = rgNew(); RAPID.gAll = false; RAPID.q = ""; $("#rp-q").value = ""; }
  else if ("rgUndo" in b.dataset) { RAPID.g = RAPID.gUndo; RAPID.gUndo = null; }
  else RAPID.gUndo = null;
  renderRapid();
});
const rapidList = (f) => (typeof f === "function" ? D.filter(f) : f.map((n) => D.find((d) => d.name === n)).filter(Boolean));
const rapidSpec = (d) => d.spec.map((s) => s.replace(/^Top about /i, "Top ~")).join(" · ");
function rapidTile(d) {
  const out = isOut(d.name);
  return RAPID.specs
    ? `<button class="rp-row${out ? " out" : ""}" data-rp="${d.id}"><span class="g" aria-hidden="true">${glass(d)}</span><span><span class="n" translate="no">${esc(d.name)}${out ? ` <i>86'd</i>` : ""}${out ? "" : plOutTag(d)}</span><span class="s" translate="no">${esc(rapidSpec(d))}</span><span class="m" translate="no">${esc(d.glass)} · ${esc(d.ice)} · ${esc(d.garnish)}</span></span></button>`
    : `<button class="rp-tile${out ? " out" : ""}" data-rp="${d.id}"><span class="g" aria-hidden="true">${glass(d)}</span><span class="n" translate="no">${esc(d.name)}</span>${out ? `<i>86'd</i>` : plOutTag(d)}</button>`;
}
// The top 10 come first as big cards with the spec on them; the rest of the house list follows as tiles.
// Searching drops the ten and reaches the whole book.
function renderRapid() {
  $("#rp-specs").setAttribute("aria-pressed", RAPID.specs);
  if (RAPID.rushEdit) { $("#rp-out").innerHTML = rushPickHtml(); return; }
  // The same search as the menu: typos, "redbull" or "g&t" find what they mean.
  const words = RAPID.q.trim() ? plQuery(RAPID.q.trim()).words : [];
  $("#rp-guest").setAttribute("aria-pressed", !!RAPID.g);
  if (RAPID.g) { renderRg(words); return jumpSync(); }
  const hit = (d) => plHits(d, words);
  // Our signatures first, then the Top 10 (without the signatures already above), then the rest.
  const sigs = rapidList(RAPID_GROUPS[0][1]).filter(hit), seen = new Set(sigs.map((d) => d.id));
  const top = words.length ? [] : rushNames().map((n) => D.find((d) => d.name === n)).filter((d) => d && !seen.has(d.id));
  top.forEach((d) => seen.add(d.id));
  const groups = [];
  for (const [t, f] of RAPID_GROUPS.slice(1)) {
    const ds = rapidList(f).filter((d) => !seen.has(d.id) && hit(d)); ds.forEach((d) => seen.add(d.id));
    if (ds.length) groups.push([t, ds]);
  }
  // Searching reaches the whole book, after the house list.
  if (words.length) { const more = D.filter((d) => !seen.has(d.id) && hit(d)).slice(0, 40); if (more.length) groups.push(["Everything else", more]); }
  RAPID.ids = [...sigs, ...top, ...groups.flatMap(([, ds]) => ds)].map((d) => d.id);
  // Each part gets a heading that sticks while you scroll it; the grid at the top jumps to any part, every one on show.
  const parts = [...(sigs.length ? [["Black Tap signatures", `<div class="${RAPID.specs ? "rp-list" : "rp-grid"}">${sigs.map(rapidTile).join("")}</div>`, sigs.length]] : []),
    ...(top.length ? [["Top 10", rushHtml(top), `<button class="linkbtn" data-rush="edit">Change</button>`]] : []),
    ...groups.map(([t, ds]) => [t, `<div class="${RAPID.specs ? "rp-list" : "rp-grid"}">${ds.map(rapidTile).join("")}</div>`, ds.length])];
  $("#rp-out").innerHTML = parts.length ? (parts.length > 1 ? `<nav class="djump rpjump" aria-label="Jump to a part">${parts.map(([t, , cnt], i) => `<button data-jump="rp-${i}">${esc(t)}${typeof cnt === "number" ? ` <span class="cn">${cnt}</span>` : ""}</button>`).join("")}</nav>` : "")
    + parts.map(([t, html, cnt], i) => `<i class="anc" id="rp-${i}"></i><div class="sec">${esc(t)}<span class="cnt">${cnt}</span></div>${html}`).join("")
    : `<p class="empty">Nothing matches. Try a spirit, like “rum”.</p>`;
  jumpSync();
}
function showRapid() {
  if (!$("#rp-out")) {
    $("#v-rapid").innerHTML = `<h2 style="font-size:28px;margin-top:12px">Rapid fire</h2>
      <div class="search"><input id="rp-q" type="search" placeholder="Type a drink or a spirit" autocomplete="off" enterkeyhint="search" aria-label="Search the house drinks"></div>
      <div class="chips hrow"><button class="chip" id="rp-guest" aria-pressed="false">🗣 What do they like?</button><button class="chip" id="rp-specs" aria-pressed="false">Show specs on the page</button><button class="chip" data-rp-lineup="1">Beer, cider and softs</button></div>
      <div id="rp-out"></div>
      <div class="actions">${sendBtn("specs", "Send the house cocktails", D.filter((d) => d.section === "Black Tap Signatures").map((d) => d.id).join(","))}</div>`;
  }
  // The screen stays on while Rapid fire is open, so it doesn't lock mid-rush.
  renderRapid(); keepAwake();
}
$("#v-rapid").addEventListener("change", (e) => {
  const c = e.target.closest("[data-rush-pick]"); if (!c) return;
  const on = rushNames().filter((n) => n !== c.dataset.rushPick); if (c.checked) on.push(c.dataset.rushPick);
  store.set("rush", on.slice(0, 10)); renderRapid();
});
$("#v-rapid").addEventListener("input", (e) => { if (e.target.id === "rp-q") { RAPID.q = e.target.value; renderRapid(); } });
$("#v-rapid").addEventListener("click", (e) => {
  const t = e.target.closest("[data-rp]"); if (t) { haptic(); return openSheet(+t.dataset.rp); }
  const ru = e.target.closest("[data-rush]");
  if (ru) { const a = ru.dataset.rush; if (a === "edit") RAPID.rushEdit = true; if (a === "done") RAPID.rushEdit = false; if (a === "reset") { store.set("rush", RUSH_DEFAULT); RAPID.rushEdit = false; } return renderRapid(); }
  if (e.target.closest("#rp-specs")) { RAPID.specs = !RAPID.specs; store.set("rapid.specs", RAPID.specs); return renderRapid(); }
  // The line-up's serve cards live in Make; the subnav's own handler opens the tab, this picks the pane.
  if (e.target.closest("[data-rp-lineup]")) { mk.pane = "bt"; mk.bt.view = "Draught"; mkSave(); show("make"); }
});
document.head.insertAdjacentHTML("beforeend", `<style>
.rp-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:6px 0 4px}
.rp-tile{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-height:104px;padding:10px 6px;border:1px solid var(--line);border-radius:14px;background:var(--surface);text-align:center;color:var(--fg)}
.rp-tile .g{width:34px;height:40px}.rp-tile .g svg{width:100%;height:100%}
.rp-tile .n{font-weight:700;font-size:17px;line-height:1.2}
.rp-tile i,.rp-row i{font-style:normal;font-size:12px;color:var(--warn)}
.rp-tile.out,.rp-row.out{opacity:.6}
.rp-tile:active{border-color:var(--brass)}
.rp-row{display:grid;grid-template-columns:36px 1fr;gap:10px;width:100%;text-align:left;padding:10px 0;border-bottom:1px solid var(--line);color:var(--fg)}
.rp-row .g{width:36px;height:42px}.rp-row .g svg{width:100%;height:100%}
.rp-row .n{display:block;font-weight:700;font-size:17px}
.rp-row .s{display:block;font-size:16px;margin-top:2px}
.rp-row .m{display:block;font-size:13.5px;color:var(--muted);margin-top:2px}
.gk{margin:8px 0 4px;padding:10px 12px 8px;border:1px solid var(--brass);border-radius:14px;background:var(--surface)}
.gk-h{display:flex;align-items:center;justify-content:space-between;gap:8px}.gk-h b{font-size:18px}.gk .s{margin:2px 0 0;color:var(--muted);font-size:14px}
.gk .mini{margin-top:8px}
.gk .chips{gap:6px;padding-block:4px 2px}
.gk .chips .chip{white-space:nowrap;color:var(--fg);min-height:44px;padding:6px 12px;font-size:16px}
.gk .chip.gk-y{background:var(--brass);border-color:var(--brass);color:var(--brass-ink);font-weight:700}
.gk .chip.gk-n{background:none;box-shadow:none;border-color:var(--warn);color:var(--warn);font-weight:700}
.gk-why{display:block;font-size:14px;color:var(--brass);font-weight:700;margin-top:2px}
</style>`);
