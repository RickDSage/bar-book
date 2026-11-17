/* ---------- Import ----------
   The other way from Export: a manager brings a spreadsheet in (CSV, or an Excel workbook from Excel, Numbers or
   Google Sheets) to add or update what Bar Book keeps: date labels, items, names, the stock setup with bottle sizes and
   weights, a past stock count from the notebook, or deliveries. Each kind has a template made from what's in Bar Book
   now, so the columns are right. Nothing saves until the manager has seen every line marked New, Change, Same or Skip,
   with the reason, and a change to something already there asks once more. Every line is saved through the same
   writes as the app itself, so the server's rules check each one, and nothing is ever deleted. */
const IM = { kind: "labels", file: "", plan: null, busy: false, done: null, err: "" };
const imNorm = (s) => String(s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const imKey = (s) => String(s ?? "").trim().toLowerCase();
const imYes = (v, def) => { const s = imNorm(v); return !s ? def : ["yes", "y", "true", "1", "on", "x", "ticked"].includes(s); };
const imNum = (v) => { if (typeof v === "number") return v; const s = String(v ?? "").trim().replace(",", "."); return s === "" || isNaN(+s) ? null : +s; };
// A day from a cell: 2026-11-17, 17/11/2026 (UK order), or an Excel date number.
function imDay(v) {
  if (typeof v === "number" && v > 30000 && v < 80000) return new Date((v - 25569) * 864e5).toISOString().slice(0, 10);
  const s = String(v ?? "").trim(); let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/))) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "";
}
const imSide = (v) => { const s = imNorm(v); return s.startsWith("bar") ? "bar" : s.startsWith("floor") ? "floor" : ""; };
// A value given as the app's own word or its plain name (Fridge, "Dry store or shelf").
const imPick = (map, v, get = (x) => x) => { const s = imNorm(v); if (!s) return ""; return Object.keys(map).find((k) => imNorm(k) === s || imNorm(get(map[k])) === s) || null; };

