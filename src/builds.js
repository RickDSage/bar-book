// House rules for how every drink is built, applied to all guides so they stay consistent:
// 1. Nothing fizzy goes in the shaker. Lemonade, soda, Prosecco, tonic and so on go on top after straining.
// 2. Double strain (Hawthorne + fine strainer) when the drink is served up with no ice, or when the tin
//    holds herbs, fruit, chilli, marmalade, purée or a foam. Otherwise a single Hawthorne strain. Shots: single.
const FIZZ = /lemonade|soda|prosecco|tonic|ginger beer|ginger ale|cola|coke|red bull|sprite/i;
const BITS = /mint|basil|passion fruit|marmalade|jalape|chilli|cucumber|purée|puree|raspberr|blackberr|strawberr|lime, cut/i;

// Spec and method text that the rules above change, and method lines reworded to match the rest of their family.
const METHOD = {
  "London Cosmo": "Shake hard, double strain, top with a dash of lemonade",
  "Uptown Hustle": "Shake hard, double strain",
  "Salted Caramel Buzz": "Shake very hard, double strain",
  "The Paddington": "Dry shake, shake with ice, double strain over a large cube, zest orange peel on top",
  "Margarita": "Shake, strain over fresh ice",
  "Tommy's Margarita": "Shake, strain over fresh ice",
  "Mezcal Margarita": "Shake, strain over fresh ice",
  "Bellini": "Purée first, top Prosecco slowly, gentle lift",
  "Chambord Royale": "Chambord first, top Prosecco slowly",
  "Mimosa": "Orange juice first, top Prosecco slowly",
  "Bramble": "Shake gin, lemon and sugar, strain over crushed ice, drizzle crème de mûre on top",
  "Jägerbomb": "Pour the shot. Pour half a can of Red Bull into a rocks glass. Serve side by side, guest drops the shot in",
};
// Checked against the IBA official recipes (iba-world.com, 24 Oct 2026) and Difford's Guide (25 Oct 2026).
// Ratios follow the source, rounded to our jiggers.
// ml: new measure by ingredient; rename: swap an ingredient; drop: remove it; text: replace step text by scene.
const HINT = { 50: "the 50 side", 25: "the 25 side", 12.5: "half a 25", 75: "50 + 25", 100: "50 + 50" };
const FIX = {
  "Margarita": { ml: { "Cointreau": 20, "lime juice": 15 } },
  "Mezcal Margarita": { ml: { "Cointreau": 20, "lime juice": 15 } },
  "Daiquiri": { ml: { "lime juice": 20 } },
  "Whiskey Sour": { ml: { "sugar syrup": 20 } },
  "French Martini": { ml: { "Chambord": 15, "pineapple juice": 15 }, text: { shake: "Fill the tin with ice. Seal it and shake hard for 10 to 12 seconds." } },
  "Lemon Drop Martini": { rename: { "Luxardo Limoncello": "Cointreau" }, ml: { "Smirnoff": 40, "Cointreau": 25, "lemon juice": 20 }, drop: ["sugar syrup"] },
  "Boulevardier": { ml: { "Bulleit Bourbon": 35 } },
  "Mojito": { ml: { "lime juice": 20, "sugar syrup": 15 } },
  "Long Island Iced Tea": { ml: { "Smirnoff": 15, "Tanqueray": 15, "Captain Morgan White": 15, "El Jimador Blanco": 15, "Cointreau": 15, "sugar syrup": 25 },
    spec: ["15 ml each: Smirnoff, Tanqueray, Captain Morgan White, El Jimador Blanco, Cointreau", "25 ml lemon juice", "25 ml sugar syrup", "Top Coca-Cola"],
    text: { pourGlass: "Measure each one with the jigger. Five spirits at 15 ml each, then lemon and sugar." } },
  "Mimosa": { ml: { "orange juice": 75, "Prosecco": 75 } },
  // Four of the single serve, and "As Mojito" means the same lime and sugar.
  "Mojito Pitcher": { ml: { "lime juice": 80, "sugar syrup": 60 } },
  "Virgin Mojito": { ml: { "lime juice": 20, "sugar syrup": 15 } },
  // The guide presses a lime wedge with the mint.
  "Hugo Spritz": { spec: ["4 mint leaves", "1 lime wedge", "25 ml elderflower cordial", "100 ml Prosecco", "25 ml soda"] },
  "Bellini": { text: { lift: "Lift once with the bar spoon to mix the purée through." } },
  "Tequila Sunrise": { ml: { "grenadine": 15 } },
  "Lynchburg Lemonade": { ml: { "Cointreau": 25, "lemon juice": 25 } },
  // Camden Hells isn't on our taps.
  // 3 Nov 2026 audit against iba-world.com (Espresso Martini, Porn Star Martini, Mai Tai, Paloma, Piña Colada,
  // Irish Coffee) and Difford's Guide (Midori Sour). add: lines the source has and our card was missing.
  "Espresso Martini": { ml: { "sugar syrup": 10 } },
  "Hazelnut Espresso Martini": { ml: { "sugar syrup": 10 } },
  "Pornstar Martini": { ml: { "Passoa": 20 } },
  "Mai Tai": { ml: { "Cointreau": 15, "Giffard Orgeat": 15 }, add: ["7.5 ml sugar syrup"] },
  "Paloma": { ml: { "Casamigos Reposado": 50, "agave syrup": 10, "grapefruit juice": 50 }, add: ["Pinch of salt"] },
  "Piña Colada": { ml: { "Coco Real": 30, "pineapple juice": 50 }, drop: ["Malibu", "lime juice"] },
  "Irish Coffee": { ml: { "hot Americano": 120, "double cream, lightly whipped": 50 } },
  "Midori Sour": { ml: { "lemon juice": 15, "lime juice": 15 } },
  // Back on the list now stock doesn't decide it (owner, 3 Nov). IBA: crème de mûre, not Chambord.
  "Bramble": { rename: { "Chambord": "crème de mûre" }, ml: { "crème de mûre": 15 },
    text: { float: "Drizzle the crème de mûre over the top so it bleeds down through the ice." } },
  "Pickleback & a Half": { spec: ["Half pint Stella Artois", "25 ml Jameson", "25 ml chilled pickle brine"], rename: { "Half pint Camden Hells": "Half pint Stella Artois" },
    text: { half: "Pour a half pint of Stella Artois with a neat head." } },
};
// One name for each ingredient in every drink, and one choice where a spec offered two.
const WORDS = {
  // House pour is Bulleit, not Buffalo Trace (owner, 3 Nov 2026).
  "Buffalo Trace": "Bulleit Bourbon",
  "chocolate bitters": "cocoa bitters",
  "cranberry": "cranberry juice",
  "espresso": "fresh espresso",
  "Amarás Mezcal": "Amarás Mezcal Verde",
  "Fever-Tree tonic": "Fever-Tree Indian Tonic",
  "Tanqueray or Grey Goose": "Tanqueray, or Grey Goose on request",
  "Tanqueray, or vodka on request": "Tanqueray, or Grey Goose on request",
  "lemonade or Sprite Zero": "lemonade",
  "hot filter coffee or Americano": "hot Americano",
  "soda or Fever-Tree Light Tonic": "soda",
};
const word = (w) => WORDS[w] || w.replace(/chocolate bitters/, "cocoa bitters");
const PHRASES = Object.keys(WORDS).filter((w) => w.includes(" or "));
const wordText = (t) => PHRASES.reduce((s, w) => s.split(w).join(WORDS[w]), t);
function fixSpec(name, spec) {
  const f = FIX[name] || {};
  if (f.spec) return f.spec;
  const out = spec.flatMap((l) => {
    const t = l.match(/^Top (.*)$/);
    const m = l.match(/^(Top )?([\d.]+) ml (.*)$/); if (!m) return [t ? `Top ${word(t[1])}` : word(l)];
    const item = word((f.rename || {})[m[3]] || m[3]);
    if ((f.drop || []).includes(item)) return [];
    if (item === "aquafaba") return [FOAMER];
    return [`${m[1] || ""}${(f.ml || {})[item] ?? m[2]} ml ${item}`];
  });
  // Added lines go in before a float or a topper, in pour order.
  const at = out.findIndex((l) => /floated$|^Top /.test(l));
  return at < 0 ? [...out, ...(f.add || [])] : [...out.slice(0, at), ...(f.add || []), ...out.slice(at)];
}
// No aquafaba behind the bar: every foam is foamer drops (owner, 3 Nov 2026).
const FOAMER = "2 drops foamer";
const asItem = (l) => { const m = l.match(/^([\d.]+) ml (.*)$/); return m ? { ml: +m[1], item: m[2], hint: HINT[m[1]] || null, note: null, role: "mix" } : { ml: null, item: l, hint: null, note: null, role: "mix" }; };
function fixSteps(name, steps) {
  const f = FIX[name] || {};
  const out = steps.map((s) => {
    const items = s.items && s.items.map((i) => ({ ...i, item: word((f.rename || {})[i.item] || i.item) })).filter((i) => !(f.drop || []).includes(i.item))
      .map((i) => (i.item === "aquafaba" ? { ...i, ml: null, item: FOAMER, hint: null } : i))
      .map((i) => (f.ml || {})[i.item] != null && i.ml != null ? { ...i, ml: f.ml[i.item], hint: HINT[f.ml[i.item]] || null } : i);
    return { ...s, items, text: wordText((f.text || {})[s.scene] || s.text) };
  });
  if (f.add) {
    const pour = out.find((s) => /^pour(Tin|Mix|Glass)$/.test(s.scene));
    if (!pour) throw new Error("No pour step to add to in " + name);
    pour.items = [...pour.items, ...f.add.map(asItem)];
  }
  return out;
}
const fizzLast = (spec) => [...spec.filter((l) => !(FIZZ.test(l) && !/^\d/.test(l))), ...spec.filter((l) => FIZZ.test(l) && !/^\d/.test(l))];
// A mixer that fills the glass always reads "Top ...".
const topLine = (l) => (FIZZ.test(l) && !/^(Top |Side|Splash|Dash|\d)/.test(l) ? `Top ${l}` : l);
// Every drink served up goes in a chilled coupe, and its guide already chills it. One name for each glass.
// Glasses behind the bar (owner, 3 Nov 2026): rocks, highball, martini, wine and spritz. No hurricanes, coupes or flutes,
// They also have coupes (owner, 3 Nov 2026): the Martinis section goes in a martini glass, everything else served up in a coupe.
// Hurricane drinks go in a highball, flute drinks in a coupe, wine-glass spritzes in a spritz glass.
const GLASS = { "Rocks glass": "Rocks", "Hurricane": "Highball", "Highball or hurricane": "Highball", "Coupe or flute": "Coupe", "Large wine glass": "Spritz glass" };
const martini = (d) => d.section === "Martinis";
const glassFor = (d) => { const g = GLASS[d.glass] || (/none|served up/i.test(d.ice) && /^Coupe( \+ shot glass)?$/.test(d.glass) ? `Chilled c${d.glass.slice(1)}` : d.glass); return martini(d) ? g.replace(/\bcoupe\b/i, "martini glass") : g; };
// The same swap in every line of text that names a glass. spritz: the drink's glass is a spritz glass.
function glassText(t, spritz, mart) {
  if (!t) return t;
  t = t.replace(/\bcoupe or flute\b/gi, "coupe").replace(/\bflute\b/g, "coupe");
  if (mart) t = t.replace(/\bcoupes?\b/g, "martini glass").replace(/\bCoupe\b/g, "Martini glass");
  t = t
    .replace(/\bhurricane glass\b/gi, "highball").replace(/\bthe hurricane\b/gi, "the highball");
  if (spritz) t = t.replace(/\b(large )?wine glass\b/gi, "spritz glass");
  return t;
}

