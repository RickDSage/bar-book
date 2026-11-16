/* ---------- Bar Book plus: strength, units, calories, smarter search, filters, spec of the day, picture cards, lists ----------
   Reads the drinks as they are (DATA.drinks) and the Make tab's ingredient matching (MK.reqs). Never changes a spec.
   Everything here is worked out on the phone: nothing is sent anywhere. */

/* Strength and calories, per ingredient kind: [ABV %, kcal per ml from everything but the alcohol].
   ABVs are the usual UK bottlings (the brand's own where a drink names one). Calories for the sugar, juice and cream come
   from typical label values: 1:1 sugar syrup about 2.5 kcal a ml, Monin-style syrups about 3, juices 0.2 to 0.5, liqueurs
   about 1 to 1.6 from their sugar, cream liqueurs about 2.3. Alcohol is 0.789 g a ml at 7 kcal a gram. All estimates. */
const PL_KIND = {
  "Vodka": [37.5, 0], "Flavoured vodka": [37.5, 0], "Vanilla vodka": [37.5, 0], "Berry vodka": [37.5, 0], "Apple vodka": [37.5, 0], "Mango vodka": [37.5, 0],
  "Pineapple vodka": [37.5, 0], "Peach vodka": [37.5, 0.1], "Rhubarb vodka": [40, 0], "Orange vodka": [40, 0], "Citrus vodka": [40, 0],
  "Gin": [40, 0], "Orange gin": [41.3, 0.1], "Pink gin": [37.5, 0.1], "Sloe gin": [26, 1.0],
  "White rum": [37.5, 0], "Gold rum": [37.5, 0], "Overproof rum": [63, 0], "Dark rum": [40, 0], "Spiced rum": [35, 0.1], "Aged rum": [40, 0.1], "Cachaça": [40, 0],
  "Blanco tequila": [38, 0], "Reposado tequila": [38, 0], "Añejo tequila": [40, 0], "Mezcal": [40, 0],
  "Bourbon": [40, 0], "Rye whiskey": [45, 0], "Irish whiskey": [40, 0], "Blended Scotch": [40, 0], "Single malt Scotch": [40, 0], "Peated Scotch": [46, 0],
  "Japanese whisky": [43, 0], "Canadian whisky": [40, 0], "Peanut butter whiskey": [35, 0.6], "Cognac": [40, 0], "Apple brandy": [40, 0], "Pisco": [40, 0],
  "Orange liqueur": [40, 1.0], "Blue curaçao": [25, 1.2], "Coffee liqueur": [20, 1.6], "Amaretto": [28, 1.4], "Hazelnut liqueur": [20, 1.4], "Raspberry liqueur": [16.5, 1.5],
  "Cassis": [20, 1.8], "Blackberry liqueur": [16, 1.6], "Cherry liqueur": [24, 1.3], "Maraschino": [32, 1.3], "Melon liqueur": [20, 1.6], "Peach schnapps": [18, 1.2],
  "Passion fruit liqueur": [17, 1.4], "Lychee liqueur": [20, 1.3], "Apple liqueur": [15, 1.3], "Limoncello": [28, 1.2], "Coconut rum": [21, 1.0], "Elderflower liqueur": [20, 1.3],
  "Cream liqueur": [17, 2.3], "Marshmallow liqueur": [20, 1.3], "Falernum": [11, 1.2], "Apricot liqueur": [24, 1.3], "Butterscotch schnapps": [15, 1.3], "Southern Comfort": [35, 0.5],
  "Advocaat": [17, 2.0], "White cacao": [24, 1.6], "Dark cacao": [24, 1.6], "Crème de menthe": [24, 1.6], "Violette": [16, 1.5], "Yellow Chartreuse": [40, 1.2], "Green Chartreuse": [55, 1.0],
  "Bénédictine": [40, 1.2], "Drambuie": [40, 1.2], "Jägermeister": [35, 0.8], "Galliano": [30, 1.0], "Amaro": [35, 0.8], "Gentian liqueur": [15, 0.8], "Fernet": [39, 0.3],
  "Chilli liqueur": [40, 0.8], "Absinthe": [55, 0], "Sambuca": [38, 1.2], "Pastis": [40, 0.4],
  "Aperol": [11, 0.95], "Campari": [25, 0.95], "Sarti Rosa": [14, 0.9], "Sweet vermouth": [15, 0.6], "Bianco vermouth": [14.4, 0.6], "Dry vermouth": [17, 0.15], "Lillet": [17, 0.4],
  "Sherry": [15, 0.05], "Pimm's": [25, 0.5], "White wine": [12, 0.08], "Red wine": [13.5, 0.1], "Sparkling wine": [11, 0.15],
  "Lager": [4.6, 0.16], "IPA": [5, 0.18], "Stout": [4.2, 0.12], "Alcohol-free beer": [0, 0.2], "Cider": [4, 0.35], "Fruit cider": [4, 0.45], "Alcohol-free cider": [0, 0.45],
  "Cream": [0, 4.5], "Milk": [0, 0.64], "Coconut cream": [0, 2.5], "Foamer": [0, 0], "Ice cream": [0, 2.0],
  "Sugar syrup": [0, 2.5], "Honey": [0, 2.5], "Agave syrup": [0, 3.0], "Vanilla syrup": [0, 3.0], "Grenadine": [0, 2.8], "Orgeat": [0, 3.0], "Elderflower": [0, 2.0], "Caramel": [0, 3.3],
  "Marshmallow syrup": [0, 3.0], "Passion fruit syrup": [0, 3.0], "Raspberry syrup": [0, 3.0], "Strawberry syrup": [0, 3.0], "Watermelon syrup": [0, 3.0], "Cinnamon syrup": [0, 3.0],
  "Hazelnut syrup": [0, 3.0], "Ginger syrup": [0, 3.0], "Lime cordial": [0, 1.1], "Blackcurrant cordial": [0, 0.9],
  "Lime juice": [0, 0.25], "Lemon juice": [0, 0.22], "Orange juice": [0, 0.45], "Pineapple juice": [0, 0.5], "Cranberry juice": [0, 0.48], "Grapefruit juice": [0, 0.4], "Tomato juice": [0, 0.18],
  "Apple juice": [0, 0.46], "Mango juice": [0, 0.55], "Strawberry purée": [0, 1.0], "Peach purée": [0, 1.0], "Passion fruit purée": [0, 1.0], "Mango purée": [0, 1.0], "Raspberry purée": [0, 1.0],
  "Lychee juice": [0, 0.6], "Soda": [0, 0], "Tonic": [0, 0.25], "Ginger ale": [0, 0.25], "Ginger beer": [0, 0.3], "Lemonade": [0, 0.25], "Orange soda": [0, 0.03], "Cola": [0, 0.42],
  "Energy drink": [0, 0.46], "Jarritos": [0, 0.45], "Iced tea": [0, 0.3], "Water": [0, 0], "Espresso": [0, 0.02], "Hot coffee": [0, 0.01],
  "Angostura": [44.7, 0], "Orange bitters": [28, 0], "Peychaud's": [35, 0], "Chocolate bitters": [40, 0], "Celery bitters": [40, 0], "Flower water": [0, 0], "Vanilla extract": [35, 0],
};
// Named bottles that differ from their kind (brand pages, UK bottlings).
const PL_ITEM = {
  "Grey Goose": 40, "Belvedere": 40, "Ketel One": 40, "Absolut": 40, "Absolut Vanilia": 38, "Belvedere Blackberry & Lemongrass": 40,
  "Tanqueray": 43.1, "Aviation gin": 42, "Roku": 43, "Drumshanbo Gunpowder": 43, "Monkey 47": 47, "The Botanist": 46, "Gordon's": 37.5, "Hendrick's": 41.4,
  "Havana Club 3": 40, "Kraken Black Spiced": 40, "Casamigos Blanco": 40, "Patrón Silver": 40, "Casamigos Reposado": 40, "Clase Azul Reposado": 40,
  "Bulleit Bourbon": 45, "Elijah Craig": 47, "Michter's": 45.7, "Maker's Mark": 45, "Woodford Reserve": 43.2, "Rittenhouse Rye": 50,
  "Glenmorangie Signet": 46, "Talisker 10": 45.8, "Port Charlotte 10": 50, "Laphroaig 10": 40, "Kahlúa": 16, "Mr Black": 23, "Amer Picon": 18, "Single cream": 0,
  "Camden Off Menu IPA": 5.8, "Goose Island Midway": 4.1, "San Miguel": 5, "Budweiser": 4.5, "Corona": 4.5,
};
const PL_CAL = { "Single cream": 1.9, "Oat milk": 0.45, "Rich sugar syrup (2:1)": 3.4, "Fever-Tree Light Tonic": 0.15, "Diet Coke": 0, "Coke Zero": 0, "Red Bull Sugarfree": 0.03, "Coconut milk": 1.8, "Egg white": 0.5, "Aquafaba": 0.2 };
// Calories for one piece: a wedge, a leaf, a heaped spoon.
const PL_PIECE = { "Sugar": 16, "Lime": 2, "Lemon": 2, "Fresh orange": 6, "Passion fruit": 18, "Cocktail cherry": 8, "Marmalade": 26, "Strawberries": 4, "Cucumber": 1, "Chilli": 1, "Ice cream": 120 };
const PL_BITTERS = /bitters|Angostura|Peychaud/;
// How much a "Top" is, by the glass it goes in.
function plTopMl(d) {
  const g = d.glass;
  return /Pitcher/.test(g) ? 400 : /Highball|Heatproof/.test(g) ? 100 : /Spritz/.test(g) ? 75 : /Rocks/.test(g) ? 50 : /Shot/.test(g) ? 10 : 25;
}
const plNum = (s) => { const m = String(s).match(/^(\d+(?:\.\d+)?)(?: to (\d+))?/); return m ? (m[2] ? (+m[1] + +m[2]) / 2 : +m[1]) : /^half/i.test(s) ? 0.5 : 1; };
// One spec line's ml (or pieces) and its kind.
function plPart(x, d) {
  const kind = x.it.kind, l = x.line.replace(/^side:\s*/i, ""), n = plNum(l);
  let ml = x.ml, pcs = 0;
  if (ml == null) {
    if (/^top/i.test(l)) ml = plTopMl(d);
    else if (/half pint/i.test(l)) ml = 284;
    else if (/splash/i.test(l)) ml = 15;
    else if (/dash/i.test(l)) ml = n * (PL_BITTERS.test(kind) || /Tabasco|Worcestershire|Flower water/.test(kind) ? 0.9 : 5);
    else if (/drop/i.test(l)) ml = n * 0.05;
    else if (/bar spoon/i.test(l) && !PL_PIECE[kind]) ml = n * 5;
    else if (/rinse/i.test(l)) ml = 2;
    else if (/\bcan\b/i.test(l)) ml = n * 250;
    else if (/pinch/i.test(l)) ml = 0;
    else { ml = 0; pcs = n; }
  }
  const abv = PL_ITEM[x.it.n] ?? (PL_KIND[kind] || [0, 0])[0];
  const kcal = (PL_CAL[x.it.n] ?? (PL_KIND[kind] || [0, 0])[1]) * ml + (PL_PIECE[kind] || 0) * pcs;
  return { ml, abv, kcal };
}
// How much the ice adds. Dave Arnold's worked examples (Cooking Issues, 2010): a shaken whiskey sour about 66% water on
// top of the mix, a stirred Manhattan about 50%. Served over fresh ice, less; built drinks get their water from the top.
function plWater(d) {
  const m = d.method.toLowerCase(), g = d.glass;
  if (/Shot|Half pint/.test(g) || /layer/.test(m) || /^none/i.test(d.ice) && !/shake|stir/.test(m)) return 1;
  if (/blend/.test(m)) return 1.4;
  if (/shake/.test(m)) return /none|served up/i.test(d.ice) ? 1.55 : 1.4;
  if (/stir/.test(m) && !/short stir|stir gently|quick stir/.test(m)) return /none|served up/i.test(d.ice) ? 1.45 : 1.35;
  if (/churn|crushed/i.test(m + d.ice)) return 1.25;
  return 1.1;
}
const PL_FACTS = new Map();
// Per drink, as specced (a pitcher's numbers are for the pitcher; per glass is shared out over its glasses).
function plFacts(d) {
  if (PL_FACTS.has(d.id)) return PL_FACTS.get(d.id);
  let vol = 0, alc = 0, kcal = 0;
  for (const x of MK.reqs.get(d.id) || []) { const p = plPart(x, d); vol += p.ml; alc += (p.ml * p.abv) / 100; kcal += p.kcal; }
  kcal += alc * 0.789 * 7;
  const glasses = +(d.glass.match(/with (\d+) glasses/) || [])[1] || 1;
  const f = { vol, alc, units: alc / 10, kcal, abv: vol ? (alc / (vol * plWater(d))) * 100 : 0, glasses, free: alc < 0.5 };
  PL_FACTS.set(d.id, f);
  return f;
}
const plRound = (k) => (k < 100 ? Math.round(k / 5) * 5 : Math.round(k / 10) * 10);
const plU = (u) => (u < 0.05 ? "0" : u < 10 ? u.toFixed(1) : String(Math.round(u)));
const plPct = (a) => (a < 10 ? a.toFixed(1) : String(Math.round(a))) + "%";
function plStatsHtml(d, n = 1) {
  const f = plFacts(d), per = f.glasses > 1 ? ` <small>(${plU(f.units / f.glasses)} a glass)</small>` : "";
  const cell = (v, l) => `<div><b>${v}</b><span>${l}</span></div>`;
  const vol = (u) => (PL.oz ? `${(u / 29.57).toFixed(1)} oz` : `${Math.round(u)} ml`);
  return `<div class="pl-stats" role="list">${[
    f.free ? cell("0", "Alcohol-free") : cell(plU(f.units * n) + per, n > 1 ? `UK units for ${n}` : "UK units"),
    cell(f.free ? "0%" : "≈" + plPct(f.abv), "In the glass"),
    cell("≈" + plRound(f.kcal * n), n > 1 ? `kcal for ${n}` : "kcal"),
    cell(vol(f.vol * n), n > 1 ? `Liquid for ${n}` : "Liquid"),
  ].join("").replace(/<div>/g, '<div role="listitem">')}</div>
  <p class="note pl-est">Estimates from the spec and usual UK bottle strengths. One UK unit is 10 ml of pure alcohol; the NHS advises no more than 14 units a week.</p>`;
}

