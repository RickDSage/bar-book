/* ---------- Talk to a guest (guest.js) ----------
   Hand the phone or iPad to a guest: they pick their language from the whole world list, read a short hello from the
   member of staff in it (and can say "English is fine"), then see every drink, beer, wine and cake in their language,
   tap the allergy card, and talk both ways: the guest speaks, types or taps a reply, staff speak, type or tap a ready
   phrase in English, and each side sees and hears it in their own language.
   What's written by hand (talkdata.js) works offline. Anything else (descriptions, what's typed or said) is translated
   live when live translation is on (lang.js), and labelled so. Allergen names are never translated live: the guest
   language's hand-written names, or the English with a picture.
   Staff-only things (logs, pay, closing, codes) sit under this screen and nothing on it opens them. ✕ Staff returns. */
var GUEST = { on: false, c: "", step: "pick", tab: "talk", msgs: [], q: "", mq: "", al: new Set(), open: null, menu: "drinks", sec: "start", at: 0 };
// Hand-written words for a language: its own, else the main language's (Brazilian Portuguese uses Portuguese), but
// never Simplified Chinese for Traditional.
const gBase = (c) => (/^zh-(TW|HK|Hant)/i.test(c || "") ? c : (c || "").split("-")[0]);
const gOf = (o, c) => o && (o[c] ?? o[gBase(c)]);
const GDICT = { c: null, w: {} };
// The guest language's own built-in words, if it has them, loaded without changing the staff language.
async function gLoad(c) {
  GDICT.c = c; GDICT.w = {};
  if (!LANG_BUILT.has(c)) return;
  const p = c === lang ? langPack(c) : null;
  if (p) { GDICT.w = p; return; }
  try { const r = await fetch(`lang/${c}.json?v=${I18N.v}`); if (r.ok && GDICT.c === c) GDICT.w = await r.json(); } catch {}
}
// A line in the guest's language: hand-written, built in, translated live before, or (asked for now) English for the moment.
const TK_BY = new Map(TK.map((r) => [r[3], r]));
function gHand(en, c = GUEST.c) { const r = TK_BY.get(en); return (r && gOf(r[4], c)?.[0]) || gOf(G_UI[en], c); }
function gLook(en, c = GUEST.c) {
  if (!c) return en;
  const h = gHand(en, c); if (h) return h;
  const k = aiKey(en), w = aiWords(c), ns = en.match(TR_NUM) || [], put = (t) => t.replace(/\{(\d)\}/g, (_, j) => ns[j - 1] ?? "");
  if (GDICT.c === c && (GDICT.w[en] || GDICT.w[k])) return GDICT.w[en] || put(GDICT.w[k]);
  if (w[k]) return put(w[k]);
  gAsk(k, c);
  return null;
}
// Lines to translate live for the guest's language: sent in batches, the screen redrawn when they're back.
const G_Q = new Set(), G_ASKED = new Set(); let gBusy = false, gT = 0;
function gAsk(k, c) { if (!aiOn() || !navigator.onLine || G_ASKED.has(c + "\n" + k) || !aiWorth(k)) return; G_Q.add(k); clearTimeout(gT); gT = setTimeout(() => gFlush(c), 250); }
async function gFlush(c) {
  if (gBusy || !G_Q.size || c !== GUEST.c) return;
  gBusy = true; const batch = [...G_Q].slice(0, 50);
  batch.forEach((k) => { G_Q.delete(k); G_ASKED.add(c + "\n" + k); });
  try {
    const out = await LIVE.api.translate(batch, langEn(c)), w = aiWords(c);
    batch.forEach((k, i) => { const t = out[i]?.trim(); if (t && aiSlots(t) === aiSlots(k)) w[k] = t; });
    store.set("lang.ai." + c, w);
    if (GUEST.on && GUEST.c === c) gRender();
  } catch {}
  gBusy = false; if (G_Q.size) gT = setTimeout(() => gFlush(c), 300);
}
// Put the guest's words into everything marked data-g on the guest screen. The English is kept, so holding a line
// shows staff the English.
function gTree(root) {
  if (!GUEST.c) return;
  for (const el of root.querySelectorAll("[data-g]")) {
    const en = el.dataset.g, t = gLook(en);
    el.textContent = t || en;
    if (t) { el.setAttribute("lang", GUEST.c); el.classList.remove("g-wait"); for (const n of el.childNodes) if (n.nodeType === 3) trWas.set(n, en); }
    else el.classList.toggle("g-wait", aiOn());
  }
}
// English shown to the guest, put into their language as it lands.
const gT_ = (en, tag = "span", cls = "") => `<${tag} data-g="${esc(en)}"${cls ? ` class="${cls}"` : ""}>${esc(en)}</${tag}>`;

/* ---------- Voices and the microphone ----------
   The clearest voice the phone has for a language: Apple's Premium and Enhanced voices first, then Google's and
   Microsoft's natural ones, then the language's default; never the novelty voices (Bells, Bubbles…). A phone with no
   voice for a language shows the words only. iPhones speak only after a tap, so speech starts in the tap itself. */
