/* ---------- Make: the cocktail maker ----------
   Pick what you have (or want to use), keep a saved "My bar", and get every drink in the book ranked by how close you are.
   Also a randomiser and a quick-spec list for making drinks on the go. Everything is saved on this phone only.
   Reads the drinks as they are (DATA.drinks): it never changes a spec.

   The ingredient list. Each line is [name, kind, ...other names]. "kind" is what a bottle can stand in for: two items of the
   same kind swap cleanly (Roku for Tanqueray), and kinds in the same family swap with a change of flavour (plain vodka for
   Cîroc Red Berry). An item named the same as its kind is the generic one ("Vodka"): picking it covers every bottle of that kind. */
const MK_CATS = [
  ["Vodka", "Vodka", [
    ["Vodka", "Vodka"], ["Smirnoff", "Vodka", "smirnoff red"], ["Grey Goose", "Vodka"], ["Belvedere", "Vodka"], ["Ketel One", "Vodka"], ["Absolut", "Vodka"], ["Cîroc", "Vodka"],
    ["Flavoured vodka", "Flavoured vodka"], ["Smirnoff Vanilla", "Vanilla vodka", "vanilla vodka"], ["Absolut Vanilia", "Vanilla vodka"], ["Cîroc Red Berry", "Berry vodka", "berry vodka"],
    ["Belvedere Blackberry & Lemongrass", "Berry vodka", "belvedere blackberry"], ["Cîroc Apple", "Apple vodka", "apple vodka"], ["Cîroc Mango", "Mango vodka", "mango vodka"],
    ["Cîroc Pineapple", "Pineapple vodka", "pineapple vodka"], ["Smirnoff Miami Peach", "Peach vodka", "peach vodka"], ["Chase English Rhubarb", "Rhubarb vodka", "rhubarb vodka"],
    ["Chase Aged Marmalade", "Orange vodka", "marmalade vodka"], ["Absolut Citron", "Citrus vodka", "citrus vodka", "lemon vodka"]]],
  ["Gin", "Gin", [
    ["Gin", "Gin", "london dry"], ["Tanqueray", "Gin", "tanqueray london dry"], ["Aviation gin", "Gin", "aviation"], ["Roku", "Gin", "roku gin"], ["Drumshanbo Gunpowder", "Gin", "gunpowder gin"],
    ["Monkey 47", "Gin"], ["The Botanist", "Gin", "botanist"], ["Brockmans", "Gin"], ["Cygnet", "Gin"], ["Gordon's", "Gin", "gordons"], ["Bombay Sapphire", "Gin", "bombay"],
    ["Hendrick's", "Gin", "hendricks"], ["Beefeater", "Gin"], ["Tanqueray Flor de Sevilla", "Orange gin", "flor de sevilla", "orange gin"], ["Pink gin", "Pink gin", "gordons pink"], ["Sloe gin", "Sloe gin"]]],
  ["Rum and cachaça", "Rum", [
    ["White rum", "White rum", "light rum", "rum"], ["Captain Morgan White", "White rum"], ["Bacardi Carta Blanca", "White rum", "bacardi"], ["Havana Club 3", "White rum", "havana club"],
    ["Dark rum", "Dark rum"], ["Captain Morgan Dark", "Dark rum", "captain morgan dark rum"], ["Myers's", "Dark rum", "myers"],
    ["Spiced rum", "Spiced rum"], ["Captain Morgan Spiced Gold", "Spiced rum", "spiced gold", "captain morgan spiced", "captain morgan"], ["Kraken Black Spiced", "Spiced rum", "kraken"], ["52North spiced", "Spiced rum", "52north", "52 north"],
    ["Aged rum", "Aged rum"], ["Zacapa 23", "Aged rum", "zacapa"], ["Diplomático", "Aged rum", "diplomatico"], ["Plantation", "Aged rum"],
    ["Cachaça", "Cachaça"], ["Abelha cachaça", "Cachaça", "abelha"]]],
  ["Tequila and mezcal", "Agave", [
    ["Blanco tequila", "Blanco tequila", "tequila", "silver tequila", "white tequila"], ["El Jimador Blanco", "Blanco tequila", "jimador blanco", "el jimador"], ["Casamigos Blanco", "Blanco tequila"], ["Patrón Silver", "Blanco tequila", "patron"], ["Jose Cuervo", "Blanco tequila", "cuervo"],
    ["Reposado tequila", "Reposado tequila", "reposado", "gold tequila"], ["El Jimador Reposado", "Reposado tequila", "jimador reposado"], ["Casamigos Reposado", "Reposado tequila"], ["Clase Azul Reposado", "Reposado tequila", "clase azul"],
    ["Añejo tequila", "Añejo tequila", "anejo"], ["Don Julio Añejo", "Añejo tequila", "don julio"], ["Don Julio 1942", "Añejo tequila", "1942"],
    ["Mezcal", "Mezcal"], ["Amarás Mezcal Verde", "Mezcal", "amaras"]]],
  ["Whisky and whiskey", "Whisky", [
    ["Bourbon", "Bourbon", "bourbon whiskey", "american whiskey"], ["Buffalo Trace", "Bourbon"], ["Bulleit Bourbon", "Bourbon", "bulleit"], ["Jack Daniel's", "Bourbon", "jack daniels", "jd", "tennessee whiskey"],
    ["Elijah Craig", "Bourbon"], ["Michter's", "Bourbon", "michters"], ["Maker's Mark", "Bourbon", "makers mark"], ["Woodford Reserve", "Bourbon", "woodford"], ["Jim Beam", "Bourbon"],
    ["Rye whiskey", "Rye whiskey", "rye"], ["Bulleit Rye", "Rye whiskey"], ["Rittenhouse Rye", "Rye whiskey", "rittenhouse"],
    ["Irish whiskey", "Irish whiskey"], ["Jameson", "Irish whiskey", "jamesons"], ["Bushmills", "Irish whiskey"], ["Tullamore D.E.W.", "Irish whiskey", "tullamore"],
    ["Blended Scotch", "Blended Scotch", "scotch", "scotch whisky", "whisky", "whiskey"], ["Johnnie Walker Black Label", "Blended Scotch", "johnnie walker black", "jw black", "johnnie walker"], ["Johnnie Walker Blue Label", "Blended Scotch", "jw blue"], ["Monkey Shoulder", "Blended Scotch"], ["Famous Grouse", "Blended Scotch"],
    ["Single malt Scotch", "Single malt Scotch", "single malt"], ["Glenmorangie Signet", "Single malt Scotch", "glenmorangie"], ["Glenfiddich 12", "Single malt Scotch", "glenfiddich"],
    ["Peated Scotch", "Peated Scotch", "peated whisky", "islay"], ["Talisker 10", "Peated Scotch", "talisker"], ["Port Charlotte 10", "Peated Scotch", "port charlotte"], ["Laphroaig 10", "Peated Scotch", "laphroaig"], ["Ardbeg 10", "Peated Scotch", "ardbeg"],
    ["Japanese whisky", "Japanese whisky"], ["Hibiki Harmony", "Japanese whisky", "hibiki"], ["Hakushu 12", "Japanese whisky", "hakushu"],
    ["Sheep Dog Peanut Butter", "Peanut butter whiskey", "sheep dog", "peanut butter whiskey"]]],
  ["Brandy", "Brandy", [
    ["Cognac", "Cognac", "brandy"], ["Martell VS", "Cognac", "martell"], ["Courvoisier VSOP", "Cognac", "courvoisier"], ["Hennessy VS", "Cognac", "hennessy"], ["Hennessy XO", "Cognac"], ["Rémy Martin XO", "Cognac", "remy martin", "remy"],
    ["Calvados", "Apple brandy", "apple brandy"], ["Avallen Calvados", "Apple brandy", "avallen"], ["Apple Jack", "Apple brandy", "applejack", "laird"],
    ["Pisco", "Pisco"]]],
  ["Liqueurs", null, [
    ["Orange liqueur", "Orange liqueur", "triple sec", "curacao"], ["Cointreau", "Orange liqueur"], ["Grand Marnier", "Orange liqueur"], ["Blue curaçao", "Blue curaçao", "blue curacao"],
    ["Coffee liqueur", "Coffee liqueur"], ["Kahlúa", "Coffee liqueur", "kahlua"], ["Tia Maria", "Coffee liqueur"], ["Mr Black", "Coffee liqueur"],
    ["Amaretto", "Amaretto"], ["Disaronno", "Amaretto"], ["Frangelico", "Hazelnut liqueur", "hazelnut liqueur"],
    ["Chambord", "Raspberry liqueur", "raspberry liqueur", "black raspberry"], ["Crème de cassis", "Cassis", "creme de cassis", "cassis", "blackcurrant liqueur"], ["Crème de mûre", "Blackberry liqueur", "creme de mure", "blackberry liqueur"],
    ["Heering Cherry", "Cherry liqueur", "heering", "cherry heering", "cherry liqueur", "cherry brandy"], ["Luxardo Maraschino", "Maraschino", "maraschino"],
    ["Midori", "Melon liqueur", "melon liqueur"], ["Archers", "Peach schnapps", "peach schnapps", "peach liqueur"], ["Passoa", "Passion fruit liqueur", "passion fruit liqueur"],
    ["Apple liqueur", "Apple liqueur", "sour apple", "apple schnapps", "apple sourz"], ["Luxardo Limoncello", "Limoncello", "limoncello"], ["Malibu", "Coconut rum", "coconut rum"],
    ["St-Germain", "Elderflower liqueur", "st germain", "elderflower liqueur"], ["Baileys", "Cream liqueur", "irish cream", "cream liqueur"],
    ["Marshmallow liqueur", "Marshmallow liqueur"], ["Southern Comfort", "Southern Comfort", "soco"], ["Advocaat", "Advocaat", "warninks"],
    ["White crème de cacao", "White cacao", "white creme de cacao", "creme de cacao"], ["Dark crème de cacao", "Dark cacao", "dark creme de cacao"],
    ["Green crème de menthe", "Crème de menthe", "creme de menthe", "green creme de menthe"], ["Crème de violette", "Violette", "creme de violette", "violet liqueur"],
    ["Yellow Chartreuse", "Yellow Chartreuse"], ["Green Chartreuse", "Green Chartreuse"], ["Bénédictine", "Bénédictine", "benedictine"], ["Drambuie", "Drambuie"],
    ["Jägermeister", "Jägermeister", "jagermeister", "jager"], ["Galliano", "Galliano"], ["Amaro Nonino", "Amaro", "amaro", "nonino"], ["Ancho Reyes", "Chilli liqueur", "chilli liqueur", "ancho"],
    ["NV Absinthe", "Absinthe", "absinthe"], ["Sambuca", "Sambuca"], ["Pernod", "Pastis", "pastis", "ricard"]]],
  ["Aperitifs, vermouth and wine", null, [
    ["Aperol", "Aperol"], ["Campari", "Campari"], ["Sarti Rosa", "Sarti Rosa", "sarti"],
    ["Sweet vermouth", "Sweet vermouth", "rosso vermouth", "red vermouth"], ["Martini Rosso", "Sweet vermouth"], ["Martini Bianco", "Bianco vermouth", "bianco"],
    ["Dry vermouth", "Dry vermouth"], ["Martini Extra Dry", "Dry vermouth", "martini dry"], ["Noilly Prat", "Dry vermouth"], ["Lillet Blanc", "Lillet", "lillet"],
    ["Pimm's No.1", "Pimm's", "pimms", "pimm s"], ["Prosecco", "Sparkling wine", "sparkling wine", "fizz"], ["Champagne", "Sparkling wine"], ["Cava", "Sparkling wine"]]],
  ["Beer", "Beer", [
    ["Lager", "Lager"], ["Stella Artois", "Lager", "stella"], ["Budweiser", "Lager", "bud"], ["Corona", "Lager"], ["Camden Hells", "Lager", "camden"], ["Guinness", "Stout", "stout"]]],
  ["Creams, milk and foam", null, [
    ["Double cream", "Cream", "cream", "whipping cream"], ["Single cream", "Cream"], ["Milk", "Milk", "whole milk"], ["Oat milk", "Milk", "oatly"],
    ["Coco Real", "Coconut cream", "cream of coconut", "coconut cream", "coconut syrup"], ["Coconut milk", "Coconut cream"],
    ["Egg white", "Foamer", "egg"], ["Aquafaba", "Foamer", "chickpea water"], ["Foamer", "Foamer", "foamer drops", "foamee", "ms better s"], ["Vanilla ice cream", "Ice cream", "ice cream"]]],
  ["Syrups and sauces", null, [
    ["Sugar syrup", "Sugar syrup", "simple syrup", "gomme", "sugar"], ["Rich sugar syrup (2:1)", "Sugar syrup", "rich sugar syrup"], ["Demerara syrup", "Sugar syrup", "demerara"],
    ["Honey syrup (2:1)", "Honey", "honey syrup", "honey"], ["Honey-ginger syrup", "Honey", "honey ginger"], ["Agave syrup", "Agave syrup", "agave nectar", "agave"],
    ["Vanilla syrup", "Vanilla syrup"], ["Monin Vanilla", "Vanilla syrup"], ["Grenadine", "Grenadine", "de kuyper grenadine", "pomegranate syrup"], ["Giffard Orgeat", "Orgeat", "orgeat", "almond syrup"],
    ["Elderflower cordial", "Elderflower", "bottlegreen elderflower", "elderflower"], ["Salted caramel sauce", "Caramel", "salted caramel", "caramel sauce", "caramel syrup"], ["Marshmallow syrup", "Marshmallow syrup", "william fox marshmallow"],
    ["Passion fruit syrup", "Passion fruit syrup"], ["Raspberry syrup", "Raspberry syrup"], ["Strawberry syrup", "Strawberry syrup"], ["Cinnamon syrup", "Cinnamon syrup"],
    ["Hazelnut syrup", "Hazelnut syrup"], ["Ginger syrup", "Ginger syrup"], ["Lime cordial", "Lime cordial", "roses lime"], ["Blackcurrant cordial", "Blackcurrant cordial", "ribena"]]],
  ["Juices and purées", null, [
    ["Lime juice", "Lime juice", "fresh lime"], ["Lemon juice", "Lemon juice", "fresh lemon"], ["Orange juice", "Orange juice", "oj"], ["Pineapple juice", "Pineapple juice"],
    ["Cranberry juice", "Cranberry juice", "cranberry", "eager cranberry"], ["Grapefruit juice", "Grapefruit juice", "grapefruit"], ["Tomato juice", "Tomato juice"], ["Apple juice", "Apple juice"],
    ["Mango juice", "Mango juice"], ["Strawberry purée", "Strawberry purée", "strawberry puree"], ["Funkin peach purée", "Peach purée", "peach puree", "funkin peach"],
    ["Passion fruit purée", "Passion fruit purée", "passion fruit puree"], ["Mango purée", "Mango purée", "mango puree"], ["Raspberry purée", "Raspberry purée", "raspberry puree"]]],
  ["Mixers and fizz", null, [
    ["Soda water", "Soda", "soda", "club soda", "sparkling water"], ["Fever-Tree Indian Tonic", "Tonic", "indian tonic", "tonic", "tonic water"], ["Fever-Tree Light Tonic", "Tonic", "light tonic", "slimline tonic"],
    ["Fever-Tree Ginger Ale", "Ginger ale", "ginger ale"], ["Fever-Tree Ginger Beer", "Ginger beer", "ginger beer"], ["Lemonade", "Lemonade", "house lemonade", "sprite", "7up"],
    ["Coca-Cola", "Cola", "cola", "coke", "coca cola"], ["Diet Coke", "Cola", "coke zero", "pepsi"], ["Red Bull", "Energy drink", "energy drink"]]],
  ["Coffee", null, [["Fresh espresso", "Espresso", "espresso", "coffee"], ["Hot Americano", "Hot coffee", "americano", "filter coffee"]]],
  ["Fresh and garnish", null, [
    ["Mint", "Mint", "mint leaves", "mint sprig"], ["Basil", "Basil", "basil leaves"], ["Limes", "Lime", "lime wedge", "lime wedges", "lime", "1 lime"], ["Lemons", "Lemon", "lemon wedge", "lemon"],
    ["Cucumber", "Cucumber", "cucumber slices"], ["Red jalapeño", "Chilli", "jalapeno", "chilli", "red jalapeno"], ["Passion fruit", "Passion fruit", "passion fruit"],
    ["Orange marmalade", "Marmalade", "marmalade"], ["Strawberries", "Strawberries", "strawberry"], ["Olive brine", "Olive brine", "olives"], ["Pickle brine", "Pickle brine", "chilled pickle brine", "pickle"]]],
  ["Bitters and seasoning", null, [
    ["Angostura", "Angostura", "angostura bitters", "aromatic bitters", "bitters"], ["Orange bitters", "Orange bitters"], ["Peychaud's bitters", "Peychaud's", "peychaud"],
    ["Chocolate bitters", "Chocolate bitters", "cocoa bitters"], ["Celery bitters", "Celery bitters"], ["Tabasco", "Tabasco", "hot sauce"], ["Worcestershire sauce", "Worcestershire", "worcestershire", "lea perrins"],
    ["Salt", "Salt", "sea salt"], ["Celery salt and black pepper", "Celery salt", "celery salt", "black pepper", "pepper"], ["Cayenne pepper", "Cayenne", "cayenne"]]],
];
// Families: kinds that swap with a change of flavour. Anything else only swaps within its own kind.
const MK_FAM = {
  "Orange liqueur": "Orange", "Blue curaçao": "Orange", "Coffee liqueur": "Coffee", "Espresso": "Coffee", "Hot coffee": "Coffee",
  "Cherry liqueur": "Cherry", "Maraschino": "Cherry", "Raspberry liqueur": "Berry", "Cassis": "Berry", "Blackberry liqueur": "Berry",
  "White cacao": "Cacao", "Dark cacao": "Cacao", "Yellow Chartreuse": "Herbal", "Green Chartreuse": "Herbal", "Bénédictine": "Herbal", "Drambuie": "Herbal", "Galliano": "Herbal",
  "Absinthe": "Anise", "Sambuca": "Anise", "Pastis": "Anise", "Aperol": "Bitter aperitif", "Campari": "Bitter aperitif", "Sarti Rosa": "Bitter aperitif", "Amaro": "Bitter aperitif",
  "Sweet vermouth": "Vermouth", "Bianco vermouth": "Vermouth", "Dry vermouth": "Vermouth", "Lillet": "Vermouth", "Lager": "Beer", "Stout": "Beer",
  "Cream": "Dairy", "Milk": "Dairy", "Ice cream": "Dairy", "Sugar syrup": "Sweet", "Honey": "Sweet", "Agave syrup": "Sweet",
  "Elderflower": "Elderflower", "Elderflower liqueur": "Elderflower", "Marshmallow liqueur": "Marshmallow", "Marshmallow syrup": "Marshmallow",
  "Lime juice": "Citrus", "Lemon juice": "Citrus", "Tonic": "Tonic", "Lemonade": "Lemony fizz", "Soda": "Fizz", "Ginger ale": "Ginger", "Ginger beer": "Ginger", "Ginger syrup": "Ginger",
  "Orange bitters": "Bitters", "Angostura": "Bitters", "Peychaud's": "Bitters", "Chocolate bitters": "Bitters", "Celery bitters": "Bitters", "Salt": "Seasoning", "Celery salt": "Seasoning", "Cayenne": "Seasoning",
  "Strawberry purée": "Strawberry", "Strawberries": "Strawberry", "Strawberry syrup": "Strawberry", "Passion fruit": "Passion", "Passion fruit purée": "Passion", "Passion fruit syrup": "Passion",
  "Raspberry purée": "Raspberry", "Raspberry syrup": "Raspberry", "Mango purée": "Mango", "Mango juice": "Mango", "Peach purée": "Peach",
};
const mkNorm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const MK = { items: [], byKey: new Map(), reqs: new Map(), unmatched: [], ids: [] };
for (const [cat, fam, list] of MK_CATS) for (const [n, kind, ...al] of list) {
  const it = { k: mkNorm(n), n, cat, kind, fam: fam || MK_FAM[kind] || kind, gen: n === kind, al: [...new Set([mkNorm(n), ...al.map(mkNorm)])] };
  MK.items.push(it); MK.byKey.set(it.k, it);
}
// Every alias, longest first, so "Smirnoff Vanilla" wins over "Smirnoff" and "lime juice" over "lime".
const MK_ALIAS = MK.items.flatMap((it) => it.al.map((a) => [a, it])).sort((a, b) => b[0].length - a[0].length);
const mkFind = (text) => { const t = " " + mkNorm(text) + " "; const hit = MK_ALIAS.find(([a]) => t.includes(" " + a + " ")); return hit ? hit[1] : null; };
// The bar basics most bars always have. On by default, so a guest's two bottles still find a Daiquiri.
const MK_BASICS = ["Sugar syrup", "Lime juice", "Lemon juice", "Soda water", "Limes", "Angostura", "Salt"].map(mkNorm);
const MK_MINOR = /^(?:\d+ )?(?:dash|dashes|drops?|bar spoon|pinch|half pinch|splash)\b|rinse|lime wedge|cut into|slices|^half a passion/i;
// One spec line to the ingredients it needs: [{ it, ml, w, line }].
function mkParse(line) {
  const l = line.replace(/^side:\s*/i, "").replace(/,\s*(?:floated|lightly whipped|de-seeded).*$/i, "").replace(/,? or .* on request$/i, "");
  const each = l.match(/^(\d+(?:\.\d+)?) ml each:\s*(.*)$/i);
  if (each) return each[2].split(/,\s*/).map((x) => ({ it: mkFind(x), ml: +each[1], w: 1, line, name: x }));
  const rinse = l.match(/rinse \((.*)\)/i);
  const name = rinse ? rinse[1] : l;
  const ml = (l.match(/(\d+(?:\.\d+)?) ml/) || [])[1];
  const w = MK_MINOR.test(l) || /Bitters and seasoning|Fresh and garnish/.test((mkFind(name) || {}).cat || "") && !/mint|basil|marmalade|passion|cucumber|jalap/i.test(l) ? 0.3 : 1;
  return [{ it: mkFind(name), ml: ml ? +ml : null, w, line, name }];
}
for (const d of D) {
  const r = d.spec.flatMap(mkParse);
  for (const x of r) if (!x.it) MK.unmatched.push(`${d.name}: ${x.line}`);
  // One entry per ingredient (a drink can list lime twice: juice and a wedge are different items, so that's fine).
  MK.reqs.set(d.id, r.filter((x) => x.it));
}
const mkKids = (d) => d._k === "zero" || d.tags.includes("No alcohol") ? "zero" : d._k === "shot" ? "shot" : "cocktail";

