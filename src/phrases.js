/* ---------- Language lessons (Training, Games and drills) ----------
   Short lessons in the phrases staff really say to guests, in any guest language, easy enough for a 12-year-old.
   The way Duolingo teaches, kept small: learn a few cards (the phrase, how to say it, what it means, hear it), then a
   mixed check of five: hear it and pick the meaning, read it and pick the meaning, pick how to say an English line,
   put the words in order, and say it out loud to the phone's microphone where it can listen. Every lesson done counts
   towards the same daily streak as the drill. All on this phone only (store "phr").
   The phrases are the guest screen's own (talkdata.js), written by hand in 17 languages with sound-it-out lines for
   most. Any other language works too while live translation is on: the phrases are translated once and kept, with no
   sound-it-out line, and marked as translated live. */
// The three sets: at the bar, on the floor, and the friendly small talk (check-backs, desserts, coffee, tea, goodbye).
const PH_SETS = [["bar", "Bar", ["start", "bar", "pay"]], ["floor", "Floor", ["start", "order", "food", "allergy", "pay"]], ["chat", "Small talk", ["check", "dessert", "coffee", "tea", "bye"]]];
const PH_HAND = TK_HAND.map(([c]) => c);
const phSet = () => ({ lang: "fr", side: "bar", en: true, say: true, seen: {}, ...store.get("phr", {}) });
let PHS = phSet(), PRUN = null;
if (!PH_SETS.some(([k]) => k === PHS.side)) PHS.side = "bar";
const phSave = () => store.set("phr", PHS);
const phHand = (c) => PH_HAND.includes(gBase(c));
// The lesson's cards: [English, words in the language, sound it out]. Hand-written first; live-translated ones for
// any other language once fetched; none where neither exists.
function phCards() {
  const secs = PH_SETS.find(([k]) => k === PHS.side)[2], c = PHS.lang, w = phHand(c) ? null : aiWords(c);
  return TK.filter((r) => r[1] === "s" && secs.includes(r[2]) && r[0] !== "ourmenu").map((r) => {
    const en = r[3].replace("{lang}", langEn(c)), h = gOf(r[4], c);
    return { id: r[0], en, t: h?.[0] || (w && w[aiKey(en)]) || "", say: h?.[1] || "", live: !h };
  }).filter((x) => x.t).slice(0, 12);
}
// A language without hand-written phrases: translate the set's lines once (live), then start.
async function phFetch() {
  const c = PHS.lang, secs = PH_SETS.find(([k]) => k === PHS.side)[2], w = aiWords(c);
  const need = TK.filter((r) => r[1] === "s" && secs.includes(r[2])).map((r) => r[3].replace("{lang}", langEn(c))).filter((en) => !w[aiKey(en)]);
  if (!need.length) return true;
  if (!aiOn()) { toast(`${langEn(c)} lessons need live translation: Maintenance switches it on in More`); return false; }
  try { const out = await LIVE.api.translate(need, langEn(c)); need.forEach((en, i) => { if (out[i]) w[aiKey(en)] = out[i].trim(); }); store.set("lang.ai." + c, w); return true; }
  catch { toast("Couldn't get the phrases. Check the signal"); return false; }
}
const phSpeak = (text, slow) => sayIn(text, PHS.lang, slow);
async function phStart() {
  haptic(); sayStop(); sayUnlock();
  if (!phHand(PHS.lang) && !(await phFetch())) return;
  if (!phCards().length) return toast("No phrases for that one yet");
  PRUN = { i: 0 }; FN.view = "phr"; renderFun();
}
/* The check: five questions, a mix of kinds. */
const phWordsOf = (t) => (/^(zh|ja|th|lo|km|my)/.test(PHS.lang) ? null : t.replace(/[¡¿!?.,。！？、]/g, "").split(/\s+/).filter(Boolean));
const phPlain = (t) => t.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
function phCheck() {
  const r = Math.random, xs = phCards(), pick = shuffle(r, xs).slice(0, 5), others = (x) => shuffle(r, xs.filter((y) => y !== x)).slice(0, 2);
  const kinds = ["hear", "read", "say", "tiles", "speak"].filter((k) => (k !== "speak" || canHear(PHS.lang)) && (k !== "hear" || canSay(PHS.lang)));
  PRUN.qs = pick.map((x, i) => {
    let k = kinds[i % kinds.length];
    const ws = phWordsOf(x.t);
    if (k === "tiles" && (!ws || ws.length < 2 || ws.length > 8)) k = "read";
    if (k === "hear" || k === "read") return { k, x, answer: x.en, opts: shuffle(r, [x.en, ...others(x).map((y) => y.en)]) };
    if (k === "say") return { k, x, answer: x.t, opts: shuffle(r, [x.t, ...others(x).map((y) => y.t)]) };
    if (k === "tiles") return { k, x, answer: ws.join(" "), tiles: shuffle(r, ws.map((w, j) => ({ w, j }))), got: [] };
    return { k, x, answer: x.t };
  });
  PRUN.q = 0; PRUN.pick = null; PRUN.right = 0;
  FN.view = "phrCheck"; renderFun(); phAuto();
}
const phAuto = () => { const q = PRUN.qs[PRUN.q]; if (q.k === "hear") phSpeak(q.x.t); };
function phCheckHtml() {
  const z = PRUN, q = z.qs[z.q], picked = z.pick != null, ok = picked && z.pick === q.answer;
  const opt = (o, lang) => `<button class="btn wide${picked && o === q.answer ? " right" : picked && o === z.pick ? " wrong" : ""}" data-ph-ans="${esc(o)}"${lang ? ` lang="${PHS.lang}" translate="no"` : ""}${picked ? " disabled" : ""}>${picked && o === q.answer ? "✓ " : picked && o === z.pick ? "✗ " : ""}${esc(o)}</button>`;
  const hear = `<div class="ph-hb"><button class="btn pri ph-hear" data-ph-hear="${esc(q.x.t)}">🔊 Play it</button><button class="btn ph-hear" data-ph-hear="${esc(q.x.t)}" data-ph-slow aria-label="Play it slowly">🐢 Slow</button></div>`;
  const big = `<p class="ph-say" lang="${PHS.lang}" translate="no">${esc(q.x.t)}</p>`;
  let body = "";
  if (q.k === "hear") body = `<p class="mini">Listen. What does it mean?</p>${hear}${picked ? big : ""}<div class="qz-opts">${q.opts.map((o) => opt(o)).join("")}</div>`;
  if (q.k === "read") body = `<p class="mini">What does it mean?</p>${big}<div class="qz-opts">${q.opts.map((o) => opt(o)).join("")}</div>`;
  if (q.k === "say") body = `<p class="mini">How do you say it?</p><p class="ph-en" style="font-size:22px;color:var(--fg)">${esc(q.x.en)}</p><div class="qz-opts">${q.opts.map((o) => opt(o, true)).join("")}</div>`;
  if (q.k === "tiles") body = `<p class="mini">Tap the words in order</p><p class="ph-en" style="font-size:20px;color:var(--fg)">${esc(q.x.en)}</p>
    <div class="ph-line" lang="${PHS.lang}" translate="no">${q.got.map((t, i) => `<button class="chip" data-ph-untile="${i}"${picked ? " disabled" : ""}>${esc(t.w)}</button>`).join("") || "&nbsp;"}</div>
    <div class="ph-tiles" lang="${PHS.lang}" translate="no">${q.tiles.map((t, i) => `<button class="chip" data-ph-tile="${i}"${q.got.includes(t) || picked ? " disabled" : ""}>${esc(t.w)}</button>`).join("")}</div>
    ${picked ? big : `<button class="btn pri wide" data-ph-tcheck${q.got.length === q.tiles.length ? "" : " disabled"}>Check</button>`}`;
  if (q.k === "speak") body = `<p class="mini">Say it out loud</p>${big}${PHS.say && q.x.say ? `<p class="ph-pron" translate="no">${esc(q.x.say)}</p>` : ""}<p class="ph-en">${esc(q.x.en)}</p>${hear}
    ${picked ? `<p class="qz-said">Heard: <b lang="${PHS.lang}">${esc(z.heard || "nothing")}</b></p>` : `<button class="btn pri wide" data-ph-speak>🎤 Tap, then say it</button><button class="linkbtn" data-ph-sskip>Can't talk now</button>`}`;
  return `<div class="dr-head"><b>Quick check</b><span>${z.q + 1} of ${z.qs.length}</span><button class="linkbtn" data-ph="skip">Skip</button></div>
    <div class="card ph-card">${body}
      ${picked ? `<p class="qz-said" role="status"><b>${ok ? "Right!" : q.k === "speak" ? "Nearly! Listen and try it on a guest." : "Nearly. Here's the right one."}</b></p><button class="btn pri wide" data-ph="cnext">${z.q + 1 < z.qs.length ? "Next" : "Finish"}</button>` : ""}</div>`;
}
// Said out loud: right when most of the words (or characters) match.
function phSpeakCheck(btn) {
  const q = PRUN.qs[PRUN.q]; btn.disabled = true; btn.textContent = "🎤 Listening…";
  listenIn(PHS.lang, () => {}, (state, got) => {
    if (state === "on") return;
    if (state === "blocked" || state === "none") { toast("The microphone isn't available here"); PRUN.pick = "-"; return renderFun(); }
    PRUN.heard = got || ""; const a = phPlain(q.answer), h = phPlain(PRUN.heard);
    const aw = phWordsOf(a) || [...a.replace(/\s/g, "")], hw = new Set(phWordsOf(h) || [...h.replace(/\s/g, "")]);
    const score = aw.length ? aw.filter((w) => hw.has(w)).length / aw.length : 0;
    PRUN.pick = score >= 0.6 ? q.answer : "-"; if (score >= 0.6) PRUN.right++;
    renderFun();
  });
}
// A lesson done counts as today's practice, the same streak as the drill.
function phDone() {
  const t = fnDay();
  if (!DR.days.includes(t)) { DR.days = [...DR.days, t].slice(-400); drillSave(); }
  FN.view = "phrEnd"; renderFun();
}
const phNat = () => langOwn(PHS.lang), phSide = () => PH_SETS.find(([k]) => k === PHS.side)[1];
function phHtml() {
  const xs = phCards(), r = xs[PRUN.i], last = PRUN.i === xs.length - 1;
  (PHS.seen[PHS.lang] ||= {})[r.id] = 1; phSave();
  return `<div class="dr-head"><b translate="no">${esc(phNat())} · ${phSide()}</b><span>${PRUN.i + 1} of ${xs.length}</span><button class="linkbtn" data-fn="home">Stop</button></div>
    <div class="card ph-card">
      <p class="ph-say" lang="${PHS.lang}" translate="no">${esc(r.t)}</p>
      ${PHS.say && r.say ? `<p class="ph-pron" translate="no">${esc(r.say)}</p>` : ""}
      ${PHS.en ? `<p class="ph-en">${esc(r.en)}</p>` : ""}
      ${r.live ? `<p class="note">Translated live: check with a ${esc(langEn(PHS.lang))} speaker before you rely on it.</p>` : ""}
      ${canSay(PHS.lang) ? `<div class="ph-hb"><button class="btn pri ph-hear" data-ph-hear="${esc(r.t)}">🔊 Hear it</button><button class="btn ph-hear" data-ph-hear="${esc(r.t)}" data-ph-slow aria-label="Hear it slowly">🐢 Slow</button></div>` : `<p class="note">This phone has no ${esc(langEn(PHS.lang))} voice${r.say ? ": use the sound-it-out line" : ""}.</p>`}
    </div>
    <div class="ph-nav"><button class="btn" data-ph="back"${PRUN.i ? "" : " disabled"}>‹ Back</button><button class="btn pri" data-ph="next">${last ? "Quick check" : "Next ›"}</button></div>
    <div class="ph-tg"><label class="check"><input type="checkbox" data-ph-tg="en"${PHS.en ? " checked" : ""}> Show the English</label><label class="check"><input type="checkbox" data-ph-tg="say"${PHS.say ? " checked" : ""}> Show how to say it</label></div>`;
}
function phEndHtml() {
  const s = drillStreak();
  return `<button class="back" data-fn="home">‹ Games and drills</button>
    <div class="card dr-end"><p class="dr-fire" aria-hidden="true">${s >= 2 ? "🔥" : "✅"}</p><h2>Nice one!</h2>
      <p class="lead" style="margin:6px auto 0">${s ? `${plural(s, "day")} in a row.` : ""} Try one on a guest tonight.</p>${PRUN?.qs ? `<p class="note">${PRUN.right} of ${PRUN.qs.length} right.</p>` : ""}</div>
    <div class="sec" translate="no">${esc(phNat())} · ${phSide()}</div>
    ${phCards().map((r) => `<button class="ph-row" data-ph-hear="${esc(r.t)}"><b lang="${PHS.lang}" translate="no">🔊 ${esc(r.t)}</b>${PHS.en ? `<span>${esc(r.en)}</span>` : ""}</button>`).join("")}
    <div class="actions"><button class="btn pri" data-fn="phr">Go again</button><button class="btn" data-fn="home">Done</button></div>
    <p class="note">Something sound off to a native speaker? Tell maintenance in App feedback.</p>`;
}
function phCardHtml() {
  const chip = (k, v, l, lang) => `<button class="chip" data-ph-${k}="${v}" aria-pressed="${PHS[k] === v}"${lang ? ` lang="${v}" translate="no"` : ""}>${l}</button>`;
  const more = aiOn() ? WORLD.filter(([c]) => !phHand(c)) : [];
  return `<div class="dr-card ph"><span class="k">Language lessons</span><b class="t">Talk to guests in their language</b>
    <span class="s">A few phrases at a time: hear them, read them, put the words in order, then say them out loud.</span>
    <span class="recent ph-langs">${PH_HAND.map((c) => chip("lang", c, esc(langOwn(c)), true)).join("")}</span>
    ${more.length ? `<label class="ph-more"><span>More languages (translated live)</span><select data-ph-pick aria-label="More languages"><option value="">Pick one…</option>${more.map(([c]) => `<option value="${c}"${PHS.lang === c ? " selected" : ""}>${esc(langOwn(c))} · ${esc(langEn(c))}</option>`).join("")}</select></label>` : ""}
    <span class="recent ph-langs">${PH_SETS.map(([k, l]) => chip("side", k, l)).join("")}</span>
    <button class="btn pri" data-fn="phr">Start</button></div>`;
}
$("#v-fun").addEventListener("click", (e) => {
  const l = e.target.closest("[data-ph-lang], [data-ph-side]");
  if (l) { haptic(); if (l.dataset.phLang) PHS.lang = l.dataset.phLang; if (l.dataset.phSide) PHS.side = l.dataset.phSide; phSave(); renderFun(); return; }
  const h = e.target.closest("[data-ph-hear]"); if (h) { haptic(); return phSpeak(h.dataset.phHear, "phSlow" in h.dataset); }
  const q = PRUN?.qs?.[PRUN.q];
  const a = e.target.closest("[data-ph-ans]");
  if (a && q && PRUN.pick == null) { haptic(); PRUN.pick = a.dataset.phAns; if (PRUN.pick === q.answer) PRUN.right++; if (q.k !== "hear") phSpeak(q.x.t); return renderFun(); }
  const ti = e.target.closest("[data-ph-tile]"); if (ti && q) { haptic(); q.got.push(q.tiles[+ti.dataset.phTile]); return renderFun(); }
  const ut = e.target.closest("[data-ph-untile]"); if (ut && q) { haptic(); q.got.splice(+ut.dataset.phUntile, 1); return renderFun(); }
  if (e.target.closest("[data-ph-tcheck]") && q) { haptic(); PRUN.pick = q.got.map((t) => t.w).join(" "); if (PRUN.pick === q.answer) PRUN.right++; phSpeak(q.x.t); return renderFun(); }
  const sp = e.target.closest("[data-ph-speak]"); if (sp && q) { sayUnlock(); return phSpeakCheck(sp); }
  if (e.target.closest("[data-ph-sskip]") && q) { PRUN.pick = "-"; return renderFun(); }
  const b = e.target.closest("[data-ph]"); if (!b || !PRUN) return;
  haptic();
  if (b.dataset.ph === "back" && PRUN.i > 0) PRUN.i--;
  else if (b.dataset.ph === "next") { if (PRUN.i >= phCards().length - 1) return phCheck(); PRUN.i++; }
  else if (b.dataset.ph === "skip") return phDone();
  else if (b.dataset.ph === "cnext") { PRUN.q++; PRUN.pick = null; PRUN.heard = ""; if (PRUN.q >= PRUN.qs.length) return phDone(); renderFun(); return phAuto(); }
  renderFun();
});
document.addEventListener("change", (e) => {
  if (e.target.matches?.("[data-ph-pick]") && e.target.value) { PHS.lang = e.target.value; phSave(); haptic(); return renderFun(); }
  const t = e.target.closest?.("[data-ph-tg]"); if (!t) return;
  PHS[t.dataset.phTg] = t.checked; phSave(); if (cur === "fun") renderFun();
});
document.head.insertAdjacentHTML("beforeend", `<style>
.ph-line{display:flex;flex-wrap:wrap;gap:6px;min-height:48px;padding:8px;margin:12px 0 8px;border-bottom:2px solid var(--line)}
.ph-tiles{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 14px}.ph-tiles .chip,.ph-line .chip{font-size:18px;padding:8px 12px}.ph-tiles .chip:disabled{opacity:.25}
.ph-more{display:flex;flex-direction:column;gap:4px;margin:8px 0 0;font-size:13px;color:var(--muted)}.ph-more select{font:inherit;font-size:15px;color:var(--fg);background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:8px}
</style>`);
