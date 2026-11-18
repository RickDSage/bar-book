/* ---------- Every language (lang.js) ----------
   The app's own dictionary (src/i18n.json) has 22 languages built in: they work offline from the first tap. On top:
   - Each person's language, asked the first time they pick their name and kept for them, so the shared iPad switches
     language when someone else picks their name. The EN button at the top flips to English and back without changing it.
   - Hold any words (or select them) to see them in English.
   - Live translation (free Google Gemini, off until Maintenance switches it on, see live-src.js): any line the
     dictionary hasn't got, in a built-in language or any other language in the world. Each line is translated once and
     kept on the phone, so it works offline after.
   Drink names, specs and allergens are never sent: names stay as they are, and allergens are only ever shown from the
   hand-written list in talkdata.js. */

// Languages in the world list: [code, English name, speech tag]. Their own names come from the phone (Intl.DisplayNames).
const WORLD = [["af", "Afrikaans", "af-ZA"], ["as", "Assamese", "as-IN"], ["brx", "Bodo", "brx-IN"], ["doi", "Dogri", "doi-IN"], ["sq", "Albanian", "sq-AL"], ["am", "Amharic", "am-ET"], ["ar", "Arabic", "ar-SA"], ["hy", "Armenian", "hy-AM"],
  ["az", "Azerbaijani", "az-AZ"], ["eu", "Basque", "eu-ES"], ["be", "Belarusian", "be-BY"], ["bn", "Bengali", "bn-IN"], ["bs", "Bosnian", "bs-BA"],
  ["bg", "Bulgarian", "bg-BG"], ["my", "Burmese", "my-MM"], ["yue", "Cantonese", "zh-HK"], ["ca", "Catalan", "ca-ES"], ["zh", "Chinese (Mandarin)", "zh-CN"],
  ["zh-TW", "Chinese (Taiwan)", "zh-TW"], ["hr", "Croatian", "hr-HR"], ["cs", "Czech", "cs-CZ"], ["da", "Danish", "da-DK"], ["nl", "Dutch", "nl-NL"],
  ["et", "Estonian", "et-EE"], ["fil", "Filipino", "fil-PH"], ["fi", "Finnish", "fi-FI"], ["fr", "French", "fr-FR"], ["gl", "Galician", "gl-ES"],
  ["ka", "Georgian", "ka-GE"], ["de", "German", "de-DE"], ["el", "Greek", "el-GR"], ["gu", "Gujarati", "gu-IN"], ["ht", "Haitian Creole", "ht-HT"],
  ["ha", "Hausa", "ha-NG"], ["he", "Hebrew", "he-IL"], ["hi", "Hindi", "hi-IN"], ["hu", "Hungarian", "hu-HU"], ["is", "Icelandic", "is-IS"],
  ["ig", "Igbo", "ig-NG"], ["id", "Indonesian", "id-ID"], ["ga", "Irish", "ga-IE"], ["it", "Italian", "it-IT"], ["ja", "Japanese", "ja-JP"],
  ["kn", "Kannada", "kn-IN"], ["ks", "Kashmiri", "ks-IN"], ["gom", "Konkani", "gom-IN"], ["kk", "Kazakh", "kk-KZ"], ["km", "Khmer", "km-KH"], ["ko", "Korean", "ko-KR"], ["ku", "Kurdish", "ku-TR"],
  ["lo", "Lao", "lo-LA"], ["lv", "Latvian", "lv-LV"], ["lt", "Lithuanian", "lt-LT"], ["mk", "Macedonian", "mk-MK"], ["ms", "Malay", "ms-MY"],
  ["mai", "Maithili", "mai-IN"], ["ml", "Malayalam", "ml-IN"], ["mni", "Manipuri (Meitei)", "mni-IN"], ["mt", "Maltese", "mt-MT"], ["mr", "Marathi", "mr-IN"], ["mn", "Mongolian", "mn-MN"], ["ne", "Nepali", "ne-NP"], ["or", "Odia", "or-IN"],
  ["no", "Norwegian", "nb-NO"], ["ps", "Pashto", "ps-AF"], ["fa", "Persian (Farsi)", "fa-IR"], ["pl", "Polish", "pl-PL"], ["pt", "Portuguese", "pt-PT"],
  ["pt-BR", "Portuguese (Brazil)", "pt-BR"], ["pa", "Punjabi", "pa-IN"], ["ro", "Romanian", "ro-RO"], ["ru", "Russian", "ru-RU"], ["sa", "Sanskrit", "sa-IN"], ["sat", "Santali", "sat-IN"], ["gd", "Scottish Gaelic", "gd-GB"],
  ["sr", "Serbian", "sr-RS"], ["sd", "Sindhi", "sd-IN"], ["si", "Sinhala", "si-LK"], ["sk", "Slovak", "sk-SK"], ["sl", "Slovenian", "sl-SI"], ["so", "Somali", "so-SO"],
  ["es", "Spanish", "es-ES"], ["es-MX", "Spanish (Latin America)", "es-MX"], ["sw", "Swahili", "sw-KE"], ["sv", "Swedish", "sv-SE"], ["ta", "Tamil", "ta-IN"],
  ["te", "Telugu", "te-IN"], ["th", "Thai", "th-TH"], ["tr", "Turkish", "tr-TR"], ["tw", "Twi", "ak-GH"], ["uk", "Ukrainian", "uk-UA"], ["ur", "Urdu", "ur-PK"],
  ["uz", "Uzbek", "uz-UZ"], ["vi", "Vietnamese", "vi-VN"], ["cy", "Welsh", "cy-GB"], ["xh", "Xhosa", "xh-ZA"], ["yo", "Yoruba", "yo-NG"], ["zu", "Zulu", "zu-ZA"]];
