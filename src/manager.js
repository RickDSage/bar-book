/* ---------- Manager tools ----------
   For the managers and maintenance on the Team page: the weekly summary, the date label record (for an EHO visit),
   training (quiz scores, speed drills, the new starter test and sign-off on the house cocktails), change history with
   undo, and backup and restore. For everyone: the health check, and the pre-shift brief at the top of Morning. All of it
   is read from what the team already does in the app; nothing here is typed in by hand. */
var MG_READY = false;
const MG = { week: null, pilot: null, lb: { days: 7, side: "all", xs: null, busy: false }, tr: { xs: null, busy: false, open: "" }, hist: null, bk: null, health: null };
const A_ = () => LIVE.api;
// The last n business days, tonight first.
const mgDays = (n) => Array.from({ length: n }, (_, i) => addDays(shiftDay(), -i));
const mgSince = (n) => Date.now() - n * 864e5;
const mgShort = (t) => { const d = new Date(ms(t)); return `${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: UK })} ${hhmm(d)}`; };
const mgLoad = async (key, fn, card) => {
  MG[key] = { ...(MG[key] || {}), busy: true, err: false }; renderCard(card);
  try { MG[key] = { ...MG[key], ...(await fn()), busy: false, at: Date.now() }; } catch (e) { MG[key] = { ...MG[key], busy: false, err: true }; console.warn(e); }
  renderCard(card);
};
const mgBusy = (x, what) => (!x || x.busy ? `<p class="note">Reading ${what}…</p>` : x.err ? `<p class="note">Couldn't read ${what}. Check your signal.</p>` : "");
const mgRefresh = (k) => `<button class="linkbtn" data-mg-reload="${k}">Refresh</button>`;
// Business-day items on a list that night (some only show on certain days).
const mgShownOn = (k, day) => { const wd = new Date(day).getUTCDay(); return LISTS[k].items.filter((x) => !x.days || x.days.includes(wd)).map((x) => [x.id, x.t]); };
const LB_ACT = { added: "Added to the list", edited: "Details changed", opened: "Opened", changed: "Changed (new one opened)", binned: "Discarded", found: "Found open, dated", removed: "Taken off the list" };

/* ---------- Weekly summary ---------- */
async function mgWeekData() {
  const days = mgDays(7), A = A_();
  const [outlog, lev, runs, scores] = await Promise.all([A.outlogSince(mgSince(7)), A.labelDays(days), Promise.all(days.map((d) => A.runsOn(d).then((r) => [d, r]))), A.scores(mgSince(7)).catch(() => [])]);
  const counts = new Map();
  for (const x of outlog) if (x.action === "out") counts.set(x.itemName, (counts.get(x.itemName) || 0) + 1);
  const top86 = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  // Closing: each side each night. Tonight's isn't over yet, so it only counts once it's finished.
  const missed = [], none = [];
  for (const [d, rs] of runs) for (const side of LB_SIDES) {
    const k = MODE_LISTS[side].at(-1), r = rs[k];
    if (d === shiftDay() && r?.status !== "finished") continue;
    if (!r) { none.push(`${dayName(d)} ${lower(sideName(side))}`); continue; }
    if (r.status !== "finished") { missed.push({ d, side, line: `left unfinished at ${r.done ?? "?"} of ${r.required ?? "?"}` }); continue; }
    if (r.done >= r.required) continue;
    const ts = await A.tasksOn(d).catch(() => ({}));
    const left = mgShownOn(k, d).filter(([i]) => !["done", "cancelled"].includes(ts[`${k}-${i}`]?.status)).map(([, t]) => t);
    missed.push({ d, side, line: `finished with ${r.required - r.done} not done${r.note ? ` (${r.note})` : ""} by ${r.name}`, left });
  }
  const late = lev.filter((e) => lateBy(e) > 0).sort((a, b) => ms(b.at) - ms(a.at));
  const found = lev.filter((e) => e.act === "found");
  const night = scores.filter((x) => x.kind === "night");
  return { top86, outs: outlog.filter((x) => x.action === "out").length, missed, none, late, found, quiz: night.length ? { n: night.length, avg: night.reduce((t, x) => t + x.score / x.of, 0) / night.length } : null };
}
function weekHtml() {
  const w = MG.week; if (!w) { mgLoad("week", mgWeekData, "week"); return mgBusy(null, "the week"); }
  const busy = mgBusy(w, "the week"); if (busy) return busy;
  const overdue = labelsDue(LB_SIDES).filter((x) => labelDue(x) === "overdue");
  const li = (xs, none) => `<ul class="live">${xs.join("") || `<li>${none}</li>`}</ul>`;
  return `<p class="note">The last 7 nights, from what the team ticked, 86'd and dated in Bar Book. ${mgRefresh("week")}</p>
    <div class="sumcard"><div><span>86s</span><b>${w.outs}</b></div><div><span>Closes short</span><b>${w.missed.length}</b></div><div><span>Labels late</span><b>${w.late.length + overdue.length}</b></div>${w.quiz ? `<div><span>Quiz avg</span><b>${Math.round(w.quiz.avg * 10)}/10</b></div>` : ""}</div>
    <div class="mini">Most 86'd</div>${li(w.top86.slice(0, 8).map(([n, c]) => `<li><span translate="no">${esc(n)}</span> <b>× ${c}</b></li>`), "Nothing 86'd")}
    <div class="mini">Closing not fully done</div>${li(w.missed.map((m) => `<li><b>${esc(dayName(m.d))}, ${esc(lower(sideName(m.side)))}</b>: ${esc(m.line)}${m.left?.length ? `<br><span class="s">${m.left.map(esc).join(" · ")}</span>` : ""}</li>`), "Every close ticked in Bar Book finished in full")}
    ${w.none.length ? `<p class="note">No closing ticked in Bar Book: ${w.none.map(esc).join(", ")}.</p>` : ""}
    <div class="mini">Date labels overdue or changed late</div>${li([...overdue.map((x) => `<li><b>Overdue now:</b> ${esc(x.item)}, use by ${esc(dayName(x.useBy))}</li>`),
      ...w.late.map((e) => `<li>${esc(e.label)}: ${e.act === "binned" ? "discarded" : "changed"} ${nDays(lateBy(e))} late ${byAt(e.name, e.at)}</li>`)], "None late")}
    ${w.found.length ? `<div class="mini">Found open with no label</div>${li(w.found.map((e) => `<li>${esc(e.label)} ${byAt(e.name, e.at)}${e.note ? `<br><span class="s">${esc(e.note)}</span>` : ""}</li>`), "")}` : ""}
    <div class="actions">${sendBtn("week", "Send the week on WhatsApp")}</div>`;
}
SHARE.week = () => {
  const w = MG.week; if (!w || w.busy || w.err) return null;
  const overdue = labelsDue(LB_SIDES).filter((x) => labelDue(x) === "overdue");
  return { what: "Weekly summary", title: `Black Tap Soho · week to ${dayName(shiftDay())}`,
    head: [`🚫 ${w.outs} 86s · ${w.missed.length ? `⚠️ ${plural(w.missed.length, "close")} not fully done` : "✅ every close done"} · 🏷️ ${plural(w.late.length + overdue.length, "label")} late${w.quiz ? ` · 🧠 quiz ${Math.round(w.quiz.avg * 10)}/10` : ""}`],
    parts: [
      { id: "top86", label: "Most 86'd", lines: w.top86.slice(0, 10).map(([n, c]) => `${n} × ${c}`) },
      { id: "missed", label: "Closing not fully done", lines: w.missed.flatMap((m) => [`${dayName(m.d)}, ${lower(sideName(m.side))}: ${m.line}`, ...(m.left || []).map(subLine)]) },
      { id: "none", label: "No closing ticked in Bar Book", lines: w.none, off: true },
      { id: "late", label: "Date labels overdue or changed late", lines: [...overdue.map((x) => `Overdue now: ${x.item}, use by ${dayName(x.useBy)}`), ...w.late.map((e) => `${e.label}: ${e.act === "binned" ? "discarded" : "changed"} ${nDays(lateBy(e))} late (${e.name}, ${dayName(e.day)})`)] },
      { id: "found", label: "Found open with no label", lines: w.found.map((e) => `${e.label} (${e.name}, ${dayName(e.day)})`) },
    ] };
};

/* ---------- Pilot results ----------
   How the pilot is going, week by week since the team started using Bar Book, for a manager to show upstairs. Built only
   from what the app already holds (closes, handovers, date labels, 86s, training), counted, never named: no first names,
   no pay. Up to the last 8 weeks, each week the 7 nights to that night; weeks before anyone used it are left off. */
