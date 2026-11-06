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
const extras = require("./extras.js")(icons);
const { fixGuide, fixDrink, tidyMethod } = require("./builds.js");
const drinks = [...src.drinks.filter((d) => !DROP.has(d.name) && noShake(d)).map(unpairShake), ...extras.map((x) => x.drink)].map((d) => ({ ...d, spec: d.spec.map(clean) })).map(fixDrink).map(({ price, ...d }, i) => ({
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
for (const raw of [...require(DATA + "guides.json").guides.filter((g) => !DROP.has(g.name) && noShake(g)), ...extras.map((x) => x.guide)]) {
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
const data = { guides, scenes, drinks, prep: src.prep.map((p) => ({ ...p, spec: p.spec.map(clean) })), };
const tpl = fs.readFileSync("template.html", "utf8");
// The cocktail maker (Make tab) goes in near the end of the script, once the drinks and helpers it reads exist.
fs.writeFileSync("black-tap-bar-app.html", tpl.replace("/*DATA*/", () => "const DATA = " + JSON.stringify(data) + ";\n" + fs.readFileSync("art.js", "utf8")).replace("/*MAKER*/", () => fs.readFileSync("maker.js", "utf8")).replace("/*I18N*/", () => "const I18N = " + fs.readFileSync("i18n.json", "utf8").trim() + ";"));
console.log("drinks", drinks.length, "bytes", fs.statSync("black-tap-bar-app.html").size);