const WORLD_OF = new Map(WORLD.map((x) => [x[0], x]));
const LANG_BUILT = new Set(LANGS.map(([c]) => c));
// A language's name in its own words, from the phone, or the English name where the phone doesn't know it.
function langOwn(c) {
  const b = LANGS.find(([x]) => x === c); if (b) return b[1];
  if (c === "tw") return "Twi";
  try { const n = new Intl.DisplayNames([c], { type: "language" }).of(c); if (n && n.toLowerCase() !== c.toLowerCase()) return n[0].toLocaleUpperCase(c) + n.slice(1); } catch {}
  return WORLD_OF.get(c)?.[1] || c;
}
const langEn = (c) => (c ? LANGS.find(([x]) => x === c)?.[2] || WORLD_OF.get(c)?.[1] || c : "English");
const langTag = (c) => WORLD_OF.get(c)?.[2] || c;
const langLabel = (c) => (c ? `${langOwn(c)}${langOwn(c) === langEn(c) ? "" : ` (${langEn(c)})`}` : "English");

/* ---------- Live translation, kept on the phone ---------- */
const AI_TR = { c: null, w: {} };
function aiWords(c) { if (AI_TR.c !== c) { AI_TR.c = c; AI_TR.w = store.get("lang.ai." + c, {}); } return AI_TR.w; }
// Live translation is on once Maintenance has saved the key and this phone has seen it (kept, so it works logged out).
const aiOn = () => !!LIVE.api?.aiOn?.();
function aiKick() { const k = LIVE.aiKey || store.get("ai.key", ""); if (k && LIVE.api?.aiStart) LIVE.api.aiStart(k); }
// The words translated live join the dictionary's (the dictionary wins where both have one).
function aiMerge() {
  if (!lang) return;
  for (const [en, x] of Object.entries(aiWords(lang))) { if (TR.has(en)) continue; if (/\{[a-d]\}/.test(en)) TR_PAT.push(trPat(en, x)); else TR.set(en, x); }
}
// Never sent: drink, item and people's names (they stay as they are), and anything with no words in it.
let AI_NAMES = null;
function aiNames() {
  if (AI_NAMES) return AI_NAMES;
  AI_NAMES = new Set([...D.map((d) => d.name), ...(typeof pkPool === "function" ? pkPool().map((x) => x.n) : []), ...Object.values(STAFF).flat(), ...(LIVE.staff || []).map((x) => x.name)].map((x) => String(x).toLowerCase()));
  return AI_NAMES;
}
const aiBare = (k) => k.replace(/^[‹›<>•·\s\u{1F300}-\u{1FAFF}☀-➿]+|[‹›<>•·\s]+$/gu, "").toLowerCase();
const aiWorth = (k) => k.length >= 2 && k.length <= 1500 && /\p{L}{2}/u.test(k) && !aiNames().has(aiBare(k));
// Numbers go as {1}, {2}, the way the dictionary keeps them, so "3 of 12 done" and "4 of 12 done" are one line.
const aiKey = (k) => { let i = 0; return k.replace(TR_NUM, () => `{${++i}}`); };
const AI_Q = new Set(), AI_ASKED = new Set();
let aiBusy = false, aiT = 0, aiFails = 0;
function aiAsk(k) {
  if (!lang || !aiOn() || !navigator.onLine || aiFails >= 3 || !aiWorth(k)) return;
  const key = aiKey(k); if (AI_ASKED.has(lang + "\n" + key) || TR.has(key)) return;
  AI_Q.add(key); clearTimeout(aiT); aiT = setTimeout(aiFlush, 350);
}
const aiSlots = (s) => (s.match(/\{(?:\d|[a-d])\}/g) || []).sort().join();
async function aiFlush() {
  if (aiBusy || !AI_Q.size || !lang || !aiOn()) return;
  aiBusy = true;
  const c = lang, batch = []; let n = 0;
  for (const k of AI_Q) { if (batch.length && (batch.length >= 50 || n + k.length > 5000)) break; batch.push(k); n += k.length; }
  for (const k of batch) { AI_Q.delete(k); AI_ASKED.add(c + "\n" + k); }
  try {
    const out = await LIVE.api.translate(batch, langEn(c));
    const w = aiWords(c);
    batch.forEach((k, i) => { const t = out[i]?.trim(); if (t && aiSlots(t) === aiSlots(k)) w[k] = t; });
    store.set("lang.ai." + c, w); aiFails = 0;
    if (lang === c) { trBuild(); trObs.disconnect(); trTree(document.body); trWatch(); aiProgress(); }
  } catch { aiFails++; }
  aiBusy = false;
  if (AI_Q.size) aiT = setTimeout(aiFlush, aiFails ? 4000 : 150);
}
// A language with no built-in words is put together live: every line of the app's dictionary, in the background.
let aiAll = 0;
async function aiWarm(c) {
  try {
    const keys = await (await fetch(`lang/_keys.json?v=${I18N.v}`)).json(), w = aiWords(c);
    const todo = keys.filter((k) => !w[k] && !AI_ASKED.has(c + "\n" + k));
    if (!todo.length) return;
    aiAll = todo.length; todo.forEach((k) => AI_Q.add(k)); aiFlush();
  } catch {}
}
function aiProgress() {
  if (!aiAll) return;
  const left = AI_Q.size; if (!left) { aiAll = 0; return toast(`Bar Book is now in ${langOwn(lang)}`); }
  if (!$("#toast").hidden) return;
  toast(`Translating into ${langOwn(lang)}: ${Math.round(100 - (left / aiAll) * 100)}%`);
}
addEventListener("online", () => setTimeout(aiFlush, 500));

