/* ---------- Add anything new: the app works out where it goes ----------
   Type what it is (Rubicon Mango, fresh strawberries, Funkin passion fruit). The phone reads the name, looks it up on
   Wikipedia (free, no key, no account) to see what kind of thing it is, and fills in where it's kept, whether it needs a
   date label and what happens to it at close. The person adding it checks that and changes anything that's wrong.
   Maintenance's own go on every list straight away; everyone else's wait for Maintenance to check them. Once it's on,
   it's on the 86 list and restocking under its group, on the date labels (with its days, or on Black Tap's list for a
   manager to fill them in from the pack), and on the side's closing page under what to do with it at close. It never
   makes a second copy of anything: a name already on the stock list, the drinks or the added items is refused.
   Days are only filled in where the venue's own rule gives them (desserts, opened today plus 2): everything else waits
   for whoever has the pack in their hand, the same as the date labels. */
// What each kind of thing is, which side it's for, where it's kept, whether it gets a date label, what happens at
// close, and a tip for the person closing. life is days once opened, only where the venue's own rule says so.
var IT_KINDS = {
  fresh: { t: "Fresh fruit, herb or garnish", side: "bar", store: "fridge", label: true, close: "cover", tip: "Cut garnish left over: bin it. Whole fruit and prepped tubs: cover, label, fridge." },
  dairy: { t: "Milk, cream or eggs", side: "bar", store: "fridge", label: true, close: "fridge", tip: "Straight back in the fridge, lid on." },
  juice: { t: "Juice", side: "bar", store: "fridge", label: true, close: "fridge", tip: "Opened: lid on, label, fridge." },
  puree: { t: "Purée", side: "bar", store: "fridge", label: true, close: "fridge", tip: "Opened: lid on, label, fridge." },
  prep: { t: "House-made syrup or prep", side: "bar", store: "fridge", label: true, close: "fridge", tip: "Label it the day it's made." },
  syrup: { t: "Bought syrup, cordial or bitters", side: "bar", store: "backbar", label: false, close: "keep", tip: "Some say “refrigerate once opened”: check the bottle." },
  soft: { t: "Soft drink, mixer or water", side: "bar", store: "bottle", label: false, close: "keep", tip: "Opened bottle or can left over: bin it. Restock the fridge." },
  beer: { t: "Beer", side: "bar", store: "bottle", label: false, close: "keep", tip: "Restock the fridge." },
  cider: { t: "Cider", side: "bar", store: "bottle", label: false, close: "keep", tip: "Restock the fridge." },
  wine: { t: "Wine or sparkling wine", side: "bar", store: "fridge", label: true, close: "fridge", tip: "Opened: stopper on, label, fridge." },
  vermouth: { t: "Vermouth or other wine-based aperitif", side: "bar", store: "fridge", label: true, close: "fridge", tip: "Opened: cap on, label, fridge." },
  spirit: { t: "Spirit", side: "bar", store: "backbar", label: false, close: "keep", tip: "Cap on, pourer covered." },
  liqueur: { t: "Liqueur or aperitif", side: "bar", store: "backbar", label: false, close: "keep", tip: "Cap on. Cream liqueurs: check the bottle for the fridge." },
  coffee: { t: "Coffee, tea or hot chocolate", side: "bar", store: "ambient", label: true, close: "keep", tip: "Opened bag: clip it shut." },
  dessert: { t: "Cake or dessert", side: "floor", store: "fridge", label: true, life: 2, close: "cover", tip: "Cover it, label it, fridge. Opened today plus 2 days." },
  sauce: { t: "Sauce, frosting or spread", side: "floor", store: "fridge", label: true, close: "fridge", tip: "Lid on, label, fridge." },
  topping: { t: "Shake topping, biscuit or sweet", side: "floor", store: "ambient", label: true, close: "keep", tip: "Lid on tight." },
  icecream: { t: "Ice cream", side: "floor", store: "freezer", label: true, close: "keep", tip: "Lid on, back in the freezer." },
  supplies: { t: "Supplies (not food or drink)", side: "bar", store: "ambient", label: false, close: "keep", tip: "" },
  other: { t: "Something else", side: "bar", store: "ambient", label: false, close: "keep", tip: "" },
};
// Shelf life when the maker doesn't print one (facts.js has the makers' own): where it lives and how long it typically
// keeps once opened, from the venue's own rules or a reputable source (checked 17 Nov 2026). Typical only: the date on
// the pack always wins. days fills in the date label's days; no days means "read the pack".
var IT_KEEP = [
  [/maraschino|cocktail cherr/, { fridge: true, days: 28, say: "Venue rule: 4 weeks once opened" }],
  [/vermouth|martini (rosso|bianco|extra dry)/, { fridge: true, days: 30, say: "Vermouth: fridge once opened, about a month" }],
  [/giffard|1883|torani/, { fridge: false, say: "Syrups: room temperature, months with the cap on. The bottle says how long" }],
  [/prosecco|champagne|cava|sparkling/, { fridge: true, say: "Opened fizz: stopper on, fridge, use it the next day or two" }],
];
var IT_KEEP_KIND = {
  fresh: { fridge: true, say: "Cut fruit and garnish: use it the same day. Whole: fridge" }, dairy: { fridge: true, say: "Fridge. Days once opened: on the pack" },
  juice: { fridge: true, say: "Fridge once opened. Days: on the pack" }, puree: { fridge: true, say: "Fridge once opened. Days: on the pack" },
  prep: { fridge: true, say: "Fridge. Date it the day it's made" }, syrup: { fridge: false, say: "Room temperature unless the bottle says fridge" },
  soft: { fridge: false, say: "Sealed: the date on the can or bottle. Opened: bin it at close" }, beer: { fridge: false, say: "Sealed: the date on the bottle" }, cider: { fridge: false, say: "Sealed: the date on the bottle" },
  wine: { fridge: true, say: "Opened: stopper on, fridge" }, vermouth: { fridge: true, say: "Fridge once opened" }, spirit: { fridge: false, say: "Keeps for years with the cap on" },
  liqueur: { fridge: false, say: "Keeps a long time with the cap on. Cream liqueurs: check the bottle" }, coffee: { fridge: false, say: "Opened bag: clip it shut, use it within a few weeks" },
  dessert: { fridge: true, days: 2, say: "Venue rule: opened today plus 2 days" }, sauce: { fridge: true, say: "Fridge once opened. Days: on the pack" },
  topping: { fridge: false, say: "Lid on. Days: on the pack" }, icecream: { fridge: false, say: "Freezer, lid on" }, supplies: null, other: null,
};
// The shelf life for something by name (and kind, when it's known): the maker's own guidance first (facts.js), then the
// typical. A name's own line only counts while it's still that kind of thing: Funkin changed to "dessert" keeps a
// dessert's days.
function itKeep(name, kind) {
  const t = ` ${name.toLowerCase()} `, own = itKindOf(name) || itKindOf(name, true), same = !kind || !own || own === kind;
  const mk = same && factKeep(name);
  if (mk) return { fridge: !!mk.f, days: mk.d || 0, say: `${mk.n}, the maker says: ${mk.t}`, maker: true };
  const hit = same && IT_KEEP.find(([re]) => re.test(t));
  return hit ? hit[1] : IT_KEEP_KIND[kind || own] || null;
}
function itKeepHtml(name, kind) {
  const k = itKeep(name, kind), f = factOf(name); if (!k && !f) return "";
  const set = (LIVE.labels || []).filter((x) => itNorm(x.item) === itNorm(name)).map((x) => `${sideName(x.side)}: keeps ${nDays(x.life)} once opened (set on Labels, this wins)`);
  return `<div class="it-keep">${k ? `<b>Shelf life</b> · ${k.fridge ? "Fridge once opened" : "No fridge needed"}<div class="s">${esc(k.say)}. ${k.maker ? "Maker's guidance" : "Typical only"}: the date on the pack always wins.</div>` : ""}${set.length ? `<div class="s">${esc(set.join(" · "))}</div>` : ""}
    ${f ? `<button class="linkbtn" data-fx-open="${esc(name)}">What the maker says: size, allergens, what's in it ›</button>` : ""}</div>`;
}
var IT_STORE = { fridge: "Fridge", bottle: "Bottle fridge", backbar: "Back bar", ambient: "Dry store or shelf", freezer: "Freezer", cellar: "Cellar" };
var IT_CLOSE = { keep: "Leave it where it lives", fridge: "Back in the fridge", cover: "Cover, label and fridge", bin: "Bin it" };
// How to tell what something is, first match wins. Strong words decide on the name alone ("juice", "purée", a brand).
// A fruit or herb on its own (weak) might only be a flavour (Rubicon Mango), so what's found online comes first.
var IT_RULES = [
  [/\b(cake|brownie|cheesecake|sponge|dessert|tart|cookie sandwich|oreo sandwich|black velvet)/, "dessert"],
  [/ice ?cream|gelato|sorbet|ben (&|and) jerry|h[äa]agen|magnum/, "icecream"],
  [/\b(sauce|ketchup|mayo|mayonnaise|mustard|frosting|coulis|philadelphia|cream cheese|spread|condiment)/, "sauce"],
  [/sprinkle|graham|jammie|lotus|biscuit|cotton candy|crumb|chocolate (pieces|chips|buttons)|\bcones?\b|wafer|confection|sweets|candy|marshmallows\b/, "topping"],
  [/pur[ée]e|funkin/, "puree"],
  [/house|home ?made|sugar syrup|honey syrup|simple syrup|gomme|oleo|infusion|batch/, "prep"],
  [/syrup|cordial|grenadine|orgeat|monin|giffard|coco real|bitters|angostura/, "syrup"],
  [/juice|smoothie/, "juice"],
  [/ginger beer|ginger ale|root beer|cream soda|tonic|cola|\bcoke\b|lemonade|soda|red bull|energy drink|fanta|sprite|7 ?up|pepsi|rubicon|jarritos|fever.?tree|schweppes|london essence|san pellegrino|mixer|soft drink|carbonated|\bwater\b|kombucha|iced tea|crodino/, "soft"],
  [/cider|kopparberg|rekorderlig|thatchers|strongbow|aspall/, "cider"],
  [/\bbeers?\b|lager|\bales?\b|\bipa\b|stout|porter|guinness|corona|stella|peroni|san miguel|\bbud\b|budweiser|heineken|pilsner|goose island|brewery|brewing/, "beer"],
  [/vermouth|martini (rosso|bianco|extra dry)|\bsherry\b|\bport\b|lillet|dubonnet/, "vermouth"],
  [/prosecco|champagne|\bcava\b|\bwine\b|winery|ros[ée]\b|sparkling/, "wine"],
  [/liqueur|schnapps|amaretto|disaronno|kahl[uú]a|baileys|irish cream|cointreau|triple sec|curaçao|curacao|chambord|midori|archers|malibu|aperol|campari|limoncello|j[äa]germeister|sambuca|galliano|chartreuse|absinthe|passoa|frangelico|grand marnier|advocaat|cr[èe]me de|aperitif|amaro/, "liqueur"],
  [/vodka|\bgin\b|\brum\b|tequila|mezcal|whisk(e)?y|bourbon|scotch|\brye\b|cognac|brandy|calvados|cacha[cç]a|pisco|smirnoff|grey goose|c[îi]roc|belvedere|absolut|ketel|tanqueray|gordon|bombay|hendrick|roku|bacardi|captain morgan|kraken|havana|el jimador|don julio|patr[oó]n|jack daniel|jameson|bulleit|maker's mark|johnnie walker|hennessy|martell|courvoisier|r[ée]my|distill|spirit|alcoholic beverage/, "spirit"],
  [/milk|cream\b|double cream|egg|aquafaba|butter\b|yoghurt|yogurt/, "dairy"],
  [/coffee|espresso|\btea\b|hot chocolate|cocoa/, "coffee"],
  [/napkin|\bstraws?\b|blue roll|bin bag|cling|cloth|soap|sanitiser|detergent|rinse|bleach|\bcups?\b|\blids?\b|picks|coaster|co2|gas|till roll|toilet|mop|glove|\bice\b/, "supplies"],
  [/\b(fruit|berry|berries|strawberr|raspberr|blueberr|blackberr|lime|lemon|orange|grapefruit|apple|pineapple|mango|passion ?fruit|peach|banana|watermelon|melon|cherr|kiwi|cucumber|mint|basil|rosemary|thyme|sage|chilli|chili|jalape|olive|pickle|gherkin|herb|citrus|garnish|edible)/, "fresh", "weak"],
  [/\bdrinks?\b|beverage/, "soft", "weak"],
];
var IT_SPIRIT = [[/vodka|smirnoff|grey goose|c[îi]roc|belvedere|absolut|ketel|chase/, "Vodka"], [/\bgin\b|tanqueray|gordon|bombay|hendrick|roku|monkey 47|botanist|aviation/, "Gin"],
  [/\brum\b|cacha[cç]a|bacardi|captain morgan|kraken|havana|zacapa|malibu/, "Rum and cachaça"], [/tequila|mezcal|el jimador|don julio|patr[oó]n|clase azul/, "Tequila and mezcal"],
  [/whisk(e)?y|bourbon|scotch|\brye\b|jack daniel|jameson|bulleit|johnnie walker|maker's mark/, "Whiskey"], [/cognac|brandy|calvados|hennessy|martell|courvoisier|r[ée]my|pisco/, "Brandy"]];
function itKindOf(text, weak) {
  const t = ` ${text.toLowerCase()} `;
  const r = IT_RULES.find(([re, , w]) => (weak || !w) && re.test(t));
  return r ? r[1] : "";
}
// The 86 group it goes under: the stock list's own groups, so it sits beside its neighbours.
function itGroup(kind, text, side) {
  const t = text.toLowerCase();
  if (kind === "spirit") {
    const own = typeof mkFind === "function" && mkFind(text), cat = own && { "Whisky and whiskey": "Whiskey" }[own.cat] || own?.cat;
    return (IT_SPIRIT.find(([re]) => re.test(t)) || [0, ["Vodka", "Gin", "Rum and cachaça", "Tequila and mezcal", "Whiskey", "Brandy"].includes(cat) ? cat : "Other spirits"])[1];
  }
  if (kind === "beer") return /draught|draft|\bkeg\b|\bline\b/.test(t) ? "Beer lines" : "Bottled beer";
  if (kind === "supplies") return side === "floor" ? "Floor supplies" : "Bar supplies";
  return { fresh: "Fruit and garnish", dairy: "Milk, cream and eggs", juice: "Juices", puree: "Syrups, bitters and prep", prep: "Syrups, bitters and prep", syrup: "Syrups, bitters and prep",
    soft: "Soft drinks and mixers", cider: "Cider", wine: "Wine", vermouth: "Liqueurs and vermouth", liqueur: "Liqueurs and vermouth", coffee: "Coffee and tea",
    dessert: "Desserts and shakes", sauce: "Desserts and shakes", topping: "Desserts and shakes", icecream: "Desserts and shakes" }[kind] || "Other";
}
// Wikipedia's search: what the top few pages are and their one-line descriptions ("UK soft drink manufacturer").
// Anyone can read it from a web page, with no key. Six seconds, then the name alone decides.
// In the phone's own language too (the language picked in Info): Hindi स्ट्रॉबेरी is looked up on Hindi Wikipedia, which
// links it to the English page, Strawberry. Only pages whose title shares a word with what was typed count, so a typo
// that Wikipedia can't place finds nothing rather than a film.
async function itWiki(host, params) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), 6000);
  try {
    const r = await fetch(`https://${host}.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&origin=*&${params}`, { signal: c.signal });
    if (!r.ok) throw new Error(r.status);
    return (((await r.json()).query || {}).pages || []).sort((a, b) => (a.index || 0) - (b.index || 0));
  } finally { clearTimeout(t); }
}
const itSearch = (q) => `generator=search&gsrlimit=3&gsrsearch=${encodeURIComponent(q)}`;
async function itLookup(name) {
  const en = itWiki("en", `${itSearch(name)}&prop=description`).then((ps) => ps.filter((p) => itNear(name, p.title)).map((p) => ({ title: p.title, desc: p.description || "" })));
  if (!lang) return en;
  const own = itWiki(lang, `${itSearch(name)}&prop=langlinks&lllang=en`).then(async (ps) => {
    const titles = ps.filter((p) => itNear(name, p.title)).map((p) => p.langlinks?.[0]?.title).filter(Boolean);
    if (!titles.length) return [];
    const ds = await itWiki("en", `titles=${encodeURIComponent(titles.join("|"))}&prop=description`);
    return titles.map((t) => ({ title: t, desc: (ds.find((d) => d.title === t) || {}).description || "", en: true }));
  }).catch(() => []);
  const [a, b] = await Promise.all([own, en.catch(() => [])]);
  return [...a, ...b];
}
// The best guess from the name and what was found online: strong words in the name, then the first page found that
// says what it is (any kind of word counts there), then a fruit or herb in the name, then the app's own ingredient
// list. found is the page that agrees.
// The app's own list of bar ingredients (the Make tab's), by its groups: it knows Brockmans is a gin and Tia Maria a
// liqueur when the internet doesn't say. It goes last, because it matches flavour words too (mango: Mango purée).
var IT_MK = { Vodka: "spirit", Gin: "spirit", "Rum and cachaça": "spirit", "Tequila and mezcal": "spirit", "Whisky and whiskey": "spirit", Brandy: "spirit", Liqueurs: "liqueur",
  "Creams, milk and foam": "dairy", "Syrups and sauces": "syrup", "Juices and purées": "juice", "Mixers and fizz": "soft", Coffee: "coffee", "Fresh and garnish": "fresh", "Bitters and seasoning": "syrup" };