const PI_WEEKS = 8;
const piDay = (t) => ukDay(ms(t) - 6 * 36e5);
// Minutes after 6am (a business day starts then), so 1:30am counts as later than 11pm.
const piMins = (t) => { const [h, m] = hhmm(new Date(ms(t))).split(":").map(Number); return ((h - 6 + 24) % 24) * 60 + m; };
const piTime = (n) => { const m = Math.round(n) + 360; return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };
const piMid = (xs) => { const s = [...xs].sort((a, b) => a - b), i = s.length >> 1; return s.length ? (s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2) : null; };
const piPct = (a, b) => (b ? Math.round((100 * a) / b) : null);
async function mgPilotData() {
  const A = A_(), today = shiftDay(), days = mgDays(PI_WEEKS * 7), since = Date.parse(addDays(today, -PI_WEEKS * 7) + "T06:00:00Z") - 36e5;
  const [ev, runs, outlog, scores, reports] = await Promise.all([A.eventsOn(days), Promise.all(days.map((d) => A.runsOn(d).then((r) => [d, r]))), A.outlogSince(since), A.scores(since).catch(() => []), A.reportsSince(since)]);
  const wk = (d) => Math.floor(daysFrom(d, today) / 7), W = Array.from({ length: PI_WEEKS }, (_, i) => ({ end: addDays(today, -7 * i), nights: 0, closes: 0, full: 0, sent: [], lbOk: 0, lbLate: 0, dated: 0, outs: 0, drills: 0, quiz: [], signed: 0, who: new Set() }));
  const at = (d) => { const i = wk(d); return i >= 0 && i < PI_WEEKS ? W[i] : null; };
  // Launch: the first night anyone did anything in the app. Closes before it aren't counted as missed.
  const launch = [...ev.map((e) => e.day), ...runs.filter(([, rs]) => Object.keys(rs).length).map(([d]) => d), ...[...outlog, ...scores, ...reports].map((x) => piDay(x.at))].filter(Boolean).sort()[0] || today;
  for (const [d, rs] of runs) for (const side of LB_SIDES) {
    const w = at(d), r = rs[MODE_LISTS[side].at(-1)]; if (!w || d < launch) continue;
    if (d === today && r?.status !== "finished") continue;
    w.nights++;
    if (r?.status === "finished") { w.closes++; if (r.done >= r.required) w.full++; }
  }
  for (const e of ev) {
    const w = at(e.day); if (!w) continue;
    if (e.name) w.who.add(e.name);
    if (e.kind !== "label") continue;
    if (["opened", "changed", "found"].includes(e.act)) w.dated++;
    if (["changed", "binned"].includes(e.act)) lateBy(e) ? w.lbLate++ : w.lbOk++;
  }
  for (const x of outlog) { const w = at(piDay(x.at)); if (!w) continue; if (x.name) w.who.add(x.name); if (x.action === "out") w.outs++; }
  for (const x of scores) { const w = at(x.day || piDay(x.at)); if (!w) continue; if (x.name) w.who.add(x.name); w.drills++; if (x.kind === "night") w.quiz.push((10 * x.score) / x.of); }
  // The first report each side sends each night is its handover; later ones are corrections.
  const firsts = new Map();
  for (const r of reports) { const k = `${piDay(r.at)}|${r.side}`; if (!firsts.has(k) || ms(r.at) < ms(firsts.get(k).at)) firsts.set(k, r); if (r.name) at(piDay(r.at))?.who.add(r.name); }
  for (const [k, r] of firsts) at(k.split("|")[0])?.sent.push(piMins(r.at));
  for (const x of LIVE.signoffs) { const w = x.at && at(piDay(x.at)); if (w) w.signed++; }
  const weeks = W.reverse();
  while (weeks.length > 1 && weeks[0].end < launch) weeks.shift();
  return { launch, weeks: weeks.map((w) => ({ ...w, who: w.who.size })), total: new Set([...ev, ...outlog, ...scores, ...reports].map((x) => x.name).filter(Boolean)).size };
}
// Each line: its name, the week's value as a number (for the bars), and as text. up: whether more is better.
const PI_ROWS = [
  ["closes", "Closes finished in the app", (w) => piPct(w.closes, w.nights), (w) => (w.nights ? `${w.closes} of ${w.nights}` : "–"), 1],
  ["full", "Closes done in full", (w) => piPct(w.full, w.closes), (w) => (w.closes ? `${piPct(w.full, w.closes)}%` : "–"), 1],
  ["sent", "Handover sent, usual time", () => null, (w) => (w.sent.length ? piTime(piMid(w.sent)) : "–"), 0],
  ["labels", "Date labels changed on time", (w) => piPct(w.lbOk, w.lbOk + w.lbLate), (w) => (w.lbOk + w.lbLate ? `${piPct(w.lbOk, w.lbOk + w.lbLate)}%` : "–"), 1],
  ["dated", "Labels dated", (w) => w.dated, (w) => String(w.dated), 1],
  ["outs", "86s logged", (w) => w.outs, (w) => String(w.outs), 0],
  ["drills", "Quizzes and drills done", (w) => w.drills, (w) => String(w.drills), 1],
  ["quiz", "Tonight's quiz, average", (w) => (w.quiz.length ? (10 * w.quiz.reduce((a, b) => a + b, 0)) / w.quiz.length : null), (w) => (w.quiz.length ? `${(w.quiz.reduce((a, b) => a + b, 0) / w.quiz.length).toFixed(1)}/10` : "–"), 1],
  ["signed", "House cocktails signed off", (w) => w.signed, (w) => String(w.signed), 1],
  ["who", "People using it", (w) => w.who, (w) => String(w.who), 1],
];
const piWeek = (w) => dayName(w.end, { day: "numeric", month: "short" });
// Up or down against the week before, for the lines where that means something.
function piTrend(row, weeks) {
  const [, , num, , up] = row; if (weeks.length < 2) return "";
  const a = num(weeks.at(-2)), b = num(weeks.at(-1)); if (a == null || b == null || a === b) return "";
  return `<span class="pi-t ${up ? (b > a ? "good" : "bad") : ""}">${b > a ? "▲" : "▼"}</span>`;
}
function piHead(p) {
  const all = (k) => p.weeks.reduce((t, w) => t + (typeof w[k] === "number" ? w[k] : w[k].length), 0);
  const ok = all("lbOk"), late = all("lbLate");
  return [["Closes in the app", `${all("closes")}/${all("nights")}`], ["Labels on time", ok + late ? `${piPct(ok, ok + late)}%` : "–"], ["86s logged", String(all("outs"))], ["People", String(p.total)]];
}
const piRange = (p) => `${dayName([addDays(p.weeks[0].end, -6), p.launch].sort().at(-1))} to ${dayName(p.weeks.at(-1).end)}`;
function pilotHtml() {
  const p = MG.pilot; if (!p) { mgLoad("pilot", mgPilotData, "pilot"); return mgBusy(null, "the pilot"); }
  const busy = mgBusy(p, "the pilot"); if (busy) return busy;
  const bars = (row) => { const [, , num] = row, vs = p.weeks.map(num), top = Math.max(1, ...vs.filter((v) => v != null)); return vs.every((v) => v == null) ? "" : `<div class="pi-bars" aria-hidden="true">${vs.map((v) => `<i style="height:${v == null ? 0 : Math.max(6, (100 * v) / top)}%"></i>`).join("")}</div>`; };
  return `<p class="note">${esc(piRange(p))}, ${plural(p.weeks.length, "week")}. Counted from what the team did in Bar Book: no names. ${mgRefresh("pilot")}</p>
    <div class="sumcard">${piHead(p).map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("")}</div>
    ${PI_ROWS.map((r) => `<div class="pi-row"><div class="pi-h"><b>${r[1]}</b><span>${esc(r[3](p.weeks.at(-1)))}${piTrend(r, p.weeks)}</span></div>${bars(r)}</div>`).join("")}
    <p class="s">Bars: one a week, oldest on the left. The number is the latest week (${esc(piWeek(p.weeks.at(-1)))}).</p>
    <div class="actions"><button class="btn" data-mg-pilot-img>Save as a picture</button>${sendBtn("pilot", "Send on WhatsApp")}<button class="btn" data-mg-pilot-csv>Save as a spreadsheet</button></div>`;
}
SHARE.pilot = () => {
  const p = MG.pilot; if (!p || p.busy || p.err) return null;
  return { what: "Pilot results", title: `Black Tap Soho · Bar Book pilot · ${piRange(p)}`, head: [piHead(p).map(([k, v]) => `${k}: ${v}`).join(" · ")],
    parts: PI_ROWS.map((r) => ({ id: r[0], label: r[1], one: true, lines: [p.weeks.map((w) => `${piWeek(w)} ${r[3](w)}`).join(" · ")] })) };
};
const piCsv = (p) => toCsv(["Week to", ...PI_ROWS.map((r) => r[1])], p.weeks.map((w) => [piWeek(w), ...PI_ROWS.map((r) => r[3](w))]));
// The same page as one picture (a JPEG goes in WhatsApp and Photos on any phone), in the app's colours.
async function mgPilotImage() {
  await document.fonts?.ready;
  const p = MG.pilot, css = getComputedStyle(document.documentElement), v = (k) => css.getPropertyValue(k).trim();
  const W = 1080, pad = 64, rowH = 118, H = 420 + PI_ROWS.length * rowH + 90, c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d"), F = (w, s) => `${w} ${s}px "Atkinson Hyperlegible", system-ui, sans-serif`;
  g.fillStyle = v("--bg"); g.fillRect(0, 0, W, H);
  g.fillStyle = v("--brass"); g.font = F(700, 30); g.fillText("BLACK TAP SOHO · BAR BOOK PILOT", pad, 92);
  g.fillStyle = v("--fg"); g.font = F(700, 52); g.fillText("How the pilot is going", pad, 156);
  g.fillStyle = v("--muted"); g.font = F(400, 30); g.fillText(`${piRange(p)} · ${plural(p.weeks.length, "week")} · no names`, pad, 202);
  const hd = piHead(p), tw = (W - 2 * pad - 3 * 20) / 4;
  hd.forEach(([k, val], i) => {
    const x = pad + i * (tw + 20); g.fillStyle = v("--surface"); g.strokeStyle = v("--line"); g.lineWidth = 2;
    g.fillRect(x, 240, tw, 130); g.strokeRect(x, 240, tw, 130);
    g.fillStyle = v("--muted"); g.font = F(700, 20); g.fillText(k.toUpperCase(), x + 18, 280, tw - 36);
    g.fillStyle = v("--fg"); g.font = F(700, 48); g.fillText(val, x + 18, 344, tw - 36);
  });
  PI_ROWS.forEach((r, i) => {
    const y = 420 + i * rowH, [, name, num, txt] = r, vs = p.weeks.map(num), top = Math.max(1, ...vs.filter((n) => n != null));
    g.strokeStyle = v("--line"); g.beginPath(); g.moveTo(pad, y); g.lineTo(W - pad, y); g.stroke();
    g.fillStyle = v("--fg"); g.font = F(700, 32); g.fillText(name, pad, y + 48, 560);
    g.fillStyle = v("--brass"); g.font = F(700, 36); g.textAlign = "right"; g.fillText(txt(p.weeks.at(-1)), W - pad, y + 50); g.textAlign = "left";
    if (vs.some((n) => n != null)) {
      const bw = 26, gap = 10, x0 = pad;
      vs.forEach((n, j) => { const h = n == null ? 0 : Math.max(4, (40 * n) / top); g.fillStyle = j === vs.length - 1 ? v("--brass") : v("--muted"); g.fillRect(x0 + j * (bw + gap), y + 102 - h, bw, h); });
    }
  });
  g.fillStyle = v("--muted"); g.font = F(400, 24); g.fillText(`Bars: one a week, oldest on the left. Numbers are the latest week. Made ${dayName(shiftDay())}.`, pad, H - 44, W - 2 * pad);
  return new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.92));
}

