/* Cheat sheets: A4 pages to print and laminate, eight drinks a page (twelve for shots), 22 pages to print double-sided on 11 sheets, drawn from the same specs as the app.
   The app's Cheat sheets view and the JPEG/PDF generator both use this file, so the paper always matches the phone. */
const CHEAT = (() => {
  // Families of the most ordered drinks (bestseller lists from Drinks International and UK bar sales), with Black Tap's own first.
  const SHEETS = [
    { id: "signatures", t: "Black Tap Signatures", sub: "Our house cocktails", names: ["London Cosmo", "Uptown Hustle", "Salted Caramel Buzz", "Cali Heatwave", "West Coast Love", "The Paddington", "Marshmallow Boulevard", "The Rockefeller"] },
    { id: "martinis", t: "Martinis", sub: "Chilled martini glass, served up", names: ["Espresso Martini", "Pornstar Martini", "Dry Martini", "Dirty Martini", "French Martini", "Lemon Drop Martini", "Cosmopolitan", "Breakfast Martini"] },
    { id: "margaritas", t: "Margaritas & Agave", sub: "Ritas, Palomas and Ranch Water", names: ["Margarita", "Tommy's Margarita", "Spicy Margarita", "Mezcal Margarita", "Passion Fruit Margarita", "Watermelon Margarita", "Paloma", "Ranch Water"] },
    { id: "spritz", t: "Spritz & Sparkling", sub: "Spritz: glass full of ice, Prosecco first, gentle lift", names: ["Aperol Spritz", "Hugo Spritz", "Limoncello Spritz", "French 75", "Chambord Royale", "Mimosa", "Negroni Sbagliato", "Bellini"] },
    { id: "sours", t: "Sours", sub: "Shake hard. Foamer drinks: dry shake first", names: ["Whiskey Sour", "Amaretto Sour", "Daiquiri", "Pisco Sour", "Clover Club", "White Lady", "Penicillin", "Aperol Sour"] },
    { id: "stirred", t: "Stirred & Strong", sub: "Stir cold, never shake", names: ["Old Fashioned", "Negroni", "Manhattan", "Boulevardier", "Mezcal Negroni", "Rum Old Fashioned", "Godfather", "Rob Roy"] },
    { id: "long", t: "Long, Tiki & Fresh", sub: "Highballs and party drinks", names: ["Mojito", "Moscow Mule", "Long Island Iced Tea", "Tom Collins", "Piña Colada", "Mai Tai", "Bloody Mary", "Sex on the Beach"] },
    { id: "rum", t: "Rum & Dark 'n' Stormy", sub: "Kraken Storm is our Dark 'n' Stormy", names: ["Kraken Storm", "Cuba Libre", "Rum Punch", "Hurricane", "Zombie", "Jungle Bird", "Painkiller", "Planter's Punch"] },
    { id: "gin", t: "Gin Classics", sub: "Tanqueray unless the guest asks", names: ["Gimlet", "Southside", "Gin Fizz", "Pink Lady", "Fitzgerald", "Elderflower Collins", "Bee's Knees", "Gin Rickey"] },
    { id: "fruity", t: "Fruity & Party", sub: "The crowd pleasers", names: ["Woo Woo", "Strawberry Daiquiri", "Tequila Sunrise", "Sea Breeze", "Blue Lagoon", "Lynchburg Lemonade", "Pimm's Cup", "Bay Breeze"] },
    { id: "serves", t: "House Serves", sub: "Spirit and mixer, 50 ml, glass full of ice", names: ["Gin & Tonic", "Sevilla & Tonic", "Jack & Coke", "Kraken & Coke", "Vodka Red Bull", "Pink Gin & Lemonade", "Whisky Highball", "Malibu & Pineapple"] },
    { id: "after", t: "After Dinner", sub: "Creamy, coffee and hot. Hot water and coffee from the coffee machine", names: ["White Russian", "Black Russian", "Irish Coffee", "Mudslide", "Baileys Coffee", "Calypso Coffee", "Toblerone", "Hot Toddy"] },
    { id: "mojitos", t: "Mojitos & Mules", sub: "Press the mint, don't shred it", names: ["Passion Fruit Mojito", "Strawberry Mojito", "Raspberry Mojito", "Mojito Royale", "Whiskey Smash", "Kentucky Mule", "Mexican Mule", "Gin-Gin Mule"] },
    { id: "modern", t: "Modern Favourites", sub: "The twists guests ask for", names: ["Hazelnut Espresso Martini", "Salted Caramel Espresso Martini", "Baileys Espresso Martini", "Chocolate Old Fashioned", "Midori Sour", "Japanese Slipper", "Rhubarb & Elderflower Martini", "Mango Martini"] },
    { id: "nyc", t: "Born in NYC", sub: "New York classics for a New York burger bar", names: ["Bronx Cocktail", "Big Apple Sour", "Staten Island Ferry", "Jack Rose", "Gold Rush", "Old Cuban", "Greenpoint", "New York Sour"] },
    { id: "pitchers", t: "Pitchers", sub: "Serves 4. Glasses with ice on the side", names: ["Pimm's Pitcher", "Mojito Pitcher", "Aperol Spritz Pitcher", "Woo Woo Pitcher", "Rum Punch Pitcher", "Sangria Pitcher", "Margarita Pitcher"] },
    { id: "aperitivo", t: "Aperitivo & Stirred", sub: "Low and slow: stir cold, strain, zest", names: ["Adonis", "Bamboo", "Milano Torino", "Old Pal", "Rosita", "Americano", "Gibson", "Cardinale"] },
    { id: "bartender", t: "Bartender's Classics", sub: "For guests who know their drinks", names: ["Naked & Famous", "Sidecar", "El Presidente", "Eastside Gimlet", "Blood & Sand", "Queens", "Floradora", "Twinkle"] },
    { id: "shots", t: "Shots & Bombs", sub: "Chill the shots. Bombs go out side by side", names: ["Baby Guinness", "B-52", "Jägerbomb", "Tequila, Salt & Lime", "Mini Espresso Martini", "Pornstar Shot", "Kamikaze", "Lemon Drop", "Green Tea Shot", "Pickleback", "Cherry Bakewell", "Skittle Bomb"] },
    { id: "house-shots", t: "House Shots", sub: "Our own shots, shaken cold", names: ["Chocolate Orange", "Sour Apple", "Smoke & Fire", "Coconut Kiss", "Apple Pie", "Spicy Margarita Shot", "Lemon Meringue", "Jolly Rancher", "Gummy Bear", "Jam Doughnut", "Pineapple Upside-Down", "Peanut Butter & Jam"] },
    { id: "more-shots", t: "More Shots & Bombs", sub: "Layer slowly over the back of a bar spoon", names: ["Tequila Slammer", "Brain Haemorrhage", "Washington Apple", "Mexican Flag", "Squashed Frog", "After Eight", "Slippery Nipple", "Duck Fart", "Flatliner", "Cherry Bomb", "Passion Bomb", "Vegas Bomb"] },
    { id: "zero", t: "Zero Proof", sub: "Alcohol-free, made with the same care", names: ["Virgin Mojito", "No-Star Martini", "Espresso No-tini", "Virgin Margarita", "Virgin Colada", "Virgin Mary", "Shirley Temple", "Apple & Elderflower Fizz"] },
  ];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
  // Small gold line icons for the Glass, Method and Garnish columns.
  const GLASS = {
    martini: "M3 5h18l-9 9z M12 14v6 M8 21h8", coupe: "M4 6h16c0 5-3.5 7-8 7s-8-2-8-7z M12 13v7 M8 21h8",
    rocks: "M5 8h14l-1.2 12H6.2z M5.6 12h12.8", highball: "M7 3h10l-.7 18H7.7z M7.3 8h9.4", wine: "M6 3h12c.6 6-2 9-6 9s-6.6-3-6-9z M12 12v8 M8 21h8",
    shot: "M8 8h8l-1 13H9z", heatproof: "M6 6h11l-1 13H7z M17 9h1.5a3 3 0 0 1 0 6H16.5", hurricane: "M8 3c-1 5 3 6 2 10s1 7 2 7 3-3 2-7 3-5 2-10z", pitcher: "M6 5h10l1 16H7z M6 5 4 3 M16 8h1.5a3 3 0 0 1 0 7H16.6",
  };
  const METHOD = {
    shake: "M8 9h8l-1 12H9z M9 9V7h6v2 M10.5 7V4.5h3V7", stir: "M6 8h10l-1 13H7z M18 2l-6 13", layer: "M8 5h8l-1 16H9z M8.4 10h7.2 M8.8 15.5h6.4",
    build: "M7 11h10l-1 10H8z M15 3l-2.5 6 M12 9l.5 0", hot: "M6 9h11l-1 12H7z M17 12h1.5a3 3 0 0 1 0 6H16.5 M9 3c1 1.5-1 2.5 0 4 M13 3c1 1.5-1 2.5 0 4",
  };
  const GARNISH = "M3 13a9 9 0 0 0 18 0z M12 13l-5.5 6 M12 13v8 M12 13l5.5 6";
  const glassKind = (d) => (/martini glass/i.test(d.glass) ? "martini" : GLASS[d.g] ? d.g : "coupe");
  const methodKind = (d) => /hot|warm the glass/i.test(d.method) && /heatproof/i.test(d.glass) ? "hot" : /shake|roll/i.test(d.method) ? "shake" : /stir 2|stir 3|stir,|^stir/i.test(d.method) ? "stir" : /layer|float baileys/i.test(d.method) ? "layer" : "build";
  const ICE = [[/^none \(served up\)/i, "Served up, no ice"], [/^none \(hot\)/i, "Hot, no ice"], [/^none/i, "No ice"], [/glass full/i, "Glass full of ice"], [/^cubed/i, "Cubed ice"], [/^crushed/i, "Crushed ice"], [/^pitcher half full/i, "Half full of ice"]];
  const ice = (t) => { const m = ICE.find(([re]) => re.test(t || "")); return m ? m[1] : t || ""; };
  // "35 ml Cîroc Red Berry" puts the measure in bold so the eye finds it first.
  const spec = (s) => { const m = /^(Top |Side: )?(\d+(?:\.\d+)?\s?ml)\b\s*(.*)$/i.exec(s); return m ? `${m[1] ? esc(m[1]) : ""}<b>${esc(m[2])}</b> ${esc(m[3])}` : esc(s); };
  // Long specs go in two or three columns so every row stays the same height.
  const cols = (n, dense) => (n > 8 ? 3 : n > (dense ? 3 : 5) ? 2 : 1);
  const row = (d, n, art, dense) => `<div class="cs-row">
<div class="cs-pic"><span class="cs-n">${n}</span>${art(d)}</div>
<div class="cs-spec"><h3>${esc(d.name)}</h3><ul${cols(d.spec.length, dense) > 1 ? ` class="cs-${cols(d.spec.length, dense)}"` : ""}>${d.spec.map((s) => `<li>${spec(s)}</li>`).join("")}</ul></div>
<div class="cs-c"><i>${svg(GLASS[glassKind(d)])}</i><p>${esc(d.glass)}</p>${ice(d.ice) ? `<p class="cs-ice">${esc(ice(d.ice))}</p>` : ""}</div>
<div class="cs-c cs-m"><i>${svg(METHOD[methodKind(d)])}</i><p>${esc(d.method)}</p></div>
<div class="cs-c"><i>${svg(GARNISH)}</i><p>${/^none$/i.test(d.garnish || "") ? "No garnish" : esc(d.garnish || "No garnish")}</p></div>
</div>`;
  const ends = `<svg class="cs-end" viewBox="0 0 12 12"><path d="M6 0l2 4 4 2-4 2-2 4-2-4-4-2 4-2z"/></svg>`;
  // One A4 page. byName: drink name to drink; art(d): the drink picture as SVG; when: the date line in the footer.
  const page = (sh, i, byName, art, when) => {
    const ds = sh.names.map((n) => byName.get(n)).filter(Boolean);
    return `<section class="cs-page${ds.length > 8 ? " cs-dense" : ""}" data-sheet="${sh.id}" translate="no">
<div class="cs-brand">${ends}<span>Black Tap Soho &middot; Cheat sheet ${i + 1} of ${SHEETS.length}</span>${ends}</div>
<h2 class="cs-title">${esc(sh.t)}</h2>
<div class="cs-sub">${esc(sh.sub)}</div>
<div class="cs-head"><span></span><span>Spec (ml)</span><span>Glass</span><span>Method</span><span>Garnish</span></div>
<div class="cs-rows" style="grid-template-rows:repeat(${ds.length},1fr)">${ds.map((d, k) => row(d, k + 1, art, ds.length > 8)).join("")}</div>
<div class="cs-foot">${ends}<span>Train &middot; Pour &middot; Impress</span>${ends}</div>
<div class="cs-note">Specs as in the Bar Book, ${esc(when)}. All measures in ml. Check the app for allergens and swaps.</div>
</section>`;
  };
  const missing = (byName) => SHEETS.flatMap((s) => s.names.filter((n) => !byName.has(n)));
  // The page styles. font: a URL for the Oswald font file.
  const css = (font) => `@font-face{font-family:"CS Oswald";src:url(${font}) format("woff2");font-weight:200 700}
.cs-page{--gold:#a8823a;--rule:#e2d3b0;width:210mm;height:297mm;padding:8mm 8mm 6mm;background:#fbf7ee;color:#151515;font-family:"CS Oswald","Arial Narrow",sans-serif;display:flex;flex-direction:column;box-sizing:border-box;overflow:hidden;-webkit-print-color-adjust:exact;print-color-adjust:exact;text-align:left;line-height:1.2}
.cs-page *{box-sizing:border-box}
.cs-brand,.cs-foot{display:flex;align-items:center;gap:3mm;color:#151515;font-weight:600;letter-spacing:.2em;text-transform:uppercase;font-size:13.5px}
.cs-brand::before,.cs-brand::after,.cs-foot::before,.cs-foot::after{content:"";flex:1;height:1.4px;background:var(--gold);order:0}
.cs-brand span,.cs-foot span{order:2}.cs-brand .cs-end:first-child,.cs-foot .cs-end:first-child{order:1}.cs-brand .cs-end:last-of-type,.cs-foot .cs-end:last-of-type{order:3}
.cs-brand::after,.cs-foot::after{order:4}
.cs-end{width:9px;height:9px;fill:var(--gold);flex:none}
.cs-title{font-family:inherit;font-weight:700;font-size:46px;line-height:1;text-transform:uppercase;text-align:center;margin:1.5mm 0 0;letter-spacing:.01em;color:#111}
.cs-sub{text-align:center;color:var(--gold);font-weight:600;letter-spacing:.14em;text-transform:uppercase;font-size:14px;margin:1.6mm 0 1.8mm}
.cs-head,.cs-row{display:grid;grid-template-columns:30mm 1fr 26mm 38mm 26mm}
.cs-head{font-weight:600;font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--gold);padding-bottom:1mm;border-bottom:1.6px solid var(--gold)}
.cs-head span:nth-child(n+3){text-align:center}.cs-head span:nth-child(2){padding-left:3mm}
.cs-rows{flex:1;display:grid;min-height:0}
.cs-row{border-bottom:1px solid var(--rule);min-height:0;overflow:hidden}
.cs-pic{position:relative;background:radial-gradient(circle at 50% 45%,#f6f1e6,#e6ddca);display:flex;align-items:center;justify-content:center;color:#3b3b3b;margin:1.2mm 0;border-radius:2mm}
.cs-pic svg{position:absolute;left:0;top:7%;width:100%;height:86%}
.cs-n{position:absolute;left:1.4mm;top:1.4mm;width:6.4mm;height:6.4mm;border-radius:50%;background:#151515;color:#f4d995;border:1.2px solid var(--gold);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px}
.cs-spec{padding:1.6mm 2mm 1.2mm 3.2mm;min-width:0}
.cs-spec h3{font-family:inherit;font-weight:700;font-size:19px;line-height:1.05;text-transform:uppercase;margin:0 0 .8mm;letter-spacing:.01em;color:#111}
.cs-spec ul{list-style:none;margin:0;padding:0;font-size:11.6px;font-weight:400;line-height:1.24}
.cs-spec li{position:relative;padding-left:3.2mm}
.cs-spec li::before{content:"";position:absolute;left:.3mm;top:.52em;width:1.5mm;height:1.5mm;border-radius:50%;background:var(--gold)}
.cs-spec b{font-weight:700}
.cs-spec .cs-2{column-count:2;column-gap:3mm}.cs-spec .cs-3{column-count:2;column-gap:3mm;font-size:10.4px;line-height:1.16}.cs-spec .cs-2 li,.cs-spec .cs-3 li{break-inside:avoid}
.cs-c{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:1mm 1.6mm;border-left:1px dashed var(--rule);font-size:11px;line-height:1.22;min-width:0}
.cs-c i{display:block;width:7mm;height:7mm;color:var(--gold);margin-bottom:.8mm}.cs-c i svg{width:100%;height:100%}
.cs-c p{margin:0}.cs-c .cs-ice{color:#6b5a38;margin-top:.5mm;font-size:10.4px}
.cs-m{font-size:10.3px}
.cs-dense .cs-spec h3{font-size:16px;margin-bottom:.3mm}.cs-dense .cs-spec ul{font-size:10.8px;line-height:1.18}.cs-dense .cs-c i{width:5.4mm;height:5.4mm;margin-bottom:.3mm}
.cs-dense .cs-c{font-size:10.2px;padding:.4mm 1.4mm}.cs-dense .cs-c i{display:none}.cs-dense .cs-c .cs-ice{margin-top:0}.cs-dense .cs-pic{margin:.8mm 0}.cs-dense .cs-n{width:5.6mm;height:5.6mm;font-size:11.5px}
.cs-foot{margin-top:2.5mm;font-size:12px;letter-spacing:.42em}
.cs-note{text-align:center;font-size:9px;color:#6b5a38;margin-top:1mm;letter-spacing:.02em}`;
  return { SHEETS, page, css, missing };
})();
if (typeof module !== "undefined") module.exports = CHEAT;
