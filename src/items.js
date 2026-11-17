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
async function itLookup(name) {
  const u = "https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrlimit=3&prop=description&format=json&formatversion=2&origin=*&gsrsearch=" + encodeURIComponent(name);
  const c = new AbortController(), t = setTimeout(() => c.abort(), 6000);
  try {
    const r = await fetch(u, { signal: c.signal });
    if (!r.ok) throw new Error(r.status);
    const pages = ((await r.json()).query || {}).pages || [];
    return pages.sort((a, b) => a.index - b.index).map((p) => ({ title: p.title, desc: p.description || "" }));
  } finally { clearTimeout(t); }
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
var IT_NOISE = /\b(single|song|album|film|band|novel|book|episode|television|series|video game|footballer|singer|rapper|actor|actress|musician|politician|entrepreneur|village|town|city|river|locality|disambiguation|topics referred|born \d|surname|given name|airline)\b/i;
function itGuess(name, hits) {
  const said = (hits || []).filter((h) => !IT_NOISE.test(h.desc)).map((h) => [itKindOf(`${h.title} ${h.desc}`, true), `${h.title}: ${h.desc}`.slice(0, 200)]);
  const kind = itKindOf(name) || (said.find(([k]) => k) || [])[0] || itKindOf(name, true) || itOwn(name) || "other";
  // What was found online that agrees, to show why.
  return { kind, found: (said.find(([k]) => k === kind) || [0, ""])[1] };
}
// A form filled in from a kind. Changing the kind fills in its defaults again; anything typed in the note stays.
function itFill(f, kind) {
  const k = IT_KINDS[kind];
  Object.assign(f, { kind, side: k.side, store: k.store, label: k.label, life: k.life ? String(k.life) : "", close: k.close });
  if (kind === "beer" && /draught|draft|\bkeg\b/i.test(f.item)) f.store = "cellar";
  return f;
}
var itF = null, itBusy = false, itOpen = false, itShow = "";
// Names compared loosely: "Fresh strawberries" is the stock list's "Strawberries".
function itNorm(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\b(fresh|the|a|bottles?|cans?)\b/g, " ").replace(/ies\b/g, "y").replace(/s\b/g, "").replace(/\s+/g, " ").trim(); }
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
    ${f.looked ? `<p class="s it-found">${f.found ? `Found online: <b>${esc(f.found)}</b> (Wikipedia)` : f.offline ? "Couldn't look it up online (no signal?). Worked out from the name." : "Nothing found online. Worked out from the name."}</p>` : ""}
    <p class="it-guess"><b>${esc(f.item)}</b> looks like: <b>${esc(k.t)}</b>. Check it and change anything that's wrong.</p>
    <label class="fld">What kind of thing<select data-it="kind">${opt(Object.fromEntries(Object.entries(IT_KINDS).map(([key, x]) => [key, x.t])), f.kind)}</select></label>
    <div class="two"><label class="fld">Side<select data-it="side">${opt(SIDE_NAME, f.side)}</select></label>
      <label class="fld">Where it's kept<select data-it="store">${opt(IT_STORE, f.store)}</select></label></div>
    <label class="check"><input type="checkbox" data-it="label"${f.label ? " checked" : ""}> Needs a date label once it's opened</label>
    ${f.label ? `<label class="fld">Days it keeps once opened<input data-it="life" inputmode="numeric" maxlength="3" placeholder="From the pack. Blank: a manager fills it in" value="${esc(f.life)}"></label>` : ""}
    <label class="fld">At close<select data-it="close">${opt(IT_CLOSE, f.close)}</select></label>
    ${k.tip ? `<p class="note">${esc(k.tip)}</p>` : ""}
    <label class="fld">Anything else to know <span class="s">(optional)</span><input data-it="note" maxlength="200" value="${esc(f.note)}" placeholder="Which shelf, which fridge, who orders it"></label>
    ${itStock(f.item) ? `<p class="note">${esc(f.item)} is on the stock list already, under <b>${esc(itStock(f.item).group)}</b>. This adds where it's kept and what happens to it at close${f.label ? ", and puts it on the date labels" : ""}.</p>` : `<p class="note">Goes under <b>${esc(itGroup(f.kind, `${f.item} ${f.found || ""}`, f.side))}</b> on the 86 list and restocking${f.label ? ", and on the date labels" : ""}, and on the ${lower(sideName(f.side))} closing page.</p>`}
    <div class="actions"><button class="btn pri" id="it-save">${own ? (edit ? (f.status === "waiting" ? "Approve and add it" : "Save") : "Add it") : "Send it to Maintenance to check"}</button>
      ${edit && own ? `<button class="btn danger" data-it-drop="${f.id}">${f.status === "waiting" ? "Turn it down" : "Take it off"}</button>` : ""}<button class="btn" id="it-cancel">Cancel</button></div></div>`;
}
// On the Stock page: add something, what's waiting for Maintenance, and what's been added on this side.
function itemsHtml(side) {
  if (!LIVE.loaded.has("items")) return "";
  const wait = itWaiting(), mine = itLive(side);
  const waitRow = (x) => `<div class="it-row"><div><b>${esc(x.item)}</b> <span class="pill wait">Waiting for Maintenance</span><div class="s">${esc(IT_KINDS[x.kind].t)} · ${esc(itLine(x))}</div><div class="s">Added by ${esc(x.addedBy)}${x.pending ? ", saving…" : `, ${when(x.at)}`}${x.found ? ` · ${esc(x.found)}` : ""}</div></div>
    <div class="actions">${LIVE.owner ? `<button class="btn pri" data-it-edit="${x.id}">Check it</button>` : `<button class="btn" data-it-drop="${x.id}">Take it back</button>`}</div></div>`;
  const liveRow = (x) => `<div class="it-row"><div><b>${esc(x.item)}</b> <span class="pill">${esc(x.group)}</span><div class="s">${esc(itLine(x))}</div>${x.note ? `<div class="s">${esc(x.note)}</div>` : ""}</div>
    ${LIVE.owner ? `<div class="actions"><button class="btn" data-it-edit="${x.id}">Change</button></div>` : ""}</div>`;
  const form = itF?.kind && !itF.id ? itFormHtml() : `<div class="ltools"><input id="it-name" maxlength="60" placeholder="Like Rubicon Mango or fresh strawberries" aria-label="What it is" value="${esc(itF?.item || "")}"><button class="btn pri" id="it-look"${itBusy ? " disabled" : ""}>${itBusy ? "Looking…" : "Look it up"}</button></div>`;
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
async function itLook() {
  const typed = ($("#it-name")?.value || "").trim().replace(/\s+/g, " ").slice(0, 60);
  if (!typed) return toast("Type what it is first");
  const st = itStock(typed), item = st ? st.item : typed;
  const dup = itDup(item); if (dup) return toast(dup);
  itBusy = true; itF = { item }; renderTally();
  let hits = null, offline = false;
  try { hits = await itLookup(item); } catch { offline = true; }
  itBusy = false;
  if (itF?.item !== item) return;
  const g = itGuess(item, hits);
  itF = itFill({ item, note: "", found: g.found, looked: true, offline, stock: st?.group || "" }, g.kind);
  renderTally();
}
function itSave() {
  const f = itF, life = f.label && f.life.trim() ? Number(f.life) : 0;
  if (!Number.isInteger(life) || life < 0 || life > 365) return toast("Days it keeps: a whole number from 1 to 365, or leave it blank");
  const dup = itDup(f.item, f.id); if (dup) return toast(dup);
  const x = { item: f.item, kind: f.kind, group: itStock(f.item)?.group || itGroup(f.kind, `${f.item} ${f.found || ""}`, f.side), side: f.side, store: f.store, label: f.label, life: f.label ? life : 0, close: f.close, note: f.note.trim().slice(0, 200), found: f.found || "" };
  const was = f.id && LIVE.items.find((y) => y.id === f.id);
  if (f.id && !was) { itF = null; renderTally(); return toast("Someone has just taken it off"); }
  const p = f.id ? LIVE.api.saveItem(was, x) : LIVE.api.addItem(x, LIVE.owner);
  track(p, LIVE.owner ? `${x.item} is on every phone now` : `Sent. Maintenance will check ${x.item}`, "Not saved. Try again");
  // Maintenance putting it on: its date label goes on too, when its days are known and the side hasn't got one.
  if (LIVE.owner && x.label && x.life && !dupLabel(x.item, x.side)) track(LIVE.api.label(null, "added", { item: x.item, side: x.side, life: x.life, on: true }), null, "The date label wasn't added. Add it on Labels");
  itF = null; itOpen = true; haptic(); renderTally();
}
$("#tally").addEventListener("click", (e) => {
  if (e.target.closest("#it-look")) { itLook(); return; }
  if (e.target.closest("#it-cancel")) { itF = null; renderTally(); return; }
  if (e.target.closest("#it-save")) { if (itF) itSave(); return; }
  const ed = e.target.closest("[data-it-edit]"); if (ed) {
    const x = LIVE.items.find((y) => y.id === ed.dataset.itEdit); if (!x) return;
    itF = { id: x.id, status: x.status, item: x.item, kind: x.kind, side: x.side, store: x.store, label: x.label, life: x.life ? String(x.life) : "", close: x.close, note: x.note, found: x.found, looked: !!x.found };
    renderTally(); return;
  }
  const dr = e.target.closest("[data-it-drop]"); if (dr) {
    const x = LIVE.items.find((y) => y.id === dr.dataset.itDrop); if (!x) return;
    if (!confirm(x.status === "waiting" ? `${LIVE.owner && x.addedUid !== LIVE.uid ? "Turn down" : "Take back"} ${x.item}?` : `Take ${x.item} off? It leaves the 86 list, restocking and closing. A date label already set up for it stays on Labels.`)) return;
    track(LIVE.api.dropItem(x.id), `${x.item} taken off`, "Not done. Try again");
    if (itF?.id === x.id) itF = null; haptic(); renderTally();
  }
});
$("#tally").addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.id === "it-name") { e.preventDefault(); itLook(); } });
$("#tally").addEventListener("input", (e) => { const k = e.target.dataset.it; if (itF && (k === "life" || k === "note")) itF[k] = e.target.value; });
$("#tally").addEventListener("change", (e) => {
  const k = e.target.dataset.it; if (!itF || !k || k === "life" || k === "note") return;
  if (k === "kind") itFill(itF, e.target.value);
  else itF[k] = e.target.type === "checkbox" ? e.target.checked : e.target.value;
  renderTally();
});
keepOpen($("#tally"), (e) => { if (e.target.id === "it-add") itOpen = e.target.open; if (e.target.id === "it-list") itShow = e.target.open ? mode : ""; });