/* ---------- Serves, batching and ml or oz ---------- */
const PL = { oz: store.get("oz", false), ticks: { id: null, spec: new Set(), steps: new Set() }, base: null, how: null, sort: store.get("sort", "menu"), open: false, list: null, sq: null, can: false };
const PL_SERVES = [1, 2, 3, 4, 6, 8, 10, 12];
function plServesHtml() {
  const i = Math.max(0, PL_SERVES.indexOf(mult)), pv = PL_SERVES[Math.max(0, i - 1)], nx = PL_SERVES[Math.min(PL_SERVES.length - 1, i + 1)];
  return `<span class="pl-serve" role="group" aria-label="How many"><button data-mult="${pv}" aria-label="Fewer"${mult <= 1 ? " disabled" : ""}>−</button><b aria-live="polite">×${mult}</b><button data-mult="${nx}" aria-label="More"${mult >= 12 ? " disabled" : ""}>+</button></span>
    <span class="pl-units" role="group" aria-label="Units"><button data-pl-oz="0" aria-pressed="${!PL.oz}">ml</button><button data-pl-oz="1" aria-pressed="${PL.oz}">oz</button></span>`;
}
// How to make several at once: stirred drinks go in a jug with their water, shaken ones are shaken two to a tin.
function plBatchNote(d) {
  if (mult < 2) return "";
  const f = plFacts(d), m = d.method.toLowerCase(), water = Math.round(f.vol * mult * 0.2 / 5) * 5;
  const fizz = d.spec.some((l) => /^top|prosecco|soda|tonic|lemonade|ginger (beer|ale)|cola|red bull/i.test(l));
  let t;
  if (/shake/.test(m)) t = `Shake two at a time: a tin holds two. Pre-mix everything ${fizz ? "but the fizz " : ""}in a jug, then pour ${Math.round(f.vol)} ml a drink into the tin${/foamer|egg white|aquafaba/i.test(d.spec.join(" ")) ? " and add the foamer per tin" : ""}.`;
  else if (/stir/.test(m) && !/short stir/.test(m)) t = `Batch it in a jug with about ${water} ml of cold water (20%), chill it, then pour ${Math.round(f.vol * 1.2)} ml a drink ${/none|served up/i.test(d.ice) ? "straight into the chilled glass" : "over fresh ice"}. No stirring needed.`;
  else if (/blend/.test(m)) t = `A blender jug takes about four. Blend in batches with a scoop of ice each.`;
  else t = `Build each glass on its own${fizz ? ", fizz last so it stays lively" : ""}.`;
  return `<p class="note pl-batch"><b>For ${mult}:</b> ${t}</p>`;
}
const plOz = (q) => (PL.oz && q ? q.replace(/(\d+(?:\.\d+)?)(?: to (\d+(?:\.\d+)?))? ?ml\b/, (m, a, b) => `${(a / 29.57).toFixed(2).replace(/0$/, "")}${b ? ` to ${(b / 29.57).toFixed(2).replace(/0$/, "")}` : ""} oz`) : q);

