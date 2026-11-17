/* ---------- Pick an item: one picker for the whole app ----------
   The 86 board, the bar station, Log it, restocking, running low, date labels and the stock count all choose items the
   same way: type a few letters (typos are fine), tap a kind, or scroll. Recent and the team's most 86'd sit on top.
   It reads the one item list the app already has (the stock list plus what the team has added, the bar's own line-up
   and the drinks), and the 86 board is still the one source: an 86 here is the same 86 everywhere.
   Modes: "86" picks several and 86s or brings them back (or one tap on a row), "one" picks one and closes,
   "many" picks several and hands them back. */
const PK_CATS = [["all", "Everything"], ["spirits", "Spirits"], ["liqueurs", "Liqueurs"], ["mixers", "Mixers"], ["beer", "Beer and cider"], ["wine", "Wine"],
  ["juice", "Juice"], ["syrups", "Syrups and bitters"], ["garnish", "Fruit and garnish"], ["dairy", "Dairy"], ["shake", "Shake station"], ["cakes", "Cakes"],
  ["frozen", "Frozen"], ["supplies", "Supplies"], ["drinks", "Drinks"], ["other", "Other"]];
const PK_CAT = Object.fromEntries(PK_CATS);
// The stock list's groups, as the kinds people look under.
const PK_GROUP = { Vodka: "spirits", Gin: "spirits", "Rum and cachaça": "spirits", "Tequila and mezcal": "spirits", Whiskey: "spirits", Brandy: "spirits",
  "Liqueurs and vermouth": "liqueurs", "Soft drinks and mixers": "mixers", Water: "mixers", "Beer lines": "beer", "Bottled beer": "beer", Cider: "beer", Wine: "wine",
  Juices: "juice", "Syrups, bitters and prep": "syrups", "Fruit and garnish": "garnish", "Dairy and purées": "dairy", "Bar supplies": "supplies", "Floor supplies": "supplies" };
// The bar line-up's groups (Make tab), for its bottles that aren't on the stock list by name.
const PK_BT = { Spirits: "spirits", Liqueurs: "liqueurs", "Aperitifs, vermouth and wine": "liqueurs", "Bar basics": "syrups", "Fresh and garnish": "garnish", Foam: "syrups",
  Draught: "beer", "Bottles and cans": "mixers", "Juices, syrups and purées": "syrups", Postmix: "mixers" };
