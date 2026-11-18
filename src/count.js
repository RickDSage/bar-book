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
  [/^Espresso beans$/, null, "bag"], [/ powder$|brine/, null, "tub"], [/^Salted caramel sauce$/, null, "bottle"],
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
  const k = (LIVE.items || []).find((x) => x.item === name);
  let [a, u, ml] = (k && !itStock(name) ? (k.side === "floor" && ["dairy", "fresh"].includes(k.kind) ? ["Shake station", "each"] : CT_KIND[k.kind]) : CT_GROUP[group]) || ["Store room", "each"], off = false;
  for (const [re, a2, u2, o] of CT_NAME) if (re.test(name)) { a = a2 || a; u = u2 || u; off = !!o; break; }
  return { a: [a].flat(), u, ml: u === "bottle" && !/sauce|Mayonnaise|Ketchup|Mustard/.test(name) ? ml || 700 : 0, off };
}
// A product's size and weights: what a manager set, else what's filled in (measures.js), marked as estimated.
// est: the weights are estimates nobody has checked. guess: the size isn't off the label.
const ctCl = (ml) => (ml % 10 ? `${ml} ml` : `${ml / 10} cl`);
// On screen a size shows in both: "70 cl · 700 ml". 1 cl = 10 ml. The cl ⇄ ml button swaps which leads (saved on this phone).
var ctMlFirst = store.get("ctMlFirst", false);
const ctVol = (ml) => { const cl = `${ctNum(ml / 10)} cl`, m = `${ml.toLocaleString("en-GB")} ml`; return ctMlFirst ? `${m} · ${cl}` : `${cl} · ${m}`; };
const ctSz = (r) => (r.ml && r.size ? ctVol(r.ml) : r.size || "");
// A typed size in either: "70 cl", "700ml", "1 litre", "0.7l". A bare number up to 150 is cl (a magnum is 150 cl), above that ml.
function ctParseMl(t) {
  const m = String(t).trim().toLowerCase().replace(",", ".").match(/^(\d+(?:\.\d+)?)\s*(ml|cl|l|litres?|liters?)?$/);
  if (!m) return 0;
  const n = +m[1], u = m[2] || (n <= 150 ? "cl" : "ml");
  return Math.round(u === "ml" ? n : u === "cl" ? n * 10 : n * 1000);
}
function ctMeasure(item, u, o, d) {
  const m = CT_BOTTLE[item], p = CT_PACK[item], set = +o.e > 0 && +o.f > +o.e;
  if (u === "bottle") {
    const ml = +o.ml || (m ? m[0] : d.ml), dn = m ? m[2] : 0.95;
    return { u, ml, dn, e: set ? +o.e : m ? m[1] : 0, f: set ? +o.f : m ? ctFullG(ml, m[1], dn) : 0, pw: +o.pw || 0, est: !set && !!m, lock: set, wb: o.wb || "", wd: o.wd || "", size: m || +o.ml ? ctCl(ml) : "", guess: !!m && !m[3] && !+o.ml };
  }
  const pw = +o.pw || (p ? p[1] : 0);
  return { u, ml: 0, dn: 1, e: +o.pw ? +o.e || 0 : p ? p[2] : 0, f: 0, pw, est: !+o.pw && !!p?.[1], lock: !!+o.pw, wb: o.wb || "", wd: o.wd || "", size: p ? p[0] : "", guess: !!p && !p[3] };
}
// Every line of the count in shelf order: one per product and place (a product kept in two places has two lines, and
// its total adds them up). all includes the ones not counted, for the setup.
function ctRows(all) {
  const s = ctSetup(), out = [];
  let i = 0;
  // Something added mid-count is counted straight away, while it waits for Maintenance to check it.
  const groups = stockGroups();
  for (const x of LIVE.items || []) if (x.status === "waiting" && !itStock(x.item) && !Object.values(groups).some((ys) => ys.includes(x.item))) (groups[x.group] = groups[x.group] || []).push(x.item);
  for (const [g, xs] of Object.entries(groups)) for (const item of xs) {
    const d = ctDefault(item, g), o = s.items[item] || {};
    const r = { item, group: g, i: i++, a: o.a?.length ? o.a : d.a, off: o.off ?? d.off, low: +o.low || 0, ...ctMeasure(item, o.u || d.u, o, d) };
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
    const t = out.get(r.item) || { item: r.item, u: r.u, n: 0, done: 0, of: 0, where: [], by: new Set(), ml: r.ml, size: r.size, low: r.low };
    const x = lines.find((y) => y.day === day && y.area === r.area && y.item === r.item);
    t.of++; if (x) { t.done++; t.n += ctQty(x); t.where.push(`${r.area} ${ctNum(ctQty(x))}`); t.by.add(x.name); }
    out.set(r.item, t);
  }
  return [...out.values()];
}
// Counted in every place and under its running-low level.
const ctIsLow = (t) => t.low > 0 && t.done === t.of && t.n < t.low;

/* ---- Running low: a heads-up before it's an 86 ----
   A manager gives a product a level, in what it's counted in ("Running low below 2 bottles"). Its total from the
   latest count that counted it in every place, plus deliveries logged since, below that level is running low. It shows
   on the 86 board, the bar station, Needs you now, the count, the handover and the morning's order. Something already
   86'd is on the 86 board instead, so it's never listed twice. Nothing is saved: it's worked out from the count. */
