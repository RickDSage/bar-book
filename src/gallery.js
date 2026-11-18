/* ---------- Photos: every photo the team took on a shift, in one place ----------
   Bar and floor, from every phone and the iPad, sent with a handover or not yet: who took it, when, and its note. Tap
   photos to pick them (or Pick all), then Send goes to the same Send page as everything else. Photos are kept 30 days,
   so the days to pick from go back that far. Sent photos are read once per handover and kept for the visit. */
const GAL = { day: null, pick: new Set(), side: "all", cache: new Map(), list: [], big: null };
const photoDay = (p) => ukDay((p.at ? ms(p.at) : Date.now()) - 6 * 36e5);
function galDays() {
  const ds = new Set([shiftDay()]);
  LIVE.draftPhotos.forEach((p) => ds.add(photoDay(p)));
  LIVE.reports.filter((r) => !r.pending && r.photos).forEach((r) => ds.add(reportDay(r)));
  return [...ds].sort().reverse().slice(0, 10);
}
async function galLoad(day) {
  const unsent = LIVE.draftPhotos.filter((p) => photoDay(p) === day);
  const reps = LIVE.reports.filter((r) => !r.pending && r.photos && reportDay(r) === day);
  const sent = (await Promise.all(reps.map(async (r) => {
    if (!GAL.cache.has(r.id)) GAL.cache.set(r.id, await LIVE.api.loadPhotos(r.id));
    return GAL.cache.get(r.id).map((p) => ({ ...p, rep: r }));
  }))).flat();
  const ids = new Set(sent.map((p) => p.id));
  return [...sent, ...unsent.filter((p) => !ids.has(p.id))].map((p) => ({ ...p, side: p.side || p.rep?.side || "bar" })).sort((a, b) => ms(a.at) - ms(b.at));
}
function openGallery(day = shiftDay(), back = false) {
  if (!LIVE.me) { show("notices"); return toast("Join the team to see the photos"); }
  if ($("#sheet").hidden) lastFocus = document.activeElement;
  if (GAL.day !== day) { GAL.day = day; GAL.pick.clear(); }
  snd = null;
  $("#sheet").innerHTML = `<div class="sheet-top"><div class="bar1"><button class="back" id="sh-close">‹ Back</button><span class="t">Photos</span><span></span></div></div><div id="gal"><p class="note" role="status">Loading the photos…</p></div>`;
  showSheet(back); $("#sheet").scrollTop = 0; $("#sh-close").focus();
  galLoad(day).then((xs) => { if (GAL.day !== day || !$("#gal")) return; GAL.list = xs; galRender(); },
    () => { const g = $("#gal"); if (g) g.innerHTML = `<p class="note">Couldn't load them. Check the signal and open it again.</p>`; });
}
// New photos or a handover sent while it's open: read again, keeping what's picked.
let galT = 0;
function galRefresh() { clearTimeout(galT); galT = setTimeout(() => { const d = GAL.day; galLoad(d).then((xs) => { if (GAL.day === d && $("#gal")) { GAL.list = xs; galRender(); } }, () => {}); }, 300); }
const galShown = () => GAL.list.filter((p) => GAL.side === "all" || p.side === GAL.side);
function galRender() {
  const el = $("#gal"); if (!el) return;
  const xs = galShown(), n = GAL.pick.size, by = (s) => GAL.list.filter((p) => p.side === s).length;
  const where = (p) => (p.rep ? `On the handover sent by ${p.rep.name}` : "Not sent yet");
  el.innerHTML = `<h2 id="sh-name" style="margin-top:12px">${GAL.day === shiftDay() ? "Tonight's photos" : `Photos, ${esc(dayName(GAL.day))}`}</h2>
    <div class="recent gal-days" role="group" aria-label="Which shift">${galDays().map((d) => `<button class="chip" data-gal-day="${d}" aria-pressed="${d === GAL.day}">${esc(d === shiftDay() ? "Tonight" : dayName(d))}</button>`).join("")}</div>
    ${GAL.list.length ? `<div class="recent gal-side" role="group" aria-label="Bar or floor">${[["all", `All ${GAL.list.length}`], ["bar", `Bar ${by("bar")}`], ["floor", `Floor ${by("floor")}`]].map(([k, t]) => `<button data-gal-side="${k}" class="chip" aria-pressed="${GAL.side === k}">${t}</button>`).join("")}</div>
      <p class="note">Every photo from every phone and the iPad. Tap photos to pick them, then Send.</p>
      <div class="gal-grid">${xs.map((p) => `<figure class="gal-ph"><button class="gal-pk" data-gal-pk="${p.id}" aria-pressed="${GAL.pick.has(p.id)}" aria-label="Pick this photo"><img src="${p.data}" alt="${esc(p.note || "Photo")}" loading="lazy"><span class="gal-tick" aria-hidden="true">${GAL.pick.has(p.id) ? "✓" : ""}</span></button>
        <figcaption><b>${esc(sideName(p.side))} · ${p.at ? hhmm(new Date(ms(p.at))) : ""}</b> <span translate="no">${esc(p.name || "")}</span>${p.note ? `<span class="gal-note" translate="no">${esc(p.note)}</span>` : ""}<small>${esc(where(p))}</small></figcaption>
        <button class="gal-big" data-gal-big="${p.id}" aria-label="See it full size">⤢</button></figure>`).join("")}</div>`
    : `<p class="empty">No photos for this shift yet.</p>`}
    ${GAL.day === shiftDay() ? `<div class="addph"><label class="btn${GAL.list.length ? "" : " pri"}" for="ph-in">Take a ${esc(lower(sideName(mode)))} photo</label><label class="btn" for="ph-pick">Choose from your photos</label></div>` : ""}
    ${GAL.list.length ? `<div class="gal-bar"><button class="btn" data-gal-all>${xs.length && xs.every((p) => GAL.pick.has(p.id)) ? "Unpick all" : "Pick all"}</button>${n ? `<button class="btn pri" data-gal-send>Send ${plural(n, "photo")}</button>` : `<span class="note">Pick photos to send</span>`}</div>` : ""}`;
}
function galBig(id) {
  const p = GAL.list.find((x) => x.id === id); if (!p) return;
  let el = $("#gal-lb"); if (!el) { el = document.createElement("div"); el.id = "gal-lb"; el.className = "gal-lb"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "The photo"); document.body.append(el); }
  el.innerHTML = `<img src="${p.data}" alt="${esc(p.note || "Photo")}"><span>${esc(sideName(p.side))} · ${esc(p.name || "")} · ${p.at ? hhmm(new Date(ms(p.at))) : ""}${p.note ? ` · ${esc(p.note)}` : ""}</span>
    <div class="actions"><button class="btn" data-rt-photo="${p.id}">Read the text in it</button><button class="btn" data-gal-lb-x>Close</button></div>`;
  el.hidden = false; haptic();
}

