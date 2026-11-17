/* ---------- Stock count: the notebook, on the phone ----------
   Everything the bar and floor hold, from the one stock list (the stock list plus anything added with Add something
   new), walked in shelf order: each place (speed rail, back bar, fridges, freezer, store room) and what's on it. Tap a
   line, set it, and Next goes to the one after. Bottles are full ones plus the open one in tenths, tapped on a bottle,
   or weighed on a kitchen scale; everything else is each, pack, kg and so on. Say it or type it ("Smirnoff two and a
   half") and the app finds the line. Every change saves straight away under the counter's name and the day, with no
   signal too (it goes when there's signal). Totals go out as a table for WhatsApp, as words, or as a spreadsheet for
   Numbers or Excel, for whoever types it into Nory. Deliveries in between are logged so usage between counts is right,
   and an unusual drop is flagged. No prices: Nory does those. Managers set the places, the order, the units and the
   bottle weights once. */
var CT_AREAS = ["Speed rail", "Back bar", "Prep and syrups", "Garnish station", "Bar fridge", "Cellar", "Shake station", "Cake fridge", "Floor fridge", "Freezer", "Store room"];
var CT_UNITS = ["bottle", "each", "pack", "box", "bag", "tub", "jar", "can", "bunch", "punnet", "keg", "case", "kg", "litre"];
// Where each part of the stock list is counted, and how.
var CT_GROUP = {
  "Beer lines": ["Cellar", "keg"], "Bottled beer": ["Bar fridge", "each"], "Cider": ["Bar fridge", "each"], "Soft drinks and mixers": ["Bar fridge", "each"],
  "Water": ["Bar fridge", "each"], "Wine": ["Bar fridge", "bottle", 750], "Bar supplies": ["Store room", "pack"], "Fruit and garnish": ["Garnish station", "each"],
  "Juices": ["Bar fridge", "bottle", 1000], "Syrups, bitters and prep": ["Prep and syrups", "bottle", 700], "Vodka": ["Back bar", "bottle", 700], "Gin": ["Back bar", "bottle", 700],
  "Rum and cachaça": ["Back bar", "bottle", 700], "Tequila and mezcal": ["Back bar", "bottle", 700], "Whiskey": ["Back bar", "bottle", 700], "Brandy": ["Back bar", "bottle", 700],
  "Desserts and shakes": ["Shake station", "each"], "Dairy and purées": ["Bar fridge", "each"], "Floor supplies": ["Store room", "pack"], "Liqueurs and vermouth": ["Back bar", "bottle", 700],
};
// Names that go somewhere else: the draught and postmix in the cellar, the house pours on the speed rail.
var CT_NAME = [
  [/\(draught\)/, "Cellar", "keg"], [/^(Coke|Coke Zero|Diet Coke)$/, "Cellar", "box"], [/^CO2 gas$/, "Cellar", "each"], [/^Ice$/, null, null, true],
  [/^(Smirnoff|Smirnoff Vanilla|Tanqueray|Captain Morgan White|Captain Morgan Spiced Gold|Cîroc Red Berry|Cîroc Apple|El Jimador Blanco|El Jimador Reposado|Buffalo Trace)$/, "Speed rail", "bottle"],
  [/^(Lime juice|Lemon juice)$/, "Prep and syrups", "bottle"], [/^(Mint|Basil)$/, null, "bunch"], [/^(Strawberries|Raspberries)$/, null, "punnet"],
  [/^(Olives|Jalapeños|Cherries|Maraschino cherries)$/, null, "jar"], [/^(Guinness cake|Sprinkle cake|Brownies|Cheesecake)$/, "Cake fridge", "each"],
  [/^Ice cream$/, "Freezer", "tub"], [/ice cream sandwich/, "Freezer", "each"], [/^Whipped cream$/, null, "can"], [/^(Shake cups|Cup holders)$/, "Store room", "pack"],
  [/^Espresso beans$/, null, "bag"], [/powder|brine/, null, "tub"], [/^Salted caramel sauce$/, null, "bottle"],
  [/^(Whole milk|Oat milk)$/, ["Bar fridge", "Shake station"], "each"], [/^Double cream$/, null, "each"], [/^Funkin purées$/, null, "each"], [/^(Apples|Chillies)$/, null, "each"],
  [/^Cocktail pickles$/, null, "jar"], [/^(Black velvet cake|Victoria sponge)$/, "Cake fridge", "each"], [/^Vegan ice cream$/, "Freezer", "tub"], [/^Vegan whipped cream$/, null, "can"],
  [/sauce$/, null, "bottle"], [/frosting|Philadelphia/, null, "tub"], [/crackers|crumb|^Cookies$|Jammie Dodgers|Lotus|cones|Sprinkles|pieces|Cotton candy/, null, "pack"],
  [/^(Mayonnaise|Ketchup|Mustard)$/, "Floor fridge", "bottle"],
];
// Things added with Add something new: from what kind of thing they are.
var CT_KIND = {
  fresh: ["Garnish station", "each"], dairy: ["Bar fridge", "each"], juice: ["Bar fridge", "bottle", 1000], puree: ["Bar fridge", "bottle", 1000], prep: ["Prep and syrups", "bottle", 700],
  syrup: ["Prep and syrups", "bottle", 700], soft: ["Bar fridge", "each"], beer: ["Bar fridge", "each"], cider: ["Bar fridge", "each"], wine: ["Bar fridge", "bottle", 750],
  vermouth: ["Back bar", "bottle", 750], spirit: ["Back bar", "bottle", 700], liqueur: ["Back bar", "bottle", 700], coffee: ["Store room", "bag"], dessert: ["Cake fridge", "each"],
  sauce: ["Shake station", "bottle"], topping: ["Shake station", "tub"], icecream: ["Freezer", "tub"], supplies: ["Store room", "pack"], other: ["Store room", "each"],
};
var ctDay = "", ctOpen = "", ctHeard = null, ctSetupOn = false, ctSetOpen = "", ctUse = null, ctUseBusy = false, ctRx = null;
const ctSlug = (s) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x";
const ctId = (day, area, item) => `${day}--${ctSlug(area)}--${ctSlug(item)}`;
const ctNum = (n) => String(Math.round(n * 100) / 100);
const ctUnit = (u, n) => (u === "each" ? "" : u === "kg" ? " kg" : u === "litre" ? (n === 1 ? " litre" : " litres") : ` ${u}${n === 1 ? "" : u === "box" ? "es" : u === "bunch" ? "es" : "s"}`);
const ctSay = (u, n) => `${ctNum(n)}${ctUnit(u, n)}`;
// Liquids in bottles can be weighed for the open one; anything else can be with a manager's portion weight.
const ctWeighable = (r) => (r.u === "bottle" ? r.e > 0 && r.f > r.e : r.pw > 0);
function ctSetup() { const s = LIVE.countSetup || {}; return { areas: s.areas?.length ? s.areas : CT_AREAS, items: s.items || {}, order: s.order || {} }; }
function ctDefault(name, group) {
  const k = itLive().find((x) => x.item === name);
  let [a, u, ml] = (k && !itStock(name) ? (k.side === "floor" && ["dairy", "fresh"].includes(k.kind) ? ["Shake station", "each"] : CT_KIND[k.kind]) : CT_GROUP[group]) || ["Store room", "each"], off = false;
  for (const [re, a2, u2, o] of CT_NAME) if (re.test(name)) { a = a2 || a; u = u2 || u; off = !!o; break; }
  return { a: [a].flat(), u, ml: u === "bottle" && !/sauce|Mayonnaise|Ketchup|Mustard/.test(name) ? ml || 700 : 0, off };
}
// Every line of the count in shelf order: one per product and place (a product kept in two places has two lines, and
// its total adds them up). all includes the ones not counted, for the setup.
function ctRows(all) {
  const s = ctSetup(), out = [];
  let i = 0;
  for (const [g, xs] of Object.entries(stockGroups())) for (const item of xs) {
    const d = ctDefault(item, g), o = s.items[item] || {};
    const r = { item, group: g, i: i++, u: o.u || d.u, a: o.a?.length ? o.a : d.a, e: +o.e || 0, f: +o.f || 0, ml: o.ml ?? d.ml, pw: +o.pw || 0, off: o.off ?? d.off };
    if (r.off && !all) continue;
    for (const area of r.a) out.push({ ...r, area, key: `${area}|${item}` });
  }
  const areas = ctAreas(out), pos = (r) => { const k = (s.order[r.area] || []).indexOf(r.item); return k < 0 ? 1000 + r.i : k; };
  return out.sort((x, y) => areas.indexOf(x.area) - areas.indexOf(y.area) || pos(x) - pos(y));
}
function ctAreas(rows = ctRows(true)) { const a = ctSetup().areas; return [...a, ...new Set(rows.map((r) => r.area).filter((x) => !a.includes(x)))]; }
const ctLines = () => (LIVE.countDay === ctDay ? LIVE.counts || [] : []);
const ctLine = (r) => ctLines().find((x) => x.area === r.area && x.item === r.item);
const ctQty = (x) => x.full + x.open / 100;
// Each product's total across its places, in shelf order, with who counted it.
function ctTotals(day = ctDay, lines = ctLines()) {
  const out = new Map();
  for (const r of ctRows()) {
    const t = out.get(r.item) || { item: r.item, u: r.u, n: 0, done: 0, of: 0, where: [], by: new Set(), ml: r.ml };
    const x = lines.find((y) => y.day === day && y.area === r.area && y.item === r.item);
    t.of++; if (x) { t.done++; t.n += ctQty(x); t.where.push(`${r.area} ${ctNum(ctQty(x))}`); t.by.add(x.name); }
    out.set(r.item, t);
  }
  return [...out.values()];
}
const ctDate = (d) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/* ---- Saying it or typing it: "Smirnoff two and a half", "Tanqueray 3 point 4", "Kraken 845 grams" ---- */
var CT_WORD = { zero: 0, none: 0, nothing: 0, nil: 0, one: 1, won: 1, two: 2, to: 2, too: 2, three: 3, four: 4, for: 4, five: 5, six: 6, seven: 7, eight: 8, ate: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90, hundred: 100 };
var CT_FILL = new Set(["and", "a", "an", "full", "bottle", "bottles", "open", "of", "plus", "left", "is", "we", "have", "got", "x", "times", "each", "units"]);
function ctWords(s) { return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/(\d),(\d)/g, "$1.$2").replace(/(\d)\s*(g|grams?|kg)\b/g, "$1 $2").replace(/[^a-z0-9.]+/g, " ").trim().split(" ").filter(Boolean); }
// The number at the end of what was said: whole bottles and a part. null if it isn't a number.
function ctNumber(ts) {
  let whole = null, dec = "", inDec = false, frac = 0, grams = false, any = false;
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i], n = CT_WORD[t];
    if (/^(g|grams?|gram)$/.test(t)) { grams = true; continue; }
    if (t === "point" || t === ".") { inDec = true; continue; }
    if (/^\d+(\.\d+)?$/.test(t)) { any = true; if (inDec) { dec += t.replace(".", ""); continue; } const [w, d = ""] = t.split("."); whole = whole != null && whole >= 20 && whole % 10 === 0 && +w < 10 ? whole + +w : +w; dec = d; continue; }
    if (t === "half" || t === "halves") { frac += 0.5; any = true; continue; }
    if (/^quarters?$/.test(t)) { frac += 0.25; any = true; continue; }
    if (n != null) {
      any = true;
      if (/^quarters?$/.test(ts[i + 1] || "")) { frac += n * 0.25; i++; continue; }
      if (inDec) { dec += String(n); continue; }
      if (n === 100 && whole) { whole *= 100; continue; }
      whole = whole != null && whole >= 20 && whole % 10 === 0 && n < 10 ? whole + n : n; continue;
    }
    if (CT_FILL.has(t)) continue;
    return null;
  }
  return any ? { n: (whole || 0) + (dec ? +`0.${dec}` : 0) + frac, grams } : null;
}
// How near what was said is to a product's name: 0 is exact, null is not it. Every word said has to be near a word of
// the name; words of the name not said cost a little, so "Smirnoff" is Smirnoff before Smirnoff Vanilla.
function ctScore(said, name) {
  const ws = ctWords(name).filter((w) => !/^(the|and|of)$/.test(w)), xs = said.filter((w) => !/^(the|and|of)$/.test(w));
  if (!xs.length) return null;
  const used = new Set(); let d = 0;
  for (const w of xs) {
    let best = null, at = -1;
    ws.forEach((x, j) => {
      const s = w === x ? 0 : x.replace(/s$/, "") === w.replace(/s$/, "") ? 0.1 : w.length >= 3 && x.startsWith(w) ? 0.3 : w.length >= 4 && mkLev(w, x) <= (w.length >= 7 ? 2 : 1) ? mkLev(w, x) : null;
      if (s != null && (best == null || s < best) && !used.has(j)) { best = s; at = j; }
    });
    if (best == null) return null;
    used.add(at); d += best;
  }
  return d + 0.5 * (ws.length - used.size);
}
// What was said: the product (and which of its places), and the number.
function ctParse(text) {
  const ts = ctWords(text), rows = ctRows(), names = [...new Set(rows.map((r) => r.item))];
  let best = null;
  for (let k = ts.length - 1; k >= 1; k--) {
    const num = ctNumber(ts.slice(k)); if (!num) continue;
    for (const n of names) { const s = ctScore(ts.slice(0, k), n); if (s != null && (!best || s < best.s || (s === best.s && k > best.k))) best = { s, k, item: n, num }; }
  }
  if (!best) return null;
  const mine = rows.filter((r) => r.item === best.item), r = mine.find((x) => x.area === ctOpen.split("|")[0]) || mine.find((x) => !ctLine(x)) || mine[0];
  return { text, key: r.key, ...best.num };
}
// What a number said means for a line: whole ones and the open one, or the open one from grams on the scale.
function ctValue(r, p) {
  const was = ctLine(r);
  if (p.grams) {
    const w = ctWeigh(r, p.n); if (!w) return null;
    return r.u === "bottle" ? (w.full ? { full: (was?.full || 0) + 1, open: 0 } : { full: was?.full || 0, open: w.open }) : { full: Math.floor(w.n), open: Math.round((w.n % 1) * 100) };
  }
  return { full: Math.floor(p.n + 1e-9), open: Math.round(((p.n + 1e-9) % 1) * 100) };
}
// A weight on the scale: a bottle's open part (and ml and cl), or how many portions.
function ctWeigh(r, g) {
  if (!(g > 0) || !ctWeighable(r)) return null;
  if (r.u !== "bottle") { const n = Math.max(0, (g - r.e) / r.pw); return { n: Math.round(n * 100) / 100 }; }
  if (g >= r.f - 3) return { full: true, open: 0, ml: r.ml };
  const fr = Math.min(0.99, Math.max(0, (g - r.e) / (r.f - r.e)));
  return { open: Math.round(fr * 100), ml: r.ml ? Math.round(fr * r.ml) : 0 };
}

