/* ---------- Bar 101: what to say when a guest asks ----------
   Short cards for training only (Practise > Bar 101): why one bottle costs more and what it changes in a drink, the
   differences between styles, picking a whisky for someone, beer basics, and how to suggest something better. Only
   bottles from the Soho back bar. Each card says where its facts come from: the legal definitions, or the maker's own
   page. Nothing here goes on the specs, the menus or the bar station. Every card makes one quiz question. */
const B101 = [
  // ---- Why it costs more ----
  { g: "Why it costs more", n: "A better spirit shows most in a short drink",
    gist: "In a Martini, Negroni or Old Fashioned the spirit is most of the glass, so a better one changes the drink. In a long drink with cola or juice the mixer covers most of the difference.",
    say: "In a Martini you'll really taste the difference, so it's worth going up. With cola, our house one is great.",
    src: "How a drink is built: spirit share of the glass (our own specs)",
    q: "Where does a premium spirit make the biggest difference?", a: "A Martini or Old Fashioned", w: ["A vodka and cola", "A Long Island Iced Tea", "A Red Bull bomb"] },
  { g: "Why it costs more", n: "Vodka: what it's made from",
    gist: "Smirnoff is made from grain. Grey Goose is made from French wheat. Belvedere is Polish rye. Cîroc is distilled from grapes, which is why it tastes a little fruity. Premium vodka is about texture: softer and rounder neat or in a Martini.",
    say: "Grey Goose is French wheat, really smooth. Belvedere is rye, a bit more peppery. Cîroc is made from grapes, so it's fruitier.",
    src: "Grey Goose, Belvedere, Cîroc and Smirnoff, the makers' own pages",
    q: "Which of our vodkas is distilled from grapes?", a: "Cîroc", w: ["Grey Goose", "Belvedere", "Smirnoff"] },
  { g: "Why it costs more", n: "Age statements",
    gist: "The number on a whisky (Talisker 10, Hakushu 12) is the age of the youngest whisky in the bottle. Longer in the cask usually means more oak: vanilla, spice, dried fruit, and less sharpness. Older isn't always better, just different, and it costs more because the cask has sat for years.",
    say: "The 12 means the youngest whisky in it is 12 years old. More time in the barrel, so it's smoother and rounder.",
    src: "Scotch Whisky Regulations 2009 (age statements)",
    q: "On a whisky label, the age is…", a: "The youngest whisky in the bottle", w: ["The oldest whisky in the bottle", "The average age", "When the distillery opened"] },
  { g: "Why it costs more", n: "Cognac letters: VS, VSOP, XO",
    gist: "VS is aged at least 2 years, VSOP at least 4, XO at least 10. Martell VS, Courvoisier VSOP, Hennessy XO and Rémy Martin XO are all on our back bar. More age means more depth, and more cost.",
    say: "XO is aged at least ten years, so it's richer and softer. VS is younger and great in a cocktail.",
    src: "Bureau National Interprofessionnel du Cognac (BNIC), age categories",
    q: "How long is an XO Cognac aged, at least?", a: "10 years", w: ["2 years", "4 years", "6 years"] },

  // ---- Whisky: pick one for them ----
  { g: "Whisky: pick one for them", n: "Ask one question first",
    gist: "\"Do you like it smoky, or smooth and sweet?\" Smoky: Talisker 10 or Port Charlotte 10. Smooth and sweet: a bourbon, Buffalo Trace, Bulleit or Elijah Craig. Light and easy: Jameson. A treat: Hibiki Harmony, Hakushu 12 or Johnnie Walker Blue.",
    say: "Do you like smoky, or smooth and sweet? Then I'll pick one you'll love.",
    src: "Tasting styles from each maker's own notes",
    q: "A guest wants a smooth, sweet whisky on the rocks. Best pick?", a: "A bourbon like Buffalo Trace", w: ["Port Charlotte 10", "Talisker 10", "Absinthe"] },
  { g: "Whisky: pick one for them", n: "Why bourbon tastes sweet",
    gist: "By law bourbon is made in the USA from at least 51% corn and aged in new charred oak barrels. Corn gives sweetness and the new charred oak gives vanilla and caramel. Bulleit uses more rye in its mash, so it's spicier.",
    say: "Bourbon has to go into brand new charred oak, that's where the vanilla and caramel come from.",
    src: "US Code of Federal Regulations, 27 CFR 5.143 (bourbon)",
    q: "Bourbon must be aged in…", a: "New charred oak containers", w: ["Old sherry casks", "Steel tanks", "Any wooden barrel"] },
  { g: "Whisky: pick one for them", n: "Smoky whisky: peat",
    gist: "The smoke comes from peat, burned to dry the malted barley. Islay and the islands are famous for it. Talisker 10 (Isle of Skye) is smoky and peppery with a salty edge. Port Charlotte 10 (Islay) is heavily peated.",
    say: "The smoke comes from peat fires used to dry the barley. Talisker is smoky but balanced, a good first one.",
    src: "Scotch Whisky Association, how Scotch is made; Talisker and Bruichladdich",
    q: "Where does the smoky taste in some Scotch come from?", a: "Peat used to dry the barley", w: ["Burnt casks", "Added smoke flavouring", "Roasted corn"] },
  { g: "Whisky: pick one for them", n: "Scotch, Irish, bourbon, Tennessee",
    gist: "Scotch: made and aged at least 3 years in Scotland. Irish: aged at least 3 years in Ireland; Jameson is triple distilled, so it's light and smooth. Bourbon: USA, mostly corn. Jack Daniel's is Tennessee whiskey, filtered through sugar maple charcoal before it goes in the barrel.",
    say: "Jameson's triple distilled, so it's light and smooth. Jack Daniel's is filtered through maple charcoal, that's the Tennessee bit.",
    src: "Scotch Whisky Regulations 2009; Irish Whiskey Act 1980; Jameson; Jack Daniel's",
    q: "What makes Jack Daniel's a Tennessee whiskey?", a: "It's filtered through maple charcoal", w: ["It's aged in sherry casks", "It's triple distilled", "It's made from rye"] },
  { g: "Whisky: pick one for them", n: "One big cube, a drop of water",
    gist: "One large cube melts slower than lots of small ones, so the whisky gets colder without going watery. A few drops of water can bring out the aroma: research found water brings the flavour compounds to the surface of the glass.",
    say: "One big cube keeps it cold without watering it down. Try a drop of water, it opens it up.",
    src: "Karlsson and Friedman, Scientific Reports, 2017 (water and whisky aroma)",
    q: "Why one large cube for whisky on the rocks?", a: "It melts slower, so less dilution", w: ["It looks bigger", "It makes it sweeter", "It's the law"] },
  { g: "Whisky: pick one for them", n: "Japanese whisky",
    gist: "Hakushu 12 comes from a distillery in a forest in the Japanese Alps: fresh, green and lightly smoky. Hibiki Harmony is a blend of malt and grain whiskies: soft, honeyed and floral. Both are treats, and great to suggest to someone who wants something different.",
    say: "Hibiki's a blend, really soft and floral. Hakushu's fresher, a little smoky, from a distillery in the forest.",
    src: "Suntory, Hakushu and Hibiki",
    q: "Hibiki Harmony is…", a: "A blend of malt and grain whiskies", w: ["A single malt", "A bourbon", "A rum"] },

  // ---- Gin ----
  { g: "Gin", n: "London Dry doesn't mean London",
    gist: "London Dry is a way of making gin, not a place: all the flavour comes from distilling the botanicals, and nothing but a tiny amount of sweetener can be added after. Tanqueray London Dry is made with just four botanicals, led by juniper.",
    say: "London Dry is a style: all the flavour goes in while it's distilled. Tanqueray's only four botanicals, so it's crisp and clean.",
    src: "EU Spirit Drinks Regulation 2019/787, retained in UK law; Tanqueray",
    q: "London Dry gin means…", a: "All the flavour comes from distilling", w: ["It's made in London", "It has no juniper", "It's aged in oak"] },
  { g: "Gin", n: "Our special gins in one line each",
    gist: "Monkey 47: 47 botanicals, from Germany's Black Forest. Roku: Japanese, with six Japanese botanicals like yuzu and sakura. The Botanist: from Islay, with 22 botanicals picked on the island. Drumshanbo Gunpowder: Irish, with gunpowder green tea. Tanqueray Flor de Sevilla: bitter Seville orange.",
    say: "If you like citrus, try Roku with tonic: it's got yuzu in it.",
    src: "Each maker's own page",
    q: "Which gin has gunpowder green tea in it?", a: "Drumshanbo Gunpowder", w: ["Monkey 47", "Roku", "The Botanist"] },
  { g: "Gin", n: "Garnish to match the gin",
    gist: "Match the garnish to the gin's main flavour: orange with Flor de Sevilla, a lemon twist with Tanqueray, grapefruit or ginger with Roku. It lifts the same notes on the nose, so the G&T tastes like a better gin.",
    say: "We'll do that with orange, it brings out the Seville orange in the gin.",
    src: "Common bar practice; Tanqueray and Roku serve suggestions",
    q: "Best garnish for a Tanqueray Flor de Sevilla and tonic?", a: "Orange", w: ["Cucumber", "Olive", "Mint"] },

  // ---- Agave ----
  { g: "Agave", n: "100% agave",
    gist: "Tequila must be at least 51% blue agave. \"100% agave\" means nothing else went in, and it tastes cleaner and more of the plant. El Jimador, Don Julio and Clase Azul are all 100% agave.",
    say: "Everything we pour is 100% agave, so it's clean, no harsh burn.",
    src: "Norma Oficial Mexicana NOM-006-SCFI (tequila)",
    q: "How much blue agave must ALL tequila contain, at least?", a: "51%", w: ["100%", "25%", "75%"] },
  { g: "Agave", n: "Blanco, reposado, añejo",
    gist: "Blanco is bottled young, so it's peppery and fresh: best for Margaritas. Reposado (\"rested\") has 2 to 12 months in oak: softer, a little vanilla. Añejo has 1 to 3 years in oak: rich, made for sipping. Don Julio 1942 is an añejo.",
    say: "Blanco's fresh and peppery, perfect for a Margarita. Añejo's aged in oak, so you sip it like a whisky.",
    src: "NOM-006-SCFI (tequila classes)",
    q: "A reposado tequila is aged for…", a: "2 to 12 months", w: ["Not at all", "At least 3 years", "1 week"] },
  { g: "Agave", n: "Why mezcal is smoky",
    gist: "Mezcal's agave hearts are roasted in pits in the ground, which gives the smoke. Tequila's are usually steamed. A Margarita or Paloma with Amarás mezcal is a smoky twist to suggest.",
    say: "Mezcal's agave is roasted underground, that's the smoke. Want to try your Margarita with it?",
    src: "Consejo Regulador del Mezcal; Amarás",
    q: "Why does mezcal taste smoky?", a: "The agave is roasted in pits", w: ["It's aged in burnt barrels", "Smoke is added", "It's made from peat"] },

  // ---- Rum and brandy ----
  { g: "Rum", n: "White, spiced, dark, aged",
    gist: "White rum (Captain Morgan White) is light, for Mojitos and Daiquiris. Spiced (Captain Morgan Spiced Gold) has vanilla and spice added. Kraken is a black spiced rum: sweet and heavy. Zacapa 23 is aged in a solera: older rums blended through barrels, rich and made for sipping.",
    say: "Zacapa's a sipping rum, aged in a solera, like a sherry. Really rich, great on one cube.",
    src: "Captain Morgan, Kraken and Zacapa",
    q: "Which of our rums is made for sipping?", a: "Zacapa 23", w: ["Captain Morgan White", "Malibu", "Kraken"] },

  // ---- Aperitivo and liqueurs ----
  { g: "Aperitivo and liqueurs", n: "Aperol or Campari?",
    gist: "Aperol is 11% ABV, orange and only lightly bitter: easy, sweet, the Spritz. Campari is about 25%, much more bitter: the Negroni. If a guest finds Campari too bitter, an Aperol Spritz is the swap.",
    say: "Aperol's lighter and sweeter. Campari's more bitter, more grown up. Too bitter? Go Aperol.",
    src: "Campari Group, Aperol and Campari",
    q: "Which is lighter and sweeter?", a: "Aperol", w: ["Campari", "They're the same", "Neither, both are dry"] },
  { g: "Aperitivo and liqueurs", n: "Cointreau or Grand Marnier?",
    gist: "Both are orange liqueurs. Cointreau is clear and made from sweet and bitter orange peel: bright and clean. Grand Marnier is orange blended with Cognac: richer and warmer.",
    say: "Cointreau's clean orange. Grand Marnier's got Cognac in it, so it's richer.",
    src: "Cointreau; Grand Marnier",
    q: "What's in Grand Marnier that isn't in Cointreau?", a: "Cognac", w: ["Rum", "Vodka", "Coffee"] },

  // ---- Fizz and beer ----
  { g: "Beer and fizz", n: "Lager, ale, IPA, stout",
    gist: "Lager uses yeast that works cold and slow: clean and crisp (Corona, San Miguel). Ale uses warmer yeast: fruitier, fuller. An IPA is an ale with lots of hops: bitter, citrus or pine. A stout is dark from roasted barley: coffee and chocolate.",
    say: "If you like crisp and easy, go lager. If you like hoppy and bitter, try an IPA.",
    src: "Brewers Association beer style guidelines",
    q: "What makes a stout dark?", a: "Roasted barley", w: ["Added cola", "Long ageing", "Dark hops"] },
  { g: "Beer and fizz", n: "No and low",
    gist: "Corona Cero and San Miguel 0.0 are lagers with the alcohol taken out: under 0.05%, which is alcohol free in the UK. Point drivers and anyone not drinking to them, and to the alcohol-free cocktails.",
    say: "We've got Corona Cero and San Miguel 0.0, both properly alcohol free, or I can do you a zero proof cocktail.",
    src: "UK alcohol-free labelling guidance (0.05% ABV); Corona and San Miguel",
    q: "In the UK, \"alcohol free\" means up to…", a: "0.05% ABV", w: ["0.5% ABV", "1.2% ABV", "2% ABV"] },
  { g: "Beer and fizz", n: "Prosecco or Champagne?",
    gist: "Prosecco is from north-east Italy, made mostly from the Glera grape, with the bubbles made in big tanks: fresh, fruity, lighter. Champagne comes only from Champagne in France, with the second fermentation in each bottle: toastier, finer bubbles.",
    say: "Prosecco's fresher and fruitier. Champagne's made in the bottle, so it's toastier.",
    src: "Consorzio Prosecco DOC; Comité Champagne",
    q: "Prosecco is made mostly from which grape?", a: "Glera", w: ["Chardonnay", "Pinot Noir", "Sauvignon Blanc"] },

  // ---- Technique ----
  { g: "Why we do it", n: "Shake or stir?",
    gist: "Shake anything with citrus, cream, egg white or foamer: it mixes, chills and adds air. Stir drinks that are only spirits (Martini, Negroni, Old Fashioned): they stay clear and silky. About a quarter of a shaken drink is melted ice, and that's part of the recipe.",
    say: "Stirred, so it stays clear and silky.",
    src: "Dave Arnold, Liquid Intelligence (2014), shaking and dilution",
    q: "Which do you stir, not shake?", a: "A Negroni", w: ["A Margarita", "A Pornstar Martini", "A Whiskey Sour"] },
  { g: "Why we do it", n: "Dry shake for foam",
    gist: "A Sour with egg white or foamer is shaken first without ice (dry shake). Without ice the proteins whip up into foam more easily, then the shake with ice chills it.",
    say: "That's the dry shake: no ice first, it makes the foam.",
    src: "Common bar technique; our own specs",
    q: "Why dry shake a Sour first?", a: "More foam", w: ["It's colder", "It's quicker", "Less sugar"] },
  { g: "Why we do it", n: "Fizz goes in last",
    gist: "Never shake prosecco, soda or tonic: the bubbles go and it can burst the tin. Build or shake the rest, then top in the glass.",
    say: "",
    src: "Our own specs",
    q: "When does the prosecco go in?", a: "Last, in the glass", w: ["In the shaker", "First, in the glass", "Before the ice"] },

  // ---- Selling it ----
  { g: "Selling it", n: "Describe a drink in three words",
    gist: "Taste, texture, strength. \"Sweet, fruity, easy.\" \"Bitter, silky, strong.\" Then the spirit. Guests choose faster from three words than from a list of ingredients.",
    say: "It's fruity, light and easy, with vodka and passion fruit.",
    src: "",
    q: "The best way to describe a drink quickly?", a: "Taste, texture, strength", w: ["Every ingredient", "The price", "How long it takes"] },
  { g: "Selling it", n: "Go up a bottle",
    gist: "When someone orders a short, spirit-led drink, offer the better bottle by name and say why in one line: \"Want that Old Fashioned with Elijah Craig? It's richer.\" Name it, give one reason, then leave it.",
    say: "Want that with Grey Goose? It's smoother in a Martini.",
    src: "",
    q: "The best moment to offer a better spirit?", a: "A short, spirit-led drink", w: ["A vodka and cola", "A pint of lager", "A soft drink"] },
  { g: "Selling it", n: "Beer drinker? Offer one cocktail",
    gist: "Most guests don't know we make cocktails. To someone on beer, suggest one signature in one line that sounds like something they'd like: fresh and citrus, or sweet and fun.",
    say: "Have you tried our signatures? The London Cosmo's fresh and easy if you fancy a change.",
    src: "",
    q: "A guest on their second lager. What do you do?", a: "Suggest one signature in a line", w: ["Read out the whole menu", "Say nothing", "Offer a shot for everyone"] },
];
// A question per card, the options shuffled.
function b101Quiz(n = 10) {
  const r = Math.random, pick = shuffle(r, B101).slice(0, n);
  return pick.map((c) => ({ ask: c.q, answer: c.a, wrong: c.w, kind: "b101", name: c.n, id: null, app: true, opts: shuffle(r, [c.a, ...c.w]) }));
}
let b101G = store.get("b101g", ""), b101Open = "";
function renderB101() {
  const groups = [...new Set(B101.map((c) => c.g))], xs = B101.filter((c) => !b101G || c.g === b101G);
  $("#pb101").innerHTML = `<div class="card" style="text-align:left"><h2 style="font-size:26px">Bar 101</h2>
    <p class="note">What to say when a guest asks: why a bottle costs more, which whisky to pick, the difference between styles. Our own back bar only.</p>
    <button class="btn pri wide" data-qz="b101">Quiz me: 10 questions</button></div>
    <div class="recent">${["", ...groups].map((g) => `<button class="chip" data-b101-g="${esc(g)}" aria-pressed="${g === b101G}">${g || "Everything"}</button>`).join("")}</div>
    ${xs.map((c) => { const k = B101.indexOf(c), on = b101Open === String(k);
      return `<article class="notice b101${on ? " on" : ""}"><button class="b101h" data-b101="${k}" aria-expanded="${on}"><small>${esc(c.g)}</small><b>${esc(c.n)}</b></button>
        ${on ? `<p class="txt">${esc(c.gist)}</p>${c.say ? `<p class="b101say"><b>Say it:</b> “${esc(c.say)}”</p>` : ""}${c.src ? `<p class="s">Source: ${esc(c.src)}</p>` : ""}` : ""}</article>`; }).join("")}`;
}
document.addEventListener("click", (e) => {
  const g = e.target.closest("[data-b101-g]"); if (g) { b101G = g.dataset.b101G; store.set("b101g", b101G); renderB101(); return; }
  const c = e.target.closest("[data-b101]"); if (c) { b101Open = b101Open === c.dataset.b101 ? "" : c.dataset.b101; haptic(); renderB101(); }
});
document.head.insertAdjacentHTML("beforeend", `<style>
.b101{padding:0;overflow:hidden}.b101h{display:block;width:100%;text-align:left;padding:12px 14px;color:var(--fg)}
.b101h small{display:block;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--brass)}.b101h b{display:block;font-size:18px;margin-top:2px}
.b101 .txt,.b101 .s,.b101say{margin:0;padding:0 14px 10px}.b101say{font-size:15px}.b101.on{border-color:var(--brass)}
</style>`);