/* ---------- Tick as you go ---------- */
// Tap a spec line or a step when it's in: ticks stay while you change serves, and reset for the next drink.
function plTicksFor(id) { if (PL.ticks.id !== id) PL.ticks = { id, spec: new Set(), steps: new Set() }; return PL.ticks; }
function plTickMark() {
  const t = plTicksFor(curId);
  $$("#sheet ul.spec > li").forEach((li, i) => { li.dataset.plTick = "spec:" + i; li.classList.toggle("pl-done", t.spec.has(i)); });
  $$("#sheet ol.steps > li").forEach((li, i) => { li.dataset.plTick = "steps:" + i; li.classList.toggle("pl-done", t.steps.has(i)); });
}

/* ---------- Smarter search ---------- */
// Words that mean the same behind the bar, and words that don't narrow anything down.
const PL_SYN = { whiskey: "whisk", whisky: "whisk", whiskies: "whisk", scotch: "whisk", mocktail: "zero", mocktails: "zero", virgin: "zero", alcoholfree: "zero", "non-alcoholic": "zero",
  nonalcoholic: "zero", "alcohol-free": "zero", coke: "cola", bubbles: "prosecco", fizz: "prosecco", espresso: "espresso", coffee: "espresso", tequilla: "tequila", margarita: "margarita",
  mojitos: "mojito", martinis: "martini", shots: "shot", bombs: "bomb", jager: "jager", bourbon: "bourbon", lime: "lime", passionfruit: "passion", pornstar: "pornstar" };
const PL_STOP = new Set(["a", "an", "the", "and", "with", "something", "some", "drink", "drinks", "please", "of", "in", "for", "me", "i", "want", "like", "any", "cocktail", "cocktails"]);
let PL_VOCAB = null;
const plNorm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
function plVocab() {
  if (PL_VOCAB) return PL_VOCAB;
  const n = new Map();
  for (const d of D) for (const w of d._h.split(/[^a-z0-9']+/)) if (w.length > 2) n.set(w, (n.get(w) || 0) + 1);
  return (PL_VOCAB = [...n]);
}
function plLev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let low = i;
    for (let j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); low = Math.min(low, cur[j]); }
    if (low > max) return max + 1; prev = cur;
  }
  return prev[b.length];
}
// The words to look for, with typos fixed ("espreso martni" finds the Espresso Martini) and what was fixed, to show.
function plQuery(q) {
  if (PL.sq?.q === q) return PL.sq;
  let words = plNorm(q).replace(/alcohol[- ]free|non[- ]alcoholic|no alcohol/g, "zero").split(/[\s,]+/).filter(Boolean);
  const kept = words.filter((w) => !PL_STOP.has(w)); if (kept.length) words = kept;
  const out = [], fixed = [];
  words.forEach((w, i) => {
    w = PL_SYN[w] || w;
    const last = i === words.length - 1;
    if (D.some((d) => d._h.includes(w))) return out.push(w);
    if (w.length > 3 && w.endsWith("s") && D.some((d) => d._h.includes(w.slice(0, -1)))) return out.push(w.slice(0, -1));
    const max = w.length >= 8 ? 2 : w.length >= 4 ? 1 : 0;
    let best = null, bd = max + 1, bf = 0;
    if (max) for (const [v, f] of plVocab()) { const t = last && v.length > w.length ? v.slice(0, w.length + 1) : v; const dd = Math.min(plLev(w, v, max), last ? plLev(w, t, max) : 9); if (dd < bd || (dd === bd && f > bf)) { best = v; bd = dd; bf = f; } }
    if (best && bd <= max) { out.push(best); fixed.push(best); } else out.push(w);
  });
  return (PL.sq = { q, words: out, fixed });
}
// Best first: the name starting with the search, then a word in the name, then the spec, then the rest.
function plRank(rows, words) {
  const score = (d) => { const n = plNorm(d.name); return words.reduce((s, w) => s + (n.startsWith(w) ? 0 : new RegExp("\\b" + w.replace(/[^a-z0-9]/g, "")).test(n) ? 1 : n.includes(w) ? 2 : d.spec.join(" ").toLowerCase().includes(w) ? 3 : 4), 0); };
  return rows.map((d, i) => [d, score(d), i]).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map((x) => x[0]);
}