function pkCatOf(group, n) {
  if (group === "Desserts and shakes") return /ice cream(?! cone)|frozen|sorbet/i.test(n) ? "frozen" : /cake|sponge|brownie/i.test(n) ? "cakes" : "shake";
  if (PK_GROUP[group]) return PK_GROUP[group];
  if (/juice/i.test(n)) return "juice";
  if (/prosecco|champagne|\bwine\b/i.test(n)) return "wine";
  if (/\b(beer|lager|ipa|hells|cider|kopparberg|corona|stella|guinness|san miguel)\b/i.test(n) && !/ginger beer/i.test(n)) return "beer";
  if (/\b(sprite|fanta|lemonade|soda|cola|tonic|ginger)\b/i.test(n)) return "mixers";
  return PK_BT[group] || "other";
}
function pkWords(s) { return String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").filter(Boolean).map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w)); }
// The spec ingredient an item stands for. Cakes, frozen, shake station and supplies only by their exact name, so a
// Guinness cake 86'd never takes the Guinness drinks with it.
const PK_NOT_ING = new Set(["cakes", "frozen", "shake", "supplies", "drinks"]);
function pkMatch(n, c) { return MK.byKey.get(mkNorm(n)) || (PK_NOT_ING.has(c) ? null : mkFind(n)); }
function pkIt(n) { const x = pkPool().find((y) => y.n === n); return x ? x.it : pkMatch(n); }
// Every item once: [{ n, c (kind), g (group), w (name words), a (other words it answers to), d (drink id) }].
var PK_POOL = null, PK_SIG = "";
function pkPool() {
  const sig = (LIVE.items || []).map((x) => x.item + x.status + x.group).join("|");
  if (PK_POOL && sig === PK_SIG) return PK_POOL;
  const seen = new Set(), keys = new Set(), out = [];
  const add = (n, g, c, d) => {
    const low = n.toLowerCase(); if (seen.has(low)) return; seen.add(low);
    const it = d == null ? pkMatch(n, c) : null; if (it) keys.add(it.k);
    // What it answers to: its own other names, and its kind's ("triple sec" finds Cointreau, "vodka" finds Smirnoff).
    const gen = it && MK.byKey.get(mkNorm(it.kind)), al = it ? [...it.al, it.kind, ...(gen ? gen.al : [])] : [];
    out.push({ n, g, c, d, it, w: pkWords(n), a: [...new Set([...al.flatMap(pkWords), ...pkWords(g), ...pkWords(PK_CAT[c])])] });
  };
  for (const [g, xs] of Object.entries(stockGroups())) for (const n of xs) add(n, g, pkCatOf(g, n));
  // The bar's line-up has bottles the stock list doesn't name (Monin syrups, Funkin flavours): they matter for swaps.
  for (const x of BT) { const it = MK.byKey.get(x.k); if (it && !keys.has(it.k)) { keys.add(it.k); add(it.n, x.grp, pkCatOf(x.grp, it.n)); } }
  for (const d of D) add(d.name, d.section, "drinks", d.id);
  PK_POOL = out; PK_SIG = sig;
  return out;
}
// How well one typed word fits a list of words: whole word, start of a word, inside one, or a letter or two off.
function pkFit(q, ws) {
  let best = 0;
  for (const w of ws) {
    const s = w === q ? 4 : w.startsWith(q) ? 3 : q.length >= 3 && w.includes(q) ? 1.5
      : q.length >= 4 && (mkLev(q, w) <= (q.length >= 7 ? 2 : 1) || mkLev(q, w.slice(0, q.length)) <= 1) ? 1.2 : 0;
    if (s > best) best = s;
    if (best === 4) break;
  }
  return best;
}
// Best first. Every word typed has to fit somewhere: the name counts most, then what it's also called and its kind.
function pkSearch(q, pool = pkPool()) {
  const qs = pkWords(q); if (!qs.length) return pool;
  const whole = qs.join(" ");
  return pool.map((x) => {
    let s = 0;
    for (const w of qs) { const f = Math.max(pkFit(w, x.w), pkFit(w, x.a) * 0.6); if (!f) return null; s += f; }
    if (x.w.join(" ").startsWith(whole)) s += 2;
    return [x, s - x.w.length * 0.05 - (x.c === "drinks" ? 0.3 : 0)];
  }).filter(Boolean).sort((a, b) => b[1] - a[1] || a[0].n.localeCompare(b[0].n)).map(([x]) => x);
}
// The name the board knows for what was typed: an exact or near match, else it goes on as typed (a burger, a glass).
function pkName(typed) {
  const t = typed.trim().replace(/\s+/g, " "); if (!t) return "";
  const hit = pkSearch(t)[0];
  if (hit && (hit.n.toLowerCase() === t.toLowerCase() || itNorm(hit.n) === itNorm(t))) return hit.n;
  return itFix86(t);
}
// How many drinks use it, and the closest stocked swap when it's out. Drinks show their own swap on their card.
var PK_USES = null;
function pkUses(n) {
  const it = typeof n === "string" ? pkIt(n) : n.it; if (!it) return 0;
  PK_USES = PK_USES || new Map();
  if (!PK_USES.has(it.k)) PK_USES.set(it.k, D.filter((d) => (MK.reqs.get(d.id) || []).some((r) => r.it.k === it.k)).length);
  return PK_USES.get(it.k);
}
function pkSwap(n) {
  const it = pkIt(n); if (!it) return "";
  const out = plOutKeys(), ok = (x) => x !== it && plStocked.has(x.k) && !out.has(x.k) && plBoozy(x) === plBoozy(it);
  const same = MK.items.find((x) => ok(x) && x.kind === it.kind);
  if (same) return `Swap: ${same.n}`;
  const fam = it.fam && MK.items.find((x) => ok(x) && x.fam === it.fam);
  return fam ? `Swap: ${fam.n} (a little different, tell the guest)` : "";
}
// On top: what this phone picked lately, then what the team 86s most (the last 100 86s), then each side's usual.
function pkRecent() { return store.get("pk.recent", []); }
function pkRemember(ns) { store.set("pk.recent", [...new Set([...ns, ...pkRecent()])].slice(0, 8)); }
function pkTop(side = mode, n = 12) {
  const c = new Map();
  for (const x of LIVE.outlog || []) if (x.action === "out") c.set(x.itemName, (c.get(x.itemName) || 0) + 1);
  const most = [...c].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  return [...new Set([...pkRecent(), ...most, ...(QUICK86[side] || [])])].slice(0, n);
}
function pkByName(n) { return pkPool().find((x) => x.n === n) || { n, c: "other", g: "", w: pkWords(n), a: [] }; }

var PK = null;
document.body.insertAdjacentHTML("beforeend", `<div id="pick" class="help pk" hidden><div class="help-in pk-in" role="dialog" aria-modal="true" aria-labelledby="pk-t">
  <div class="help-h"><h3 id="pk-t"></h3><button class="hq-x" data-pk-x aria-label="Close">×</button></div>
  <div class="search pk-search"><input id="pk-q" type="search" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="done" aria-label="Search everything"></div>
  <div class="pk-scroll" id="pk-scroll"><div id="pk-top"></div><div class="pk-cats" id="pk-cats" role="group" aria-label="Kind"></div><div class="pk-list" id="pk-list"></div></div><div class="pk-foot" id="pk-foot"></div></div></div>`);
// opt: { mode, title, side, drinks (list drinks too), only (just these names), other (allow what's typed), onPick(names) }
function pkOpen(opt) {
  if (opt.mode === "86" && !LIVE.me) return toast("Join the team on the Team page to 86 something");
  PK = { mode: "one", side: mode, drinks: opt.mode === "86", other: opt.mode !== "one" || !opt.only, ...opt, q: "", cat: "all", sel: new Set(), from: document.activeElement };
  $("#pk-t").textContent = PK.title || (PK.mode === "86" ? "86 something" : "Pick from the list");
  const q = $("#pk-q"); q.value = "";
  q.placeholder = PK.mode === "86" ? "Type anything: lymes, tanq, oat milk…" : "Type a few letters, typos are fine";
  $("#pick").hidden = false; document.body.classList.add("pk-on");
  pkRender(); $("#pk-scroll").scrollTop = 0;
  q.focus();
}
function pkClose() {
  if (!PK) return;
  const from = PK.from, gone = PK.onClose; PK = null; gone?.(); $("#pick").hidden = true; document.body.classList.remove("pk-on");
  from?.focus?.();
}
const pkBase = () => { let xs = pkPool(); if (PK.only) { const o = new Set(PK.only); xs = xs.filter((x) => o.has(x.n)); } if (!PK.drinks) xs = xs.filter((x) => x.c !== "drinks"); return xs; };
function pkRender() { pkCats(); pkList(); pkFoot(); }
function pkCats() {
  const hits = pkSearch(PK.q, pkBase()), n = (c) => (c === "all" ? hits.length : hits.filter((x) => x.c === c).length);
  // While typing, only the kinds with something in them.
  $("#pk-cats").innerHTML = PK_CATS.filter(([c]) => c === "all" || c === PK.cat || n(c)).map(([c, t]) => `<button class="chip" data-pk-cat="${c}" aria-pressed="${c === PK.cat}">${t} <span class="cn">${n(c)}</span></button>`).join("");
}
function pkSub(x) {
  if (x.d != null) { const o = plOutOf(D[x.d]); return isOut(x.n) ? `86'd${outByText(x.n) ? ` by ${esc(outByText(x.n))}` : ""}` : o.miss.length ? `${o.ok ? "Swap" : "Can't make"}: no ${esc(o.miss.map((m) => m.it.n).join(", "))}` : `Drink · ${esc(x.g)}`; }
  const u = pkUses(x), uses = u ? ` · ${plural(u, "drink")} use it` : "";
  if (isOut(x.n) || (!LIVE.me && OUT_LOCAL.has(x.n))) { const sw = pkSwap(x.n); return `86'd${outByText(x.n) ? ` by ${esc(outByText(x.n))}` : ""}${uses}${sw ? `<br><b class="pk-sw">${esc(sw)}</b>` : ""}`; }
  return `${esc(PK_CAT[x.c])}${uses}`;
}
function pkRow(x) {
  const out = isOut(x.n), on = PK.sel.has(x.n), multi = PK.mode !== "one";
  return `<div class="pk-row${on ? " sel" : ""}${out && PK.mode === "86" ? " out" : ""}"><button class="pk-tap" data-pk-tog="${esc(x.n)}"${multi ? ` aria-pressed="${on}"` : ""}>${multi ? `<span class="pk-box" aria-hidden="true">${on ? "✓" : ""}</span>` : ""}<span class="pk-t"><b translate="no">${esc(x.n)}</b><small>${pkSub(x)}</small></span></button>${PK.mode === "86" ? `<button class="btn pk-one${out ? "" : " pri"}" data-pk-one="${esc(x.n)}">${out ? "Back in" : "86"}</button>` : ""}</div>`;
}
function pkList() {
  const base = pkBase(), hits = pkSearch(PK.q, base).filter((x) => PK.cat === "all" || x.c === PK.cat), q = PK.q.trim();
  let html = "", top = "";
  if (!q && PK.cat === "all") {
    // Nothing typed: what's 86'd now, then the usual ones, then everything by kind, to scroll.
    const have = new Set(base.map((x) => x.n));
    const now = PK.mode === "86" ? [...outNow()].sort() : [], usual = pkTop(PK.side, 6).filter((n) => have.has(n) && !now.includes(n));
    if (now.length) top += `<div class="mini pk-h">86'd now (${now.length})</div>${now.map((n) => pkRow(pkByName(n))).join("")}`;
    if (usual.length) top += `<div class="mini pk-h">${pkRecent().length ? "Recent and most 86'd" : "Most 86'd"}</div>${usual.map((n) => pkRow(pkByName(n))).join("")}`;
    if (top) top += `<div class="mini pk-h">Or pick a kind</div>`;
    for (const [c, t] of PK_CATS) { const xs = base.filter((x) => x.c === c); if (xs.length) html += `<div class="mini pk-h">${t}</div>${xs.map(pkRow).join("")}`; }
  } else {
    const shown = hits.slice(0, 80);
    html = shown.map(pkRow).join("") + (hits.length > 80 ? `<p class="note">${hits.length - 80} more: type a little more.</p>` : "");
    const exact = q && hits.some((x) => x.n.toLowerCase() === q.toLowerCase());
    if (q && PK.other && !exact) html += `<button class="pk-typed" data-pk-typed>${PK.mode === "86" ? "86" : "Use"} “${esc(q)}” as typed${hits.length ? "" : `<small>Nothing on the list is close. It goes on as you typed it.</small>`}</button>`;
    else if (!hits.length) html += `<p class="note">Nothing here matches “${esc(q)}”.</p>`;
  }
  $("#pk-top").innerHTML = top;
  $("#pk-list").innerHTML = html || `<p class="note">Nothing to pick here.</p>`;
}
function pkFoot() {
  const xs = [...PK.sel], out = xs.filter(isOut), inn = xs.filter((n) => !isOut(n));
  $("#pk-foot").innerHTML = !xs.length ? (PK.mode === "86" ? `<p class="s">Tap 86 on a row, or tick several and 86 them together.</p>` : PK.mode === "many" ? `<p class="s">Tick everything, then add them.</p>` : "")
    : PK.mode === "86" ? `<button class="btn" data-pk-none>Untick</button>${out.length ? `<button class="btn" data-pk-go="back">Back in (${out.length})</button>` : ""}${inn.length ? `<button class="btn pri" data-pk-go="out">86 ${inn.length === 1 ? esc(inn[0]) : `these ${inn.length}`}</button>` : ""}`
    : `<button class="btn" data-pk-none>Untick</button><button class="btn pri" data-pk-go="add">Add ${xs.length === 1 ? esc(xs[0]) : `these ${xs.length}`}</button>`;
  $("#pk-foot").hidden = !$("#pk-foot").innerHTML;
}
// 86 or bring back, on the one board. Each goes as its own write, so a lost signal only holds up that one.
function pk86(ns, on) {
  const xs = ns.filter((n) => isOut(n) !== on); if (!xs.length) return;
  track(Promise.all(xs.map((n) => LIVE.api.set86(n, on))), null, "Not all saved. Check your signal and try again");
  if (on) pkRemember(xs);
  haptic();
  const what = xs.length === 1 ? xs[0] : `${xs.length} items`;
  toast(on ? `${what} 86'd for everyone${xs.some((n) => pkUses(n)) ? ". Drinks that use it show the swap" : ""}` : `${what} back in stock`);
}
function pkDone(ns) { const cb = PK.onPick; PK.onClose = null; pkRemember(ns); pkClose(); cb?.(ns); }
$("#pk-q").addEventListener("input", (e) => { if (!PK) return; PK.q = e.target.value; pkCats(); pkList(); $("#pk-scroll").scrollTop = 0; });
$("#pk-q").addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || !PK) return;
  e.preventDefault();
  // Enter takes the best match, or what was typed.
  const q = PK.q.trim(), top = pkSearch(q, pkBase()).filter((x) => PK.cat === "all" || x.c === PK.cat)[0];
  if (!q) return e.target.blur();
  const n = top && (pkFit(pkWords(q)[0], top.w) >= 1.2) ? top.n : PK.other ? (PK.mode === "86" ? pkName(q) : q.slice(0, 80)) : "";
  if (!n) return;
  if (PK.mode === "86") { pk86([n], !isOut(n)); PK.q = ""; e.target.value = ""; pkRender(); }
  else if (PK.mode === "one") pkDone([n]);
  else { PK.sel.add(n); PK.q = ""; e.target.value = ""; pkRender(); }
});
// Scrolling the list puts the keyboard away, so the whole list shows. The kinds scroll with it, so the list starts high.
$("#pk-scroll").addEventListener("touchmove", () => { if (document.activeElement?.id === "pk-q") $("#pk-q").blur(); }, { passive: true });
$("#pick").addEventListener("click", (e) => {
  const t = e.target; if (!PK) return;
  if (t.id === "pick" || t.closest("[data-pk-x]")) return pkClose();
  const c = t.closest("[data-pk-cat]"); if (c) { haptic(); PK.cat = PK.cat === c.dataset.pkCat ? "all" : c.dataset.pkCat; pkCats(); pkList(); return; }
  const one = t.closest("[data-pk-one]"); if (one) { const n = one.dataset.pkOne; pk86([n], !isOut(n)); PK.sel.delete(n); return pkRender(); }
  const tg = t.closest("[data-pk-tog]"); if (tg) {
    const n = tg.dataset.pkTog; haptic();
    if (PK.mode === "one") return pkDone([n]);
    PK.sel.has(n) ? PK.sel.delete(n) : PK.sel.add(n); pkList(); pkFoot(); return;
  }
  if (t.closest("[data-pk-typed]")) {
    const q = PK.q.trim().replace(/\s+/g, " ").slice(0, 80);
    if (PK.mode === "86") { const n = pkName(q); if (isOut(n)) toast(`${n} is already 86'd`); else pk86([n], true); PK.q = ""; $("#pk-q").value = ""; return pkRender(); }
    if (PK.mode === "one") return pkDone([q]);
    PK.sel.add(q); PK.q = ""; $("#pk-q").value = ""; return pkRender();
  }
  if (t.closest("[data-pk-none]")) { PK.sel.clear(); return pkRender(); }
  const go = t.closest("[data-pk-go]"); if (go) {
    const xs = [...PK.sel];
    if (go.dataset.pkGo === "add") return pkDone(xs);
    pk86(xs.filter((n) => isOut(n) === (go.dataset.pkGo === "back")), go.dataset.pkGo === "out");
    PK.sel.clear(); return pkRender();
  }
});
$("#pick").addEventListener("keydown", (e) => { if (e.key === "Escape") pkClose(); });
// Someone else's 86 shows straight away, without losing what's typed or ticked.
function pkLive(what) { if (PK && ["out", "outlog", "items", "me"].includes(what)) { if (what === "items") PK_POOL = null; pkList(); pkFoot(); pkCats(); } }
// Opens the picker from any button: data-pk86 (86 mode), on every page and the bar station.
document.addEventListener("click", (e) => { const b = e.target.closest("[data-pk86]"); if (b) { haptic(); pkOpen({ mode: "86", side: b.dataset.pk86 || mode }); } });
// A button that looks like the search box, so it's plain where to tap.
function pkBtn(label, attr = "data-pk86") { return `<button class="pk-open" ${attr}><span aria-hidden="true">⌕</span>${label}</button>`; }
document.head.insertAdjacentHTML("beforeend", `<style>
.pk .pk-in{display:flex;flex-direction:column;height:92vh;max-height:92vh;overflow:hidden;padding-bottom:calc(env(safe-area-inset-bottom,0px) + 10px)}
@media (min-width:700px){.pk{align-items:center}.pk .pk-in{max-width:720px;height:86vh;border-radius:18px;border:2px solid var(--brass)}}
.pk-search{margin:6px 0 8px}.pk-search input{font-size:18px;padding:12px 14px}
.pk-cats{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 6px;flex:none}.pk-cats .chip{min-height:34px;padding:5px 11px;font-size:14px;color:var(--fg);margin:0}.pk-cats .chip[aria-pressed="true"]{color:var(--brass-ink)}
.pk-scroll{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;margin:0 -4px;padding:0 4px}
.pk-h{margin:14px 0 2px;color:var(--brass)}.pk-h:first-child{margin-top:4px}
.pk-row{display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--line)}
.pk-tap{flex:1;min-width:0;display:flex;align-items:center;gap:12px;text-align:left;background:none;border:0;color:inherit;font:inherit;padding:10px 2px;min-height:52px}
.pk-box{flex:none;width:26px;height:26px;border:2px solid var(--line);border-radius:7px;display:flex;align-items:center;justify-content:center;font-weight:800;color:var(--brass-ink)}
.pk-row.sel .pk-box{background:var(--brass);border-color:var(--brass)}.pk-row.sel{background:var(--surface)}
.pk-t{min-width:0}.pk-t b{display:block;font-size:17px;line-height:1.25}.pk-t small{display:block;color:var(--muted);font-size:13px;line-height:1.3;margin-top:2px}
.pk-row.out .pk-t b{color:var(--warn)}.pk-sw{color:var(--brass);font-weight:700}
.pk-one{flex:none;margin:0;min-width:84px;min-height:44px}
.pk-typed{display:block;width:100%;text-align:left;background:none;border:1px dashed var(--brass);border-radius:12px;color:var(--brass);font:inherit;font-weight:700;padding:12px;margin:12px 0;min-height:48px}
.pk-typed small{display:block;color:var(--muted);font-weight:400;font-size:13px;margin-top:2px}
.pk-foot{flex:none;display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:8px;padding-top:10px;border-top:1px solid var(--line);margin-top:6px}.pk-foot[hidden]{display:none}
.pk-foot .btn{margin:0}.pk-foot .btn.pri{flex:1 1 auto;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pk-foot .s{margin:0;color:var(--muted);font-size:13px;flex:1}
.pk-open{display:flex;align-items:center;gap:10px;width:100%;text-align:left;font:inherit;font-size:17px;color:var(--muted);background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin:8px 0;min-height:48px}
.pk-open span{font-size:20px;color:var(--brass);line-height:1}
body.sxbig .pk-t b{font-size:21px}
</style>`);