var ctLowMemo = null;
function lowNow() {
  if (!LIVE.me || !LIVE.lowLines?.length) return [];
  const k = [LIVE.lowLines, LIVE.countSetup, LIVE.received, LIVE.out, LIVE.items];
  if (ctLowMemo && ctLowMemo.k.every((x, i) => x === k[i])) return ctLowMemo.v;
  const rows = ctRows().filter((r) => r.low > 0), out = [];
  for (const item of new Set(rows.map((r) => r.item))) {
    if (LIVE.out.has(item)) continue;
    const places = rows.filter((r) => r.item === item), ls = (LIVE.lowLines || []).filter((x) => x.item === item && places.some((r) => r.area === x.area));
    const day = [...new Set(ls.map((x) => x.day))].sort().reverse().find((d) => places.every((r) => ls.some((x) => x.day === d && x.area === r.area)));
    if (!day) continue;
    const got = (LIVE.received || []).filter((x) => x.item === item && x.day > day).reduce((n, x) => n + x.qty / 100, 0);
    const n = ls.filter((x) => x.day === day).reduce((t, x) => t + ctQty(x), 0) + got, r = places[0];
    if (n < r.low) out.push({ item, n, u: r.u, low: r.low, day, got });
  }
  const v = out.sort((a, b) => a.n / a.low - b.n / b.low || a.item.localeCompare(b.item));
  ctLowMemo = { k, v };
  return v;
}
function lowSay(x) { return `${ctSay(x.u, x.n)} left, low below ${ctSay(x.u, x.low)}`; }
// On the 86 board and the bar station: what's running low, each with 86 it for when it runs out.
function lowHtml(btn) {
  const xs = lowNow(); if (!xs.length) return "";
  return `<div class="sec">Running low</div><p class="note">From the latest stock count. Not out yet: 86 it when it runs out.</p>
    ${xs.map((x) => `<div class="tally-row low-row" style="grid-template-columns:1fr auto"><div class="n" translate="no">${esc(x.item)}<div class="s">${lowSay(x)} · counted ${esc(dayName(x.day))}${x.got ? `, ${ctNum(x.got)} in since` : ""}</div></div>${btn(x.item)}</div>`).join("")}`;
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
// The page: a find-or-count box that stays at the top while the list scrolls, then the list. Phones get the lean
// version (one row of places that scrolls sideways, the totals folded away, the bottle level behind one tap when the
// scale can do it); the iPad gets everything open side by side.
const ctWide = () => matchMedia("(min-width: 700px)").matches;
var ctQ = "", ctShow = store.get("ctShow", "todo"), ctBy = store.get("ctBy", store.get("ctAz", false) ? "az" : "place"), ctTotOpen = null;
// The order to walk it: by place (the shelves, the default), by kind (all the vodkas, then the gins, wherever they are),
// or A to Z. Next goes down whichever is showing.
const ctSecOf = (r) => (ctBy === "kind" ? r.group : r.area);
function ctOrdered(rows = ctRows()) {
  if (ctBy === "az") return azSort(rows, (r) => r.item);
  if (ctBy === "kind") { const gs = Object.keys(stockGroups()); return [...rows].sort((a, b) => (gs.indexOf(a.group) + 1 || 99) - (gs.indexOf(b.group) + 1 || 99)); }
  return rows;
}
function ctPage() {
  ctDay = ctDay || shiftDay(); ctHeard = null; ctSetupOn = false; ctQ = "";
  if (ctIntro < 0 && !store.get("ctHow", false)) ctIntro = 0;
  const speech = !!(window.SpeechRecognition || window.webkitSpeechRecognition), cam = !!navigator.mediaDevices?.getUserMedia;
  $("#v-count").innerHTML = `<div class="shift-top"><h2>Stock</h2><span class="s">Count, scan, use-by</span></div>
    <div class="ct-find" id="ct-find"><div class="ltools"><span class="ct-q"><span aria-hidden="true">⌕</span><input id="ct-say" type="search" enterkeyhint="go" maxlength="80" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="Find, or say “Smirnoff 2.5”" aria-label="Find an item, or say or type a count, or type a barcode"></span>${cam ? `<button class="btn" id="ct-scan" aria-label="Scan a barcode">📷<span class="ct-bl"> Scan</span></button>` : ""}${speech ? `<button class="btn" id="ct-mic" aria-label="Say a count">🎤<span class="ct-bl"> Say it</span></button>` : ""}<button class="btn pri" id="ct-say-go" hidden>Count it</button></div>
    <div id="ct-heard-slot"></div><div id="ct-undo-slot" aria-live="polite"></div></div><div id="ct"></div>`;
  ctRender(true);
}
// The Stock tab: off the team it says how to join; on it, the count book.
function renderStock() {
  if (!LIVE.me) { $("#v-count").innerHTML = `<div class="shift-top"><h2>Stock</h2></div><p class="note">The stock count, the barcode scanner and use-by dates are for the team. Join with the team code on the Team tab.</p>`; return; }
  if (!$("#ct")) ctPage(); else ctRender();
}
const ctShown = () => cur === "count" && !!$("#ct");
// A change from another phone waits while a number is being typed on a line here. force redraws anyway (this phone's
// own action), keeping the box being typed in. Typing in the find box never waits: it sits above the list.
function ctRender(force) {
  if (!ctShown()) return;
  LIVE.api.watchCount(ctDay);
  const el = $("#ct"), ae = document.activeElement, typing = el.contains(ae) && ae.matches("input, select");
  const top = $("#ct-find"); if (top) top.hidden = ctSetupOn || ctIntro >= 0;
  if ($("#ct-mic")) $("#ct-mic").innerHTML = ctRx ? "Listening…" : `🎤<span class="ct-bl"> Say it</span>`;
  if ($("#ct-heard-slot")) $("#ct-heard-slot").innerHTML = ctSetupOn ? "" : ctHeardHtml();
  ctUndoShow();
  if (typing && !force) { ctRender.later = true; return; }
  ctRender.later = false;
  el.innerHTML = ctSetupOn ? ctSetupHtml() : ctIntro >= 0 ? ctIntroHtml() : ctHtml();
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
  ctPrevLoad();
  const rows = ctRows(), tot = ctTotals(), done = rows.filter(ctLine).length, by = [...new Set(ctLines().map((x) => x.name))], wide = ctWide();
  const pend = ctLines().filter((x) => x.pending).length, odds = ctOdds();
  const oddBox = odds.length ? `<div class="ct-odd" id="ct-odd"><p class="s"><b>Worth a second look (${odds.length})</b>: far from the last count. Tap one, count it again, or tap It's right.</p><div class="recent">${odds.map((r) => `<button class="chip" data-ct-row="${esc(r.key)}">${esc(r.item)} <small>${esc(r.area)}</small></button>`).join("")}</div></div>` : "";
  return `${ctScanHtml()}${ctCodesHtml()}${ctUseByHtml()}<div class="ct-head">${rows.length && done === rows.length ? `<p class="note ct-fin">✓ <b>All ${rows.length} lines counted.</b> ${odds.length ? `${odds.length} worth a second look, then send` : "Check the totals, then send"} them at the bottom.</p>` : ""}<p class="s"><b>${done} of ${rows.length} lines counted</b>${by.length ? ` by ${esc(by.join(", "))}` : ""}. ${pend ? `<b>${pend} on this phone, sending when there's signal</b>: keep counting.` : "Everything's saved, on any phone."}</p>${oddBox}
      <div class="ct-bar" aria-hidden="true"><i style="width:${rows.length ? Math.round((done / rows.length) * 100) : 0}%"></i></div>
      <div class="ct-hrow"><label class="ct-day">Count for <input type="date" id="ct-day" value="${ctDay}" max="${shiftDay()}"></label><button class="btn ct-howbtn" data-ct-intro="0">How to count</button><button class="btn ct-unit" data-ct-unit aria-label="Swap cl and ml">${ctMlFirst ? "ml ⇄ cl" : "cl ⇄ ml"}</button></div>${ctTipsHtml()}</div>
    <div id="ct-list">${ctListHtml()}</div>
    <details class="setup" id="ct-tot-box"${ctTotOpen ?? wide ? " open" : ""}><summary>Totals so far${tot.some((t) => t.done) ? ` (${tot.filter((t) => t.done).length})` : ""}</summary>
      <p class="note">Each product added up across its places, for typing into Nory.</p>
      <div class="ct-tot">${tot.filter((t) => t.done).map((t) => `<div${ctIsLow(t) ? ' class="flag"' : ""}><span>${esc(t.item)}${ctIsLow(t) ? `<small>Running low: below ${ctSay(t.u, t.low)}</small>` : ""}</span><b>${ctSay(t.u, t.n)}${t.done < t.of ? " <small>(not all places)</small>" : ""}</b></div>`).join("") || `<p class="note">Nothing counted yet.</p>`}</div></details>
    <div class="actions">${sendBtn("count", "Send on WhatsApp", ctDay)}<button class="btn" id="ct-csv">Spreadsheet (Numbers, Excel)</button></div>
    ${ctInHtml()}${ctUseHtml()}
    ${LIVE.admin ? `<div class="actions"><button class="btn" id="ct-setup">Set up the count</button></div>` : ""}
    <div class="sec">Something new</div>${itemsHtml(mode)}`;
}
// Not counted yet, everything, or what's been counted; By place (the order you walk it, with the places to jump to) or
// A to Z (the letter strip down the side, for finding one thing); and the lines. A search looks in every place.
var ctLowSet = new Set();
function ctListHtml() {
  ctLowSet = new Set(ctTotals().filter(ctIsLow).map((t) => t.item));
  const rows = ctOrdered(), areas = [...new Set(rows.map(ctSecOf))], found = ctQ.trim() ? ctFind(ctQ, rows) : null;
  const todo = rows.filter((r) => !ctLine(r)).length;
  const show = (r) => r.key === ctOpen || ctShow === "all" || (ctShow === "todo" ? !ctLine(r) : !!ctLine(r));
  const chip = (k, label, n) => `<button class="chip" data-ct-show="${k}" aria-pressed="${!found && ctShow === k}">${label}${n != null ? ` <small>${n}</small>` : ""}</button>`;
  const head = `<div class="recent ct-show">${chip("todo", "Not counted yet", todo)}${chip("all", "All", rows.length)}${chip("done", "Counted", rows.length - todo)}</div>
    <div class="seg ct-order" role="group" aria-label="Order">${[["place", "By place"], ["kind", "By kind"], ["az", "A to Z"]].map(([k, l]) => `<button data-ct-by="${k}" aria-pressed="${ctBy === k}">${l}</button>`).join("")}</div>
    ${ctBy === "az" ? "" : `<div class="recent ct-jump" role="group" aria-label="Go to a ${ctBy === "kind" ? "kind" : "place"}">${areas.map((a) => { const rs = rows.filter((r) => ctSecOf(r) === a), n = rs.filter(ctLine).length; return `<button class="chip${n === rs.length ? " full" : ""}" data-ct-jump="${esc(a)}">${esc(a)} <small>${n === rs.length ? "✓" : `${n}/${rs.length}`}</small></button>`; }).join("")}</div>`}`;
  if (found) return `${head}<div class="sec">${found.length ? `Found in ${[...new Set(found.map((r) => r.area))].length === 1 ? esc(found[0].area) : "every place"}` : "Nothing found"}</div>
    ${found.map((r) => ctRowHtml(r, true)).join("") || (ctIsCode(ctQ) ? `<p class="note">That's a barcode. Press Go to look it up.</p>` : `<p class="note">Nothing called “${esc(ctQ.trim())}”. Try fewer letters, or 📷 scan it.</p><div class="actions"><button class="btn pri" data-ct-new="${esc(ctQ.trim().slice(0, 60))}">＋ Add “${esc(ctQ.trim().slice(0, 40))}” and count it</button></div>`)}`;
  const body = ctBy === "az" ? azHtml(rows.filter(show), (r) => r.item, (r) => ctRowHtml(r, true)) : areas.map((a) => { const rs = rows.filter((r) => ctSecOf(r) === a && show(r)); return `<i class="anc" id="ct-a-${ctSlug(a)}"></i>${rs.length ? `<div class="sec">${esc(a)}</div>${rs.map((r) => ctRowHtml(r, ctBy === "kind")).join("")}` : ""}`; }).join("");
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
// What to do with a line, in a few words, for anyone counting for the first time.
function ctDo(r) {
  if (r.u === "bottle") return "Full ones, then the open one: None, ¼, ½ or ¾";
  const u = r.u === "each" ? "them" : `the ${ctUnit(r.u, 2).trim()}`;
  return `Count ${u}${r.pw > 0 ? " or weigh them" : ""}${r.size ? `: one is a ${ctSz(r)}` : ""}`;
}
function ctRowHtml(r, where) {
  const x = ctLine(r), on = ctOpen === r.key;
  return `<div class="ct-row${on ? " on" : ""}${x ? " done" : ""}" id="ct-r-${ctSlug(r.key)}"><button class="ct-line" data-ct-row="${esc(r.key)}" aria-expanded="${on}"><i class="ct-dot" aria-hidden="true"></i><span>${esc(r.item)}${where ? `<small>${esc(r.area)}</small>` : ""}${x ? "" : `<small class="ct-do">${esc(ctDo(r))}</small>`}</span><b>${x ? ctSay(r.u, ctQty(x)) : ""}${x && ctOdd(r, x) ? `<small class="ct-chk">Check it</small>` : ""}${ctLowSet.has(r.item) ? `<small class="ct-low">Running low</small>` : ""}</b>${x ? `<small class="by">${esc(x.name)}</small>` : ""}</button>${on ? ctEditHtml(r, x) : ""}</div>`;
}
// Next: down the list as it shows (by place, by kind or A to Z), past anything counted already when only what's left is
// showing. Left blank, Next saves it as none. soon: after a line's last tap, a moment to see it saved first.
function ctNext(key, soon) {
  const go = () => {
    const rs = ctOrdered(), i = rs.findIndex((y) => y.key === key); if (i >= 0 && !soon && !ctLine(rs[i])) ctPut(rs[i], 0, 0);
    const n = rs.slice(i + 1).find((y) => ctShow !== "todo" || (!ctLine(y) && y.key !== key)); ctClearFind();
    if (ctOpen !== key) return;
    if (n) ctGo(n.key); else { ctOpen = ""; ctRender(); toast(rs.every((y) => ctLine(y) || y.key === key) ? "Everything's counted" : "That's the last one"); }
  };
  if (soon) setTimeout(go, 350); else go();
}
/* ---- Photo check: the open bottle beside a sealed one, to judge the level by eye ----
   Only a picture to compare: the counter still taps the level. Their own photo stays on the phone and goes when the
   line is left. The sealed one is kept once per product for everyone (countPhotos/{product}): anyone takes the first,
   and a manager can take a better one. */
var ctPh = null;
const ctPhotoBtn = (r) => `<label class="btn" for="ct-ph-in">📷 Photo check</label><input type="file" accept="image/*" capture="environment" id="ct-ph-in" data-ct-ph="${esc(r.item)}" hidden>`;
function ctPhotoHtml(r) {
  const p = ctPh?.item === r.item ? ctPh : null; if (!p) return "";
  const can = p.ref === null || LIVE.admin;
  const ref = p.ref === undefined ? `<p class="s">Getting the sealed one…</p>` : p.ref ? `<img src="${p.ref}" alt="A sealed ${esc(r.item)}">` : `<p class="s">No photo of a sealed ${esc(r.item)} yet.</p>`;
  return `<div class="ct-phc"><figure><figcaption>Yours</figcaption>${p.mine ? `<img src="${p.mine}" alt="Your photo of the open bottle">` : ""}</figure><figure><figcaption>Sealed</figcaption>${ref}</figure></div>
    <p class="s">Compare the two, then tap the level.${can ? ` <label class="linkbtn" for="ct-ref-in">${p.ref ? "Take a better sealed one" : "Take one of a sealed bottle"}</label><input type="file" accept="image/*" capture="environment" id="ct-ref-in" data-ct-ref="${esc(r.item)}" hidden>` : ""}</p>`;
}
async function ctPhoto(el) {
  const item = el.dataset.ctPh || el.dataset.ctRef, f = el.files[0]; el.value = ""; if (!f) return;
  const data = await shrink(f).catch(() => null); if (!data) return toast("Couldn't read that photo");
  if (el.dataset.ctRef) {
    track(LIVE.api.countPhoto(ctSlug(item), item, data), `Sealed ${item} kept for everyone`, "Not saved. Check the signal and try again");
    if (ctPh?.item === item) ctPh.ref = data; return ctRender(true);
  }
  ctPh = { item, mine: data, ref: undefined }; ctRender(true);
  const d = await LIVE.api.loadCountPhoto(ctSlug(item)).catch(() => null);
  if (ctPh?.item === item && ctPh.ref === undefined) { ctPh.ref = d?.data || null; ctRender(true); }
}

// Added mid-count: its line opens to count straight away, while it waits for Maintenance to check it.
function ctAdded(item) {
  setTimeout(() => { const r = ctRows().find((y) => y.item === item); if (!r || !ctShown()) return; ctClearFind(); if (ctShow === "done") { ctShow = "todo"; store.set("ctShow", ctShow); } ctGo(r.key); toast(`${item} is on the count: count it now`); }, 400);
}
// The last count before this one, read once, for Same as last time.
var ctPrev = null, ctPrevFor = "";
function ctPrevLoad() {
  if (ctPrevFor === ctDay || !LIVE.api?.prevCount) return; ctPrevFor = ctDay; ctPrev = null;
  const d = ctDay; LIVE.api.prevCount(d).then((p) => { if (ctDay === d) { ctPrev = p; ctRender(); } }).catch(() => { ctPrevFor = ""; });
}
const ctPrevOf = (r) => ctPrev?.lines.find((x) => x.area === r.area && x.item === r.item && x.unit === r.u) || null;
// The line being counted, one way through: the full ones, then the open one (weighed if the scale can, else its
// level), then Next. Big buttons for wet hands.
function ctEditHtml(r, x) {
  // Compact: everything for a normal count fits in a few lines, so several items show at once. The rest (tenths, the
  // bottle picture, Photo check, the scale, None left, levels) is behind More, which stays open on this phone once
  // it's opened, for anyone who always weighs.
  const full = x?.full || 0, open = x?.open || 0, can = ctWeighable(r), b = r.u === "bottle";
  const p = !x && ctPrevOf(r), same = p ? `<button class="btn ct-same" data-ct-same>Same as last time: ${ctSay(r.u, ctQty(p))} <small>${ctDate(ctPrev.day)}</small></button>` : "";
  const step = `<div class="ct-step"><span>${b ? `Full${r.size ? `<small>${esc(ctSz(r)).replace(" · ", "<br>")}</small>` : ""}` : `How many${ctUnit(r.u, 2)}`}</span><button class="ct-big" data-ct-add="full:-1" aria-label="One less">−</button><b>${full}</b><button class="ct-big" data-ct-add="full:1" aria-label="One more">+</button><button class="ct-big ct-six" data-ct-add="full:6" aria-label="Six more">+6</button></div>`;
  const chip = (v, l) => `<button class="ct-qb${x && open === v ? " on" : ""}" data-ct-lvp="${v}" aria-label="Open one ${l}">${l}</button>`;
  const quick = b ? `<div class="ct-quick"><span>Open</span>${chip(0, "None")}${chip(25, "¼")}${chip(50, "½")}${chip(75, "¾")}</div>`
    : `<div class="ct-quick ct-typed"><label>Or type<input id="ct-type" inputmode="decimal" enterkeyhint="next" value="${x ? ctNum(ctQty(x)) : ""}" placeholder="0" aria-label="How many, half is .5"></label><button class="btn" data-ct-next="${esc(r.key)}">${x ? "Next ›" : "Done ›"}</button></div>`;
  const tenths = b ? `<p class="ct-n">The open one in tenths</p><div class="ct-tenths">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => chip(k * 10, `.${k}`)).join("")}</div>` : "";
  const lowSet = LIVE.admin ? `<div class="ct-lowset" data-ct-item="${esc(r.item)}" data-ct-area="${esc(r.area)}">${ctLowField(r)}</div>` : "";
  const weigh = can ? ctWeighHtml(r) : b ? `<p class="s">No weights for ${esc(r.item)} yet.${LIVE.admin ? "" : " A manager sets them once, in Set up the count."}</p>${LIVE.admin ? `<details class="ct-wbox"><summary>Set its weights, to weigh it next time</summary>${ctWeightsHtml(r)}</details>` : ""}` : "";
  const one = r.size && !b ? `<p class="s ct-size">One is a ${esc(ctSz(r))}${r.guess ? " (the usual size: a manager can change it)" : ""}.</p>` : "";
  const more = `<details class="ct-more" id="ct-more"${ctMoreOn ? " open" : ""}><summary>More: ${b ? "tenths, photo check, weigh it" : "weigh it"}, none left${LIVE.admin ? ", levels" : ""}</summary>
    ${one}${tenths}${b ? `<div class="ct-open">${ctBottle(open)}<div><span>Or tap the bottle</span>${ctPhotoBtn(r)}</div></div>${ctPhotoHtml(r)}` : ""}
    ${weigh}${lowSet}<div class="actions"><button class="btn" data-ct-set="0:0">None left</button>${x ? `<button class="btn" data-ct-drop="${esc(r.key)}">Clear</button>` : ""}${b ? `<button class="btn" data-ct-next="${esc(r.key)}">Next ›</button>` : ""}</div></details>`;
  const odd = x && ctOdd(r, x), chk = odd ? `<p class="note warnline ct-oddn">${esc(odd)}. Count it again, or <button class="linkbtn" data-ct-ok>It's right</button></p>` : "";
  return `<div class="ct-edit ct-c">${chk}${same}${step}${quick}${ctSumLine(r, x)}${more}</div>`;
}
// What the line adds up to, in bottles and in ml: a worked example until it's counted.
const ctLitres = (ml) => `${ctVol(ml)}${ml >= 1000 ? ` (${ctNum(ml / 1000)} litres)` : ""}`;
function ctSumLine(r, x) {
  if (r.u !== "bottle") return x ? `<p class="ct-sum">Total here: <b>${ctSay(r.u, ctQty(x))}</b></p>` : "";
  const full = x ? x.full : 3, open = x ? x.open : 40, n = full + open / 100, ml = r.ml ? Math.round(n * r.ml) : 0;
  const t = `${full} full + ${open ? ctNum(open / 100) : "no"} open = <b>${ctNum(n)} bottle${n === 1 ? "" : "s"}</b>${ml ? `${r.size ? ` of ${esc(ctSz(r))}` : ""} = ${ctLitres(ml)}` : ""}`;
  return `<p class="ct-sum${x ? "" : " ct-eg"}">${x ? t : `For example: ${t}`}</p>`;
}
var ctMoreOn = store.get("ctMore", false);
// Managers: the product's levels, in what it's counted in, all places together. Running low below: the heads-up before
// an 86. Par: what the order draft orders back up to. Blank is off.
const ctLowField = (r) => `<div class="two"><label class="fld">Running low below <span class="s">(${ctUnit(r.u, 2).trim() || "how many"})</span><input inputmode="decimal" data-ct-f="low" value="${r.low || ""}" placeholder="Off"></label><label class="fld">Par: order up to<input inputmode="decimal" data-ct-f="par" value="${ctSetup().items[r.item]?.par ?? ""}" placeholder="Off"></label></div>`;
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
  const est = r.est ? ` Weights estimated.${LIVE.admin ? "" : " A manager can check them."}` : r.lock ? ` ${ctLockSay(r)}` : " Weights checked.";
  return `<label class="fld ct-g">${b ? "On the scale, grams (pourer off)" : `Or weigh them, grams (one is ${r.pw} g${r.e ? `, the packaging ${r.e} g` : ""})`}<input id="ct-g" inputmode="decimal" enterkeyhint="done" data-ct-g="${esc(r.key)}" placeholder="Grams"></label><p class="s" id="ct-g-out">${b ? `${ctSz(r)}: empty ${r.e} g, full ${r.f} g. A sealed one goes on Full.` : ""}</p><p class="s ct-est">${est.trim()}</p>${LIVE.admin && (r.est || ctOpenLock(r)) ? ctCheckHtml(r) : LIVE.admin && r.lock ? ctUnlockBtn(r) : ""}`;
}
// Weighed by a manager: locked until the next re-weigh, which takes a deliberate Unlock first, so nobody changes it by
// accident. The lock is the weights a manager saved; Unlock only opens it on this phone until the new ones are saved.
var ctUnlocked = new Set();
const ctOpenLock = (r) => r.lock && ctUnlocked.has(r.item);
const ctLockSay = (r) => `🔒 Locked: weighed${r.wb ? ` by ${esc(r.wb)}` : ""}${r.wd ? `, ${ctDate(r.wd)}` : ""}.`;
const ctUnlockBtn = (r) => `<div class="actions"><button class="btn ct-unlock" data-ct-unlock="${esc(r.item)}">Unlock to re-weigh</button></div>`;
// Every save of weights: who weighed it and when, and it locks again.
const ctWeighed = (x) => ({ ...x, wb: LIVE.me || "", wd: shiftDay() });
// A manager checking the estimate: a sealed bottle on the scale is enough, as the empty one is that less what's in it.
function ctCheckHtml(r) {
  return `<details class="ct-wbox"${ctOpenLock(r) ? " open" : ""}><summary>${ctOpenLock(r) ? "Re-weigh: a sealed one" : "Check it: weigh a sealed one"}</summary><div class="ct-w"><div class="ltools"><input inputmode="decimal" data-ct-chk="${esc(r.item)}" placeholder="Sealed ${esc(r.item)}, grams" aria-label="Sealed bottle, grams"><button class="btn" data-ct-chkgo="${esc(r.item)}">Save</button></div>
    <p class="s">${r.u === "bottle" ? `${ctSz(r)} of it weighs ${Math.round(r.ml * r.dn)} g, so the empty bottle is the rest.` : ""} Saves for everyone. Set up the count has both weights.</p></div></details>`;
}
// A manager setting a bottle's weights: weigh an empty one and an unopened one once. Not 1 g = 1 ml: a liqueur is
// heavier than a spirit, so the two weights are what make it right. Filled in already; estimates say so.
function ctWeightsHtml(r) {
  if (r.lock && !ctUnlocked.has(r.item)) return `<div class="ct-w"><p class="s">${ctLockSay(r)} Empty ${r.e} g, full ${r.f} g${r.ml ? `, ${r.ml} ml` : ""}.</p>${ctUnlockBtn(r)}</div>`;
  return `<div class="ct-w" data-ct-w="${esc(r.item)}"><p class="s">${r.est ? `Filled in with estimates for a ${ctSz(r)} bottle${r.guess ? " (usual size: check yours)" : ""}. Weigh yours to make them exact: ` : ""}an empty ${esc(r.item)} bottle (rinsed, pourer off) and an unopened one.</p>
    <div class="two"><label class="fld">Empty, grams<input inputmode="decimal" data-ct-wf="e" value="${r.e || ""}"></label><label class="fld">Unopened, grams<input inputmode="decimal" data-ct-wf="f" value="${r.f || ""}"></label></div>
    <label class="fld">Bottle size: 70 cl or 700 ml<input inputmode="decimal" data-ct-wf="ml" value="${r.ml ? ctCl(r.ml) : ""}" placeholder="70 cl"></label><div class="actions"><button class="btn" data-ct-wsave="${esc(r.item)}">Save the weights</button></div></div>`;
}
function ctPut(r, full, open) {
  full = Math.max(0, Math.min(9999, Math.round(full))); open = Math.max(0, Math.min(99, Math.round(open)));
  ctBefore(r);
  track(LIVE.api.countLine(ctId(ctDay, r.area, r.item), { day: ctDay, area: r.area, item: r.item, unit: r.u, full, open }), null, "Not saved. Check the signal and try again");
}
const ctRow = (key) => ctRows().find((r) => r.key === key);
function ctDrop(r) { ctBefore(r); track(LIVE.api.dropCountLine(ctId(ctDay, r.area, r.item)), null, "Not cleared. Try again"); }