/* ---------- Date label record ----------
   Every tap on a date label (opened, changed, discarded, found open, and a manager's changes), by first name and time,
   written by the server with the tap and never editable. For an environmental health visit: send it, or save it as a
   spreadsheet. */
async function mgLbData() {
  const xs = await A_().labelDays(mgDays(MG.lb.days));
  return { xs: xs.sort((a, b) => ms(b.at) - ms(a.at)) };
}
const mgLbRows = () => (MG.lb.xs || []).filter((e) => MG.lb.side === "all" || e.area === MG.lb.side);
function lbLogHtml() {
  const L = MG.lb;
  if (!L.xs && !L.busy && !L.err) { mgLoad("lb", mgLbData, "lblog"); return mgBusy(null, "the label record"); }
  const seg = (k, opts) => `<div class="seg">${opts.map(([v, t]) => `<button data-mg-lb="${k}:${v}" aria-pressed="${String(L[k]) === String(v)}">${t}</button>`).join("")}</div>`;
  const busy = mgBusy(L, "the label record"), xs = mgLbRows();
  const byDay = [...new Set(xs.map((e) => e.day))];
  return `<p class="note">Every date label tap, with who and when. Saved by the server as it happens: nobody can change or delete it.</p>
    ${seg("days", [[7, "7 days"], [14, "14 days"], [30, "30 days"]])}${seg("side", [["all", "Both"], ["bar", "Bar"], ["floor", "Floor"]])}
    ${busy || `${xs.length ? `<div class="actions">${sendBtn("lblog", "Send on WhatsApp")}<button class="btn" data-mg-csv="lblog">Save as a spreadsheet</button></div>` : ""}
      ${byDay.map((d) => `<div class="mini">${esc(dayName(d, { weekday: "long", day: "numeric", month: "short" }))}</div><div class="hist">${xs.filter((e) => e.day === d).map((e) => `<div class="s">${at(e)} · <b>${esc(e.name)}</b> ${esc(labelText(e, null, false))}${e.area ? ` <span class="pill">${esc(lower(sideName(e.area)))}</span>` : ""}</div>`).join("")}</div>`).join("") || `<p class="note">No date label taps in the last ${MG.lb.days} days.</p>`}`}`;
}
const mgCsvRows = () => mgLbRows().map((e) => { const d = new Date(ms(e.at)); return [d.toLocaleDateString("en-GB", { timeZone: UK }), hhmm(d), e.name, sideName(e.area), e.label, LB_ACT[e.act] || e.act, e.useBy || "", e.was || "", lateBy(e) || "", e.note || ""]; });
const csvCell = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : "") + s.replace(/"/g, '""')}"` : s; };
const toCsv = (head, rows) => "﻿" + [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
SHARE.lblog = () => {
  const xs = mgLbRows(); if (!xs.length) return null;
  const days = [...new Set(xs.map((e) => e.day))];
  return { what: "Date label record", title: `Black Tap Soho · date label record · last ${MG.lb.days} days${MG.lb.side === "all" ? "" : `, ${lower(sideName(MG.lb.side))}`}`,
    head: [`${plural(xs.length, "entry", "entries")}, each saved with the name and time`],
    parts: days.map((d) => ({ id: d, label: dayName(d), one: true, lines: xs.filter((e) => e.day === d).map((e) => `${hhmm(new Date(ms(e.at)))} ${e.name}: ${labelText(e, null, false)}`) })) };
};
// A file to keep or send: the share sheet on a phone (Files, WhatsApp, email), else a download.
async function mgSaveFile(name, type, text) {
  const blob = new Blob([text], { type }), file = new File([blob], name, { type });
  const save = () => { const u = URL.createObjectURL(blob), a = document.createElement("a"); a.href = u; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000); };
  try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file] }); return; } } catch (e) { if (e?.name === "AbortError") return; }
  save();
}

/* ---------- Training ----------
   Everyone's quiz results over the last 30 days, speed drill bests, the new starter test, and the house cocktails a
   manager has watched them make and signed off. Fun at the top: this month's leaders. */
const TR_DAYS = 30;
const trPeople = () => {
  const xs = MG.tr.xs || [], names = new Set([...STAFF.bar, ...STAFF.floor, ...xs.map((x) => x.name), ...LIVE.signoffs.map((x) => x.person)]);
  for (const n of [...STAFF.mgr]) if (!xs.some((x) => x.name === n) && !LIVE.signoffs.some((x) => x.person === n)) names.delete(n);
  return [...names].filter(Boolean).sort((a, b) => a.localeCompare(b));
};
function trOf(name) {
  const xs = (MG.tr.xs || []).filter((x) => x.name === name), night = xs.filter((x) => x.kind === "night"), speed = xs.filter((x) => x.kind === "speed");
  const best = speed.filter((x) => x.score === x.of).sort((a, b) => a.secs - b.secs)[0] || speed.sort((a, b) => b.score - a.score || a.secs - b.secs)[0];
  const starter = xs.filter((x) => x.kind === "starter").sort((a, b) => b.score - a.score)[0];
  const signed = LIVE.signoffs.filter((x) => x.person === name);
  return { night, avg: night.length ? night.reduce((t, x) => t + x.score / x.of, 0) / night.length : null, best, starter, signed };
}
const trSig = () => stDrinks();
function trainingHtml() {
  const T = MG.tr;
  if (!T.xs && !T.busy && !T.err) { mgLoad("tr", async () => ({ xs: await A_().scores(mgSince(TR_DAYS)) }), "training"); return mgBusy(null, "training"); }
  const busy = mgBusy(T, "training"); if (busy) return busy;
  const ppl = trPeople().map((n) => [n, trOf(n)]), sig = trSig();
  const quizTop = ppl.filter(([, t]) => t.night.length >= 3).sort((a, b) => b[1].avg - a[1].avg).slice(0, 3);
  const fast = ppl.filter(([, t]) => t.best && t.best.score === t.best.of).sort((a, b) => a[1].best.secs - b[1].best.secs).slice(0, 3);
  const medal = ["🥇", "🥈", "🥉"];
  return `<p class="note">Last ${TR_DAYS} days. Tonight's quiz counts the first go each night; speed drills count every go. ${mgRefresh("tr")}</p>
    <div class="mini">Quiz leaders (3 nights or more)</div><ul class="live">${quizTop.map(([n, t], i) => `<li>${medal[i]} <b translate="no">${esc(n)}</b> ${Math.round(t.avg * 100)}% over ${plural(t.night.length, "night")}</li>`).join("") || "<li>Nobody's done 3 nights yet</li>"}</ul>
    <div class="mini">Fastest perfect speed drill</div><ul class="live">${fast.map(([n, t], i) => `<li>${medal[i]} <b translate="no">${esc(n)}</b> ${t.best.secs} s</li>`).join("") || "<li>No perfect drill yet</li>"}</ul>
    <div class="mini">Everyone</div>
    ${ppl.map(([n, t]) => { const on = T.open === n, ok = t.signed.length >= sig.length;
      return `<article class="notice trrow${on ? " on" : ""}"><button class="trh" data-tr-open="${esc(n)}" aria-expanded="${on}"><b translate="no">${esc(n)}</b>
          <span class="s">${t.avg == null ? "No quiz yet" : `Quiz ${Math.round(t.avg * 100)}% (${t.night.length})`} · ${t.best ? `Speed ${t.best.score}/${t.best.of} in ${t.best.secs} s` : "No speed drill"} · ${t.starter ? `Test ${t.starter.score}/${t.starter.of}` : "No test yet"}</span>
          <span class="pill${ok ? " ok" : ""}">${ok ? "Signed off" : `${t.signed.length} of ${sig.length} signed off`}</span></button>
        ${on ? `<p class="note">Watch them make each one to spec, then sign it off. It shows on their phone too.</p>${sig.map((d) => { const s = t.signed.find((x) => x.drink === d.name);
          return `<div class="st-row"><span translate="no">${esc(d.name)}</span>${s ? `<span class="s">✅ ${esc(s.name)}, ${esc(dayName(bday(s.at)))} <button class="linkbtn" data-tr-undo="${esc(n)}|${esc(d.name)}">Undo</button></span>` : `<button class="btn" data-tr-sign="${esc(n)}|${esc(d.name)}">Sign off</button>`}</div>`; }).join("")}` : ""}</article>`; }).join("") || `<p class="note">Nobody on the names list yet.</p>`}
    <div class="actions">${sendBtn("training", "Send the leaderboard")}</div>`;
}
SHARE.training = () => {
  if (!MG.tr.xs) return null;
  const ppl = trPeople().map((n) => [n, trOf(n)]), sig = trSig().length;
  const quizTop = ppl.filter(([, t]) => t.night.length >= 3).sort((a, b) => b[1].avg - a[1].avg).slice(0, 5);
  const fast = ppl.filter(([, t]) => t.best && t.best.score === t.best.of).sort((a, b) => a[1].best.secs - b[1].best.secs).slice(0, 5);
  return { what: "Training leaderboard", title: "🏆 Black Tap Soho · training leaderboard", head: [`Last ${TR_DAYS} days. Practise > Quiz, Speed and Bar 101 in Bar Book`],
    parts: [
      { id: "quiz", label: "Tonight's quiz", lines: quizTop.map(([n, t], i) => `${i + 1}. ${n}: ${Math.round(t.avg * 100)}% over ${t.night.length} nights`) },
      { id: "speed", label: "Fastest perfect speed drill", lines: fast.map(([n, t], i) => `${i + 1}. ${n}: ${t.best.secs} s`) },
      { id: "signed", label: "Signed off on all house cocktails", lines: ppl.filter(([, t]) => t.signed.length >= sig).map(([n]) => `✅ ${n}`) },
    ] };
};
// On someone's own phone (Practise > New starter): what the managers have signed off.
function stSignHtml(n = 3) {
  if (!LIVE.me) return "";
  const mine = LIVE.signoffs.filter((x) => x.person === LIVE.me), ds = stDrinks();
  return `<div class="sec">${n}. Signed off by a manager</div><p class="note">Make each one for a manager. They sign it off on their phone. ${mine.length} of ${ds.length} so far.</p>
    <div class="recent" translate="no">${ds.map((d) => `<span class="chip"${mine.some((x) => x.drink === d.name) ? ' aria-pressed="true"' : ""}>${mine.some((x) => x.drink === d.name) ? "✅ " : ""}${esc(d.name)}</span>`).join("")}</div>`;
}

/* ---------- Change history, with undo ----------
   Checklists keep every version already (open a list on Shift, then History). Here: date labels and the items the team
   added. Undo is a new change with its own record, so nothing is ever lost. Drink specs are built into the app. */
async function mgHistData() {
  const [lev, items] = await Promise.all([A_().labelDays(mgDays(30)), A_().itemLog().catch(() => [])]);
  return { labels: lev.filter((e) => ["added", "edited", "removed"].includes(e.act)).sort((a, b) => ms(b.at) - ms(a.at)), items };
}
const IT_ACT = { added: "added", changed: "changed", approved: "approved", removed: "took off", restored: "put back" };
function historyHtml() {
  const H = MG.hist; if (!H) { mgLoad("hist", mgHistData, "history"); return mgBusy(null, "the history"); }
  const busy = mgBusy(H, "the history"); if (busy) return busy;
  const lb = H.labels.map((e) => {
    const now = LIVE.labels.find((x) => x.id === e.ref), back = e.act === "removed" && !dupLabel(e.label, e.area), undo = e.act === "edited" && now;
    return `<div class="s">${esc(mgShort(e.at))} · <b>${esc(e.name)}</b> ${esc(labelText(e, null, false))}${back ? ` <button class="linkbtn" data-hi-lb-back="${e.id}">Put it back</button>` : undo ? ` <button class="linkbtn" data-hi-lb-undo="${e.id}">Undo</button>` : ""}</div>`;
  });
  const it = H.items.map((e) => {
    const now = LIVE.items.find((x) => x.id === e.ref), same = now && Object.keys(e.def).every((k) => now[k] === e.def[k]);
    const can = LIVE.owner && !same && (now || !LIVE.items.some((x) => x.item.toLowerCase() === e.def.item.toLowerCase() && x.side === e.def.side));
    return `<div class="s">${esc(mgShort(e.at))} · <b>${esc(e.name)}</b> ${IT_ACT[e.act] || e.act} ${esc(e.def.item)} <span class="s">(${esc(e.def.group)}, ${esc(lower(sideName(e.def.side)))}${e.def.label ? `, label ${e.def.life || "?"} d` : ""})</span>${can ? ` <button class="linkbtn" data-hi-it="${e.id}">${now ? "Put this version back" : "Put it back"}</button>` : ""}</div>`;
  });
  return `<p class="note">Last 30 days. Undo makes a new change, so the record keeps both. Checklist versions are on Shift: open the list, then History. ${mgRefresh("hist")}</p>
    <div class="mini">Date labels</div><div class="hist">${lb.join("") || `<div class="s">No changes</div>`}</div>
    <div class="mini">Items added by the team</div><div class="hist">${it.join("") || `<div class="s">No changes</div>`}</div>
    ${LIVE.owner ? "" : `<p class="note">Only maintenance puts back an item. Managers undo date label changes.</p>`}
    <p class="note">Drink specs are built into Bar Book, so they change only with a new version of the app, and every change is kept in its release history.</p>`;
}
async function mgLbUndo(id) {
  const e = MG.hist.labels.find((x) => x.id === id), x = LIVE.labels.find((l) => l.id === e?.ref); if (!x) return toast("That label isn't on the list now");
  const xs = await A_().eventsOf(x.id, "label").catch(() => null); if (!xs) return toast("Couldn't read its history. Check your signal");
  const prev = xs.filter((p) => p.v < e.v).at(-1); if (!prev) return toast("Nothing before this change");
  if (dupLabel(prev.label, prev.area, x.id)) return toast(`${prev.label} is on the ${lower(sideName(prev.area))}'s list already`);
  track(A_().label(x, "edited", { item: prev.label, side: prev.area, life: prev.life, on: prev.on, station: x.station || "" }).then(() => { MG.hist = null; renderCard("history"); }), "Undone. Every phone has it now", "Not saved. Someone may have just changed it");
}
function mgLbBack(id) {
  const e = MG.hist.labels.find((x) => x.id === id); if (!e) return;
  track(A_().label(null, "added", { item: e.label, side: e.area, life: e.life, on: e.on, station: "" }).then(() => { MG.hist = null; renderCard("history"); }), `${e.label} is back on the labels`, "Not saved. Try again");
}
function mgItBack(id) {
  const e = MG.hist.items.find((x) => x.id === id), now = e && LIVE.items.find((x) => x.id === e.ref); if (!e) return;
  const p = now ? A_().saveItem(now, { ...now, ...e.def, found: now.found }, "restored") : A_().addItem({ ...e.def, found: "" }, e.def.status === "live", "restored");
  track(p.then(() => { MG.hist = null; renderCard("history"); }), `${e.def.item} put back`, "Not saved. Try again");
}

