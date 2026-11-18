/* ---------- Standout features ----------
   Smart 86 swaps that keep the drink balanced, batching into a bottle, Shift replay, voice commands, the order
   draft from the stock count, the closing timer, last orders, the offline badge, clock themes, the seasonal menu,
   accessible mode, one-hand mode, and sound and vibration cues. Everything reads what Bar Book already keeps: nothing
   here is a second copy of the 86 board, the count or the closing. Settings that are only for this phone stay on it. */
var SD_READY = false;
var SD = { set: { voice: true, sound: true, a11y: false, onehand: false, ...store.get("sd", {}) } };
const sdSave = () => store.set("sd", SD.set);
const sdMin = (t) => { const [h, m] = (t || "").split(":").map(Number); return h * 60 + m; };
const sdNowMin = () => { const [h, m] = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: UK }).split(":").map(Number); return h * 60 + m; };
const sdVenue = () => ({ lastOrders: "", dayAt: "07:00", nightAt: "19:00", ...(LIVE.venue || {}) });
const sdMl = (n) => { const r = Math.round(n / 2.5) * 2.5; return r % 1 ? r.toFixed(1) : String(r); };

/* ---------- 1. Smart 86 swaps: keep the balance ----------
   When something is out and the swap is another juice or sweetener, the amount changes so the drink tastes the same,
   and the rest of the spec is nudged to match. Sour drinks balance on acid against sugar, so the swap matches the
   missing one on what it's there for (acid for a juice, sugar for a syrup), then any sugar or acid it adds or takes
   away comes off or goes back on the drink's own syrup or citrus line.
   Grams per ml. Acid: lemon and lime juice are about 6% acid and orange 0.8% (Dave Arnold, Liquid Intelligence, 2014).
   Sugar in the juices: USDA FoodData Central (raw lime 1.7 g, lemon 2.5 g, orange 8.4 g per 100 g). Sugar syrup is
   taken as 1:1 by weight (about 0.62 g of sugar per ml), honey syrup 2:1 and agave syrup as sold: these three are worked
   out from their recipes, so they are close estimates rather than lab figures. */
const SD_BAL = [
  { re: /^lime juice/i, a: 0.06, s: 0.017, use: "a" },
  { re: /^lemon juice/i, a: 0.06, s: 0.025, use: "a" },
  { re: /^orange juice/i, a: 0.008, s: 0.084, use: "s" },
  { re: /^sugar syrup|^simple syrup|^gomme/i, a: 0, s: 0.62, use: "s" },
  { re: /^agave syrup|^agave nectar/i, a: 0, s: 0.93, use: "s" },
  { re: /^honey syrup/i, a: 0, s: 0.75, use: "s" },
];
const sdBalOf = (name) => SD_BAL.find((b) => b.re.test(name || ""));
// The swap's bottle, from the swap's own words ("Use lemon juice (same kind).").
function sdSwapItem(sw) {
  const low = (sw || "").toLowerCase();
  return MK.items.filter((x) => low.includes(x.n.toLowerCase())).sort((a, b) => b.n.length - a.n.length)[0] || null;
}
// What changes in the spec when this drink is made with tonight's swaps: [{ i, from, to, why, main }]. main is the swap
// itself (its line is the missing one); the others nudge the drink's own syrup or citrus line.
function sdRebalance(d, o) {
  if (!o.miss.length) return [];
  const ch = [], used = new Set();
  for (const m of o.miss) {
    const line = d.spec[m.i] || "", q = line.match(/^([\d.]+) ml (.*)/), A = q && sdBalOf(q[2]);
    const it = sdSwapItem(m.swap), B = it && sdBalOf(it.n);
    if (!q || !A || !B || A === B) continue;
    const qa = +q[1], k = A.use, qb = Math.min(qa * 2, Math.round((qa * A[k]) / B[k] / 2.5) * 2.5);
    ch.push({ i: m.i, main: 1, from: line, to: `${sdMl(qb)} ml ${it.n.toLowerCase()}`, why: k === "a" ? "same sourness" : "same sweetness" });
    used.add(m.i);
    // What the swap adds or takes away on the other side, put right on the drink's own line for it.
    const other = k === "a" ? "s" : "a", diff = qa * A[other] - qb * B[other];
    d.spec.forEach((l, i) => {
      if (used.has(i) || o.miss.some((x) => x.i === i)) return;
      const lq = l.match(/^([\d.]+) ml (.*)/), C = lq && sdBalOf(lq[2]);
      if (!C || C.use !== other || !C[other]) return;
      const nq = Math.max(0, +lq[1] + diff / C[other]);
      if (Math.abs(nq - lq[1]) < 2.5) return;
      used.add(i);
      ch.push({ i, from: l, to: nq < 1.25 ? `Leave out the ${lq[2]}` : `${sdMl(nq)} ml ${lq[2]}`, why: other === "s" ? (diff > 0 ? "the swap is less sweet" : "the swap is sweeter") : diff > 0 ? "the swap is less sour" : "the swap is more sour" });
    });
  }
  return ch;
}
// Every place that shows a swap (the spec line, the banner, Rapid fire, the iPad, WhatsApp specs) reads plOutOf, so the
// balanced amount goes in there once: the swap says "Use 10 ml agave syrup (same sweetness)", and adj holds the other
// lines that change with it.
const sdOut0 = plOutOf, SD_OD = new Map();
let sdOdSig = "";
plOutOf = function (d) {
  const o = sdOut0(d); if (!o.miss.length) return o;
  if (sdOdSig !== OUT_SIG) { SD_OD.clear(); sdOdSig = OUT_SIG; }
  if (SD_OD.has(d.id)) return SD_OD.get(d.id);
  const ch = sdRebalance(d, o);
  const r = { ...o, miss: o.miss.map((m) => { const c = ch.find((x) => x.main && x.i === m.i); return c ? { ...m, swap: `Use ${c.to} (${c.why}).`, bal: c } : m; }), adj: ch.filter((c) => !c.main) };
  SD_OD.set(d.id, r);
  return r;
};
// Mark the other lines the swap changes, under the line itself.
const sdMark0 = plOutMark;
plOutMark = function (d) {
  sdMark0(d);
  for (const c of plOutOf(d).adj || []) { const li = $$("#sheet ul.spec > li")[c.i]; if (li && !li.querySelector(".pl-swap")) li.insertAdjacentHTML("beforeend", `<em class="pl-swap" translate="no">→ ${esc(c.to)} (${esc(c.why)})</em>`); }
};
// The drink's state tonight, on the spec, the iPad and wherever the banner shows: can make, with a swap, or not tonight.
// A house cocktail made any other way says so, so nobody takes it for the house spec.
const sdHouse = (d) => /black tap|signature/i.test(d.section);
const sdAdj = (d) => (sdHouse(d) ? `<span class="sd-adj">Adjusted: not the house spec</span>` : "");
plOutBanner = function (d) {
  if (isOut(d.name)) return "";
  const o = plOutOf(d);
  if (!o.miss.length) return `<div class="sd-state ok" role="status"><b>✓ Can make tonight</b>${plOutKeys().size ? `<span>Nothing it needs is 86'd.</span>` : ""}</div>`;
  const alts = o.ok ? [] : plAlts(d);
  if (o.ok) return `<div class="sd-state swap" role="status"><b>⚠ Can make with a swap</b>${sdAdj(d)}${o.miss.map((m) => `<div>No <span translate="no">${esc(m.it.n)}</span>: ${m.swap ? esc(m.swap) : "leave it out, it's only a touch."}</div>`).join("")}
    ${(o.adj || []).map((c) => `<div>And <span translate="no">${esc(c.to)}</span> instead of <span translate="no">${esc(c.from)}</span> (${esc(c.why)}).</div>`).join("")}
    ${o.miss.some((m) => m.bal) ? `<small>Amounts worked out from the sugar and acid in each, so it tastes like the spec. Taste before it goes out.</small>` : ""}</div>`;
  const fl = SD.flow && SD.flow.id === d.id && SD.flow.sig === OUT_SIG ? SD.flow : null;
  if (fl) return `<div class="sd-state swap" role="status"><b>\u21bb Going with the flow</b>${sdAdj(d)}${fl.lines.map((t) => `<div translate="no">${esc(t)}</div>`).join("")}<small>The guest is fine with it being a little different. Tell them what changed.</small>
    <div class="pl-alts"><button class="chip" data-sd-flow-off="${d.id}">Undo</button></div></div>`;
  return `<div class="sd-state no" role="status"><b>✕ Can't make tonight</b><div>No <span translate="no">${esc(o.miss.filter((m) => !m.swap && !m.minor).map((m) => m.it.n).join(", "))}</span>, and nothing close in the bar to swap in.</div>
    <div class="pl-alts"><button class="btn pri" data-sd-flow="${d.id}">\u21bb Go with the flow</button></div>
    ${alts.length ? `<div class="pl-alts">Or pick: ${alts.map((x) => `<button class="chip" ${cur === "station" ? "data-sx-id" : "data-pl-alt"}="${x.id}" translate="no">${esc(x.name)}</button>`).join("")}</div>` : ""}</div>`;
};
// Go with the flow: the guest doesn't mind, or it can't be found. Each missing thing takes the closest bottle the bar
// has (same kind first, then the same family, booze or not), or is left out when it's only a small part of the drink.
// If something big still has nothing, it opens the closest drink that can be made instead.
function sdFlow(d) {
  const o = plOutOf(d), out = plOutKeys(), inDrink = new Set((MK.reqs.get(d.id) || []).map((r) => r.it.k)), lines = [];
  const vol = d.spec.reduce((n, l) => n + (+(l.match(/^([\d.]+) ml/) || [])[1] || 0), 0) || 1;
  for (const m of o.miss) {
    if (m.swap) { lines.push(`No ${m.it.n}: ${m.swap}`); continue; }
    const pick = (f) => MK.items.find((x) => x !== m.it && !out.has(x.k) && !inDrink.has(x.k) && plStocked.has(x.k) && f(x));
    const x = pick((y) => y.kind === m.it.kind) || (m.it.fam && pick((y) => y.fam === m.it.fam));
    const ml = +((d.spec[m.i] || "").match(/^([\d.]+) ml/) || [])[1] || 0;
    if (x) lines.push(`No ${m.it.n}: use ${x.n} instead${ml ? `, ${sdMl(ml)} ml` : ""}`);
    else if (m.minor || ml / vol < 0.15) lines.push(`No ${m.it.n}: leave it out`);
    else return null;
  }
  return lines;
}


