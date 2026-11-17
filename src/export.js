/* ---------- Export ----------
   Everything the team logs in Bar Book, in one place for the managers: pick the dates, the side, a person and which
   logs, then open it as an Excel workbook (one tab per log), CSV files (for Nory or anything else that imports a
   spreadsheet), a printable table, or copy it straight into a spreadsheet. It reads the shared database, so any
   manager can run it on their own phone, the bar iPad or a laptop, whoever logged it and wherever. Nothing is written.
   No library: the workbook is a few XML files in a plain zip, built here. */
const EX_MAX = 92;
const EX = { tab: "out", from: "", to: "", side: "all", who: "", off: new Set(store.get("exOff", [])), D: null, busy: false, err: false, key: "" };
const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const exDays = (a, b) => { const xs = []; for (let d = b; d >= a && xs.length < EX_MAX; d = addDays(d, -1)) xs.push(d); return xs; };
const exList = (k) => LISTS[k]?.title || k || "";
const exGroup = (k, i) => (LISTS[k] ? groupOf(k, i) : "");
const exDur = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`);
// One row: when it happened, which business day it counts for, the side (blank when it's for both), and everyone named
// on it (for the person filter).
const exRow = (x, side, who, c) => ({ t: ms(x.at), day: x.day || bday(x.at), side: side === "bar" || side === "floor" ? side : "", who: who.filter(Boolean), c });
const EX_KIND = { night: "Tonight's quiz", speed: "Speed drill", starter: "New starter test", b101: "Bar 101" };
const EX_RUN = { started: "Started", finished: "Finished", todo: "Reopened" };
const EX_LOGS = [
  { k: "closing", n: "Closing ticks", what: "Every closing tick, with who and when", cols: ["Side", "List", "Section", "Task", "Was", "Now", "Given to", "By", "Note"],
    rows: (D) => D.events.filter((e) => e.kind === "task").map((e) => exRow(e, e.area, [e.name, e.who], [sideName(e.area), exList(e.list), exGroup(e.list, e.item), e.label, TS[e.from] || e.from, TS[e.to] || e.to, e.who || "", e.name, e.note || ""])) },
  { k: "sections", n: "Closing by section", what: "Who started and who finished each part, and take overs", cols: ["Side", "List", "Section", "Started by", "Finished by", "Taken over", "Everyone on it", "Ticks done"],
    rows(D) {
      const m = new Map();
      for (const e of D.events.filter((e) => e.kind === "task" && (e.to === "doing" || e.to === "done")).sort((a, b) => ms(a.at) - ms(b.at))) {
        const g = exGroup(e.list, e.item) || "Whole list", key = `${e.day}|${e.list}|${g}`;
        let x = m.get(key); if (!x) m.set(key, (x = { e, g, first: e.name, last: "", ppl: new Set(), done: 0 }));
        x.ppl.add(e.name); if (e.to === "done") { x.last = e.name; x.done++; }
      }
      return [...m.values()].map((x) => exRow(x.e, x.e.area, [...x.ppl], [sideName(x.e.area), exList(x.e.list), x.g, x.first, x.last, x.last && x.last !== x.first ? "Yes" : "", [...x.ppl].join(", "), x.done]));
    } },
  { k: "lists", n: "Closing lists", what: "Each list started and finished, how much was done and how long the close took", cols: ["Side", "List", "What", "Done", "Of", "By", "Note", "Close took (min)"],
    rows: (D) => D.events.filter((e) => e.kind === "run").map((e) => { const c = e.to === "finished" && D.closes.find((x) => x.day === e.day && x.side === e.area);
      return exRow(e, e.area, [e.name], [sideName(e.area), exList(e.list), EX_RUN[e.to] || e.to, e.done ?? "", e.required ?? "", e.name, e.note || "", c ? c.mins : ""]); }) },
  { k: "handover", n: "Handovers", what: "Every handover sent, word for word. Its photos stay in Closing reports", cols: ["Side", "Sent by", "Photos", "Summary", "Handover"],
    rows: (D) => D.reports.map((x) => exRow(x, x.side, [x.name], [sideName(x.side), x.name, x.photos || 0, x.summary || "", x.text || ""])) },
  { k: "out", n: "86 log", what: "What was 86'd, by who, and when it came back", cols: ["Item", "What", "By", "Out for"],
    rows: (D) => D.outlog.map((x) => { const o = x.action === "back" && D.outlog.find((y) => y.id === x.id.replace(/-back$/, ""));
      return exRow(x, "", [x.name], [x.itemName, x.action === "back" ? "Back in" : "86'd", x.name, o ? exDur(Math.max(0, Math.round((ms(x.at) - ms(o.at)) / 6e4))) : ""]); }) },
  { k: "logit", n: "Log it", what: "Notes, told a manager, running low, not finished, for tomorrow", cols: ["Side", "Kind", "What", "By"],
    rows: (D) => D.events.filter((e) => e.kind === "log").map((e) => exRow(e, e.area, [e.name], [sideName(e.area), LOG_NAME[e.what] || e.what, e.label, e.name])) },
  { k: "labels", n: "Date labels", what: "Every date label opened, changed or discarded", cols: ["Side", "Item", "What", "Use by", "Use by before", "Days late", "By", "Note"],
    rows: (D) => D.events.filter((e) => e.kind === "label").map((e) => exRow(e, e.area, [e.name], [sideName(e.area), e.label, LB_ACT[e.act] || e.act, e.useBy || "", e.was || "", lateBy(e) || "", e.name, e.note || ""])) },
  { k: "restock", n: "Restock", what: "Every restock asked for, brought up and received", cols: ["Side", "Item", "Amount", "Unit", "For", "Was", "Now", "Person", "By", "Note"],
    rows: (D) => D.events.filter((e) => e.kind === "restock").map((e) => exRow(e, e.area, [e.name, e.who], [sideName(e.area), e.label, e.qty ?? "", e.unit || "", DEST[e.dest] || e.dest || "", e.from === "new" ? "" : RS[e.from] || e.from, RS[e.to] || e.to, e.who || "", e.name, e.note || ""])) },
  { k: "count", n: "Stock counts", what: "Every line counted, by place", cols: ["Place", "Item", "Full", "Open", "Total", "Unit", "Counted by"],
    rows: (D) => D.counts.map((x) => exRow(x, "", [x.name], [x.area, x.item, x.full, x.open / 100, Math.round((x.full + x.open / 100) * 100) / 100, x.unit, x.name])) },
  { k: "received", n: "Deliveries in", what: "Deliveries logged on the stock count", cols: ["Item", "Amount", "Unit", "Logged by"],
    rows: (D) => D.received.map((x) => exRow(x, "", [x.name], [x.item, x.qty / 100, x.unit, x.name])) },
  { k: "issues", n: "Issues", what: "Issues raised, who took them on and the fix", cols: ["Area", "Issue", "Detail", "Urgent", "Status", "Taken by", "Fixed by", "Fixed", "Fix", "Raised by"],
    rows: (D) => D.issues.map((x) => exRow(x, x.area, [x.name, x.who, x.fixedBy], [AREAS.find((a) => a[0] === x.area)?.[1] || x.area || "", x.title, x.detail || "", x.urgent ? "Yes" : "", { open: "Open", taken: "Being fixed", fixed: "Fixed" }[x.status] || x.status, x.who || "", x.fixedBy || "", x.fixedAt ? mgShort(x.fixedAt) : "", x.fix || "", x.name])) },
  { k: "training", n: "Training scores", what: "Quiz, speed drill, Bar 101 and new starter test scores", cols: ["Name", "Kind", "Score", "Of", "Seconds"],
    rows: (D) => D.scores.map((x) => exRow(x, "", [x.name], [x.name, EX_KIND[x.kind] || x.kind, x.score, x.of, x.secs ?? ""])) },
  { k: "sent", n: "Everything sent", what: "A copy of every message sent from Bar Book", cols: ["Message", "By", "Text"],
    rows: (D) => D.sent.map((x) => exRow(x, "", [x.anon ? "" : x.name], [x.what, x.anon ? "No name" : x.name, x.text || ""])) },
];
async function exLoad() {
  const { from, to } = EX, key = `${from}|${to}`, A = A_(), days = exDays(from, to);
  const t0 = Date.parse(from + "T00:00:00Z"), t1 = Date.parse(addDays(to, 1) + "T12:00:00Z");
  EX.busy = true; EX.err = false; EX.key = key; renderCard("export");
  try {
    const [events, outlog, reports, counts, received, issues, scores, sent, closes] = await Promise.all([A.eventsOn(days), A.between("outlog", t0, t1, 3000), A.between("reports", t0, t1, 500),
      A.daysOf("counts", from, to, 6000), A.daysOf("received", from, to, 2000), A.between("issues", t0, t1, 1000), A.between("scores", t0, t1, 3000), A.between("sent", t0, t1, 2000), A.daysOf("closes", from, to, 400)]);
    if (EX.key === key) EX.D = { events, outlog, reports, counts, received, issues, scores, sent, closes };
  } catch (e) { console.warn(e); if (EX.key === key) EX.err = true; }
  if (EX.key === key) { EX.busy = false; renderCard("export"); }
}
// The logs ticked, each with its rows after the filters, oldest first.
function exTables() {
  if (!EX.D) return [];
  return EX_LOGS.map((L) => {
    const rows = L.rows(EX.D).filter((r) => r.day >= EX.from && r.day <= EX.to && (EX.side === "all" || !r.side || r.side === EX.side) && (!EX.who || r.who.includes(EX.who))).sort((a, b) => a.t - b.t);
    return { L, head: ["Shift date", "Time", ...L.cols], rows: rows.map((r) => [r.day, hhmm(new Date(r.t)), ...r.c]) };
  });
}
const exPicked = () => exTables().filter((x) => !EX.off.has(x.L.k) && x.rows.length);
const exPeople = () => [...new Set(EX.D ? EX_LOGS.flatMap((L) => L.rows(EX.D).flatMap((r) => r.who)) : [])].sort((a, b) => a.localeCompare(b));
const exName = (ext) => `bar-book-${EX.from === EX.to ? EX.from : `${EX.from}-to-${EX.to}`}${EX.side === "all" ? "" : `-${EX.side}`}${EX.who ? `-${slugName(EX.who)}` : ""}.${ext}`;
const slugName = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const exAbout = () => [["Exported", mgShort({ toMillis: () => Date.now() })], ["By", LIVE.me || ""], ["Shift dates", EX.from === EX.to ? dayName(EX.from) : `${dayName(EX.from)} to ${dayName(EX.to)}`],
  ["Side", EX.side === "all" ? "Bar and floor" : sideName(EX.side)], ["Person", EX.who || "Everyone"], ["Logs", exPicked().map((x) => x.L.n).join(", ")],
  ["Shift date", "The business day. Anything after midnight counts for the night before, as it does in Bar Book."], ["Photos", "Closing photos stay in Bar Book: Team, Closing reports."]];

function exOutHtml() {
  if (!EX.to) { EX.to = shiftDay(); EX.from = addDays(EX.to, -6); }
  if (!EX.busy && EX.key !== `${EX.from}|${EX.to}`) setTimeout(exLoad);
  const quick = [["Tonight", 0, 0], ["Last night", 1, 1], ["Last 7 nights", 6, 0], ["Last 31 nights", 30, 0]].map(([t, a, b]) => {
    const f = addDays(shiftDay(), -a), to = addDays(shiftDay(), -b);
    return `<button class="chip" data-ex-q="${f}|${to}" aria-pressed="${EX.from === f && EX.to === to}">${t}</button>`; }).join("");
  const T = exTables(), ppl = exPeople(), picked = T.filter((x) => !EX.off.has(x.L.k) && x.rows.length), n = picked.reduce((t, x) => t + x.rows.length, 0);
  const filters = `<p class="note">Everything the team logs, read from the shared database, so any manager can export it from their own phone, the bar iPad or a laptop.</p>
    <div class="recent">${quick}</div>
    <div class="ex-dates"><label>From <input type="date" data-ex-d="from" value="${EX.from}" max="${shiftDay()}"></label><label>To <input type="date" data-ex-d="to" value="${EX.to}" max="${shiftDay()}"></label></div>
    <div class="seg ex-seg">${[["all", "Both"], ["bar", "Bar"], ["floor", "Floor"]].map(([v, t]) => `<button data-ex-side="${v}" aria-pressed="${EX.side === v}">${t}</button>`).join("")}</div>
    <label class="ex-who">Person <select data-ex-who><option value="">Everyone</option>${ppl.map((p) => `<option${p === EX.who ? " selected" : ""} translate="no">${esc(p)}</option>`).join("")}</select></label>`;
  if (EX.busy || !EX.D) return `${filters}<p class="note">${EX.err ? `Couldn't read the logs. Check your signal. <button class="linkbtn" data-ex-again>Try again</button>` : "Reading the logs…"}</p>`;
  const logs = `<div class="mini">Logs <button class="linkbtn" data-ex-all="1">All</button> <button class="linkbtn" data-ex-all="0">None</button></div>
    <div class="ex-logs">${T.map((x) => `<label class="check"><input type="checkbox" data-ex-log="${x.L.k}"${EX.off.has(x.L.k) ? "" : " checked"}> <span><b>${x.L.n}</b> <span class="s">${x.rows.length ? plural(x.rows.length, "line") : "nothing"} · ${x.L.what}</span></span></label>`).join("")}</div>`;
  const none = T.some((x) => x.rows.length) ? "Tick a log with lines in it." : "Nothing logged for these filters. Try more nights, both sides or everyone.";
  return `${filters}
    ${n ? `<div class="actions"><button class="btn pri" data-ex-go="xlsx">Excel workbook</button><button class="btn" data-ex-go="csv">CSV files</button><button class="btn" data-ex-go="docx">Word document</button><button class="btn" data-ex-go="print">Print</button><button class="btn" data-ex-go="copy">Copy</button></div>
      <p class="note">${plural(n, "line")} from ${plural(picked.length, "log")}. <b>Excel workbook</b>: one file, a tab for each log, opens in Excel, Numbers and Google Sheets. <b>CSV files</b>: one for each log, for Nory or any system that imports a spreadsheet. <b>Word document</b>: the tables, ready for a report, opens in Word, Pages and Google Docs. <b>Copy</b> pastes as a table into Word or Docs, and as columns into a spreadsheet. On a phone or the iPad the file goes to the share sheet: Mail, Save to Files, AirDrop or WhatsApp.</p>` : `<p class="note">${none}</p>`}
    ${logs}
    ${n ? `<div class="mini">See it here</div>${picked.map((x) => `<details class="ex-prev"><summary>${x.L.n} <span class="s">${plural(x.rows.length, "line")}</span></summary><div class="ex-scroll">${exTableHtml(x, 60)}</div>${x.rows.length > 60 ? `<p class="note">First 60 lines here. The file has all ${x.rows.length}.</p>` : ""}</details>`).join("")}` : ""}
    <p class="note">Bar Book can't send to Nory by itself: Nory doesn't offer a link for other apps to send to. Import the CSV in Nory, if your account takes a spreadsheet import, or attach it to an email.</p>`;
}
// One card, both ways: Export (what the team logged, out to a file) and Import (a spreadsheet in, src/import.js).
function exportHtml() {
  return `<div class="seg ex-tabs"><button data-ex-tab="out" aria-pressed="${EX.tab === "out"}">Export</button><button data-ex-tab="in" aria-pressed="${EX.tab === "in"}">Import</button></div>${EX.tab === "in" ? importHtml() : exOutHtml()}`;
}
const exTableHtml = (x, max = Infinity) => `<table class="ex-t"><thead><tr>${x.head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${x.rows.slice(0, max).map((r) => `<tr>${r.map((v, i) => `<td${i === 0 ? ' class="nw"' : ""}>${esc(i === 0 ? dayName(v) : v)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;

/* ---- The outputs ---- */
async function exSaveFiles(files) {
  try { if (navigator.canShare?.({ files })) { await navigator.share({ files }); return; } } catch (e) { if (e?.name === "AbortError") return; }
  // A laptop: each file downloads. The browser may ask once to allow several downloads.
  files.forEach((f, i) => setTimeout(() => { const u = URL.createObjectURL(f), a = document.createElement("a"); a.href = u; a.download = f.name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000); }, i * 400));
}
function exGo(how) {
  const xs = exPicked(); if (!xs.length) return toast("Nothing to export. Tick a log with lines in it");
  haptic();
  if (how === "xlsx") return mgSaveFile(exName("xlsx"), XLSX_TYPE, exXlsx([...xs.map((x) => [x.L.n, x.head, x.rows]), ["About this export", ["About", "Detail"], exAbout()]]));
  if (how === "csv") return exSaveFiles(xs.map((x) => new File([toCsv(x.head, x.rows)], exName(`${x.L.k}.csv`).replace(/\.(\w+)\.csv$/, "-$1.csv"), { type: "text/csv" })));
  if (how === "docx") return mgSaveFile(exName("docx"), DOCX_TYPE, exDocx(xs));
  if (how === "copy") {
    // Both at once: a table for Word, Pages or Docs, and tab-separated columns for a spreadsheet or a message.
    const cell = (v) => String(v ?? "").replace(/[\t\r\n]+/g, " ");
    const text = xs.map((x) => [x.L.n, x.head.join("\t"), ...x.rows.map((r) => r.map(cell).join("\t"))].join("\n")).join("\n\n");
    const html = `<meta charset="utf-8">${xs.map((x) => `<h3>${esc(x.L.n)}</h3><table border="1" cellpadding="4" style="border-collapse:collapse;font:10pt Calibri,Arial,sans-serif"><tr>${x.head.map((h) => `<th style="background:#eee;text-align:left">${esc(h)}</th>`).join("")}</tr>${x.rows.map((r) => `<tr>${r.map((v, i) => `<td>${esc(i === 0 ? dayName(v) : v)}</td>`).join("")}</tr>`).join("")}</table>`).join("")}`;
    const done = () => toast("Copied. Paste it into Word, Docs, a spreadsheet or a message"), fail = () => toast("Couldn't copy. Use Word document or Excel workbook instead");
    try { if (window.ClipboardItem) return navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) })]).then(done, () => navigator.clipboard.writeText(text).then(done, fail)); } catch {}
    return navigator.clipboard?.writeText(text).then(done, fail);
  }
  if (how === "print") {
    const st = document.createElement("style");
    st.textContent = "@page{size:A4 landscape;margin:10mm}#print h2{font-size:13pt;margin:10pt 0 4pt}#print table{border-collapse:collapse;width:100%;font-size:8pt;margin-bottom:10pt}#print th,#print td{border:1px solid #999;padding:2pt 4pt;text-align:left;vertical-align:top}#print th{background:#eee}#print tr{break-inside:avoid}#print td.nw{white-space:nowrap}";
    document.head.append(st);
    $("#print").innerHTML = `<h1 style="font-size:15pt;margin:0">Black Tap Soho · Bar Book export</h1><p>${exAbout().slice(0, 5).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join(" · ")}</p>${xs.map((x) => `<h2>${esc(x.L.n)}</h2>${exTableHtml(x)}`).join("")}`;
    addEventListener("afterprint", () => { st.remove(); $("#print").innerHTML = ""; }, { once: true });
    window.print();
  }
}
// An .xlsx file: sheets is [[name, head, rows]]. A first column holding a business day (yyyy-mm-dd) is a real date,
// so it sorts and filters as one. Header in bold, top row frozen, a filter on every column.
const exXml = (s) => String(s).slice(0, 32000).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
const exCol = (i) => { let s = ""; for (let n = i + 1; n; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const exSheetName = (s, used) => { let n = s.replace(/[[\]:*?/\\']/g, "").slice(0, 31) || "Sheet"; for (let i = 2; used.has(n); i++) n = `${n.slice(0, 28)} ${i}`; used.add(n); return n; };
function exXlsx(sheets) {
  const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"', R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"', used = new Set();
  const isDay = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const cell = (v, ref, st = "") => (v === "" || v == null ? "" : typeof v === "number" && isFinite(v) ? `<c r="${ref}"${st}><v>${v}</v></c>`
    : isDay(v) ? `<c r="${ref}" s="2"><v>${Date.parse(v) / 864e5 + 25569}</v></c>` : `<c r="${ref}" t="inlineStr"${st}><is><t xml:space="preserve">${exXml(v)}</t></is></c>`);
  const ws = sheets.map(([, head, rows]) => {
    const all = [head, ...rows], last = exCol(head.length - 1);
    const w = head.map((h, i) => Math.min(60, Math.max(8, ...all.slice(0, 300).map((r) => (i === 0 && r !== head ? 11 : String(r[i] ?? "").length + 2)))));
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet ${NS} ${R}><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
      + `<cols>${w.map((x, i) => `<col min="${i + 1}" max="${i + 1}" width="${x}" customWidth="1"/>`).join("")}</cols><sheetData>`
      + all.map((r, y) => `<row r="${y + 1}">${r.map((v, i) => cell(y ? v : String(v ?? ""), exCol(i) + (y + 1), y ? "" : ' s="1"')).join("")}</row>`).join("")
      + `</sheetData><autoFilter ref="A1:${last}${all.length}"/></worksheet>`;
  });
  const names = sheets.map(([n]) => exSheetName(n, used));
  const files = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${ws.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook ${NS} ${R}><sheets>${names.map((n, i) => `<sheet name="${exXml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets><definedNames>${sheets.map(([, head, rows], i) => `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${exXml(names[i])}'!$A$1:$${exCol(head.length - 1)}$${rows.length + 1}</definedName>`).join("")}</definedNames></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${ws.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${ws.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ["xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet ${NS}><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
    ...ws.map((x, i) => [`xl/worksheets/sheet${i + 1}.xml`, x]),
  ];
  return exZip(files);
}
// A Word file (.docx): a title, then each log as a table with its headings repeated on every page, landscape A4.
const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
function exDocx(xs) {
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"', run = (t, b, sz = 18) => `<w:r><w:rPr>${b ? "<w:b/>" : ""}<w:sz w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${exXml(t)}</w:t></w:r>`;
  const para = (t, b, sz) => `<w:p>${String(t).split("\n").map((l, i) => (i ? "<w:r><w:br/></w:r>" : "") + run(l, b, sz)).join("")}</w:p>`;
  const cell = (t, b) => `<w:tc><w:tcPr>${b ? '<w:shd w:val="clear" w:color="auto" w:fill="EEEEEE"/>' : ""}</w:tcPr>${para(t, b, 16)}</w:tc>`;
  const B = ["top", "left", "bottom", "right", "insideH", "insideV"].map((k) => `<w:${k} w:val="single" w:sz="4" w:space="0" w:color="999999"/>`).join("");
  const table = (x) => `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${B}</w:tblBorders><w:tblCellMar><w:left w:w="60" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${x.head.map(() => `<w:gridCol w:w="${Math.floor(15398 / x.head.length)}"/>`).join("")}</w:tblGrid>`
    + `<w:tr><w:trPr><w:tblHeader/></w:trPr>${x.head.map((h) => cell(h, true)).join("")}</w:tr>${x.rows.map((r) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${r.map((v, i) => cell(i === 0 ? dayName(v) : v ?? "")).join("")}</w:tr>`).join("")}</w:tbl>`;
  const body = para("Black Tap Soho · Bar Book export", true, 32) + para(exAbout().slice(0, 5).map(([k, v]) => `${k}: ${v}`).join(" · "), false, 18)
    + xs.map((x) => para(x.L.n, true, 26) + table(x) + para("", false, 10)).join("")
    + '<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>';
  return new Blob([exZip([
    ["[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ["_rels/.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ["word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${W}><w:body>${body}</w:body></w:document>`],
  ])], { type: DOCX_TYPE });
}
// A plain zip with nothing compressed, which is all an .xlsx needs.
const EX_CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const exCrc = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = EX_CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function exZip(files) {
  const enc = new TextEncoder(), parts = [], cen = []; let off = 0;
  for (const [name, text] of files) {
    const n = enc.encode(name), d = enc.encode(text), crc = exCrc(d), h = new DataView(new ArrayBuffer(30)), c = new DataView(new ArrayBuffer(46));
    // Local header, then the central directory entry: version 2.0, UTF-8 names, stored, dated 1 Jan 1980.
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(12, 0x21, true);
    h.setUint32(14, crc, true); h.setUint32(18, d.length, true); h.setUint32(22, d.length, true); h.setUint16(26, n.length, true);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(14, 0x21, true);
    c.setUint32(16, crc, true); c.setUint32(20, d.length, true); c.setUint32(24, d.length, true); c.setUint16(28, n.length, true); c.setUint32(42, off, true);
    parts.push(new Uint8Array(h.buffer), n, d); cen.push(new Uint8Array(c.buffer), n);
    off += 30 + n.length + d.length;
  }
  const size = cen.reduce((t, x) => t + x.length, 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, size, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...cen, new Uint8Array(e.buffer)], { type: XLSX_TYPE });
}