const VOICE_NOVELTY = /albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley|junior|ralph|fred|kathy/i;
function voiceFor(tag) {
  if (!SAY_OK) return null;
  const vs = speechSynthesis.getVoices(), t = tag.toLowerCase().replace("_", "-"), base = t.split("-")[0];
  const fit = vs.filter((v) => v.lang.toLowerCase().replace("_", "-") === t).concat(vs.filter((v) => v.lang.toLowerCase().replace("_", "-").split("-")[0] === base && v.lang.toLowerCase().replace("_", "-") !== t));
  if (!fit.length) return null;
  const score = (v) => (VOICE_NOVELTY.test(v.name) ? -10 : 0) + (/premium/i.test(v.name) ? 6 : /enhanced|neural|natural/i.test(v.name) ? 5 : /siri/i.test(v.name) ? 4 : /google|microsoft/i.test(v.name) ? 3 : 0)
    + (v.lang.toLowerCase().replace("_", "-") === t ? 2 : 0) + (v.localService ? 1 : 0);
  return fit.sort((a, b) => score(b) - score(a))[0];
}
const canSay = (c) => !!voiceFor(langTag(c || "en-GB"));
// Say it in a language: normal is a touch slower than the phone's own, slow is for learning.
function sayIn(text, c, slow) {
  if (!SAY_OK) return toast("This phone can't read out loud");
  const tag = c ? langTag(c) : "en-GB", v = voiceFor(tag);
  if (!v && c) return toast(`This phone has no ${langEn(c)} voice. Show the words instead`);
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(c ? text : sayWords(text)); u.lang = v?.lang || tag; if (v) u.voice = v;
  u.rate = slow ? 0.6 : 0.88; u.pitch = 1;
  speechSynthesis.speak(u);
}
// iPhones only speak after a tap: a silent word in the tap lets the answer be spoken when it arrives.
function sayUnlock() { if (!SAY_OK) return; try { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; speechSynthesis.speak(u); } catch {} }
if (SAY_OK) speechSynthesis.getVoices();
// Apple's dictation (what Safari's microphone uses) doesn't hear these, so they type or tap instead.
const MIC_NO = new Set(["bn", "bg", "ta", "gu", "ur", "ne", "pa", "lt", "hy", "cy", "ga", "gd", "am", "ha", "ig", "yo", "zu", "xh", "so", "ps", "ku", "my", "km", "lo", "si", "mn", "tw", "mt", "ht", "be", "uz", "kk", "ka", "sq", "bs", "mk", "eu", "gl", "is", "lv", "et", "af", "sw", "fil", "te", "kn", "ml", "mr", "as", "brx", "doi", "ks", "gom", "mai", "mni", "or", "sa", "sat", "sd"]);
const REC = window.SpeechRecognition || window.webkitSpeechRecognition;
const canHear = (c) => !!REC && !MIC_NO.has((c || "en").split("-")[0]);
let gRec = null;
// Listen once in a language; what's heard so far shows as it comes, and Clear starts again.
function listenIn(c, onText, onState) {
  if (!REC) return onState("none");
  try { gRec?.abort(); } catch {}
  const r = new REC(); gRec = r;
  r.lang = c ? langTag(c) : "en-GB"; r.interimResults = true; r.maxAlternatives = 1; r.continuous = false;
  let got = "";
  r.onresult = (e) => { got = [...e.results].map((x) => x[0].transcript).join(" ").trim(); onText(got, e.results[e.results.length - 1].isFinal); };
  r.onerror = (e) => onState(e.error === "not-allowed" || e.error === "service-not-allowed" ? "blocked" : e.error === "no-speech" ? "quiet" : "error");
  r.onend = () => { if (gRec === r) gRec = null; onState(got ? "done" : "quiet", got); };
  try { r.start(); onState("on"); } catch { onState("error"); }
}
function listenStop() { try { gRec?.stop(); } catch {} }