/* ---------- 2. Batch it: into a bottle or tub ----------
   Pick the container and it works out how many drinks fit, every amount, and the water. Stirred drinks get 20% water
   on top of the batch: Death & Co ("add water at about 20% of the total volume") and Diageo Bar Academy ("20-25%")
   both use that, so a batched Negroni pours ready, with no stirring. Shaken drinks take no water (the shake does it),
   fizz goes on to order, and egg, cream or foamer is never batched. Fresh lime and lemon must be used the day they are
   squeezed (Liquid Intelligence), so a batch with them is for tonight only. */
const SD_JARS = [[700, "70 cl bottle"], [1000, "1 litre bottle"], [5000, "5 litre tub"]];
function sdBatchPlan(d, jar) {
  const m = d.method.toLowerCase(), spec = d.spec.join(" ");
  const stirred = /stir/.test(m) && !/short stir/.test(m) && !/shake/.test(m);
  const fizz = (l) => /^top|prosecco|soda|tonic|lemonade|ginger (beer|ale)|cola|red bull|champagne/i.test(l);
  const never = /egg white|aquafaba|foamer|cream|ice cream/i.test(spec);
  const parts = d.spec.map((l) => ({ l, q: l.match(/^([\d.]+) ml (.*)/) })).filter((x) => x.q && !fizz(x.l));
  const per = parts.reduce((n, x) => n + +x.q[1], 0); if (!per || never) return { never, per };
  const water = stirred ? per * 0.2 : 0, serves = Math.floor(jar / (per + water));
  const citrus = parts.some((x) => /lime|lemon|grapefruit/i.test(x.q[2]) && /juice/i.test(x.q[2]));
  return { per, serves, stirred, citrus, water: Math.round((water * serves) / 5) * 5, lines: parts.map((x) => [Math.round((+x.q[1] * serves) / 5) * 5, x.q[2]]),
    fizz: d.spec.filter(fizz), extra: d.spec.filter((l) => !/^[\d.]+ ml /.test(l) && !fizz(l)), pour: Math.round(per + water), shaken: /shake/.test(m) };
}
function sdBatchHtml(d) {
  const jar = SD.jar || 1000, p = sdBatchPlan(d, jar);
  if (p.never) return `<details class="subs sd-batch"><summary>Batch it<span class="cnt">not this one</span></summary><p class="note" style="margin:4px 12px 12px">Egg, foamer or cream: make it to order, it doesn't keep.</p></details>`;
  if (!p.per || p.serves < 2) return "";
  return `<details class="subs sd-batch"${SD.batchOpen ? " open" : ""}><summary>Batch it into a bottle<span class="cnt">${p.serves} drinks</span></summary><div class="sd-in">
    <div class="chips" role="group" aria-label="Container">${SD_JARS.map(([v, t]) => `<button class="chip" data-sd-jar="${v}" aria-pressed="${v === jar}">${t}</button>`).join("")}</div>
    <p class="sd-big"><b>${p.serves}</b> drinks in a ${esc(SD_JARS.find((x) => x[0] === jar)[1])}</p>
    <ul class="spec" translate="no">${p.lines.map(([n, t]) => `<li><span class="q">${n} ml</span><span>${esc(t)}</span></li>`).join("")}${p.water ? `<li><span class="q">${p.water} ml</span><span>cold water (20%)</span></li>` : ""}</ul>
    <p class="note"><b>To serve:</b> ${p.stirred ? `pour ${p.pour} ml straight from the fridge ${/none|served up/i.test(d.ice) ? "into the chilled glass" : "over fresh ice"}. No stirring.` : p.shaken ? `shake ${p.per} ml with ice, as normal: the shake adds the water.` : `pour ${p.per} ml over ice and finish as the spec says.`}${p.extra.length ? ` Each glass also gets: ${esc(p.extra.join(", "))}.` : ""}${p.fizz.length ? ` Add ${esc(p.fizz.join(", ").toLowerCase())} to each glass to order.` : ""}</p>
    ${p.citrus ? `<p class="note sd-warn">⚠️ Fresh citrus: use the batch tonight and bin what's left at close. Label it with today's date.</p>` : `<p class="note">Keep it in the fridge with a date label. No fresh juice, so it keeps.</p>`}
    <div class="actions">${sendBtn("batch", "Send the batch", String(d.id))}</div></div></details>`;
}
SHARE.batch = (id) => {
  const d = D[+id], jar = SD.jar || 1000, p = d && sdBatchPlan(d, jar); if (!p || !p.serves) return null;
  return { what: `${d.name} batch`, title: `${d.name} batch · ${SD_JARS.find((x) => x[0] === jar)[1]} · ${p.serves} drinks`, head: [p.citrus ? "Fresh citrus: tonight only" : "Keeps in the fridge with a date label"],
    parts: [{ id: "b", label: "Into the container", lines: [...p.lines.map(([n, t]) => `${n} ml ${t}`), ...(p.water ? [`${p.water} ml cold water`] : [])] },
      { id: "s", label: "To serve", one: true, lines: [p.stirred ? `Pour ${p.pour} ml, no stirring` : p.shaken ? `Shake ${p.per} ml with ice` : `Pour ${p.per} ml over ice`] }] };
};

/* ---------- 3. Shift replay ----------
   One night, start to finish, for the managers: every 86 and back in, Log it, date label, closing tick, restock,
   fault, what was sent and the handover, in time order with who. Read once when opened, nothing new is stored. */
SD.rp = { day: "", side: "all", data: null, busy: false };
function sdReplayRows(x) {
  const r = [], at = (t) => ms(t), night = SD.rp.day, inNight = (t) => ukDay(at(t) - 6 * 36e5) === night;
  for (const e of x.events) {
    const side = e.area, w = e.name;
    if (e.kind === "log") r.push({ t: e.at, side, ic: "📝", txt: `${LOG_NAME[e.what] || "Logged"}: ${e.label}`, w });
    else if (e.kind === "task") r.push({ t: e.at, side, ic: e.to === "done" ? "✅" : "↩️", txt: `${LISTS[e.list]?.short || e.list}: ${e.label}${e.to === "done" ? "" : ` (${e.to})`}${e.note ? `, ${e.note}` : ""}`, w });
    else if (e.kind === "run") r.push({ t: e.at, side, ic: "🏁", txt: `${LISTS[e.list]?.short || e.list} ${e.to === "done" ? "finished" : e.to}: ${e.done}/${e.required}${e.note ? `, ${e.note}` : ""}`, w });
    else if (e.kind === "label") r.push({ t: e.at, side, ic: "🏷️", txt: `Label ${e.act}: ${e.label}${e.useBy ? `, use by ${dayName(e.useBy)}` : ""}`, w });
    else if (e.kind === "restock") r.push({ t: e.at, side, ic: "📦", txt: `Restock ${e.to}: ${e.label}`, w });
  }
  for (const o of x.outlog.filter((o) => inNight(o.at))) r.push({ t: o.at, side: "", ic: o.action === "out" ? "🚫" : "🔄", txt: `${o.action === "out" ? "86'd" : "Back in"}: ${o.itemName}`, w: o.name });
  for (const i of x.issues.filter((i) => inNight(i.at))) r.push({ t: i.at, side: i.area, ic: "🔧", txt: `${i.urgent ? "URGENT fault" : "Fault"}: ${i.title}`, w: i.name });
  for (const s of x.sent.filter((s) => inNight(s.at))) r.push({ t: s.at, side: "", ic: "📤", txt: `Sent: ${s.what}`, w: s.anon ? "" : s.name });
  for (const p of x.reports.filter((p) => inNight(p.at))) r.push({ t: p.at, side: p.side, ic: "📋", txt: `Handover sent: ${p.summary || sideName(p.side)}`, w: p.name, big: 1 });
  return r.filter((y) => SD.rp.side === "all" || !y.side || y.side === SD.rp.side).sort((a, b) => at(a.t) - at(b.t));
}
async function sdReplayLoad() {
  SD.rp.busy = true; SD.rp.data = null; renderCard("replay");
  try { SD.rp.data = await LIVE.api.replay(SD.rp.day); } catch { toast("Couldn't read that night. Check the signal"); }
  SD.rp.busy = false; renderCard("replay");
}
function replayHtml() {
  if (!SD.rp.day) SD.rp.day = shiftDay();
  const days = Array.from({ length: 14 }, (_, i) => addDays(shiftDay(), -i));
  if (!SD.rp.data && !SD.rp.busy) setTimeout(sdReplayLoad);
  const rows = SD.rp.data ? sdReplayRows(SD.rp.data) : [];
  const t0 = rows[0] && ms(rows[0].t), t1 = rows.length && ms(rows.at(-1).t);
  return `<p class="note">Everything the team did on one night, in order: 86s, Log it, labels, closing ticks, restocks, faults, sends and the handover.</p>
    <div class="chips hrow" role="group" aria-label="Night">${days.map((d, i) => `<button class="chip" data-sd-rp-day="${d}" aria-pressed="${d === SD.rp.day}">${i ? i === 1 ? "Last night" : dayName(d) : "Tonight"}</button>`).join("")}</div>
    <div class="seg" style="grid-template-columns:repeat(3,1fr)" role="group" aria-label="Side">${[["all", "Both"], ["bar", "Bar"], ["floor", "Floor"]].map(([k, t]) => `<button data-sd-rp-side="${k}" aria-pressed="${k === SD.rp.side}">${t}</button>`).join("")}</div>
    ${SD.rp.busy ? `<p class="note">Reading the night…</p>` : !SD.rp.data ? "" : !rows.length ? `<p class="note">Nothing recorded that night.</p>`
      : `<p class="sd-big"><b>${rows.length}</b> things, ${hhmm(new Date(t0))} to ${hhmm(new Date(t1))}</p><ol class="sd-tl">${rows.map((y) => `<li class="${y.big ? "big" : ""}"><time>${hhmm(new Date(ms(y.t)))}</time><span class="ic" aria-hidden="true">${y.ic}</span><div><p>${esc(y.txt)}</p><small><span translate="no">${esc(y.w || "")}</span>${y.side ? ` · ${sideName(y.side)}` : ""}</small></div></li>`).join("")}</ol>
        <div class="actions">${sendBtn("replay", "Send the night")}<button class="btn" data-sd-rp-reload>Refresh</button></div>`}`;
}
SHARE.replay = () => {
  const rows = SD.rp.data ? sdReplayRows(SD.rp.data) : []; if (!rows.length) return null;
  return { what: "Shift replay", title: `Black Tap Soho · shift replay · ${dayName(SD.rp.day)}${SD.rp.side === "all" ? "" : ` · ${sideName(SD.rp.side)}`}`, head: [plural(rows.length, "thing") + " recorded"],
    parts: [{ id: "tl", label: "In order", lines: rows.map((y) => `${hhmm(new Date(ms(y.t)))} ${y.ic} ${y.txt}${y.w ? ` (${y.w})` : ""}`) }] };
};