/* ---------- Saved state (this phone only) ---------- */
// A pick is { k, ml? } where k is an ingredient key, or "~" + free text for something typed that isn't in the list.
const mk = {
  pane: store.get("mk.pane", "make"),
  pick: store.get("mk.pick", []).filter((p) => p.k.startsWith("~") || MK.byKey.has(p.k)),
  bar: store.get("mk.bar", []).filter((k) => k.startsWith("~") || MK.byKey.has(k)),
  opt: { useBar: true, basics: true, kind: "all", ...store.get("mk.opt", {}) },
  rnd: { mode: "any", mine: false, kind: "all", last: [], cur: null, ...store.get("mk.rnd", {}), cur: null },
  qs: { q: "", kind: "all", mine: false },
  edit: null, // the pick whose ml is being set
  typed: { make: "", bar: "" },
};
const mkSave = () => { store.set("mk.pane", mk.pane); store.set("mk.pick", mk.pick); store.set("mk.bar", mk.bar); store.set("mk.opt", mk.opt); store.set("mk.rnd", { mode: mk.rnd.mode, mine: mk.rnd.mine, kind: mk.rnd.kind, last: mk.rnd.last }); };
const mkName = (k) => (k.startsWith("~") ? k.slice(1) : MK.byKey.get(k).n);
// What a typed item stands for: a list item if it reads like one, so "absolut raspberri vodka" still works as a vodka.
const mkLike = (k) => (k.startsWith("~") ? mkFind(k.slice(1)) : MK.byKey.get(k));