/* ---------- Backup and restore ----------
   A backup is one file with everything Bar Book keeps for the team (photos left out: they're big and kept 30 days).
   Restore puts back what can be changed (checklists, date labels, added items, names and numbers) as new changes,
   never deleting anything. History (reports, the 86 log, the label record) can't be changed, so it isn't restored. */
const BUILD = "__BUILD_VERSION__";
// Times as plain ISO dates. toJSON runs before the replacer, so it reads the original value from the holder.
const mgJson = (x) => JSON.stringify(x, function (k, v) { const o = this[k]; return o && typeof o.toMillis === "function" ? new Date(o.toMillis()).toISOString() : v; }, 1);
async function mgBackup(btn) {
  btn.disabled = true; const was = btn.textContent; btn.textContent = "Reading everything…";
  try {
    const data = await A_().backup(), day = shiftDay();
    await mgSaveFile(`bar-book-backup-${day}.json`, "application/json", mgJson({ app: "Black Tap Bar Book", kind: "backup", version: BUILD, made: new Date().toISOString(), by: LIVE.me, data }));
    store.set("lastBackup", Date.now()); toast("Backup ready");
  } catch { toast("Couldn't read everything. Check your signal"); }
  btn.disabled = false; btn.textContent = was; renderCard("backup");
}
// What in a backup differs from now, section by section.
function mgDiff(d) {
  const lists = Object.entries(Object.fromEntries((d.lists || []).map((l) => [l.id, l]))).filter(([k, l]) => isListKey(k) && Array.isArray(l.items) && JSON.stringify(l.items) !== JSON.stringify(LIVE.lists[k]?.items || STANDARD[k]));
  const lbs = (d.labels || []).filter((l) => l.item && LB_SIDES.includes(l.side) && Number.isInteger(l.life) && l.life >= 1 && l.life <= 365);
  const lbNew = lbs.filter((l) => !dupLabel(l.item, l.side)), lbEdit = lbs.filter((l) => { const x = LIVE.labels.find((y) => y.side === l.side && y.item.trim().toLowerCase() === l.item.trim().toLowerCase()); return x && (x.life !== l.life || x.on !== l.on || (x.station || "") !== (l.station || "")); });
  const items = (d.items || []).filter((x) => x.item && x.status === "live" && !LIVE.items.some((y) => y.item.toLowerCase() === x.item.toLowerCase() && y.side === x.side));
  const names = d.names && JSON.stringify([d.names.mgr, d.names.bar, d.names.floor]) !== JSON.stringify([STAFF.mgr, STAFF.bar, STAFF.floor]) ? d.names : null;
  const contacts = d.contacts && JSON.stringify(d.contacts.list) !== JSON.stringify(LIVE.contacts) ? d.contacts.list : null;
  return { lists, lbNew, lbEdit, items, names, contacts };
}
const isListKey = (k) => Object.keys(STANDARD).includes(k);
function backupHtml() {
  const last = store.get("lastBackup", 0), B = MG.bk;
  const diff = B?.diff, n = diff ? diff.lists.length + diff.lbNew.length + diff.lbEdit.length + diff.items.length + !!diff.names + !!diff.contacts : 0;
  const line = (k, t, c) => (c ? `<label class="check"><input type="checkbox" data-bk="${k}"${B.off?.[k] ? "" : " checked"}> ${t}</label>` : "");
  return `<p class="note">One file with the checklists, date labels and their record, added items, names, numbers, closing reports, the 86 log, issues and training. Photos aren't in it. Keep it in Files or send it to yourself.${last ? ` Last saved on this phone ${esc(mgShort({ toMillis: () => last }))}.` : ""}</p>
    <div class="actions"><button class="btn pri" data-mg-backup>Save a backup</button></div>
    ${LIVE.owner ? `<div class="mini">Restore</div><p class="note">Pick a backup file. You see what's different first; nothing changes until you tap Put back. It only adds and changes, never deletes, and history stays as it is.</p>
      <label class="btn" style="display:inline-flex">Pick a backup file<input type="file" accept=".json,application/json" data-bk-file hidden></label>
      ${B?.err ? `<p class="note warnline">${esc(B.err)}</p>` : ""}
      ${diff ? `<p class="note">From <b>${esc(B.made)}</b>${B.by ? ` by ${esc(B.by)}` : ""}: ${n ? `${plural(n, "difference")}.` : "everything matches now. Nothing to put back."}</p>
        ${line("lists", `Checklists: ${diff.lists.map(([k]) => LISTS[k]?.title || k).join(", ")}`, diff.lists.length)}
        ${line("lbNew", `Date labels missing now: ${diff.lbNew.map((l) => l.item).join(", ")}`, diff.lbNew.length)}
        ${line("lbEdit", `Date labels with other days or stations: ${diff.lbEdit.map((l) => l.item).join(", ")}`, diff.lbEdit.length)}
        ${line("items", `Added items missing now: ${diff.items.map((x) => x.item).join(", ")}`, diff.items.length)}
        ${line("names", "Names to pick from", !!diff.names)}${line("contacts", "Who to call numbers", !!diff.contacts)}
        ${n ? `<div class="actions"><button class="btn pri" data-bk-go>Put back the ticked ones</button></div>` : ""}` : ""}` : `<p class="note">Maintenance can restore from a backup.</p>`}`;
}
async function mgReadBackup(f) {
  try {
    const j = JSON.parse(await f.text());
    if (j?.kind !== "backup" || !j.data) throw new Error("That isn't a Bar Book backup file");
    MG.bk = { made: stamp(new Date(j.made)), by: j.by || "", data: j.data, diff: mgDiff(j.data), off: {} };
  } catch (e) { MG.bk = { err: e.message?.startsWith("That") ? e.message : "Couldn't read that file. Pick a Bar Book backup" }; }
  renderCard("backup");
}
function mgRestore() {
  const B = MG.bk, d = B.diff, A = A_(), ps = [], on = (k) => !B.off[k];
  if (!confirm("Put back the ticked ones? Each goes on every phone as a new change, with your name.")) return;
  if (on("lists")) for (const [k, l] of d.lists) ps.push(A.saveList(k, l.items, Math.max(l.next || 0, LIVE.lists[k]?.next || 0, ...l.items.map((x) => x.id + 1))));
  if (on("lbNew")) for (const l of d.lbNew) ps.push(A.label(null, "added", { item: l.item, side: l.side, life: l.life, on: l.on !== false, station: l.station || "" }));
  if (on("lbEdit")) for (const l of d.lbEdit) { const x = LIVE.labels.find((y) => y.side === l.side && y.item.trim().toLowerCase() === l.item.trim().toLowerCase()); if (x) ps.push(A.label(x, "edited", { item: x.item, side: x.side, life: l.life, on: l.on, station: l.station || "" })); }
  if (on("items")) for (const x of d.items) ps.push(A.addItem({ ...x, found: x.found || "" }, true, "restored"));
  if (on("names") && d.names) ps.push(A.saveNames(d.names));
  if (on("contacts") && d.contacts) ps.push(A.saveContacts(d.contacts));
  let bad = 0;
  track(Promise.all(ps.map((p) => p.catch(() => bad++))).then(() => { if (bad) throw new Error(); MG.bk = null; renderCard("backup"); }), `${plural(ps.length, "change")} put back`, `${bad || "Some"} not saved. Try again`);
}