/* ---------- Hold or select to see it in English ----------
   On a phone in another language, hold a finger on any words for half a second (or select them) and the English shows
   in a bubble. With a mouse, resting on words does the same. */
let enLastNow = "";
function enOf(nodes) {
  const now = nodes.map((n) => n.textContent).join(" ").replace(/\s+/g, " ").trim(), en = nodes.map((n) => trWas.get(n) ?? n.textContent).join(" ").replace(/\s+/g, " ").trim();
  enLastNow = now;
  return en && en !== now ? en : "";
}
function enAt(el) {
  for (let e = el; e && e !== document.body; e = e.parentElement) {
    if (e.closest("#enpop,[translate=no],[data-ut],input,textarea,select")) return "";
    const txt = e.textContent.trim();
    if (!txt) { const a = e.getAttribute?.("data-en-aria-label"); if (a) return a; continue; }
    if (txt.length > 600) return "";
    const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT), ns = []; for (let n; (n = w.nextNode());) ns.push(n);
    const en = enOf(ns); if (en) return en;
    if (/^(BUTTON|A|LI|P|H[1-6]|LABEL|SUMMARY|TD|TH)$/.test(e.tagName)) return "";
  }
  return "";
}
document.body.insertAdjacentHTML("beforeend", `<div id="enpop" class="enpop" role="status" hidden translate="no"><b>English</b><span></span><div class="enpop-b"><button data-en-say="en">🔊 English</button><button data-en-say="tr"></button></div></div>`);
let enT = 0, enHeld = false, enXY = null, enHide = 0, enNow = "";
function enShow(t, x, y, now = "") {
  const p = $("#enpop"); p.querySelector("b").textContent = "English"; p.querySelector("span").textContent = t; p.hidden = false; p.dataset.en = t; enNow = now;
  const b = p.querySelector('[data-en-say="tr"]'); b.hidden = !now || !lang; b.textContent = `🔊 ${langOwn(lang || "en")}`;
  const r = p.getBoundingClientRect(), W = innerWidth;
  p.style.left = `${Math.max(8, Math.min(W - r.width - 8, x - r.width / 2))}px`;
  p.style.top = `${y - r.height - 18 < 8 ? y + 26 : y - r.height - 18}px`;
  clearTimeout(enHide); enHide = setTimeout(enClose, 8000);
}
function enClose() { $("#enpop").hidden = true; }
document.addEventListener("pointerdown", (e) => {
  if (e.target.closest("#enpop")) return;
  clearTimeout(enT); enClose(); enHeld = false;
  if (!lang || e.button > 0) return;
  enXY = [e.clientX, e.clientY]; const t = e.target;
  enT = setTimeout(() => { const en = enAt(t); if (en) { enHeld = true; enShow(en, enXY[0], enXY[1], enLastNow); haptic(); } }, 500);
}, { passive: true });
document.addEventListener("pointermove", (e) => { if (enXY && Math.hypot(e.clientX - enXY[0], e.clientY - enXY[1]) > 12) clearTimeout(enT); }, { passive: true });
for (const ev of ["pointerup", "pointercancel"]) document.addEventListener(ev, () => clearTimeout(enT), { passive: true });
// A hold that showed the English doesn't also press the button under it.
document.addEventListener("click", (e) => { if (enHeld) { enHeld = false; e.preventDefault(); e.stopPropagation(); } }, true);
document.addEventListener("contextmenu", (e) => { if (enHeld) e.preventDefault(); });
let enSelT = 0;
document.addEventListener("selectionchange", () => {
  clearTimeout(enSelT);
  enSelT = setTimeout(() => {
    const s = getSelection(); if (!lang || !s || s.isCollapsed || !s.rangeCount) return;
    const r = s.getRangeAt(0), root = r.commonAncestorContainer.nodeType === 3 ? r.commonAncestorContainer.parentElement : r.commonAncestorContainer;
    if (root.closest?.("input,textarea,[translate=no]")) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), ns = [];
    for (let n = root.nodeType === 3 ? root : w.nextNode(); n; n = w.nextNode()) if (r.intersectsNode(n)) ns.push(n);
    const en = enOf(ns), b = r.getBoundingClientRect(); if (en) enShow(en, b.left + b.width / 2, b.top, enLastNow);
  }, 350);
});
let enHov = 0;
document.addEventListener("pointerover", (e) => {
  if (e.pointerType !== "mouse" || !lang) return;
  clearTimeout(enHov); const t = e.target, x = e.clientX, y = e.clientY;
  enHov = setTimeout(() => { const en = enAt(t); if (en) enShow(en, x, y, enLastNow); }, 900);
});
document.addEventListener("pointerout", (e) => { if (e.pointerType === "mouse") { clearTimeout(enHov); } });

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-en-say]"); if (!b) return;
  clearTimeout(enHide); enHide = setTimeout(enClose, 8000);
  if (b.dataset.enSay === "en") sayIn($("#enpop").dataset.en, ""); else sayIn(enNow, lang);
});