/* ---------- 4. Order draft from the stock count ----------
   From the last two counts and the deliveries in between: what's left, what a day uses, and what to order to get back
   to the par a manager sets (or to cover the days picked, when there's no par). A list to send to whoever orders:
   Bar Book never orders anything. */
SD.od = { hist: null, busy: false, cover: 7, edit: "" };
function sdOrderRows() {
  const h = SD.od.hist; if (!h) return null;
  const days = [...new Set(h.lines.map((x) => x.day))].sort(); if (!days.length) return { days, rows: [] };
  const last = days.at(-1), tot = (d) => new Map(ctTotals(d, h.lines).filter((t) => t.done).map((t) => [t.item, t]));
  const T = Object.fromEntries(days.map((d) => [d, tot(d)])), items = ctSetup().items;
  const rate = (item) => {
    const xs = [];
    for (let i = 1; i < days.length; i++) {
      const a = T[days[i - 1]].get(item), b = T[days[i]].get(item); if (!a || !b) continue;
      const got = h.received.filter((r) => r.item === item && r.day > days[i - 1] && r.day <= days[i]).reduce((n, r) => n + r.qty / 100, 0);
      const used = a.n + got - b.n; if (used >= 0) xs.push(used / Math.max(1, (Date.parse(days[i]) - Date.parse(days[i - 1])) / 864e5));
    }
    return xs.length ? xs.reduce((n, x) => n + x, 0) / xs.length : null;
  };
  const rows = [...T[last].values()].map((t) => {
    const par = items[t.item]?.par, per = rate(t.item), want = par != null ? par : per != null ? per * SD.od.cover : null;
    return { item: t.item, u: t.u, n: t.n, per, par, low: +items[t.item]?.low || 0, order: want == null ? null : Math.max(0, Math.ceil(want - t.n)) };
  }).sort((a, b) => (b.order || 0) - (a.order || 0) || a.item.localeCompare(b.item));
  return { days, last, rows };
}
async function sdOrderLoad() {
  SD.od.busy = true; renderCard("order");
  try { SD.od.hist = await LIVE.api.countHistory(shiftDay()); } catch { toast("Couldn't read the counts. Check the signal"); }
  SD.od.busy = false; renderCard("order");
}
function orderHtml() {
  if (!SD.od.hist && !SD.od.busy) setTimeout(sdOrderLoad);
  const s = sdOrderRows();
  if (SD.od.busy || !s) return `<p class="note">Reading the counts…</p>`;
  if (!s.days.length) return `<p class="note">No stock count yet. Do one in Shift, Stock count, and the order draft fills itself in.</p><div class="actions"><button class="btn pri" data-goto="count">Stock count ›</button></div>`;
  const want = s.rows.filter((r) => r.order > 0), noData = s.rows.filter((r) => r.order == null);
  return `<p class="note">From the count on ${ctDate(s.last)}${s.days.length > 1 ? ` and usage since ${ctDate(s.days[0])}` : ""}. With a par it orders back up to the par; without one it covers the days below. A list to send, not an order.</p>
    <div class="seg" style="grid-template-columns:repeat(3,1fr)" role="group" aria-label="Cover">${[3, 7, 14].map((n) => `<button data-sd-od-cover="${n}" aria-pressed="${n === SD.od.cover}">${n} days</button>`).join("")}</div>
    <p class="sd-big"><b>${want.length}</b> to order</p>
    <div class="ct-tot">${s.rows.map((r) => `<div${r.order > 0 ? ' class="flag"' : ""}><span translate="no">${esc(r.item)}<small>${ctSay(r.u, r.n)} left${r.per != null ? ` · ${ctNum(r.per)} a day` : ""}${r.par != null ? ` · par ${ctNum(r.par)}` : ""}${r.low ? ` · low below ${ctNum(r.low)}` : ""}</small></span>
      <b>${r.order == null ? "–" : r.order ? `Order ${ctSay(r.u, r.order)}` : "OK"}</b>${LIVE.admin ? `<button class="linkbtn" data-sd-od-par="${esc(r.item)}">Levels</button>` : ""}</div>${SD.od.edit === r.item ? `<div class="surow"><span>Par</span><input type="number" inputmode="decimal" min="0" step="1" id="sd-od-par" value="${r.par ?? ""}" aria-label="Par: order back up to"><span>Low below</span><input type="number" inputmode="decimal" min="0" step="1" id="sd-od-low" value="${r.low || ""}" aria-label="Running low below"><button class="btn pri" data-sd-od-save="${esc(r.item)}">Save</button><button class="btn" data-sd-od-clear="${esc(r.item)}">Clear both</button></div>` : ""}`).join("")}</div>
    ${noData.length ? `<p class="note">${plural(noData.length, "item")} need a second count or a par before they can be worked out.</p>` : ""}
    <div class="actions">${want.length ? sendBtn("orderdraft", "Send the order list") : ""}<button class="btn" data-sd-od-reload>Refresh</button></div>`;
}
SHARE.orderdraft = () => {
  const s = sdOrderRows(); const want = s?.rows.filter((r) => r.order > 0) || []; if (!want.length) return null;
  return { what: "Order list", title: `Black Tap Soho · order list · ${dayName(shiftDay())}`, head: [`From the stock count on ${ctDate(s.last)}`],
    parts: [{ id: "o", label: "To order", lines: want.map((r) => `${r.item}: ${ctSay(r.u, r.order)} (${ctSay(r.u, r.n)} left)`) }] };
};
// A product's par (order back up to) and running-low level (the heads-up before an 86), set together. Blank clears one.
function sdOrderPar(item, v, lo) {
  const su = ctSetup(), items = { ...su.items }, cur = { ...(items[item] || {}) };
  if (v == null || v === "" || isNaN(+v)) delete cur.par; else cur.par = Math.max(0, Math.round(+v * 100) / 100);
  if (lo == null || lo === "" || !(+lo > 0)) delete cur.low; else cur.low = Math.min(9999, Math.round(+lo * 100) / 100);
  items[item] = cur; SD.od.edit = "";
  track(LIVE.api.saveCountSetup({ areas: su.areas, items, order: su.order }), "Levels saved", "Not saved. Try again");
  setTimeout(() => renderCard("order"), 300);
}

/* ---------- 5. Closing timer ----------
   From the first closing tick tonight to the handover, on the Shift tab, against the team's best for that side. The
   time goes into closes when the handover is sent, so the best is the team's own. */