/* ---------- The guest screen ---------- */
document.body.insertAdjacentHTML("beforeend", `<div id="guest" class="guest" hidden role="dialog" aria-modal="true" aria-label="Talk to a guest"><div class="g-in" id="g-in"></div></div>`);
const G_TOP = ["es", "fr", "it", "de", "pt-BR", "pt", "zh", "ar", "ja", "ko", "nl", "pl", "ru", "tr", "hi", "ro", "ga", "gd", "cy"];
// Opened from 🌍 in the top bar on every phone and iPad. Back within 20 minutes, it carries on with the same guest
// (their language, the talk so far); after that, or with New guest, it starts fresh.
const G_KEEP = 20 * 60 * 1000;
function gReset() { GUEST.c = ""; GUEST.step = "pick"; GUEST.msgs = []; GUEST.q = ""; GUEST.mq = ""; GUEST.al = new Set(); GUEST.open = null; GUEST.tab = "talk"; GUEST.sec = "start"; GUEST.menu = "drinks"; }
function guestOpen() {
  haptic(); sayStop?.();
  if (!GUEST.c || Date.now() - GUEST.at > G_KEEP) gReset(); else { GUEST.step = "main"; GUEST.tab = "talk"; }
  GUEST.on = true; document.body.classList.add("g-open");
  $("#guest").hidden = false; document.body.style.overflow = "hidden";
  history.pushState({ guest: 1 }, ""); gRender();
}
function guestClose() {
  listenStop(); if (SAY_OK) speechSynthesis.cancel();
  GUEST.on = false; GUEST.at = Date.now(); document.body.classList.remove("g-open"); $("#guest").hidden = true; document.body.style.overflow = "";
  if (history.state?.guest) history.back();
}
const gRecent = () => store.get("guest.recent", []);
// The back gesture doesn't take a guest into the staff app: only ✕ Staff does.
addEventListener("popstate", () => { if (GUEST.on) history.pushState({ guest: 1 }, ""); });
const gIcons = (c) => `${canSay(c) ? "🔊" : ""}${canHear(c) ? "🎤" : ""}`;
function gPickHtml() {
  const q = GUEST.q.trim().toLowerCase(), all = [...new Map([...LANGS.map(([c]) => [c, WORLD_OF.get(c) || [c, langEn(c), c]]), ...WORLD.map((x) => [x[0], x])]).values()];
  const hit = (c) => !q || [langOwn(c), langEn(c), c].some((x) => x.toLowerCase().includes(q));
  const row = ([c]) => `<button class="g-lang" data-g-lang="${c}" lang="${c}" translate="no"><b>${esc(langOwn(c))}</b><span>${esc(langEn(c))}</span><i aria-hidden="true">${gIcons(c)}</i></button>`;
  const top = [...new Set([...gRecent(), ...G_TOP])].filter((c) => WORLD_OF.has(c) && hit(c)), rest = all.filter(([c]) => !top.includes(c) && hit(c)).sort((a, b) => langEn(a[0]).localeCompare(langEn(b[0])));
  return `<div class="g-bar"><b translate="no">🌍 Your language?</b><button class="btn g-x" data-g-x>✕ Staff</button></div>
    <div class="search"><input id="g-q" type="search" placeholder="Search: Español, 中文, Polski…" value="${esc(GUEST.q)}" autocomplete="off" autocorrect="off" spellcheck="false" translate="no" aria-label="Search languages"></div>
    <div class="g-langs">${top.map((c) => row([c])).join("")}</div>
    ${rest.length ? `<div class="g-sec" translate="no">A to Z</div><div class="g-langs">${rest.map(row).join("")}</div>` : ""}
    <p class="note" translate="no">🔊 this phone can say it · 🎤 this phone can hear it. Without them, read and type.${aiOn() ? "" : " Only the languages with written-by-hand words work while live translation is off."}</p>`;
}
// The hello: a warm welcome in their language, then the line that says we'll use the app to talk. Staff can write
// their own second line (shown in the guest's language by hand where it's the usual one, live otherwise).
const G_WELCOME = "Hello, and welcome to Black Tap!", G_FOLLOW = "Here's our menu. Sorry, I don't speak your language well, but this app can help us talk.";
const gHelloEn = () => store.get("guest.hello", "") || G_FOLLOW;
const gHelloSay = () => [G_WELCOME, gHelloEn()].map((en) => gLook(en)).filter(Boolean).join(" ");
function gHelloHtml() {
  const hand = !!gHand(G_WELCOME);
  return `<div class="g-bar"><button class="btn" data-g-step="pick" translate="no">‹ ${esc(langOwn(GUEST.c))}</button><button class="btn g-x" data-g-x>✕ Staff</button></div>
    <div class="g-hello">${gT_(G_WELCOME, "h2", "g-wel")}${gT_(gHelloEn(), "p", "g-big")}
      ${canSay(GUEST.c) && hand ? `<button class="btn g-hear" data-g-hello-say aria-label="Hear it" translate="no">🔊</button>` : ""}
      <button class="btn pri wide" data-g-step="main" data-g-to="menu">${gT_("Use my language")}</button>
      <button class="btn wide" data-g-x>${gT_("English is fine")}</button></div>
    <details class="g-edit"><summary translate="no">Staff: write your own second line</summary>
      <textarea id="g-hello" rows="3" maxlength="200" translate="no">${esc(gHelloEn())}</textarea>
      <p class="note" translate="no">The usual line is written by hand in ${Object.keys(G_UI[G_FOLLOW]).length} languages. Your own line is translated live, so it needs live translation on.</p>
      <div class="actions"><button class="btn" data-g-hello="save" translate="no">Save</button><button class="btn" data-g-hello="reset" translate="no">Back to the usual</button></div></details>`;
}
const gTabBtn = (k, en, ico) => `<button data-g-tab="${k}" aria-pressed="${GUEST.tab === k}">${ico} ${gT_(en)}</button>`;
function gMainHtml() {
  return `<div class="g-bar"><button class="btn" data-g-step="pick" translate="no">🌍 ${esc(langOwn(GUEST.c))}</button><span class="g-bar-r"><button class="btn" data-g-new translate="no">New guest</button><button class="btn g-x" data-g-x>✕ Staff</button></span></div>
    <div class="seg g-tabs" role="group">${gTabBtn("talk", "Talk", "💬")}${gTabBtn("menu", "Menu", "🍸")}${gTabBtn("allergy", "Allergies", "⚠️")}</div>
    <div id="g-body">${GUEST.tab === "menu" ? gMenuHtml() : GUEST.tab === "allergy" ? gAllergyHtml() : gTalkHtml()}</div>`;
}
function gRender() {
  const box = $("#g-in"); if (!box || !GUEST.on) return;
  const keep = document.activeElement?.id, pos = $("#g-body")?.scrollTop;
  box.innerHTML = GUEST.step === "pick" ? gPickHtml() : GUEST.step === "hello" ? gHelloHtml() : gMainHtml();
  gTree(box);
  if (keep && $("#" + keep)) { const i = $("#" + keep); i.focus(); if (i.setSelectionRange && i.value) i.setSelectionRange(i.value.length, i.value.length); }
  if (pos) $("#g-body").scrollTop = pos;
  const log = $("#g-log"); if (log) log.scrollTop = log.scrollHeight;
}