/* ---------- Health check: is this phone working properly? ---------- */
async function mgHealth() {
  const A = A_(), standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const est = await navigator.storage?.estimate?.().catch(() => null), kept = await navigator.storage?.persisted?.().catch(() => null);
  let ping = null, synced = null;
  if (A && LIVE.me && navigator.onLine) { ping = await A.ping().catch(() => -1); synced = await A.synced(); }
  return { standalone, est, kept, ping, synced, sw: !!navigator.serviceWorker?.controller };
}
function healthHtml() {
  const H = MG.health; if (!H) { mgLoad("health", mgHealth, "health"); return `<p class="note">Checking…</p>`; }
  if (H.busy) return `<p class="note">Checking…</p>`;
  const row = (ok, t, s) => `<div class="hrow"><span class="pill ${ok === true ? "ok" : ok === false ? "no" : ""}">${ok === true ? "OK" : ok === false ? "Check" : "·"}</span><div><b>${t}</b><div class="s">${s}</div></div></div>`;
  const mb = (b) => `${(b / 1048576).toFixed(1)} MB`;
  return `${row(navigator.onLine, "Signal", navigator.onLine ? "Online" : "No signal: changes wait on the phone")}
    ${LIVE.me ? row(H.ping == null ? null : H.ping >= 0, "Bar Book's server", H.ping == null ? "Not checked (no signal)" : H.ping >= 0 ? `Answered in ${H.ping} ms` : "Didn't answer. Try again in a minute") : ""}
    ${LIVE.me ? row(H.synced === null ? null : H.synced && !unsent, "Saved changes", unsent ? `${plural(unsent, "change")} still sending` : H.synced ? "Everything on this phone has reached the server" : H.synced === false ? "Some changes are still waiting to send" : "Not checked") : ""}
    ${row(!!LIVE.me, "Team", LIVE.me ? `Joined as ${esc(LIVE.me)}${LIVE.role && ROLE[LIVE.role] ? `, ${ROLE[LIVE.role]}` : ""}` : "Not joined: drinks only")}
    ${row($("#upd").hidden, "App version", `${esc(BUILD)}${$("#upd").hidden ? ", up to date" : ". A newer version is ready: tap the banner"}`)}
    ${row(H.sw && offlineReady ? true : location.hostname.endsWith("github.io") ? false : null, "Works with no signal", H.sw && offlineReady ? "Saved on the phone" : "Not saved yet: open it once with signal")}
    ${row(H.standalone, "On the home screen", H.standalone ? "Opened from the home screen icon" : "Open in Safari. Add it to the home screen so iPhone keeps its data (Share, then Add to Home Screen)")}
    ${H.est ? row(null, "Space used on this phone", `${mb(H.est.usage || 0)}${H.kept ? ", kept by the phone" : ""}`) : ""}
    <div class="actions"><button class="btn pri" data-mg-reload="health">Check again</button>${sendBtn("health", "Send to maintenance")}<button class="btn" data-mg-reboot>Reload Bar Book</button></div>`;
}
SHARE.health = () => {
  const H = MG.health || {};
  return { what: "Health check", title: `Bar Book health check · ${LIVE.me || "a phone"} · ${stamp(new Date())}`, head: [], parts: [{ id: "h", label: "This phone", one: true, lines: [
    `Signal: ${navigator.onLine ? "online" : "none"}`, `Server: ${H.ping == null ? "not checked" : H.ping >= 0 ? `${H.ping} ms` : "no answer"}`,
    `Waiting to send: ${unsent}${H.synced === false ? " (some still waiting)" : ""}`, `Team: ${LIVE.me ? `${LIVE.me}${LIVE.role ? ` (${LIVE.role})` : ""}` : "not joined"}`,
    `Version: ${BUILD}${$("#upd").hidden ? "" : " (update waiting)"}`, `Offline copy: ${offlineReady ? "yes" : "no"}`, `Home screen: ${H.standalone ? "yes" : "no"}`,
    `Phone: ${navigator.userAgent.match(/\(([^)]+)\)/)?.[1] || "unknown"}`] }] };
};

/* ---------- Pre-shift brief ----------
   At the top of Morning: one look before the doors open, made from what's already in Bar Book. Nobody writes it. */