/* ---------- Filters and sort ---------- */
const PL_SPIRITS = [["vodka", "Vodka"], ["gin", "Gin"], ["rum", "Rum"], ["tequila", "Tequila & mezcal"], ["whisky", "Whisky"], ["brandy", "Brandy"], ["zero", "No alcohol"]];
const PL_HOW = [["Shaken", /shake/], ["Stirred", /\bstir(?!.*short)/], ["Built", null], ["Blended", /blend/], ["Layered", /layer|float/]];
const PL_SORTS = [["menu", "Menu order"], ["az", "A to Z"], ["quick", "Fewest ingredients"], ["light", "Lightest"], ["strong", "Strongest"], ["kcal", "Fewest calories"]];
const plHowOf = (d) => { const m = d.method.toLowerCase(); for (const [k, re] of PL_HOW) if (re && re.test(m)) return k; return "Built"; };
const plBaseOk = (d) => !PL.base || (PL.base === "zero" ? d._k === "zero" || d.tags.includes("No alcohol") : d._b === PL.base || (PL.base === "brandy" && /cognac|brandy|calvados|pisco|hennessy|martell|courvoisier/i.test(d.spec.join(" "))));
const plOk = (d) => (!PL.can || plOutOf(d).ok) && plBaseOk(d) && (!PL.how || plHowOf(d) === PL.how) && (!PL.list || PL.list.names.has(d.name));
function plSort(rows) {
  const by = { az: (a, b) => a.name.localeCompare(b.name), quick: (a, b) => a.spec.length - b.spec.length, light: (a, b) => plFacts(a).units - plFacts(b).units,
    strong: (a, b) => plFacts(b).abv - plFacts(a).abv, kcal: (a, b) => plFacts(a).kcal - plFacts(b).kcal }[PL.sort];
  return by ? rows.slice().sort((a, b) => by(a, b) || a.id - b.id) : rows;
}
const plActive = () => [PL.can && "What we can make", PL.base && PL_SPIRITS.find((x) => x[0] === PL.base)[1], PL.how, PL.sort !== "menu" && PL_SORTS.find((x) => x[0] === PL.sort)[1]].filter(Boolean);
function renderPlf() {
  const box = $("#plf"); if (!box) return;
  const on = plActive(), chips = (list, key, cur) => list.map(([k, l]) => `<button class="chip" data-pl-${key}="${esc(k)}" aria-pressed="${cur === k}">${esc(l)}</button>`).join("");
  box.innerHTML = (PL.list ? `<div class="pl-list"><span>📋 <b translate="no">${esc(PL.list.name)}</b> · ${PL.list.names.size} ${PL.list.names.size === 1 ? "drink" : "drinks"}</span><button class="chip" data-pl="savelist">☆ Save to favourites</button><button class="chip" data-pl="endlist" aria-label="Close the list">✕</button></div>` : "")
    + `<div class="pl-bar"><button class="chip pl-fbtn" data-pl="filters" aria-expanded="${PL.open}">Filter and sort${on.length ? ` <span>(${on.length})</span>` : ""}</button>${on.length && !PL.open ? on.map((l) => `<span class="chip pl-on">${esc(l)}</span>`).join("") + `<button class="chip" data-pl="clear">Clear</button>` : ""}</div>`
    + (PL.open ? `<div class="pl-panel">${plOutKeys().size ? `<div class="mini">Tonight</div><div class="chips hrow"><button class="chip" data-pl-can aria-pressed="${PL.can}">Hide what we can't make</button></div>` : ""}<div class="mini">Spirit</div><div class="chips hrow">${chips(PL_SPIRITS, "base", PL.base)}</div>
      <div class="mini">How it's made</div><div class="chips hrow">${chips(PL_HOW.map(([k]) => [k, k]), "how", PL.how)}</div>
      <div class="mini">Sort</div><div class="chips hrow">${chips(PL_SORTS, "sort", PL.sort)}</div>
      <div class="pl-row"><button class="btn" data-pl="clear">Clear all</button><button class="btn pri" data-pl="filters">Done</button></div></div>` : "");
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("#plf button"); if (!b) return;
  const ds = b.dataset;
  if ("plCan" in ds) PL.can = !PL.can;
  else if (ds.plBase) PL.base = PL.base === ds.plBase ? null : ds.plBase;
  else if (ds.plHow) PL.how = PL.how === ds.plHow ? null : ds.plHow;
  else if (ds.plSort) { PL.sort = ds.plSort; store.set("sort", PL.sort); }
  else if (ds.pl === "filters") PL.open = !PL.open;
  else if (ds.pl === "clear") { PL.base = PL.how = null; PL.can = false; PL.sort = "menu"; store.set("sort", "menu"); }
  else if (ds.pl === "endlist") { PL.list = null; if (location.hash.startsWith("#list=")) history.replaceState(null, "", location.pathname + location.search); }
  else if (ds.pl === "savelist") { for (const n of PL.list.names) fav.add(n); store.set("fav", [...fav]); renderChips(); toast(`${PL.list.names.size} drinks in your favourites`); return; }
  haptic(); renderList();
});

/* ---------- Spec of the day ---------- */
// The same drink for the whole team, changing at midnight UK time: one spec a day to know by heart.
function plDaily() {
  const pool = D.filter((d) => d._k === "cocktail" && !isOut(d.name) && plOutOf(d).ok); if (!pool.length) return null;
  const day = ukDay(Date.now()); let h = 0; for (const c of day) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return pool[(h * 7 + Math.floor(Date.parse(day) / 864e5)) % pool.length];
}
function plDailyHtml() {
  const d = plDaily(); if (!d) return "";
  const f = plFacts(d);
  return `<button class="pl-daily" data-pl-daily="${d.id}"><span class="g" aria-hidden="true">${glass(d)}</span><span class="t"><span class="k">Spec of the day</span><b translate="no">${esc(d.name)}</b><small translate="no">${esc(d.spec.slice(0, 4).join(" · "))}${d.spec.length > 4 ? " …" : ""}</small><small>${f.free ? "Alcohol-free" : `${plU(f.units)} units · ≈${plPct(f.abv)}`} · ≈${plRound(f.kcal)} kcal</small></span><span class="go" aria-hidden="true">›</span></button>`;
}

/* ---------- Spec card pictures ---------- */
// A tidy card for WhatsApp or the camera roll, drawn on the phone: name, spec, glass, ice, garnish and method.
let PL_FONT = null;
async function plFont() {
  if (PL_FONT) return PL_FONT;
  try { const f = new FontFace("BBOswald", `url(${CHEAT_FONT})`); await f.load(); document.fonts.add(f); PL_FONT = "BBOswald"; } catch { PL_FONT = "Impact"; }
  return PL_FONT;
}
async function plCardBlob(d, n = 1) {
  const font = await plFont(), W = 1080, c = document.createElement("canvas"), x = c.getContext("2d");
  const keep = mult; mult = n;
  const sl = d.spec.map((l) => { const m = l.replace(/^batch:\s*/i, "").match(QTY); return m ? [plOz(scaleQ(m[1])), m[2]] : ["", l]; });
  mult = keep;
  const steps = methodLines(d.method);
  x.font = "34px sans-serif";
  const wrap = (t, w, f) => { x.font = f; const out = []; let cur = ""; for (const word of t.split(" ")) { const tt = cur ? cur + " " + word : word; if (x.measureText(tt).width > w && cur) { out.push(cur); cur = word; } else cur = tt; } if (cur) out.push(cur); return out; };
  const body = "34px system-ui, -apple-system, sans-serif", small = "28px system-ui, -apple-system, sans-serif";
  const stepLines = steps.flatMap((s, i) => wrap(`${i + 1}. ${s}`, W - 160, body));
  const H = Math.max(1080, 420 + plOutOf(d).miss.length * 90 + sl.length * 58 + 70 + stepLines.length * 46 + 220);
  c.width = W; c.height = H;
  x.fillStyle = "#15130f"; x.fillRect(0, 0, W, H);
  x.fillStyle = "#e0ad4f"; x.fillRect(0, 0, W, 14);
  x.fillStyle = "#e0ad4f"; x.font = `40px ${font}`; x.fillText("BLACK TAP BAR BOOK", 80, 96);
  x.fillStyle = "#f4eee4"; let y = 190;
  for (const l of wrap(d.name.toUpperCase(), W - 160, `92px ${font}`)) { x.font = `92px ${font}`; x.fillText(l, 80, y); y += 100; }
  x.fillStyle = "#b3a998"; x.font = small; x.fillText(`${d.glass} · Ice: ${d.ice}${n > 1 ? ` · for ${n}` : ""}`.slice(0, 70), 80, y); y += 70;
  // Tonight's swaps, in the warning colour, so the card matches what's on the bar.
  x.fillStyle = "#e0ad4f"; for (const l of plOutLines(d).flatMap((t) => wrap(t.replace(/^⚠️ /, "! "), W - 160, small))) { x.font = small; x.fillText(l, 80, y); y += 40; }
  if (plOutOf(d).miss.length) y += 20;
  for (const [q, r] of sl) {
    x.fillStyle = "#e0ad4f"; x.font = `40px ${font}`; x.fillText(q || "•", 80, y);
    x.fillStyle = "#f4eee4"; x.font = body; x.fillText(r.length > 44 ? r.slice(0, 43) + "…" : r, 330, y); y += 58;
  }
  y += 20; x.fillStyle = "#e0ad4f"; x.font = `36px ${font}`; x.fillText("METHOD", 80, y); y += 52;
  x.fillStyle = "#f4eee4"; x.font = body; for (const l of stepLines) { x.fillText(l, 80, y); y += 46; }
  y += 20; x.fillStyle = "#b3a998"; x.font = small; x.fillText(`Garnish: ${d.garnish}`.slice(0, 66), 80, y); y += 44;
  const f = plFacts(d);
  x.fillText(f.free ? "Alcohol-free" : `About ${plU(f.units * n)} UK units · ≈${plPct(f.abv)} in the glass · ≈${plRound(f.kcal * n)} kcal`, 80, y);
  x.fillStyle = "#e0ad4f"; x.fillRect(0, H - 14, W, 14);
  return new Promise((ok) => c.toBlob(ok, "image/png"));
}
async function plShareCard(d) {
  const blob = await plCardBlob(d, mult), file = new File([blob], `${d.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`, { type: "image/png" });
  try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file] }); return; } } catch (e) { if (e?.name === "AbortError") return; }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast("Picture saved");
}
// Print one drink as a card for the well, A6 size.
function plPrintCard(d) {
  const w = window.open("", "_blank"); if (!w) return toast("Allow pop-ups to print");
  const st = methodLines(d.method).map((s) => `<li>${esc(s)}</li>`).join("");
  w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(d.name)}</title><style>@page{size:A6;margin:8mm}body{font:12pt system-ui,sans-serif;margin:0;color:#111}h1{font:700 22pt Impact,'Arial Narrow',sans-serif;margin:0 0 2mm;text-transform:uppercase}p{margin:0 0 3mm;color:#444}table{border-collapse:collapse;width:100%;margin-bottom:3mm}td{padding:1.2mm 0;border-bottom:.2mm solid #ccc}td:first-child{font-weight:700;white-space:nowrap;padding-right:4mm}ol{padding-left:5mm;margin:0 0 3mm}small{color:#666}</style>
    <h1>${esc(d.name)}</h1><p>${esc(d.glass)} · Ice: ${esc(d.ice)} · Garnish: ${esc(d.garnish)}</p>${plOutLines(d).map((l) => `<p><b>${esc(l)}</b></p>`).join("")}
    <table>${d.spec.map((l) => { const m = l.match(QTY); return `<tr><td>${esc(m ? plOz(m[1]) : "")}</td><td>${esc(m ? m[2] : l)}</td></tr>`; }).join("")}</table><ol>${st}</ol>${d.allergens && d.allergens !== "None" ? `<p><b>Allergens:</b> ${esc(d.allergens)}</p>` : ""}<small>Black Tap Bar Book</small><script>onload=()=>{print()}<\/script>`);
  w.document.close();
}

/* ---------- Shareable lists ---------- */
// A link that opens the Bar Book on just these drinks: tonight's specials, a practice set, the drinks for a party.
// It carries the names, so it keeps working when drinks are added. The QR code is for a poster behind the bar.
const QR_URL = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js";
const plSlug = (n) => n.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const PL_BY_SLUG = new Map(D.map((d) => [plSlug(d.name), d]));
const plListUrl = (name, ids) => `${location.origin}${location.pathname}#list=${encodeURIComponent(name.trim() || "Drinks list")}~${ids.map((id) => plSlug(D[id].name)).join(".")}`;
function plOpenList(hash) {
  const m = hash.match(/^#list=([^~]*)~(.+)$/); if (!m) return false;
  const names = new Set(m[2].split(".").map((s) => PL_BY_SLUG.get(s)?.name).filter(Boolean));
  if (!names.size) return false;
  PL.list = { name: decodeURIComponent(m[1]) || "Drinks list", names };
  sec = "All"; flav = null; $("#q").value = ""; renderChips(); show("drinks"); renderList();
  return true;
}
let plQrLib = null;
const plQr = () => plQrLib || (plQrLib = new Promise((ok, no) => { const s = document.createElement("script"); s.src = QR_URL; s.onload = () => ok(window.qrcode); s.onerror = () => { plQrLib = null; no(); }; document.head.append(s); }));
function openListMaker(ids) {
  if ($("#sheet").hidden) lastFocus = document.activeElement;
  const name = PL.list?.name || (sec !== "All" ? sec.replace(/^★ /, "") : "Tonight's drinks");
  $("#sheet").innerHTML = `<div class="sheet-top"><div class="bar1"><button class="back" id="sh-close">‹ Back</button><span class="t">Share as a list</span><span></span></div></div>
    <div id="pl-lm"><p class="lead" style="margin-top:12px">A link that opens the Bar Book on just these ${ids.length} drinks. Good for tonight's specials, a practice set or a party.</p>
    <label class="fld">Name of the list<input id="pl-ln" maxlength="60" value="${esc(name)}"></label>
    <ul class="pl-names" translate="no">${ids.map((id) => `<li>${esc(D[id].name)}</li>`).join("")}</ul>
    <div class="actions"><button class="btn pri" data-pl-l="copy">Copy link</button><a class="btn" data-pl-l="wa" href="https://wa.me/" target="_blank" rel="noopener">WhatsApp</a>${navigator.share ? `<button class="btn" data-pl-l="share">Share</button>` : ""}</div>
    <div class="sec">QR code</div><div id="pl-qr" class="pl-qr"><p class="note">Making the QR code…</p></div>
    <p class="note">Anyone with the Bar Book link can open it. It shows specs only: nothing from the team.</p></div>`;
  showSheet(false); $("#sheet").scrollTop = 0;
  const url = () => plListUrl($("#pl-ln").value, ids);
  const wa = () => { $("[data-pl-l=wa]").href = "https://wa.me/?text=" + encodeURIComponent(`*${$("#pl-ln").value.trim() || "Drinks list"}*\n${ids.map((id) => `• ${D[id].name}`).join("\n")}\n\n${url()}`); };
  const qr = async () => {
    try { const q = (await plQr())(0, "M"); q.addData(url()); q.make(); $("#pl-qr").innerHTML = `<img alt="QR code for the list" src="${q.createDataURL(8, 16)}"><a class="btn" download="${plSlug($("#pl-ln").value || "list")}-qr.gif" href="${q.createDataURL(10, 20)}">Save the QR code</a>`; }
    catch { $("#pl-qr").innerHTML = `<p class="note">The QR code needs the internet. The link works without it.</p>`; }
  };
  wa(); qr();
  $("#pl-ln").addEventListener("input", () => { wa(); clearTimeout(qr.t); qr.t = setTimeout(qr, 400); });
  $("#pl-lm").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-pl-l]"); if (!b) return;
    if (b.dataset.plL === "copy") { try { await navigator.clipboard.writeText(url()); toast("Link copied"); } catch { prompt("Copy the link", url()); } }
    if (b.dataset.plL === "share") { try { await navigator.share({ title: $("#pl-ln").value, url: url() }); } catch {} }
  });
}