/* ---------- Talk ---------- */
// A message: { who: "s" staff or "g" guest, en, t (in the guest's language), live (translated live), say (sound it out) }.
function gBubble(m, i) {
  const guestSide = m.who === "g", big = guestSide ? m.en : m.t, small = guestSide ? m.t : m.en;
  return `<div class="g-msg ${guestSide ? "gm-g" : "gm-s"}">
    <div class="g-who" translate="no">${guestSide ? "Guest" : esc(myName || "Staff")}</div>
    ${big != null ? `<p class="g-say" translate="no"${guestSide ? "" : ` lang="${GUEST.c}"`}>${gWords(big, guestSide ? "" : GUEST.c)}</p>` : `<p class="g-say g-wait" translate="no">…</p>`}
    ${small && small !== big ? `<p class="g-orig" translate="no"${guestSide ? ` lang="${GUEST.c}"` : ""}>${gWords(small, guestSide ? GUEST.c : "")}</p>` : ""}
    ${m.say && !guestSide ? `<p class="g-pron" translate="no">🗣 ${esc(m.say)}</p>` : ""}
    <div class="g-mb">${(guestSide ? canSay("") : canSay(GUEST.c)) && big ? `<button class="btn g-hear" data-g-hear="${i}" aria-label="Hear it" translate="no">🔊</button>` : ""}${m.live ? `<span class="g-live" translate="no">Translated live: check anything important</span>` : ""}</div></div>`;
}
// Tap any word in a message to see what that one word means in the other language (live translation, remembered).
const gWords = (t, c) => t.split(/(\s+)/).map((w) => (/\S/.test(w) ? `<span class="gw" data-gw="${esc(w)}" data-gw-l="${c}">${esc(w)}</span>` : w)).join("");
async function gGloss(el) {
  const w = el.dataset.gw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""), from = el.dataset.gwL, to = from ? "" : GUEST.c;
  if (!w) return;
  const k = "gw:" + (from || "en") + ">" + (to || "en") + ":" + w.toLowerCase(), memo = store.get("guest.words", {});
  const show = (t) => { const b = el.getBoundingClientRect(); enShow(`${w} = ${t}`, b.left + b.width / 2, b.top); $("#enpop b").textContent = to ? langOwn(to) : "English"; $("#enpop").dataset.en = to ? w : t; };
  if (memo[k]) return show(memo[k]);
  if (!aiOn()) return toast("Word meanings need live translation: Maintenance switches it on in More");
  try { const [t] = await LIVE.api.translate([w], to ? langEn(to) : "English", from ? langEn(from) : "English"); memo[k] = t; store.set("guest.words", memo); show(t); }
  catch { toast("Couldn't look that up. Check the signal"); }
}
// Staff phrase groups: pick a group, tap a phrase. Allergies opens the hand-written allergy card.
const gSecs = [["start", "Hello"], ["check", "Check-backs"], ["order", "Order"], ["bar", "Drinks"], ["food", "Food"], ["dessert", "Desserts"], ["coffee", "Coffee"], ["tea", "Tea"], ["allergy", "Allergies"], ["pay", "Pay"], ["bye", "Goodbye"]];
function gTalkHtml() {
  const st = TK.filter((r) => r[1] === "s"), gr = TK.filter((r) => r[1] === "g"), vt = (en) => en.replace("{lang}", langEn(GUEST.c));
  const sc = GUEST.sec || "start";
  const hand = (r) => !!gOf(r[4], GUEST.c);
  return `<div class="g-log" id="g-log">${GUEST.msgs.length ? GUEST.msgs.map(gBubble).join("") : `<p class="note" translate="no">Staff: tap a phrase, speak or type in English. Guest: tap a reply, speak or type in your language.</p>`}</div>
    <div class="g-side g-guest"><div class="g-lab">${gT_("You")}</div>
      <div class="g-chips">${gr.map((r) => `<button class="chip" data-g-reply="${r[0]}">${gT_(r[3])}</button>`).join("")}<button class="chip" data-g-tab="allergy">⚠️ ${gT_("I have an allergy")}</button></div>
      <div class="g-in-row">${canHear(GUEST.c) ? `<button class="btn" data-g-mic="g" aria-label="Speak" translate="no">🎤</button>` : ""}<input id="g-gin" type="text" enterkeyhint="send" autocomplete="off" lang="${GUEST.c}" translate="no"><button class="btn pri" data-g-send="g" translate="no">➤</button></div></div>
    <div class="g-side g-staff"><div class="g-lab" translate="no">Staff (English)</div>
      <div class="g-chips g-secs" role="group" translate="no">${gSecs.map(([k, t]) => `<button class="chip" data-g-sec="${k}" aria-pressed="${sc === k}">${t}</button>`).join("")}</div>
      <div class="g-chips g-wrap" translate="no">${st.filter((r) => r[2] === sc).map((r) => `<button class="chip${hand(r) ? "" : " g-livec"}" data-g-phrase="${r[0]}">${esc(vt(r[3]))}</button>`).join("")}${sc === "allergy" ? `<button class="chip" data-g-tab="allergy">⚠️ Open the allergy card</button>` : ""}</div>
      <div class="g-in-row">${REC ? `<button class="btn" data-g-mic="s" aria-label="Speak English" translate="no">🎤</button>` : ""}<input id="g-sin" type="text" placeholder="Type in English" enterkeyhint="send" autocomplete="off" translate="no"><button class="btn pri" data-g-send="s" translate="no">➤</button></div>
      ${aiOn() ? "" : `<p class="note" translate="no">Live translation is off, so typing and speaking freely only work in English. Ready phrases still work.</p>`}</div>
    <div id="g-heard" class="g-heard" hidden translate="no"></div>`;
}
// A ready phrase or reply: hand-written words where there are some, else live.
function gPhrase(id, who) {
  const r = TK.find((x) => x[0] === id && x[1] === who); if (!r) return;
  const en = r[3].replace("{lang}", langEn(GUEST.c)), h = gOf(r[4], GUEST.c);
  sayUnlock();
  const m = { who, en, t: h?.[0] ?? null, say: h?.[1] || "" };
  if (!h) { const t = gLook(r[3].includes("{lang}") ? en : r[3]); m.t = t; m.live = !!t || aiOn(); if (!t) gWait(m, en); }
  gAdd(m);
}
function gAdd(m) {
  GUEST.msgs.push(m); gRender();
  const i = GUEST.msgs.length - 1, txt = m.who === "g" ? m.en : m.t;
  if (txt) setTimeout(() => sayIn(txt, m.who === "g" ? "" : GUEST.c), 60);
}
// Free text, typed or said: translated live, then said out loud in the other language.
async function gFree(who, text) {
  text = text.trim(); if (!text) return;
  sayUnlock();
  const m = who === "s" ? { who, en: text, t: null, live: true } : { who, en: null, t: text, live: true };
  if (!aiOn()) { if (who === "s") { m.t = text; m.live = false; } else { m.en = text; m.live = false; } gAdd(m); return toast("Live translation is off: Maintenance switches it on in More"); }
  GUEST.msgs.push(m); gRender();
  try {
    const [out] = await LIVE.api.translate([text], who === "s" ? langEn(GUEST.c) : "English", who === "s" ? "English" : langEn(GUEST.c));
    if (who === "s") m.t = out; else m.en = out;
    gRender(); sayIn(out, who === "s" ? GUEST.c : "");
  } catch (e) { if (who === "s") m.t = text; else m.en = text; m.live = false; gRender(); toast(e.message || "Couldn't translate. Check the signal"); }
}
async function gWait(m, en) {
  if (!aiOn()) { m.t = en; m.live = false; return; }
  try { const [out] = await LIVE.api.translate([en], langEn(GUEST.c)); m.t = out; const w = aiWords(GUEST.c); w[aiKey(en)] = out; store.set("lang.ai." + GUEST.c, w); gRender(); sayIn(out, GUEST.c); }
  catch { m.t = en; m.live = false; gRender(); }
}
function gMic(who) {
  sayUnlock(); if (SAY_OK) speechSynthesis.cancel();
  const c = who === "g" ? GUEST.c : "", box = $("#g-heard"), input = $(who === "g" ? "#g-gin" : "#g-sin");
  box.dataset.who = who;
  const show = (t, state) => {
    box.hidden = false;
    box.innerHTML = `<p class="g-heard-t"${c ? ` lang="${c}"` : ""}>${t ? esc(t) : state === "on" ? (c ? "🎤 …" : "🎤 Listening…") : ""}</p>
      <div class="actions"><button class="btn" data-g-heard="clear">Clear</button><button class="btn" data-g-heard="stop">Stop</button></div>`;
  };
  listenIn(c, (t) => { input.value = t; show(t, "on"); }, (state, got) => {
    if (state === "on") return show("", "on");
    if (state === "done" && got) { box.hidden = true; input.value = ""; return gFree(who, got); }
    box.hidden = true;
    if (state === "blocked" || state === "none") { input.focus(); toast("The microphone isn't available here. Type instead, or use the keyboard's own microphone"); }
    else if (state === "quiet") toast("Didn't catch that. Try again");
  });
}