function briefParts(side = mode) {
  const r = lastReport(), h = r && reportDay(r) === lastNight() ? handoverOf(r) : null, now = toChange([side]), soon = labelsDue([side]).filter((x) => !now.includes(x));
  const games = LIVE.fixtures.filter((x) => x.day === ukDay(Date.now())).sort((a, b) => a.ko.localeCompare(b.ko));
  const iss = openIssues().filter((x) => [side, "other", "cellar", "toilets", "terrace"].includes(x.area) || x.urgent).sort((a, b) => b.urgent - a.urgent);
  return [
    // Another part of the app can add what changed since this person was last in (same shape).
    ...(typeof sinceLast === "function" ? sinceLast(side) : []),
    { id: "out", k: "stock", label: "86'd", lines: [...outNow()].sort() },
    { id: "now", k: "labels", label: "Date labels to change now", lines: now.map((x) => `${x.item} (use by ${dayName(x.useBy)})`), hot: true },
    { id: "soon", k: "labels", label: "Date labels due tomorrow", lines: soon.map((x) => x.item) },
    { id: "next", k: "morning", label: "Last night said, for today", lines: h ? hoSplit(h.next) : [] },
    { id: "issues", k: "issues", label: "Open faults", lines: iss.map((x) => `${x.urgent ? "URGENT: " : ""}${x.title}`), hot: iss.some((x) => x.urgent) },
    { id: "restock", k: "stock", label: "Restocks waiting", lines: rsOpen().filter((x) => DEST_SIDE[x.dest] === side).map((x) => amtOf(x.qty, x.unit, x.item)) },
    { id: "games", k: "football", label: "Games on today", lines: games.map((x) => `${x.ko} ${x.home} v ${x.away}`) },
    { id: "approve", k: "stock", label: "Waiting for you to check", lines: LIVE.owner ? LIVE.items.filter((x) => x.status === "waiting").map((x) => `${x.item} (${x.addedBy})`) : [] },
  ];
}
function briefHtml() {
  if (!LIVE.me) return "";
  const ps = briefParts(), any = ps.filter((p) => p.lines.length);
  const seen = store.get("storySeen", "") === `${shiftDay()}-${mode}`;
  return `<div class="brief"><button class="story-ring${seen ? " seen" : ""}" data-story aria-label="Play tonight's brief"><span class="sr-dot">▶</span><span><b>Tonight's brief</b><small>${seen ? "Watched. Tap to see it again" : `${plural(any.length + 2, "card")}, tap through`}</small></span></button>
    <div class="sec">Before you open</div>
    ${any.length ? any.map((p) => `<button class="bline${p.hot ? " hot" : ""}" data-goto="${p.k}"><b>${p.label}</b><span translate="no">${p.lines.slice(0, 4).map(esc).join(" · ")}${p.lines.length > 4 ? ` +${p.lines.length - 4}` : ""}</span></button>`).join("")
      : `<p class="note">✅ Nothing 86'd, no labels due, no open faults.</p>`}
    <p class="note">Tonight's quiz is ready in Practise: same 10 for everyone.</p>
    <div class="actions">${sendBtn("brief", "Send the brief on WhatsApp")}</div></div>`;
}
SHARE.brief = () => {
  const ps = briefParts().filter((p) => p.lines.length);
  return { what: "Pre-shift brief", title: `Black Tap Soho · ${sideName(mode)} pre-shift · ${dayName(shiftDay())}`, head: [ps.length ? "" : "✅ Nothing 86'd, no labels due, no open faults"].filter(Boolean),
    parts: [...ps.map((p) => ({ id: p.id, label: p.label, lines: p.lines })), { id: "quiz", label: "Tonight's quiz", one: true, lines: ["Practise > Quiz in Bar Book: 10 questions, first go counts"] }] };
};
LINKS.brief = () => "#at=morning"; LINKS.week = () => "#at=week"; LINKS.lblog = () => "#at=lblog"; LINKS.training = () => "#at=tab:practice";

/* ---------- Maintenance setup: everything for the codes on one screen ----------
   Your code, the managers' codes (names from the managers list), the team code, then a check that each code works.
   Each step ticks itself off from what's saved, so it can be left and picked up again. */
const weakCode = (c) => /^(\d)\1+$/.test(c) || "0123456789".includes(c) || "9876543210".includes(c) || /^(19|20)\d\d$/.test(c);
const SU = { pins: {}, test: {}, teamDone: store.get("teamCodeSet", false) };
const suSteps = () => {
  const mg = STAFF.mgr, set = managersOnly().map((x) => x.name);
  return [["you", "Your own code", !!ownerEntry()], ["mgr", "The managers' codes", mg.length > 0 && mg.every((n) => set.includes(n))],
    ["team", "The team code", SU.teamDone || LIVE.staff.filter((x) => !x.username).length > 1], ["test", "Check they work", LIVE.seniors.length > 0 && LIVE.seniors.every((x) => SU.test[x.id] === true)]];
};
function setupHtml() {
  const st = suSteps(), done = st.filter((x) => x[2]).length, me = ownerEntry(), mgrs = managersOnly();
  const tick = (ok) => `<span class="pill ${ok ? "ok" : ""}">${ok ? "✓ Done" : "To do"}</span>`;
  const pin = (k, ph = "4 digits") => `<input data-su-pin="${esc(k)}" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" placeholder="${ph}" value="${esc(SU.pins[k] || "")}">`;
  const left = STAFF.mgr.filter((n) => !mgrs.some((x) => x.name === n));
  return `<div class="cprog"><b>${done} of ${st.length} done</b><span class="dots" aria-hidden="true">${st.map((x) => `<i class="${x[2] ? "ok" : ""}"></i>`).join("")}</span></div>
    <div class="su"><div class="suh"><b>1. ${st[0][1]}</b>${tick(st[0][2])}</div>
      ${me ? `<p class="note">Set. You unlock any phone on the team by picking <b translate="no">${esc(me.name)}</b> and typing it.</p>`
        : `<p class="note">You'll log in like the managers: pick your name, type your code.</p><div class="surow"><span translate="no">${esc(firstName(LIVE.me))}</span>${pin("owner")}</div>`}</div>
    <div class="su"><div class="suh"><b>2. ${st[1][1]}</b>${tick(st[1][2])}</div>
      <p class="note">One each, different from yours and each other's. Give them in person, never in a message. Names come from Names to pick from.</p>
      ${mgrs.map((x) => `<div class="surow"><span translate="no">${esc(x.name)}</span><span class="pill ok">✓ code set</span></div>`).join("")}
      ${left.slice(0, Math.max(0, LIVE.api.MAX_SENIORS - mgrs.length)).map((n) => `<div class="surow"><span translate="no">${esc(n)}</span>${pin("m:" + n)}</div>`).join("")}
      ${left.length > LIVE.api.MAX_SENIORS - mgrs.length ? `<p class="note">Up to ${LIVE.api.MAX_SENIORS} managers: ${left.slice(LIVE.api.MAX_SENIORS - mgrs.length).map(esc).join(", ")} can't have a code until one comes off.</p>` : ""}</div>
    ${!me || left.length ? `<div class="actions"><button class="btn pri" data-su-save>Save the codes</button></div>` : ""}
    <div class="su"><div class="suh"><b>3. ${st[2][1]}</b>${tick(st[2][2])}</div>
      <p class="note">Everyone types it once to join. 4 to 8 numbers nobody would guess. Changing it takes every phone off, this one too: do it before the team joins, then join again with it.</p>
      <div class="surow"><input data-su-team type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="off" placeholder="New team code" value="${esc(SU.team || "")}"><button class="btn" data-su-team-go>Set it</button></div></div>
    <div class="su"><div class="suh"><b>4. ${st[3][1]}</b>${tick(st[3][2])}</div>
      <p class="note">Type each code to check it's the one saved. Nothing unlocks and no tries are counted.</p>
      ${LIVE.seniors.map((x) => `<div class="surow"><span translate="no">${esc(x.name)}${x.id === OWNER_ID ? " (you)" : ""}</span>${pin("t:" + x.id, "Type it")}<button class="btn" data-su-test="${esc(x.id)}">Check</button>${SU.test[x.id] === true ? `<span class="pill ok">✓ Works</span>` : SU.test[x.id] === false ? `<span class="pill no">Doesn't match</span>` : ""}${x.tries >= LIVE.api.MAX_TRIES ? `<button class="btn pri" data-sn-reset="${esc(x.id)}">Unlock</button>` : ""}</div>`).join("") || `<p class="note">Set the codes first.</p>`}
      ${(LIVE.gate?.tries || 0) >= LIVE.api.GATE_MAX ? `<p class="note warnline">Joining is locked after too many wrong team codes. <button class="linkbtn" id="gate-reset">Unlock joining</button></p>` : ""}</div>
    ${done === st.length ? `<p class="qz-got">✅ All set. The team joins with the team code, managers unlock with theirs.</p>` : ""}`;
}
async function suSave(btn) {
  const A = A_(), jobs = [];
  if (!ownerEntry() && SU.pins.owner) jobs.push([firstName(LIVE.me), SU.pins.owner, OWNER_ID]);
  for (const n of STAFF.mgr) if (SU.pins["m:" + n]) jobs.push([n, SU.pins["m:" + n]]);
  if (!jobs.length) return toast("Type at least one code");
  if (jobs.some(([, p]) => !/^[0-9]{4}$/.test(p))) return toast("Each code is 4 digits");
  if (new Set(jobs.map(([, p]) => p)).size < jobs.length) return toast("Two of those are the same. Each one must be different");
  const weak = jobs.filter(([, p]) => weakCode(p)).map(([n]) => n);
  if (weak.length && !confirm(`${weak.join(", ")}: that code is easy to guess (like 1111 or 1234). Use it anyway?`)) return;
  btn.disabled = true; let ok = 0;
  for (const j of jobs) { try { await A.setSenior(...j); ok++; delete SU.pins[j[2] === OWNER_ID ? "owner" : "m:" + j[0]]; } catch (e) { toast(`${j[0]}: ${e.message || "not saved"}`); } }
  btn.disabled = false; if (ok) toast(`${plural(ok, "code")} saved. Now check they work in step 4`); renderCard("setup");
}
function suTeam() {
  const c = (SU.team || "").trim();
  if (!/^[0-9]{4,8}$/.test(c)) return toast("The team code is 4 to 8 numbers");
  if (weakCode(c) && !confirm("That team code is easy to guess (like 0000 or 1234). Use it anyway?")) return;
  if (!confirm("Set the team code? Every phone comes off the team, this one too unless it's the password login, and everyone joins again with the new code.")) return;
  track(A_().setTeamCode(c).then(() => { SU.teamDone = true; store.set("teamCodeSet", true); SU.team = ""; renderCard("setup"); }), "Team code set. Tell the team in person", "Not changed");
}
async function suTest(id) {
  const pin = SU.pins["t:" + id] || ""; if (!/^[0-9]{4}$/.test(pin)) return toast("Type the 4 digit code");
  SU.test[id] = await A_().checkPin(id, pin).catch(() => null); delete SU.pins["t:" + id];
  if (SU.test[id] == null) toast("Couldn't check. Check your signal"); renderCard("setup");
}
document.addEventListener("input", (e) => {
  const p = e.target.closest("[data-su-pin]"); if (p) SU.pins[p.dataset.suPin] = p.value.replace(/\D/g, "");
  if (e.target.closest("[data-su-team]")) SU.team = e.target.value.replace(/\D/g, "");
});
document.addEventListener("click", (e) => {
  const t = (s) => e.target.closest(s); let x;
  if ((x = t("[data-su-save]"))) suSave(x);
  else if (t("[data-su-team-go]")) suTeam();
  else if ((x = t("[data-su-test]"))) suTest(x.dataset.suTest);
});

/* ---------- Alerts when Bar Book opens ----------
   No push (sending to a locked phone needs Firebase's paid plan): when the app is opened or brought back to the front,
   a banner says what needs this person now, and the Team badge counts it. Tap one to go there; × hides them until
   something changes. */
let alShown = "";
function alertsNow() {
  if (!LIVE.me || !MG_READY) return [];
  const xs = [], now = toChange([mode]), r = lastReport(), hour = +new Date().toLocaleTimeString("en-GB", { hour: "2-digit", hour12: false, timeZone: UK });
  if (now.length) xs.push({ id: `lb${now.map((x) => x.id + x.v).join()}`, hot: 1, t: `🚨 ${URGENT(now.length)}: ${now.slice(0, 3).map((x) => x.item).join(", ")}`, go: "labels" });
  if (r && reportDay(r) === lastNight() && store.get("hoRead", "") !== r.id && hour >= 6 && hour < 18) xs.push({ id: `ho${r.id}`, t: `📋 Last night's ${lower(sideName(mode))} handover is in, from ${handoverOf(r).by}. Read it`, go: "morning" });
  if (LIVE.owner) { const w = LIVE.items.filter((x) => x.status === "waiting"); if (w.length) xs.push({ id: `it${w.map((x) => x.id).join()}`, t: `🆕 ${plural(w.length, "item")} to check: ${w.slice(0, 3).map((x) => x.item).join(", ")}`, go: "stock" }); }
  if (LIVE.admin) {
    const a = newAsks().length + newTells().length; if (a) xs.push({ id: `in${a}${LIVE.asks[0]?.id || ""}`, t: `📥 ${plural(a, "new message")} from the team`, go: newAsks().length ? "inbox" : "tells" });
    const logs = LIVE.events.filter((e) => e.kind === "log" && e.uid !== LIVE.uid && !e.pending && ms(e.at) > store.get("alLogs", 0));
    if (logs.length) xs.push({ id: `lg${logs.length}${logs.at(-1).id}`, t: `📝 ${plural(logs.length, "new Log it entry", "new Log it entries")}: ${logs.slice(-2).map((e) => `${e.name}, ${e.label}`).join("; ")}`, go: "send", logs: 1 });
  }
  return xs;
}
function renderAlerts(force) {
  let box = $("#alerts");
  if (!box) { $("#net").insertAdjacentHTML("afterend", `<div class="gut alerts" id="alerts" role="status" hidden></div>`); box = $("#alerts"); }
  const off = new Set(store.get("alOff", [])), xs = alertsNow().filter((x) => !off.has(x.id));
  const sig = xs.map((x) => x.id).join("|");
  if ((!force && sig === alShown) || cur === "station") { if (!xs.length || cur === "station") box.hidden = true; return; }
  alShown = sig;
  box.hidden = !xs.length;
  box.innerHTML = xs.length ? `<div class="al-in"><b>Needs you now</b><button class="al-x" data-al-x aria-label="Hide these">×</button>${xs.map((x) => `<button class="al${x.hot ? " hot" : ""}" data-al-go="${x.go}" data-al-id="${esc(x.id)}">${esc(x.t)}</button>`).join("")}</div>` : "";
}
// The Team badge counts new messages already, so they aren't counted twice.
const alBadge = () => { const off = new Set(store.get("alOff", [])); return alertsNow().filter((x) => !off.has(x.id) && !x.id.startsWith("in")).length; };
document.addEventListener("click", (e) => {
  const g = e.target.closest("[data-al-go]"), x = e.target.closest("[data-al-x]");
  if (!g && !x) return;
  const ids = g ? [g.dataset.alId] : [...$$("#alerts [data-al-id]")].map((b) => b.dataset.alId);
  store.set("alOff", [...new Set([...store.get("alOff", []), ...ids])].slice(-60));
  if (ids.some((i) => i.startsWith("lg"))) store.set("alLogs", Date.now());
  $("#alerts").hidden = true; alShown = "";
  if (g) { haptic(); openAt(g.dataset.alGo); scrollTo(0, 0); }
});
// Shown when the app opens (once the team's data is in) and each time it comes back to the front.
document.addEventListener("visibilitychange", () => { if (!document.hidden) { alShown = ""; renderAlerts(true); } });
setTimeout(() => renderAlerts(true), 2500);


/* ---------- Tonight's brief as stories ----------
   The same brief, full screen, one card at a time like stories: bars along the top, tap the right side (or swipe left)
   for the next, the left side to go back, hold to pause, × to close. Each card moves on by itself after 8 seconds. */
const STORY_MS = 8000;
let sto = null;
function storyCards() {
  const ps = briefParts().filter((p) => p.lines.length), hot = ps.filter((p) => p.hot).length;
  return [
    { k: "", label: `${sideName(mode)} · ${dayName(shiftDay(), { weekday: "long", day: "numeric", month: "long" })}`, big: ps.length ? `${plural(ps.length, "thing")} to know${hot ? `, ${hot} urgent` : ""}` : "All clear tonight", lines: ps.map((p) => p.label) },
    ...ps.map((p) => ({ k: p.k, label: p.label, lines: p.lines, hot: p.hot })),
    { k: "tab:practice", label: "Tonight's quiz", big: "10 questions. First go counts.", lines: ["Same 10 for everyone", "Then try a speed drill and beat your best"], end: true },
  ];
}
function storyOpen() {
  if (!$("#story")) document.body.insertAdjacentHTML("beforeend", `<div id="story" class="story" role="dialog" aria-modal="true" aria-label="Tonight's brief" hidden></div>`);
  sto = { i: 0, xs: storyCards(), t0: Date.now(), paused: 0 };
  $("#story").hidden = false; document.body.classList.add("storyon"); store.set("storySeen", `${shiftDay()}-${mode}`);
  storyDraw(); storyTimer();
}
function storyClose() { if (!sto) return; sto = null; clearInterval(storyTimer.h); $("#story").hidden = true; document.body.classList.remove("storyon"); if (cur === "tally") renderTally(); }
function storyGo(d) { if (!sto) return; const n = sto.i + d; if (n < 0) { sto.t0 = Date.now(); return storyDraw(); } if (n >= sto.xs.length) return storyClose(); sto.i = n; sto.t0 = Date.now(); haptic(); storyDraw(); }
function storyTimer() {
  clearInterval(storyTimer.h);
  storyTimer.h = setInterval(() => {
    if (!sto || document.hidden) return;
    if (sto.paused) { sto.t0 += 100; return; }
    const f = Math.min(1, (Date.now() - sto.t0) / STORY_MS), bar = $(`#story .sb i[data-n="${sto.i}"]`);
    if (bar) bar.style.width = `${f * 100}%`;
    if (f >= 1 && !sto.xs[sto.i].end) storyGo(1);
  }, 100);
}
function storyDraw() {
  const c = sto.xs[sto.i];
  $("#story").innerHTML = `<div class="sbars">${sto.xs.map((_, j) => `<span class="sb"><i data-n="${j}" style="width:${j < sto.i ? 100 : 0}%"></i></span>`).join("")}</div>
    <button class="st-x" data-story-x aria-label="Close">×</button>
    <div class="st-card${c.hot ? " hot" : ""}"><div class="st-k">${esc(c.label)}</div>${c.big ? `<div class="st-big">${esc(c.big)}</div>` : ""}
      <ul class="st-l" translate="no">${c.lines.slice(0, 9).map((l) => `<li>${esc(l)}</li>`).join("")}${c.lines.length > 9 ? `<li>+${c.lines.length - 9} more</li>` : ""}</ul>
      <div class="st-act">${c.k ? `<button class="btn pri" data-story-go="${esc(c.k)}">${c.end ? "Take the quiz" : "Go there"}</button>` : ""}${c.end ? sendBtn("brief", "Send the brief") : ""}</div></div>
    <button class="st-prev" data-story-step="-1" aria-label="Back"></button><button class="st-next" data-story-step="1" aria-label="Next"></button>`;
}
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-story]")) { haptic(); storyOpen(); return; }
  if (!sto) return;
  if (e.target.closest("[data-story-x]")) return storyClose();
  const g = e.target.closest("[data-story-go]"); if (g) { const k = g.dataset.storyGo; storyClose(); openAt(k); scrollTo(0, 0); return; }
  if (e.target.closest("[data-send]")) { storyClose(); return; }
  const s = e.target.closest("[data-story-step]"); if (s) storyGo(+s.dataset.storyStep);
});
// Hold to pause, swipe sideways to move, down to close. Escape closes, arrows move.
let stTouch = null;
document.addEventListener("pointerdown", (e) => { if (sto && e.target.closest("#story")) { sto.paused = 1; stTouch = { x: e.clientX, y: e.clientY }; } });
document.addEventListener("pointerup", (e) => {
  if (!sto || !stTouch) return; sto.paused = 0;
  const dx = e.clientX - stTouch.x, dy = e.clientY - stTouch.y; stTouch = null;
  if (dy > 90 && Math.abs(dx) < 60) { e.preventDefault(); storyClose(); }
  else if (Math.abs(dx) > 50 && Math.abs(dy) < 60) storyGo(dx < 0 ? 1 : -1);
});
document.addEventListener("keydown", (e) => { if (!sto) return; if (e.key === "Escape") storyClose(); if (e.key === "ArrowRight") storyGo(1); if (e.key === "ArrowLeft") storyGo(-1); });
document.head.insertAdjacentHTML("beforeend", `<style>
.story-ring{display:flex;align-items:center;gap:12px;width:100%;text-align:left;color:var(--fg);margin-top:12px;padding:6px 0}
.sr-dot{flex:none;width:52px;height:52px;border-radius:50%;display:grid;place-items:center;font-size:18px;color:var(--brass);background:var(--surface);box-shadow:0 0 0 3px var(--bg),0 0 0 6px var(--brass)}
.story-ring.seen .sr-dot{box-shadow:0 0 0 3px var(--bg),0 0 0 5px var(--line);color:var(--muted)}.story-ring b{display:block;font-size:17px}.story-ring small{display:block;color:var(--muted);font-size:13px}
body.storyon{overflow:hidden}.story{position:fixed;inset:0;z-index:60;background:#0d0c0a;color:#f4f1ea;display:flex;flex-direction:column;padding:calc(env(safe-area-inset-top,0px) + 10px) 16px calc(env(safe-area-inset-bottom,0px) + 20px);touch-action:none;user-select:none}
.sbars{display:flex;gap:4px}.sb{flex:1;height:3px;border-radius:2px;background:#ffffff40;overflow:hidden}.sb i{display:block;height:100%;background:#fff}
.st-x{position:absolute;top:calc(env(safe-area-inset-top,0px) + 18px);right:10px;z-index:3;width:44px;height:44px;font-size:30px;color:#fff}
.st-card{position:relative;z-index:2;margin:auto 0;max-width:640px;width:100%;align-self:center;pointer-events:none}.st-card .btn,.st-card a{pointer-events:auto}
.st-k{font-size:14px;letter-spacing:.1em;text-transform:uppercase;color:#c9a45c}.st-card.hot .st-k{color:#ff6b5b}
.st-big{font-family:var(--display);font-size:42px;line-height:1.05;text-transform:uppercase;margin-top:10px}
.st-l{list-style:none;margin:16px 0 0;padding:0}.st-l li{font-size:22px;line-height:1.3;padding:8px 0;border-bottom:1px solid #ffffff1f}
.st-act{display:flex;flex-wrap:wrap;gap:8px;margin-top:22px}
.st-prev,.st-next{position:absolute;top:70px;bottom:0;z-index:1}.st-prev{left:0;width:33%}.st-next{right:0;width:67%}
@media (min-width:700px){.st-big{font-size:56px}.st-l li{font-size:26px}}
</style>`);