/* ---- Stronger: one-tap Undo, two people on one line, what's still sending, and a second look ----
   Every line saves on its own, on the phone first, so a count survives no signal, a closed app or a flat battery, and
   carries on from any phone. Under Find: the last change on this phone, whether it has reached the server, and Undo,
   which puts the line back to what it was before (taps on one line in a row undo together). */
const CT_UNDO_S = 12;
var ctUndo = null, ctWarned = new Set();
function ctBefore(r) {
  const x = ctLine(r);
  // Taps on one line in a row undo together, unless someone else changed it in between.
  if (!(ctUndo && ctUndo.key === r.key && ctUndo.day === ctDay && Date.now() - ctUndo.t < CT_UNDO_S * 1e3 && (!x || x.uid === LIVE.uid)))
    ctUndo = { key: r.key, day: ctDay, area: r.area, item: r.item, u: r.u, prev: x ? { full: x.full, open: x.open } : null };
  ctUndo.t = Date.now();
  // Two people on the same line: the newest count stands, and whoever replaces someone else's is told once.
  if (x && x.uid && x.uid !== LIVE.uid && !ctWarned.has(r.key)) { ctWarned.add(r.key); toast(`${x.name} had ${ctSay(r.u, ctQty(x))}. Yours replaces it: Undo puts theirs back`); }
}
function ctUndoHtml() {
  const u = ctUndo; if (!u || u.day !== ctDay || Date.now() - u.t > CT_UNDO_S * 1e3) return "";
  const x = ctLines().find((y) => y.area === u.area && y.item === u.item);
  return `<p class="ct-undo"><span>${x?.pending ? "⏳" : "✓"} <b>${esc(u.item)}</b> ${x ? ctSay(u.u, ctQty(x)) : "not counted"}${x?.pending ? ", on this phone: it sends when there's signal" : ", saved"}</span><button class="btn" data-ct-undo>↩ Undo</button></p>`;
}
function ctUndoShow() {
  const s = $("#ct-undo-slot"); if (s) s.innerHTML = ctSetupOn || ctIntro >= 0 ? "" : ctUndoHtml();
  clearTimeout(ctUndoShow.t); if (ctUndo) ctUndoShow.t = setTimeout(ctUndoShow, CT_UNDO_S * 1e3 + 100);
}
function ctUndoGo() {
  const u = ctUndo; if (!u) return; ctUndo = null; ctUndoShow();
  const id = ctId(u.day, u.area, u.item);
  track(u.prev ? LIVE.api.countLine(id, { day: u.day, area: u.area, item: u.item, unit: u.u, full: u.prev.full, open: u.prev.open }) : LIVE.api.dropCountLine(id), `${u.item} put back`, "Not put back. Try again");
  if (ctRow(u.key)) ctGo(u.key);
}
// A second look: a line far from the last count is likely a slip (30 for 3, a case counted as bottles), so it's flagged
// to count again. Far: 3 or more off and 3 times as many or a third as many as last time, with deliveries logged since
// added on. Normal use between counts never gets near that. It's right clears it for this count.
const ctOkSet = () => new Set(store.get("ctOk", {})[ctDay] || []);
function ctOdd(r, x = ctLine(r)) {
  const p = x && ctPrevOf(r); if (!p || ctOkSet().has(r.key)) return "";
  const got = (LIVE.received || []).filter((y) => y.item === r.item && y.day > ctPrev.day && y.day <= ctDay).reduce((n, y) => n + y.qty / 100, 0);
  const was = ctQty(p) + got, now = ctQty(x), last = `${ctSay(r.u, ctQty(p))} last time${got ? `, ${ctNum(got)} in since` : ""}`;
  if (now - was >= 3 && now >= 3 * Math.max(was, 1)) return `Much more than ${last}`;
  if (was - now >= 3 && now * 3 <= was) return `Much less than ${last}`;
  return "";
}
const ctOdds = () => ctRows().filter((r) => ctOdd(r));
function ctOkIt(r) { const m = store.get("ctOk", {}); m[ctDay] = [...new Set([...(m[ctDay] || []), r.key])]; for (const d of Object.keys(m)) if (d < addDays(ctDay, -60)) delete m[d]; store.set("ctOk", m); }
function ctGo(key) {
  if (ctPh && ctRow(key)?.item !== ctPh.item) ctPh = null;
  ctOpen = key; ctHeard = null; ctRender();
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

/* ---- Counting tips: how the bar counts, short enough to read mid-count ---- */
var CT_TIPS = [
  ["A worked example", "3 sealed Smirnoff and an open one about four-tenths full: Full 3, open .4. That's 3.4 bottles, and 3.4 × 700 ml = 2,380 ml (238 cl, 2.38 litres). Each tenth is a line on the bottle picture under More: 70 ml (7 cl) of a 70 cl."],
  ["cl and ml", "1 cl = 10 ml, so a 70 cl bottle is 700 ml and a 25 ml shot is 2.5 cl. A 70 cl bottle gives 28 shots of 25 ml. Sizes show in both; cl ⇄ ml at the top swaps which comes first. Type a size either way: 70 cl or 700 ml."],
  ["Same way every time", "Top shelf to bottom, left to right, front to back. The list is in that order, so you never lose your place."],
  ["Pull the back row forward", "Bring the bottles at the back to the front as you count each spot, so nothing hides behind the front row."],
  ["Cases and crates", "A full, sealed case: count the bottles in it (24 Corona is 24), or open the line and type it. An open case: count what's left in it."],
  ["Fridges", "Top shelf left to right, then the next shelf down. Count before the fridge is restocked or after, never halfway through."],
  ["The open bottle by eye", "Hold it upright at eye level and tap None, ¼, ½ or ¾. Need it closer? More has tenths and the scale."],
  ["Wine", "Full bottles in the fridge and the rack, then the open one. A 175 ml glass is about a quarter of a 75 cl bottle."],
  ["Kegs and the postmix", "Full, sealed kegs and boxes in the cellar are 1 each. The one that's connected: rock it or lift it. Light means nearly done: about .2. Not sure? .5."],
  ["Deliveries", "Count before a delivery is put away, or log it under Delivery in, so usage comes out right."],
  ["Broken or out of date", "It isn't stock: don't count it. Take it out and tell the duty manager."],
  ["Hands full?", "🎤 Say it: “Corona 48”, “Smirnoff two and a half”. Can't find a bottle on the list? 📷 Scan its barcode."],
  ["Two of you", "One counts out loud and one taps, or split the places. It all adds up on both phones."],
  ["Mis-tap?", "↩ Undo under Find puts the last item back as it was. A number far from last time says Check it: count it again, or It's right."],
];
const ctTipsHtml = () => `<details class="setup ct-tips" id="ct-tips"${ctTipsHtml.open ?? ctWide() ? " open" : ""}><summary>Counting tips</summary><dl>${CT_TIPS.map(([t, d]) => `<dt>${t}</dt><dd>${d}</dd>`).join("")}</dl></details>`;

/* ---- Barcodes: scan a bottle or pack to find it, count it, date it, or add it ----
   A barcode only says which product it is (never its use-by date), so each one is linked once to its line on the count:
   barcodes/{code} = the product's name. Anyone on the team links one and it works straight away, marked as waiting
   until a manager checks it; a manager's own are checked already. A barcode nobody has linked is looked up on Open Food
   Facts (free, no key) for its name, to suggest the line or add it as something new. Typing a barcode's numbers into
   Find does the same as scanning, for a camera that won't read it. */
var ctScanned = null;
const ctCodeOf = (code) => (LIVE.codes || []).find((x) => x.code === code);
const ctIsCode = (v) => /^\d{8,14}$/.test(String(v).replace(/\s+/g, ""));
async function ctScan() { const code = await scanCode(); if (code) ctCode(code); }
async function ctCode(code) {
  code = String(code).replace(/\s+/g, ""); ctClearFind(); ctHeard = null; ctOpen = "";
  const c = ctCodeOf(code); ctScanned = { code, item: c && ctRows(true).some((r) => r.item === c.item) ? c.item : "", c };
  if (!ctScanned.item) { ctScanned.busy = true; ctRender(true); scrollTo(0, 0); const p = await offProduct(code).catch(() => undefined); if (ctScanned?.code !== code) return; Object.assign(ctScanned, { busy: false, off: p }); }
  haptic(); ctRender(true); scrollTo(0, 0);
}
// The products whose whole name is in what Open Food Facts calls it (“Smirnoff Red Label Vodka” is Smirnoff), the most
// specific first; else the closest by spelling.
function ctNear(name) {
  const ws = ctWords(name), items = [...new Set(ctRows().map((r) => r.item))];
  const hit = items.map((n) => [n, ctWords(n)]).filter(([, nw]) => nw.length && nw.every((w) => ws.some((x) => x === w || (w.length >= 4 && x.startsWith(w))))).sort((a, b) => b[1].length - a[1].length).map(([n]) => n);
  return (hit.length ? hit : [...new Set((ctFind(name, ctRows()) || []).map((r) => r.item))]).slice(0, 4);
}
// Which line a scanned barcode is: what it's linked to, else the closest few to what Open Food Facts calls it.
function ctScanHtml() {
  const k = ctScanned; if (!k) return "";
  const close = `<button class="btn" data-ct-scan-x>Close</button>`, again = $("#ct-scan") ? `<button class="btn" id="ct-scan2">📷 Scan another</button>` : "";
  if (k.busy) return `<div class="ct-scan"><p class="s">Barcode ${esc(k.code)}</p><p>Looking it up…</p></div>`;
  if (k.item && !k.relink) {
    const rs = ctRows().filter((r) => r.item === k.item), w = k.c && !k.c.ok;
    return `<div class="ct-scan" role="region" aria-label="Scanned"><p class="s">Barcode ${esc(k.code)}${w ? ` · <span class="pill wait">Waiting for a manager to check</span>` : ""}</p><h3>${esc(k.item)}</h3>
      ${rs.length ? `<div class="actions">${rs.map((r) => { const x = ctLine(r); return `<button class="btn pri" data-ct-row="${esc(r.key)}" data-ct-scan-x>Count it: ${esc(r.area)}${x ? ` (${ctSay(r.u, ctQty(x))})` : ""}</button>`; }).join("")}</div>` : `<p class="note">It's set as Don't count${LIVE.admin ? ", in Set up the count" : ""}.</p>`}
      <div class="mini">Use-by</div>${ctLabelHtml(k.item)}
      ${w && LIVE.admin ? `<div class="actions"><button class="btn pri" data-ct-code-ok="${esc(k.code)}">Right: check it</button><button class="btn danger" data-ct-code-drop="${esc(k.code)}">Wrong: take it off</button></div>` : ""}
      <div class="actions">${again}${LIVE.admin || !k.c?.ok ? `<button class="btn" data-ct-relink>Not ${esc(k.item)}?</button>` : ""}${close}</div></div>`;
  }
  const name = k.off?.name || "", near = name ? ctNear(name) : [];
  const found = k.lq?.trim() ? [...new Set((ctFind(k.lq, ctRows()) || []).map((r) => r.item))].slice(0, 6) : [];
  return `<div class="ct-scan" role="region" aria-label="Scanned"><p class="s">Barcode ${esc(k.code)}</p><h3>${k.relink ? `What is it, if not ${esc(k.item)}?` : "Which one is it?"}</h3>
    <p class="note">${k.relink ? "" : name ? `Online it's “${esc(name)}”. ` : k.off === null ? "It isn't listed online. " : "Couldn't look it up: no signal. "}Pick it once and the barcode finds it from then on, for everyone${LIVE.admin ? "" : " (a manager checks it)"}.</p>
    ${near.length ? `<div class="recent">${near.map((n) => `<button class="chip" data-ct-link="${esc(n)}">${esc(n)}</button>`).join("")}</div>` : ""}
    <label class="fld">Or find it<input id="ct-link-q" maxlength="60" autocomplete="off" value="${esc(k.lq || "")}" placeholder="A few letters"></label>
    <div class="recent" id="ct-link-hits">${found.map((n) => `<button class="chip" data-ct-link="${esc(n)}">${esc(n)}</button>`).join("")}</div>
    <p class="s">Not on the count at all? <button class="linkbtn" data-ct-new="${esc(name)}">Add it as something new</button></p>
    <div class="actions">${again}${close}</div></div>`;
}
// Managers: barcodes the team has linked, to check.
function ctCodesHtml() {
  const xs = LIVE.admin ? (LIVE.codes || []).filter((x) => !x.ok) : []; if (!xs.length) return "";
  return `<details class="setup" id="ct-codes"${ctCodesHtml.open ? " open" : ""}><summary>Barcodes to check <span class="pill wait">${xs.length}</span></summary>
    <p class="note">Someone scanned these and picked what they are. They work already: check each is right.</p>
    ${xs.map((x) => `<div class="tally-row" style="grid-template-columns:1fr auto auto"><div class="n">${esc(x.item)}<div class="s">${esc(x.code)} · ${esc(x.name)}</div></div><button class="btn" data-ct-code-ok="${esc(x.code)}">Right</button><button class="btn" data-ct-code-drop="${esc(x.code)}">Wrong</button></div>`).join("")}</details>`;
}

/* ---- Use-by: the date labels, from the Stock tab ----
   The date labels are the one record of what's open and when it has to go (a barcode never carries the date). This
   shows what's due in the next 3 days, and a scanned item's own label, with Opened one and Changed it saving straight
   to it; anything more (a sooner date, discarding, adding one) is on Date labels in Shift. */
const ctLabelsOf = (item) => LIVE.labels.filter((x) => x.on && x.item.trim().toLowerCase() === item.trim().toLowerCase());
const ctSoon = () => LIVE.labels.filter((x) => x.on && x.state === "open" && ISO_DAY.test(x.useBy) && daysFrom(shiftDay(), x.useBy) <= 2).sort((a, b) => a.useBy.localeCompare(b.useBy) || a.item.localeCompare(b.item));
function ctLbRow(x) {
  const due = labelDue(x), [tag, cls] = LB_DUE[due], open = x.state === "open";
  return `<div class="ct-lb"><div><b>${esc(x.item)}</b> <span class="pill ${cls}">${tag}</span><div class="s">${esc(sideName(x.side))} · ${esc(labelLine(x))}</div></div>
    <div class="actions"><button class="btn${["overdue", "today"].includes(due) ? " pri" : ""}" data-ct-lb="${x.id}" data-ct-lb-act="${open ? "changed" : "opened"}">${open ? "Changed it" : "Opened one"}</button><button class="btn" data-ct-lbgo="${x.side}" aria-label="Date labels for the ${esc(lower(sideName(x.side)))}">›</button></div></div>`;
}
function ctLabelHtml(item) {
  const xs = ctLabelsOf(item);
  if (xs.length) return xs.map(ctLbRow).join("");
  return `<p class="s">No date label for ${esc(item)}.${LIVE.admin ? ` <button class="linkbtn" data-ct-lbadd="${esc(item)}">Give it one</button>` : " If it goes off once it's opened, a manager adds one."}</p>`;
}
function ctUseByHtml() {
  const xs = ctSoon(); if (!xs.length) return "";
  const now = xs.filter((x) => ["overdue", "today"].includes(labelDue(x))).length;
  return `<details class="setup ct-useby" id="ct-useby"${ctUseByHtml.open ?? (now > 0 || ctWide()) ? " open" : ""}><summary>Use-by: ${now ? `<b class="warnline">${now} to change now</b>, ` : ""}${xs.length} in the next 3 days</summary>${xs.map(ctLbRow).join("")}</details>`;
}

/* ---- First time counting: a walkthrough in plain words, with pictures ----
   Shown the first time someone opens the count on this phone, and any time from How to count. */
const CT_PIC = (b) => `<svg viewBox="0 0 240 150" class="ct-pic" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${b}</svg>`;
const CT_BTL = (x, y, s = 1, fill = 0) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M14 0h12v22c0 5 12 9 12 20v58a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V42c0-11 12-15 12-20z"/>${fill ? `<path d="M3 ${105 - fill}h34v${fill - 5}a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5z" fill="var(--brass)" stroke="none"/>` : ""}</g>`;
var CT_INTRO = [
  { t: "Counting stock: how it works", pic: CT_PIC(`<rect x="20" y="20" width="200" height="110" rx="6"/><path d="M20 58h200M20 96h200"/>${CT_BTL(40, 24, 0.33)}${CT_BTL(62, 24, 0.33)}${CT_BTL(84, 24, 0.33)}${CT_BTL(150, 62, 0.33)}${CT_BTL(172, 62, 0.33)}<rect x="40" y="102" width="30" height="24" rx="3"/><rect x="80" y="102" width="30" height="24" rx="3"/>`),
    how: ["You're writing down what's on the shelves right now, like the old notebook.", "The app lists every place in the order you walk them: speed rail, back bar, fridges, store room. Work down the list.", "Every tap saves with your name, even with no signal. Two of you? Split the places."] },
  { t: "Set up the scale", pic: CT_PIC(`<path d="M30 118h180l-12 22H42z"/><rect x="60" y="94" width="120" height="24" rx="4"/><rect x="92" y="99" width="56" height="14" rx="2"/><text x="120" y="111" text-anchor="middle" font-size="13" fill="currentColor" stroke="none" font-weight="700">0 g</text>`),
    how: ["Put the kitchen scale on a flat, dry part of the bar top, near the shelf you're counting.", "Turn it on with nothing on it. It should say 0 g. If it doesn't, press Tare or Zero.", "Make sure it shows g (grams), not oz or ml."] },
  { t: "1. Full, sealed bottles", pic: CT_PIC(`${CT_BTL(40, 20, 1, 95)}${CT_BTL(90, 20, 1, 95)}<circle cx="190" cy="70" r="26"/><path d="M190 56v28M176 70h28"/>`),
    how: ["Tap the item in the list.", "Count the bottles that have never been opened: the seal or cap isn't broken.", "Tap + once for each one, or +6 for a row of six. − takes one off.", "Same as last time? One tap on Same as last time does the whole line."] },
  { t: "2. The open bottle", pic: CT_PIC(`<path d="M20 128h200"/><rect x="70" y="112" width="100" height="16" rx="4"/>${CT_BTL(100, 5, 1, 45)}<path d="M180 30l20-12M186 44h24" stroke="var(--brass)"/>`),
    how: ["Look at it level with your eye and tap None, ¼, ½ or ¾. That saves it and opens the next item.", "Need it closer? More has tenths, 📷 Photo check (your photo beside a sealed one) and the scale: pourer off, stand it on the scale, type the grams."] },
  { t: "A worked example", pic: CT_PIC(`${CT_BTL(20, 20, 1, 95)}${CT_BTL(66, 20, 1, 95)}${CT_BTL(112, 20, 1, 95)}${CT_BTL(170, 20, 1, 40)}<text x="214" y="96" font-size="15" fill="currentColor" stroke="none" font-weight="700">.4</text>`),
    how: ["On the shelf: 3 sealed Smirnoff and one open bottle about four-tenths full.", "Tap + three times: Full 3. Then the open one: ½ is near enough by eye, or .4 under More for tenths.", "The line shows the sum: 3 full + .4 open = 3.4 bottles of 70 cl = 238 cl, or 2,380 ml (3.4 × 700 ml).", "cl to ml: times 10. ml to cl: divide by 10. A tenth of a 70 cl is 7 cl, or 70 ml, so .4 is 280 ml. Nory takes the bottles: 3.4."] },
  { t: "Cans, cakes and packs", pic: CT_PIC(`<rect x="30" y="50" width="40" height="70" rx="6"/><path d="M30 62h40M30 108h40"/><path d="M100 120h70a10 10 0 0 0 10-10V90H90v20a10 10 0 0 0 10 10z"/><path d="M90 90c10-16 80-16 90 0"/><rect x="190" y="70" width="34" height="50" rx="3"/>`),
    how: ["Count them and tap + for each, or type the number.", "Half a cake is .5. Each line says what one is, like a 200 ml bottle."] },
  { t: "Next, and nothing there", pic: CT_PIC(`<rect x="40" y="45" width="160" height="60" rx="30" fill="var(--brass)" stroke="none"/><text x="120" y="84" text-anchor="middle" font-size="26" font-weight="800" fill="var(--brass-ink)" stroke="none">Next ›</text>`),
    how: ["The level, No open one, None left and Same as last time save the item and open the next one by themselves. Next › does the same any time.", "None on the shelf at all? Just tap Next: it saves as none.", "Not counted yet shows only what's left, so the list gets shorter as you go."] },
  { t: "Can't find it?", pic: CT_PIC(`<circle cx="100" cy="68" r="38"/><path d="M128 96l40 40"/><path d="M84 68h32" stroke="var(--brass)"/>`),
    how: ["Type a few letters in Find at the top. It looks in every place, and says where the item is. By kind puts all the vodkas, all the cakes and so on together.", "Or tap 📷 and scan the bottle's barcode: it opens that item.", "Not on the list at all, like a new cake or shake topping? Find shows ＋ Add it and count it: count it straight away, and Maintenance checks it after."] },
  { t: "Finished", pic: CT_PIC(`<rect x="60" y="20" width="120" height="110" rx="12"/><path d="M90 60l20 20 40-40" stroke="var(--brass)" stroke-width="8"/><path d="M90 108h60"/>`),
    how: ["When Not counted yet is empty, it says All counted. Anything under Worth a second look is far from last time: count it again, or tap It's right. ↩ Undo, under Find, takes back the last tap.", "Send on WhatsApp, or Spreadsheet, at the bottom: for whoever puts it into Nory.", "Counting tips, under How to count, cover cases, fridges, wine and kegs."] },
];
var ctIntro = -1;
function ctIntroHtml() {
  const i = ctIntro, c = CT_INTRO[i], last = i === CT_INTRO.length - 1;
  return `<div class="ct-intro" role="group" aria-label="How to count stock">
    <p class="ct-istep"><b>${i + 1} of ${CT_INTRO.length}</b><span class="dots" aria-hidden="true">${CT_INTRO.map((_, j) => `<i class="${j === i ? "on" : j < i ? "ok" : ""}"></i>`).join("")}</span></p>
    ${c.pic}<h3>${c.t}</h3><ul>${c.how.map((x) => `<li>${x}</li>`).join("")}</ul>
    <div class="actions">${i ? `<button class="btn" data-ct-intro="${i - 1}">‹ Back</button>` : ""}<button class="btn pri" data-ct-intro="${last ? "go" : i + 1}">${last ? "Start counting" : "Next ›"}</button>${last ? "" : `<button class="btn" data-ct-intro="go">Skip</button>`}</div></div>`;
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
    parts: [{ id: "low", label: "Running low", lines: got.filter(ctIsLow).map((x) => `${x.item}: ${ctSay(x.u, x.n)} (low below ${ctSay(x.u, x.low)})`) },
      { id: "tot", label: "Totals", lines: got.map((x) => `${x.item}: ${ctSay(x.u, x.n)}${x.done < x.of ? " (not all places)" : ""}`) },
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
  const lines = [["Date", "Item", "Count", "Unit", "Size", "Where", "Counted by"], ...ctTable(day).map((t) => [day, t.item, t.done ? ctNum(t.n) : "", t.u, t.size, t.where.join("; "), t.by])];
  const ins = (LIVE.received || []).filter((x) => x.day === day);
  if (ins.length) lines.push([], ["Date", "Delivery in", "Count", "Unit", "", "", "Logged by"], ...ins.map((x) => [day, x.item, ctNum(x.qty / 100), x.unit, "", "", x.name]));
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
  s.items[r.item] = { ...o, a: o.a?.length ? o.a : r.a, u: o.u || r.u, e: +o.e || 0, f: +o.f || 0, ml: +(o.ml ?? r.ml) || 0, pw: +o.pw || 0, off: o.off ?? r.off, ...f };
}
function ctSetupHtml() {
  const all = ctRows(true), areas = ctAreas(all), seen = new Set();
  return `<div class="sec">Set up the count</div>
    <p class="note">The places in the order you walk them, what's counted in each, in what, and bottle weights for weighing. Changes save straight away for everyone. A product kept in two places can be counted in both: its total adds them up.</p>
    <div class="actions"><button class="btn pri" id="ct-setup-done">Back to the count</button></div>
    <div class="mini">Running low levels</div>
    <p class="note">${(() => { const ls = [...new Map(all.filter((r) => r.low > 0).map((r) => [r.item, r])).values()]; return ls.length ? `Set on ${ls.length}: ${ls.map((r) => `${esc(r.item)} below ${ctSay(r.u, r.low)}`).join(", ")}.` : "None set yet."; })()} Open a product below, or a line while counting, to set one. Below it after a count, it shows as running low on the 86 board, the bar station and Needs you now, before it's an 86.</p>
    <div class="mini">Places, in walking order</div>
    ${areas.map((a, i) => `<div class="tally-row" style="grid-template-columns:1fr auto auto auto"><div class="n">${esc(a)} <span class="s">${all.filter((r) => r.area === a).length}</span></div><button class="btn" data-ct-amove="${i}:-1" aria-label="Move ${esc(a)} up"${i ? "" : " disabled"}>↑</button><button class="btn" data-ct-amove="${i}:1" aria-label="Move ${esc(a)} down"${i < areas.length - 1 ? "" : " disabled"}>↓</button><button class="btn" data-ct-adrop="${esc(a)}"${all.some((r) => r.area === a) ? " disabled" : ""}>Remove</button></div>`).join("")}
    <div class="ltools"><input id="ct-anew" maxlength="40" placeholder="Add a place, like Keg room" aria-label="New place"><button class="btn" id="ct-aadd">Add</button></div>
    ${areas.map((a) => { const rs = all.filter((r) => r.area === a); return `<div class="sec">${esc(a)}</div>${rs.map((r, i) => {
      const k = `${a}|${r.item}`, open = ctSetOpen === k, first = !seen.has(r.item); seen.add(r.item);
      return `<details class="ct-set"${open ? " open" : ""} data-ct-sk="${esc(k)}"><summary><span>${esc(r.item)}</span><small>${r.off ? "not counted" : `${r.u}${r.size ? ` · ${esc(ctSz(r))}` : ""}${ctWeighable(r) ? (r.est ? " · weights estimated" : r.lock ? " · 🔒 weighed" : " · weights checked") : ""}${r.a.length > 1 ? ` · also ${esc(r.a.filter((x) => x !== a).join(", "))}` : ""}`}</small></summary>${open ? `<div class="ct-sbody" data-ct-item="${esc(r.item)}" data-ct-area="${esc(a)}">
        <div class="actions"><button class="btn" data-ct-move="-1"${i ? "" : " disabled"}>↑ Up the shelf</button><button class="btn" data-ct-move="1"${i < rs.length - 1 ? "" : " disabled"}>↓ Down the shelf</button></div>
        <div class="two"><label class="fld">Counted in<select data-ct-f="u">${CT_UNITS.map((u) => `<option${u === r.u ? " selected" : ""}>${u}</option>`).join("")}</select></label>
        <label class="fld">Place<select data-ct-f="area">${areas.map((x) => `<option${x === a ? " selected" : ""}>${esc(x)}</option>`).join("")}</select></label></div>
        ${first ? `<label class="fld">Also counted in<select data-ct-f="also"><option value="">Nowhere else</option>${areas.filter((x) => x !== a).map((x) => `<option${r.a.includes(x) ? " selected" : ""}>${esc(x)}</option>`).join("")}</select></label>` : `<p class="s">Also counted in ${esc(r.a.filter((x) => x !== a).join(", "))}.</p>`}
        ${r.u === "bottle" ? ctWeightsHtml(r) : `<div class="two"><label class="fld">One portion or unit, grams <span class="s">(to weigh)</span><input inputmode="decimal" data-ct-f="pw" value="${r.pw || ""}"></label><label class="fld">Container, grams<input inputmode="decimal" data-ct-f="e" value="${r.e || ""}"></label></div>`}
        ${first ? ctLowField(r) : ""}
        <label class="check"><input type="checkbox" data-ct-f="off"${r.off ? " checked" : ""}> Don't count this</label></div>` : ""}</details>`;
    }).join("")}`; }).join("")}`;
}

/* ---- Taps ---- */
$("#v-count").addEventListener("click", (e) => {
  if (!$("#ct")) return;
  const t = (s) => e.target.closest(s);
  const it = t("[data-ct-intro]"); if (it) {
    const v = it.dataset.ctIntro; haptic();
    if (v === "go") { ctIntro = -1; store.set("ctHow", true); } else ctIntro = +v;
    ctRender(true); scrollTo(0, 0); return;
  }
  // A product in Set up the count opens on the tap itself, so a redraw from another phone can't swallow it.
  const sk = t("[data-ct-sk] > summary"); if (sk) { e.preventDefault(); const k = sk.parentElement.dataset.ctSk; ctSetOpen = ctSetOpen === k ? "" : k; return ctRender(true); }
  // Scanning, and what a barcode is.
  if (t("[data-ct-scan-x]")) { ctScanned = null; if (!t("[data-ct-row]")) return ctRender(true); }
  if (t("#ct-scan, #ct-scan2")) { haptic(); return ctScan(); }
  if (t("[data-ct-relink]") && ctScanned) { ctScanned.relink = true; ctScanned.lq = ""; return ctRender(true); }
  const lk = t("[data-ct-link]"); if (lk && ctScanned) {
    const k = ctScanned, item = lk.dataset.ctLink, had = ctCodeOf(k.code);
    if (LIVE.codesErr) return toast("Barcodes need the new rules. Maintenance publishes them");
    if (had?.ok && !LIVE.admin) return toast("A manager checked that barcode. Ask one to change it");
    haptic(); track(LIVE.api.linkCode(k.code, item, !!LIVE.admin), LIVE.admin ? `Linked to ${item}` : `Linked to ${item}. A manager checks it`, "Not saved. Check the signal and try again");
    ctScanned = { code: k.code, item, c: { code: k.code, item, ok: !!LIVE.admin } }; return ctRender(true);
  }
  const nw = t("[data-ct-new]"); if (nw) { const n = nw.dataset.ctNew; ctScanned = null; itOpen = true; ctRender(true); requestAnimationFrame(() => { $("#it-add")?.scrollIntoView({ block: "start" }); if (n) itLook(n); else $("#it-name")?.focus(); }); return; }
  const co = t("[data-ct-code-ok]"); if (co) { const x = ctCodeOf(co.dataset.ctCodeOk); if (x) track(LIVE.api.linkCode(x.code, x.item, true), `Checked: ${x.item}`, "Not saved. Try again"); if (ctScanned?.c?.code === x?.code) ctScanned.c = { ...x, ok: true }; return ctRender(true); }
  const cd = t("[data-ct-code-drop]"); if (cd) { const c = cd.dataset.ctCodeDrop; track(LIVE.api.dropCode(c), "Taken off. Scan it again to link it", "Not taken off. Try again"); if (ctScanned?.code === c) ctScanned = null; return ctRender(true); }
  // Date labels: Opened one and Changed it save straight to the label; › goes to that side's Date labels.
  const lb = t("[data-ct-lb]"); if (lb) {
    const x = LIVE.labels.find((y) => y.id === lb.dataset.ctLb), act = lb.dataset.ctLbAct; if (!x) return;
    const d = addDays(shiftDay(), x.life); haptic();
    track(LIVE.api.label(x, act, { useBy: d }), `${x.item}: use by ${dayName(d)}`, "Not saved. Someone may have just changed it"); return;
  }
  const lg = t("[data-ct-lbgo]"); if (lg) { const sd = lg.dataset.ctLbgo; if (MODE_LISTS[sd] && sd !== mode) setMode(sd); haptic(); openAt("labels"); return; }
  const la = t("[data-ct-lbadd]"); if (la) { const n = la.dataset.ctLbadd; Object.assign(lbF, { item: n, life: itKeep(n)?.days ? String(itKeep(n).days) : "", open: true }); haptic(); openAt("labels"); requestAnimationFrame(() => $("#lb-add")?.scrollIntoView({ block: "start" })); return; }
  const by = t("[data-ct-by]"); if (by) { haptic(); ctBy = by.dataset.ctBy; store.set("ctBy", ctBy); ctClearFind(); return ctRender(true); }
  const sh = t("[data-ct-show]"); if (sh) { ctShow = sh.dataset.ctShow; store.set("ctShow", ctShow); ctClearFind(); return ctRender(); }
  if (t("[data-ct-undo]")) { haptic(); return ctUndoGo(); }
  const rw = t("[data-ct-row]"); if (rw) { haptic(); const k = rw.dataset.ctRow; if (ctOpen === k && rw.classList.contains("ct-line")) { ctOpen = ""; return ctRender(); } return ctGo(k); }
  const jp = t("[data-ct-jump]"); if (jp) {
    // A place already counted is hidden under Not counted yet: going to it shows everything.
    const a = jp.dataset.ctJump; ctClearFind();
    if (ctShow === "todo" && ctRows().filter((r) => ctSecOf(r) === a).every(ctLine)) { ctShow = "all"; store.set("ctShow", ctShow); }
    ctRender(true); return document.getElementById(`ct-a-${ctSlug(a)}`)?.scrollIntoView({ block: "start" });
  }
  const r = ctOpen && ctRow(ctOpen), x = r && ctLine(r);
  const ad = t("[data-ct-add]"); if (ad && r) { haptic(); const d = +ad.dataset.ctAdd.split(":")[1]; ctPut(r, Math.max(0, (x?.full || 0) + d), x?.open || 0); return; }
  // The open bottle's level, No open one, None left and Same as last time are the last tap on a line: it saves and the
  // next one opens by itself.
  const lp = t("[data-ct-lvp]"); if (lp && r) { haptic(); ctPut(r, x?.full || 0, +lp.dataset.ctLvp); return ctNext(r.key, true); }
  const lv = t("[data-ct-lv]"); if (lv && r) { haptic(); ctPut(r, x?.full || 0, +lv.dataset.ctLv * 10); return ctNext(r.key, true); }
  const st = t("[data-ct-set]"); if (st && r) { haptic(); const [f, o] = st.dataset.ctSet.split(":").map(Number); ctPut(r, f, o); return ctNext(r.key, true); }
  const sm = t("[data-ct-same]"); if (sm && r) { const p = ctPrevOf(r); if (!p) return; haptic(); ctPut(r, p.full, p.open); return ctNext(r.key, true); }
  const dr = t("[data-ct-drop]"); if (dr && r) return ctDrop(r);
  if (t("[data-ct-ok]") && r) { haptic(); ctOkIt(r); toast(`${r.item}: kept as counted`); return ctNext(r.key, true); }
  // Next: down the list as it shows (the shelf, or A to Z), past anything counted already when only what's left is showing.
  const nx = t("[data-ct-next]"); if (nx) return ctNext(nx.dataset.ctNext);
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
  if (t("[data-ct-unit]")) { ctMlFirst = !ctMlFirst; store.set("ctMlFirst", ctMlFirst); toast(ctMlFirst ? "Sizes in ml first. 10 ml = 1 cl" : "Sizes in cl first. 1 cl = 10 ml"); return ctRender(true); }
  // Setup
  if (t("#ct-setup")) { ctSetupOn = true; ctSetOpen = ""; ctRender(); scrollTo(0, 0); return; }
  if (t("#ct-setup-done")) { ctSetupOn = false; ctRender(); scrollTo(0, 0); return; }
  const ul = t("[data-ct-unlock]"); if (ul) { ctUnlocked.add(ul.dataset.ctUnlock); toast(`${ul.dataset.ctUnlock} unlocked. Weigh it again to lock it`); return ctRender(true); }
  const ck = t("[data-ct-chkgo]"); if (ck) {
    const item = ck.dataset.ctChkgo, rr = ctRows(true).find((y) => y.item === item), g = +$(`[data-ct-chk="${CSS.escape(item)}"]`).value.replace(",", ".") || 0;
    if (rr.u !== "bottle") { if (!(g > rr.e)) return toast("Weigh a full one, packaging and all"); ctUnlocked.delete(item); return ctSave((s) => ctItemSet(s, rr, ctWeighed({ pw: Math.round(g - rr.e), e: rr.e })), `${item} checked: ${Math.round(g - rr.e)} g in one. Locked`); }
    const e0 = Math.round(g - rr.ml * rr.dn);
    if (!(e0 > 50)) return toast(`That's too light for a sealed ${ctSz(rr)} bottle. Check the scale reads 0 first`);
    ctUnlocked.delete(item); return ctSave((s) => ctItemSet(s, rr, ctWeighed({ e: e0, f: Math.round(g), ml: rr.ml })), `${item} checked: empty ${e0} g, full ${Math.round(g)} g. Locked`);
  }
  const ws = t("[data-ct-wsave]"); if (ws) {
    const box = ws.closest("[data-ct-w]"), v = (k) => +box.querySelector(`[data-ct-wf="${k}"]`).value.replace(",", ".") || 0, e0 = v("e"), f0 = v("f"), mt = box.querySelector('[data-ct-wf="ml"]').value, ml = ctParseMl(mt), rr = ctRows(true).find((y) => y.item === ws.dataset.ctWsave);
    if (!(e0 > 0 && f0 > e0)) return toast("The unopened one has to weigh more than the empty one");
    if (mt.trim() && !(ml >= 50 && ml <= 5000)) return toast("Bottle size: type it like 70 cl or 700 ml");
    ctUnlocked.delete(rr.item); return ctSave((s) => ctItemSet(s, rr, ctWeighed({ e: e0, f: f0, ml })), `Weights saved for ${rr.item}. Locked`);
  }
  const am = t("[data-ct-amove]"); if (am) { const [i, d] = am.dataset.ctAmove.split(":").map(Number); return ctSave((s) => { const a = ctAreas(); [a[i], a[i + d]] = [a[i + d], a[i]]; s.areas = a; }); }
  const ax = t("[data-ct-adrop]"); if (ax) return ctSave((s) => { s.areas = ctAreas().filter((a) => a !== ax.dataset.ctAdrop); });
  if (t("#ct-aadd")) { const n = $("#ct-anew").value.trim(); if (!n) return; if (ctAreas().some((a) => a.toLowerCase() === n.toLowerCase())) return toast("That place is there already"); return ctSave((s) => { s.areas = [...ctAreas(), n]; }, `${n} added`); }
  const mv = t("[data-ct-move]"); if (mv) {
    const b = mv.closest("[data-ct-item]"), item = b.dataset.ctItem, area = b.dataset.ctArea, d = +mv.dataset.ctMove;
    return ctSave((s) => { const l = ctRows(true).filter((y) => y.area === area).map((y) => y.item), i = l.indexOf(item); [l[i], l[i + d]] = [l[i + d], l[i]]; s.order[area] = l; });
  }
});
$("#v-count").addEventListener("toggle", (e) => {
  // A redraw fires toggle on the details it replaced too, after they've gone: only the ones on the page count.
  const d = e.target; if (!$("#ct") || !d.matches?.("details") || !d.isConnected) return;
  if (d.id === "ct-in-box") ctInHtml.open = d.open;
  else if (d.id === "ct-tips") ctTipsHtml.open = d.open;
  else if (d.id === "ct-more") { ctMoreOn = d.open; store.set("ctMore", ctMoreOn); }
  else if (d.id === "ct-useby") ctUseByHtml.open = d.open;
  else if (d.id === "ct-codes") ctCodesHtml.open = d.open;
  else if (d.id === "it-add") itOpen = d.open;
  else if (d.id === "it-list") itShow = d.open ? mode : "";
  else if (d.id === "ct-tot-box") ctTotOpen = d.open;
  else if (d.id === "ct-use-box") ctUseHtml.open = d.open;
  else if (d.dataset.ctSk) { if (d.open) { if (ctSetOpen !== d.dataset.ctSk) { ctSetOpen = d.dataset.ctSk; ctRender(); } } else if (ctSetOpen === d.dataset.ctSk) ctSetOpen = ""; }
}, true);
// The find box: the list narrows as it's typed, in every place. Count it shows once it reads as a count.
function ctClearFind() { ctQ = ""; const i = $("#ct-say"); if (i) i.value = ""; if ($("#ct-say-go")) $("#ct-say-go").hidden = true; }
$("#v-count").addEventListener("input", (e) => {
  if (e.target.id === "ct-link-q" && ctScanned) {
    ctScanned.lq = e.target.value; const hits = $("#ct-link-hits"), found = ctScanned.lq.trim() ? [...new Set((ctFind(ctScanned.lq, ctRows()) || []).map((r) => r.item))].slice(0, 6) : [];
    if (hits) hits.innerHTML = found.map((n) => `<button class="chip" data-ct-link="${esc(n)}">${esc(n)}</button>`).join("") || (ctScanned.lq.trim() ? `<p class="s">Nothing called that on the count.</p>` : "");
    return;
  }
  if (e.target.id === "ct-say") {
    ctQ = e.target.value; $("#ct-say-go").hidden = !ctParse(ctQ) || ctIsCode(ctQ);
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
  if (!w.full && n >= r.e - 20 && (x?.open ?? -1) !== w.open) {
    ctPut(r, x?.full || 0, w.open);
    // The page waits to redraw while the box has the keyboard, so the total under it changes here and now.
    const t = $("#ct .ct-sum b"); if (t) t.textContent = ctSay(r.u, (x?.full || 0) + w.open / 100);
  }
}
$("#v-count").addEventListener("change", (e) => {
  if (!$("#ct")) return;
  const el = e.target;
  if (el.id === "ct-ph-in" || el.id === "ct-ref-in") return ctPhoto(el);
  if (el.id === "ct-day") { ctDay = el.value && el.value <= shiftDay() ? el.value : shiftDay(); ctOpen = ""; ctUse = null; el.blur(); return ctRender(); }
  if (el.id === "ct-type") { const r = ctRow(ctOpen), n = +el.value.replace(",", "."); el.blur(); if (r && el.value.trim() !== "" && n >= 0) { ctPut(r, Math.floor(n + 1e-9), ((n + 1e-9) % 1) * 100); return ctNext(r.key, true); } return ctRender(); }
  if (el.dataset.ctG) {
    ctWeighPut(el); el.blur(); return;
  }
  const f = el.dataset.ctF; if (!f) return;
  const b = el.closest("[data-ct-item]"), r = ctRows(true).find((y) => y.item === b.dataset.ctItem), area = b.dataset.ctArea; el.blur();
  ctSave((s) => {
    if (f === "u") ctItemSet(s, r, { u: el.value });
    if (f === "off") ctItemSet(s, r, { off: el.checked });
    if (f === "pw" || f === "e") ctItemSet(s, r, { [f]: +el.value.replace(",", ".") || 0 });
    if (f === "low") ctItemSet(s, r, { low: Math.max(0, Math.min(9999, +el.value.replace(",", ".") || 0)) });
    if (f === "par") { const v = el.value.trim().replace(",", "."); ctItemSet(s, r, {}); if (v === "" || isNaN(+v)) delete s.items[r.item].par; else s.items[r.item].par = Math.max(0, Math.round(+v * 100) / 100); }
    if (f === "area") { ctItemSet(s, r, { a: [...new Set(r.a.map((x) => (x === area ? el.value : x)))] }); ctSetOpen = `${el.value}|${r.item}`; }
    if (f === "also") ctItemSet(s, r, { a: el.value ? [r.a[0], el.value] : [r.a[0]] });
  });
});
$("#v-count").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  if (e.target.id === "ct-say") {
    // A count (“Smirnoff 2.5”) goes to the check; just a name opens the best match.
    e.preventDefault(); const v = e.target.value;
    if (ctIsCode(v)) { e.target.blur(); return ctCode(v); }
    if (ctParse(v)) return ctHear(v);
    const f = ctFind(v, ctRows()); if (f?.length) { e.target.blur(); ctGo((f.find((r) => !ctLine(r)) || f[0]).key); } else if (v.trim()) ctHear(v);
  }
  if (e.target.id === "ct-in") { e.preventDefault(); $("#ct-in-go").click(); }
  if (e.target.id === "ct-anew") { e.preventDefault(); $("#ct-aadd").click(); }
});
// A change that waited for the typing is drawn once the box is left. Not straight away: a tap on a button takes the
// focus first, and redrawing then would swap the button out before the tap lands.
$("#v-count").addEventListener("focusout", () => setTimeout(() => { if (ctRender.later && ctShown() && !$("#ct").contains(document.activeElement)) ctRender(); }, 400));