/* ---------- Menu: every drink, beer, wine and cake ---------- */
const G_MORE = [["beer", "Beer and cider"], ["wine", "Wine"], ["mixers", "Soft drinks"], ["cakes", "Cakes"]];
const gAl = (d) => (d.allergens && d.allergens !== "None" ? d.allergens.split(/,\s*(?![^()]*\))/).map((x) => x.trim()).filter(Boolean) : []);
const alKey = (part) => AL_FIND.find(([re]) => re.test(part))?.[1];
const AL_ICON = { gluten: "🌾", milk: "🥛", egg: "🥚", nuts: "🌰", peanuts: "🥜", sesame: "⚪", soya: "🫘", sulphites: "🍷", celery: "🥬", mustard: "🟡", fish: "🐟", crustaceans: "🦐", molluscs: "🦪", lupin: "🌼", oats: "🌾", almond: "🌰", hazelnut: "🌰" };
// An allergen in the guest's language, from the hand-written list only, with the English after it.
function alWord(k, c = GUEST.c) { const a = gOf(AL, c); return a ? a[0][AL_KEYS.indexOf(k)] : null; }
const alLine = (c, i) => gOf(AL, c)?.[1][i];
function gAlHtml(d) {
  const parts = gAl(d), c = GUEST.c;
  if (!parts.length) return `<p class="g-al0">${alLine(c, 6) ? `<span lang="${c}" translate="no">${esc(alLine(c, 6))}</span><br>` : ""}<span translate="no">No allergens listed. Always tell us about any allergy.</span></p>`;
  return `<p class="g-al"><b translate="no">⚠️ ${alLine(c, 5) ? `<span lang="${c}">${esc(alLine(c, 5))}</span> · ` : ""}Contains:</b> ${parts.map((p) => { const k = alKey(p), w = k && alWord(k);
    return `<span class="g-alw" translate="no">${k ? AL_ICON[k] + " " : ""}${w ? `<b lang="${c}">${esc(w)}</b> ` : ""}<i>${esc(p)}</i></span>`; }).join("")}</p>`;
}
function gMenuHtml() {
  const q = GUEST.mq.trim().toLowerCase(), hit = (s) => !q || s.toLowerCase().includes(q);
  if (GUEST.open != null) return gDrinkHtml(D[GUEST.open]);
  const sw = `<div class="seg g-menu-sw" role="group"><button data-g-menu="drinks" aria-pressed="${GUEST.menu !== "food"}">🍸 ${gT_("Drinks")}</button><button data-g-menu="food" aria-pressed="${GUEST.menu === "food"}">🍔 ${gT_("Food")}</button></div>`;
  if (GUEST.menu === "food") return sw + gFoodHtml(hit);
  const secs = SECTIONS.map((s) => [s, D.filter((d) => d.section === s && !outNow().has(d.name) && (hit(d.name) || hit(blurb(d))))]).filter(([, xs]) => xs.length);
  const more = G_MORE.map(([k, en]) => [en, pkPool().filter((x) => x.c === k && !outNow().has(x.n) && hit(x.n))]).filter(([, xs]) => xs.length);
  return `${sw}<div class="search"><input id="g-mq" type="search" placeholder="🔍" value="${esc(GUEST.mq)}" autocomplete="off" spellcheck="false" translate="no" aria-label="Search"></div>
    ${secs.map(([s, xs]) => `<div class="g-sec">${gT_(s)}</div>${xs.map((d) => `<button class="g-drink" data-g-drink="${d.id}"><span class="g-gl" aria-hidden="true">${glass(d)}</span><span><b translate="no">${esc(d.name)}</b>${gT_(blurb(d).replace(/^[^·]*·\s*/, ""), "small")}</span></button>`).join("")}`).join("")}
    ${more.map(([en, xs]) => `<div class="g-sec">${gT_(en)}</div><div class="g-names" translate="no">${xs.map((x) => `<button class="chip" data-g-want="${esc(x.n)}">${esc(x.n)}</button>`).join("")}</div>`).join("")}
    <p class="note">${gT_("Ask us about anything you don't see. Some things sell out on the night.")}</p>`;
}
// The food menu (food.js): names stay as on the printed menu, what's in them in the guest's language. No allergen
// claims here: the allergy card and a manager with the kitchen's chart answer those.
function gFoodHtml(hit) {
  const secs = FOOD.map(([s, xs]) => [s, xs.filter(([n, w]) => hit(n) || hit(w))]).filter(([, xs]) => xs.length);
  return `<div class="search"><input id="g-mq" type="search" placeholder="🔍" value="${esc(GUEST.mq)}" autocomplete="off" spellcheck="false" translate="no" aria-label="Search"></div>
    <p class="g-alnote"><button class="chip" data-g-tab="allergy">⚠️ ${gT_("I have an allergy")}</button></p>
    ${secs.map(([s, xs]) => `<div class="g-sec">${G_UI[s] ? gT_(s) : `<span translate="no">${esc(s)}</span>`}</div>${xs.map(([n, w]) => `<div class="g-food"><b translate="no">${esc(n)}</b>${w ? gT_(w, "small") : ""}<button class="btn g-want" data-g-want="${esc(n)}" aria-label="I'd like this one" translate="no">＋</button></div>`).join("")}`).join("")}
    ${gT_(FOOD_NOTE, "p", "note")}
    <p class="note">${gT_("Ask us about anything you don't see. Some things sell out on the night.")}</p>`;
}
function gDrinkHtml(d) {
  return `<button class="btn" data-g-drink="" translate="no">‹</button>
    <div class="card g-card"><span class="g" aria-hidden="true">${glass(d)}</span><h2 translate="no">${esc(d.name)}</h2>
      ${gT_(d.desc || blurb(d), "p", "g-desc")}${gAlHtml(d)}
      <button class="btn pri wide" data-g-want="${esc(d.name)}">${gT_("I'd like this one")}</button></div>`;
}