/* ---------- Read text: the words in any photo ----------
   Take or choose a photo (or open one from Photos) and the same free text reader as payslips and delivery notes reads
   it on this phone: the photo on top, what it read underneath, to copy or search. The photo is never sent anywhere. */
let RT = null;
function rtShow(src) {
  let el = $("#rt"); if (!el) { el = document.createElement("div"); el.id = "rt"; el.className = "rt"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Read text"); document.body.append(el); }
  if (RT?.blob) URL.revokeObjectURL(RT.url);
  RT = src ? { url: typeof src === "string" ? src : URL.createObjectURL(src), blob: typeof src !== "string", text: null, msg: "Reading the picture…", q: "" } : { url: "", text: null, msg: "", q: "" };
  el.hidden = false; rtDraw();
  if (src) rtRead(src, RT);
}
async function rtRead(src, me) {
  try {
    const f = typeof src === "string" ? new File([await (await fetch(src)).blob()], "photo.jpg", { type: "image/jpeg" }) : src;
    const [t] = await readFiles([f], (m) => { if (RT === me) { me.msg = m; const s = $("#rt-msg"); if (s) s.textContent = m; } });
    if (RT === me) { me.text = t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim(); rtDraw(); }
  } catch { if (RT === me) { me.msg = "The text reader needs signal the first time. Try again with signal."; rtDraw(); } }
}
function rtDraw() {
  const el = $("#rt"); if (!el || !RT) return;
  const lines = (RT.text || "").split("\n"), q = RT.q.trim().toLowerCase(), hits = q ? lines.filter((l) => l.toLowerCase().includes(q)) : [];
  const mark = (l) => (q ? esc(l).replace(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/&/g, "&amp;").replace(/</g, "&lt;"), "gi"), (m) => `<mark>${m}</mark>`) : esc(l));
  el.innerHTML = `<div class="bar1"><button class="back" data-rt-x>‹ Back</button><span class="t">Read text</span><span></span></div>
    <div class="addph"><label class="btn${RT.url ? "" : " pri"}" for="rt-cam">📷 Take a photo</label><label class="btn" for="rt-pick">Choose a photo</label></div>
    <input id="rt-cam" type="file" accept="image/*" capture="environment" hidden><input id="rt-pick" type="file" accept="image/*" hidden>
    ${RT.url ? `<img class="rt-img" src="${RT.url}" alt="The photo">` : `<p class="note">A label, a note, a letter, a sign: take or choose a photo and its words come up here to copy or search. It's read on this phone.</p>`}
    ${RT.text == null ? (RT.msg ? `<p class="note" id="rt-msg" role="status">${esc(RT.msg)}</p>` : "")
      : RT.text ? `<div class="ltools"><input id="rt-q" type="search" placeholder="Search the text" aria-label="Search the text" value="${esc(RT.q)}"><button class="btn" data-rt-copy>Copy all</button></div>
        ${q ? `<p class="s" role="status">${hits.length ? `${hits.length} line${hits.length === 1 ? "" : "s"} with “${esc(RT.q.trim())}”` : `No “${esc(RT.q.trim())}” in it`}</p>` : ""}
        <div class="rt-text" id="rt-text">${(q ? hits : lines).map((l) => `<p>${mark(l) || "&nbsp;"}</p>`).join("")}</div>
        <p class="s">The reader can slip on handwriting, curved bottles and small print: check it against the photo.</p>`
      : `<p class="note">No words found. Try closer, flatter and in good light.</p>`}`;
}
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-rt-open]")) { haptic(); return rtShow(null); }
  const rp = e.target.closest("[data-rt-photo]"); if (rp) { const p = GAL.list.find((x) => x.id === rp.dataset.rtPhoto); $("#gal-lb").hidden = true; haptic(); return p && rtShow(p.data); }
  if (e.target.closest("[data-rt-x]")) { $("#rt").hidden = true; if (RT?.blob) URL.revokeObjectURL(RT.url); RT = null; return; }
  if (e.target.closest("[data-rt-copy]")) return navigator.clipboard?.writeText(RT.text).then(() => toast("Copied. Paste it anywhere"), () => toast("Couldn't copy. Press and hold the text to copy it"));
  if (e.target.closest("[data-gal-lb-x]") || e.target.id === "gal-lb") { $("#gal-lb").hidden = true; return; }
  if (!$("#gal")) return;
  const d = e.target.closest("[data-gal-day]"); if (d) { haptic(); return openGallery(d.dataset.galDay, true); }
  const sd = e.target.closest("[data-gal-side]"); if (sd) { haptic(); GAL.side = sd.dataset.galSide; return galRender(); }
  const bg = e.target.closest("[data-gal-big]"); if (bg) return galBig(bg.dataset.galBig);
  const pk = e.target.closest("[data-gal-pk]"); if (pk) { const id = pk.dataset.galPk; GAL.pick.has(id) ? GAL.pick.delete(id) : GAL.pick.add(id); haptic(); return galRender(); }
  if (e.target.closest("[data-gal-all]")) { const xs = galShown(), all = xs.every((p) => GAL.pick.has(p.id)); xs.forEach((p) => (all ? GAL.pick.delete(p.id) : GAL.pick.add(p.id))); haptic(); return galRender(); }
  if (e.target.closest("[data-gal-send]")) { haptic(); openSend("photos", GAL.day); }
});
document.addEventListener("change", (e) => { if ((e.target.id === "rt-cam" || e.target.id === "rt-pick") && e.target.files[0]) { rtShow(e.target.files[0]); } });
document.addEventListener("input", (e) => { if (e.target.id === "rt-q" && RT) { RT.q = e.target.value; rtDraw(); const i = $("#rt-q"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); } });
// The picked photos as a message: who took each and when, with the link back to this shift's photos.
SHARE.photos = (day = GAL.day) => {
  const xs = GAL.list.filter((p) => GAL.pick.has(p.id)); if (!xs.length) return null;
  const sides = [...new Set(xs.map((p) => lower(sideName(p.side))))].join(" and ").replace(/^./, (c) => c.toUpperCase());
  return { what: `${plural(xs.length, "photo")}`, title: `📷 ${sides} photos, ${dayName(day)}`, head: [], photoN: xs.length, link: appUrl(`#at=gallery:${day}`),
    parts: [{ id: "who", label: "Who took them", lines: xs.map((p) => `${p.at ? hhmm(new Date(ms(p.at))) : ""} ${sideName(p.side)}, ${p.name || ""}${p.note ? `: ${p.note}` : ""}`) }],
    photos: async () => xs.slice(0, SEND_MAX).map((p, i) => ({ data: p.data, note: p.note, file: `${p.side}-${day}-${i + 1}` })),
    tip: xs.length > SEND_MAX ? `${SEND_MAX} photos go at a time. Send these, then pick the rest.` : "" };
};
document.head.insertAdjacentHTML("beforeend", `<style>
.gal-days { margin: 6px 0 10px; }
.gal-side { margin: 0 0 8px; }
.gal-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; margin: 10px 0 90px; }
@media (min-width: 900px) { .gal-grid { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); } }
.gal-ph { position: relative; margin: 0; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; background: var(--surface); }
.gal-pk { display: block; position: relative; width: 100%; padding: 0; }
.gal-pk img { display: block; width: 100%; aspect-ratio: 4 / 3; object-fit: cover; }
.gal-pk[aria-pressed="true"] { outline: 4px solid var(--brass); outline-offset: -4px; }
.gal-tick { position: absolute; top: 8px; left: 8px; display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; border: 2px solid #fff; background: rgba(0,0,0,.35); color: var(--brass-ink); font-weight: 800; }
.gal-pk[aria-pressed="true"] .gal-tick { background: var(--brass); border-color: var(--brass); }
.gal-big { position: absolute; top: 6px; right: 6px; width: 44px; height: 44px; border-radius: 50%; background: rgba(0,0,0,.45); color: #fff; font-size: 20px; }
.gal-ph figcaption { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px 10px; font-size: 14px; }
.gal-ph figcaption small { color: var(--muted); }
.gal-note { font-style: italic; }
.gal-bar { position: sticky; bottom: 0; display: flex; align-items: center; gap: 10px; padding: 10px 0 calc(10px + env(safe-area-inset-bottom, 0px)); background: var(--bg); border-top: 1px solid var(--line); }
.gal-bar .btn.pri { flex: 1; }
.gal-lb { position: fixed; inset: 0; z-index: 60; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 16px; background: rgba(0,0,0,.92); color: #fff; }
.gal-lb[hidden] { display: none; }
.gal-lb .actions { justify-content: center; }
.gal-lb .btn { background: #222; color: #fff; border-color: #555; }
.rt { position: fixed; inset: 0; z-index: 61; overflow-y: auto; padding: calc(10px + env(safe-area-inset-top, 0px)) 16px calc(24px + env(safe-area-inset-bottom, 0px)); background: var(--bg); }
.rt[hidden] { display: none; }
.rt .bar1 { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 8px; margin-bottom: 8px; }
.rt .bar1 .t { text-align: center; font-weight: 800; }
.rt-img { display: block; max-width: 100%; max-height: 40vh; margin: 10px auto; border-radius: 10px; object-fit: contain; }
.rt-text { margin: 10px 0; padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); font-size: 17px; line-height: 1.45; user-select: text; -webkit-user-select: text; }
.rt-text p { margin: 0; }
.rt-text mark { background: var(--brass); color: var(--brass-ink); border-radius: 3px; }
.gal-lb img { max-width: 100%; max-height: 72vh; object-fit: contain; border-radius: 8px; }
</style>`);
