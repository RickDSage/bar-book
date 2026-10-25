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
  "Pickleback & a Half": { spec: ["Half pint Stella Artois", "25 ml Jameson", "25 ml chilled pickle brine"], rename: { "Half pint Camden Hells": "Half pint Stella Artois" },
    text: { half: "Pour a half pint of Stella Artois with a neat head." } },
};
// One name for each ingredient in every drink, and one choice where a spec offered two.
const WORDS = {
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
const word = (w) => WORDS[w] || w;
const PHRASES = Object.keys(WORDS).filter((w) => w.includes(" or "));
const wordText = (t) => PHRASES.reduce((s, w) => s.split(w).join(WORDS[w]), t);
function fixSpec(name, spec) {
  const f = FIX[name] || {};
  if (f.spec) return f.spec;
  return spec.flatMap((l) => {
    const t = l.match(/^Top (.*)$/);
    const m = l.match(/^(Top )?([\d.]+) ml (.*)$/); if (!m) return [t ? `Top ${word(t[1])}` : l];
    const item = word((f.rename || {})[m[3]] || m[3]);
    if ((f.drop || []).includes(item)) return [];
    return [`${m[1] || ""}${(f.ml || {})[item] ?? m[2]} ml ${item}`];
  });
}
function fixSteps(name, steps) {
  const f = FIX[name] || {};
  return steps.map((s) => {
    const items = s.items && s.items.map((i) => ({ ...i, item: word((f.rename || {})[i.item] || i.item) })).filter((i) => !(f.drop || []).includes(i.item))
      .map((i) => (f.ml || {})[i.item] != null && i.ml != null ? { ...i, ml: f.ml[i.item], hint: HINT[f.ml[i.item]] || null } : i);
    return { ...s, items, text: wordText((f.text || {})[s.scene] || s.text) };
  });
}
const fizzLast = (spec) => [...spec.filter((l) => !(FIZZ.test(l) && !/^\d/.test(l))), ...spec.filter((l) => FIZZ.test(l) && !/^\d/.test(l))];
// A mixer that fills the glass always reads "Top ...".
const topLine = (l) => (FIZZ.test(l) && !/^(Top |Side|Splash|Dash|\d)/.test(l) ? `Top ${l}` : l);
// Every drink served up goes in a chilled coupe, and its guide already chills it. One name for each glass.
const GLASS = { "Rocks glass": "Rocks" };
const glassFor = (d) => GLASS[d.glass] || (/none|served up/i.test(d.ice) && /^Coupe( \+ shot glass)?$/.test(d.glass) ? `Chilled c${d.glass.slice(1)}` : d.glass);

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
  if (/^Stir/.test(m) && /^Chilled coupe/.test(d.glass)) m = m.replace(/, strain(?=$|\.)/, ", strain into a chilled coupe");
  return m;
}

function destination(d) {
  const ice = d.ice.toLowerCase();
  if (/none|served up/.test(ice)) {
    const g = d.glass.toLowerCase();
    return "into the chilled " + (/coupe or flute/.test(g) ? "coupe or flute" : /flute/.test(g) ? "flute" : "coupe");
  }
  if (/large cube/.test(ice)) return "over the large cube";
  if (/crushed/.test(ice)) return "over the crushed ice";
  return "over the fresh ice";
}

function fixGuide(g, d) {
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
  if (tin.some((i) => /aquafaba/i.test(i.item)) && !steps.some((s) => s.scene === "dryShake")) {
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
  steps = steps.map((s, i) => ({ ...s, n: i + 1 }));
  const tools = g.tools.filter((t) => t !== "fine strainer");
  if (steps.some((s) => s.double)) tools.splice(tools.indexOf("Hawthorne strainer") + 1, 0, "fine strainer");
  return { ...g, tools, steps };
}
function fixDrink(d) {
  const spec = fizzLast(fixSpec(d.name, d.spec).map(topLine));
  return { ...d, spec, glass: glassFor(d), allergens: allergens({ ...d, spec }),
    method: METHOD[d.name] || d.method.replace(/\s*\(card does not state method[^)]*\)/, "") };
}

module.exports = { fixGuide, fixDrink, tidyMethod };
