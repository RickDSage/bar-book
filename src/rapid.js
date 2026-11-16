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
const RAPID = { ids: [], q: "", specs: store.get("rapid.specs", false), rushEdit: false };
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
  // Each part gets a heading that sticks while you scroll it, and the bar at the top jumps to any part.
  const parts = [...(sigs.length ? [["Black Tap signatures", `<div class="${RAPID.specs ? "rp-list" : "rp-grid"}">${sigs.map(rapidTile).join("")}</div>`, sigs.length]] : []),
    ...(top.length ? [["Top 10", rushHtml(top), `<button class="linkbtn" data-rush="edit">Change</button>`]] : []),
    ...groups.map(([t, ds]) => [t, `<div class="${RAPID.specs ? "rp-list" : "rp-grid"}">${ds.map(rapidTile).join("")}</div>`, ds.length])];
  $("#rp-out").innerHTML = parts.length ? (parts.length > 1 ? `<nav class="azbar secbar" aria-label="Jump to a part">${parts.map(([t], i) => `<button data-jump="rp-${i}">${esc(t)}</button>`).join("")}</nav>` : "")
    + parts.map(([t, html, cnt], i) => `<i class="anc" id="rp-${i}"></i><div class="sec">${esc(t)}<span class="cnt">${cnt}</span></div>${html}`).join("")
    : `<p class="empty">Nothing matches. Try a spirit, like “rum”.</p>`;
  $("#rp-out").classList.toggle("jb", parts.length > 1); jumpSync();
}
function showRapid() {
  if (!$("#rp-out")) {
    $("#v-rapid").innerHTML = `<h2 style="font-size:28px;margin-top:12px">Rapid fire</h2>
      <div class="search"><input id="rp-q" type="search" placeholder="Type a drink or a spirit" autocomplete="off" enterkeyhint="search" aria-label="Search the house drinks"></div>
      <div class="chips hrow"><button class="chip" id="rp-specs" aria-pressed="false">Show specs on the page</button><button class="chip" data-rp-lineup="1">Beer, cider and softs</button></div>
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
.wrapid{width:100%;margin-top:8px;min-height:52px;font-size:18px}
</style>`);