/* ---------- Allergy card: written by hand, never translated live ---------- */
function gAllergyHtml() {
  const c = GUEST.c, hand = !!gOf(AL, c), L = (i, en) => (hand ? `<span lang="${c}" translate="no">${esc(alLine(c, i))}</span><small translate="no">${esc(en)}</small>` : `<span translate="no">${esc(en)}</span>`);
  return `<div class="g-alcard"><h3>${L(0, "Do you have any food allergies?")}</h3><p>${L(1, "Tap any you are allergic to:")}</p>
    <div class="g-algrid">${AL_KEYS.map((k) => `<button class="g-alk" data-g-al="${k}" aria-pressed="${GUEST.al.has(k)}" translate="no"><i aria-hidden="true">${AL_ICON[k]}</i>${hand ? `<b lang="${c}">${esc(alWord(k))}</b><small>${esc(AL_EN[k])}</small>` : `<b>${esc(AL_EN[k])}</b>`}</button>`).join("")}</div>
    <div class="g-in-row"><input id="g-alo" type="text" lang="${c}" translate="no" placeholder="${esc(hand ? alLine(c, 3) : "Other allergy: please type it")}"></div>
    <button class="btn pri wide" data-g-al-send translate="no">✓ ${hand ? `<span lang="${c}">OK</span>` : "OK"}</button>
    <button class="btn wide" data-g-al-none>${L(2, "I have no allergies")}</button>
    ${hand ? "" : `<p class="note" translate="no">Allergen names are shown in English with a picture: they are never machine translated.</p>`}</div>`;
}
function gAllergySend(none) {
  sayUnlock();
  const ks = [...GUEST.al], other = $("#g-alo")?.value.trim() || "", c = GUEST.c;
  const en = none ? "I have no allergies." : `Allergies: ${ks.map((k) => AL_EN[k]).join(", ") || "none ticked"}${other ? `. Other: "${other}"` : ""}`;
  const t = none ? alLine(c, 2) || null : ks.map((k) => alWord(k) || AL_EN[k]).join(", ") + (other ? ` · ${other}` : "");
  GUEST.msgs.push({ who: "g", en, t });
  if (!none) GUEST.msgs.push({ who: "s", en: "I'll check with the manager and the allergen chart.", t: alLine(c, 4) || null });
  if (other && aiOn()) gFree("g", other);
  GUEST.al = new Set(); GUEST.tab = "talk"; gRender();
  if (!none) { const m = GUEST.msgs[GUEST.msgs.length - 1]; if (m.t) sayIn(m.t, c); }
}