/* ---- Reading the file ---- */
function imCsv(text) {
  text = text.replace(/^﻿/, "");
  const first = text.split(/\r?\n/, 1)[0], d = [",", ";", "\t"].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows = [[]]; let cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"' && cell === "") q = true;
    else if (c === d) { rows.at(-1).push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; rows.at(-1).push(cell); cell = ""; rows.push([]); }
    else cell += c;
  }
  rows.at(-1).push(cell);
  // Export guards cells that look like a formula with a leading '; take it off again.
  return rows.map((r) => r.map((x) => (/^'[=+\-@]/.test(x) ? x.slice(1) : x)));
}
async function imUnzip(buf) {
  const u = new Uint8Array(buf), v = new DataView(buf), out = {};
  let e = u.length - 22; while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error("That file isn't a spreadsheet Bar Book can read. Save it as CSV and try again");
  let p = v.getUint32(e + 16, true);
  for (let i = 0, n = v.getUint16(e + 10, true); i < n; i++) {
    const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true), nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), off = v.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u.subarray(p + 46, p + 46 + nl)), start = off + 30 + v.getUint16(off + 26, true) + v.getUint16(off + 28, true), data = u.subarray(start, start + size);
    out[name] = { method, data };
    p += 46 + nl + xl + cl;
  }
  return async (name) => {
    const f = out[name]; if (!f) return null;
    if (f.method === 0) return new TextDecoder().decode(f.data);
    if (typeof DecompressionStream === "undefined") throw new Error("This phone can't open Excel files. Save it as CSV, or open it on a newer phone or a laptop");
    return new Response(new Blob([f.data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();
  };
}
// The first sheet of an .xlsx, as rows of cells. Numbers stay numbers (dates come through as Excel date numbers).
async function imXlsx(buf) {
  const get = await imUnzip(buf), xml = (s) => new DOMParser().parseFromString(s, "application/xml");
  const wb = xml((await get("xl/workbook.xml")) || ""), rels = xml((await get("xl/_rels/workbook.xml.rels")) || "");
  const sh = wb.getElementsByTagName("sheet")[0], rid = sh?.getAttribute("r:id") || sh?.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
  const tgt = [...rels.getElementsByTagName("Relationship")].find((r) => r.getAttribute("Id") === rid)?.getAttribute("Target") || "worksheets/sheet1.xml";
  const path = tgt.startsWith("/") ? tgt.slice(1) : "xl/" + tgt.replace(/^\.\//, "");
  const ss = await get("xl/sharedStrings.xml"), strings = ss ? [...xml(ss).getElementsByTagName("si")].map((si) => [...si.getElementsByTagName("t")].map((t) => t.textContent).join("")) : [];
  const s = await get(path); if (!s) throw new Error("No sheet found in that file");
  const col = (ref) => { let n = 0; for (const ch of ref.replace(/\d+$/, "")) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  return [...xml(s).getElementsByTagName("row")].map((row) => {
    const r = [];
    for (const c of row.getElementsByTagName("c")) {
      const t = c.getAttribute("t"), vv = c.getElementsByTagName("v")[0]?.textContent ?? "";
      r[col(c.getAttribute("r") || "A1")] = t === "s" ? strings[+vv] ?? "" : t === "inlineStr" ? [...c.getElementsByTagName("t")].map((x) => x.textContent).join("") : t === "b" ? (vv === "1" ? "Yes" : "No") : t === "str" || t === "e" ? vv : vv === "" ? "" : +vv;
    }
    return Array.from(r, (x) => x ?? "");
  });
}
async function imRead(file) {
  const buf = await file.arrayBuffer(), u = new Uint8Array(buf);
  if (u[0] === 0x50 && u[1] === 0x4b) return imXlsx(buf);
  if (/\.(xls|numbers)$/i.test(file.name)) throw new Error("Save it as CSV or Excel (.xlsx) and try again");
  return imCsv(new TextDecoder().decode(buf));
}
// Rows to objects by column name. The heading row is the first one with a known column in it, so a title line above
// the headings is fine. Blank lines go.
function imObjects(rows, K) {
  const hi = rows.findIndex((r) => r.some((h) => imCol(K, h))); if (hi < 0) return { err: `No ${K.cols[0]} column. Get the template and fill that in` };
  const cols = rows[hi].map((h) => imCol(K, h));
  if (!cols.includes(K.must)) return { err: `No ${K.cols.find((c) => imNorm(c) === K.must) || K.cols[0]} column. Get the template and fill that in` };
  return { xs: rows.slice(hi + 1).map((r, i) => ({ n: hi + i + 2, ...Object.fromEntries(cols.map((c, j) => [c, r[j]]).filter(([c]) => c)) })).filter((o) => Object.keys(o).some((k) => k !== "n" && String(o[k] ?? "").trim())) };
}
const imCol = (K, h) => { const s = imNorm(h); return s ? Object.keys(K.alias).find((k) => K.alias[k].includes(s)) || null : null; };

/* ---- What each kind is, its template, and what each line would do ---- */
const IM_BOOL = (b) => (b ? "Yes" : "No");
const IM_KINDS = {
  labels: { n: "Date labels", what: "Items that get a date label, how long they keep once opened, and where they live.", must: "item",
    cols: ["Item", "Side", "Keeps (days)", "On the list", "Station"],
    alias: { item: ["item", "name", "product"], side: ["side"], life: ["keepsdays", "keeps", "days", "life", "shelflife"], on: ["onthelist", "on", "active", "show"], station: ["station", "where", "lives"] },
    tpl: () => LIVE.labels.slice().sort((a, b) => a.side.localeCompare(b.side) || a.item.localeCompare(b.item)).map((x) => [x.item, sideName(x.side), x.life, IM_BOOL(x.on), x.station || ""]),
    plan: (xs) => xs.map((o) => {
      const item = String(o.item ?? "").trim(), side = imSide(o.side), life = imNum(o.life), on = imYes(o.on, true), station = String(o.station ?? "").trim();
      if (!item) return { o, st: "skip", why: "No item" };
      if (item.length > 60) return { o, st: "skip", why: "Item name over 60 letters" };
      if (!side) return { o, st: "skip", why: "Side must be Bar or Floor" };
      if (!Number.isInteger(life) || life < 1 || life > 365) return { o, st: "skip", why: "Keeps (days) must be a whole number, 1 to 365" };
      if (station.length > 30) return { o, st: "skip", why: "Station over 30 letters" };
      const x = LIVE.labels.find((l) => l.side === side && imKey(l.item) === imKey(item)), line = `${item} · ${sideName(side)} · keeps ${nDays(life)}${on ? "" : " · off the list"}${station ? ` · ${station}` : ""}`;
      if (!x) return { o, st: "new", line, go: () => A_().label(null, "added", { item, side, life, on, station }) };
      if (x.life === life && x.on === on && (x.station || "") === station) return { o, st: "same", line };
      return { o, st: "change", line, was: `keeps ${nDays(x.life)}${x.on ? "" : ", off the list"}${x.station ? `, ${x.station}` : ""}`, go: () => A_().label(x, "edited", { item: x.item, side, life, on, station }) };
    }) },
  items: { n: "Items", what: "Things the bar and floor keep that aren't in Bar Book yet. From a manager they wait for Maintenance to approve.", must: "item",
    cols: ["Item", "Side", "Group", "Kind", "Kept in", "Date label", "Keeps (days)", "At close", "Note"],
    alias: { item: ["item", "name", "product"], side: ["side"], group: ["group", "section", "category"], kind: ["kind", "type"], store: ["keptin", "store", "where", "kept"], label: ["datelabel", "label"], life: ["keepsdays", "keeps", "days", "life"], close: ["atclose", "close", "closing"], note: ["note", "notes"] },
    tpl: () => (LIVE.items || []).filter((x) => x.status === "live").map((x) => [x.item, sideName(x.side), x.group, IT_KINDS[x.kind]?.t || x.kind, IT_STORE[x.store] || x.store, IM_BOOL(x.label), x.life || "", IT_CLOSE[x.close] || x.close, x.note || ""]),
    plan: (xs) => xs.map((o) => {
      const item = String(o.item ?? "").trim(), side = imSide(o.side) || "bar", kind = imPick(IT_KINDS, o.kind, (k) => k.t) ?? null;
      if (!item) return { o, st: "skip", why: "No item" };
      if (item.length > 60) return { o, st: "skip", why: "Item name over 60 letters" };
      if (kind === null) return { o, st: "skip", why: `Kind "${o.kind}" isn't one Bar Book knows. Use one from the template` };
      const k = kind || "other", K = IT_KINDS[k], store = imPick(IT_STORE, o.store) ?? null, close = imPick(IT_CLOSE, o.close) ?? null, life = imNum(o.life) ?? 0, group = String(o.group ?? "").trim() || "Other";
      if (store === null) return { o, st: "skip", why: `Kept in "${o.store}" isn't one Bar Book knows` };
      if (close === null) return { o, st: "skip", why: `At close "${o.close}" isn't one Bar Book knows` };
      if (!Number.isInteger(life) || life < 0 || life > 365) return { o, st: "skip", why: "Keeps (days) must be a whole number, 0 to 365" };
      if (group.length > 40 || String(o.note ?? "").length > 200) return { o, st: "skip", why: "Group over 40 or note over 200 letters" };
      if (itStock(item)) return { o, st: "skip", why: "Already in Bar Book's own list" };
      const def = { item, kind: k, group, side, store: store || K.store, label: o.label === undefined || String(o.label).trim() === "" ? K.label : imYes(o.label, K.label), life, close: close || K.close, note: String(o.note ?? "").trim(), found: "" };
      const line = `${item} · ${sideName(side)} · ${group} · ${IT_STORE[def.store]}`, x = (LIVE.items || []).find((y) => y.side === side && imKey(y.item) === imKey(item));
      if (!x) return { o, st: "new", line: line + (LIVE.owner ? "" : " · waits for Maintenance"), go: () => A_().addItem(def, LIVE.owner) };
      if (["kind", "group", "store", "label", "life", "close", "note"].every((f) => x[f] === def[f])) return { o, st: "same", line };
      if (!LIVE.owner) return { o, st: "skip", line, why: "It's in Bar Book already. Only Maintenance changes an item" };
      return { o, st: "change", line, was: `${IT_STORE[x.store]}, ${x.group}`, go: () => A_().saveItem(x, { ...def, found: x.found || "" }) };
    }) },
  names: { n: "Names", what: "The first names people pick from when they join: managers, bar and floor. Names not in the file stay.", must: "name",
    cols: ["Name", "Role"], alias: { name: ["name", "firstname", "person", "staff"], role: ["role", "team", "side", "job"] },
    tpl: () => [...STAFF.mgr.map((n) => [n, "Manager"]), ...STAFF.bar.map((n) => [n, "Bar"]), ...STAFF.floor.map((n) => [n, "Floor"])],
    plan(xs) {
      const role = (v) => { const s = imNorm(v); return /^(mgr|manager|senior|supervisor|gm|am)/.test(s) ? "mgr" : s.startsWith("bar") ? "bar" : s.startsWith("floor") || s.startsWith("server") || s.startsWith("waiter") ? "floor" : ""; };
      const now = (n) => ["mgr", "bar", "floor"].find((r) => STAFF[r].some((x) => imKey(x) === imKey(n)));
      const RN = { mgr: "Manager", bar: "Bar", floor: "Floor" }, seen = new Set();
      return xs.map((o) => {
        const name = String(o.name ?? "").trim().split(/\s+/)[0] || "", r = role(o.role);
        if (!name) return { o, st: "skip", why: "No name" };
        if (!r) return { o, st: "skip", why: "Role must be Manager, Bar or Floor" };
        if (seen.has(imKey(name))) return { o, st: "skip", why: "In the file twice" }; seen.add(imKey(name));
        const w = now(name), line = `${name} · ${RN[r]}`;
        if (w === r) return { o, st: "same", line };
        const go = { names: true, name, r, was: w };
        return w ? { o, st: "change", line, was: RN[w], go } : { o, st: "new", line, go };
      });
    } },
  setup: { n: "Stock setup", what: "For each product: where it's counted, in what, and its bottle size and weights for weighing the open one.", must: "item",
    cols: ["Item", "Places", "Unit", "Bottle size (ml)", "Empty bottle (g)", "Full bottle (g)", "One portion (g)", "Count it"],
    alias: { item: ["item", "product", "name"], places: ["places", "place", "where", "area", "areas"], unit: ["unit", "countedin"], ml: ["bottlesizeml", "bottlesize", "sizeml", "size", "ml"], e: ["emptybottleg", "emptyg", "empty", "emptyweight", "container", "containerg"], f: ["fullbottleg", "fullg", "full", "fullweight"], pw: ["oneportiong", "portiong", "portion", "portionweight"], count: ["countit", "count", "counted"] },
    tpl() { const seen = new Set(); return ctRows(true).filter((r) => !seen.has(r.item) && seen.add(r.item)).map((r) => [r.item, r.a.join("; "), r.u, r.ml || "", r.e || "", r.f || "", r.pw || "", IM_BOOL(!r.off)]); },
    plan(xs) {
      const rows = new Map(); for (const r of ctRows(true)) if (!rows.has(imKey(r.item))) rows.set(imKey(r.item), r);
      const areas = ctAreas(), seen = new Set();
      return xs.map((o) => {
        const r = rows.get(imKey(o.item)); if (!r) return { o, st: "skip", why: String(o.item ?? "").trim() ? "Not in Bar Book. Import it under Items first" : "No item" };
        if (seen.has(r.item)) return { o, st: "skip", why: "In the file twice" }; seen.add(r.item);
        const u = String(o.unit ?? "").trim() ? CT_UNITS.find((x) => imNorm(x) === imNorm(o.unit)) : r.u;
        if (!u) return { o, st: "skip", why: `Unit must be one of: ${CT_UNITS.join(", ")}` };
        const a = String(o.places ?? "").trim() ? String(o.places).split(/[;,/]/).map((x) => x.trim()).filter(Boolean).map((x) => areas.find((y) => imKey(y) === imKey(x)) || x) : r.a;
        if (a.length > 4 || a.some((x) => x.length > 40)) return { o, st: "skip", why: "Up to 4 places, each under 40 letters" };
        const num = (k, d) => (o[k] === undefined || String(o[k]).trim() === "" ? d : imNum(o[k]));
        const ml = num("ml", r.ml), e = num("e", r.e), f = num("f", r.f), pw = num("pw", r.pw), off = !imYes(o.count, !r.off);
        if ([ml, e, f, pw].some((v) => v === null || v < 0 || v > 20000)) return { o, st: "skip", why: "Sizes and weights must be numbers, 0 to 20000" };
        if (u === "bottle" && e && f && f <= e) return { o, st: "skip", why: "Full bottle must weigh more than empty" };
        const next = { u, a, ml, e, f, pw, off }, same = next.u === r.u && next.a.join("|") === r.a.join("|") && +next.ml === +r.ml && +next.e === +r.e && +next.f === +r.f && +next.pw === +r.pw && next.off === r.off;
        const line = `${r.item} · ${a.join(", ")} · ${u}${u === "bottle" && ml ? ` · ${ml} ml` : ""}${e && f ? ` · ${e} to ${f} g` : ""}${off ? " · not counted" : ""}`;
        return same ? { o, st: "same", line } : { o, st: "change", line, was: `${r.a.join(", ")}, ${r.u}${r.e && r.f ? `, ${r.e} to ${r.f} g` : ""}`, go: { setup: true, item: r.item, next } };
      });
    } },
  count: { n: "Stock count", what: "A count from the notebook or another sheet, for the day it was done. Same columns as Export's stock counts.", must: "item", days: true,
    cols: ["Count date", "Place", "Item", "Full", "Open", "Unit"],
    alias: { day: ["countdate", "shiftdate", "date", "day"], area: ["place", "where", "area"], item: ["item", "product", "name"], full: ["full", "fullones", "sealed", "whole"], open: ["open", "openone", "part"], total: ["total", "count", "qty", "quantity"], unit: ["unit"] },
    tpl: () => ctRows().map((r) => [shiftDay(), r.area, r.item, "", "", r.u]),
    plan(xs, have) {
      const rows = new Map(ctRows(true).map((r) => [`${imKey(r.area)}|${imKey(r.item)}`, r])), seen = new Set();
      return xs.map((o) => {
        const day = imDay(o.day), item = String(o.item ?? "").trim(), area = String(o.area ?? "").trim(), r = rows.get(`${imKey(area)}|${imKey(item)}`);
        if (!day) return { o, st: "skip", why: "Count date missing or not a date" };
        if (day > shiftDay()) return { o, st: "skip", why: "Count date is in the future" };
        if (!item || !area) return { o, st: "skip", why: "Needs a place and an item" };
        let full = imNum(o.full), open = imNum(o.open); const tot = imNum(o.total);
        if (full === null && open === null && tot !== null) { full = Math.floor(tot); open = tot - full; }
        if (full === null && open === null) return { o, st: "skip", why: "Not counted (no Full, Open or Total)" };
        full ??= 0; open ??= 0; if (open >= 1) open /= 100; // 45 means 0.45
        const o100 = Math.round(open * 100);
        if (!Number.isInteger(full) || full < 0 || full > 9999 || o100 < 0 || o100 > 99) return { o, st: "skip", why: "Full must be a whole number and Open a part, like 0.45" };
        const I = r?.item || item, A = r?.area || area, id = ctId(day, A, I);
        if (seen.has(id)) return { o, st: "skip", why: "In the file twice" }; seen.add(id);
        const unit = String(o.unit ?? "").trim() || r?.u || "each", x = have.find((y) => y.id === id), line = `${dayName(day)} · ${A} · ${I}: ${ctSay(unit, full + o100 / 100)}${r ? "" : " · not on the count list"}`;
        const go = () => A_().countLine(id, { day, area: A, item: I, unit, full, open: o100 });
        if (!x) return { o, st: "new", line, go };
        if (x.full === full && x.open === o100 && x.unit === unit) return { o, st: "same", line };
        return { o, st: "change", line, was: ctSay(x.unit, x.full + x.open / 100), go };
      });
    } },
  received: { n: "Deliveries in", what: "Deliveries between counts, so usage works out right. A line already logged is skipped.", must: "item", days: true,
    cols: ["Date", "Item", "Amount", "Unit"],
    alias: { day: ["date", "shiftdate", "day", "delivered"], item: ["item", "product", "name"], qty: ["amount", "qty", "quantity", "count"], unit: ["unit"] },
    tpl: () => [[shiftDay(), "", "", ""]],
    plan(xs, have) {
      const units = new Map(ctRows(true).map((r) => [imKey(r.item), r]));
      return xs.map((o) => {
        const day = imDay(o.day), item = String(o.item ?? "").trim(), qty = imNum(o.qty), r = units.get(imKey(item));
        if (!day) return { o, st: "skip", why: "Date missing or not a date" };
        if (day > shiftDay()) return { o, st: "skip", why: "Date is in the future" };
        if (!item) return { o, st: "skip", why: "No item" };
        if (qty === null || qty <= 0) return { o, st: "skip", why: "Amount must be more than 0" };
        const I = r?.item || item, unit = String(o.unit ?? "").trim() || r?.u || "each", q = Math.round(qty * 100), line = `${dayName(day)} · ${I}: ${ctSay(unit, q / 100)}`;
        if (have.some((y) => y.day === day && imKey(y.item) === imKey(I) && y.qty === q)) return { o, st: "same", line, why: "Already logged" };
        return { o, st: "new", line, go: () => A_().addReceived({ day, item: I, unit, qty: q }) };
      });
    } },
};
const IM_ST = { new: "New", change: "Change", same: "Same", skip: "Skip" };

async function imFile(f) {
  const K = IM_KINDS[IM.kind]; IM.file = f.name; IM.plan = null; IM.done = null; IM.err = ""; IM.busy = true; renderCard("export");
  try {
    const { xs, err } = imObjects(await imRead(f), K);
    if (err) throw new Error(err);
    if (!xs.length) throw new Error("No lines under the headings");
    if (xs.length > 2000) throw new Error("Over 2000 lines. Split it into smaller files");
    let have = [];
    if (K.days) { const ds = xs.map((o) => imDay(o.day)).filter(Boolean).sort(); if (ds.length) have = await A_().daysOf(IM.kind === "count" ? "counts" : "received", ds[0], ds.at(-1), 6000); }
    IM.plan = K.plan(xs, have);
  } catch (e) { IM.err = e.message || "Couldn't read that file"; console.warn(e); }
  IM.busy = false; renderCard("export");
}
async function imSave() {
  const P = IM.plan, go = P.filter((p) => p.go), ch = go.filter((p) => p.st === "change").length;
  if (!go.length) return toast("Nothing to save");
  if (ch && !confirm(`${plural(ch, "line changes something", "lines change things")} already in Bar Book. Save?`)) return;
  IM.busy = true; renderCard("export"); haptic();
  let ok = 0, bad = 0;
  // Names and the stock setup are one record each, so their lines go in one save; the rest a line at a time.
  const one = go.filter((p) => typeof p.go === "function"), names = go.filter((p) => p.go.names), setup = go.filter((p) => p.go.setup);
  for (const p of one) { try { await p.go(); ok++; p.res = "ok"; } catch (e) { bad++; p.res = e.code || e.message; } if ((ok + bad) % 10 === 0) { IM.prog = ok + bad; renderCard("export"); } }
  if (names.length) {
    const n = { mgr: [...STAFF.mgr], bar: [...STAFF.bar], floor: [...STAFF.floor] };
    for (const { go: g } of names) { if (g.was) n[g.was] = n[g.was].filter((x) => imKey(x) !== imKey(g.name)); n[g.r].push(g.name); }
    try { await A_().saveNames(n); ok += names.length; names.forEach((p) => (p.res = "ok")); } catch (e) { bad += names.length; names.forEach((p) => (p.res = e.code || e.message)); }
  }
  if (setup.length) {
    const s = JSON.parse(JSON.stringify(ctSetup()));
    for (const { go: g } of setup) s.items[g.item] = { ...(s.items[g.item] || {}), ...g.next };
    try { await A_().saveCountSetup(s); ok += setup.length; setup.forEach((p) => (p.res = "ok")); } catch (e) { bad += setup.length; setup.forEach((p) => (p.res = e.code || e.message)); }
  }
  IM.busy = false; IM.prog = 0; IM.done = { ok, bad }; renderCard("export");
  toast(bad ? `${ok} saved, ${bad} not saved` : `${plural(ok, "line")} saved. Every phone has it now`);
}
function imTemplate() {
  const K = IM_KINDS[IM.kind]; haptic();
  const help = [["What this is", K.what], ["How", "Fill in or change the lines, keep the headings as they are, then Import it in Bar Book: Team, Export and import, Import."], ["Columns", K.cols.join(", ")], ["Nothing is deleted", "A line you take out of the file stays in Bar Book."]];
  mgSaveFile(`bar-book-${slugName(K.n)}-template.xlsx`, XLSX_TYPE, exXlsx([[K.n, K.cols, K.tpl()], ["How to fill it in", ["About", "Detail"], help]]));
}

function importHtml() {
  const K = IM_KINDS[IM.kind], P = IM.plan;
  const kinds = `<div class="recent">${Object.entries(IM_KINDS).map(([k, x]) => `<button class="chip" data-im-kind="${k}" aria-pressed="${k === IM.kind}">${x.n}</button>`).join("")}</div>`;
  const head = `<p class="note">${esc(K.what)}</p>
    <div class="mini">1. Get the template</div><p class="note">A spreadsheet with the right columns and what's in Bar Book now: ${K.cols.map(esc).join(", ")}. Fill it in on a laptop or phone. A CSV or Excel file with the same headings works too, and so does a file from Export.</p>
    <div class="actions"><button class="btn" data-im-tpl>Template</button></div>
    <div class="mini">2. Choose the file</div><label class="btn im-pick">Choose a CSV or Excel file<input type="file" data-im-file accept=".csv,.xlsx,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden></label>`;
  if (IM.busy) return `${kinds}${head}<p class="note">${IM.prog ? `Saving… ${IM.prog} so far` : "Reading…"}</p>`;
  if (IM.err) return `${kinds}${head}<p class="note im-err">${esc(IM.file)}: ${esc(IM.err)}</p>`;
  if (!P) return `${kinds}${head}`;
  const n = (s) => P.filter((p) => p.st === s).length, go = P.filter((p) => p.go).length;
  const tbl = `<div class="ex-scroll"><table class="ex-t im-t"><thead><tr><th>Line</th><th></th><th>What it does</th></tr></thead><tbody>${P.slice(0, 300).map((p) => `<tr class="im-${p.st}"><td>${p.o.n}</td><td><span class="pill">${p.res === "ok" ? "✓ Saved" : p.res ? "Not saved" : IM_ST[p.st]}</span></td><td>${esc(p.line || Object.values(p.o).slice(1).join(" · "))}${p.was ? `<br><span class="s">Now: ${esc(p.was)}</span>` : ""}${p.why ? `<br><span class="s">${esc(p.why)}</span>` : ""}${p.res && p.res !== "ok" ? `<br><span class="s">${esc(p.res === "permission-denied" ? "Refused by the server: check it's a manager's phone" : p.res)}</span>` : ""}</td></tr>`).join("")}</tbody></table></div>${P.length > 300 ? `<p class="note">First 300 lines shown.</p>` : ""}`;
  return `${kinds}${head}
    <div class="mini">3. Check it, then save</div>
    <p class="note"><b>${esc(IM.file)}</b>: ${n("new")} new, ${n("change")} to change, ${n("same")} the same, ${n("skip")} skipped.${IM.done ? ` <b>Saved ${IM.done.ok}${IM.done.bad ? `, ${IM.done.bad} not saved` : ""}.</b>` : ""}</p>
    ${!IM.done && go ? `<div class="actions"><button class="btn pri" data-im-save>Save ${go === 1 ? "this line" : `these ${go} lines`}</button><button class="btn" data-im-x>Cancel</button></div>` : `<div class="actions"><button class="btn" data-im-x>${IM.done ? "Done" : "Cancel"}</button></div>`}
    ${tbl}`;
}

document.addEventListener("click", (e) => {
  const t = (s) => e.target.closest(s); let x;
  if ((x = t("[data-im-kind]"))) { IM.kind = x.dataset.imKind; IM.plan = null; IM.err = ""; IM.done = null; haptic(); renderCard("export"); return; }
  if (t("[data-im-tpl]")) { imTemplate(); return; }
  if (t("[data-im-save]")) { imSave(); return; }
  if (t("[data-im-x]")) { IM.plan = null; IM.err = ""; IM.done = null; IM.file = ""; renderCard("export"); }
});
document.addEventListener("change", (e) => { const f = e.target.closest("[data-im-file]"); if (f?.files?.[0]) imFile(f.files[0]); });
document.head.insertAdjacentHTML("beforeend", `<style>
.im-pick{display:inline-flex;align-items:center;cursor:pointer}.im-err{color:var(--warn);font-weight:700}
.im-t td:first-child{color:var(--muted);white-space:nowrap}.im-t .pill{white-space:nowrap}.im-new .pill{background:var(--ok);color:#fff}.im-change .pill{background:var(--brass);color:var(--brass-ink)}.im-skip td{color:var(--muted)}
</style>`);
