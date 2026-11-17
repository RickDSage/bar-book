/* ---------- Bar phrases ----------
   A few things the bar and floor really say to guests, in French, Spanish and Italian. One big card at a time: the
   phrase, how to say it (sounded out), what it means, and a button to hear it in a native voice. No grammar. The English
   and the sound-it-out line can each be switched off once you know them. Going through a set counts towards the same
   daily streak as the drill. All on this phone only (store "phr").
   Written by hand in everyday spoken style (vous in French, Spanish as said in Spain), not run through a translator.
   Not yet checked by a native speaker on the team: App feedback for anything that sounds off. */
const PH_LANGS = [["fr", "Français", "French", "fr-FR"], ["es", "Español", "Spanish", "es-ES"], ["it", "Italiano", "Italian", "it-IT"]];
// [id, sides, English, French, how to say it, Spanish, how to say it, Italian, how to say it]. Capitals are the loud bit.
const PH = [
  ["learn", "bar floor", "Hi! I'm still learning {lang}, sorry!",
    "Bonjour ! J'apprends encore le français, désolé !", "bon-ZHOOR! zhah-PRAHN ahn-KOR luh frahn-SAY, day-zoh-LAY",
    "¡Hola! Todavía estoy aprendiendo español, ¡perdona!", "OH-lah! toh-dah-VEE-ah es-TOY ah-pren-DYEN-doh es-pan-YOL, pair-DOH-nah",
    "Ciao! Sto ancora imparando l'italiano, scusa!", "CHOW! stoh ahn-KOH-rah eem-pah-RAHN-doh lee-tah-LYAH-noh, SKOO-zah"],
  ["seat", "floor", "At the bar or at a table?",
    "Au bar ou à une table ?", "oh BAR oo ah oon TAH-bluh",
    "¿En la barra o en una mesa?", "en lah BAH-rah oh en OO-nah MEH-sah",
    "Al bancone o al tavolo?", "ahl bahn-KOH-neh oh ahl TAH-voh-loh"],
  ["allergy", "bar floor", "Any allergies?",
    "Vous avez des allergies ?", "voo-zah-VAY day-zah-lair-ZHEE",
    "¿Alguna alergia?", "ahl-GOO-nah ah-LAIR-hyah",
    "Avete allergie?", "ah-VEH-teh ahl-lair-JEE-eh"],
  ["single", "bar", "Single or double?",
    "Simple ou double ?", "SAM-pluh oo DOO-bluh",
    "¿Sencillo o doble?", "sen-SEE-yoh oh DOH-bleh",
    "Singolo o doppio?", "SEEN-goh-loh oh DOHP-pyoh"],
  ["ice", "bar", "With ice?",
    "Avec des glaçons ?", "ah-VEK day glah-SOHN",
    "¿Con hielo?", "kon YEH-loh",
    "Con ghiaccio?", "kon GYAHT-choh"],
  ["wine", "bar floor", "Red, white or rosé?",
    "Rouge, blanc ou rosé ?", "ROOZH, BLAHN oo roh-ZAY",
    "¿Tinto, blanco o rosado?", "TEEN-toh, BLAHN-koh oh roh-SAH-doh",
    "Rosso, bianco o rosato?", "ROHS-soh, BYAHN-koh oh roh-ZAH-toh"],
  ["glass", "bar floor", "A glass or a bottle?",
    "Un verre ou une bouteille ?", "uhn VAIR oo oon boo-TAY",
    "¿Una copa o una botella?", "OO-nah KOH-pah oh OO-nah boh-TEH-yah",
    "Un bicchiere o una bottiglia?", "oon beek-KYEH-reh oh OO-nah boht-TEE-lyah"],
  ["beer", "bar floor", "Which beer would you like?",
    "Quelle bière voulez-vous ?", "kel BYAIR voo-lay VOO",
    "¿Qué cerveza quieres?", "keh sair-VEH-sah KYEH-res",
    "Quale birra vuoi?", "KWAH-leh BEER-rah VWOY"],
  ["pint", "bar", "A pint or a half?",
    "Une pinte ou un demi ?", "oon PANT oo uhn duh-MEE",
    "¿Una pinta o media?", "OO-nah PEEN-tah oh MEH-dyah",
    "Una pinta o mezza?", "OO-nah PEEN-tah oh MED-dzah"],
  ["burger", "floor", "Beef burger or chicken burger?",
    "Burger au bœuf ou au poulet ?", "bur-GAIR oh BUHF oo oh poo-LAY",
    "¿Hamburguesa de ternera o de pollo?", "am-boor-GEH-sah deh tair-NEH-rah oh deh POH-yoh",
    "Hamburger di manzo o di pollo?", "AM-boor-gair dee MAHN-dzoh oh dee POHL-loh"],
  ["fries", "floor", "Fries with that?",
    "Avec des frites ?", "ah-VEK day FREET",
    "¿Con patatas fritas?", "kon pah-TAH-tahs FREE-tahs",
    "Con le patatine?", "kon leh pah-tah-TEE-neh"],
  ["drink", "floor", "Something to drink?",
    "Quelque chose à boire ?", "kel-kuh SHOHZ ah BWAHR",
    "¿Algo de beber?", "AHL-goh deh beh-BAIR",
    "Qualcosa da bere?", "kwahl-KOH-zah dah BEH-reh"],
  ["water", "floor", "Still or sparkling water?",
    "Eau plate ou gazeuse ?", "oh PLAHT oo gah-ZUHZ",
    "¿Agua con gas o sin gas?", "AH-gwah kon GAHS oh seen GAHS",
    "Acqua naturale o frizzante?", "AHK-kwah nah-too-RAH-leh oh freed-DZAHN-teh"],
  ["cheers", "bar", "Cheers!",
    "Santé !", "sahn-TAY",
    "¡Salud!", "sah-LOOD",
    "Cin cin!", "cheen cheen"],
  ["enjoy", "floor", "Enjoy your meal!",
    "Bon appétit !", "bon ah-pay-TEE",
    "¡Que aproveche!", "keh ah-proh-VEH-cheh",
    "Buon appetito!", "bwon ahp-peh-TEE-toh"],
  ["pay", "bar floor", "Card or cash?",
    "Carte ou espèces ?", "KART oo es-PESS",
    "¿Tarjeta o efectivo?", "tar-HEH-tah oh eh-fek-TEE-voh",
    "Carta o contanti?", "KAR-tah oh kohn-TAHN-tee"],
  ["bye", "bar floor", "Thank you, see you soon!",
    "Merci, à bientôt !", "mair-SEE, ah byan-TOH",
    "¡Gracias, hasta pronto!", "GRAH-syahs, AHS-tah PROHN-toh",
    "Grazie, a presto!", "GRAHT-tsyeh, ah PREH-stoh"],
];
const phSet = () => ({ lang: "fr", side: "bar", en: true, say: true, seen: {}, ...store.get("phr", {}) });
let PHS = phSet(), PRUN = null;
const phSave = () => store.set("phr", PHS);
const phLang = () => PH_LANGS.find(([c]) => c === PHS.lang) || PH_LANGS[0];
const phCol = () => 3 + PH_LANGS.indexOf(phLang()) * 2;
const phCards = () => PH.filter((r) => r[1].split(" ").includes(PHS.side));
const phEn = (r) => r[2].replace("{lang}", phLang()[2]);
// Hear it in the language's own voice. A phone without that voice still reads it with the language set.
function phSpeak(text) {
  if (!SAY_OK) return toast("This phone can't read out loud");
  const tag = phLang()[3], vs = speechSynthesis.getVoices();
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text); u.lang = tag; u.rate = 0.85;
  const v = vs.find((x) => x.lang === tag) || vs.find((x) => x.lang?.slice(0, 2) === tag.slice(0, 2)); if (v) u.voice = v;
  speechSynthesis.speak(u);
}
function phStart() { haptic(); sayStop(); PRUN = { i: 0 }; FN.view = "phr"; renderFun(); }
// Going through the whole set counts as today's practice, the same streak as the drill.
function phDone() {
  const t = fnDay();
  if (!DR.days.includes(t)) { DR.days = [...DR.days, t].slice(-400); drillSave(); }
  FN.view = "phrEnd"; renderFun();
}
function phHtml() {
  const xs = phCards(), r = xs[PRUN.i], c = phCol(), [, nat] = phLang(), last = PRUN.i === xs.length - 1;
  (PHS.seen[PHS.lang] ||= {})[r[0]] = 1; phSave();
  return `<div class="dr-head"><b>${esc(nat)} · ${PHS.side === "bar" ? "Bar" : "Floor"}</b><span>${PRUN.i + 1} of ${xs.length}</span><button class="linkbtn" data-fn="home">Stop</button></div>
    <div class="card ph-card">
      <p class="ph-say" lang="${PHS.lang}" translate="no">${esc(r[c])}</p>
      ${PHS.say ? `<p class="ph-pron" translate="no">${esc(r[c + 1])}</p>` : ""}
      ${PHS.en ? `<p class="ph-en">${esc(phEn(r))}</p>` : ""}
      <button class="btn pri ph-hear" data-ph-hear="${esc(r[c])}">🔊 Hear it</button>
    </div>
    <div class="ph-nav"><button class="btn" data-ph="back"${PRUN.i ? "" : " disabled"}>‹ Back</button><button class="btn pri" data-ph="next">${last ? "Finish" : "Next ›"}</button></div>
    <div class="ph-tg"><label class="check"><input type="checkbox" data-ph-tg="en"${PHS.en ? " checked" : ""}> Show the English</label><label class="check"><input type="checkbox" data-ph-tg="say"${PHS.say ? " checked" : ""}> Show how to say it</label></div>`;
}
function phEndHtml() {
  const s = drillStreak(), [, nat] = phLang(), c = phCol();
  return `<button class="back" data-fn="home">‹ Games and drills</button>
    <div class="card dr-end"><p class="dr-fire" aria-hidden="true">${s >= 2 ? "🔥" : "✅"}</p><h2>Nice one!</h2>
      <p class="lead" style="margin:6px auto 0">${s ? `${plural(s, "day")} in a row.` : ""} Try one on a guest tonight.</p></div>
    <div class="sec">Your ${esc(nat)} phrases</div>
    ${phCards().map((r) => `<button class="ph-row" data-ph-hear="${esc(r[c])}"><b lang="${PHS.lang}" translate="no">🔊 ${esc(r[c])}</b>${PHS.en ? `<span>${esc(phEn(r))}</span>` : ""}</button>`).join("")}
    <div class="actions"><button class="btn pri" data-fn="phr">Go again</button><button class="btn" data-fn="home">Done</button></div>
    <p class="note">Something sound off to a native speaker? Tell maintenance in App feedback.</p>`;
}
function phCardHtml() {
  const chip = (k, v, l, lang) => `<button class="chip" data-ph-${k}="${v}" aria-pressed="${PHS[k] === v}"${lang ? ` lang="${v}" translate="no"` : ""}>${l}</button>`;
  return `<div class="dr-card ph"><span class="k">Bar phrases</span><b class="t">Say it to guests in their language</b>
    <span class="s">One phrase at a time, with how to say it and a button to hear it.</span>
    <span class="recent ph-langs">${PH_LANGS.map(([c, l]) => chip("lang", c, l, true)).join("")}</span>
    <span class="recent ph-langs">${chip("side", "bar", "Bar")}${chip("side", "floor", "Floor")}</span>
    <button class="btn pri" data-fn="phr">Start</button></div>`;
}
$("#v-fun").addEventListener("click", (e) => {
  const l = e.target.closest("[data-ph-lang], [data-ph-side]");
  if (l) { haptic(); if (l.dataset.phLang) PHS.lang = l.dataset.phLang; if (l.dataset.phSide) PHS.side = l.dataset.phSide; phSave(); renderFun(); return; }
  const h = e.target.closest("[data-ph-hear]"); if (h) { haptic(); return phSpeak(h.dataset.phHear); }
  const b = e.target.closest("[data-ph]"); if (!b || !PRUN) return;
  haptic();
  if (b.dataset.ph === "back" && PRUN.i > 0) PRUN.i--;
  else if (b.dataset.ph === "next") { if (PRUN.i >= phCards().length - 1) return phDone(); PRUN.i++; }
  renderFun();
});
document.addEventListener("change", (e) => {
  const t = e.target.closest?.("[data-ph-tg]"); if (!t) return;
  PHS[t.dataset.phTg] = t.checked; phSave(); if (cur === "fun") renderFun();
});