/* ---------- Taps ---------- */
document.addEventListener("click", (e) => {
  if (!GUEST.on && e.target.closest("[data-guest-open]")) return guestOpen();
  if (!GUEST.on) return;
  const b = (s) => e.target.closest(s); let x;
  if (b("[data-g-x]")) { haptic(); return guestClose(); }
  if ((x = b("[data-g-lang]"))) {
    haptic(); sayUnlock(); const c = x.dataset.gLang; GUEST.c = c; GUEST.step = "hello"; GUEST.msgs = [];
    store.set("guest.recent", [c, ...gRecent().filter((y) => y !== c)].slice(0, 6));
    gLoad(c).then(gRender); gRender(); const h = gHelloSay(); if (h && gHand(G_WELCOME)) sayIn(h, c); return;
  }
  if (b("[data-g-hello-say]")) return sayIn(gHelloSay(), GUEST.c);
  if (b("[data-g-new]")) { haptic(); gReset(); return gRender(); }
  if ((x = b("[data-g-menu]"))) { haptic(); GUEST.menu = x.dataset.gMenu; GUEST.mq = ""; return gRender(); }
  if ((x = b(".gw"))) return gGloss(x);
  if ((x = b("[data-g-step]"))) { haptic(); GUEST.step = x.dataset.gStep; if (x.dataset.gTo) GUEST.tab = x.dataset.gTo; GUEST.open = null; return gRender(); }
  if ((x = b("[data-g-tab]"))) { haptic(); GUEST.tab = x.dataset.gTab; GUEST.open = null; return gRender(); }
  if ((x = b("[data-g-sec]"))) { GUEST.sec = x.dataset.gSec; return gRender(); }
  if ((x = b("[data-g-phrase]"))) { haptic(); return gPhrase(x.dataset.gPhrase, "s"); }
  if ((x = b("[data-g-reply]"))) { haptic(); return gPhrase(x.dataset.gReply, "g"); }
  if ((x = b("[data-g-send]"))) { const i = $(x.dataset.gSend === "g" ? "#g-gin" : "#g-sin"), v = i.value; i.value = ""; return gFree(x.dataset.gSend, v); }
  if ((x = b("[data-g-mic]"))) return gMic(x.dataset.gMic);
  if ((x = b("[data-g-heard]"))) { if (x.dataset.gHeard === "clear") { try { gRec?.abort(); } catch {} gRec = null; $("#g-sin").value = ""; $("#g-gin").value = ""; return gMic($("#g-heard").dataset.who || "s"); } listenStop(); return; }
  if ((x = b("[data-g-hear]"))) { const m = GUEST.msgs[+x.dataset.gHear]; return sayIn(m.who === "g" ? m.en : m.t, m.who === "g" ? "" : GUEST.c); }
  if ((x = b("[data-g-drink]"))) { haptic(); GUEST.open = x.dataset.gDrink === "" ? null : +x.dataset.gDrink; gRender(); $("#g-body").scrollTop = 0; return; }
  if ((x = b("[data-g-want]"))) { haptic(); GUEST.tab = "talk"; GUEST.open = null; return gAdd({ who: "g", en: `I'd like: ${x.dataset.gWant}`, t: `${gLook("I'd like this one") || "I'd like this one"}: ${x.dataset.gWant}` }); }
  if ((x = b("[data-g-al]"))) { haptic(); const k = x.dataset.gAl; GUEST.al.has(k) ? GUEST.al.delete(k) : GUEST.al.add(k); x.setAttribute("aria-pressed", GUEST.al.has(k)); return; }
  if (b("[data-g-al-send]")) return gAllergySend(false);
  if (b("[data-g-al-none]")) return gAllergySend(true);
  if ((x = b("[data-g-hello]"))) { store.set("guest.hello", x.dataset.gHello === "save" ? $("#g-hello").value.trim().slice(0, 200) : ""); toast("Saved"); return gRender(); }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "g-q") { GUEST.q = e.target.value; gRender(); }
  if (e.target.id === "g-mq") { GUEST.mq = e.target.value; gRender(); }
});
document.addEventListener("keydown", (e) => { if (e.key === "Enter" && GUEST.on && (e.target.id === "g-gin" || e.target.id === "g-sin")) { e.preventDefault(); const v = e.target.value; e.target.value = ""; gFree(e.target.id === "g-gin" ? "g" : "s", v); } });