/* ---- The page ---- */
// On the Stock page: where today's count is, and the way in.
function ctCardHtml() {
  if (!LIVE.me) return "";
  const day = shiftDay(), on = LIVE.countDay === day ? ctTotals(day, LIVE.counts || []) : null;
  return `<div class="sec">Stock count</div><p class="note">The count book: every bottle, cake and box, place by place. Saves as you go, even with no signal.${on ? ` Today: ${on.filter((t) => t.done === t.of).length} of ${on.length} counted.` : ""}</p>
    <div class="actions"><button class="btn pri" data-ct-open>${on?.some((t) => t.done) ? "Carry on counting" : "Count stock"}</button></div>`;
}
// The page: a find-or-count box that stays at the top while the list scrolls, then the list. Phones get the lean
// version (one row of places that scrolls sideways, the totals folded away, the bottle level behind one tap when the
// scale can do it); the iPad gets everything open side by side.
const ctWide = () => matchMedia("(min-width: 700px)").matches;
var ctQ = "", ctShow = store.get("ctShow", "todo"), ctLvl = false, ctTotOpen = null;
function ctPage() {
  ctDay = ctDay || shiftDay(); ctOpen = ""; ctHeard = null; ctSetupOn = false; ctUse = null; ctQ = ""; ctLvl = false;
  lastFocus = document.activeElement;
  const speech = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  $("#sheet").innerHTML = `<div class="sheet-top"><div class="bar1"><button class="back" id="sh-close">‹ Back</button><span class="t">Stock count</span><span></span></div>
    <div class="ct-find" id="ct-find"><div class="ltools"><span class="ct-q"><span aria-hidden="true">⌕</span><input id="ct-say" type="search" enterkeyhint="go" maxlength="80" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="Find, or say “Smirnoff 2.5”" aria-label="Find an item, or say or type a count"></span>${speech ? `<button class="btn" id="ct-mic" aria-label="Say a count">🎤 Say it</button>` : ""}<button class="btn pri" id="ct-say-go" hidden>Count it</button></div>
    <div id="ct-heard-slot"></div></div></div><div id="ct"></div>`;
  showSheet(false); $("#sheet").scrollTop = 0; ctRender(); $("#sh-close").focus();
}
const ctShown = () => !$("#sheet").hidden && !!$("#ct");
// A change from another phone waits while a number is being typed on a line here. force redraws anyway (this phone's
// own action), keeping the box being typed in. Typing in the find box never waits: it sits above the list.
function ctRender(force) {
  if (!ctShown()) return;
  LIVE.api.watchCount(ctDay);
  const el = $("#ct"), ae = document.activeElement, typing = el.contains(ae) && ae.matches("input, select");
  const top = $("#ct-find"); if (top) top.hidden = ctSetupOn;
  if ($("#ct-mic")) $("#ct-mic").textContent = ctRx ? "Listening…" : "🎤 Say it";
  if ($("#ct-heard-slot")) $("#ct-heard-slot").innerHTML = ctSetupOn ? "" : ctHeardHtml();
  if (typing && !force) { ctRender.later = true; return; }
  ctRender.later = false;
  el.innerHTML = ctSetupOn ? ctSetupHtml() : ctHtml();
  if (typing && ae.id) document.getElementById(ae.id)?.focus();
}
// The list on its own, while the find box is being typed in.
function ctPaint() { const l = $("#ct-list"); if (l) l.innerHTML = ctListHtml(); }
// Finding a product in any place, whatever order the shelf is in: a few letters, typos too ("tanquerey"). A count
// typed in ("Smirnoff 2.5", "kraken 845 grams") finds by the name in front of the number.
function ctFind(q, rows) {
  const ws = ctWords(q); if (!ws.length) return null;
  const names = [...new Set(rows.map((r) => r.item))];
  const fit = (xs) => {
    const sc = new Map(), whole = xs.join(" ");
    for (const n of names) {
      let s = ctScore(xs, n); const nw = ctWords(n);
      if (s == null && (nw.some((w) => w.startsWith(whole)) || (whole.length >= 3 && nw.join(" ").includes(whole)))) s = 1;
      if (s != null) sc.set(n, s);
    }
    return sc;
  };
  let sc = fit(ws);
  for (let k = ws.length - 1; !sc.size && k >= 1; k--) if (ctNumber(ws.slice(k))) sc = fit(ws.slice(0, k));
  return rows.filter((r) => sc.has(r.item)).sort((a, b) => sc.get(a.item) - sc.get(b.item));
}
function ctHtml() {
  if (LIVE.countErr) return `<p class="note warnline">The count couldn't load. If it's new, Maintenance needs to publish the new rules.</p>`;
  if (!LIVE.loaded.has("countSetup") || LIVE.countDay !== ctDay) return `<p class="note">Loading the count…</p>`;
  const rows = ctRows(), tot = ctTotals(), done = rows.filter(ctLine).length, by = [...new Set(ctLines().map((x) => x.name))], wide = ctWide();
  return `<div class="ct-head"><p class="s"><b>${done} of ${rows.length} lines counted</b>${by.length ? ` by ${esc(by.join(", "))}` : ""}. Saves as you go, with no signal too.</p>
      <div class="ct-bar" aria-hidden="true"><i style="width:${rows.length ? Math.round((done / rows.length) * 100) : 0}%"></i></div>
      <label class="ct-day">Count for <input type="date" id="ct-day" value="${ctDay}" max="${shiftDay()}"></label></div>
    <details class="setup ct-how" id="ct-how"${store.get("ctHow", false) ? "" : " open"}><summary>How to count</summary><ol>
      <li>Walk the bar in order and tap each item. Find at the top looks in every place, if it's somewhere else.</li>
      <li><b>Full, sealed bottles:</b> tap + for each one.</li>
      <li><b>The open bottle:</b> stand it on the scale and type the grams. No scale, or no weights for it yet? Tap how full it is.</li>
      <li><b>Anything else</b> (cans, cakes, packs): + and −, or type it. Half is .5.</li>
      <li><b>Next ›</b> saves it and opens the next one. Nothing there? Next saves it as none.</li>
      <li><b>Hands full?</b> 🎤 Say it, or type, the name then how many: “Smirnoff two and a half”, “Kraken 845 grams”. Check it, then Save it.</li>
      <li>Done: Send on WhatsApp or Spreadsheet, at the bottom.</li></ol></details>
    <div id="ct-list">${ctListHtml()}</div>
    <details class="setup" id="ct-tot-box"${ctTotOpen ?? wide ? " open" : ""}><summary>Totals so far${tot.some((t) => t.done) ? ` (${tot.filter((t) => t.done).length})` : ""}</summary>
      <p class="note">Each product added up across its places, for typing into Nory.</p>
      <div class="ct-tot">${tot.filter((t) => t.done).map((t) => `<div><span>${esc(t.item)}</span><b>${ctSay(t.u, t.n)}${t.done < t.of ? " <small>(not all places)</small>" : ""}</b></div>`).join("") || `<p class="note">Nothing counted yet.</p>`}</div></details>
    <div class="actions">${sendBtn("count", "Send on WhatsApp", ctDay)}<button class="btn" id="ct-csv">Spreadsheet (Numbers, Excel)</button></div>
    ${ctInHtml()}${ctUseHtml()}
    ${LIVE.admin ? `<div class="actions"><button class="btn" id="ct-setup">Set up the count</button></div>` : ""}`;
}
// Not counted yet, everything, or what's been counted; the places to jump to; and the lines. A search looks in every
// place whatever is picked.
function ctListHtml() {
  const rows = ctRows(), areas = [...new Set(rows.map((r) => r.area))], found = ctQ.trim() ? ctFind(ctQ, rows) : null;
  const todo = rows.filter((r) => !ctLine(r)).length;
  const show = (r) => r.key === ctOpen || ctShow === "all" || (ctShow === "todo" ? !ctLine(r) : !!ctLine(r));
  const chip = (k, label, n) => `<button class="chip" data-ct-show="${k}" aria-pressed="${!found && ctShow === k}">${label}${n != null ? ` <small>${n}</small>` : ""}</button>`;
  const head = `<div class="recent ct-show">${chip("todo", "Not counted yet", todo)}${chip("all", "All", rows.length)}${chip("done", "Counted", rows.length - todo)}</div>
    <div class="recent ct-jump" role="group" aria-label="Go to a place">${areas.map((a) => { const rs = rows.filter((r) => r.area === a), n = rs.filter(ctLine).length; return `<button class="chip${n === rs.length ? " full" : ""}" data-ct-jump="${esc(a)}">${esc(a)} <small>${n === rs.length ? "✓" : `${n}/${rs.length}`}</small></button>`; }).join("")}</div>`;
  if (found) return `${head}<div class="sec">${found.length ? `Found in ${[...new Set(found.map((r) => r.area))].length === 1 ? esc(found[0].area) : "every place"}` : "Nothing found"}</div>
    ${found.map((r) => ctRowHtml(r, true)).join("") || `<p class="note">Nothing called “${esc(ctQ.trim())}”. Try fewer letters.${LIVE.admin ? " Not on the count at all? Add it with Add something new." : ""}</p>`}`;
  const body = areas.map((a) => { const rs = rows.filter((r) => r.area === a && show(r)); return `<i class="anc" id="ct-a-${ctSlug(a)}"></i>${rs.length ? `<div class="sec">${esc(a)}</div>${rs.map((r) => ctRowHtml(r)).join("")}` : ""}`; }).join("");
  const none = !rows.some(show);
  return `${head}${none ? `<p class="note ct-all">${ctShow === "todo" ? "✓ Everything's counted. Check the totals, then send them." : "Nothing counted yet."}</p>` : ""}${body}`;
}
function ctHeardHtml() {
  const h = ctHeard; if (!h) return "";
  if (h.none) return `<p class="note warnline">Heard “${esc(h.text)}” but couldn't tell what or how many. Say the name then the number, like “Tanqueray 3 point 4”.</p>`;
  const r = ctRows().find((x) => x.key === h.key), v = r && ctValue(r, h);
  if (!r) return "";
  const mine = ctRows().filter((x) => x.item === r.item);
  return `<div class="ct-heard"><p>Heard “${esc(h.text)}”: <b>${esc(r.item)}</b>, ${esc(r.area)}: ${v ? `<b>${ctSay(r.u, v.full + v.open / 100)}</b>` : "<b>no bottle weights yet</b>, so it can't be weighed"}</p>
    ${mine.length > 1 ? `<div class="recent">${mine.map((x) => `<button class="chip" data-ct-heard-area="${esc(x.key)}" aria-pressed="${x.key === r.key}">${esc(x.area)}</button>`).join("")}</div>` : ""}
    <div class="actions">${v ? `<button class="btn pri" id="ct-heard-ok">Save it</button>` : ""}<button class="btn" data-ct-row="${esc(r.key)}">Open it to change</button><button class="btn" id="ct-heard-no">Not that</button></div></div>`;
}
function ctRowHtml(r, where) {
  const x = ctLine(r), on = ctOpen === r.key;
  return `<div class="ct-row${on ? " on" : ""}${x ? " done" : ""}" id="ct-r-${ctSlug(r.key)}"><button class="ct-line" data-ct-row="${esc(r.key)}" aria-expanded="${on}"><i class="ct-dot" aria-hidden="true"></i><span>${esc(r.item)}${where ? `<small>${esc(r.area)}</small>` : ""}</span><b>${x ? ctSay(r.u, ctQty(x)) : ""}</b>${x ? `<small class="by">${esc(x.name)}</small>` : ""}</button>${on ? ctEditHtml(r, x) : ""}</div>`;
}
// The line being counted, one way through: the full ones, then the open one (weighed if the scale can, else its
// level), then Next. Big buttons for wet hands.
function ctEditHtml(r, x) {
  const full = x?.full || 0, open = x?.open || 0, can = ctWeighable(r), wide = ctWide();
  const step = (k, n, label) => `<div class="ct-step"><span>${label}</span><button class="ct-big" data-ct-add="${k}:-1" aria-label="One less">−</button><b>${n}</b><button class="ct-big" data-ct-add="${k}:1" aria-label="One more">+</button></div>`;
  const lvl = `<div class="ct-open"><div><span>Open bottle</span><b>${open ? `${ctNum(open / 100)}${r.ml ? ` · ${Math.round((open / 100) * r.ml)} ml` : ""}` : "None"}</b><button class="btn" data-ct-set="${full}:0">No open one</button></div>${ctBottle(open)}</div>`;
  const total = x ? `<p class="ct-sum">Total here: <b>${ctSay(r.u, ctQty(x))}</b></p>` : "";
  const foot = `${total}<div class="actions"><button class="btn" data-ct-set="0:0">None left</button>${x ? `<button class="btn" data-ct-drop="${esc(r.key)}">Clear</button>` : ""}<button class="btn pri" data-ct-next="${esc(r.key)}">Next ›</button></div>`;
  if (r.u !== "bottle") return `<div class="ct-edit">${step("full", full, `How many${ctUnit(r.u, 2)}`)}<label class="fld">Or type it (half is .5)<input id="ct-type" inputmode="decimal" value="${x ? ctNum(ctQty(x)) : ""}" placeholder="0"></label>${can ? ctWeighHtml(r) : ""}${foot}</div>`;
  const how = can ? `${ctWeighHtml(r)}${wide || ctLvl ? lvl : `<button class="btn ct-lvl" data-ct-lvl>No scale? Tap how full it is</button>`}`
    : `<p class="s">No bottle weights for ${esc(r.item)} yet, so tap how full it is.${LIVE.admin ? "" : " A manager sets them once, in Set up the count."}</p>${lvl}${LIVE.admin ? `<details class="ct-wbox"><summary>Set its weights, to weigh it next time</summary>${ctWeightsHtml(r)}</details>` : ""}`;
  return `<div class="ct-edit ct-b"><div class="ct-c1"><p class="ct-n">1. Full, sealed bottles</p>${step("full", full, "Full")}</div>
    <div class="ct-c2"><p class="ct-n">2. The open one</p>${how}</div>${foot}</div>`;
}
// The open bottle: tap how full it is, in tenths. Top band is full.
function ctBottle(open) {
  const lv = Math.round(open / 10);
  return `<svg class="ct-btl" viewBox="0 0 120 300" role="group" aria-label="Tap how full the open bottle is">
    <path d="M48 6h24v52c0 10 30 22 30 46v186a8 8 0 0 1-8 8H26a8 8 0 0 1-8-8V104c0-24 30-36 30-46z" fill="none" stroke="currentColor" stroke-width="4"/>
    ${Array.from({ length: 10 }, (_, i) => { const k = i + 1, y = 290 - k * 18.6; return `<rect data-ct-lv="${k}" x="20" y="${y}" width="80" height="18.6" class="${k <= lv ? "fill" : ""}"><title>${k / 10}</title></rect><text x="114" y="${y + 13}" text-anchor="end" class="lvt">${k === 10 ? "1" : `.${k}`}</text>`; }).join("")}
  </svg>`;
}
// The scale: for a bottle, the open one's grams; for anything else with a portion weight, all of them on it at once.
function ctWeighHtml(r) {
  const b = r.u === "bottle";
  return `<label class="fld ct-g">${b ? "On the scale, grams" : `Or weigh them, grams (one is ${r.pw} g${r.e ? `, the container ${r.e} g` : ""})`}<input id="ct-g" inputmode="decimal" enterkeyhint="done" data-ct-g="${esc(r.key)}" placeholder="Grams"></label><p class="s" id="ct-g-out">${b ? `Empty ${r.e} g, full ${r.f} g${r.ml ? `, ${r.ml} ml` : ""}. A sealed one goes on Full.` : ""}</p>`;
}
// A manager setting a bottle's weights: weigh an empty one and an unopened one once. Not 1 g = 1 ml: a liqueur is
// heavier than a spirit, so the two weights are what make it right.
function ctWeightsHtml(r) {
  return `<div class="ct-w" data-ct-w="${esc(r.item)}"><p class="s">Weigh an empty ${esc(r.item)} bottle (rinsed, pourer on if it has one) and an unopened one.</p>
    <div class="two"><label class="fld">Empty, grams<input inputmode="decimal" data-ct-wf="e" value="${r.e || ""}"></label><label class="fld">Unopened, grams<input inputmode="decimal" data-ct-wf="f" value="${r.f || ""}"></label></div>
    <label class="fld">Bottle size, ml<input inputmode="numeric" data-ct-wf="ml" value="${r.ml || ""}"></label><div class="actions"><button class="btn" data-ct-wsave="${esc(r.item)}">Save the weights</button></div></div>`;
}
function ctPut(r, full, open) {
  full = Math.max(0, Math.min(9999, Math.round(full))); open = Math.max(0, Math.min(99, Math.round(open)));
  track(LIVE.api.countLine(ctId(ctDay, r.area, r.item), { day: ctDay, area: r.area, item: r.item, unit: r.u, full, open }), null, "Not saved. Check the signal and try again");
}
const ctRow = (key) => ctRows().find((r) => r.key === key);
function ctGo(key) {
  ctOpen = key; ctHeard = null; ctLvl = false; ctRender();
  requestAnimationFrame(() => document.getElementById(`ct-r-${ctSlug(key)}`)?.scrollIntoView({ block: "start", behavior: calm() ? "auto" : "smooth" }));
}
function ctHear(text) {
  text = text.trim(); if (!text) return;
  const p = ctParse(text);
  ctHeard = p ? { ...p } : { text, none: true };
  // A bottle said with a number no bottle count gets to (“Kraken 845”) is grams on the scale.
  if (p) { const r = ctRow(p.key); if (r?.u === "bottle" && ctWeighable(r) && !p.grams && p.n >= 100) ctHeard.grams = true; }
  // The list below shows what was heard, so its line is there to open.
  ctQ = text; if ($("#ct-say")) $("#ct-say").value = text; if ($("#ct-say-go")) $("#ct-say-go").hidden = true;
  ctRender(true);
}
function ctMic() {
  const R = window.SpeechRecognition || window.webkitSpeechRecognition; if (!R) return;
  if (ctRx) { ctRx.stop(); return; }
  const rx = ctRx = new R(); rx.lang = "en-GB"; rx.interimResults = false; rx.maxAlternatives = 5;
  // The phone's guesses at what was said: the first one that names a product and a number wins.
  rx.onresult = (e) => { const r = e.results[0], ts = Array.from({ length: r.length }, (_, i) => r[i].transcript), t = ts.find((x) => ctParse(x.trim())) || ts[0]; if ($("#ct-say")) $("#ct-say").value = t; ctHear(t); };
  rx.onerror = (e) => toast(e.error === "not-allowed" ? "Allow the microphone for Bar Book, or use the keyboard's mic" : "Didn't catch that. Try again");
  rx.onend = () => { ctRx = null; ctRender(); };
  try { rx.start(); ctRender(); } catch { ctRx = null; }
}