// Allergens the hand-written list missed, read from the spec. The labels in the allergen folder have the final word.
const AUTO = [
  [/prosecco|champagne/i, "Sulphites", "Prosecco"],
  [/martini rosso|martini extra dry/i, "Sulphites", "vermouth"],
  [/lillet/i, "Sulphites", "Lillet"],
  [/budweiser|guinness|stella artois|corona/i, "Gluten", "barley in the beer"],
  [/celery bitters/i, "Celery", "celery bitters"],
  // Oats are one of the cereals containing gluten in UK allergen law.
  [/oat milk/i, "Gluten", "oats in the oat milk"],
];
function allergens(d) {
  const have = d.allergens && d.allergens !== "None" ? d.allergens : "";
  const add = new Map();
  for (const [re, what, from] of AUTO) {
    if (!d.spec.some((l) => re.test(l)) || new RegExp(what, "i").test(have)) continue;
    add.set(what, [...new Set([...(add.get(what) || []), from])]);
  }
  return [have, ...[...add].map(([what, from]) => `${what} (${from.join(", ")})`)].filter(Boolean).join(", ") || undefined;
}
// One way to say each step in a method line.
const SAY = [
  [/^Stir for /, "Stir "],
  [/^Shake(?: and strain)?, pour over/, "Shake, strain over"],
  [/, pour over 1 large cube/, ", strain over a large cube"],
  [/\bfine strain\b/, "double strain"],
  [/over (?:1 )?large cube/, "over a large cube"],
  [/^Build(?=,|$)|^Build in the glass$/, "Build over ice"],
];
// The method line agrees with the steps: "Stir," gets the guide's seconds, a strain is double when the steps double
// strain, and a stirred drink served up says where it goes.
function tidyMethod(d, guide) {
  const st = guide.steps.find((s) => s.title === "Stir"), secs = st && st.text.match(/(\d+(?: to \d+)?) seconds/);
  let m = SAY.reduce((t, [re, to]) => t.replace(re, to), d.method).replace(/^Stir,/, secs ? `Stir ${secs[1]} seconds,` : "Stir,");
  if (guide.steps.some((s) => s.double) && !/double strain/.test(m)) m = m.replace(/\bstrain\b/, "double strain");
  if (/^Stir/.test(m) && /^Chilled (coupe|martini glass)/.test(d.glass)) m = m.replace(/, strain(?=$|\.)/, `, strain into a chilled ${martini(d) ? "martini glass" : "coupe"}`);
  return glassText(m, /spritz/i.test(d.glass), martini(d));
}

