// House rules for how every drink is built, applied to all guides so they stay consistent:
// 1. Nothing fizzy goes in the shaker. Lemonade, soda, Prosecco, tonic and so on go on top after straining.
// 2. Double strain (Hawthorne + fine strainer) when the drink is served up with no ice, or when the tin
//    holds herbs, fruit, chilli, marmalade, purée or a foam. Otherwise a single Hawthorne strain. Shots: single.
const FIZZ = /lemonade|soda|prosecco|tonic|ginger beer|ginger ale|cola|coke|red bull|sprite/i;
const BITS = /mint|basil|passion fruit|marmalade|jalape|chilli|cucumber|purée|puree|raspberr|blackberr|strawberr|lime, cut/i;

// Spec and method text that the rules above change.
const METHOD = {
  "London Cosmo": "Shake hard, double strain, top with a dash of lemonade",
  "Uptown Hustle": "Shake hard, double strain",
  "Salted Caramel Buzz": "Shake very hard, double strain",
  "The Paddington": "Dry shake, shake with ice, double strain over a large cube, zest orange peel on top",
  "Margarita": "Shake, strain over fresh ice",
  "Tommy's Margarita": "Shake, strain over fresh ice",
  "Mezcal Margarita": "Shake, strain over fresh ice",
};
// Checked against the IBA official recipes (iba-world.com, 24 Oct 2026). Ratios follow IBA, rounded to our jiggers.
// ml: new measure by ingredient; rename: swap an ingredient; drop: remove it; text: replace step text by scene.
const HINT = { 50: "the 50 side", 25: "the 25 side", 12.5: "half a 25", 75: "50 + 25", 100: "50 + 50" };
const IBA = {
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
};
function ibaSpec(name, spec) {
  const f = IBA[name]; if (!f) return spec;
  if (f.spec) return f.spec;
  return spec.flatMap((l) => {
    const m = l.match(/^(Top )?([\d.]+) ml (.*)$/); if (!m) return [l];
    const item = (f.rename || {})[m[3]] || m[3];
    if ((f.drop || []).includes(item)) return [];
    return [`${m[1] || ""}${(f.ml || {})[item] ?? m[2]} ml ${item}`];
  });
}
function ibaGuide(name, steps) {
  const f = IBA[name]; if (!f) return steps;
  return steps.map((s) => {
    const items = s.items && s.items.map((i) => ({ ...i, item: (f.rename || {})[i.item] || i.item })).filter((i) => !(f.drop || []).includes(i.item))
      .map((i) => (f.ml || {})[i.item] != null && i.ml != null ? { ...i, ml: f.ml[i.item], hint: HINT[f.ml[i.item]] || null } : i);
    return { ...s, items, text: (f.text || {})[s.scene] || s.text };
  });
}
const fizzLast = (spec) => [...spec.filter((l) => !(FIZZ.test(l) && !/^\d/.test(l))), ...spec.filter((l) => FIZZ.test(l) && !/^\d/.test(l))];

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
  let steps = ibaGuide(g.name, g.steps.map((s) => ({ ...s, items: s.items ? [...s.items] : s.items })));
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
const fixDrink = (d) => ({ ...d, spec: fizzLast(ibaSpec(d.name, d.spec)), method: METHOD[d.name] || d.method.replace(/\s*\(card does not state method[^)]*\)/, "") });

module.exports = { fixGuide, fixDrink };