/* ---- Deliveries in, and usage between counts ---- */
function ctInHtml() {
  const ins = (LIVE.received || []).filter((x) => x.day === ctDay);
  return `<details class="setup" id="ct-in-box"${ctInHtml.open ? " open" : ""}><summary>Delivery in${ins.length ? ` (${ins.length})` : ""}</summary>
    <p class="note">Log what came in, so usage between counts is right. Like “Smirnoff 6” or “Limes 2 boxes”: the count's own units.</p>
    <div class="ltools"><input id="ct-in" maxlength="80" autocomplete="off" placeholder="What came in, and how many" aria-label="What came in"><button class="btn" id="ct-in-go">Log it</button></div>
    ${ins.map((x) => `<div class="tally-row" style="grid-template-columns:1fr auto"><div class="n">${esc(x.item)}: ${ctSay(x.unit, x.qty / 100)}<div class="s">${esc(x.name)}</div></div>${x.uid === LIVE.uid || LIVE.admin ? `<button class="btn" data-ct-in-drop="${x.id}">Take off</button>` : ""}</div>`).join("")}</details>`;
}
// Usage per product between the last counts: the count before, plus what came in, less this count. A drop much bigger
// than its usual (per day, against the earlier gaps) is flagged, and so is stock going up with no delivery logged.
function ctUseHtml() {
  return `<details class="setup" id="ct-use-box"${ctUseHtml.open ? " open" : ""}><summary>Usage between counts</summary>
    ${ctUseBusy ? `<p class="note">Getting the earlier counts…</p>` : !ctUse ? `<div class="actions"><button class="btn" id="ct-use-go">Work it out</button></div>` : ctUseBody()}</details>`;
}
function ctUsage() {
  const u = ctUse; if (!u) return null;
  const days = [...new Set(u.lines.map((x) => x.day))].filter((d) => d <= ctDay).sort();
  if (days.length < 2) return { days, rows: [] };
  const tot = Object.fromEntries(days.map((d) => [d, new Map(ctTotals(d, u.lines).filter((t) => t.done).map((t) => [t.item, t]))]));
  const gap = (a, b) => Math.max(1, (Date.parse(b) - Date.parse(a)) / 864e5);
  const use = (a, b, item) => {
    const x = tot[a].get(item), y = tot[b].get(item); if (!x || !y) return null;
    const got = u.received.filter((r) => r.item === item && r.day > a && r.day <= b).reduce((n, r) => n + r.qty / 100, 0);
    return { n: x.n + got - y.n, got, per: (x.n + got - y.n) / gap(a, b) };
  };
  const [a, b] = days.slice(-2), rows = [];
  for (const t of tot[b].values()) {
    const now = use(a, b, t.item); if (!now) continue;
    const past = days.slice(0, -1).map((d, i) => i && use(days[i - 1], d, t.item)).filter(Boolean), avg = past.length ? past.reduce((n, x) => n + x.per, 0) / past.length : null;
    const flag = now.n < -0.05 ? "Went up with no delivery logged" : avg != null && now.per > avg * 1.5 && now.n - avg * gap(a, b) >= 1 ? `More than usual (usually ${ctNum(avg * gap(a, b))})` : "";
    rows.push({ item: t.item, u: t.u, ...now, flag });
  }
  return { days, a, b, rows };
}
function ctUseBody() {
  const s = ctUsage();
  if (s.days.length < 2) return `<p class="note">Usage needs two counts. The next count shows it.</p>`;
  return `<p class="note">${ctDate(s.a)} to ${ctDate(s.b)}: the count before, plus deliveries logged, less this count. Flagged: much more than its usual, or stock that went up with no delivery logged.</p>
    <div class="ct-tot">${s.rows.sort((x, y) => !!y.flag - !!x.flag || x.item.localeCompare(y.item)).map((x) => `<div${x.flag ? ' class="flag"' : ""}><span>${esc(x.item)}${x.flag ? `<small>${esc(x.flag)}</small>` : ""}</span><b>${ctSay(x.u, x.n)}${x.got ? ` <small>(${ctNum(x.got)} in)</small>` : ""}</b></div>`).join("") || `<p class="note">Nothing counted both times.</p>`}</div>
    <div class="actions">${sendBtn("countuse", "Send the usage", ctDay)}</div>`;
}
async function ctUseLoad() {
  ctUseBusy = true; ctRender();
  try { ctUse = await LIVE.api.countHistory(ctDay); } catch { toast("Couldn't get the earlier counts. Check the signal"); }
  ctUseBusy = false; ctRender();
}