function destination(d) {
  const ice = d.ice.toLowerCase();
  if (/none|served up/.test(ice)) {
    const g = d.glass.toLowerCase();
    return /wine/.test(g) ? "into the wine glass" : /rocks/.test(g) ? "into the chilled rocks glass" : /martini/.test(g) ? "into the chilled martini glass" : "into the chilled coupe";
  }
  if (/large cube/.test(ice)) return "over the large cube";
  if (/crushed/.test(ice)) return "over the crushed ice";
  return "over the fresh ice";
}

function fixGuide(g, d) {
  // Read before fixSteps swaps aquafaba for foamer: the drinks that had it still get their dry shake.
  const hadFoam = g.steps.some((s) => /pourTin|muddle/.test(s.scene) && (s.items || []).some((i) => /aquafaba/i.test(i.item)));
  let steps = fixSteps(g.name, g.steps.map((s) => ({ ...s, items: s.items ? [...s.items] : s.items })));
  // A glass the card calls chilled gets chilled first.
  if (/^chilled/i.test(d.glass) && !steps.some((s) => s.scene === "chill")) {
    const glass = /rocks/i.test(d.glass) ? "rocks glass" : "coupe";
    steps.unshift({ scene: "chill", title: "Chill the glass", text: `Fill the ${glass} with ice and water. Tip it out just before you pour.` });
  }
  // Rule 1: pull fizzy toppers out of the tin and add them after the strain.
  const tops = [];
  for (const s of steps) if (s.scene === "pourTin" && s.items) {
    const fizz = s.items.filter((i) => FIZZ.test(i.item) && i.ml == null);
    if (fizz.length) { tops.push(...fizz); s.items = s.items.filter((i) => !fizz.includes(i)); }
  }
  if (tops.length) {
    const at = steps.findIndex((s) => s.scene === "strain") + 1;
    if (!at) throw new Error("Topper with no strain step in " + g.name);
    const what = tops.map((i) => i.item.toLowerCase()).join(" and ");
    steps.splice(at, 0, { scene: "top", title: "Top up", text: `Add ${/^(dash|splash) of/i.test(what) ? "a " + what : what} on top, after straining. Never shake anything fizzy.`, items: tops });
  }
  // Foam needs a dry shake first.
  const tin = steps.filter((s) => /pourTin|muddle/.test(s.scene)).flatMap((s) => s.items || []);
  if (hadFoam && !steps.some((s) => s.scene === "dryShake")) {
    const k = steps.findIndex((s) => s.scene === "shake");
    steps.splice(k, 1,
      { scene: "dryShake", title: "Dry shake", text: "Seal the tin with no ice. Shake hard for 10 seconds to whip up the foam." },
      { scene: "shake", title: "Shake again with ice", text: "Open the tin, fill it with ice, seal it and shake hard for another 10 seconds." });
  }
  // Rule 2: single or double strain.
  const foam = steps.some((s) => s.scene === "dryShake");
  for (const s of steps) {
    if (s.scene !== "strain" || s.jug || s.title === "Roll") continue;
    if (s.shot) { s.double = false; s.title = "Strain"; continue; }
    const up = /none|served up/i.test(d.ice);
    s.double = up || foam || tin.some((i) => BITS.test(i.item));
    s.title = s.double ? "Double strain" : "Strain";
    s.text = s.double
      ? `Hawthorne strainer on the tin, fine strainer over the glass. Strain ${destination(d)}.`
      : `Hawthorne strainer on the tin. Strain ${destination(d)}.`;
  }
  const spritz = /spritz/i.test(d.glass);
  steps = steps.map((s, i) => ({ ...s, n: i + 1, title: glassText(s.title, spritz, martini(d)), text: glassText(s.text, spritz, martini(d)), ...(s.garnish ? { garnish: glassText(s.garnish, spritz, martini(d)) } : {}) }));
  const tools = g.tools.filter((t) => t !== "fine strainer");
  if (steps.some((s) => s.double)) tools.splice(tools.indexOf("Hawthorne strainer") + 1, 0, "fine strainer");
  return { ...g, tools, steps };
}
// What to use when a bottle is out. Matched against the spec; the bar keeps the first choice when it has it.
const SUBS = [
  [/crème de mûre/, "No crème de mûre? Use Chambord."],
  [/crème de cassis/, "No crème de cassis? Use Chambord."],
  [/Velvet Falernum/, "No falernum? Use the same of Giffard Orgeat and add 1 dash Angostura."],
  [/Bacardí Carta Oro/, "No Carta Oro? Use Captain Morgan White."],
  [/Wray & Nephew/, "No overproof rum? Use Captain Morgan White."],
  [/apricot brandy/, "No apricot brandy? Use Archers."],
  [/Fernet-Branca/, "No Fernet? Use Jägermeister."],
  [/Bénédictine/, "No Bénédictine? Use yellow Chartreuse."],
  [/Drambuie/, "No Drambuie? Use 15 ml honey syrup (2:1) and 10 ml more whisky."],
  [/Peychaud/, "No Peychaud's? Use Angostura."],
  [/rye whiskey/, "No rye? Use Bulleit Bourbon."],
  [/Crown Royal/, "No Crown Royal? Use Jameson."],
  [/Lillet Blanc/, "No Lillet? Use Martini Extra Dry."],
  [/Luxardo Maraschino/, "No maraschino? Use Heering Cherry."],
  [/green Chartreuse/, "No green Chartreuse? Use yellow Chartreuse."],
  [/cinnamon syrup/, "No cinnamon syrup? Use sugar syrup and grate a little cinnamon into the tin."],
  [/honey-ginger syrup/, "No honey-ginger syrup? Use Monin Honey and press 2 thin slices of fresh ginger in the tin."],
  [/Casamigos Blanco/, "No Casamigos? Use El Jimador Blanco."],
  [/Casamigos Reposado/, "No Casamigos? Use El Jimador Reposado."],
  [/blue curaçao/, "No blue curaçao? Use Cointreau (the drink won't be blue)."],
  [/orange bitters/, "No orange bitters? Use cocoa bitters, or a strip of orange zest in the glass."],
  [/Monin Strawberry/, "No Monin Strawberry? Use 25 ml strawberry purée and 10 ml sugar syrup."],
  [/Monin Raspberry/, "No Monin Raspberry? Use 15 ml Chambord and 10 ml sugar syrup."],
  [/Monin Passion Fruit/, "No Monin Passion Fruit? Use 20 ml Passoa."],
  [/Monin Elderflower/, "No Monin Elderflower? Use 20 ml elderflower cordial."],
  [/Monin Honey/, "No Monin Honey? Use honey syrup (2:1)."],
  [/Monin Salted Caramel/, "No Monin Salted Caramel? Use 25 ml salted caramel sauce."],
  [/Monin Watermelon/, "No Monin Watermelon? Use sugar syrup and 4 chunks of fresh watermelon pressed in the tin."],
  [/pisco/, "No pisco? Use Abelha cachaça."],
  [/sambuca/, "No sambuca? Use NV Absinthe, 10 ml only."],
  [/butterscotch schnapps/, "No butterscotch schnapps? Use Monin Butterscotch or salted caramel sauce."],
];
const subsFor = (spec) => { const out = SUBS.filter(([re]) => spec.some((l) => re.test(l))).map(([, t]) => t); return out.length ? out : undefined; };
function fixDrink(d) {
  const spec = fizzLast(fixSpec(d.name, d.spec).map(topLine));
  const glass = glassFor(d), spritz = /spritz/i.test(glass);
  return { ...d, spec, glass, allergens: allergens({ ...d, spec }), subs: subsFor(spec),
    garnish: glassText(d.garnish, spritz, martini(d)), desc: glassText(d.desc, spritz, martini(d)), blurb: glassText(d.blurb, spritz, martini(d)),
    method: glassText(METHOD[d.name] || d.method.replace(/\s*\(card does not state method[^)]*\)/, ""), spritz, martini(d)) };
}

module.exports = { fixGuide, fixDrink, tidyMethod };