/* ---------- Both languages at once, for learning ----------
   With "Show the English too" on, reading text (headings, notes, list lines) shows the English in small under the
   translation. Buttons stay one language so they still fit: hold them for the English. */
let BI = store.get("lang.bi", false);
const BI_SKIP = /^(BUTTON|OPTION|SELECT|INPUT|TEXTAREA|A)$/;
function biMark(n, k, t) {
  const p = n.parentElement; if (!p) return;
  if (!BI || !t || t === k || BI_SKIP.test(p.tagName) || p.closest("button,.chip,.seg,nav,.tabs,[translate=no]") || p.childNodes.length > 1 || k.length < 3) { if (p.hasAttribute("data-bi")) p.removeAttribute("data-bi"); return; }
  if (p.getAttribute("data-bi") !== k) p.setAttribute("data-bi", k);
}
function biSet(on) { BI = on; store.set("lang.bi", on); document.documentElement.classList.toggle("bi", on); trObs.disconnect(); trTree(document.body); trWatch(); }
document.documentElement.classList.toggle("bi", BI);
document.addEventListener("change", (e) => { if (e.target.matches?.("[data-bi-pick]")) { biSet(e.target.checked); haptic(); } });

/* ---------- Each person's language ----------
   Kept on this phone by first name: on the shared iPad the language follows whoever picks their name. Asked the first
   time someone picks their name. */