/* ---------- Matching ---------- */
// How well one held item covers one needed item. 1: same bottle, or the generic you picked ("Vodka" for Smirnoff).
// 0.9: another bottle of the same kind. 0.7: same family, different flavour. Typed text also matches by its words.
function mkCover(need, k) {
  const it = need.it;
  if (k.startsWith("~")) {
    const t = mkNorm(k.slice(1));
    if (t.length > 2 && (mkNorm(need.name).includes(t) || it.al.some((a) => a === t))) return 1;
    const like = mkFind(k.slice(1)); if (!like) return 0;
    return like === it ? 1 : like.kind === it.kind ? 0.9 : like.fam === it.fam ? 0.7 : 0;
  }
  const h = MK.byKey.get(k);
  if (h === it) return 1;
  if (h.kind === it.kind) return h.gen ? 1 : 0.9;
  if (h.fam === it.fam) return 0.7;
  return 0;
}
// Scores one drink against what's held. Picked items carry an optional ml: a drink needing more than that is marked short.
function mkScore(d, held, picked) {
  const reqs = MK.reqs.get(d.id);
  let got = 0, tot = 0, used = 0;
  const miss = [], swaps = [], short = [];
  const usedPicks = new Set();
  for (const r of reqs) {
    tot += r.w;
    let best = 0, by = null;
    for (const h of held) { const c = mkCover(r, h.k); if (c > best) { best = c; by = h; } }
    if (by && by.ml && r.ml && r.ml > by.ml) { short.push(`${r.ml} ml ${r.it.n} (you have ${by.ml})`); best *= 0.6; }
    got += best * r.w;
    if (!best) { if (r.w >= 1) miss.push(r.it.n); continue; }
    if (best < 1) swaps.push(`${mkName(by.k)} for ${r.it.n}`);
    if (picked.has(by.k) && !usedPicks.has(by.k)) { usedPicks.add(by.k); used++; }
  }
  return { d, score: tot ? got / tot : 0, miss, swaps, short, used };
}
function mkHeld(picks, withBar, basics) {
  const m = new Map();
  for (const p of picks) m.set(p.k, p);
  if (withBar) for (const k of mk.bar) if (!m.has(k)) m.set(k, { k });
  if (basics) for (const k of MK_BASICS) if (!m.has(k)) m.set(k, { k });
  return [...m.values()];
}
const mkKindOk = (d, kind) => kind === "all" || mkKids(d) === kind;
function mkMatches() {
  const picked = new Set(mk.pick.map((p) => p.k));
  const held = mkHeld(mk.pick, mk.opt.useBar, mk.opt.basics);
  // With picks, every drink must use at least one of them. With none, it ranks what My bar can make.
  const anchor = picked.size ? picked : new Set(mk.opt.useBar ? mk.bar : []);
  if (!anchor.size) return null;
  return D.filter((d) => mkKindOk(d, mk.opt.kind)).map((d) => mkScore(d, held, anchor))
    .filter((r) => r.used > 0 && r.score >= 0.45)
    .sort((a, b) => a.miss.length - b.miss.length || b.score - a.score || b.used - a.used || a.short.length - b.short.length || (b.d.official ? 1 : 0) - (a.d.official ? 1 : 0));
}
// Can My bar (and the basics) make this drink with nothing missing?
const mkCanMake = (d) => !mkScore(d, mkHeld([], true, true), new Set(mk.bar)).miss.length;