/* ---------- My drinks: your own recipes, on this phone ---------- */
// For the drinks you've come up with, or a guest's favourite that isn't on the menu. Never shared unless you send it.
const MINE_KEY = "mine";
const mineAll = () => store.get(MINE_KEY, []);
function mineCard(x) {
  return `<div class="bt-card pl-mine"><div class="n"><span translate="no">${esc(x.name)}</span><span class="abv">${esc(x.how)}</span></div>
    <div class="bt-note" translate="no">${esc(x.glass)}${x.garnish ? ` · Garnish: ${esc(x.garnish)}` : ""}</div>
    <ul class="spec" translate="no">${x.spec.map(specRow).join("")}</ul>${x.note ? `<p class="note" translate="no">${esc(x.note)}</p>` : ""}
    <div class="mk-row2"><button class="btn" data-mine-send="${esc(x.id)}">Send</button><button class="btn" data-mine-edit="${esc(x.id)}">Edit</button><button class="btn" data-mine-del="${esc(x.id)}">Delete</button></div></div>`;
}
function minePane(edit) {
  const all = mineAll(), x = edit ? all.find((m) => m.id === edit) || {} : {};
  return `<button class="btn" data-mk-pane="make" style="margin-top:4px">‹ Back to Make</button>
    <p class="lead">Your own drinks and guests' favourites that aren't on the menu. Kept on this phone; send one to the group when it's ready.</p>
    ${all.map(mineCard).join("") || `<p class="empty" style="padding:8px 0">None yet. Add your first one below.</p>`}
    <form id="mine-form" class="pl-form"><div class="sec">${x.id ? "Edit" : "Add a drink"}</div>
      <input type="hidden" name="mid" value="${esc(x.id || "")}">
      <label class="fld">Name<input name="name" required maxlength="60" value="${esc(x.name || "")}"></label>
      <label class="fld">Spec, one line each (like 50 ml vodka)<textarea name="spec" rows="5" required placeholder="50 ml Smirnoff&#10;25 ml lime juice&#10;20 ml sugar syrup">${esc((x.spec || []).join("\n"))}</textarea></label>
      <label class="fld">How it's made<select name="how">${["Shaken", "Stirred", "Built", "Blended", "Layered"].map((h) => `<option${x.how === h ? " selected" : ""}>${h}</option>`).join("")}</select></label>
      <label class="fld">Glass and ice<input name="glass" maxlength="60" placeholder="Rocks, cubed ice" value="${esc(x.glass || "")}"></label>
      <label class="fld">Garnish<input name="garnish" maxlength="60" value="${esc(x.garnish || "")}"></label>
      <label class="fld">Notes<textarea name="note" rows="2" maxlength="300">${esc(x.note || "")}</textarea></label>
      <button class="btn pri wide" type="submit">${x.id ? "Save changes" : "Save to My drinks"}</button></form>`;
}
SHARE.mine = (id) => {
  const x = mineAll().find((m) => m.id === id); if (!x) return null;
  return { what: x.name, title: x.name, head: [`Glass: ${x.glass || "Any"}`, `How: ${x.how}`, ...(x.garnish ? [`Garnish: ${x.garnish}`] : [])],
    parts: [{ id: "spec", label: "Spec", lines: x.spec }, { id: "note", label: "Notes", one: true, lines: x.note ? [x.note] : [], opt: true }] };
};
document.addEventListener("submit", (e) => {
  if (e.target.getAttribute("id") !== "mine-form") return;
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target)), spec = f.spec.split("\n").map((l) => l.trim()).filter(Boolean);
  if (!f.name.trim() || !spec.length) return toast("Give it a name and at least one spec line");
  const all = mineAll(), x = { id: f.mid || Date.now().toString(36), name: f.name.trim(), spec, how: f.how, glass: f.glass.trim(), garnish: f.garnish.trim(), note: f.note.trim() };
  const i = all.findIndex((m) => m.id === x.id); if (i >= 0) all[i] = x; else all.unshift(x);
  store.set(MINE_KEY, all.slice(0, 200)); toast(`${x.name} saved`); $("#mk-pane").innerHTML = minePane(); window.scrollTo(0, 0);
});
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-mine-send],[data-mine-edit],[data-mine-del]"); if (!b) return;
  const ds = b.dataset;
  if (ds.mineSend) return openSend("mine", ds.mineSend);
  if (ds.mineEdit) { $("#mk-pane").innerHTML = minePane(ds.mineEdit); $("#mine-form").scrollIntoView({ block: "start" }); return; }
  if (ds.mineDel && confirm("Delete this drink from this phone?")) { store.set(MINE_KEY, mineAll().filter((m) => m.id !== ds.mineDel)); $("#mk-pane").innerHTML = minePane(); }
});