function sdCloseStart(side) {
  const ls = MODE_LISTS[side] || [], xs = LIVE.events.filter((e) => (e.kind === "task" || e.kind === "run") && ls.includes(e.list) && e.day === shiftDay());
  return xs.length ? Math.min(...xs.map((e) => ms(e.at))) : 0;
}
const sdBest = (side) => { const xs = (LIVE.closes || []).filter((x) => x.side === side).map((x) => x.mins); return xs.length ? Math.min(...xs) : 0; };
const sdDone = (side) => LIVE.reports.some((r) => r.side === side && reportDay(r) === shiftDay());
const sdMins = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`);
function sdClosed(side) {
  const t = sdCloseStart(side); if (!t || !LIVE.me) return;
  const mins = Math.max(1, Math.min(720, Math.round((Date.now() - t) / 6e4))), best = sdBest(side);
  LIVE.api.closeTime(shiftDay(), side, mins).catch(() => {});
  if (best && mins < best) { sdCue("win"); setTimeout(() => toast(`🏆 New best close: ${sdMins(mins)}`), 1900); }
}
function sdTimer() {
  let el = $("#sd-timer");
  if (!el) { document.body.insertAdjacentHTML("beforeend", `<div id="sd-timer" role="timer" hidden></div>`); el = $("#sd-timer"); }
  const t = LIVE.me && cur === "tally" && $("#sheet").hidden && sdCloseStart(mode);
  if (!t || sdDone(mode)) { el.hidden = true; return; }
  const m = Math.max(0, Math.floor((Date.now() - t) / 6e4)), best = sdBest(mode);
  el.hidden = false;
  el.className = best && m > best ? "slow" : "";
  el.innerHTML = `<b>⏱ ${sdMins(m)}</b><span>${sideName(mode)} close${best ? ` · best ${sdMins(best)}` : ""}</span>`;
}

/* ---------- 6. Last orders ----------
   A manager sets the time once. From 15 minutes before, every phone and the bar iPad show it big, the brief says it, and
   there's one sound. The app never stops anyone serving: it's a reminder. */
function sdLast() {
  const lo = sdVenue().lastOrders; if (!lo) return null;
  let left = sdMin(lo) - sdNowMin(); if (left < -180) left += 1440;
  return { at: lo, left };
}
function sdLastRender() {
  let el = $("#sd-last");
  if (!el) { $("#net").insertAdjacentHTML("afterend", `<div id="sd-last" class="gut" role="status" hidden></div>`); el = $("#sd-last"); }
  const l = LIVE.me && sdLast(), on = l && l.left <= 15 && l.left > -30;
  el.hidden = !on;
  if (!on) return;
  el.className = `gut${l.left <= 0 ? " now" : ""}`;
  el.innerHTML = l.left > 0 ? `<b>🔔 Last orders at ${esc(l.at)}</b><span>${plural(l.left, "minute")} to go</span>` : `<b>🔔 Last orders now (${esc(l.at)})</b><span>Last call for drinks</span>`;
  const k = `lo-${shiftDay()}-${l.left > 0 ? "soon" : "now"}`;
  if (store.get("sdLo", "") !== k) { store.set("sdLo", k); sdCue(l.left > 0 ? "alert" : "win"); }
}

/* ---------- 7. Offline badge ----------
   No signal shows a big, calm badge: everything is saved on this phone and goes when the signal's back, with the count
   of saves waiting. Firestore keeps every change on the phone, so this is true, not just reassuring. */
function sdOffline() {
  let el = $("#sd-off");
  if (!el) { $("#net").insertAdjacentHTML("afterend", `<div id="sd-off" class="gut" role="status" aria-live="polite" hidden></div>`); el = $("#sd-off"); }
  const off = !navigator.onLine;
  el.hidden = !off;
  document.body.classList.toggle("sd-offon", off);
  if (off) el.innerHTML = `<span class="dot" aria-hidden="true"></span><b>Working offline. All saved.</b><span>${unsent ? `${plural(unsent, "change")} on this phone, sending when the signal's back` : "Everything you do is kept on this phone and sends by itself"}</span>`;
}

/* ---------- 8. Day and night by the clock ----------
   "Clock" in Light or dark: the light look from the venue's day time and the dark one from its night time, set by a
   manager. Auto still follows the phone. */
const sdTheme0 = applyTheme;
applyTheme = function () {
  let t = "auto"; try { t = JSON.parse(localStorage.getItem("btbar.theme")) || "auto"; } catch {}
  if (t !== "clock") return sdTheme0();
  const v = sdVenue(), n = sdNowMin(), a = sdMin(v.dayAt), b = sdMin(v.nightAt), day = a <= b ? n >= a && n < b : n >= a || n < b;
  document.documentElement.dataset.theme = day ? "light" : "dark";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", day ? "#f6f1e6" : "#15130f");
};

/* ---------- 9. Seasonal menu ----------
   A manager makes a menu (Christmas, summer) by taking drinks off and putting a few first, then switches it on for
   everyone in one tap. Off-menu drinks leave the menu list but stay in search, marked, so nobody loses a spec. Switching
   back to the full menu is one tap; nothing is deleted. */
SD.ss = { edit: null, q: "" };
const sdSeason = () => { const s = LIVE.season; return s && s.on ? (s.sets || []).find((x) => x.id === s.on) || null : null; };
function sdSeasonOk(d, q) {
  if (!SD_READY) return true;
  const s = sdSeason(); return !s || !!q || !(s.off || []).includes(d.name);
}
function sdSeasonBanner() {
  const s = sdSeason(); if (!s) return "";
  const star = (s.star || []).map((n) => D.find((d) => d.name === n)).filter(Boolean);
  return `<div class="sd-season"><b>🎄 ${esc(s.name)} menu is on</b>${star.length ? `<div class="chips hrow">${star.map((d) => `<button class="chip" data-open="${d.id}" translate="no">★ ${esc(d.name)}</button>`).join("")}</div>` : ""}<small>${plural((s.off || []).length, "drink")} off the menu for now. Search still finds them.</small></div>`;
}
function seasonHtml() {
  const s = LIVE.season || { on: "", sets: [] }, sets = s.sets || [];
  if (SD.ss.edit) {
    const e = SD.ss.edit, q = SD.ss.q.toLowerCase(), list = D.filter((d) => !q || d.name.toLowerCase().includes(q) || d.section.toLowerCase().includes(q)).slice(0, 60);
    return `<label class="fld">Menu name<input id="sd-ss-name" maxlength="30" value="${esc(e.name)}" placeholder="Christmas"></label>
      <label class="fld">Find drinks<input id="sd-ss-q" type="search" value="${esc(SD.ss.q)}" placeholder="Search a drink or section"></label>
      <p class="note">${plural(e.off.length, "drink")} off, ${plural(e.star.length, "drink")} put first.</p>
      <ul class="sd-ss">${list.map((d) => { const off = e.off.includes(d.name), st = e.star.includes(d.name); return `<li><span translate="no">${esc(d.name)}<small>${esc(d.section)}</small></span><button class="chip" data-sd-ss-star="${d.id}" aria-pressed="${st}">★ First</button><button class="chip" data-sd-ss-off="${d.id}" aria-pressed="${off}">${off ? "Off" : "On"}</button></li>`; }).join("")}</ul>
      <div class="actions"><button class="btn pri" data-sd-ss-save>Save this menu</button><button class="btn" data-sd-ss-cancel>Cancel</button>${sets.some((x) => x.id === e.id) ? `<button class="btn danger" data-sd-ss-drop="${e.id}">Delete it</button>` : ""}</div>`;
  }
  return `<p class="note">Switch the whole team to a seasonal menu in one tap. Drinks taken off leave the menu list but stay in search. One tap puts the full menu back.</p>
    <div class="sd-ss-sets"><button class="btn${!s.on ? " pri" : ""}" data-sd-ss-on="">Full menu${!s.on ? " ✓" : ""}</button>${sets.map((x) => `<button class="btn${s.on === x.id ? " pri" : ""}" data-sd-ss-on="${x.id}">${esc(x.name)}${s.on === x.id ? " ✓" : ""}</button>`).join("")}</div>
    <div class="actions">${sets.length < 8 ? `<button class="btn" data-sd-ss-new>＋ New seasonal menu</button>` : ""}${sets.map((x) => `<button class="linkbtn" data-sd-ss-edit="${x.id}">Change ${esc(x.name)}</button>`).join("")}</div>`;
}
function sdSeasonWrite(on, sets) { track(LIVE.api.saveSeason(on, sets), on ? "Seasonal menu on for everyone" : "Full menu back on", "Not saved. Try again"); }

/* ---------- Venue times (managers) ---------- */
function venueHtml() {
  const v = sdVenue();
  return `<label class="fld">Last orders<input type="time" id="sd-v-lo" value="${esc(v.lastOrders)}"></label>
    <p class="note">From 15 minutes before, every phone and the bar iPad show it big, with one sound. Leave it empty for none.</p>
    <div class="surow"><span>Day look from</span><input type="time" id="sd-v-day" value="${esc(v.dayAt)}"></div>
    <div class="surow"><span>Night look from</span><input type="time" id="sd-v-night" value="${esc(v.nightAt)}"></div>
    <p class="note">For phones set to Clock in Info, Light or dark.</p>
    <div class="actions"><button class="btn pri" data-sd-v-save>Save</button></div>`;
}

/* ---------- 10. Sound and vibration cues ----------
   Short tones made on the phone (no sound files): one for something urgent, one for done. Android also buzzes;
   iPhones can't be buzzed from a web app (Safari has no vibration), so they get the sound. Mute in Info. */
let sdAc = null;
function sdCue(kind) {
  if (!SD.set.sound) return;
  try { navigator.vibrate?.(kind === "alert" ? [120, 80, 120] : 40); } catch {}
  try {
    sdAc = sdAc || new (window.AudioContext || window.webkitAudioContext)();
    if (sdAc.state === "suspended") sdAc.resume();
    const notes = kind === "alert" ? [880, 660, 880] : kind === "win" ? [523, 659, 784] : [660];
    notes.forEach((f, i) => {
      const o = sdAc.createOscillator(), g = sdAc.createGain(), t = sdAc.currentTime + i * 0.14;
      o.type = "sine"; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      o.connect(g).connect(sdAc.destination); o.start(t); o.stop(t + 0.14);
    });
  } catch {}
}
// iPhones only let a page make sound after a tap, so the first tap anywhere wakes the sound up.
document.addEventListener("touchend", () => { if (!sdAc && SD.set.sound) try { sdAc = new (window.AudioContext || window.webkitAudioContext)(); } catch {} }, { once: true, passive: true });
// Something new and urgent in Needs you now (a date label to change, an item to check) gets a sound.
let sdAlSeen = null;
if (typeof renderAlerts === "function") {
  const ra0 = renderAlerts;
  renderAlerts = function (force) {
    ra0(force);
    const ids = new Set(alertsNow().filter((x) => x.hot || x.id.startsWith("it")).map((x) => x.id));
    if (sdAlSeen && [...ids].some((i) => !sdAlSeen.has(i))) sdCue("alert");
    sdAlSeen = ids;
  };
}

/* ---------- 11. Voice ----------
   🎤 on every screen, the bar station included. It listens for the key words in whatever is said, so loose speech
   works: "can you 86 the Corona please", "we've run out of limes", "limes are back", "Marshmallow Boulevard spec",
   "count tonic 12", "what's 86'd", "log it the ice machine is leaking", "open closing". The thing named is matched to
   the app's one item list (the picker's, pick.js) by its words, its other names, a letter or two off, and how it
   sounds, so "tanker ray" is Tanqueray and "marsh mellow" is Marshmallow. The phone offers up to five guesses at what
   was said and the one that makes the most sense wins. It shows what it heard and asks before it changes anything;
   when it isn't sure it shows the closest few to tap. Where the phone's browser has speech recognition it listens;
   where it doesn't (most iPhone home screen apps), the box opens with the keyboard so the keyboard's own microphone
   does the listening, and the same key words work typed. Free: the phone's own speech to text, nothing paid. */
const SD_REC = window.SpeechRecognition || window.webkitSpeechRecognition;
SD.vc = { text: "", heard: null, on: false, err: "" };
const SD_GO = [[/clos/, "lists"], [/hand ?over/, "send"], [/label/, "labels"], [/stock count|count/, "count"], [/86|stock|restock/, "stock"], [/morning|opening|brief/, "morning"], [/pay|tronc|wage/, "pay"], [/issue|fault|broken/, "issues"], [/rapid/, "tab:rapid"], [/ipad|station/, "tab:station"], [/menu|drinks/, "tab:drinks"]];
// Words said round a command that don't change it.
const VC_FILL = /\b(?:please|pls|cheers|thanks|thank you|mate|guys|bro|babe|innit|yeah|yes|yep|yo|actually|basically|i think|i reckon|maybe|hey|hi|ok(?:ay)?|right|um+|uh+|erm+|er|so|just|quickly|real quick|now|for me|for us|can you|could you|would you|will you|can we|could we|i need you to|i need to|we need to|need to|i want to|i wanna|let'?s|go ahead and|bar book)\b/g;
// Words round the thing named that aren't part of its name.
const VC_STOP = new Set(["the", "a", "an", "some", "any", "our", "all", "of", "we", "ve", "i", "is", "are", "it", "its", "that", "this", "there", "s", "d", "ll", "re", "got", "get", "more", "left", "anymore", "to", "me", "us", "for", "please", "tonight", "today"]);
function vcNorm(t) {
  return ` ${t.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[’‘]/g, "'")
    .replace(/\beighty[\s-]?six(?:ed|'?d)?\b/g, "86").replace(/\b8 6\b/g, "86").replace(/\b86(?:ed|'?d|'s)(?![a-z])/g, "86").replace(/\bun[\s-]?86\b/g, "un86")
    .replace(/[^a-z0-9'&.,\s]/g, " ").replace(/[.]+(\s|$)/g, " ").replace(VC_FILL, " ").replace(/\s+/g, " ").trim()} `;
}
// How a name sounds, roughly: so "tanker ray" and "Tanqueray", or "marsh mellow" and "Marshmallow", come out the same.
function vcKey(s) {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "").replace(/ph/g, "f").replace(/qu/g, "k").replace(/ck/g, "k")
    .replace(/[cq]/g, "k").replace(/x/g, "ks").replace(/z/g, "s").replace(/([^aeiou])h/g, "$1").replace(/[aeiouy]+/g, "a").replace(/(.)\1+/g, "$1");
}
const VC_KEY = new WeakMap();
const vcKeyOf = (x) => { let k = VC_KEY.get(x); if (k == null) VC_KEY.set(x, (k = vcKey(x.n))); return k; };
const VC_SURE = 3;
// One word said against one item: how well it fits the name (and which of the name's words it fits), and what the
// item is also called. "zero" and "0" are the same word, so "San Miguel zero" is San Miguel 0,0.
function vcWord(w, x) {
  const ws = w === "zero" ? [w, "0"] : w === "0" ? [w, "zero"] : [w];
  let f = 0, mask = 0, a = 0;
  for (const v of ws) {
    x.w.forEach((nw, j) => { const s = pkFit(v, [nw]); if (s > f) f = s; if (s >= 1.2) mask |= 1 << j; });
    a = Math.max(a, pkFit(v, x.a) * 0.6);
  }
  return { f: Math.max(f, a), mask };
}
const vcBits = (m) => { let n = 0; for (; m; m &= m - 1) n++; return n; };
// The items said, best first. Every run of up to five words is tried against every item: its own name counts most, a
// sound-alike nearly as much, what it's also called a little. A longer run that fits counts more, so "Fever-Tree light
// tonic" beats "tonic" when all of it was said, and words said that fit nothing count against it, so "burger sauce" is
// not Strawberry sauce.
function vcSpot(text, pool, boost) {
  const ws = pkWords(text).filter((w) => !VC_STOP.has(w)).slice(0, 16), T = ws.length, best = new Map();
  if (!T) return [];
  const fit = ws.map((w) => pool.map((x) => vcWord(w, x)));
  for (let i = 0; i < T; i++) for (let j = i + 1; j <= Math.min(T, i + 5); j++) {
    const n = j - i, key = vcKey(ws.slice(i, j).join("")), len = (1 + 0.15 * n) * (n / T) ** 0.7;
    pool.forEach((x, k) => {
      let s = 0, mask = 0;
      for (let q = i; q < j; q++) { const h = fit[q][k]; if (!h.f) { s = 0; break; } s += h.f; mask |= h.mask; }
      let v = s ? (s / n) * (0.5 + vcBits(mask) / x.w.length) * len : 0;
      const kx = vcKeyOf(x);
      if (key.length >= 4 && key === kx) v = Math.max(v, 6.5 * len);
      else if (key.length >= 6 && Math.abs(key.length - kx.length) <= 2 && mkLev(key, kx) <= (key.length >= 9 ? 2 : 1)) v = Math.max(v, 5.5 * len);
      if (boost) v *= boost(x);
      if (v > (best.get(x) || 0)) best.set(x, v);
    });
  }
  return [...best].map(([x, s]) => ({ x, s })).filter((h) => h.s >= 1.2).sort((a, b) => b.s - a.s || a.x.w.length - b.x.w.length);
}
const vcCap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const vcList = (ns) => (ns.length > 1 ? `${ns.slice(0, -1).join(", ")} and ${ns[ns.length - 1]}` : ns[0]);
function vc86(names, on, sc, typed) {
  const say = on ? `86 ${vcList(names)} for everyone?` : `${vcList(names)} back in stock?`;
  return { kind: on ? "86" : "back", names, sc, say, typed };
}
// "86 limes and mint": each part on its own, when each is plainly an item. Otherwise the best match for the lot.
function vcItems(rest, on) {
  const pool = pkPool(), outs = outNow(), boost = on ? null : (x) => (outs.has(x.n) ? 1.4 : 1);
  const whole = vcSpot(rest, pool, boost), top = whole[0];
  const parts = rest.split(/\s*(?:,|&|\band\b|\bplus\b|\balso\b)\s*/).filter((p) => pkWords(p).some((w) => !VC_STOP.has(w)));
  if (parts.length > 1 && !/\band\b|&/i.test(top?.x.n || "")) {
    const each = parts.map((p) => vcSpot(p, pool, boost)[0]);
    if (each.every((h) => h && h.s >= VC_SURE)) return { ...vc86([...new Set(each.map((h) => h.x.n))], on, 6), alts: [] };
  }
  const alts = (top && top.s >= VC_SURE ? whole.slice(1) : whole).filter((h) => h.s >= 2).slice(0, 3).map((h) => ({ t: h.x.n, h: vc86([h.x.n], on, 5) }));
  if (top && top.s >= VC_SURE) return { ...vc86([top.x.n], on, 5 + top.s / 10), alts };
  // Not on the list: an 86 still goes on as said (a burger, a glass), with the closest ones to tap instead.
  const said = rest.split(" ").filter((w) => w && !VC_STOP.has(w)).join(" ").trim();
  if (on && said) { const n = vcCap(pkName(said)); return { ...vc86([n], true, 2, true), alts }; }
  return { kind: "none", sc: 1, say: on ? "86 what? Say the name, like “86 limes”." : "Back in what? Say the name, like “limes are back”.", alts };
}
const VC_BACK = /\b(?:back in(?: stock)?|back on(?: the menu)?|un86|restocked|in stock again|(?:is|are|'s) back)\b/;
const VC_86 = /\b(?:86|we'?ve run out of|we have run out of|ran out of|run out of|run out|sold out of|sold out|out of|no more|none left|(?:is|are|'s) (?:out|gone|finished|done)|we'?ve got no|we have no|there'?s no|take off)\b/;
const VC_SPEC = /\b(?:how (?:do|to|would|d|should)(?: i| you| we| u)? (?:make|build|do|pour|serve)|what'?s in(?: a| an| the)?|what goes in(?: a| an| the)?|specs?(?: for| of| sheet| on)?|recipe(?: for| of)?|builds?(?: for)?|make(?: a| an| me a| me)?|ingredients(?: for| in)?|show me|pull up|bring up|method(?: for)?)\b/;
const vcCut = (re, s) => s.replace(new RegExp(re.source, "g"), " ");
// What was said, worked out. sc is how much sense it makes, so the best of the phone's guesses wins.
function sdParse(raw) {
  const t = raw.trim().replace(/[.!?]+$/, ""), l = vcNorm(t);
  let m;
  if (!l.trim()) return { kind: "none", sc: 0, say: "Didn't hear anything. Try again.", alts: [] };
  if (/what can (?:i|we) make/.test(l)) return { kind: "make", sc: 9, say: "Open My bar to see what you can make" };
  if (/last orders?/.test(l)) { const lo = sdLast(); return { kind: "info", sc: 9, say: lo ? `Last orders at ${lo.at}` : "No last orders time set" }; }
  if (/\bwhat(?:'s| is| are|s)? (?:86|out|off)\b|\b86 (?:list|board)\b|\bwhat have we (?:86|run out)/.test(l)) return { kind: "go", go: "stock", sc: 9, say: "Opening the 86 board" };
  if ((m = t.match(/^\s*(?:(?:please|can you|could you|hey|ok(?:ay)?|right|um+|so)[\s,]+)*(?:log it|log|note|write down|add a note|handover note)\b\s*[:,-]?\s*(.+)/i)) && m[1].trim()) {
    const s = m[1].trim(); return { kind: "log", sc: 9, n: vcCap(s), say: `Log "${s}" in tonight's handover?` };
  }
  if (VC_BACK.test(l)) return vcItems(vcCut(VC_BACK, l), false);
  if (/\b86\b/.test(l) && !vcCut(VC_86, l).replace(/\b(?:the|a|an|some)\b/g, "").trim()) return { kind: "go", go: "pick86", sc: 8, say: "Open 86 something" };
  if (VC_86.test(l)) return vcItems(vcCut(VC_86, l), true);
  if (/\b(?:count(?:ed|ing)?|stock count)\b/.test(l)) {
    const rest = l.replace(/\b(?:stock count|count(?:ed|ing)?|we have|we'?ve got|there (?:are|is)|i)\b/g, " ").trim();
    const p = LIVE.me && rest ? ctParse(rest) : null, r = p && ctRow(p.key);
    if (r) return { kind: "count", sc: 8, p, say: `Count ${r.item}: ${p.grams ? `${p.n} g on the scale` : ctSay(r.u, p.n)}?` };
    return { kind: "go", go: "count", sc: 6, say: rest ? `Open the stock count. Didn't catch the number for “${rest}”.` : "Open the stock count" };
  }
  if ((m = l.match(/\b(?:open|go to|take me to|jump to|show me|show)\s+(.+)/))) { const g = SD_GO.find(([re]) => re.test(m[1])); if (g) return { kind: "go", go: g[1], sc: 8, say: `Opening ${m[1].trim()}` }; }
  // A drink: with "spec", "how do I make" and the like, or just its name.
  const want = VC_SPEC.test(l), hits = vcSpot(vcCut(VC_SPEC, l), pkPool().filter((x) => x.c === "drinks")), top = hits[0];
  const dAlt = (h) => ({ t: h.x.n, h: { kind: "drink", d: D[h.x.d], sc: 4, say: h.x.n } });
  if (top && top.s >= (want ? 2.5 : 3.5)) return { kind: "drink", d: D[top.x.d], sc: 3 + top.s / 10, say: top.x.n, alts: hits.slice(1).filter((h) => h.s >= 2.5).slice(0, 3).map(dAlt) };
  const g = l.trim().split(" ").length <= 3 && SD_GO.find(([re]) => re.test(l));
  if (g) return { kind: "go", go: g[1], sc: 5, say: `Opening ${l.trim()}` };
  const near = hits.filter((h) => h.s >= 2);
  return { kind: "none", sc: near.length ? 1 : 0, say: near.length ? `Not sure what “${t}” was. Is it one of these?` : `Didn't catch a command in “${t}”. Try “86 the Corona”, “Negroni spec” or “count tonic 12”.`, alts: near.slice(0, 3).map(dAlt) };
}
// The phone's guesses, best first: the one that makes most sense wins.
function vcBest(texts) {
  let best = null;
  for (const x of texts.filter(Boolean)) { const h = sdParse(x); if (!best || h.sc > best.h.sc) best = { t: x, h }; }
  return best;
}
function sdVoiceOpen() {
  let el = $("#sd-voice");
  if (!el) { document.body.insertAdjacentHTML("beforeend", `<div id="sd-voice" class="help" hidden><div class="help-in" role="dialog" aria-modal="true" aria-labelledby="sd-vt"></div></div>`); el = $("#sd-voice"); }
  SD.vc.heard = null; SD.vc.text = ""; SD.vc.on = false; SD.vc.err = ""; sdVoiceRender(); el.hidden = false;
  if (SD_REC) sdListen(); else setTimeout(() => $("#sd-vtext")?.focus(), 50);
}
function sdVoiceRender() {
  const h = SD.vc.heard, acts = h && ["86", "back", "log"].includes(h.kind), alts = h?.alts || [];
  const btn = !h ? "" : acts ? "Yes, do it" : h.kind === "count" ? "Open the count" : h.kind !== "none" && h.kind !== "info" ? "Go" : "";
  $("#sd-voice .help-in").innerHTML = `<div class="help-h"><h3 id="sd-vt">🎤 Say it</h3><button class="hq-x" data-sd-vx aria-label="Close">×</button></div>
    ${SD.vc.on ? `<p class="sd-big sd-pulse">Listening…</p><p class="note">Say it how you like. It picks out the key words.</p>` : ""}
    ${SD.vc.err ? `<p class="note warnline">${esc(SD.vc.err)}</p>` : ""}
    ${h ? `<div class="sd-heard${h.kind === "none" ? " no" : ""}">${SD.vc.text && h.kind !== "none" ? `<p class="s">Heard “${esc(SD.vc.text)}”</p>` : ""}<b>${esc(h.say)}</b>${acts ? `<p class="note">${h.kind === "log" ? "It goes in tonight's handover with your name." : h.typed ? "It isn't on the list, so it goes on as said. Or tap the right one below." : "Every phone sees it straight away."}</p>` : ""}
      ${alts.length ? `<p class="mini" style="margin-top:10px">${h.kind === "none" || h.typed ? "Did you mean" : "Or"}</p><div class="recent">${alts.map((a, i) => `<button class="chip" data-sd-valt="${i}" translate="no">${esc(a.t)}</button>`).join("")}</div>` : ""}</div>
      <div class="actions">${btn ? `<button class="btn pri" data-sd-vgo>${btn}</button>` : ""}<button class="btn" data-sd-vagain>${SD_REC ? "Say it again" : "Try again"}</button></div>` : ""}
    <form class="sd-vform" data-sd-vform><input id="sd-vtext" type="text" enterkeyhint="go" autocomplete="off" placeholder="${SD_REC ? "Or type it" : "Tap the 🎤 on your keyboard and speak"}" value="${esc(SD.vc.text)}" aria-label="Command"><button class="btn" type="submit">Go</button></form>
    <p class="note">Try: “86 the Corona”, “limes are back”, “Marshmallow Boulevard spec”, “count tonic 12”, “log it the glass washer is leaking”, “what's 86'd”, “open closing”. Nothing changes until you say yes.</p>`;
}
let sdRx = null;
function sdListen() {
  try {
    sdRx?.abort?.();
    SD.vc.err = "";
    sdRx = new SD_REC(); sdRx.lang = "en-GB"; sdRx.interimResults = false; sdRx.continuous = false; sdRx.maxAlternatives = 5;
    sdRx.onresult = (e) => {
      const r = e.results[0], b = vcBest(Array.from({ length: r.length }, (_, i) => r[i].transcript));
      if (!b) return;
      SD.vc.text = b.t; SD.vc.heard = b.h; SD.vc.on = false; sdVoiceRender(); sdSpeak(b.h.say);
    };
    sdRx.onerror = (e) => {
      SD.vc.on = false;
      SD.vc.err = e.error === "not-allowed" || e.error === "service-not-allowed" ? "The microphone is off for Bar Book. Allow it in the phone's settings, or tap the 🎤 on the keyboard and speak into the box."
        : e.error === "no-speech" ? "Didn't hear anything. Tap Say it again and speak close to the phone." : e.error === "network" ? "Speech needs signal on this phone. Type it, or use the keyboard's 🎤." : "";
      sdVoiceRender(); if (e.error !== "no-speech") $("#sd-vtext")?.focus();
    };
    sdRx.onend = () => { if (SD.vc.on) { SD.vc.on = false; sdVoiceRender(); } };
    SD.vc.on = true; sdVoiceRender(); sdRx.start();
  } catch { SD.vc.on = false; sdVoiceRender(); $("#sd-vtext")?.focus(); }
}
function sdSpeak(t) { if (!SD.set.sound) return; try { const u = new SpeechSynthesisUtterance(t); u.lang = "en-GB"; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch {} }
function sdVoiceClose() { sdRx?.abort?.(); SD.vc.on = false; const el = $("#sd-voice"); if (el) el.hidden = true; }
function sdVoiceGo() {
  const h = SD.vc.heard; if (!h) return;
  sdVoiceClose(); haptic();
  if (h.kind === "86" || h.kind === "back") {
    const on = h.kind === "86";
    if (!LIVE.me) return toast(on ? "Join the team to 86 for everyone" : "Join the team first");
    const xs = h.names.filter((n) => isOut(n) !== on);
    if (!xs.length) return toast(on ? `${vcList(h.names)} ${h.names.length > 1 ? "are" : "is"} already 86'd` : `${vcList(h.names)} ${h.names.length > 1 ? "aren't" : "isn't"} on the 86 list`);
    pk86(xs, on); renderList(); sdCue("ok"); return;
  }
  if (h.kind === "log") { if (!LIVE.me) return toast("Join the team to log it"); sdCue("ok"); return track(LIVE.api.logIt(mode, "note", h.n.slice(0, LOG_MAX)), "Logged. It's in tonight's handover", "Not saved. Try again"); }
  if (h.kind === "drink") return cur === "station" ? sxTap(h.d.id) : openSheet(h.d.id);
  if (h.kind === "make") { mk.pane = "bar"; mkSave(); return openAt("tab:make"); }
  if (h.kind === "count") { if (!LIVE.me) return toast("Join the team to count stock"); openAt("count"); ctHeard = { ...h.p }; ctRender(true); return; }
  if (h.kind === "go") { if (h.go === "pick86") return pkOpen({ mode: "86" }); if (h.go === "count" && !LIVE.me) return toast("Join the team to count stock"); openAt(h.go); scrollTo(0, 0); }
}

/* ---------- 12. Accessible mode and one-hand mode (this phone) ----------
   Accessible: plain lower-case headings instead of the tall capitals, bigger text with more space between letters,
   words and lines (British Dyslexia Association style guide: sans serif, larger spacing, line spacing about 1.5, avoid
   all capitals), status colours from the Okabe-Ito colour-blind-safe set (blue for good, orange for needs you), and
   bigger buttons. Status already always comes with words, never colour alone.
   One-hand: a row of the main actions just above the tabs, in reach of a thumb: back, search, 86, Log it, send and 🎤. */
function sdApplyModes() {
  document.body.classList.toggle("sd-a11y", !!SD.set.a11y);
  document.body.classList.toggle("sd-1h", !!SD.set.onehand);
  let bar = $("#sd-1h");
  if (!bar) {
    document.body.insertAdjacentHTML("beforeend", `<nav id="sd-1h" aria-label="Quick actions" hidden><button data-sd-1h="back" aria-label="Back">‹<span>Back</span></button><button data-sd-1h="find" aria-label="Search drinks">🔍<span>Search</span></button><button data-sd-1h="86" aria-label="86 something">🚫<span>86</span></button><button data-log aria-label="Log it">＋<span>Log it</span></button><button data-sd-1h="send" aria-label="Send">📤<span>Send</span></button><button data-sd-mic aria-label="Voice">🎤<span>Say it</span></button></nav>
      <button id="sd-mic" data-sd-mic aria-label="Voice command" hidden>🎤</button>`);
    bar = $("#sd-1h");
  }
  bar.hidden = !SD.set.onehand;
  $("#sd-mic").hidden = !SD.set.voice || !!SD.set.onehand;
}
function sdOneHand(k) {
  haptic();
  if (k === "back") { if (!$("#sd-voice")?.hidden) return sdVoiceClose(); if (!$("#logit").hidden) return logClose(); if (!$("#sheet").hidden) return hideSheet(); return history.length > 1 ? history.back() : show("drinks"); }
  if (k === "find") { if (!$("#sheet").hidden) hideSheet(); show("drinks"); setTimeout(() => { scrollTo(0, 0); $("#q").focus(); }, 60); return; }
  if (k === "86") { if (!$("#sheet").hidden) hideSheet(); return openAt("stock"); }
  if (k === "send") { if (!$("#sheet").hidden) hideSheet(); return openAt("quick"); }
}
function sdPhoneHtml() {
  if (!SD_READY) return "";
  const row = (k, t, sub) => `<div class="mini" style="margin-top:14px">${t}</div><div class="seg" style="grid-template-columns:1fr 1fr;margin-top:6px" role="group" aria-label="${t}"><button data-sd-set="${k}:1" aria-pressed="${!!SD.set[k]}">On</button><button data-sd-set="${k}:0" aria-pressed="${!SD.set[k]}">Off</button></div><p class="note">${sub}</p>`;
  return row("a11y", "Accessible mode", "Easier to read: plain headings, bigger text and spacing, colour-blind-safe colours, bigger buttons.")
    + row("onehand", "One-hand mode", "Back, search, 86, Log it, send and voice in a row above the tabs, in reach of your thumb.")
    + row("sound", "Sounds", "A short sound for urgent things, last orders and a new best close. Android phones buzz too; iPhones can't from a web app.")
    + row("voice", "Voice button 🎤", "Say it how you like: \"86 the Corona\", \"Negroni spec\", \"count tonic 12\". It picks out the key words. Nothing changes until you say yes.");
}

/* ---------- Where it all goes ---------- */
Object.assign(TC_SUB, { replay: "Every 86, Log it, label, tick and send on one night, in order", order: "What to order, from the stock count and your pars", season: "Switch the whole team to a seasonal menu in one tap", venue: "Last orders, and when the day and night looks start" });
function sdCards() {
  if (!SD_READY || !LIVE.admin) return [];
  const s = sdSeason();
  return [["replay", "Shift replay", replayHtml], ["order", "Order draft", orderHtml], ["season", "Seasonal menu", seasonHtml, s ? { t: s.name } : ""], ["venue", "Last orders and day or night", venueHtml, sdVenue().lastOrders ? { t: sdVenue().lastOrders } : ""]];
}
FEATURES.push(
  { g: "Team", k: "replay", n: "Shift replay", go: "replay", team: 1, adm: 1, what: "One night start to finish for the managers: every 86, Log it, label, closing tick, restock, fault, send and the handover, in time order with who.", mgr: "Pick a night and send it on WhatsApp." },
  { g: "Team", k: "order", n: "Order draft", go: "order", team: 1, adm: 1, what: "What to order, worked out from the last stock counts, the deliveries and each item's par.", mgr: "Set a par on anything you always want on the shelf, then send the list." },
  { g: "Team", k: "season", n: "Seasonal menu", go: "season", team: 1, adm: 1, what: "A Christmas or summer menu for the whole team in one tap, and back again.", mgr: "Make the menu once, then switch it on and off." },
  { g: "Drinks", k: "voice", n: "Voice", go: "tab:drinks", what: "Tap 🎤 and say it how you like: \"86 the Corona\", \"limes are back\", \"Marshmallow Boulevard spec\", \"count tonic 12\". It picks out the key words, matches the name even if it's misheard, and asks before it changes anything." });
Object.assign(PLACE_KW, { replay: "replay timeline night history what happened", order: "order par reorder supplier", season: "season christmas summer seasonal menu switch", venue: "last orders time day night theme" });

/* ---------- Events ---------- */
document.addEventListener("click", (e) => {
  const t = (s) => e.target.closest(s); let x;
  if (t("[data-sd-mic]")) { haptic(); return sdVoiceOpen(); }
  if ((x = t("[data-sd-1h]"))) return sdOneHand(x.dataset.sd1h);
  if ((x = t("[data-sd-set]"))) { const [k, v] = x.dataset.sdSet.split(":"); SD.set[k] = v === "1"; sdSave(); sdApplyModes(); haptic(); if (k === "sound" && SD.set.sound) sdCue("ok"); x.parentElement.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b === x)); return; }
  if ((x = t("[data-sd-flow]"))) {
    const d = D[+x.dataset.sdFlow], lines = sdFlow(d); haptic();
    if (lines) { SD.flow = { id: d.id, sig: OUT_SIG, lines }; sdCue("ok"); }
    else { const alt = plAlts(d, 1)[0]; toast(alt ? `No sensible swap. Closest you can make: ${alt.name}` : "No sensible swap and nothing close. Offer the guest something else"); if (alt) return cur === "station" ? (SX.id = alt.id, sxSpec()) : openSheet(alt.id); return; }
    if (cur === "station") { sxSpec(); return; }
    const y = $("#sheet").scrollTop; openSheet(curId, true); $("#sheet").scrollTop = y; return;
  }
  if ((x = t("[data-sd-flow-off]"))) { SD.flow = null; haptic(); if (cur === "station") { sxSpec(); return; } const y = $("#sheet").scrollTop; openSheet(curId, true); $("#sheet").scrollTop = y; return; }
  if ((x = t("[data-sd-jar]"))) { SD.jar = +x.dataset.sdJar; SD.batchOpen = true; haptic(); const y = $("#sheet").scrollTop; openSheet(curId, true); $("#sheet").scrollTop = y; return; }
  if (t("#sd-voice")) {
    if (e.target.id === "sd-voice" || t("[data-sd-vx]")) return sdVoiceClose();
    if (t("[data-sd-vgo]")) return sdVoiceGo();
    if ((x = t("[data-sd-valt]"))) { const a = SD.vc.heard?.alts?.[+x.dataset.sdValt]; if (a) { haptic(); SD.vc.heard = { ...a.h, alts: [] }; sdVoiceRender(); sdSpeak(a.h.say); } return; }
    if (t("[data-sd-vagain]")) { SD.vc.heard = null; if (SD_REC) sdListen(); else { sdVoiceRender(); $("#sd-vtext")?.focus(); } return; }
  }
  if ((x = t("[data-sd-rp-day]"))) { SD.rp.day = x.dataset.sdRpDay; haptic(); sdReplayLoad(); return; }
  if ((x = t("[data-sd-rp-side]"))) { SD.rp.side = x.dataset.sdRpSide; haptic(); renderCard("replay"); return; }
  if (t("[data-sd-rp-reload]")) return sdReplayLoad();
  if ((x = t("[data-sd-od-cover]"))) { SD.od.cover = +x.dataset.sdOdCover; haptic(); renderCard("order"); return; }
  if ((x = t("[data-sd-od-par]"))) { SD.od.edit = SD.od.edit === x.dataset.sdOdPar ? "" : x.dataset.sdOdPar; renderCard("order"); $("#sd-od-par")?.focus(); return; }
  if ((x = t("[data-sd-od-save]"))) return sdOrderPar(x.dataset.sdOdSave, $("#sd-od-par").value, $("#sd-od-low").value);
  if ((x = t("[data-sd-od-clear]"))) return sdOrderPar(x.dataset.sdOdClear, null, null);
  if (t("[data-sd-od-reload]")) { SD.od.hist = null; return sdOrderLoad(); }
  if (t("[data-sd-v-save]")) {
    const lo = $("#sd-v-lo").value, da = $("#sd-v-day").value || "07:00", ni = $("#sd-v-night").value || "19:00";
    track(LIVE.api.saveVenue({ lastOrders: lo, dayAt: da, nightAt: ni }), "Saved for every phone", "Not saved. Try again"); haptic(); return;
  }
  const S = () => LIVE.season || { on: "", sets: [] };
  if ((x = t("[data-sd-ss-on]"))) { haptic(); sdSeasonWrite(x.dataset.sdSsOn, S().sets || []); return; }
  if (t("[data-sd-ss-new]")) { SD.ss.edit = { id: `m${Date.now().toString(36)}`, name: "", off: [], star: [] }; SD.ss.q = ""; renderCard("season"); return; }
  if ((x = t("[data-sd-ss-edit]"))) { const f = (S().sets || []).find((y) => y.id === x.dataset.sdSsEdit); if (f) { SD.ss.edit = { ...f, off: [...(f.off || [])], star: [...(f.star || [])] }; SD.ss.q = ""; renderCard("season"); } return; }
  if ((x = t("[data-sd-ss-off]")) || (x = t("[data-sd-ss-star]"))) {
    const e2 = SD.ss.edit, k = x.dataset.sdSsOff != null ? "off" : "star", n = D[+(x.dataset.sdSsOff ?? x.dataset.sdSsStar)].name;
    e2[k] = e2[k].includes(n) ? e2[k].filter((y) => y !== n) : [...e2[k], n].slice(0, k === "star" ? 6 : 400);
    if (k === "star") e2.off = e2.off.filter((y) => y !== n); else e2.star = e2.star.filter((y) => y !== n);
    haptic(); renderCard("season"); return;
  }
  if (t("[data-sd-ss-cancel]")) { SD.ss.edit = null; renderCard("season"); return; }
  if (t("[data-sd-ss-save]")) {
    const e2 = SD.ss.edit, name = ($("#sd-ss-name").value || "").trim().slice(0, 30); if (!name) { toast("Give the menu a name"); return $("#sd-ss-name").focus(); }
    const sets = [...(S().sets || []).filter((y) => y.id !== e2.id), { id: e2.id, name, off: e2.off, star: e2.star }];
    track(LIVE.api.saveSeason(S().on || "", sets), `${name} saved. Switch it on when you're ready`, "Not saved. Try again"); SD.ss.edit = null; renderCard("season"); return;
  }
  if ((x = t("[data-sd-ss-drop]"))) { const s = S(); if (!confirm("Delete this seasonal menu? The drinks themselves stay.")) return; SD.ss.edit = null; track(LIVE.api.saveSeason(s.on === x.dataset.sdSsDrop ? "" : s.on || "", (s.sets || []).filter((y) => y.id !== x.dataset.sdSsDrop)), "Deleted", "Not saved. Try again"); renderCard("season"); }
});
document.addEventListener("submit", (e) => {
  if (!e.target.closest("[data-sd-vform]")) return;
  e.preventDefault();
  const v = $("#sd-vtext").value.trim(); if (!v) return;
  sdRx?.abort?.(); SD.vc.on = false; SD.vc.text = v; SD.vc.heard = sdParse(v); sdVoiceRender();
});
document.addEventListener("input", (e) => {
  if (e.target.id === "sd-ss-q") { SD.ss.q = e.target.value; const p = e.target.selectionStart; if (SD.ss.edit) SD.ss.edit.name = $("#sd-ss-name").value; renderCard("season"); const i = $("#sd-ss-q"); i.focus(); i.setSelectionRange(p, p); }
  if (e.target.id === "sd-vtext") SD.vc.text = e.target.value;
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#sd-voice")?.hidden) sdVoiceClose(); });
addEventListener("online", sdOffline); addEventListener("offline", sdOffline);
// The brief says last orders, and the iPad shows it at the top.
if (typeof briefParts === "function") {
  const bp0 = briefParts;
  briefParts = function (side) { const l = sdLast(); return [...(l ? [{ id: "lo", k: "shift", label: "Last orders", lines: [l.at], hot: l.left <= 15 && l.left > -30 }] : []), ...bp0(side)]; };
}
// Every few seconds: the closing timer, last orders and the clock theme. Cheap: a few lookups, no network.
function sdTick() { sdTimer(); sdLastRender(); sdOffline(); applyTheme(); }
setInterval(sdTick, 15000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) sdTick(); });
const sdLive0 = liveChanged;
liveChanged = function (what) {
  sdLive0(what);
  if (["venue", "events", "reports", "closes", "me"].includes(what)) sdTick();
  if (what === "season" && $("#v-drinks") && !$("#v-drinks").hidden) renderList();
};

document.head.insertAdjacentHTML("beforeend", `<style>
#sd-off[hidden],#sd-last[hidden],#sd-timer[hidden],#sd-1h[hidden],#sd-mic[hidden]{display:none}
.sd-state{margin:10px 0;padding:10px 12px;border:1.5px solid var(--ok);border-radius:12px;background:var(--surface);line-height:1.4}.sd-state>b{display:block;color:var(--ok);font-size:17px}
.sd-state>span,.sd-state small{display:block;color:var(--muted);font-size:13px;margin-top:2px}.sd-state.swap{border-color:var(--brass)}.sd-state.swap>b{color:var(--brass)}.sd-state.no{border-color:var(--warn)}.sd-state.no>b{color:var(--warn)}.sd-adj{display:inline-block;margin:2px 0 4px;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--warn);border:1px solid var(--warn);border-radius:999px;padding:1px 8px}
.sd-in{padding:0 12px 12px}.sd-in .chips{flex-wrap:wrap;overflow:visible;margin:4px 0 0;padding:0}.sd-big{font-size:17px;margin:10px 0 4px}.sd-big b{font-size:28px;color:var(--brass);margin-right:4px}
.sd-warn{border-left:3px solid var(--warn);padding-left:10px}
.sd-tl{list-style:none;margin:8px 0;padding:0;border-left:2px solid var(--line);margin-left:46px}.sd-tl li{position:relative;display:flex;gap:8px;padding:7px 0 7px 12px}.sd-tl time{position:absolute;left:-50px;top:9px;font-size:13px;color:var(--muted);font-variant-numeric:tabular-nums}
.sd-tl .ic{flex:none;width:22px;text-align:center}.sd-tl p{margin:0;line-height:1.35}.sd-tl small{color:var(--muted);font-size:13px}.sd-tl li.big p{font-weight:700;color:var(--brass)}
#sd-timer{position:fixed;right:12px;bottom:calc(var(--tabh) + env(safe-area-inset-bottom,0px) + 12px);z-index:7;background:var(--surface);border:1.5px solid var(--brass);border-radius:14px;padding:8px 12px;box-shadow:0 6px 20px #0006;display:flex;flex-direction:column;align-items:flex-end}
#sd-timer b{font-size:20px;font-variant-numeric:tabular-nums}#sd-timer span{font-size:12px;color:var(--muted)}#sd-timer.slow{border-color:var(--warn)}
body.sd-1h #sd-timer{bottom:calc(var(--tabh) + env(safe-area-inset-bottom,0px) + 74px)}
#sd-last{margin-top:8px;display:flex;flex-direction:column;align-items:center;text-align:center;padding:12px;border:2px solid var(--brass);border-radius:14px;background:var(--surface)}
#sd-last b{font-size:22px}#sd-last span{color:var(--muted)}#sd-last.now{border-color:var(--warn)}#sd-last.now b{color:var(--warn)}
#v-station~#sd-last,body.ipad #sd-last b{font-size:30px}
#sd-off{margin-top:8px;display:grid;grid-template-columns:auto 1fr;gap:2px 10px;align-items:center;background:#16351f;color:#e9f7ec;border:1.5px solid #4caf6a;border-radius:16px;padding:10px 14px;box-shadow:0 8px 24px #0007}
#sd-off .dot{grid-row:span 2;width:14px;height:14px;border-radius:50%;background:#4caf6a;box-shadow:0 0 0 4px #4caf6a33}#sd-off b{font-size:17px}#sd-off span:last-child{font-size:13.5px;opacity:.9}
body.sd-offon #net{display:none}
#sd-mic{position:fixed;right:14px;bottom:calc(var(--tabh) + env(safe-area-inset-bottom,0px) + 14px);z-index:7;width:52px;height:52px;border-radius:50%;background:var(--surface);border:1.5px solid var(--brass);font-size:22px;box-shadow:0 6px 18px #0006}
/* The page ends clear of the 🎤, so the last row's buttons are never stuck under it. */
body:has(#sd-mic:not([hidden])) main{padding-bottom:calc(var(--tabh) + env(safe-area-inset-bottom,0px) + 84px)}
body.stmode:has(#sd-mic:not([hidden])) main{padding-bottom:calc(env(safe-area-inset-bottom,0px) + 84px)}
body:has(#sd-timer:not([hidden])) #sd-mic{bottom:calc(var(--tabh) + env(safe-area-inset-bottom,0px) + 82px)}
#sd-1h{position:fixed;left:0;right:0;bottom:calc(var(--tabh) + env(safe-area-inset-bottom,0px));z-index:9;display:grid;grid-template-columns:repeat(6,1fr);background:var(--surface);border-top:1px solid var(--line);padding:4px max(6px,env(safe-area-inset-left,0px))}
#sd-1h button{min-height:52px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:20px;color:var(--fg)}#sd-1h span{font-size:11px;color:var(--muted);margin-top:2px}
body.sd-1h main{padding-bottom:64px}body.sd-1h #sheet{padding-bottom:calc(var(--tabh) + 70px)}
.sd-heard{margin:10px 0;padding:12px;border:1.5px solid var(--brass);border-radius:12px}.sd-heard b{font-size:19px}.sd-heard.no{border-color:var(--warn)}
.sd-vform{display:flex;gap:8px;margin-top:12px}.sd-vform input{flex:1;min-width:0}.sd-vform .btn{margin:0}
.sd-pulse{animation:sdp 1.2s ease-in-out infinite}@keyframes sdp{50%{opacity:.4}}
.sd-season{margin:8px 0;padding:10px 12px;border:1.5px solid var(--brass);border-radius:12px;background:var(--surface)}.sd-season small{display:block;color:var(--muted);margin-top:4px}
.sd-ss{list-style:none;margin:6px 0;padding:0}.sd-ss li{display:flex;align-items:center;gap:6px;padding:6px 0;border-bottom:1px solid var(--line)}.sd-ss li>span{flex:1;min-width:0}.sd-ss small{display:block;color:var(--muted);font-size:12px}.sd-ss .chip{margin:0;flex:none}
.sd-ss-sets{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.sd-ss-sets .btn{margin:0}
body.sd-a11y{--display:var(--body);font-size:112%;letter-spacing:.03em;word-spacing:.12em;line-height:1.6}
body.sd-a11y h1,body.sd-a11y h2,body.sd-a11y h3,body.sd-a11y .sec,body.sd-a11y .h3{text-transform:none;letter-spacing:.02em;line-height:1.25}
body.sd-a11y em,body.sd-a11y i{font-style:normal}
body.sd-a11y .btn,body.sd-a11y .chip,body.sd-a11y .seg button,body.sd-a11y nav.tabs button{min-height:52px}
:root[data-theme="dark"] body.sd-a11y,:root[data-theme="gold"] body.sd-a11y{--ok:#56b4e9;--warn:#e69f00}:root[data-theme="light"] body.sd-a11y{--ok:#0072b2;--warn:#d55e00}
@media (min-width:900px){#sd-1h{display:none}body.sd-1h main{padding-bottom:0}}
</style>`);
SD_READY = true;
sdApplyModes(); sdTick();
LINKS.replay = () => "#at=replay"; LINKS.orderdraft = () => "#at=order";
{ const sd0 = SHARE.drink; SHARE.drink = (id) => { const m = sd0(id), d = D[+id]; if (m && d && sdHouse(d) && plOutOf(d).miss.length) m.head = ["Adjusted tonight: not the house spec", ...m.head]; return m; }; }