/* ---- Sending: a table picture and words for WhatsApp, and a spreadsheet ---- */
function ctTable(day = ctDay) { return ctTotals(day).map((t) => ({ ...t, by: [...t.by].join(", ") })); }
SHARE.count = (day) => {
  day = day || ctDay; const t = ctTable(day), got = t.filter((x) => x.done);
  if (!got.length) return null;
  const by = [...new Set(got.flatMap((x) => x.by.split(", ")))];
  return { title: `Stock count, ${ctDate(day)}`, head: [`Counted by ${by.join(", ")}`, `${got.length} of ${t.length} products counted`],
    parts: [{ id: "tot", label: "Totals", lines: got.map((x) => `${x.item}: ${ctSay(x.u, x.n)}${x.done < x.of ? " (not all places)" : ""}`) },
      { id: "not", label: "Not counted", off: true, lines: t.filter((x) => !x.done).map((x) => x.item) }],
    photos: async () => ctPictures(`Stock count, ${ctDate(day)}`, ["Item", "Count", "Unit", "Counted by"], got.map((x) => [x.item, ctNum(x.n), x.u, x.by])) };
};
SHARE.countuse = () => {
  const s = ctUsage(); if (!s?.rows?.length) return null;
  return { title: `Usage, ${ctDate(s.a)} to ${ctDate(s.b)}`, head: ["The count before, plus deliveries logged, less this count"],
    parts: [{ id: "flag", label: "Flagged", lines: s.rows.filter((x) => x.flag).map((x) => `${x.item}: ${ctSay(x.u, x.n)} (${x.flag})`) },
      { id: "all", label: "Usage", lines: s.rows.map((x) => `${x.item}: ${ctSay(x.u, x.n)}`) }],
    photos: async () => ctPictures(`Usage, ${ctDate(s.a)} to ${ctDate(s.b)}`, ["Item", "Used", "Unit", "In", "Flag"], s.rows.map((x) => [x.item, ctNum(x.n), x.u, x.got ? ctNum(x.got) : "", x.flag])) };
};
LINKS.count = () => "#at=count"; LINKS.countuse = () => "#at=count";
// The table as pictures, 40 rows each, for WhatsApp.
function ctPictures(title, head, rows) {
  const per = 40, pages = Math.max(1, Math.ceil(rows.length / per)), out = [];
  for (let p = 0; p < pages; p++) {
    const rs = rows.slice(p * per, p * per + per), c = document.createElement("canvas"), W = 1080, R = 44, top = 130;
    c.width = W; c.height = top + R * (rs.length + 1) + 40;
    const g = c.getContext("2d"), cols = head.length === 4 ? [40, 560, 700, 840] : [40, 480, 600, 720, 820];
    g.fillStyle = "#fff"; g.fillRect(0, 0, W, c.height); g.fillStyle = "#111";
    g.font = "bold 40px -apple-system, Segoe UI, Roboto, sans-serif"; g.fillText(title, 40, 64);
    g.font = "26px -apple-system, Segoe UI, Roboto, sans-serif"; g.fillStyle = "#555"; g.fillText(`Bar Book${pages > 1 ? ` · page ${p + 1} of ${pages}` : ""}`, 40, 104);
    const cell = (t, x, y, w) => { let s = String(t); while (s.length > 1 && g.measureText(s).width > w) s = s.slice(0, -2) + "…"; g.fillText(s, x, y); };
    rs.concat([null]).forEach((_, i) => {
      const y = top + R * i; if (i % 2 === 0) { g.fillStyle = "#f2f2f2"; g.fillRect(24, y, W - 48, R); }
    });
    g.fillStyle = "#111"; g.font = "bold 26px -apple-system, Segoe UI, Roboto, sans-serif";
    head.forEach((h, j) => cell(h, cols[j], top + 30, (cols[j + 1] || W - 24) - cols[j] - 12));
    g.font = "26px -apple-system, Segoe UI, Roboto, sans-serif";
    rs.forEach((r, i) => r.forEach((v, j) => cell(v, cols[j], top + R * (i + 1) + 30, (cols[j + 1] || W - 24) - cols[j] - 12)));
    out.push({ data: c.toDataURL("image/png"), file: `stock-count-${p + 1}` });
  }
  return out;
}
// The spreadsheet: one row per product, with where it was and who counted it. Opens in Numbers, Excel or Sheets.
function ctCsv(day = ctDay) {
  const q = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const lines = [["Date", "Item", "Count", "Unit", "Where", "Counted by"], ...ctTable(day).map((t) => [day, t.item, t.done ? ctNum(t.n) : "", t.u, t.where.join("; "), t.by])];
  const ins = (LIVE.received || []).filter((x) => x.day === day);
  if (ins.length) lines.push([], ["Date", "Delivery in", "Count", "Unit", "", "Logged by"], ...ins.map((x) => [day, x.item, ctNum(x.qty / 100), x.unit, "", x.name]));
  return "﻿" + lines.map((l) => l.map(q).join(",")).join("\r\n");
}
function ctShareCsv() {
  const f = new File([ctCsv()], `stock-count-${ctDay}.csv`, { type: "text/csv" });
  let can = false; try { can = !!navigator.canShare?.({ files: [f] }); } catch {}
  if (can) return navigator.share({ files: [f], title: `Stock count ${ctDay}` }).catch(() => {});
  const a = document.createElement("a"); a.href = URL.createObjectURL(f); a.download = f.name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ---- Set up the count (managers): places in order, what's counted where and how, bottle weights ---- */
function ctSave(change, ok) {
  const s = JSON.parse(JSON.stringify(ctSetup())); change(s);
  track(LIVE.api.saveCountSetup(s), ok, "Not saved. Check the signal and try again");
}
function ctItemSet(s, r, f) {
  const o = s.items[r.item] || {};
  s.items[r.item] = { a: o.a?.length ? o.a : r.a, u: o.u || r.u, e: +o.e || 0, f: +o.f || 0, ml: +(o.ml ?? r.ml) || 0, pw: +o.pw || 0, off: o.off ?? r.off, ...f };
}
function ctSetupHtml() {
  const all = ctRows(true), areas = ctAreas(all), seen = new Set();
  return `<div class="sec">Set up the count</div>
    <p class="note">The places in the order you walk them, what's counted in each, in what, and bottle weights for weighing. Changes save straight away for everyone. A product kept in two places can be counted in both: its total adds them up.</p>
    <div class="actions"><button class="btn pri" id="ct-setup-done">Back to the count</button></div>
    <div class="mini">Places, in walking order</div>
    ${areas.map((a, i) => `<div class="tally-row" style="grid-template-columns:1fr auto auto auto"><div class="n">${esc(a)} <span class="s">${all.filter((r) => r.area === a).length}</span></div><button class="btn" data-ct-amove="${i}:-1" aria-label="Move ${esc(a)} up"${i ? "" : " disabled"}>↑</button><button class="btn" data-ct-amove="${i}:1" aria-label="Move ${esc(a)} down"${i < areas.length - 1 ? "" : " disabled"}>↓</button><button class="btn" data-ct-adrop="${esc(a)}"${all.some((r) => r.area === a) ? " disabled" : ""}>Remove</button></div>`).join("")}
    <div class="ltools"><input id="ct-anew" maxlength="40" placeholder="Add a place, like Keg room" aria-label="New place"><button class="btn" id="ct-aadd">Add</button></div>
    ${areas.map((a) => { const rs = all.filter((r) => r.area === a); return `<div class="sec">${esc(a)}</div>${rs.map((r, i) => {
      const k = `${a}|${r.item}`, open = ctSetOpen === k, first = !seen.has(r.item); seen.add(r.item);
      return `<details class="ct-set"${open ? " open" : ""} data-ct-sk="${esc(k)}"><summary><span>${esc(r.item)}</span><small>${r.off ? "not counted" : `${r.u}${r.u === "bottle" && ctWeighable(r) ? " · weights set" : ""}${r.a.length > 1 ? ` · also ${esc(r.a.filter((x) => x !== a).join(", "))}` : ""}`}</small></summary>${open ? `<div class="ct-sbody" data-ct-item="${esc(r.item)}" data-ct-area="${esc(a)}">
        <div class="actions"><button class="btn" data-ct-move="-1"${i ? "" : " disabled"}>↑ Up the shelf</button><button class="btn" data-ct-move="1"${i < rs.length - 1 ? "" : " disabled"}>↓ Down the shelf</button></div>
        <div class="two"><label class="fld">Counted in<select data-ct-f="u">${CT_UNITS.map((u) => `<option${u === r.u ? " selected" : ""}>${u}</option>`).join("")}</select></label>
        <label class="fld">Place<select data-ct-f="area">${areas.map((x) => `<option${x === a ? " selected" : ""}>${esc(x)}</option>`).join("")}</select></label></div>
        ${first ? `<label class="fld">Also counted in<select data-ct-f="also"><option value="">Nowhere else</option>${areas.filter((x) => x !== a).map((x) => `<option${r.a.includes(x) ? " selected" : ""}>${esc(x)}</option>`).join("")}</select></label>` : `<p class="s">Also counted in ${esc(r.a.filter((x) => x !== a).join(", "))}.</p>`}
        ${r.u === "bottle" ? ctWeightsHtml(r) : `<div class="two"><label class="fld">One portion or unit, grams <span class="s">(to weigh)</span><input inputmode="decimal" data-ct-f="pw" value="${r.pw || ""}"></label><label class="fld">Container, grams<input inputmode="decimal" data-ct-f="e" value="${r.e || ""}"></label></div>`}
        <label class="check"><input type="checkbox" data-ct-f="off"${r.off ? " checked" : ""}> Don't count this</label></div>` : ""}</details>`;
    }).join("")}`; }).join("")}`;
}

/* ---- Taps ---- */
document.addEventListener("click", (e) => { if (e.target.closest("[data-ct-open]")) { haptic(); ctPage(); } });
$("#sheet").addEventListener("click", (e) => {
  if (!$("#ct")) return;
  const t = (s) => e.target.closest(s);
  const sh = t("[data-ct-show]"); if (sh) { ctShow = sh.dataset.ctShow; store.set("ctShow", ctShow); ctClearFind(); return ctRender(); }
  if (t("[data-ct-lvl]")) { ctLvl = true; return ctRender(); }
  const rw = t("[data-ct-row]"); if (rw) { haptic(); const k = rw.dataset.ctRow; if (ctOpen === k && rw.classList.contains("ct-line")) { ctOpen = ""; return ctRender(); } return ctGo(k); }
  const jp = t("[data-ct-jump]"); if (jp) {
    // A place already counted is hidden under Not counted yet: going to it shows everything.
    const a = jp.dataset.ctJump; ctClearFind();
    if (ctShow === "todo" && ctRows().filter((r) => r.area === a).every(ctLine)) { ctShow = "all"; store.set("ctShow", ctShow); }
    ctRender(true); return document.getElementById(`ct-a-${ctSlug(a)}`)?.scrollIntoView({ block: "start" });
  }
  const r = ctOpen && ctRow(ctOpen), x = r && ctLine(r);
  const ad = t("[data-ct-add]"); if (ad && r) { haptic(); const d = +ad.dataset.ctAdd.split(":")[1]; ctPut(r, Math.max(0, (x?.full || 0) + d), x?.open || 0); return; }
  const lv = t("[data-ct-lv]"); if (lv && r) { haptic(); ctPut(r, x?.full || 0, +lv.dataset.ctLv * 10); return; }
  const st = t("[data-ct-set]"); if (st && r) { haptic(); const [f, o] = st.dataset.ctSet.split(":").map(Number); ctPut(r, f, o); return; }
  const dr = t("[data-ct-drop]"); if (dr && r) { track(LIVE.api.dropCountLine(ctId(ctDay, r.area, r.item)), null, "Not cleared. Try again"); return; }
  // Next: down the shelf from this one, past anything counted already when only what's left is showing.
  const nx = t("[data-ct-next]"); if (nx) {
    const rs = ctRows(), i = rs.findIndex((y) => y.key === nx.dataset.ctNext); if (i >= 0 && !ctLine(rs[i])) ctPut(rs[i], 0, 0);
    const n = rs.slice(i + 1).find((y) => ctShow !== "todo" || !ctLine(y)); ctClearFind();
    if (n) ctGo(n.key); else { ctOpen = ""; ctRender(); toast(rs.every(ctLine) ? "Everything's counted" : "That's the last one"); } return;
  }
  if (t("#ct-say-go")) return ctHear($("#ct-say").value);
  if (t("#ct-mic")) return ctMic();
  const ha = t("[data-ct-heard-area]"); if (ha) { ctHeard.key = ha.dataset.ctHeardArea; return ctRender(); }
  if (t("#ct-heard-ok") && ctHeard) { const hr = ctRow(ctHeard.key), v = hr && ctValue(hr, ctHeard); if (v) { ctPut(hr, v.full, v.open); toast(`${hr.item}: ${ctSay(hr.u, v.full + v.open / 100)}`); } ctHeard = null; ctClearFind(); ctRender(); $("#ct-say")?.focus(); return; }
  if (t("#ct-heard-no")) { ctHeard = null; return ctRender(); }
  if (t("#ct-csv")) return ctShareCsv();
  if (t("#ct-in-go")) {
    const v = $("#ct-in").value, p = ctParse(v), hr = p && ctRow(p.key);
    if (!hr || p.grams || !(p.n > 0)) return toast("Type what came in then how many, like Smirnoff 6");
    track(LIVE.api.addReceived({ day: ctDay, item: hr.item, unit: hr.u, qty: Math.round(p.n * 100) }), `${hr.item}: ${ctSay(hr.u, p.n)} in`, "Not saved. Check the signal and try again");
    $("#ct-in").value = ""; return;
  }
  const id = t("[data-ct-in-drop]"); if (id) return track(LIVE.api.dropReceived(id.dataset.ctInDrop), "Taken off", "Not taken off. Try again");
  if (t("#ct-use-go")) return ctUseLoad();
  // Setup
  if (t("#ct-setup")) { ctSetupOn = true; ctSetOpen = ""; ctRender(); $("#sheet").scrollTop = 0; return; }
  if (t("#ct-setup-done")) { ctSetupOn = false; ctRender(); $("#sheet").scrollTop = 0; return; }
  const ws = t("[data-ct-wsave]"); if (ws) {
    const box = ws.closest("[data-ct-w]"), v = (k) => +box.querySelector(`[data-ct-wf="${k}"]`).value || 0, e0 = v("e"), f0 = v("f"), ml = v("ml"), rr = ctRows(true).find((y) => y.item === ws.dataset.ctWsave);
    if (!(e0 > 0 && f0 > e0)) return toast("The unopened one has to weigh more than the empty one");
    return ctSave((s) => ctItemSet(s, rr, { e: e0, f: f0, ml }), `Weights saved for ${rr.item}`);
  }
  const am = t("[data-ct-amove]"); if (am) { const [i, d] = am.dataset.ctAmove.split(":").map(Number); return ctSave((s) => { const a = ctAreas(); [a[i], a[i + d]] = [a[i + d], a[i]]; s.areas = a; }); }
  const ax = t("[data-ct-adrop]"); if (ax) return ctSave((s) => { s.areas = ctAreas().filter((a) => a !== ax.dataset.ctAdrop); });
  if (t("#ct-aadd")) { const n = $("#ct-anew").value.trim(); if (!n) return; if (ctAreas().some((a) => a.toLowerCase() === n.toLowerCase())) return toast("That place is there already"); return ctSave((s) => { s.areas = [...ctAreas(), n]; }, `${n} added`); }
  const mv = t("[data-ct-move]"); if (mv) {
    const b = mv.closest("[data-ct-item]"), item = b.dataset.ctItem, area = b.dataset.ctArea, d = +mv.dataset.ctMove;
    return ctSave((s) => { const l = ctRows(true).filter((y) => y.area === area).map((y) => y.item), i = l.indexOf(item); [l[i], l[i + d]] = [l[i + d], l[i]]; s.order[area] = l; });
  }
});
$("#sheet").addEventListener("toggle", (e) => {
  // A redraw fires toggle on the details it replaced too, after they've gone: only the ones on the page count.
  const d = e.target; if (!$("#ct") || !d.matches?.("details") || !d.isConnected) return;
  if (d.id === "ct-in-box") ctInHtml.open = d.open;
  else if (d.id === "ct-tot-box") ctTotOpen = d.open;
  else if (d.id === "ct-how") store.set("ctHow", !d.open);
  else if (d.id === "ct-use-box") ctUseHtml.open = d.open;
  else if (d.dataset.ctSk) { if (d.open) { if (ctSetOpen !== d.dataset.ctSk) { ctSetOpen = d.dataset.ctSk; ctRender(); } } else if (ctSetOpen === d.dataset.ctSk) ctSetOpen = ""; }
}, true);
// The find box: the list narrows as it's typed, in every place. Count it shows once it reads as a count.
function ctClearFind() { ctQ = ""; const i = $("#ct-say"); if (i) i.value = ""; if ($("#ct-say-go")) $("#ct-say-go").hidden = true; }
$("#sheet").addEventListener("input", (e) => {
  if (e.target.id === "ct-say") {
    ctQ = e.target.value; $("#ct-say-go").hidden = !ctParse(ctQ);
    if (ctHeard) { ctHeard = null; $("#ct-heard-slot").innerHTML = ""; }
    return ctPaint();
  }
  const g = e.target.closest("[data-ct-g]"); if (!g) return;
  const r = ctRow(g.dataset.ctG), n = +g.value.replace(",", "."), w = r && ctWeigh(r, n);
  $("#ct-g-out").textContent = !w ? "" : r.u !== "bottle" ? `${ctSay(r.u, w.n)}` : n < r.e - 20 ? "Lighter than an empty one: check the scale reads 0 with nothing on it"
    : w.full ? "That's a sealed one: tap + under Full instead" : `Open bottle ${ctNum(w.open / 100)}${w.ml ? ` · ${w.ml} ml · ${ctNum(w.ml / 10)} cl` : ""}`;
  // Saved a moment after the typing stops, so Next straight after it never loses the weight.
  clearTimeout(ctWeighPut.t); ctWeighPut.t = setTimeout(() => ctWeighPut(g), 700);
});
// The grams on the scale onto the line: a bottle's open one, or how many of anything else. A sealed bottle on the scale
// goes on Full by its + instead, so a weight typed twice never counts it twice.
function ctWeighPut(el) {
  clearTimeout(ctWeighPut.t);
  const r = ctRow(el.dataset.ctG), n = +el.value.replace(",", "."), w = r && ctWeigh(r, n), x = r && ctLine(r);
  if (!w) return;
  if (r.u !== "bottle") return ctPut(r, Math.floor(w.n), (w.n % 1) * 100);
  if (!w.full && n >= r.e - 20 && (x?.open ?? -1) !== w.open) ctPut(r, x?.full || 0, w.open);
}
$("#sheet").addEventListener("change", (e) => {
  if (!$("#ct")) return;
  const el = e.target;
  if (el.id === "ct-day") { ctDay = el.value && el.value <= shiftDay() ? el.value : shiftDay(); ctOpen = ""; ctUse = null; el.blur(); return ctRender(); }
  if (el.id === "ct-type") { const r = ctRow(ctOpen), n = +el.value.replace(",", "."); el.blur(); if (r && n >= 0) ctPut(r, Math.floor(n + 1e-9), ((n + 1e-9) % 1) * 100); return ctRender(); }
  if (el.dataset.ctG) {
    ctWeighPut(el); el.blur(); return;
  }
  const f = el.dataset.ctF; if (!f) return;
  const b = el.closest("[data-ct-item]"), r = ctRows(true).find((y) => y.item === b.dataset.ctItem), area = b.dataset.ctArea; el.blur();
  ctSave((s) => {
    if (f === "u") ctItemSet(s, r, { u: el.value });
    if (f === "off") ctItemSet(s, r, { off: el.checked });
    if (f === "pw" || f === "e") ctItemSet(s, r, { [f]: +el.value.replace(",", ".") || 0 });
    if (f === "area") { ctItemSet(s, r, { a: [...new Set(r.a.map((x) => (x === area ? el.value : x)))] }); ctSetOpen = `${el.value}|${r.item}`; }
    if (f === "also") ctItemSet(s, r, { a: el.value ? [r.a[0], el.value] : [r.a[0]] });
  });
});
$("#sheet").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  if (e.target.id === "ct-say") {
    // A count (“Smirnoff 2.5”) goes to the check; just a name opens the best match.
    e.preventDefault(); const v = e.target.value;
    if (ctParse(v)) return ctHear(v);
    const f = ctFind(v, ctRows()); if (f?.length) { e.target.blur(); ctGo((f.find((r) => !ctLine(r)) || f[0]).key); } else if (v.trim()) ctHear(v);
  }
  if (e.target.id === "ct-in") { e.preventDefault(); $("#ct-in-go").click(); }
  if (e.target.id === "ct-anew") { e.preventDefault(); $("#ct-aadd").click(); }
});
// A change that waited for the typing is drawn once the box is left. Not straight away: a tap on a button takes the
// focus first, and redrawing then would swap the button out before the tap lands.
$("#sheet").addEventListener("focusout", () => setTimeout(() => { if (ctRender.later && ctShown() && !$("#ct").contains(document.activeElement)) ctRender(); }, 400));