/* ---------- Where it goes on the Team page ---------- */
Object.assign(TC_SUB, { week: "Most 86'd, closes not fully done, late labels", pilot: "Week by week since launch, to show your manager", lblog: "Every date label tap, for an EHO visit", training: "Quiz scores, speed drills, sign-off on the house cocktails",
  history: "Undo changes to date labels and added items", setup: "Your code, the managers' codes, the team code, then check they work", backup: "Save everything to a file, and put it back", health: "Signal, saving, version: is this phone OK?" });
function mgCards() {
  if (!MG_READY) return [];
  return LIVE.admin ? [...(LIVE.owner ? [["setup", "Set up codes", setupHtml, (() => { const st = suSteps(), n = st.filter((x) => x[2]).length; return n === st.length ? { t: "✓ all set" } : { t: `${n} of ${st.length}`, hot: 1 }; })()]] : []), ["week", "Weekly summary", weekHtml], ["pilot", "Pilot results", pilotHtml], ["lblog", "Date label record", lbLogHtml], ["training", "Training", trainingHtml], ["history", "Change history", historyHtml], ["backup", "Backup and restore", backupHtml]] : [];
}
const mgHealthCard = () => (MG_READY ? [["health", "Health check", healthHtml]] : []);
FEATURES.push(
  { g: "Team", k: "week", n: "Weekly summary", go: "week", team: 1, what: "The last 7 nights for the managers: what was 86'd most, closes not fully done and why, and date labels changed late.", mgr: "Read it and send it on WhatsApp." },
  { g: "Team", k: "pilot", n: "Pilot results", go: "pilot", team: 1, what: "Week by week since the team started: closes finished, handover times, labels on time, 86s, training and how many people use it. Counts only, no names.", mgr: "Save it as a picture or send it to show how the pilot is going." },
  { g: "Team", k: "lblog", n: "Date label record", go: "lblog", team: 1, what: "Every date label opened, changed or discarded, by first name and time, for an environmental health visit.", mgr: "Send it on WhatsApp or save it as a spreadsheet." },
  { g: "Team", k: "training", n: "Training", go: "training", team: 1, what: "Quiz and speed drill scores for everyone, leaderboards, and sign-off on the house cocktails by a manager.", mgr: "Sign off each house cocktail once you've watched it made to spec." },
  { g: "Team", k: "health", n: "Health check", go: "health", what: "Whether this phone is online, saving, up to date and ready with no signal.", staff: "Something not syncing? Check here, then send it to maintenance." });