function itOwn(name) {
  const it = typeof mkFind === "function" && mkFind(name); if (!it) return "";
  return IT_MK[it.cat] || itKindOf(`${it.n} ${it.cat}`, true);
}
// Pages about something else with the same name: a song, a film, a person, a place.
var IT_NOISE = /\b(single|song|album|film|band|novel|book|episode|television|series|video game|footballer|singer|rapper|actor|actress|musician|politician|entrepreneur|village|town|city|river|locality|disambiguation|topics referred|born \d|surname|given name|airline|colou?r|shade of|software|programming|typeface|mineral|material|chemical|compound|element)\b/i;
function itGuess(name, hits) {
  const said = (hits || []).filter((h) => !IT_NOISE.test(h.desc)).map((h) => [itKindOf(`${h.title} ${h.desc}`, true), `${h.title}: ${h.desc}`.slice(0, 170) + ` (${h.src || "Wikipedia"})`]);
  const kind = itKindOf(name) || (said.find(([k]) => k) || [])[0] || itKindOf(name, true) || itOwn(name) || "other";
  // What was found online that agrees, to show why.
  return { kind, found: (said.find(([k]) => k === kind) || [0, ""])[1] };
}
// A form filled in from a kind. Changing the kind fills in its defaults again; anything typed in the note stays.
function itFill(f, kind) {
  const k = IT_KINDS[kind];
  const days = (itKeep(f.item, kind) || {}).days || k.life;
  Object.assign(f, { kind, side: k.side, store: k.store, label: k.label, life: days ? String(days) : "", close: k.close });
  if (kind === "beer" && /draught|draft|\bkeg\b/i.test(f.item)) f.store = "cellar";
  return f;
}
var itF = null, itBusy = false, itOpen = false, itShow = "";
// Add something new lives on the Stock tab, at the foot of the count.
const itRender = () => ctRender(true);
// Names compared loosely: "Fresh strawberries" is the stock list's "Strawberries".
function itNorm(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\b(fresh|the|a|bottles?|cans?)\b/g, " ").replace(/ies\b/g, "y").replace(/s\b/g, "").replace(/\s+/g, " ").trim(); }
// Typos: two names are near when every word typed is the start of a word in the other, or one or two letters off
// (the Make tab's spelling check). Letters in any alphabet count.
function itWords(s) { return s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").replace(/ies\b/g, "y").replace(/s\b/g, "").split(" ").filter((w) => w.length >= 3); }
function itNear(a, b) { const ws = itWords(b); return itWords(a).some((w) => ws.some((x) => x.startsWith(w) || w.startsWith(x) || (w.length >= 4 && mkLev(w, x) <= (w.length >= 7 ? 2 : 1)))); }
// The name the app already knows for what was typed, typos and all: the stock list, added items, the date labels'
// list and the drinks. Every word has to be near and the word counts match, so "lymes" is Limes but "lime juice" isn't.
function itKnown(typed) {
  const ws = itWords(typed); if (!ws.length) return null;
  const pool = [...Object.values(STOCK).flat(), ...(LIVE.items || []).map((x) => x.item), ...Object.values(LABEL_IDEAS).flatMap((gs) => gs.flatMap(([, xs]) => xs.map(([n]) => n))), ...D.map((d) => d.name)];
  let best = null;
  for (const n of pool) {
    const xs = itWords(n); if (xs.length !== ws.length) continue;
    let d = 0;
    for (let i = 0; i < ws.length && d < 9; i++) d += ws[i] === xs[i] ? 0 : ws[i].length >= 4 ? (mkLev(ws[i], xs[i]) <= (ws[i].length >= 7 ? 2 : 1) ? mkLev(ws[i], xs[i]) : 9) : 9;
    if (d < 9 && (!best || d < best.d)) best = { n, d };
  }
  return best ? best.n : null;
}
// The closest names the app knows, for "Did you mean": any word near, best first, so a typo never ends nowhere.
function itClosest(typed, n = 4) {
  const ws = itWords(typed); if (!ws.length) return [];
  const pool = [...new Set([...Object.values(STOCK).flat(), ...(LIVE.items || []).map((x) => x.item), ...Object.values(LABEL_IDEAS).flatMap((gs) => gs.flatMap(([, xs]) => xs.map(([k]) => k)))])];
  return pool.map((x) => [x, itWords(x).filter((w) => ws.some((y) => w.startsWith(y) || y.startsWith(w) || (y.length >= 4 && mkLev(y, w) <= (y.length >= 7 ? 2 : 1)))).length])
    .filter(([x, k]) => k && itNorm(x) !== itNorm(typed)).sort((a, b) => b[1] - a[1] || a[0].length - b[0].length).slice(0, n).map(([x]) => x);
}
// What was typed into the 86 box, as the name the 86 list knows, so it reaches the drinks.
function itFix86(typed) { const n = itKnown(typed); return n && (Object.values(stockGroups()).flat().includes(n) || D.some((d) => d.name === n)) ? n : typed; }
// The stock list's own name and group for something already on it.
function itStock(name) { const n = itNorm(name); for (const [g, xs] of Object.entries(STOCK)) { const x = xs.find((y) => itNorm(y) === n); if (x) return { item: x, group: g }; } return null; }
function itLive(side) { return (LIVE.items || []).filter((x) => x.status === "live" && (!side || x.side === side)).sort((a, b) => a.item.localeCompare(b.item)); }
function itWaiting() { return (LIVE.items || []).filter((x) => x.status === "waiting" && (LIVE.owner || x.addedUid === LIVE.uid)).sort((a, b) => ms(a.at) - ms(b.at)); }
// Already in the app under that name: a drink, or an item someone has added (waiting or on). Something on the stock
// list can be added once, to say where it's kept and what happens at close: it stays one line on the 86 list.
function itDup(name, id = "") {
  const n = itNorm(name);
  if (D.some((d) => itNorm(d.name) === n)) return "It's a drink on the menu already";
  const x = (LIVE.items || []).find((y) => y.id !== id && itNorm(y.item) === n);
  return x ? (x.status === "live" ? `It's added already (${x.group})` : `${x.addedBy} has added it already: it's waiting for Maintenance`) : "";
}
// The stock list with the added items in their groups, for the 86 list and restocking.
function stockGroups() {
  const out = Object.fromEntries(Object.entries(STOCK).map(([g, xs]) => [g, [...xs]]));
  for (const x of itLive()) if (!itStock(x.item)) (out[x.group] = out[x.group] || []).push(x.item);
  return out;
}
// One line on where it lives: "Bottle fridge · no date label · at close: leave it where it lives".
function itLine(x) { return [IT_STORE[x.store], x.label ? (x.life ? `date label, keeps ${nDays(x.life)} once opened` : "date label, days from the pack") : "no date label", `at close: ${lower(IT_CLOSE[x.close])}`].join(" · "); }
function itFormHtml() {
  const f = itF, k = IT_KINDS[f.kind], own = LIVE.owner, edit = !!f.id;
  const opt = (o, v) => Object.entries(o).map(([key, t]) => `<option value="${key}"${key === v ? " selected" : ""}>${esc(t)}</option>`).join("");
  return `<div class="itf">
    ${f.looked ? `<p class="s it-found">${f.found ? `Found online: <b>${esc(f.found)}</b>` : f.offline ? "Couldn't look it up online (no signal?). Worked out from the name." : "Nothing found online. Worked out from the name."}</p>` : ""}
    ${f.typed && itNorm(f.typed) !== itNorm(f.item) ? `<p class="s">You typed “${esc(f.typed)}”: it's <b>${esc(f.item)}</b>.</p>` : ""}
    ${f.near?.length ? `<div class="s">Did you mean <span class="recent">${f.near.map((x) => `<button class="chip" data-it-pick="${esc(x)}">${esc(x)}</button>`).join("")}</span></div>` : ""}
    <p class="it-guess"><b>${esc(f.item)}</b> looks like: <b>${esc(k.t)}</b>. Check it and change anything that's wrong.</p>
    ${itKeepHtml(f.item, f.kind)}
    <label class="fld">Name on the lists<input data-it="item" maxlength="60" value="${esc(f.item)}"></label>
    <label class="fld">What kind of thing<select data-it="kind">${opt(Object.fromEntries(Object.entries(IT_KINDS).map(([key, x]) => [key, x.t])), f.kind)}</select></label>
    <div class="two"><label class="fld">Side<select data-it="side">${opt(SIDE_NAME, f.side)}</select></label>
      <label class="fld">Where it's kept<select data-it="store">${opt(IT_STORE, f.store)}</select></label></div>
    <label class="check"><input type="checkbox" data-it="label"${f.label ? " checked" : ""}> Needs a date label once it's opened</label>
    ${f.label ? `<label class="fld">Days it keeps once opened<input data-it="life" inputmode="numeric" maxlength="3" placeholder="From the pack. Blank: a manager fills it in" value="${esc(f.life)}"></label>${f.life && (itKeep(f.item, f.kind) || {}).days === Number(f.life) ? `<p class="s">Filled in from the ${itKeep(f.item, f.kind).maker ? "maker's guidance" : "typical shelf life"} above. Change it to what the pack says.</p>` : ""}` : ""}
    <label class="fld">At close<select data-it="close">${opt(IT_CLOSE, f.close)}</select></label>
    ${k.tip ? `<p class="note">${esc(k.tip)}</p>` : ""}
    <label class="fld">Anything else to know <span class="s">(optional)</span><input data-it="note" maxlength="200" value="${esc(f.note)}" placeholder="Which shelf, which fridge, who orders it"></label>
    ${itStock(f.item) ? `<p class="note">${esc(f.item)} is on the stock list already, under <b>${esc(itStock(f.item).group)}</b>. This adds where it's kept and what happens to it at close${f.label ? ", and puts it on the date labels" : ""}.</p>` : `<p class="note">Goes under <b>${esc(itGroup(f.kind, `${f.item} ${f.found || ""}`, f.side))}</b> on the 86 list and restocking${f.label ? ", and on the date labels" : ""}, and on the ${lower(sideName(f.side))} closing page.</p>`}
    <div class="actions"><button class="btn pri" id="it-save">${own ? (edit ? (f.status === "waiting" ? "Approve and add it" : "Save") : "Add it") : "Send it to Maintenance to check"}</button>
      ${edit && own ? `<button class="btn danger" data-it-drop="${f.id}">${f.status === "waiting" ? "Turn it down" : "Take it off"}</button>` : ""}<button class="btn" id="it-cancel">Cancel</button></div></div>`;
}
// On the Stock tab: add something, what's waiting for Maintenance, and what's been added on this side.
function itemsHtml(side) {
  if (!LIVE.loaded.has("items")) return "";
  const wait = itWaiting(), mine = itLive(side);
  const waitRow = (x) => `<div class="it-row"><div><b>${esc(x.item)}</b> <span class="pill wait">Waiting for Maintenance</span><div class="s">${esc(IT_KINDS[x.kind].t)} · ${esc(itLine(x))}</div><div class="s">Added by ${esc(x.addedBy)}${x.pending ? ", saving…" : `, ${when(x.at)}`}${x.found ? ` · ${esc(x.found)}` : ""}</div></div>
    <div class="actions">${LIVE.owner ? `<button class="btn pri" data-it-edit="${x.id}">Check it</button>` : `<button class="btn" data-it-drop="${x.id}">Take it back</button>`}</div></div>`;
  const liveRow = (x) => `<div class="it-row"><div><b>${esc(x.item)}</b> <span class="pill">${esc(x.group)}</span><div class="s">${esc(itLine(x))}</div>${x.note ? `<div class="s">${esc(x.note)}</div>` : ""}</div>
    ${LIVE.owner ? `<div class="actions"><button class="btn" data-it-edit="${x.id}">Change</button></div>` : ""}</div>`;
  const form = itF?.kind && !itF.id ? itFormHtml() : `<div class="ltools"><input id="it-name" maxlength="60" placeholder="A name, or a barcode's numbers" aria-label="What it is" value="${esc(itF?.item || "")}"><button class="btn pri" id="it-look"${itBusy ? " disabled" : ""}>${itBusy ? "Looking…" : "Look it up"}</button></div><div class="s it-have" id="it-have" aria-live="polite"></div>${navigator.mediaDevices?.getUserMedia ? `<div class="actions"><button class="btn" id="it-scan-go">Scan a barcode</button></div>` : ""}`;
  return `<details class="setup" id="it-add"${itOpen || wait.length && LIVE.owner ? " open" : ""}><summary>Add something new${wait.length ? ` <span class="pill wait">${wait.length} waiting</span>` : ""}</summary>
    <p class="note">An ingredient, a drink we sell, a garnish, a dessert. Type what it is: the app looks it up and works out where it's kept, if it needs a date label and what happens to it at close. ${LIVE.owner ? "Yours go on straight away." : "Maintenance checks it, then it's on every phone."}</p>
    ${form}
    ${wait.map((x) => (itF?.id === x.id ? `<div class="it-row">${itFormHtml()}</div>` : waitRow(x))).join("")}
    ${mine.length ? `<details class="setup" id="it-list"${itShow === side ? " open" : ""}><summary>Added on the ${lower(sideName(side))} (${mine.length})</summary>${mine.map((x) => (itF?.id === x.id ? `<div class="it-row">${itFormHtml()}</div>` : liveRow(x))).join("")}</details>` : ""}
  </details>`;
}
// On the closing page: what to do with each added item at close, grouped by what happens to it.
function putAwayHtml(side) {
  const xs = itLive(side); if (!xs.length) return "";
  const by = Object.keys(IT_CLOSE).map((c) => [c, xs.filter((x) => x.close === c)]).filter(([, ys]) => ys.length);
  return `<details class="setup" id="it-close"><summary>Putting away: ${plural(xs.length, "added item")}</summary>
    ${by.map(([c, ys]) => `<div class="mini">${esc(IT_CLOSE[c])}</div>${ys.map((x) => `<div class="s it-pa"><b>${esc(x.item)}</b> · ${esc(IT_STORE[x.store])}${x.label ? " · date label" : ""}${IT_KINDS[x.kind].tip ? ` · ${esc(IT_KINDS[x.kind].tip)}` : ""}</div>`).join("")}`).join("")}</details>`;
}
// Black Tap's date label list also holds the added items that need a label and have no days yet, for a manager to fill
// in from the pack.
function itLabelIdeas(side) { const xs = itLive(side).filter((x) => x.label && !x.life).map((x) => [x.item]); return xs.length ? [["Added by the team", xs]] : []; }
// What Open Food Facts calls a barcode's product (free, no key): { name, cats, qty }, null when it isn't listed. Throws
// with no signal.
async function offProduct(code) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), 6000);
  const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,brands,categories_tags,quantity`, { signal: c.signal }).finally(() => clearTimeout(t));
  if (!r.ok && r.status !== 404) throw new Error(`Open Food Facts ${r.status}`);
  const j = r.ok ? await r.json() : null, p = j?.status === 1 ? j.product : null;
  if (!p?.product_name) return null;
  const brand = (p.brands || "").split(",")[0].trim(), name = (brand && !p.product_name.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${p.product_name}` : p.product_name).slice(0, 60);
  const cats = (p.categories_tags || []).filter((x) => x.startsWith("en:")).map((x) => x.slice(3).replace(/-/g, " ")).slice(0, 6).join(", ");
  return { name, cats, qty: p.quantity || "" };
}
// A barcode (scanned, or typed as digits): Open Food Facts says what the product is, and then it goes through the same
// lookup as a typed name, with what Open Food Facts says about it first.
async function itBarcode(code) {
  itBusy = true; itF = { item: code }; itRender();
  let p = null, off = false;
  try { p = await offProduct(code); } catch { off = true; }
  itBusy = false;
  if (!p) { itF = null; itRender(); return toast(off ? "No signal: type the name instead" : "That barcode isn't listed online. Type the name instead"); }
  itF = null; return itLook(p.name, [{ title: p.name, desc: p.cats || p.qty, src: "Open Food Facts" }]);
}
var scanZX = null;
// The camera, read by ZXing (free, loaded the first time it's needed, so the app stays light on old phones). Resolves
// with the barcode's numbers, or null if it was cancelled or the camera couldn't be used.
async function scanCode() {
  const box = document.createElement("div");
  box.id = "it-scan"; box.innerHTML = `<video playsinline muted></video><p>Point the camera at the barcode. Hold it still, about a hand's width away.</p><button class="btn" id="it-scan-x">Cancel</button>`;
  document.body.append(box);
  let reader = null; const done = () => { try { reader?.reset(); } catch {} box.remove(); };
  const cancel = new Promise((ok) => { box.querySelector("#it-scan-x").onclick = () => { done(); ok(null); }; });
  try {
    if (!window.ZXing) await (scanZX ||= new Promise((ok, no) => { const sc = document.createElement("script"); sc.src = "https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js"; sc.onload = ok; sc.onerror = no; document.head.append(sc); }));
    if (!box.isConnected) return null;
    reader = new ZXing.BrowserMultiFormatReader();
    const res = await Promise.race([reader.decodeOnceFromVideoDevice(undefined, box.querySelector("video")), cancel]);
    if (!res) return null;
    done(); haptic(); return res.getText();
  } catch {
    if (box.isConnected) { done(); toast(window.ZXing ? "Couldn't use the camera. Type the barcode's numbers into Find" : "The scanner needs signal the first time"); }
    if (!window.ZXing) scanZX = null;
    return null;
  }
}
async function itScan() { const code = await scanCode(); if (code) itBarcode(code); }
async function itLook(given, extra) {
  const typed = (given || $("#it-name")?.value || "").trim().replace(/\s+/g, " ").slice(0, 60);
  if (!typed) return toast("Type what it is first");
  if (!extra && /^\d{8,14}$/.test(typed)) return itBarcode(typed);
  const known = itKnown(typed), st = itStock(known || typed);
  let item = st ? st.item : known || typed;
  const dup = itDup(item); if (dup) return toast(dup);
  itBusy = true; itF = { item }; itRender();
  let hits = null, offline = false;

  try { hits = await itLookup(item); } catch { offline = true; }
  if (extra) hits = [...extra, ...(hits || [])];
  itBusy = false;
  if (itF?.item !== item) return;
  // Typed in another language: it goes on the lists under the English name (the one the stock list uses, if it's there).
  const eng = !known && hits?.find((h) => h.en);
  if (eng) { const k2 = itKnown(eng.title); item = itStock(k2 || eng.title)?.item || k2 || eng.title.slice(0, 60); const d2 = itDup(item); if (d2) { itF = null; itRender(); return toast(d2); } }
  const g = itGuess(item, hits);
  // Nothing it knows and nothing found online: the closest things it does know, to pick from, or carry on adding.
  const near = !known && !itStock(item) && !g.found ? itClosest(typed) : [];
  itF = itFill({ item, typed, near, note: "", found: g.found, looked: true, offline }, g.kind);
  itRender();
}
function itSave() {
  const f = itF, life = f.label && f.life.trim() ? Number(f.life) : 0;
  f.item = f.item.trim().replace(/\s+/g, " ").slice(0, 60); if (!f.item) return toast("Give it a name");
  if (!Number.isInteger(life) || life < 0 || life > 365) return toast("Days it keeps: a whole number from 1 to 365, or leave it blank");
  const dup = itDup(f.item, f.id); if (dup) return toast(dup);
  const x = { item: f.item, kind: f.kind, group: itStock(f.item)?.group || itGroup(f.kind, `${f.item} ${f.found || ""}`, f.side), side: f.side, store: f.store, label: f.label, life: f.label ? life : 0, close: f.close, note: f.note.trim().slice(0, 200), found: f.found || "" };
  const was = f.id && LIVE.items.find((y) => y.id === f.id);
  if (f.id && !was) { itF = null; itRender(); return toast("Someone has just taken it off"); }
  const p = f.id ? LIVE.api.saveItem(was, x) : LIVE.api.addItem(x, LIVE.owner);
  track(p, LIVE.owner ? `${x.item} is on every phone now` : `Sent. Maintenance will check ${x.item}`, "Not saved. Try again");
  // Maintenance putting it on: its date label goes on too, when its days are known and the side hasn't got one.
  if (LIVE.owner && x.label && x.life && !dupLabel(x.item, x.side)) track(LIVE.api.label(null, "added", { item: x.item, side: x.side, life: x.life, on: true }), null, "The date label wasn't added. Add it on Labels");
  itF = null; itOpen = true; haptic(); itRender();
  if (!f.id) ctAdded(x.item);
}
$("#v-count").addEventListener("click", (e) => {
  if (e.target.closest("#it-look")) { itLook(); return; }
  if (e.target.closest("#it-scan-go")) { itScan(); return; }
  const pk = e.target.closest("[data-it-pick]"); if (pk) { itF = null; itRender(); $("#it-name").value = pk.dataset.itPick; itLook(); return; }
  if (e.target.closest("#it-cancel")) { itF = null; itRender(); return; }
  if (e.target.closest("#it-save")) { if (itF) itSave(); return; }
  const ed = e.target.closest("[data-it-edit]"); if (ed) {
    const x = LIVE.items.find((y) => y.id === ed.dataset.itEdit); if (!x) return;
    itF = { id: x.id, status: x.status, item: x.item, kind: x.kind, side: x.side, store: x.store, label: x.label, life: x.life ? String(x.life) : "", close: x.close, note: x.note, found: x.found, looked: !!x.found };
    itRender(); return;
  }
  const dr = e.target.closest("[data-it-drop]"); if (dr) {
    const x = LIVE.items.find((y) => y.id === dr.dataset.itDrop); if (!x) return;
    if (!confirm(x.status === "waiting" ? `${LIVE.owner && x.addedUid !== LIVE.uid ? "Turn down" : "Take back"} ${x.item}?` : `Take ${x.item} off? It leaves the 86 list, restocking and closing. A date label already set up for it stays on Labels.`)) return;
    track(LIVE.api.dropItem(x.id), `${x.item} taken off`, "Not done. Try again");
    if (itF?.id === x.id) itF = null; haptic(); itRender();
  }
});
$("#v-count").addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.id === "it-name") { e.preventDefault(); itLook(); } });
// While typing a new item: what's on the list already with a name like it (the same search as everywhere), so nothing
// goes on twice.
$("#v-count").addEventListener("input", (e) => {
  if (e.target.id !== "it-name") return;
  const q = e.target.value.trim(), xs = q.length >= 3 ? pkSearch(q, pkPool().filter((x) => x.c !== "drinks")).slice(0, 4) : [];
  $("#it-have").innerHTML = xs.length ? `Already on the list: ${xs.map((x) => `<b translate="no">${esc(x.n)}</b> <span class="pill">${esc(PK_CAT[x.c])}</span>`).join(" ")}. Only add it if it's something else.` : "";
});
$("#v-count").addEventListener("input", (e) => { const k = e.target.dataset.it; if (itF && (k === "life" || k === "note" || k === "item")) itF[k] = e.target.value; });
$("#v-count").addEventListener("change", (e) => {
  const k = e.target.dataset.it; if (!itF || !k || k === "life" || k === "note") return;
  if (k === "item") { itRender(); return; }
  if (k === "kind") itFill(itF, e.target.value);
  else itF[k] = e.target.type === "checkbox" ? e.target.checked : e.target.value;
  itRender();
});