/* ---------- Common mistakes ---------- */
// What goes wrong on a busy night, from how the drink is built, plus the house points on the drinks guests order most.
const PL_TIPS = {
  "Pornstar Martini": "The Prosecco goes on the side in a shot glass, never in the drink.",
  "Espresso Martini": "Pull the espresso just before you shake: old coffee won't foam. Three beans on top, not two.",
  "Negroni": "Equal parts, stirred over ice. Never shaken.",
  "Old Fashioned": "Stir the sugar and bitters in first, then the bourbon a bit at a time over the large cube.",
  "Aperol Spritz": "Prosecco first, then the Aperol, a splash of soda last. A glass full of ice so it doesn't go flat and warm.",
  "Mojito": "Press the mint gently: shredded mint turns bitter. Churn with crushed ice, then cap with more.",
  "Margarita": "Salt on the outside of the rim only, so it doesn't fall into the drink.",
  "Long Island Iced Tea": "Five spirits at 10 ml each, not 25: it's already 50 ml of spirit. Just a splash of cola for the colour.",
  "Piña Colada": "Shake hard so the coconut whips. Don't skimp on the pineapple juice.",
  "Dry Martini": "Stir, never shake. A chilled glass and a fresh lemon twist or olive.",
  "Dirty Martini": "Stir, and taste the brine first: some jars are much saltier than others.",
  "Cosmopolitan": "Shake hard and double strain into a chilled glass. Cranberry is for colour, not volume.",
  "Whiskey Sour": "Dry shake first for the foam, then shake again with ice.",
  "Jägerbomb": "Half a can of Red Bull in the rocks glass, the Jäger in the shot glass beside it. The guest drops it, not you.",
  "Baby Guinness": "Layer the Baileys slowly over the back of a bar spoon so it sits on top like a head.",
  "B-52": "Pour slowly over the back of a bar spoon, heaviest first: Kahlúa, Baileys, then Grand Marnier.",
};
function plMistakes(d) {
  const t = [], m = d.method.toLowerCase(), sp = d.spec.join(" ").toLowerCase();
  if (PL_TIPS[d.name]) t.push(PL_TIPS[d.name]);
  if (/stir/.test(m) && !/short stir|stir gently/.test(m) && !/shake/.test(m)) t.push("Stir it, don't shake: shaking clouds it and waters it down.");
  if (/foamer|egg white|aquafaba/.test(sp) && /dry shake/.test(m)) t.push("Dry shake without ice first, or there's no foam.");
  if (/double strain/.test(m)) t.push("Double strain: no ice chips or bits in the glass.");
  if (/^chilled/i.test(d.glass)) t.push("Chill the glass first. A warm glass warms the drink.");
  if (/(^| )top|prosecco|soda|tonic|lemonade|ginger beer|cola/.test(sp) && !/shake.*top|shake.*soda/.test(m) && /shake/.test(m)) t.push("Never shake the fizz: add it last, in the glass.");
  if (/mint/.test(sp) && /muddle|press|churn/.test(m)) t.push("Press the mint, don't shred it.");
  if (/layer|float/.test(m)) t.push("Pour slowly over the back of a bar spoon so the layers sit.");
  if (/12\.5 ml/.test(sp)) t.push("12.5 ml is half a 25 ml jigger. Jigger it, don't free-pour.");
  if (/large cube/i.test(d.ice)) t.push("One large cube, not cubed ice: it melts slower.");
  if (/salt rim|sugar rim/i.test(d.glass)) t.push("Rim the outside of the glass only.");
  return [...new Set(t)].slice(0, 3);
}
const plMistakesHtml = (d) => { const t = plMistakes(d); return t.length ? `<div class="pl-tips"><b>Common mistakes</b><ul>${t.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""; };

/* ---------- New starter path ---------- */
// The eight house cocktails: learn each one (step by step, then tick it), take a 10-question test on them, pass at 8.
// The pass goes to the manager (To the manager) and can be posted on WhatsApp. Nothing else leaves the phone.
const ST_PASS = 8;
const stDrinks = () => D.filter((d) => d.section === "Black Tap Signatures");
const stState = () => ({ learnt: [], best: null, passed: null, told: false, ...store.get("starter", {}) });
const stSet = (x) => store.set("starter", x);
function renderStarter() {
  const s = stState(), ds = stDrinks(), n = ds.filter((d) => s.learnt.includes(d.name)).length, ready = n === ds.length;
  $("#pstart").innerHTML = `<div class="card" style="text-align:left"><h2 style="font-size:26px">New starter</h2>
    <p class="note">Learn our ${ds.length} house cocktails, then pass a 10-question test (${ST_PASS} or more).</p>
    <div class="cprog"><b>${s.passed ? "Passed" : `${n} of ${ds.length} learnt`}</b><span class="dots" aria-hidden="true">${ds.map((d) => `<i class="${s.learnt.includes(d.name) ? "ok" : ""}"></i>`).join("")}</span></div>
    <div class="sec">1. Learn each one</div>
    ${ds.map((d) => `<div class="st-row"><button class="st-n" data-st-open="${d.id}"><span class="g" aria-hidden="true">${glass(d)}</span><span translate="no">${esc(d.name)}</span></button><label class="check"><input type="checkbox" data-st-learnt="${esc(d.name)}"${s.learnt.includes(d.name) ? " checked" : ""}> I know it</label></div>`).join("")}
    <div class="sec">2. Take the test</div>
    ${s.best != null ? `<p class="qz-got">Best so far: ${s.best} out of 10${s.passed ? `, passed ${new Date(s.passed).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}.</p>` : ""}
    <button class="btn${ready ? " pri" : ""} wide" data-qz="starter"${ready ? "" : " disabled"}>${ready ? (s.best != null ? "Take the test again" : "Start the test") : `Tick all ${ds.length} first`}</button>
    ${s.passed ? stPassHtml(s) : ""}</div>`;
}
function stPassHtml(s) {
  return `<div class="sec">3. Tell the manager</div>
    <div class="actions">${LIVE.me && !s.told ? `<button class="btn pri" data-st-tell>Tell ${esc(mgrName())}</button>` : ""}${sendBtn("starter", "Post it on WhatsApp")}</div>
    ${s.told ? `<p class="note">${esc(mgrName())} has been told.</p>` : ""}`;
}
SHARE.starter = () => {
  const s = stState(); if (!s.passed) return null;
  return { what: "New starter: passed", title: "New starter test passed ✅", head: [`${LIVE.me || "I"}: ${s.best} out of 10 on the ${stDrinks().length} house cocktails`],
    parts: [{ id: "list", label: "Learnt", lines: stDrinks().map((d) => `✅ ${d.name}`) }] };
};
function stStartQuiz() {
  qz = { night: false, first: false, starter: true, day: shiftDay(), qs: quizMake(stDrinks(), Math.random), i: 0, picks: [] };
  renderPractice();
}
function stResult(right) {
  const s = stState(), first = s.best == null || right > s.best;
  if (first) s.best = right;
  if (right >= ST_PASS && !s.passed) s.passed = Date.now();
  stSet(s);
  return right >= ST_PASS ? `<p class="qz-got">Passed. ${right} out of 10.</p>${stPassHtml(stState())}` : `<p class="qz-got">${ST_PASS} out of 10 to pass. Go over the ones you missed, then try again.</p>`;
}
document.addEventListener("click", async (e) => {
  const o = e.target.closest("[data-st-open]"); if (o) { view = "steps"; store.set("view", view); openSheet(+o.dataset.stOpen); return; }
  const t = e.target.closest("[data-st-tell]");
  if (t) {
    const s = stState(); t.disabled = true;
    try { await LIVE.api.ask({ kind: "other", text: `New starter path passed: ${s.best} out of 10 on the ${stDrinks().length} house cocktails.`, when: "", anon: false }); s.told = true; stSet(s); toast(`${mgrName()} has been told`); }
    catch { t.disabled = false; toast("Not sent. Try again"); }
    if (qz?.starter) renderPractice(); else renderStarter();
  }
});
document.addEventListener("change", (e) => {
  const c = e.target.closest("[data-st-learnt]"); if (!c) return;
  const s = stState(), n = c.dataset.stLearnt;
  s.learnt = c.checked ? [...new Set([...s.learnt, n])] : s.learnt.filter((x) => x !== n); stSet(s); haptic(); renderStarter();
});

/* ---------- Rush: the ten that sell, one screen ---------- */
const RUSH_DEFAULT = ["Pornstar Martini", "Espresso Martini", "London Cosmo", "Mojito", "Aperol Spritz", "Margarita", "Salted Caramel Buzz", "Piña Colada", "Uptown Hustle", "Long Island Iced Tea"];
const rushNames = () => store.get("rush", RUSH_DEFAULT).filter((n) => D.some((d) => d.name === n));
function rushHtml() {
  if (RAPID.rushEdit) {
    const on = new Set(rushNames()), pool = [...new Set(RAPID_GROUPS.flatMap(([, f]) => rapidList(f)))];
    return `<p class="lead">Pick your bar's ten best sellers (${on.size} of 10). Saved on this phone.</p>
      <div class="rush-pick">${pool.map((d) => `<label class="check"><input type="checkbox" data-rush-pick="${esc(d.name)}"${on.has(d.name) ? " checked" : ""}${!on.has(d.name) && on.size >= 10 ? " disabled" : ""}> <span translate="no">${esc(d.name)}</span></label>`).join("")}</div>
      <div class="actions"><button class="btn pri" data-rush="done">Done</button><button class="btn" data-rush="reset">Back to the usual ten</button></div>`;
  }
  const ds = rushNames().map((n) => D.find((d) => d.name === n));
  RAPID.ids = ds.map((d) => d.id);
  return `<div class="rush">${ds.map((d) => `<button class="rush-card${isOut(d.name) ? " out" : ""}" data-rp="${d.id}"><span class="n" translate="no">${esc(d.name)}${isOut(d.name) ? " <i>86'd</i>" : ""}</span>${isOut(d.name) ? "" : plOutTag(d)}<span class="s" translate="no">${esc(rapidSpec(d))}</span><span class="m" translate="no">${esc(d.glass)} · ${esc(d.ice)} · ${esc(d.method)}</span></button>`).join("")}</div>
    <button class="btn wide" data-rush="edit" style="margin-top:8px">Change the ten</button><p class="note">The screen stays on while Rush is open.</p>`;
}
document.head.insertAdjacentHTML("beforeend", `<style>
.rush{display:grid;gap:8px;margin-top:8px}
.rush-card{display:block;width:100%;text-align:left;background:var(--surface);border:1px solid var(--line);border-left:4px solid var(--brass);border-radius:12px;padding:12px 14px;color:var(--fg)}
.rush-card .n{display:block;font-family:var(--display);font-size:24px;text-transform:uppercase;line-height:1.05}
.rush-card .s{display:block;font-size:17px;font-weight:700;margin-top:4px;line-height:1.35}
.rush-card .m{display:block;font-size:13.5px;color:var(--muted);margin-top:4px}
.rush-card.out{opacity:.55}.rush-card i{font-style:normal;font-size:13px;color:var(--warn)}
.rush-pick{columns:2;column-gap:12px}.rush-pick .check{break-inside:avoid}
.pl-tips{border:1px solid var(--warn);border-radius:12px;padding:10px 12px;margin-top:14px}
.pl-tips b{color:var(--warn);font-size:13px;text-transform:uppercase;letter-spacing:.05em}.pl-tips ul{margin:6px 0 0;padding-left:18px}.pl-tips li{margin:3px 0}
.st-row{display:flex;align-items:center;justify-content:space-between;gap:8px;border-bottom:1px solid var(--line);padding:6px 0}
.st-n{display:flex;align-items:center;gap:10px;color:var(--fg);font-weight:700;text-align:left}.st-n .g{width:30px;height:36px}.st-n .g svg{width:100%;height:100%}
.st-row .check{margin:0;white-space:nowrap}
</style>`);