/* ---- Taps ---- */
document.addEventListener("click", (e) => {
  const t = (s) => e.target.closest(s); let x;
  if ((x = t("[data-ex-q]"))) { [EX.from, EX.to] = x.dataset.exQ.split("|"); haptic(); renderCard("export"); return; }
  if ((x = t("[data-ex-side]"))) { EX.side = x.dataset.exSide; haptic(); renderCard("export"); return; }
  if ((x = t("[data-ex-all]"))) { EX.off = x.dataset.exAll === "1" ? new Set() : new Set(EX_LOGS.map((L) => L.k)); store.set("exOff", [...EX.off]); renderCard("export"); return; }
  // From another card (the date label record): the same nights and side, that log only.
  if ((x = t("[data-ex-only]"))) { const [k, n, side] = x.dataset.exOnly.split("|"); EX.to = shiftDay(); EX.from = addDays(EX.to, 1 - n); EX.side = side || "all"; EX.who = ""; EX.off = new Set(EX_LOGS.map((L) => L.k).filter((j) => j !== k)); haptic(); openAt("export"); return; }
  if ((x = t("[data-ex-tab]"))) { EX.tab = x.dataset.exTab; haptic(); renderCard("export"); return; }
  if ((x = t("[data-ex-go]"))) { exGo(x.dataset.exGo); return; }
  if (t("[data-ex-again]")) { EX.key = ""; renderCard("export"); }
});
document.addEventListener("change", (e) => {
  const d = e.target.closest("[data-ex-d]"), w = e.target.closest("[data-ex-who]"), l = e.target.closest("[data-ex-log]");
  if (d && d.value) {
    EX[d.dataset.exD] = d.value > shiftDay() ? shiftDay() : d.value;
    if (EX.from > EX.to) [EX.from, EX.to] = [EX.to, EX.from];
    if (exDays(EX.from, EX.to).at(-1) !== EX.from) { EX.from = exDays(EX.from, EX.to).at(-1); toast(`Up to ${EX_MAX} nights at a time`); }
    renderCard("export"); return;
  }
  if (w) { EX.who = w.value; renderCard("export"); return; }
  if (l) { l.checked ? EX.off.delete(l.dataset.exLog) : EX.off.add(l.dataset.exLog); store.set("exOff", [...EX.off]); renderCard("export"); }
});
document.head.insertAdjacentHTML("beforeend", `<style>
.ex-dates{display:flex;flex-wrap:wrap;gap:10px;margin:10px 0}.ex-dates label,.ex-who{display:flex;align-items:center;gap:8px;font-weight:700}.ex-dates input,.ex-who select{min-height:44px;font-size:16px}
.seg.ex-tabs{margin-top:0;margin-bottom:10px}.seg.ex-seg{grid-template-columns:1fr 1fr 1fr;margin-top:6px}.ex-who select{flex:1;min-width:0}.ex-who{margin:10px 0}.ex-logs .check b{margin-right:4px}.ex-logs .check{display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--line)}.ex-logs .check input{flex:none;width:22px;height:22px;margin-top:2px}
.ex-logs .s{display:block;font-weight:400}.ex-prev{margin-top:8px;border:1px solid var(--line);border-radius:12px;padding:0 10px}.ex-prev summary{min-height:44px;display:flex;align-items:center;gap:8px;font-weight:700;cursor:pointer}
.ex-scroll{overflow-x:auto;margin:0 -10px 10px;padding:0 10px}.ex-t{border-collapse:collapse;font-size:13px;min-width:100%;width:max-content}.ex-t th,.ex-t td{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top;max-width:260px;min-width:64px}
.ex-t th{position:sticky;top:0;background:var(--surface);white-space:nowrap}.ex-t td.nw{white-space:nowrap}
</style>`);

/* ---- Where it goes ---- */
TC_SUB.export = "Every log out as Excel, CSV, Word, print or copy, and spreadsheets in";
FEATURES.push({ g: "Team", k: "export", adm: 1, n: "Export and import", go: "export", team: 1, what: "Every log in Bar Book out to a file: closing ticks and who did each section, take overs, handovers, 86s, Log it, date labels, restock, stock counts, deliveries, issues, training and everything sent. And spreadsheets in: date labels, items, names, the stock setup with bottle sizes and weights, a past count and deliveries.",
  mgr: "Export: pick the nights, side, person and logs, then Excel, CSV (for Nory or any import), Word, Print or Copy. Import: get the template, fill it in, choose the file, check every line, then save. Nothing is ever deleted." });
PLACE_KW.export = "export import upload word docx template excel spreadsheet csv xlsx download nory laptop print copy file data logs records numbers sheets";