/* ---------- Looks ---------- */
document.head.insertAdjacentHTML("beforeend", `<style>
.seg.mk-seg{grid-template-columns:repeat(4,1fr);margin-top:10px}.seg.mk-seg button{padding:8px 4px}
.mk-in{position:relative}
.mk-sugg{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.mk-sugg .chip{color:var(--fg);min-height:36px}
.mk-sugg .chip small{color:var(--muted);margin-left:6px;font-size:12px}
.mk-picks{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.mk-pk{display:inline-flex;align-items:center;border:1px solid var(--brass);border-radius:999px;background:var(--surface);overflow:hidden}
.mk-pk button{min-height:38px;padding:6px 10px;font-size:15px}
.mk-pk .ml{color:var(--brass);font-weight:700;padding-right:4px}
.mk-pk .x{color:var(--muted);padding:6px 12px 6px 4px;font-size:18px;line-height:1}
.mk-mls{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;padding:10px;border:1px solid var(--line);border-radius:12px;background:var(--surface)}
.mk-mls .mini{width:100%;margin:0 0 2px}
.mk-mls .chip{color:var(--fg);min-height:36px}
.mk-opts{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.mk-opts .chip{min-height:36px}
.mk-cat{border-top:1px solid var(--line)}
.mk-cat summary{list-style:none;cursor:pointer;padding:12px 0;font-weight:700;display:flex;justify-content:space-between;align-items:center}
.mk-cat summary::-webkit-details-marker{display:none}
.mk-cat summary span{color:var(--muted);font-weight:400;font-size:14px}
.mk-cat summary::after{content:"\\203a";color:var(--muted);font-size:20px;transition:transform .15s}
.mk-cat[open] summary::after{transform:rotate(90deg)}
.mk-cat .wrap{display:flex;flex-wrap:wrap;gap:6px;padding-bottom:12px}
.mk-cat .chip{color:var(--fg);min-height:36px}
.mk-cat .chip.gen{border-style:dashed}
.mk-res{display:grid;grid-template-columns:40px 1fr;gap:12px;align-items:start;width:100%;text-align:left;padding:10px 0;border-bottom:1px solid var(--line)}
.mk-res .g{display:block;width:40px;height:46px;color:var(--fg)}.mk-res .g svg{width:100%;height:100%}
.mk-res .n{font-weight:700;font-size:17px;display:flex;justify-content:space-between;gap:8px}
.mk-res .pc{font-size:13px;color:var(--brass);font-weight:700;white-space:nowrap}
.mk-res .ln{font-size:14px;color:var(--muted);margin-top:2px}
.mk-res .ln b{color:var(--fg);font-weight:400}
.mk-res .miss{color:var(--warn)}
.mk-res .swap{color:var(--ok)}
.mk-res .spec{font-size:14px;margin-top:4px;color:var(--fg)}
.mk-bar{height:4px;border-radius:2px;background:var(--line);margin-top:6px;overflow:hidden}.mk-bar i{display:block;height:100%;background:var(--brass)}
.mk-rnd{margin-top:16px;padding:18px;border:1px solid var(--line);border-radius:16px;background:var(--surface);text-align:center}
.mk-rnd .g{display:block;width:90px;height:104px;margin:0 auto;color:var(--fg)}.mk-rnd .g svg{width:100%;height:100%}
.mk-rnd h3{font-family:var(--display);font-size:34px;margin:8px 0 2px;text-transform:uppercase;letter-spacing:.5px}
.mk-rnd .sub{color:var(--muted);font-size:14px}
.mk-rnd ul{list-style:none;padding:0;margin:14px 0 0;text-align:left;font-size:16px}
.mk-rnd li{padding:6px 0;border-bottom:1px solid var(--line)}
.mk-rnd .mk-how{margin-top:10px;text-align:left;font-size:15px}
.mk-rnd.spin h3{opacity:.55}
.mk-spin{width:100%;margin-top:14px;font-size:19px;min-height:56px}
.mk-q{display:block;width:100%;text-align:left;padding:10px 0;border-bottom:1px solid var(--line)}
.mk-q .n{font-weight:700;font-size:16px;display:flex;justify-content:space-between;gap:8px}
.mk-q .n span{color:var(--muted);font-weight:400;font-size:13px;white-space:nowrap}
.mk-q .s{font-size:14.5px;margin-top:2px}
.mk-q .m{font-size:13.5px;color:var(--muted);margin-top:2px}
.mk-row2{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}
</style>`);
const MK_ICON = `<svg viewBox="0 0 24 24"><path d="M8 3h8l-1 4H9z"/><path d="M9 7h6l1.5 13a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1z"/><path d="M8 12h8"/></svg>`;