const langBy = () => store.get("lang.by", {});
function langRemember(c) { if (!myName) return; const b = langBy(); b[myName.toLowerCase()] = c; store.set("lang.by", b); }
function langPerson(n) {
  const b = langBy(), k = (n || "").toLowerCase(); if (!k) return;
  if (k in b) { if (b[k] !== lang && !GUEST.on) setLang(b[k]); return; }
  // Someone who already picked a language on this phone before names were asked keeps it.
  if (lang) { langRemember(lang); return; }
  langAsk();
}
// Big buttons, each language in its own words: English, the built-in ones, then (with live translation) any other.
function langChoices(attr) {
  const b = (c) => `<button class="lchip" ${attr}="${c}" aria-pressed="${c === lang}" lang="${c || "en"}" translate="no"><b>${esc(c ? langOwn(c) : "English")}</b>${c && langOwn(c) !== langEn(c) ? `<span>${esc(langEn(c))}</span>` : ""}</button>`;
  const more = WORLD.filter(([c]) => !LANG_BUILT.has(c)).sort((x, y) => x[1].localeCompare(y[1]));
  return `<div class="lchips">${b("")}${[...LANGS].sort((x, y) => x[2].localeCompare(y[2])).map(([c]) => b(c)).join("")}</div>
    <div class="sec">More languages, translated live</div>
    ${aiOn() ? `<div class="lchips">${more.map(([c]) => b(c)).join("")}</div>` : `<p class="note">Any other language (Irish, Scottish Gaelic, German, Japanese…) is translated live. Live translation is off: Maintenance switches it on in More, This phone.</p>`}`;
}
document.body.insertAdjacentHTML("beforeend", `<div id="langask" class="help langask" hidden><div class="help-in" role="dialog" aria-modal="true" aria-labelledby="la-t">
  <div class="help-h"><h3 id="la-t">Which language?</h3><button class="hq-x" data-la-x aria-label="Close">×</button></div><div class="la-b"></div></div></div>`);
function langAsk() {
  const p = $("#langask");
  p.querySelector(".la-b").innerHTML = `<p class="lead">Bar Book in your language${myName ? `, <b translate="no">${esc(myName)}</b>` : ""}. The <b>EN</b> button at the top switches to English and back any time, and you can hold any words to see them in English.</p>${langChoices("data-la")}`;
  p.hidden = false; p.scrollTop = 0;
}
document.addEventListener("click", (e) => {
  const c = e.target.closest("[data-la]");
  if (c) { haptic(); setLang(c.dataset.la); langRemember(c.dataset.la); $("#langask").hidden = true; return; }
  if (e.target.closest("[data-la-x]") || e.target.id === "langask") { if (myName && !(myName.toLowerCase() in langBy())) langRemember(lang); $("#langask").hidden = true; }
  if (e.target.closest("[data-la-open]")) { haptic(); langAsk(); }
});

// What people wrote, translated where it is with live translation on (the Translate button). Tap again for the original.
async function utLive(el, b) {
  if (el.dataset.utOrig != null) { el.textContent = el.dataset.utOrig; delete el.dataset.utOrig; b.textContent = "Translate"; return; }
  const t = el.textContent.trim(); b.disabled = true;
  try { const [x] = await LIVE.api.translate([t], langEn(lang), "the language it is written in"); el.dataset.utOrig = t; el.textContent = x; b.textContent = "Original"; }
  catch (e) { toast(e.message || "Couldn't translate. Check the signal"); }
  b.disabled = false;
}