document.head.insertAdjacentHTML("beforeend", `<style>
.guest{position:fixed;inset:0;z-index:72;background:var(--bg);overflow:hidden}.g-open #help{z-index:74}
.g-in{max-width:760px;margin:0 auto;height:100%;display:flex;flex-direction:column;padding:calc(env(safe-area-inset-top,0px) + 8px) max(16px,env(safe-area-inset-right,0px)) calc(env(safe-area-inset-bottom,0px) + 8px) max(16px,env(safe-area-inset-left,0px));overflow-y:auto;overscroll-behavior:contain}
.g-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}.g-bar b{font-size:20px}.g-x{flex:none}
.g-langs{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-top:10px}
.g-lang{display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--surface);text-align:start;min-height:64px;position:relative}
.g-lang b{font-size:18px}.g-lang span{font-size:13px;color:var(--muted)}.g-lang i{position:absolute;inset-inline-end:8px;top:8px;font-style:normal;font-size:12px}
.g-sec{font-family:var(--display);font-size:20px;color:var(--brass);text-transform:uppercase;margin:18px 0 6px}
.g-hello{margin:auto 0;padding:10px 0}.g-big{font-size:26px;line-height:1.3;margin:0 0 10px}
.g-edit{margin-top:16px}.g-edit textarea{width:100%;font:inherit;color:var(--fg);background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:10px}
.guest .seg.g-tabs{display:grid;grid-template-columns:repeat(3,1fr);margin-bottom:8px}.guest .seg.g-menu-sw{display:grid;grid-template-columns:1fr 1fr;margin:4px 0 8px}
.guest .g-chips.g-secs{margin:4px 0 0;padding:4px 0}.guest .g-secs .chip{font-size:13px;padding:6px 10px}.guest .g-secs .chip[aria-pressed="true"]{border-color:var(--brass);background:color-mix(in srgb,var(--brass) 22%,var(--surface));font-weight:700}
.guest .g-chips.g-wrap{flex-wrap:wrap;overflow:visible}.guest .g-wrap .chip{white-space:normal;text-align:start}.g-livec{border-style:dashed}
.g-bar-r{display:flex;gap:6px}.g-wel{font-family:var(--display);font-size:30px;line-height:1.15;margin:0 0 10px;color:var(--brass)}
.gw{cursor:pointer;border-radius:4px}.gw:active{background:color-mix(in srgb,var(--brass) 30%,transparent)}
.g-food{display:grid;grid-template-columns:1fr auto;gap:2px 10px;align-items:center;padding:10px 0;border-bottom:1px solid var(--line)}.g-food b{font-size:17px}.g-food small{grid-column:1;color:var(--muted);font-size:14px}.g-food .g-want{grid-row:1/span 2;grid-column:2;padding:6px 12px}
.g-alnote{margin:4px 0}
#g-body{flex:1;overflow-y:auto;display:flex;flex-direction:column;min-height:0}
.g-log{flex:1;min-height:120px;overflow-y:auto;padding:4px 0}
.g-msg{max-width:88%;margin:8px 0;padding:10px 12px;border-radius:14px;border:1px solid var(--line);background:var(--surface)}
.gm-g{margin-inline-end:auto;border-color:var(--brass)}.gm-s{margin-inline-start:auto}
.g-who{font-size:12px;color:var(--muted);font-weight:700}.g-say{font-size:22px;line-height:1.3;margin:2px 0}.g-orig{font-size:14px;color:var(--muted);margin:2px 0}
.g-pron{font-size:14px;margin:4px 0 0;color:var(--brass)}.g-mb{display:flex;gap:8px;align-items:center;margin-top:4px}.g-hear{padding:6px 10px}.g-live{font-size:12px;color:var(--muted)}
.g-side{flex:none;border-top:1px solid var(--line);padding-top:8px;margin-top:6px}.g-lab{font-size:13px;font-weight:700;color:var(--muted)}
.g-chips{display:flex;gap:6px;overflow-x:auto;padding:6px 0;-webkit-overflow-scrolling:touch}.g-chips .chip{white-space:nowrap}
.g-in-row{display:flex;gap:6px;margin-top:4px}.g-in-row input{flex:1;min-width:0;font:inherit;font-size:17px;color:var(--fg);background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:10px 12px}
.g-heard{position:fixed;left:16px;right:16px;bottom:calc(env(safe-area-inset-bottom,0px) + 90px);z-index:73;background:var(--bg);border:2px solid var(--brass);border-radius:14px;padding:12px;max-width:600px;margin:0 auto}.g-heard-t{font-size:22px;margin:0 0 6px}
.g-drink{display:flex;gap:12px;align-items:center;width:100%;text-align:start;padding:10px 0;border-bottom:1px solid var(--line)}.g-drink b{display:block;font-size:17px}.g-drink small{display:block;color:var(--muted);font-size:14px}
.g-gl{flex:none;width:40px;height:46px}.g-gl svg{width:100%;height:100%}.g-names{display:flex;flex-wrap:wrap;gap:6px}
.g-card{text-align:start}.g-card .g{margin:0 auto}.g-card h2{text-align:center}.g-desc{font-size:18px;line-height:1.4}
.g-al,.g-al0{margin-top:12px;font-size:15px}.g-alw{display:inline-block;margin:4px 8px 0 0;padding:4px 8px;border:1px solid var(--warn,#c44);border-radius:8px}.g-alw i{font-style:normal;color:var(--muted);font-size:13px}
.g-alcard h3{font-size:22px;margin:4px 0}.g-alcard h3 small,.g-alcard p small{display:block;font-size:13px;color:var(--muted);font-weight:400}
.g-algrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;margin:10px 0}
.g-alk{display:flex;flex-direction:column;align-items:center;gap:2px;padding:10px;border:1px solid var(--line);border-radius:12px;background:var(--surface)}
.g-alk i{font-style:normal;font-size:24px}.g-alk b{font-size:16px}.g-alk small{font-size:12px;color:var(--muted)}
.g-alk[aria-pressed="true"]{border:2px solid var(--brass);background:color-mix(in srgb,var(--brass) 18%,var(--surface))}
.g-wait{opacity:.75}
.enpop{position:fixed;z-index:90;max-width:min(80vw,420px);background:var(--fg);color:var(--bg);padding:8px 12px;border-radius:10px;font-size:15px;line-height:1.35;box-shadow:0 6px 20px rgba(0,0,0,.35)}
.enpop-b{display:flex;gap:6px;margin-top:6px}.enpop-b button{font-size:13px;font-weight:700;padding:4px 8px;border-radius:8px;border:1px solid currentColor;color:inherit}
html.bi [data-bi]::after{content:attr(data-bi);display:block;font-size:.78em;font-weight:400;opacity:.72;font-family:var(--body);text-transform:none;letter-spacing:0;direction:ltr;unicode-bidi:isolate}
.enpop b{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.06em;opacity:.7}
.langask{z-index:75}.lchips{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;margin:10px 0}
.lchip{display:flex;flex-direction:column;align-items:flex-start;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--surface);text-align:start;min-height:56px}
.lchip b{font-size:17px}.lchip span{font-size:12px;color:var(--muted)}.lchip[aria-pressed="true"]{border:2px solid var(--brass)}
</style>`);