/* ---------- Drawing ---------- */
const mkShort = (d) => d.spec.map((s) => s.replace(/^Top about /i, "Top ~")).join(" · ");
const mkChip = (it, on, attr) => `<button class="chip${it.gen ? " gen" : ""}" aria-pressed="${on}" data-${attr}="${esc(it.k)}">${esc(it.n)}</button>`;
function mkCatsHtml(on, attr) {
  return MK_CATS.map(([cat]) => {
    const its = MK.items.filter((i) => i.cat === cat), n = its.filter((i) => on.has(i.k)).length;
    return `<details class="mk-cat"><summary>${esc(cat)}<span>${n ? `${n} picked · ` : ""}${its.length}</span></summary><div class="wrap">${its.map((i) => mkChip(i, on.has(i.k), attr)).join("")}</div></details>`;
  }).join("");
}
// Suggestions while typing: exact words first, then near spellings ("el jimandor" finds El Jimador).
function mkLev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const p = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) { let prev = p[0]; p[0] = i; for (let j = 1; j <= b.length; j++) { const t = p[j]; p[j] = Math.min(p[j] + 1, p[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; } }
  return p[b.length];
}
const mkWordHit = (w, words) => words.some((x) => x.startsWith(w) || (w.length >= 4 && mkLev(w, x.slice(0, w.length + 1)) <= (w.length >= 7 ? 2 : 1)) || (w.length >= 4 && mkLev(w, x) <= (w.length >= 7 ? 2 : 1)));
function mkSuggest(q) {
  const t = mkNorm(q); if (!t) return [];
  const qw = t.split(" ");
  return MK.items.map((it) => {
    let s = 0;
    for (const a of it.al) {
      if (a === t) s = Math.max(s, 5);
      else if (a.startsWith(t)) s = Math.max(s, 4);
      else if (a.includes(t)) s = Math.max(s, 3);
      else if (qw.every((w) => mkWordHit(w, a.split(" ")))) s = Math.max(s, 2);
    }
    return [it, s - (it.gen ? 0 : 0.1)];
  }).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1] || a[0].n.length - b[0].n.length).slice(0, 8).map(([it]) => it);
}
// "50ml vodka", "vodka 50 ml" and "vodka" all work.
function mkTyped(text) {
  const m = text.match(/^\s*(\d+(?:\.\d+)?)\s*ml\s+(.+)$/i) || text.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*ml\s*$/i);
  if (!m) return { name: text.trim(), ml: null };
  return /^\d/.test(m[1]) ? { name: m[2].trim(), ml: +m[1] } : { name: m[1].trim(), ml: +m[2] };
}
function mkTypeBox(where, ph) {
  const v = mk.typed[where], { name } = mkTyped(v), s = mkSuggest(name);
  const tip = v.trim() ? `<div class="mk-sugg">${s.map((it) => `<button class="chip" data-mk-add="${esc(it.k)}" data-mk-to="${where}">${esc(it.n)}<small>${esc(it.cat.split(" ")[0])}</small></button>`).join("")}<button class="chip" data-mk-add="~" data-mk-to="${where}">Add “${esc(name)}” as typed</button></div>` : "";
  return `<div class="search mk-in"><input id="mk-t-${where}" type="search" placeholder="${ph}" autocomplete="off" enterkeyhint="done" value="${esc(v)}" aria-label="${ph}"></div><div id="mk-s-${where}">${tip}</div>`;
}
function mkResHtml(r) {
  const d = r.d, pc = Math.round(r.score * 100);
  const bits = [];
  if (r.miss.length) bits.push(`<span class="miss">Missing ${esc(r.miss.join(", "))}</span>`);
  if (r.swaps.length) bits.push(`<span class="swap">Swap ${esc(r.swaps.slice(0, 3).join("; "))}</span>`);
  if (r.short.length) bits.push(`<span class="miss">Needs ${esc(r.short.join("; "))}</span>`);
  return `<button class="mk-res" data-mk-open="${d.id}"><span class="g" aria-hidden="true">${glass(d)}</span><div><div class="n">${esc(d.name)}<span class="pc">${r.miss.length ? pc + "%" : r.short.length ? "Short" : r.swaps.length ? (r.swaps.length > 1 ? "With swaps" : "With a swap") : "Ready"}</span></div>
    <div class="ln">${esc(d.glass)} · ${esc(d.method)}</div>${bits.length ? `<div class="ln">${bits.join(" · ")}</div>` : ""}<div class="spec">${esc(mkShort(d))}</div><div class="mk-bar"><i style="width:${pc}%"></i></div></div></button>`;
}
const MK_KINDS = [["all", "Everything"], ["cocktail", "Cocktails"], ["zero", "Mocktails"], ["shot", "Shots"]];
function mkMakePane() {
  const on = new Set(mk.pick.map((p) => p.k));
  const ed = mk.edit && mk.pick.find((p) => p.k === mk.edit);
  const picks = mk.pick.length ? `<div class="mk-picks">${mk.pick.map((p) => `<span class="mk-pk"><button data-mk-ml="${esc(p.k)}" aria-label="Set ml for ${esc(mkName(p.k))}">${p.ml ? `<span class="ml">${p.ml} ml</span>` : ""}${esc(mkName(p.k))}${p.k.startsWith("~") ? " ✎" : ""}</button><button class="x" data-mk-rm="${esc(p.k)}" aria-label="Remove ${esc(mkName(p.k))}">×</button></span>`).join("")}</div>
    ${ed ? `<div class="mk-mls"><div class="mini">How much ${esc(mkName(ed.k))} do you want to use?</div>${[null, 10, 12.5, 15, 20, 25, 35, 50, 75, 100].map((n) => `<button class="chip" aria-pressed="${(ed.ml || null) === n}" data-mk-setml="${n ?? ""}">${n ? n + " ml" : "Any amount"}</button>`).join("")}</div>` : `<p class="note">Tap an ingredient to set the ml you want to use.</p>`}
    <div class="mk-row2"><button class="btn" data-mk="keep">☆ Keep in My bar</button><button class="btn" data-mk="clear">Clear picks</button></div>` : "";
  const opts = `<div class="mk-opts"><button class="chip" aria-pressed="${mk.opt.useBar}" data-mk-opt="useBar">Add My bar (${mk.bar.length})</button><button class="chip" aria-pressed="${mk.opt.basics}" data-mk-opt="basics">Bar basics</button></div>
    <p class="note" style="margin-top:4px">Bar basics: sugar syrup, lime, lemon, soda, Angostura and salt.</p>`;
  const res = mkMatches();
  let out;
  if (!res) out = `<p class="empty">Pick or type what you've got, like vodka, Aperol or lime juice.<br>Or keep your bottles in My bar and every drink you can make shows here.</p>`;
  else {
    MK.ids = res.map((r) => r.d.id);
    const ready = res.filter((r) => !r.miss.length), one = res.filter((r) => r.miss.length === 1), more = res.filter((r) => r.miss.length > 1).slice(0, 20);
    const block = (t, a) => a.length ? `<div class="sec">${t}<span class="cnt">${a.length}</span></div>${a.slice(0, 40).map(mkResHtml).join("")}` : "";
    out = res.length ? block("Make it now", ready) + block("Missing one thing", one) + block("Close", more)
      : `<p class="empty">Nothing in the book uses those. Try a generic, like “Gin”, or add the basics.</p>`;
  }
  return `${mkTypeBox("make", "Type anything: vodka, 50ml lime…")}${picks}${opts}
    <div class="chips hrow" role="toolbar" aria-label="Show">${MK_KINDS.map(([k, l]) => `<button class="chip" aria-pressed="${mk.opt.kind === k}" data-mk-kind="${k}">${l}</button>`).join("")}</div>
    <div id="mk-out">${out}</div>
    <div class="h3">Everything we stock and more</div><p class="note" style="margin-top:0">Tap to pick. Dashed ones mean any bottle of that kind.</p>${mkCatsHtml(on, "mk-pick")}`;
}
function mkBarPane() {
  const on = new Set(mk.bar);
  // In list order, and folded away once it's long (the whole Black Tap bar is 130 items).
  const order = (k) => (k.startsWith("~") ? 1e4 : MK.items.indexOf(MK.byKey.get(k)));
  const sorted = [...mk.bar].sort((a, b) => order(a) - order(b));
  const chips = `<div class="mk-picks">${sorted.map((k) => `<span class="mk-pk"><button data-mk-usek="${esc(k)}">${esc(mkName(k))}</button><button class="x" data-mk-unbar="${esc(k)}" aria-label="Remove ${esc(mkName(k))}">×</button></span>`).join("")}</div>`;
  const mine = mk.bar.length ? `${mk.bar.length > 20 ? `<details class="mk-cat"><summary>Everything in My bar<span>${mk.bar.length}</span></summary>${chips}</details>` : chips}
    <p class="note">${mk.bar.length} kept on this phone. Tap one to make with it.</p>
    <div class="mk-row2"><button class="btn pri" data-mk="frombar">What can I make?</button><button class="btn" data-mk="clearbar">Clear My bar</button></div>`
    : `<p class="empty" style="padding:16px 0">Nothing kept yet. Add the exact bottles (El Jimador Blanco, Cîroc Red Berry) or just the kind (Vodka).</p>`;
  return `<p class="lead">The bottles you have, at work or at home. Kept on this phone.</p>
    <div class="mk-row2"><button class="btn" data-mk="bt">Load the Black Tap bar</button><button class="btn" data-mk="frombar"${mk.bar.length ? "" : " disabled"}>Make from My bar</button></div>
    <div style="margin-top:12px">${mkTypeBox("bar", "Add a bottle, juice or syrup")}</div>${mine}
    <div class="h3">Add from the list</div>${mkCatsHtml(on, "mk-bar")}`;
}
function mkPool() {
  return D.filter((d) => (mk.rnd.mode === "any" || (mk.rnd.mode === "zero") === (mkKids(d) === "zero"))
    && (mk.rnd.mode !== "alc" || mk.rnd.kind === "all" || (mk.rnd.kind === "spritz" ? /Spritz/.test(d.section) : mkKids(d) === mk.rnd.kind))
    && !isOut(d.name) && (!mk.rnd.mine || mkCanMake(d)));
}
function mkRndCard(d) {
  if (!d) return `<div class="mk-rnd"><p class="sub" style="margin:0">Tap Spin and the book picks one for you.</p></div>`;
  return `<div class="mk-rnd" id="mk-card"><span class="g" aria-hidden="true">${glass(d)}</span><h3>${esc(d.name)}</h3><div class="sub">${esc(d.section)} · ${esc(blurb(d))}</div>
    <ul>${d.spec.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
    <div class="mk-how"><b>${esc(d.glass)}</b> · ${esc(d.ice)}<br>${esc(d.method)}<br>Garnish: ${esc(d.garnish)}</div>
    <button class="btn wide" data-mk-open="${d.id}">Open the full spec and step by step</button></div>`;
}
function mkRndPane() {
  const pool = mkPool();
  const seg = (k, l) => `<button aria-pressed="${mk.rnd.mode === k}" data-mk-rmode="${k}">${l}</button>`;
  return `<p class="lead">Can't decide? Spin for a drink. Hugo Spritz or a Jägerbomb, the book picks.</p>
    <div class="seg" style="grid-template-columns:repeat(3,1fr)" role="group" aria-label="Alcohol">${seg("alc", "Alcoholic")}${seg("zero", "Alcohol-free")}${seg("any", "Either")}</div>
    ${mk.rnd.mode === "alc" ? `<div class="chips hrow">${[["all", "Any"], ["cocktail", "Cocktail"], ["spritz", "Spritz"], ["shot", "Shot"]].map(([k, l]) => `<button class="chip" aria-pressed="${mk.rnd.kind === k}" data-mk-rkind="${k}">${l}</button>`).join("")}</div>` : ""}
    <div class="mk-opts"><button class="chip" aria-pressed="${mk.rnd.mine}" data-mk-rmine="1">Only what My bar can make</button></div>
    <p class="note">${pool.length} ${pool.length === 1 ? "drink" : "drinks"} in the hat.${mk.rnd.mine && !mk.bar.length ? " My bar is empty, so add your bottles first." : ""}</p>
    <div id="mk-rcard">${mkRndCard(mk.rnd.cur && D[mk.rnd.cur])}</div>
    <button class="btn pri mk-spin" data-mk="spin"${pool.length ? "" : " disabled"}>${mk.rnd.cur != null ? "Spin again" : "Spin"}</button>`;
}
function mkQsList() {
  const words = mkNorm(mk.qs.q).split(" ").filter(Boolean);
  const rows = D.filter((d) => mkKindOk(d, mk.qs.kind) && words.every((w) => d._h.includes(w)) && (!mk.qs.mine || mkCanMake(d)));
  MK.ids = rows.map((d) => d.id);
  return `<p class="count">${rows.length} ${rows.length === 1 ? "drink" : "drinks"}</p>${rows.map((d) => `<button class="mk-q" data-mk-open="${d.id}"><div class="n">${esc(d.name)}<span>${esc(d.glass)}</span></div><div class="s">${esc(mkShort(d))}</div><div class="m">${esc(d.method)} · ${esc(d.garnish)}</div></button>`).join("") || `<p class="empty">Nothing matches.</p>`}`;
}
function mkQsPane() {
  return `<p class="lead">Every spec on one line, for when it's busy. Tap one for the full card.</p>
    <div class="search"><input id="mk-qs" type="search" placeholder="Search drink or ingredient" autocomplete="off" enterkeyhint="search" value="${esc(mk.qs.q)}" aria-label="Search quick specs"></div>
    <div class="chips hrow">${MK_KINDS.map(([k, l]) => `<button class="chip" aria-pressed="${mk.qs.kind === k}" data-mk-qkind="${k}">${l}</button>`).join("")}<button class="chip" aria-pressed="${mk.qs.mine}" data-mk-qmine="1">My bar can make</button></div>
    <div id="mk-qlist">${mkQsList()}</div>`;
}
function renderMaker() {
  const tabs = [["make", "Make"], ["bar", "My bar"], ["rnd", "Random"], ["qs", "Specs"]];
  const pane = { make: mkMakePane, bar: mkBarPane, rnd: mkRndPane, qs: mkQsPane }[mk.pane] || mkMakePane;
  const open = [...$$("#v-make details[open] summary")].map((s) => s.firstChild.textContent);
  $("#v-make").innerHTML = `<h2 style="font-size:28px;margin-top:12px">Cocktail maker</h2>
    <div class="seg mk-seg" role="group" aria-label="Cocktail maker">${tabs.map(([k, l]) => `<button aria-pressed="${mk.pane === k}" data-mk-pane="${k}">${l}</button>`).join("")}</div>
    <div id="mk-pane">${pane()}</div>`;
  // Keep the same ingredient groups open after a tap.
  $$("#v-make details").forEach((x) => { if (open.includes(x.querySelector("summary").firstChild.textContent)) x.open = true; });
}
// Redraw without losing the page position or the keyboard.
function mkRedraw(focus) {
  const y = window.scrollY; renderMaker(); window.scrollTo(0, y);
  if (focus) { const i = $(focus); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
}
function mkAdd(where, k, ml) {
  if (where === "bar") { if (!mk.bar.includes(k)) mk.bar.push(k); }
  else { const p = mk.pick.find((x) => x.k === k); if (p) { if (ml) p.ml = ml; } else mk.pick.push(ml ? { k, ml } : { k }); }
  mk.typed[where] = ""; mkSave(); haptic();
}
let mkSpinT = null;
function mkSpin() {
  const pool = mkPool(); if (!pool.length) return;
  // Avoid the last few picks so it doesn't repeat itself.
  const fresh = pool.filter((d) => !mk.rnd.last.includes(d.id)), from = fresh.length ? fresh : pool;
  const pick = from[Math.floor(Math.random() * from.length)];
  mk.rnd.last = [pick.id, ...mk.rnd.last].slice(0, Math.min(8, Math.max(0, pool.length - 1)));
  clearInterval(mkSpinT);
  const land = () => { mk.rnd.cur = pick.id; mkSave(); $("#mk-rcard").innerHTML = mkRndCard(pick); $("[data-mk=spin]").textContent = "Spin again"; haptic(); };
  if (calm()) return land();
  let n = 0;
  mkSpinT = setInterval(() => {
    const d = pool[Math.floor(Math.random() * pool.length)];
    $("#mk-rcard").innerHTML = `<div class="mk-rnd spin"><span class="g" aria-hidden="true">${glass(d)}</span><h3>${esc(d.name)}</h3></div>`;
    if (++n >= 9) { clearInterval(mkSpinT); land(); }
  }, 70);
}
$("#v-make").addEventListener("input", (e) => {
  const t = e.target;
  if (t.id === "mk-qs") { mk.qs.q = t.value; $("#mk-qlist").innerHTML = mkQsList(); return; }
  const where = t.id === "mk-t-make" ? "make" : t.id === "mk-t-bar" ? "bar" : null; if (!where) return;
  mk.typed[where] = t.value;
  const box = document.createElement("div"); box.innerHTML = mkTypeBox(where, "");
  $("#mk-s-" + where).innerHTML = box.querySelector("#mk-s-" + where).innerHTML;
});
$("#v-make").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const where = e.target.id === "mk-t-make" ? "make" : e.target.id === "mk-t-bar" ? "bar" : null; if (!where) return;
  e.preventDefault();
  const { name, ml } = mkTyped(e.target.value); if (!name) return;
  const best = mkSuggest(name)[0];
  mkAdd(where, best ? best.k : "~" + name, ml); mkRedraw("#mk-t-" + where);
});
$("#v-make").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b || !b.dataset) return;
  const ds = b.dataset;
  if (ds.mkOpen) { openSheet(+ds.mkOpen); return; }
  if (ds.mkPane) { mk.pane = ds.mkPane; mk.edit = null; mkSave(); renderMaker(); window.scrollTo(0, 0); return; }
  if (ds.mkAdd) {
    const where = ds.mkTo, { name, ml } = mkTyped(mk.typed[where]);
    mkAdd(where, ds.mkAdd === "~" ? "~" + name : ds.mkAdd, ml); return mkRedraw();
  }
  if (ds.mkPick) { const i = mk.pick.findIndex((p) => p.k === ds.mkPick); if (i >= 0) mk.pick.splice(i, 1); else mk.pick.push({ k: ds.mkPick }); mkSave(); haptic(); return mkRedraw(); }
  if (ds.mkBar) { const i = mk.bar.indexOf(ds.mkBar); if (i >= 0) mk.bar.splice(i, 1); else mk.bar.push(ds.mkBar); mkSave(); haptic(); return mkRedraw(); }
  if (ds.mkRm) { mk.pick = mk.pick.filter((p) => p.k !== ds.mkRm); if (mk.edit === ds.mkRm) mk.edit = null; mkSave(); return mkRedraw(); }
  if (ds.mkUnbar) { mk.bar = mk.bar.filter((k) => k !== ds.mkUnbar); mkSave(); return mkRedraw(); }
  if (ds.mkUsek) { if (!mk.pick.some((p) => p.k === ds.mkUsek)) mk.pick.push({ k: ds.mkUsek }); mk.pane = "make"; mkSave(); renderMaker(); window.scrollTo(0, 0); return; }
  if (ds.mkMl) { mk.edit = mk.edit === ds.mkMl ? null : ds.mkMl; return mkRedraw(); }
  if ("mkSetml" in ds) { const p = mk.pick.find((x) => x.k === mk.edit); if (p) { if (ds.mkSetml) p.ml = +ds.mkSetml; else delete p.ml; } mk.edit = null; mkSave(); return mkRedraw(); }
  if (ds.mkOpt) { mk.opt[ds.mkOpt] = !mk.opt[ds.mkOpt]; mkSave(); return mkRedraw(); }
  if (ds.mkKind) { mk.opt.kind = ds.mkKind; mkSave(); return mkRedraw(); }
  if (ds.mkRmode) { mk.rnd.mode = ds.mkRmode; mk.rnd.cur = null; mkSave(); return mkRedraw(); }
  if (ds.mkRkind) { mk.rnd.kind = ds.mkRkind; mk.rnd.cur = null; mkSave(); return mkRedraw(); }
  if (ds.mkRmine) { mk.rnd.mine = !mk.rnd.mine; mk.rnd.cur = null; mkSave(); return mkRedraw(); }
  if (ds.mkQkind) { mk.qs.kind = ds.mkQkind; $("#mk-pane").innerHTML = mkQsPane(); return; }
  if (ds.mkQmine) { mk.qs.mine = !mk.qs.mine; $("#mk-pane").innerHTML = mkQsPane(); return; }
  const a = ds.mk;
  if (a === "spin") return mkSpin();
  if (a === "keep") { for (const p of mk.pick) if (!mk.bar.includes(p.k)) mk.bar.push(p.k); mkSave(); toast(`Kept in My bar (${mk.bar.length})`); return mkRedraw(); }
  if (a === "clear") { mk.pick = []; mk.edit = null; mkSave(); return mkRedraw(); }
  if (a === "clearbar") { if (confirm("Clear everything from My bar on this phone?")) { mk.bar = []; mkSave(); mkRedraw(); } return; }
  if (a === "frombar") { mk.pick = []; mk.opt.useBar = true; mk.pane = "make"; mkSave(); renderMaker(); window.scrollTo(0, 0); return; }
  // Every ingredient the book's own drinks use: what's behind the Black Tap bar.
  if (a === "bt") { const ks = new Set(mk.bar); for (const r of MK.reqs.values()) for (const x of r) ks.add(x.it.k); mk.bar = [...ks]; mkSave(); toast(`My bar has ${mk.bar.length} items`); return mkRedraw(); }
});