Object.assign(PLACE_KW, { week: "weekly summary report", pilot: "pilot results trends stats numbers manager report", lblog: "label record eho audit inspection", training: "training leaderboard scores sign off", health: "health sync version not working broken offline" });

document.addEventListener("click", (e) => {
  const t = (s) => e.target.closest(s); let x;
  if ((x = t("[data-mg-reload]"))) { const k = x.dataset.mgReload, card = { week: "week", pilot: "pilot", tr: "training", hist: "history", health: "health" }[k]; MG[k] = k === "tr" ? { xs: null } : null; renderCard(card); return; }
  if ((x = t("[data-mg-lb]"))) { const [k, v] = x.dataset.mgLb.split(":"); MG.lb[k] = k === "days" ? +v : v; if (k === "days") MG.lb.xs = null; haptic(); renderCard("lblog"); return; }
  if (t("[data-mg-csv]")) { mgSaveFile(`date-label-record-${shiftDay()}.csv`, "text/csv", toCsv(["Date", "Time", "Who", "Side", "Item", "What", "Use by", "Use by before", "Days late", "Note"], mgCsvRows())); return; }
  if (t("[data-mg-pilot-img]")) { haptic(); mgPilotImage().then((b) => mgSaveFile(`bar-book-pilot-${shiftDay()}.jpg`, "image/jpeg", b)); return; }
  if (t("[data-mg-pilot-csv]")) { mgSaveFile(`bar-book-pilot-${shiftDay()}.csv`, "text/csv", piCsv(MG.pilot)); return; }
  if ((x = t("[data-tr-open]"))) { MG.tr.open = MG.tr.open === x.dataset.trOpen ? "" : x.dataset.trOpen; haptic(); renderCard("training"); return; }
  if ((x = t("[data-tr-sign]"))) { const [p, d] = x.dataset.trSign.split("|"); haptic(); track(A_().signOff(p, d), `${d}: signed off for ${p}`, "Not saved. Try again"); return; }
  if ((x = t("[data-tr-undo]"))) { const [p, d] = x.dataset.trUndo.split("|"); track(A_().unSign(p, d), "Sign-off taken back", "Not saved. Try again"); return; }
  if ((x = t("[data-hi-lb-undo]"))) { mgLbUndo(x.dataset.hiLbUndo); return; }
  if ((x = t("[data-hi-lb-back]"))) { mgLbBack(x.dataset.hiLbBack); return; }
  if ((x = t("[data-hi-it]"))) { mgItBack(x.dataset.hiIt); return; }
  if ((x = t("[data-mg-backup]"))) { mgBackup(x); return; }
  if (t("[data-bk-go]")) { mgRestore(); return; }
  if (t("[data-mg-reboot]")) { location.reload(); }
});
document.addEventListener("change", (e) => {
  const f = e.target.closest("[data-bk-file]"); if (f?.files?.[0]) { mgReadBackup(f.files[0]); return; }
  const c = e.target.closest("[data-bk]"); if (c && MG.bk) MG.bk.off[c.dataset.bk] = !c.checked;
});
document.head.insertAdjacentHTML("beforeend", `<style>
.trrow{padding:0;overflow:hidden}.trh{display:block;width:100%;text-align:left;padding:12px 14px;color:var(--fg)}.trh b{display:block;font-size:18px}
.trh .s{display:block;margin-top:2px}.trh .pill{margin-top:6px;display:inline-block}.trrow.on{border-color:var(--brass)}.trrow .st-row,.trrow .note{margin-inline:14px}
.trrow .st-row:last-child{margin-bottom:10px}.trrow .st-row .s{font-size:13px}
.hrow{display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--line)}.hrow .pill{flex:none;min-width:48px;text-align:center}
.brief{margin-bottom:6px}.bline{display:block;width:100%;text-align:left;background:var(--surface);border:1px solid var(--line);border-left:4px solid var(--brass);border-radius:12px;padding:10px 12px;margin-top:8px;color:var(--fg)}
.bline b{display:block;font-size:13px;letter-spacing:.05em;text-transform:uppercase;color:var(--brass)}.bline span{display:block;font-size:16px;margin-top:2px;line-height:1.35}
.bline.hot{border-left-color:var(--warn)}.bline.hot b{color:var(--warn)}
.su{border-top:1px solid var(--line);margin-top:12px;padding-top:6px}.suh{display:flex;justify-content:space-between;align-items:center;gap:8px}.suh b{font-size:17px}
.surow{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:8px}.surow>span:first-child{min-width:90px;font-weight:700}.surow input{width:120px;flex:0 1 160px}
.pi-row{padding:10px 0;border-bottom:1px solid var(--line)}.pi-h{display:flex;justify-content:space-between;gap:10px;align-items:baseline}.pi-h b{font-size:16px}
.pi-h span{font-weight:700;color:var(--brass);white-space:nowrap}.pi-t{margin-left:6px;font-size:12px;color:var(--muted)}.pi-t.good{color:var(--ok)}.pi-t.bad{color:var(--warn)}
.pi-bars{display:flex;align-items:flex-end;gap:4px;height:34px;margin-top:6px}.pi-bars i{flex:0 1 22px;background:var(--muted);border-radius:3px 3px 0 0;opacity:.6}.pi-bars i:last-child{background:var(--brass);opacity:1}
.alerts{margin-top:8px}.al-in{position:relative;background:var(--surface);border:1px solid var(--brass);border-radius:14px;padding:10px 12px}.al-in>b{display:block;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--brass);padding-right:36px}
.al{display:block;width:100%;text-align:left;color:var(--fg);padding:8px 0;border-top:1px solid var(--line);margin-top:6px;font-size:15.5px;line-height:1.35}.al.hot{color:var(--warn);font-weight:700}
.al-x{position:absolute;top:4px;right:6px;width:36px;height:36px;font-size:22px;color:var(--muted)}
</style>`);
MG_READY = true;
