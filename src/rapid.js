/* ---------- Rapid fire: the house drinks as big buttons, for answering a guest fast ----------
   One tap from opening the app (the start page's Rapid fire button, or the first chip under Drinks). The signatures,
   then what guests ask for most, shots, alcohol-free and serves. Tap a button for the full spec; swipe on from there
   through the same list. "Specs on" shows each spec right on the page, so most questions need no tap at all. */
const RAPID_GROUPS = [
  ["House cocktails", (d) => d.section === "Black Tap Signatures"],
  // The classics UK guests ask for most (CGA and trade top-seller lists), in the order the bar hears them.
  ["Guests ask for", ["Pornstar Martini", "Espresso Martini", "Mojito", "Aperol Spritz", "Margarita", "Piña Colada", "Long Island Iced Tea", "Daiquiri", "Strawberry Daiquiri",
    "Sex on the Beach", "Cosmopolitan", "Old Fashioned", "Negroni", "Hugo Spritz", "Spicy Margarita", "Tommy's Margarita", "Paloma", "Moscow Mule", "Whiskey Sour", "Amaretto Sour",
    "French Martini", "Woo Woo", "Mai Tai", "Bloody Mary", "Passion Fruit Mojito", "Salted Caramel Espresso Martini", "Dirty Martini", "Tequila Sunrise"]],
  ["Shots and bombs", ["Tequila, Salt & Lime", "Baby Guinness", "Jägerbomb", "Pornstar Shot", "Mini Espresso Martini", "B-52", "Sour Apple", "Cherry Bakewell", "Skittle Bomb", "Kamikaze", "Pickleback"]],
  ["No alcohol", ["Virgin Mojito", "No-Star Martini", "Virgin Colada", "Espresso No-tini", "Virgin Margarita", "Virgin Cosmo", "Shirley Temple", "Strawberry Lemonade", "Virgin Hugo", "Lime & Soda"]],
  ["Serves", ["Gin & Tonic", "Vodka Red Bull", "Rum & Coke", "Jack & Coke", "Vodka Lemonade", "Vodka Cranberry", "Jameson, Ginger & Lime", "Malibu & Pineapple", "Pink Gin & Lemonade", "Archers & Lemonade"]],
];
const RAPID = { ids: [], q: "", specs: store.get("rapid.specs", false), rush: store.get("rapid.rush", false), rushEdit: false };
const rapidList = (f) => (typeof f === "function" ? D.filter(f) : f.map((n) => D.find((d) => d.name === n)).filter(Boolean));
const rapidSpec = (d) => d.spec.map((s) => s.replace(/^Top about /i, "Top ~")).join(" · ");
function rapidTile(d) {
  const out = isOut(d.name);
  return RAPID.specs
    ? `<button class="rp-row${out ? " out" : ""}" data-rp="${d.id}"><span class="g" aria-hidden="true">${glass(d)}</span><span><span class="n" translate="no">${esc(d.name)}${out ? ` <i>86'd</i>` : ""}</span><span class="s" translate="no">${esc(rapidSpec(d))}</span><span class="m" translate="no">${esc(d.glass)} · ${esc(d.ice)} · ${esc(d.garnish)}</span></span></button>`
    : `<button class="rp-tile${out ? " out" : ""}" data-rp="${d.id}"><span class="g" aria-hidden="true">${glass(d)}</span><span class="n" translate="no">${esc(d.name)}</span>${out ? `<i>86'd</i>` : ""}</button>`;
}
function renderRapid() {
  $("#rp-rush").setAttribute("aria-pressed", RAPID.rush); $("#rp-specs").hidden = RAPID.rush; $("#rp-q").hidden = RAPID.rush;
  if (RAPID.rush) { $("#rp-out").innerHTML = rushHtml(); keepAwake(); return; }
  const words = mkNorm(RAPID.q).split(" ").filter(Boolean);
  const hit = (d) => words.every((w) => d._h.includes(w));
  const seen = new Set(), groups = [];
  for (const [t, f] of RAPID_GROUPS) {
    const ds = rapidList(f).filter((d) => !seen.has(d.id) && hit(d)); ds.forEach((d) => seen.add(d.id));
    if (ds.length) groups.push([t, ds]);
  }
  // Searching reaches the whole book, after the house list.
  if (words.length) { const more = D.filter((d) => !seen.has(d.id) && hit(d)).slice(0, 40); if (more.length) groups.push(["Everything else", more]); }
  RAPID.ids = groups.flatMap(([, ds]) => ds.map((d) => d.id));
  $("#rp-out").innerHTML = groups.map(([t, ds]) => `<div class="sec">${esc(t)}<span class="cnt">${ds.length}</span></div><div class="${RAPID.specs ? "rp-list" : "rp-grid"}">${ds.map(rapidTile).join("")}</div>`).join("")
    || `<p class="empty">Nothing matches. Try a spirit, like “rum”.</p>`;
  $("#rp-specs").setAttribute("aria-pressed", RAPID.specs);
}
function showRapid() {
  if (!$("#rp-out")) {
    $("#v-rapid").innerHTML = `<h2 style="font-size:28px;margin-top:12px">Rapid fire</h2>
      <div class="search"><input id="rp-q" type="search" placeholder="Type a drink or a spirit" autocomplete="off" enterkeyhint="search" aria-label="Search the house drinks"></div>
      <div class="chips hrow"><button class="chip" id="rp-rush" aria-pressed="false">🔥 Rush: top 10</button><button class="chip" id="rp-specs" aria-pressed="false">Show specs on the page</button><button class="chip" data-rp-lineup="1">Beer, cider and softs</button></div>
      <div id="rp-out"></div>
      <div class="actions">${sendBtn("specs", "Send the house cocktails", D.filter((d) => d.section === "Black Tap Signatures").map((d) => d.id).join(","))}</div>`;
  }
  renderRapid();
}
$("#v-rapid").addEventListener("change", (e) => {
  const c = e.target.closest("[data-rush-pick]"); if (!c) return;
  const on = rushNames().filter((n) => n !== c.dataset.rushPick); if (c.checked) on.push(c.dataset.rushPick);
  store.set("rush", on.slice(0, 10)); renderRapid();
});
$("#v-rapid").addEventListener("input", (e) => { if (e.target.id === "rp-q") { RAPID.q = e.target.value; renderRapid(); } });
$("#v-rapid").addEventListener("click", (e) => {
  const t = e.target.closest("[data-rp]"); if (t) { haptic(); return openSheet(+t.dataset.rp); }
  if (e.target.closest("#rp-rush")) { RAPID.rush = !RAPID.rush; RAPID.rushEdit = false; store.set("rapid.rush", RAPID.rush); haptic(); if (!RAPID.rush) { lock?.release?.().catch(() => {}); lock = null; } return renderRapid(); }
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
.rp-tile .n{font-weight:700;font-size:16px;line-height:1.2}
.rp-tile i,.rp-row i{font-style:normal;font-size:12px;color:var(--warn)}
.rp-tile.out,.rp-row.out{opacity:.6}
.rp-tile:active{border-color:var(--brass)}
.rp-row{display:grid;grid-template-columns:36px 1fr;gap:10px;width:100%;text-align:left;padding:10px 0;border-bottom:1px solid var(--line);color:var(--fg)}
.rp-row .g{width:36px;height:42px}.rp-row .g svg{width:100%;height:100%}
.rp-row .n{display:block;font-weight:700;font-size:17px}
.rp-row .s{display:block;font-size:15px;margin-top:2px}
.rp-row .m{display:block;font-size:13.5px;color:var(--muted);margin-top:2px}
.wrapid{width:100%;margin-top:8px;min-height:52px;font-size:18px}
</style>`);