/* ---------- More, This phone: languages ---------- */
function langPanelHtml() {
  const on = aiOn(), key = LIVE.aiKey ?? store.get("ai.key", "");
  return `<p class="note">Every screen changes language. Hold any words for a moment (or select them) to see them in English, or tap <b>EN</b> at the top to flip to English and back. Drink names and specs stay in English, as on the bottles; allergens show in English with your language underneath.</p>
    <label class="check"><input type="checkbox" data-bi-pick${BI ? " checked" : ""}> Show the English too, under each line (for learning)</label>
    <div class="actions"><button class="btn pri" data-guest-open>🌍 Talk to a guest</button><button class="btn" data-la-open>Change my language</button></div><button class="linkbtn" data-lang-help>How languages work ›</button>
    <details class="setup"><summary>Clearer voices on iPhone and iPad</summary>
      <p class="note">The app uses the best voice your phone has for each language. Better ones are free to download:</p>
      <ol class="note"><li>Settings, Accessibility, Read &amp; Speak (Spoken Content on older iPhones), Voices.</li><li>Pick the language, then a voice marked <b>Premium</b> or <b>Enhanced</b>, and tap download.</li><li>Close Bar Book fully and open it again.</li></ol>
      <p class="note">iPhones have no voice for Armenian, Urdu, Welsh, Irish or Scottish Gaelic, and can't hear Bengali, Bulgarian, Gujarati, Lithuanian, Nepali, Punjabi, Tamil, Urdu, Armenian, Welsh, Irish or Scottish Gaelic: for those, read and type. Android phones with Google's speech services cover more.</p></details>
    <div class="mini" style="margin-top:14px">Live translation</div>
    <p class="note">${on ? "On, free. Lines the app doesn't have words for (and any language in the world) are translated by Google's Gemini, once, then kept on this phone." : "Off. The 22 built-in languages work as they are. Switched on, any other language and any line the app hasn't got words for are translated by Google's Gemini, free on Firebase's free plan."} Don't type guests' personal details into it.</p>
    ${LIVE.owner ? `<details class="setup"${key ? "" : " open"}><summary>Maintenance: switch live translation on or off</summary>
      <ol class="note"><li>Firebase console, the Bar Book project, AI Logic: Get started, and pick the <b>Gemini Developer API</b> (the free one).</li>
      <li>Google Cloud console, Security, reCAPTCHA: Create key. Website, domain <b translate="no">rickdsage.github.io</b>. Copy the key's ID.</li>
      <li>Firebase console, App Check, Apps: the web app, reCAPTCHA Enterprise, paste the same key, Save.</li>
      <li>Paste it here and Save. Every phone on the team switches on.</li></ol>
      <label class="fld">reCAPTCHA key<input id="ai-key" value="${esc(key || "")}" autocomplete="off" spellcheck="false" translate="no" placeholder="6Lc…"></label>
      <div class="actions"><button class="btn pri" data-ai-save>Save</button><button class="btn" data-ai-test>Test it</button>${key ? `<button class="btn danger" data-ai-off>Switch off</button>` : ""}</div>
      <p class="note">Free while Firebase stays on the free Spark plan (spam checks free up to 10,000 a month, then it pauses until the next month). On the paid Blaze plan, Google charges a few pence a month for it.</p></details>` : ""}`;
}
document.addEventListener("click", async (e) => {
  if (e.target.closest("[data-ai-save]")) {
    const k = $("#ai-key").value.trim();
    if (!/^[A-Za-z0-9_-]{20,60}$/.test(k)) return toast("That doesn't look like a reCAPTCHA key");
    return track(LIVE.api.saveAiKey(k), "Saved. Phones switch on as they see it");
  }
  if (e.target.closest("[data-ai-off]")) return track(LIVE.api.saveAiKey(""), "Switched off. Phones stop after their next restart");
  if (e.target.closest("[data-ai-test]")) {
    if (!aiOn()) { aiKick(); if (!aiOn()) return toast("Save the key first"); }
    toast("Testing…");
    try { const [x] = await LIVE.api.translate(["Single or double?"], "Spanish"); toast(`Working: “${x}”`); }
    catch (er) { toast(`Not working yet: ${er.message || er}`.slice(0, 140)); }
  }
});
document.addEventListener("click", (e) => { const b = e.target.closest("[data-lang-help]"); if (b) { haptic(); helpOpen("lang", b); } });
