// Bundles drinks.json + glass icons into the single-file app.
const fs = require("fs");
// Drinks data lives outside this repo. Point DATA_DIR at your copy of it to build somewhere else.
const DATA = process.env.DATA_DIR || "/mnt/project-files/black-tap-menu/data/";
const icons = require(DATA + "icons.js");
const src = JSON.parse(fs.readFileSync(DATA + "drinks.json", "utf8"));
const dark = (s) => s.replace(/#1a1a1a/g, "currentColor");
// Notes about checking a wall card are for the menu writers, not the bar team.
const clean = (t) => t && t.replace(/\s*\((?:website says|overwritten|as read|card says|card has)[^)]*\)/gi, "");
// Owner's call: no frozen drinks, no spiked shakes, no shake-station dessert drinks and no shake pairings in the bar book.
// Manhattan: replaced by the corrected versions in extras.js. Bramble is back (owner, 3 Nov 2026: list it whatever the stock).
const DROP = new Set(["Soho Sizzle", "The Bronx Boss", "Manhattan"]);
const SHAKE_STATION = new Set(["Spiked Egg Cream", "Brooklyn Egg Cream", "Fairground", "PB&J", "Salted Caramel"]);
const noShake = (d) => d.section !== "Spike Your Shake" && d.section !== "Soho Originals" && !SHAKE_STATION.has(d.name);
const unpairShake = (d) => ({
  ...d,
  blurb: d.blurb && d.blurb.replace(/\s*· pairs with [^·]*shake$/i, ""),
  desc: d.desc && d.desc.replace(/\s*Pairs with [^.]*shake\.$/i, ""),
  pairsWith: /shake$/i.test(d.pairsWith || "") ? undefined : d.pairsWith,
});
// Not stocked at Black Tap Soho (Emily, bar team, 9 Nov 2026): these stay in the data but leave the app and the cheat sheets.
// By name, plus anything that needs a bottle the bar doesn't carry.
const NOT_STOCKED = new Set(["Bramble", "Caipirinha", "Kir Royale", "Chambord Royale", "Lychee Martini", "Aviation", "Gin Basil Smash", "Brandy Crusta", "Brandy Alexander",
  "Bobby Burns", "Corpse Reviver No. 2", "Tuxedo", "Paper Plane", "Moonwalk", "Grasshopper", "Hanky Panky", "Hemingway Daiquiri", "Nuclear Daiquiri",
  "Charlie Chaplin", "20th Century", "B&B", "Rusty Nail", "White Negroni", "Singapore Sling", "Last Word", "Vesper"]);
