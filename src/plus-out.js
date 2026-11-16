
/* ---------- Out of something: one 86 board, every drink adjusts ----------
   An ingredient on the 86 board (Shift, or "We're out" on any drink) flows through the whole app: the drink shows the
   swap on its spec line and a banner, the menu, Rapid fire and Rush mark it, Make and My bar stop counting on it,
   Spin and Spec of the day skip drinks with no swap, and picture cards and WhatsApp specs carry the swap.
   On the team it's the shared 86 board, so it's set once for everyone. Off the team it's kept on this phone. */
const OUT_LOCAL = new Set(store.get("outIng", []));
// 86 board names that stand for a spec ingredient by another name. (Limes and lime juice stay apart: the board lists both.)
const OUT_ALSO = { "Espresso beans": ["Fresh espresso"], "Prosecco bottle": ["Prosecco"] };
const OUT_DRINKS = new Set(D.map((d) => d.name));
let OUT_SIG = "", OUT_KEYS = new Set();
// The ingredient keys that are out right now.
function plOutKeys() {
  const names = [...(LIVE.me ? LIVE.out : []), ...OUT_LOCAL].filter((n) => !OUT_DRINKS.has(n));
  const sig = names.sort().join("|");
  if (sig === OUT_SIG) return OUT_KEYS;
  const ks = new Set();
  for (const n of names) {
    const it = MK.byKey.get(mkNorm(n)) || mkFind(n); if (it) ks.add(it.k);
    for (const x of OUT_ALSO[n] || []) { const j = MK.byKey.get(mkNorm(x)) || mkFind(x); if (j) ks.add(j.k); }
  }
  OUT_SIG = sig; OUT_KEYS = ks; PL_OUTD.clear();
  return ks;
}
// The name to put on the 86 board for an ingredient: the stock list's own name when it has one, so it matches.
const STOCK_FLAT = Object.values(STOCK).flat();
const plOutName = (it) => STOCK_FLAT.find((s) => (MK.byKey.get(mkNorm(s)) || mkFind(s)) === it) || it.n;
// The swap for one missing ingredient: the drink's own "Out of something?" line, else another bottle of the same kind
// from the line-up, else one from the same family (a change of flavour), else nothing close.
const plStocked = new Set(typeof BT_KEYS !== "undefined" ? BT_KEYS : []);
const plBoozy = (x) => (PL_ITEM[x.n] ?? (PL_KIND[x.kind] || [0])[0]) > 0;
function plSwapFor(d, it) {
  const out = plOutKeys(), words = [it.n, ...it.al].map((a) => a.toLowerCase()).filter((a) => a.length > 2);
  // The drink's own line wins, even when it says there's no swap: those were written by hand.
  const own = (d.subs || []).find((s) => { const no = ((s.match(/^([^?]+)\?/) || [])[1] || "").toLowerCase().replace(/^no /, ""); return no && words.some((w) => no.includes(w) || w.includes(no)); });
  if (own && /no close swap|no real swap/i.test(own)) return "";
  const ownSwap = own && own.replace(/^[^?]+\?\s*/, ""), low = (ownSwap || "").toLowerCase();
  // Unless every bottle the swap names is out tonight too ("Monin Passion Fruit", not the "Passion fruit" inside it).
  const named = MK.items.filter((x) => low.includes(x.n.toLowerCase())), names = named.map((x) => x.n.toLowerCase());
  const real = named.filter((x) => !names.some((m) => m !== x.n.toLowerCase() && m.includes(x.n.toLowerCase())));
  if (own && !(real.length && real.every((x) => out.has(x.k)))) return ownSwap;
  // Else a stocked bottle that isn't already in the drink and is boozy only if the missing one was.
  const inDrink = new Set((MK.reqs.get(d.id) || []).map((r) => r.it.k));
  const alt = (f) => MK.items.find((x) => x !== it && !out.has(x.k) && !inDrink.has(x.k) && plStocked.has(x.k) && plBoozy(x) === plBoozy(it) && f(x));
  const same = alt((x) => x.kind === it.kind);
  if (same) return `Use ${same.n} (same kind).`;
  const fam = it.fam && alt((x) => x.fam === it.fam);
  return fam ? `Use ${fam.n} (a little different: tell the guest).` : "";
}
const PL_OUTD = new Map();
// What a drink is missing tonight: [{ line index, item, swap }]. ok is false when something has no swap at all.
function plOutOf(d) {
  const out = plOutKeys(); if (!out.size) return { miss: [], ok: true };
  if (PL_OUTD.has(d.id)) return PL_OUTD.get(d.id);
  const miss = [];
  for (const r of MK.reqs.get(d.id) || []) if (out.has(r.it.k) && !miss.some((m) => m.it === r.it)) miss.push({ i: d.spec.indexOf(r.line), it: r.it, swap: plSwapFor(d, r.it), minor: r.w < 1 });
  const res = { miss, ok: miss.every((m) => m.swap || m.minor) };
  PL_OUTD.set(d.id, res);
  return res;
}
const plOutTag = (d) => { const o = plOutOf(d); return o.miss.length ? ` <span class="pl-swaptag${o.ok ? "" : " no"}">${o.ok ? "Swap" : "Can't make"}: no ${esc(o.miss.map((m) => m.it.n).join(", "))}</span>` : ""; };
// Drinks to offer instead when one can't be made: same spirit, same kind of drink, most flavours in common, all makeable.
function plAlts(d, n = 3) {
  const tags = new Set(d.tags);
  return D.filter((x) => x !== d && x._k === d._k && x._b === d._b && !isOut(x.name) && plOutOf(x).ok)
    .map((x) => [x, x.tags.filter((t) => tags.has(t)).length + (x.section === d.section ? 1 : 0) + (x.official ? 0.5 : 0)])
    .sort((a, b) => b[1] - a[1]).slice(0, n).map((x) => x[0]);
}
function plOutBanner(d) {
  const o = plOutOf(d); if (!o.miss.length) return "";
  const alts = o.ok ? [] : plAlts(d);
  return `<div class="pl-outbar${o.ok ? "" : " no"}"><b>${o.ok ? "Out tonight, make it with a swap" : "Out tonight, no close swap"}</b>${o.miss.map((m) => `<div>No <span translate="no">${esc(m.it.n)}</span>: ${m.swap ? esc(m.swap) : "offer something close instead."}</div>`).join("")}
    ${alts.length ? `<div class="pl-alts">Offer instead: ${alts.map((x) => `<button class="chip" data-pl-alt="${x.id}" translate="no">${esc(x.name)}</button>`).join("")}</div>` : ""}</div>`;
}
// Every ingredient of the drink with its own We're out / Back in button, and the swap.
function plOutHtml(d) {
  const out = plOutKeys(), its = [...new Map((MK.reqs.get(d.id) || []).map((r) => [r.it.k, r.it])).values()];
  if (!its.length) return "";
  const any = its.some((it) => out.has(it.k));
  return `<details class="subs pl-outs"${any ? " open" : ""}><summary>Out of something?<span class="cnt">${its.filter((it) => out.has(it.k)).length || its.length}</span></summary>
    <p class="note" style="margin-top:4px">Tap what's run out. ${LIVE.me ? "It goes on the 86 board for the whole team" : "It's kept on this phone"} and every drink that uses it shows the swap.</p>
    <ul class="pl-outlist">${its.map((it) => { const o = out.has(it.k), sw = plSwapFor(d, it); return `<li><span><b translate="no">${esc(it.n)}</b>${sw ? `<small translate="no">${o ? "" : "If out: "}${esc(sw)}</small>` : ""}</span><button class="chip${o ? " on" : ""}" data-pl-out="${esc(it.k)}" aria-pressed="${o}">${o ? "Back in" : "We're out"}</button></li>`; }).join("")}</ul></details>`;
}
function plSetOut(it, on) {
  const name = plOutName(it);
  if (LIVE.me) { if (on !== outNow().has(name)) setOut(name, on); }
  else { on ? OUT_LOCAL.add(name) : OUT_LOCAL.delete(name); store.set("outIng", [...OUT_LOCAL]); }
  toast(on ? `${it.n} is out: drinks with it now show a swap` : `${it.n} back in`);
  plOutRefresh();
}
function plOutRefresh() {
  OUT_SIG = "~"; plOutKeys();
  renderList();
  if (!$("#v-rapid").hidden && $("#rp-out")) renderRapid();
  if (!$("#v-make").hidden) mkRedraw();
  if (!$("#v-sheets").hidden) renderSheets();
  if (!$("#sheet").hidden && $("#sw")) { const y = $("#sheet").scrollTop; openSheet(curId, true); $("#sheet").scrollTop = y; }
}
// The spec lines that are out get struck through with the swap under them.
function plOutMark(d) {
  for (const m of plOutOf(d).miss) {
    const li = $$("#sheet ul.spec > li")[m.i]; if (!li) continue;
    li.classList.add("pl-out");
    if (m.swap) li.insertAdjacentHTML("beforeend", `<em class="pl-swap" translate="no">→ ${esc(m.swap)}</em>`);
  }
}
document.addEventListener("click", (e) => {
  const a = e.target.closest("[data-pl-alt]"); if (a) { haptic(); return openSheet(+a.dataset.plAlt); }
  const b = e.target.closest("[data-pl-out]"); if (!b) return;
  const it = MK.byKey.get(b.dataset.plOut); if (it) plSetOut(it, !plOutKeys().has(it.k));
});
// WhatsApp specs and picture cards say what's out and the swap.
const plOutLines = (d) => plOutOf(d).miss.map((m) => `⚠️ No ${m.it.n} tonight: ${m.swap || "no close swap"}`);
{
  const base = SHARE.drink;
  SHARE.drink = (id) => { const m = base(id); if (m) m.head = [...plOutLines(D[+id]), ...m.head]; return m; };
}
document.head.insertAdjacentHTML("beforeend", `<style>
.pl-swaptag{display:inline-block;font-size:12px;font-weight:700;color:var(--brass);border:1px solid var(--brass);border-radius:999px;padding:0 7px;margin-left:4px}
.pl-swaptag.no{color:var(--warn);border-color:var(--warn)}
.pl-outbar{border:1px solid var(--brass);background:var(--surface);border-radius:12px;padding:10px 12px;margin:10px 0}
.pl-outbar.no{border-color:var(--warn)}.pl-alts{margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;align-items:center}.pl-outbar b{display:block;color:var(--brass);margin-bottom:4px}.pl-outbar.no b{color:var(--warn)}
.pl-outlist{list-style:none;padding:0;margin:8px 0 0}.pl-outlist li{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 0;border-top:1px solid var(--line)}
.pl-outlist small{display:block;color:var(--muted);font-size:13px}.pl-outlist .chip.on{border-color:var(--warn);color:var(--warn)}
ul.spec li.pl-out > span{text-decoration:line-through;opacity:.55}
ul.spec li.pl-out{flex-wrap:wrap}.pl-swap{flex-basis:100%;font-style:normal;color:var(--brass);font-weight:700;font-size:15px}
</style>`);