// Emily's list also rules out Fernet, green Chartreuse and sloe gin (15 Nov 2026: Fernandito, Tipperary, Alabama Slammer go).
const NOT_STOCKED_BOTTLE = /b[ée]n[ée]dictine|lillet|apricot|peychaud|maraschino|cassis|fernet|green chartreuse|sloe gin/i;
const stocked = (d) => !NOT_STOCKED.has(d.name) && !d.spec.some((l) => NOT_STOCKED_BOTTLE.test(l));
const extras = require("./extras.js")(icons);
const { fixGuide, fixDrink, tidyMethod } = require("./builds.js");
const drinks = [...src.drinks.filter((d) => !DROP.has(d.name) && noShake(d)).map(unpairShake), ...extras.map((x) => x.drink)].map((d) => ({ ...d, spec: d.spec.map(clean) })).map(fixDrink).filter(stocked).map(({ price, ...d }, i) => ({
  // No prices in the staff app (owner, 24 Oct)
  id: i, ...d, spec: d.spec.map(clean),
  g: icons.glassKind(d.glass.replace(/spritz/i, "wine")),
  c: icons.colourFor(d),
}));
const glassSvg = {};
for (const k of Object.keys(icons.glass)) glassSvg[k] = dark(icons.glass[k]("__C__"));
const sceneArt = require(DATA + "guide-art.js").scene;
const scene = (...a) => sceneArt(...a).replace(/Any 4 for £\d+/g, "Pick any 4"); // no prices in the app
const scenes = [], sceneIdx = new Map();
const guides = {};
const byName = new Map(drinks.map((d) => [d.name, d]));
// Guides for drinks taken off (not stocked) go too; the Shot tray guide has no drink of its own.
const allNames = new Set([...src.drinks, ...extras.map((x) => x.drink)].map((d) => d.name));
for (const raw of [...require(DATA + "guides.json").guides.filter((g) => !DROP.has(g.name) && noShake(g)), ...extras.map((x) => x.guide)].filter((g) => byName.has(g.name) || !allNames.has(g.name))) {
  const g = byName.has(raw.name) ? { ...fixGuide(raw, byName.get(raw.name)), glassKind: byName.get(raw.name).g } : raw;
  guides[g.name] = { tools: g.tools, steps: g.steps.map((st) => {
    const svg = scene(st, g);
    if (!sceneIdx.has(svg)) { sceneIdx.set(svg, scenes.length); scenes.push(svg); }
    return { n: st.n, title: st.title, double: !!st.double, text: clean(st.text), items: (st.items || []).map((i) => ({ ml: i.ml, item: clean(i.item), hint: i.hint, note: /website says|check|as read|card says/i.test(i.note || "") ? null : i.note })), sv: sceneIdx.get(svg) };
  }) };
}
for (const d of drinks) if (!guides[d.name]) throw new Error("No guide for " + d.name);
for (const d of drinks) d.method = tidyMethod(d, guides[d.name]);
const names = drinks.map((d) => d.name);
if (new Set(names).size !== names.length) throw new Error("Duplicate drink name");
// UK law: gin, rum, vodka and whisky sold on the premises go in 25 ml or 35 ml steps (this bar: 25 ml), unless mixed
// with two or more other liquids (Weights and Measures (Intoxicating Liquor) Order 1988, article 3).
const LAW_SPIRIT = /\b(gin|vodka|rum|whiske?y|bourbon|scotch|rye|tanqueray|smirnoff|grey goose|ciroc|captain morgan|kraken|bacardi|wray|jameson|jack daniel|bulleit|jw black|aviation)\b/i;
const NOT_SPIRIT = /liqueur|syrup|juice|cordial|vermouth|cream|beer|ginger|tonic|sloe|schnapps|bitters|falernum|pur[ée]e|cola|soda|lemonade|brine/i;
for (const d of drinks) {
  const liquids = d.spec.filter((l) => /\bml\b|^top\b/i.test(l));
  if (liquids.length >= 3) continue;
  for (const l of liquids) {
    const m = l.match(/^([\d.]+) ml (.*)/);
    if (m && LAW_SPIRIT.test(m[2]) && !NOT_SPIRIT.test(m[2]) && +m[1] % 25) throw new Error(`${d.name}: "${l}" breaks the 25 ml rule for gin, rum, vodka and whisky`);
  }
}
const data = { guides, scenes, drinks, prep: src.prep.map((p) => ({ ...p, spec: p.spec.map(clean) })), };
const tpl = fs.readFileSync("template.html", "utf8");
// Languages load only when picked (site.js writes lang/<code>.json), so English stays small and fast. The page gets
// the list of languages and a fingerprint of the words, so a phone knows when its saved copy is out of date.
function i18nHead() {
  const raw = fs.readFileSync("i18n.json", "utf8");
  return { langs: JSON.parse(raw).langs, v: require("crypto").createHash("sha1").update(raw).digest("hex").slice(0, 10) };
}
// The cocktail maker (Make tab) goes in near the end of the script, once the drinks and helpers it reads exist.
fs.writeFileSync("black-tap-bar-app.html", tpl.replace("/*DATA*/", () => "const DATA = " + JSON.stringify(data) + ";\n" + fs.readFileSync("art.js", "utf8")).replace("/*MAKER*/", () => fs.readFileSync("maker.js", "utf8")).replace("/*RAPID*/", () => fs.readFileSync("rapid.js", "utf8") + fs.readFileSync("station.js", "utf8")).replace("/*PLUS*/", () => fs.readFileSync("plus.js", "utf8") + fs.readFileSync("plus-out.js", "utf8") + fs.readFileSync("items.js", "utf8") + fs.readFileSync("count.js", "utf8") + fs.readFileSync("manager.js", "utf8") + fs.readFileSync("bar101.js", "utf8")).replace("/*HELP*/", () => fs.readFileSync("help.js", "utf8") + fs.readFileSync("logit.js", "utf8") + fs.readFileSync("guide.js", "utf8")).replace("/*CHEAT*/", () => "const CHEAT_FONT = \"data:font/woff2;base64," + fs.readFileSync("oswald.woff2").toString("base64") + "\";\n" + fs.readFileSync("cheatsheet.js", "utf8").replace(/\nif \(typeof module[^\n]*/, "")).replace("/*I18N*/", () => "const I18N = " + JSON.stringify(i18nHead()) + ";"));
console.log("drinks", drinks.length, "bytes", fs.statSync("black-tap-bar-app.html").size);
