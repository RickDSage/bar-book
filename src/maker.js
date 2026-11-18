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
    ["White rum", "White rum", "light rum", "rum"], ["Captain Morgan White", "White rum"], ["Bacardi Carta Blanca", "White rum", "bacardi", "bacardi carta blanca"], ["Havana Club 3", "White rum", "havana club"],
    ["Gold rum", "Gold rum", "golden rum"], ["Bacardí Carta Oro", "Gold rum", "carta oro", "bacardi carta oro"],
    ["Overproof rum", "Overproof rum"], ["Wray & Nephew Overproof", "Overproof rum", "wray nephew", "wray and nephew", "wray nephew overproof"],
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
    ["Canadian whisky", "Canadian whisky"], ["Crown Royal", "Canadian whisky"],
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
    ["Midori", "Melon liqueur", "melon liqueur"], ["Archers", "Peach schnapps", "peach schnapps", "peach liqueur"], ["Passoa", "Passion fruit liqueur", "passion fruit liqueur"], ["Lychee liqueur", "Lychee liqueur", "lychee liqueur", "soho lychee", "kwai feh"],
    ["Apple liqueur", "Apple liqueur", "sour apple", "apple schnapps", "apple sourz"], ["Luxardo Limoncello", "Limoncello", "limoncello"], ["Malibu", "Coconut rum", "coconut rum"],
    ["St-Germain", "Elderflower liqueur", "st germain", "elderflower liqueur"], ["Baileys", "Cream liqueur", "irish cream", "cream liqueur"],
    ["Marshmallow liqueur", "Marshmallow liqueur"], ["Velvet Falernum", "Falernum", "falernum"], ["Apricot brandy", "Apricot liqueur", "apricot liqueur"],
    ["Butterscotch schnapps", "Butterscotch schnapps", "butterscotch"], ["Southern Comfort", "Southern Comfort", "soco"], ["Advocaat", "Advocaat", "warninks"],
    ["White crème de cacao", "White cacao", "white creme de cacao", "creme de cacao"], ["Dark crème de cacao", "Dark cacao", "dark creme de cacao"],
    ["Green crème de menthe", "Crème de menthe", "creme de menthe", "green creme de menthe"], ["White crème de menthe", "Crème de menthe", "white creme de menthe"], ["Crème de violette", "Violette", "creme de violette", "violet liqueur"],
    ["Yellow Chartreuse", "Yellow Chartreuse"], ["Green Chartreuse", "Green Chartreuse"], ["Bénédictine", "Bénédictine", "benedictine"], ["Drambuie", "Drambuie"],
    ["Jägermeister", "Jägermeister", "jagermeister", "jager"], ["Galliano", "Galliano"], ["Amaro Nonino", "Amaro", "amaro", "nonino"], ["Amer Picon", "Amaro", "amer picon", "picon"], ["Suze", "Gentian liqueur", "suze", "gentiane"], ["Fernet-Branca", "Fernet", "fernet", "fernet branca"], ["Ancho Reyes", "Chilli liqueur", "chilli liqueur", "ancho"],
    ["NV Absinthe", "Absinthe", "absinthe"], ["Sambuca", "Sambuca"], ["Pernod", "Pastis", "pastis", "ricard"]]],
  ["Aperitifs, vermouth and wine", null, [
    ["Aperol", "Aperol"], ["Campari", "Campari"], ["Sarti Rosa", "Sarti Rosa", "sarti"],
    ["Sweet vermouth", "Sweet vermouth", "rosso vermouth", "red vermouth"], ["Martini Rosso", "Sweet vermouth"], ["Martini Bianco", "Bianco vermouth", "bianco"],
    ["Dry vermouth", "Dry vermouth"], ["Martini Extra Dry", "Dry vermouth", "martini dry"], ["Noilly Prat", "Dry vermouth"], ["Lillet Blanc", "Lillet", "lillet"], ["Fino sherry", "Sherry", "fino", "sherry", "tio pepe"],
    ["Pimm's No.1", "Pimm's", "pimms", "pimm s"], ["Dry white wine", "White wine", "white wine"], ["Red wine", "Red wine"],
    ["Prosecco", "Sparkling wine", "sparkling wine", "fizz"], ["Champagne", "Sparkling wine"], ["Cava", "Sparkling wine"]]],
  ["Beer and cider", "Beer", [
    ["Lager", "Lager"], ["Stella Artois", "Lager", "stella"], ["Budweiser", "Lager", "bud"], ["Corona", "Lager"], ["San Miguel", "Lager", "san miguel"], ["Camden Hells", "Lager", "camden", "camden hells lager"],
    ["IPA", "IPA", "india pale ale", "pale ale"], ["Camden Off Menu IPA", "IPA", "off menu", "camden off menu"], ["Camden Eazy IPA", "IPA", "eazy ipa", "easy ipa", "camden eazy"], ["Goose Island Midway", "IPA", "goose island", "midway", "midway ipa"],
    ["Guinness", "Stout", "stout"], ["Athletic Run Wild IPA 0%", "Alcohol-free beer", "athletic", "run wild", "alcohol free beer", "0 beer"],
    ["Corona Cero", "Alcohol-free beer", "corona 0", "corona 0 0", "corona zero", "corona 0 0 0"], ["San Miguel 0,0", "Alcohol-free beer", "san miguel 0", "san miguel zero", "san miguel cero", "san miguel 0 0"],
    ["Cider", "Cider", "apple cider"], ["Kopparberg Crisp Apple", "Cider", "crisp apple", "kopparberg apple"], ["Fruit cider", "Fruit cider"], ["Kopparberg Strawberry & Lime", "Fruit cider", "kopparberg strawberry", "strawberry and lime"],
    ["Kopparberg Mixed Fruit", "Fruit cider", "kopparberg", "mixed fruit cider"], ["Kopparberg Mixed Fruit 0%", "Alcohol-free cider", "alcohol free cider", "kopparberg 0", "kopparberg alcohol free"]]],
  ["Creams, milk and foam", null, [
    ["Double cream", "Cream", "cream", "whipping cream"], ["Single cream", "Cream"], ["Milk", "Milk", "whole milk"], ["Oat milk", "Milk", "oatly"],
    ["Coco Real", "Coconut cream", "cream of coconut", "coconut cream", "coconut syrup"], ["Coconut milk", "Coconut cream"],
    ["Egg white", "Foamer", "egg"], ["Aquafaba", "Foamer", "chickpea water"], ["Foamer", "Foamer", "foamer drops", "foamee", "ms better s"], ["Vanilla ice cream", "Ice cream", "ice cream"]]],
  ["Syrups and sauces", null, [
    ["Sugar syrup", "Sugar syrup", "simple syrup", "gomme", "sugar"], ["Sugar cube", "Sugar", "sugar cubes", "white sugar"], ["Rich sugar syrup (2:1)", "Sugar syrup", "rich sugar syrup"], ["Demerara syrup", "Sugar syrup", "demerara"],
    ["Honey syrup (2:1)", "Honey", "honey syrup", "honey", "monin honey"], ["Honey-ginger syrup", "Honey", "honey ginger"], ["Agave syrup", "Agave syrup", "agave nectar", "agave"],
    ["Vanilla syrup", "Vanilla syrup"], ["Monin Vanilla", "Vanilla syrup"], ["Grenadine", "Grenadine", "de kuyper grenadine", "pomegranate syrup"], ["Giffard Orgeat", "Orgeat", "orgeat", "almond syrup"],
    ["Elderflower cordial", "Elderflower", "bottlegreen elderflower", "elderflower"], ["Monin Elderflower", "Elderflower", "elderflower syrup"], ["Salted caramel sauce", "Caramel", "salted caramel", "caramel sauce"], ["Monin Salted Caramel", "Caramel", "caramel syrup", "salted caramel syrup"], ["Marshmallow syrup", "Marshmallow syrup", "william fox marshmallow"],
    ["Passion fruit syrup", "Passion fruit syrup", "monin passion fruit"], ["Raspberry syrup", "Raspberry syrup", "monin raspberry"], ["Strawberry syrup", "Strawberry syrup", "monin strawberry"],
    ["Watermelon syrup", "Watermelon syrup", "monin watermelon", "watermelon"], ["Cinnamon syrup", "Cinnamon syrup"],
    ["Hazelnut syrup", "Hazelnut syrup"], ["Ginger syrup", "Ginger syrup"], ["Lime cordial", "Lime cordial", "roses lime"], ["Blackcurrant cordial", "Blackcurrant cordial", "ribena"]]],
  ["Juices and purées", null, [
    ["Lime juice", "Lime juice", "fresh lime"], ["Lemon juice", "Lemon juice", "fresh lemon"], ["Orange juice", "Orange juice", "oj"], ["Pineapple juice", "Pineapple juice"],
    ["Cranberry juice", "Cranberry juice", "cranberry", "eager cranberry"], ["Grapefruit juice", "Grapefruit juice", "grapefruit"], ["Tomato juice", "Tomato juice"], ["Apple juice", "Apple juice"],
    ["Mango juice", "Mango juice"], ["Strawberry purée", "Strawberry purée", "strawberry puree"], ["Funkin peach purée", "Peach purée", "peach puree", "funkin peach"],
    ["Passion fruit purée", "Passion fruit purée", "passion fruit puree"], ["Mango purée", "Mango purée", "mango puree"], ["Raspberry purée", "Raspberry purée", "raspberry puree"], ["Lychee juice", "Lychee juice", "lychee juice", "lychee syrup from the tin"]]],
  ["Mixers and fizz", null, [
    ["Soda water", "Soda", "soda", "club soda", "sparkling water"], ["Fever-Tree Indian Tonic", "Tonic", "indian tonic", "tonic", "tonic water"], ["Fever-Tree Light Tonic", "Tonic", "light tonic", "slimline tonic"],
    ["Fever-Tree Ginger Ale", "Ginger ale", "ginger ale"], ["Fever-Tree Ginger Beer", "Ginger beer", "ginger beer"], ["Lemonade", "Lemonade", "house lemonade", "7up"], ["Sprite", "Lemonade", "sprite zero"], ["Fanta Orange Zero", "Orange soda", "fanta", "fanta zero", "fanta orange", "orange soda"],
    ["Coca-Cola", "Cola", "cola", "coke", "coca cola"], ["Diet Coke", "Cola", "pepsi"], ["Coke Zero", "Cola", "coca cola zero", "zero sugar coke"], ["Red Bull", "Energy drink", "energy drink"], ["Red Bull Sugarfree", "Energy drink", "red bull sugar free", "sugar free red bull", "red bull zero"], ["Jarritos", "Jarritos", "mexican soda"], ["Jarritos Guava", "Jarritos", "guava soda"], ["Jarritos Mandarin", "Jarritos", "mandarin soda", "jarritos mandarina"], ["Jarritos Pineapple", "Jarritos", "pineapple soda", "jarritos pina"],
    ["Jarritos Grapefruit", "Jarritos", "grapefruit soda", "jarritos toronja"], ["Jarritos Strawberry", "Jarritos", "strawberry soda", "jarritos fresa"], ["Jarritos Lime", "Jarritos", "lime soda", "jarritos lima"], ["Iced tea", "Iced tea", "house iced tea"], ["Water", "Water", "hot water"]]],
  ["Coffee", null, [["Fresh espresso", "Espresso", "espresso", "coffee"], ["Hot Americano", "Hot coffee", "americano", "filter coffee"]]],
  ["Fresh and garnish", null, [
    ["Mint", "Mint", "mint leaves", "mint sprig"], ["Basil", "Basil", "basil leaves"], ["Limes", "Lime", "lime wedge", "lime wedges", "lime", "1 lime"], ["Lemons", "Lemon", "lemon wedge", "lemon"],
    ["Cucumber", "Cucumber", "cucumber slices"], ["Red jalapeño", "Chilli", "jalapeno", "chilli", "red jalapeno"], ["Passion fruit", "Passion fruit", "passion fruit"],
    ["Oranges", "Fresh orange", "orange wedge", "orange wedges", "orange slice", "orange twist", "orange peel", "orange zest"], ["Cocktail cherries", "Cocktail cherry", "cocktail cherry", "maraschino cherry", "maraschino cherries", "luxardo cherry", "luxardo cherries"],
    ["Orange marmalade", "Marmalade", "marmalade"], ["Strawberries", "Strawberries", "strawberry"], ["Olive brine", "Olive brine", "olives"], ["Pickle brine", "Pickle brine", "chilled pickle brine", "pickle"]]],
  ["Bitters and seasoning", null, [
    ["Angostura", "Angostura", "angostura bitters", "aromatic bitters", "bitters"], ["Orange bitters", "Orange bitters"], ["Peychaud's bitters", "Peychaud's", "peychaud"],
    ["Chocolate bitters", "Chocolate bitters", "cocoa bitters"], ["Celery bitters", "Celery bitters"], ["Tabasco", "Tabasco", "hot sauce"], ["Worcestershire sauce", "Worcestershire", "worcestershire", "lea perrins"],
    ["Salt", "Salt", "sea salt"], ["Celery salt and black pepper", "Celery salt", "celery salt", "black pepper", "pepper"], ["Cayenne pepper", "Cayenne", "cayenne"],
    ["Orange flower water", "Flower water", "orange blossom water", "orange flower"], ["Vanilla extract", "Vanilla extract"]]],
];
// Families: kinds that swap with a change of flavour. Anything else only swaps within its own kind.
const MK_FAM = {
  "Orange liqueur": "Orange", "Blue curaçao": "Orange", "Coffee liqueur": "Coffee", "Espresso": "Coffee", "Hot coffee": "Coffee",
  "Cherry liqueur": "Cherry", "Maraschino": "Cherry", "Raspberry liqueur": "Berry", "Cassis": "Berry", "Blackberry liqueur": "Berry",
  "White cacao": "Cacao", "Dark cacao": "Cacao", "Yellow Chartreuse": "Herbal", "Green Chartreuse": "Herbal", "Bénédictine": "Herbal", "Drambuie": "Herbal", "Galliano": "Herbal",
  "Absinthe": "Anise", "Sambuca": "Anise", "Pastis": "Anise", "Aperol": "Bitter aperitif", "Campari": "Bitter aperitif", "Sarti Rosa": "Bitter aperitif", "Amaro": "Bitter aperitif", "Gentian liqueur": "Bitter aperitif", "Fernet": "Bitter aperitif", "White wine": "Wine", "Red wine": "Wine",
  "Sweet vermouth": "Vermouth", "Bianco vermouth": "Vermouth", "Dry vermouth": "Vermouth", "Lillet": "Vermouth", "Sherry": "Vermouth", "Lager": "Beer", "IPA": "Beer", "Stout": "Beer", "Cider": "Beer", "Fruit cider": "Beer", "Alcohol-free beer": "No-alcohol beer", "Alcohol-free cider": "No-alcohol beer",
  "Cream": "Dairy", "Milk": "Dairy", "Ice cream": "Dairy", "Sugar syrup": "Sweet", "Sugar": "Sweet", "Honey": "Sweet", "Agave syrup": "Sweet",
  "Elderflower": "Elderflower", "Elderflower liqueur": "Elderflower", "Marshmallow liqueur": "Marshmallow", "Marshmallow syrup": "Marshmallow",
  "Lime juice": "Citrus", "Lemon juice": "Citrus", "Tonic": "Tonic", "Lemonade": "Lemony fizz", "Soda": "Fizz", "Ginger ale": "Ginger", "Ginger beer": "Ginger", "Ginger syrup": "Ginger",
  "Orange bitters": "Bitters", "Angostura": "Bitters", "Peychaud's": "Bitters", "Chocolate bitters": "Bitters", "Celery bitters": "Bitters", "Salt": "Seasoning", "Celery salt": "Seasoning", "Cayenne": "Seasoning",
  "Strawberry purée": "Strawberry", "Strawberries": "Strawberry", "Strawberry syrup": "Strawberry", "Passion fruit": "Passion", "Passion fruit purée": "Passion", "Passion fruit syrup": "Passion",
  "Raspberry purée": "Raspberry", "Raspberry syrup": "Raspberry", "Mango purée": "Mango", "Mango juice": "Mango", "Peach purée": "Peach",
};
const mkNorm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const MK = { items: [], byKey: new Map(), reqs: new Map(), unmatched: [], ids: [] };
for (const [cat, fam, list] of MK_CATS) for (const [n, kind, ...al] of list) {
  const it = { k: mkNorm(n), n, cat, kind, fam: MK_FAM[kind] || fam || kind, gen: n === kind, al: [...new Set([mkNorm(n), ...al.map(mkNorm)])] };
  MK.items.push(it); MK.byKey.set(it.k, it);
}
// Every alias, longest first, so "Smirnoff Vanilla" wins over "Smirnoff" and "lime juice" over "lime".
const MK_ALIAS = MK.items.flatMap((it) => it.al.map((a) => [a, it])).sort((a, b) => b[0].length - a[0].length);
const mkFind = (text) => { const t = " " + mkNorm(text) + " "; const hit = MK_ALIAS.find(([a]) => t.includes(" " + a + " ")); return hit ? hit[1] : null; };
// The bar basics most bars always have. On by default, so a guest's two bottles still find a Daiquiri.
const MK_BASICS = ["Sugar syrup", "Lime juice", "Lemon juice", "Soda water", "Water", "Limes", "Angostura", "Salt"].map(mkNorm);
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
  opt: { basics: true, kind: "all", ...store.get("mk.opt", {}) },
  rnd: { mode: "any", mine: false, kind: "all", mood: null, base: null, last: [], cur: null, ...store.get("mk.rnd", {}), cur: null },
  qs: { q: "", kind: "all", mine: false },
  bt: { view: "classics", kind: "all", ...store.get("mk.bt", {}) },
  edit: null, // the pick whose ml is being set
  cat: "bt", // the ingredient group open on the shelf ("bt": the Black Tap line-up, null: Popular)
  fromBar: false, // showing what My bar can make
  typed: { make: "", bar: "" },
};
const mkSave = () => { store.set("mk.pane", mk.pane); store.set("mk.pick", mk.pick); store.set("mk.bar", mk.bar); store.set("mk.opt", mk.opt); store.set("mk.rnd", { mode: mk.rnd.mode, mine: mk.rnd.mine, kind: mk.rnd.kind, mood: mk.rnd.mood, base: mk.rnd.base, last: mk.rnd.last }); store.set("mk.bt", mk.bt); };
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
  // Whatever is on the 86 board tonight isn't on the bar, so it doesn't count.
  const out = plOutKeys();
  if (withBar) for (const k of mk.bar) if (!m.has(k) && !out.has(k)) m.set(k, { k });
  if (basics) for (const k of MK_BASICS) if (!m.has(k) && !out.has(k)) m.set(k, { k });
  return [...m.values()];
}
const mkKindOk = (d, kind) => kind === "all" || mkKids(d) === kind;
// What My bar (and the basics, if on) can make, closest first.
function mkMatches() {
  const held = mkHeld([], true, mk.opt.basics), anchor = new Set(mk.bar);
  if (!anchor.size) return [];
  return D.filter((d) => mkKindOk(d, mk.opt.kind)).map((d) => mkScore(d, held, anchor))
    .filter((r) => r.used > 0 && r.score >= 0.45)
    .sort((a, b) => a.miss.length - b.miss.length || b.score - a.score || b.used - a.used || a.short.length - b.short.length || (b.d.official ? 1 : 0) - (a.d.official ? 1 : 0));
}
// Can My bar (and the basics) make this drink with nothing missing?
const mkCanMake = (d) => !mkScore(d, mkHeld([], true, true), new Set(mk.bar)).miss.length;

/* ---------- The Black Tap line-up ----------
   The house basics behind the Soho bar, as Derek listed them (15 Nov 2026): the speed rail, the foam, the draught,
   the fridge and the mixers. Each is a serve card (glass, measure, how to pour) and a maker ingredient (k), so one tap
   lists every drink it goes in. "Black Tap classics" is every drink the line-up makes with what's always on the bar.
   ABVs are the makers' own (Camden, Kopparberg, Goose Island, Guinness pages, 15 Nov 2026); the rest stay unstated. */
const BT_DRAUGHT = { glass: "Branded pint glass, clean and cold", measure: "Pint, half or two-thirds (a third too). By law draught is only sold in these",
  pour: "Glass at 45° under the tap without touching it, open the tap fully, straighten the glass as it fills, finish with a head of about two fingers" };
const BT_SPIRIT = { glass: "Highball, cubed ice to the top", measure: "25 ml single, 50 ml double", pour: "Ice first, then the spirit, then the mixer. Wedge on the rim if the serve has one" };
const BT_SOFT = { glass: "Highball, cubed ice", measure: "The whole bottle or can", pour: "Pour slowly down the side of the glass, or a bar spoon, so it keeps its bubbles" };
const BT_LINEUP = [
  ["Spirits", [
    { k: "smirnoff", note: "The house vodka. With Coke, lemonade, cranberry, tonic or Red Bull." },
    { k: "smirnoff vanilla", note: "Vanilla vodka for the Pornstar and the dessert drinks. Long with Coke or lemonade." },
    { k: "ciroc red berry", note: "Berry vodka for the London Cosmo. Long with lemonade or soda and a lime wedge." },
    { k: "grey goose", note: "Premium vodka when a guest calls it: Vodka Martini or with soda and lime." },
    { k: "tanqueray", note: "The house gin. G&T: Fever-Tree Indian or Light tonic and a lime wedge." },
    { k: "bacardi carta blanca", note: "White rum. Mojito and Daiquiri, or with Coke and a lime wedge (Cuba Libre)." },
    { k: "captain morgan white", note: "White rum on the rail. Same job as Bacardi: Mojitos, Daiquiris, Long Islands." },
    { k: "captain morgan dark", note: "Dark rum for floats, Mai Tais, punches and Dark & Stormy style serves." },
    { k: "captain morgan spiced gold", note: "Spiced rum. With Coke and a lime wedge, or ginger beer." },
    { k: "kraken black spiced", note: "Black spiced rum. With Coke, or ginger beer and lime (Kraken Storm)." },
    { k: "el jimador blanco", note: "House tequila for Margaritas and shots. A shot comes with salt and a lime wedge if asked." },
    { k: "el jimador reposado", note: "Rested tequila for the signatures. Long with ginger ale and lime." },
    { k: "buffalo trace", note: "The house bourbon. Neat, over ice, or with Coke or ginger ale." },
    { k: "bulleit bourbon", note: "Second bourbon, higher rye: Old Fashioned, Whiskey Sour, or with ginger ale." },
    { k: "jack daniel s", note: "Tennessee whiskey. Jack & Coke with a lemon wedge, or Lynchburg Lemonade." },
    { k: "jameson", note: "Irish whiskey. With ginger ale and a lime wedge, Irish Coffee, Pickleback." },
    { k: "johnnie walker black label", note: "Blended Scotch. With soda or ginger ale, Rob Roy, Godfather, Penicillin." },
    { k: "martell vs", note: "Cognac (brandy). Sidecar, Horse's Neck, or with ginger ale." },
    { k: "pisco", note: "Grape brandy from Peru and Chile. Pisco Sour." },
  ]],
  ["Liqueurs", [
    { k: "cointreau", name: "Cointreau (triple sec)", measure: "15 to 25 ml in cocktails, 50 ml on the rocks", note: "The orange liqueur. Any spec that says triple sec or orange liqueur means Cointreau: Margaritas, Cosmos, Long Islands, Sidecars, Kamikazes." },
    { k: "grand marnier", measure: "As the spec in cocktails, 50 ml on the rocks", note: "Cognac-based orange liqueur. B-52, Cadillac Margarita, or neat after dinner." },
    { k: "kahlua", measure: "20 to 25 ml in cocktails, 50 ml on the rocks", pour: "Measure with the jigger; with milk, pour the Kahlúa over ice then the milk", note: "Coffee liqueur for Espresso Martinis and Russians." },
    { k: "baileys", measure: "50 ml on ice; as the spec in shots and coffees", pour: "Over cubed ice, or layered last over the back of a bar spoon in shots", note: "Cream liqueur: dairy, tell the guest. B-52, Baby Guinness, Mudslide." },
    { k: "disaronno", note: "Amaretto (almond). Amaretto Sour, Amaretto & Coke, Godfather. Nuts: tell the guest." },
    { k: "frangelico", note: "Hazelnut liqueur. Nuts: tell the guest." },
    { k: "archers", note: "Peach schnapps. Sex on the Beach, Woo Woo, Fuzzy Navel, Archers & Lemonade." },
    { k: "midori", note: "Melon liqueur. Midori Sour, Japanese Slipper, Melon Ball." },
    { k: "chambord", note: "Black raspberry liqueur. French Martini, Clover Club, Raspberry Kamikaze." },
    { k: "passoa", note: "Passion fruit liqueur. Pornstar Shot, Hurricane, Passion Bomb." },
    { k: "apple liqueur", name: "Apple liqueur (sour apple)", note: "Apple Martini, Sour Apple, Washington Apple." },
    { k: "malibu", note: "Coconut rum. Malibu & Pineapple, Bay Breeze style serves." },
    { k: "luxardo limoncello", glass: "Chilled shot glass, if served on its own", measure: "25 or 50 ml", pour: "Straight from the freezer", note: "Lemon liqueur. Limoncello Spritz, Lemon Drop." },
    { k: "heering cherry", note: "Cherry liqueur. Cherry Bomb, Blood & Sand." },
    { k: "jagermeister", glass: "Shot glass, ice cold", measure: "25 ml", pour: "Straight from the freezer or the tap. Jägerbomb: the shot dropped into half a can of Red Bull", note: "Herbal liqueur. Jägerbomb." },
    { k: "ancho reyes", note: "Chilli liqueur. The spicy Margaritas and Smoke & Fire." },
    { k: "yellow chartreuse", note: "Herbal, honeyed liqueur. Naked & Famous, Greenpoint." },
    { k: "galliano", note: "Vanilla and anise liqueur. Harvey Wallbanger (floated), Golden Dream, Yellow Bird, Galliano Hot Shot." },
    { k: "sambuca", glass: "Shot glass", measure: "25 ml", pour: "Straight, or layered over the back of a bar spoon. Never set it alight", note: "Anise liqueur. Slippery Nipple, Flatliner." },
    { k: "blue curacao", name: "Blue curaçao", note: "Blue orange liqueur. Blue Lagoon, Blue Hawaiian, AMF." },
    { k: "butterscotch schnapps", note: "Buttery Nipple, Oatmeal Cookie." },
    { k: "white creme de cacao", name: "White crème de cacao", note: "Chocolate liqueur. Rattlesnake." },
    { k: "green creme de menthe", name: "Crème de menthe (green and white)", note: "Mint liqueur. After Eight and Irish Flag (green), Stinger (white)." },
    { k: "advocaat", measure: "50 ml in a Snowball", pour: "Shake the bottle first; keep it in the fridge once open", note: "Egg liqueur. Snowball. Egg: tell the guest." },
    { k: "nv absinthe", name: "Absinthe", measure: "A rinse, or as the spec", pour: "Rinse: a few drops in the chilled glass, swirl to coat, tip the rest out", note: "Very strong (high ABV): never as a shot. Monkey Gland, Death in the Afternoon." },
  ]],
  ["Aperitifs, vermouth and wine", [
    { k: "aperol", glass: "Large wine glass, cubed ice", measure: "50 ml in a spritz", pour: "Spritz: ice, Prosecco, Aperol, a splash of soda, orange slice", note: "Aperol Spritz, Aperol Sour." },
    { k: "campari", glass: "Rocks or highball, cubed ice", measure: "25 ml in a Negroni, 50 ml with soda", note: "Negroni, Americano, Campari Soda, Garibaldi." },
    { k: "martini rosso", glass: "As the drink", measure: "25 ml in a Negroni or Manhattan", pour: "Measure with the jigger. Keep it in the fridge once open", note: "Sweet vermouth. Negroni, Manhattan, Americano, Boulevardier." },
    { k: "martini extra dry", glass: "As the drink", measure: "As the spec: from a rinse to 15 ml in a Martini", pour: "Measure with the jigger. Keep it in the fridge once open", note: "Dry vermouth. Dry Martini, Dirty Martini, Gibson, Perfect Manhattan." },
    { k: "pimm s no 1", glass: "Highball, cubed ice", measure: "50 ml, topped with lemonade", pour: "Ice, Pimm's, top with lemonade, then cucumber, mint, orange and strawberry", note: "Pimm's Cup." },
    { k: "red wine", glass: "As the drink", measure: "As the spec", pour: "From an open bottle; stopper it and date it", note: "New York Sour (floated)." },
    { k: "prosecco", glass: "Flute or wine glass, as the drink", measure: "Top up, or as the spec", pour: "Pour slowly down the side so it keeps its bubbles. Stopper the bottle and keep it in the fridge", note: "Spritzes, Bellini, Mimosa, French 75, Rossini." },
  ]],
  ["Foam", [
    { k: "egg white", glass: "As the drink", measure: "20 ml (about half an egg white) instead of 2 drops foamer", pour: "Dry shake hard without ice, then shake again with ice and double strain", note: "Egg is an allergen: tell the guest. Use pasteurised egg white." },
    { k: "aquafaba", glass: "As the drink", measure: "20 ml instead of 2 drops foamer", pour: "Dry shake hard without ice, then shake again with ice and double strain", note: "Chickpea water: the vegan foam." },
    { k: "foamer", glass: "As the drink", measure: "2 drops", pour: "Into the tin with everything else, dry shake, shake with ice, double strain", note: "The house foam in every egg-white style drink." },
  ]],
  ["Draught", [
    { k: "stella artois", name: "Stella Artois (draught)", glass: "Stella chalice, rinsed cold", note: "Belgian lager. Skim the head level with the skimmer and serve with the logo facing the guest." },
    { k: "budweiser", name: "Budweiser (draught)", note: "American lager." },
    { k: "san miguel", name: "San Miguel (draught)", note: "Spanish lager." },
    { k: "corona", name: "Corona (draught)", note: "Mexican lager. Lime wedge if the guest wants one." },
    { k: "camden hells", name: "Camden Hells", abv: "4.6%", note: "London lager: clean, crisp and dry." },
    { k: "camden off menu ipa", name: "Camden Off Menu IPA", abv: "5.8%", note: "West Coast style IPA: hoppy, clean and tropical." },
    { k: "camden eazy ipa", name: "Camden Eazy IPA", abv: "5.0%", note: "Hazy IPA: juicy stone fruit, easy drinking." },
    { k: "goose island midway", name: "Goose Island Midway", abv: "4.1%", note: "Session IPA: light and hoppy." },
    { k: "guinness", name: "Guinness", abv: "4.2%", glass: "Guinness pint glass, clean and dry", pour: "Two-part pour: glass at 45°, fill to three quarters, let it settle until it's dark, then top up to the brim with the glass upright", note: "Stout. Never top up straight away: the surge has to settle." },
    { k: "kopparberg crisp apple", name: "Kopparberg Crisp Apple (draught)", abv: "4.0%", pour: "Pour straight, no head needed. Over ice in a pint glass if the guest asks", note: "Apple cider with a touch of sweetness." },
  ]],
  ["Bottles and cans", [
    { k: "corona", name: "Corona (bottle)", glass: "In the bottle", measure: "One bottle", pour: "Ice cold, lime wedge pushed into the neck. A glass on the side if asked" },
    { k: "san miguel", name: "San Miguel (bottle)", glass: "In the bottle, glass on the side", measure: "One bottle", pour: "Ice cold, opened in front of the guest", note: "" },
    { k: "stella artois", name: "Stella Artois (bottle)", glass: "In the bottle, glass on the side", measure: "One bottle", pour: "Ice cold, opened in front of the guest", note: "" },
    { k: "corona cero", name: "Corona Cero (alcohol-free)", glass: "In the bottle", measure: "One bottle", pour: "Ice cold, lime wedge pushed into the neck. A glass on the side if asked", note: "Alcohol-free Corona. Say it's the 0.0 when it goes down." },
    { k: "san miguel 0 0", name: "San Miguel 0,0 (alcohol-free)", glass: "In the bottle, glass on the side", measure: "One bottle", pour: "Ice cold, opened in front of the guest", note: "Alcohol-free San Miguel. Say it's the 0,0 when it goes down." },
    { k: "athletic run wild ipa 0", name: "Athletic Run Wild IPA (alcohol-free)", glass: "Pint glass", measure: "One can", pour: "Pour at 45°, straighten as it fills", note: "Alcohol-free IPA. Say it's the alcohol-free one when it goes down." },
    { k: "kopparberg strawberry lime", name: "Kopparberg Strawberry & Lime", glass: "Pint glass full of ice", measure: "One bottle", pour: "Pour the bottle over plenty of ice", note: "Fruit cider." },
    { k: "kopparberg mixed fruit", name: "Kopparberg Mixed Fruit", glass: "Pint glass full of ice", measure: "One bottle", pour: "Pour the bottle over plenty of ice", note: "Fruit cider: blackcurrant and raspberry." },
    { k: "kopparberg mixed fruit 0", name: "Kopparberg Mixed Fruit (alcohol-free)", glass: "Pint glass full of ice", measure: "One bottle", pour: "Pour the bottle over plenty of ice", note: "The alcohol-free one. Check the label before it goes out." },
  ]],
  ["Juices, syrups and purées", [
    { k: "orange juice", glass: "Highball, cubed ice, if served on its own", measure: "Fill the glass on its own; as the spec in drinks", note: "Screwdriver, Tequila Sunrise, Mimosa and Buck's Fizz." },
    { k: "apple juice", glass: "Highball, cubed ice, if served on its own", measure: "Fill the glass on its own; as the spec in drinks", note: "Long with vodka, or the base of apple mocktails." },
    { k: "cranberry juice", glass: "Highball, cubed ice, if served on its own", measure: "Fill the glass on its own; as the spec in drinks", note: "Cosmos, Sea Breeze, Woo Woo and Vodka Cranberry." },
    { k: "pineapple juice", glass: "Highball, cubed ice, if served on its own", measure: "Fill the glass on its own; as the spec in drinks", note: "Piña Colada, Malibu & Pineapple, Bay Breeze, Mai Tai." },
    { k: "grapefruit juice", glass: "Highball, cubed ice, if served on its own", measure: "Fill the glass on its own; as the spec in drinks", note: "Paloma, Sea Breeze, Salty Dog." },
    { k: "tomato juice", glass: "Highball, cubed ice", measure: "As the spec", pour: "Roll it between tins rather than shaking, so it doesn't go frothy", note: "Bloody Mary and Virgin Mary." },
    { k: "strawberry syrup", name: "Monin Strawberry syrup", note: "Strawberry drinks, mojitos and lemonades." },
    { k: "monin vanilla", note: "Pornstars and vanilla sours." },
    { k: "monin salted caramel", note: "Salted caramel drinks and espresso martinis." },
    { k: "watermelon syrup", name: "Monin Watermelon syrup", note: "Watermelon Margarita and Watermelon Cooler." },
    { k: "monin elderflower", note: "Elderflower spritzes, Hugo and fizzes." },
    { k: "passion fruit syrup", name: "Monin Passion Fruit syrup", note: "Pornstars and passion fruit mojitos." },
    { k: "giffard orgeat", note: "Almond syrup for Mai Tais and tiki drinks. Nuts: tell the guest." },
    { k: "coco real", note: "Cream of coconut for the Piña Colada and Painkiller. Shake the bottle first: it settles." },
    { k: "funkin peach puree", name: "Funkin peach purée", note: "Bellinis and peach drinks." },
    { k: "strawberry puree", name: "Funkin strawberry purée", note: "Strawberry daiquiris and margaritas." },
    { k: "passion fruit puree", name: "Funkin passion fruit purée", note: "Pornstar Martini and passion fruit drinks." },
    { k: "mango puree", name: "Funkin mango purée", note: "Mango martinis and margaritas." },
    { k: "raspberry puree", name: "Funkin raspberry purée", note: "Raspberry mojitos and Clover Club style drinks." },
  ]],
  // Bartending 101 (Derek, 15 Nov 2026): the citrus, sugar, bitters and garnish behind most of the book.
  ["Bar basics", [
    { k: "lime juice", name: "Fresh lime juice", measure: "As the spec: 25 ml in most sours, 12.5 to 15 ml to balance", pour: "Squeezed fresh, never from a bottle. One lime gives about 25 ml", note: "In nearly a third of the book. Squeeze before service, keep it covered in the fridge, date it and use it the same day." },
    { k: "lemon juice", name: "Fresh lemon juice", measure: "As the spec: 25 ml in most sours", pour: "Squeezed fresh, never from a bottle. One lemon gives about 35 ml", note: "Whiskey Sour, Amaretto Sour, Tom Collins, French 75. Same day, covered, in the fridge." },
    { k: "sugar syrup", measure: "As the spec: usually 12.5 to 25 ml", pour: "Measure it with the jigger: a free pour makes the drink too sweet", note: "1:1 sugar and water (gomme). The sweet side of every sour, Mojito and Daiquiri. Label and date it." },
    { k: "agave syrup", measure: "As the spec: usually 12.5 to 15 ml", pour: "Sweeter than sugar syrup: never swap it in 1 for 1", note: "Tommy's Margarita, Paloma, the spicy Margaritas." },
    { k: "honey syrup 2 1", name: "Honey syrup", measure: "As the spec", pour: "2 parts honey to 1 part warm water, stirred until it runs", note: "Gold Rush, Bee's Knees, Penicillin." },
    { k: "grenadine", measure: "As the spec: usually 10 to 15 ml", pour: "Pour it last, down the side or over a bar spoon, so it sinks for the sunrise", note: "Tequila Sunrise, Shirley Temple, Roy Rogers, Jack Rose." },
    { k: "lime cordial", measure: "A dash to 25 ml, as the spec", pour: "Dash into the glass before the soda or lemonade", note: "Lime & Soda, Lemon, Lime & Bitters, and a lager top up if asked." },
    { k: "angostura", name: "Angostura bitters", measure: "Dashes: 1 dash is one sharp flick of the bottle upside down", pour: "Straight into the glass or tin. Keep the cap on: it stains", note: "Old Fashioned, Manhattan, Champagne Cocktail, LLB." },
    { k: "orange bitters", measure: "Dashes, as the spec", pour: "One sharp flick per dash", note: "Martinis and stirred drinks." },
    { k: "double cream", measure: "As the spec", pour: "For Irish Coffee, shake it in a tin without ice until it just thickens, then float it over a spoon", note: "White Russian, Irish Coffee, Ramos Gin Fizz. Dairy: tell the guest. Fridge, by its date." },
    { k: "fresh espresso", name: "Espresso (coffee machine)", measure: "One shot, about 25 to 35 ml", pour: "Pull it just before you shake: fresh espresso makes the foam on top", note: "Espresso Martinis and coffee shots." },
    { k: "tabasco", measure: "Drops or dashes, as the spec", note: "Bloody Mary, Michelada, Flatliner." },
    { k: "worcestershire sauce", measure: "Dashes, as the spec", note: "Bloody Mary, Virgin Mary, Michelada. Contains fish (anchovy): tell the guest." },
    { k: "celery salt and black pepper", measure: "A pinch of each", note: "Bloody Mary and Virgin Mary, and the rim." },
    { k: "salt", name: "Salt (rims)", measure: "Half the rim", pour: "Run a lime wedge round the outside of half the rim, roll it in the salt, tap off the loose bits", note: "Margaritas, Salty Dog, tequila shots. Ask the guest: salt or no salt." },
  ]],
  ["Fresh and garnish", [
    { k: "limes", glass: "Garnish tray, covered, in the fridge", measure: "6 to 8 wedges a lime", pour: "Cut fresh each shift: top and tail, halve lengthways, then wedges", note: "On G&Ts, Coke serves, Mojitos and Margaritas." },
    { k: "lemons", glass: "Garnish tray, covered, in the fridge", measure: "6 to 8 wedges or wheels a lemon", pour: "Cut fresh each shift", note: "Coke and Jack & Coke, Tom Collins, sours." },
    { k: "oranges", glass: "Garnish tray, covered, in the fridge", measure: "Slices and twists", pour: "Twist: peel a strip with a peeler, squeeze it over the drink skin side down, then drop it in", note: "Negroni, Old Fashioned, Aperol Spritz, Tequila Sunrise." },
    { k: "mint", glass: "Stems in a glass of water", measure: "A sprig or 8 to 10 leaves, as the spec", pour: "Clap the sprig between your hands to wake it. Press it gently: hard muddling makes it bitter", note: "Mojitos, Southside, Pimm's, Mint Julep." },
    { k: "cucumber", glass: "Garnish tray, covered, in the fridge", measure: "Slices or ribbons", note: "Pimm's, Eastside Gimlet, and gin serves that ask for it." },
    { k: "strawberries", glass: "Garnish tray, covered, in the fridge", measure: "Halves or slices", note: "Pimm's, Strawberry Daiquiri and the strawberry drinks." },
    { k: "cocktail cherries", glass: "In their syrup, lid on", measure: "One on a pick", pour: "Lift it out with the pick, never fingers", note: "Manhattan, Whiskey Sour, Amaretto Sour, Shirley Temple." },
    { k: "olive brine", name: "Olives and brine", glass: "In the jar, lid on, in the fridge", measure: "Brine as the spec; one to three olives on a pick", note: "Dirty and Filthy Martini, Gibson style serves." },
  ]],
  // The gun (postmix), 9 Nov 2026. A Fanta Fruit Twist Zero may be on it too: unconfirmed, so left off.
  ["Postmix (gun)", [
    { k: "coca cola", name: "Coke (gun)", glass: "Highball, cubed ice, lemon wedge", measure: "Fill the glass" },
    { k: "diet coke", name: "Diet Coke (gun)", glass: "Highball, cubed ice, lemon wedge", measure: "Fill the glass" },
    { k: "coke zero", name: "Coke Zero (gun)", glass: "Highball, cubed ice, lemon wedge", measure: "Fill the glass" },
    { k: "sprite", name: "Sprite (gun)", measure: "Fill the glass" },
    { k: "fanta orange zero", name: "Fanta Zero (gun)", measure: "Fill the glass", note: "Orange, no sugar." },
    { k: "lemonade", name: "Lemonade (gun)", note: "For vodka lemonades, top-ups and shandies." },
    { k: "soda water", name: "Soda water (gun)", note: "Spritzes, highballs and Lime & Soda." },
    { k: "fever tree indian tonic", name: "Tonic (gun)", note: "The gun tonic. Fever-Tree bottles are for the perfect serves or when asked." },
    { k: "fever tree ginger ale", name: "Ginger ale (gun)", note: "Softer and sweeter: whiskey and ginger." },
    { k: "fever tree ginger beer", name: "Ginger beer (gun)", note: "Spicier: mules and spiced rum and ginger." },
  ]],
  ["Bottled softs and mixers", [
    { k: "coca cola", name: "Coca-Cola (bottle)", glass: "Highball, cubed ice, lemon wedge", note: "Leave the bottle with the guest if there's some left." },
    { k: "diet coke", name: "Diet Coke (bottle)", glass: "Highball, cubed ice, lemon wedge", note: "" },
    { k: "coke zero", name: "Coke Zero (bottle)", glass: "Highball, cubed ice, lemon wedge", note: "Zero sugar." },
    { k: "red bull", name: "Red Bull (can)", glass: "Highball, cubed ice", measure: "250 ml can", pour: "Serve the can with the glass of ice", note: "Half a can for each bomb." },
    { k: "red bull sugarfree", name: "Red Bull Sugarfree (can)", glass: "Highball, cubed ice", measure: "250 ml can", pour: "Serve the can with the glass of ice", note: "No sugar. Check the can before it goes out." },
    { k: "jarritos guava", name: "Jarritos Guava", glass: "Highball, cubed ice, lime wedge", measure: "One 370 ml bottle", pour: "Ice cold from the soft drinks and wine fridge. Open it at the table and pour some over ice, bottle left with the guest", note: "Mexican soda: sweet and tropical." },
    { k: "jarritos mandarin", name: "Jarritos Mandarin", glass: "Highball, cubed ice, lime wedge", measure: "One 370 ml bottle", pour: "Ice cold from the soft drinks and wine fridge. Open it at the table and pour some over ice, bottle left with the guest", note: "Mexican soda: sweet orange." },
    { k: "jarritos pineapple", name: "Jarritos Pineapple", glass: "Highball, cubed ice, lime wedge", measure: "One 370 ml bottle", pour: "Ice cold from the soft drinks and wine fridge. Open it at the table and pour some over ice, bottle left with the guest", note: "Mexican soda: sweet pineapple." },
    { k: "jarritos grapefruit", name: "Jarritos Grapefruit", glass: "Highball, cubed ice, lime wedge", measure: "One 370 ml bottle", pour: "Ice cold from the soft drinks and wine fridge. Open it at the table and pour some over ice, bottle left with the guest", note: "Mexican soda: sharp and bittersweet. The soda Mexico uses in a Paloma." },
    { k: "jarritos strawberry", name: "Jarritos Strawberry", glass: "Highball, cubed ice, lime wedge", measure: "One 370 ml bottle", pour: "Ice cold from the soft drinks and wine fridge. Open it at the table and pour some over ice, bottle left with the guest", note: "Mexican soda: sweet strawberry." },
    { k: "jarritos lime", name: "Jarritos Lime", glass: "Highball, cubed ice, lime wedge", measure: "One 370 ml bottle", pour: "Ice cold from the soft drinks and wine fridge. Open it at the table and pour some over ice, bottle left with the guest", note: "Mexican soda: zesty lime." },
    { k: "fever tree indian tonic", glass: "Highball or wine glass, as the serve", measure: "Top up, or the whole bottle on the side", note: "The tonic for the G&T." },
    { k: "fever tree light tonic", glass: "Highball or wine glass, as the serve", measure: "Top up, or the whole bottle on the side", note: "Fewer calories than Indian tonic." },
    { k: "fever tree ginger ale", measure: "Top up, or the whole bottle on the side", note: "Softer and sweeter than ginger beer: whiskey and ginger." },
    { k: "fever tree ginger beer", measure: "Top up, or the whole bottle on the side", note: "Spicier: Moscow Mule and spiced rum and ginger." },
  ]],
];
const BT_GUN = { glass: "Highball, cubed ice", measure: "Top up", pour: "Ice first. Hold the gun just above the glass, not in the ice, and pour down the side" };
const BT_MIX = { glass: "As the drink", measure: "As the spec, measured with the jigger", pour: "Shake purées before use. Opened cartons and purées go back in the fridge, used by the date on the label" };
const BT_LIQ = { glass: "Rocks, cubed ice, if served on its own", measure: "25 ml single, 50 ml double; as the spec in cocktails", pour: "Measure with the jigger. As a shot: chilled, straight into the shot glass" };
const BT_BASIC = { glass: "As the drink" };
const BT_DEF = { Spirits: BT_SPIRIT, Liqueurs: BT_LIQ, "Aperitifs, vermouth and wine": BT_LIQ, "Bar basics": BT_BASIC, "Fresh and garnish": BT_BASIC, Foam: {}, Draught: BT_DRAUGHT, "Bottles and cans": {}, "Juices, syrups and purées": BT_MIX, "Postmix (gun)": BT_GUN, "Bottled softs and mixers": BT_SOFT };
const BT = BT_LINEUP.flatMap(([grp, list]) => list.map((x) => {
  const it = MK.byKey.get(x.k); if (!it) throw new Error("Line-up item not in the maker list: " + x.k);
  return { ...BT_DEF[grp], ...x, grp, name: x.name || it.n };
}));
const BT_KEYS = [...new Set(BT.map((x) => x.k))];
function btClassics(kind) {
  // The line-up now carries the bar basics too (citrus, sugar, bitters, garnish), so it's the whole bar. Water is a given.
  const held = [...BT_KEYS, "water"].map((k) => ({ k }));
  const anchor = new Set(BT_KEYS);
  const res = D.filter((d) => mkKindOk(d, kind) && !isOut(d.name)).map((d) => mkScore(d, held, anchor)).filter((r) => r.used > 0);
  // Exact bottles only: a swap (Smirnoff for Grey Goose) counts as one thing to add, so "Ready" means it's on the rail.
  const by = (a, b) => (b.d.official ? 1 : 0) - (a.d.official ? 1 : 0) || a.miss.length - b.miss.length || a.swaps.length - b.swaps.length || a.d.name.localeCompare(b.d.name);
  const house = res.filter((r) => r.d.official);
  const rest = res.filter((r) => !r.d.official);
  const ready = rest.filter((r) => !r.miss.length && !r.swaps.length).sort(by);
  const swap = rest.filter((r) => !r.miss.length && r.swaps.length).sort(by);
  const one = rest.filter((r) => r.miss.length === 1).sort(by);
  return { house, ready, swap, one };
}
// How many drinks in the book use a line-up item (its exact bottle or the same kind).
const btUses = (k) => D.filter((d) => MK.reqs.get(d.id).some((r) => mkCover(r, k) >= 0.9)).length;

/* ---------- Send: several specs, or the line-up serves, as one tidy WhatsApp message ----------
   Each drink is its own tick box on the Send page, so the person picks which go. The first dozen are ticked. */
const SPEC_MAX = 40, SPEC_ON = 12;
const specPart = (d, i) => ({ id: "d" + d.id, label: d.name, one: true, off: i >= SPEC_ON,
  lines: [...plOutLines(d), ...d.spec.map((l) => `• ${l}`), [d.glass, d.ice, d.garnish && `Garnish: ${d.garnish}`].filter((x) => x && !/^(Garnish: )?None\b/i.test(x)).join(" · "), `How: ${d.method}`,
    ...(d.subs?.length ? ["Out of something?", ...d.subs.map((x) => `\u21aa ${x}`)] : [])] });
SHARE.specs = (o) => {
  const ids = String(o || "").split(",").filter(Boolean).map(Number).filter((i) => D[i]).slice(0, SPEC_MAX);
  if (!ids.length) return null;
  const ds = ids.map((i) => D[i]);
  return { what: `${ds.length} ${ds.length === 1 ? "spec" : "specs"}`, title: "Drink specs · Black Tap Soho", asOf: "Specs as of",
    head: [`${ds.length} ${ds.length === 1 ? "drink" : "drinks"}. Jigger everything: 25 ml single, 50 ml double.`],
    parts: ds.map(specPart), tip: `Tick the drinks to send. The first ${SPEC_ON} are ticked; a long message may be cut short by WhatsApp.` };
};
SHARE.lineup = (grp) => {
  const xs = BT.filter((x) => x.grp === grp); if (!xs.length) return null;
  return { what: `Line-up: ${grp}`, title: `Black Tap line-up · ${grp}`, head: [`${xs.length} serves`],
    parts: xs.map((x, i) => ({ id: "s" + i, label: x.name + (x.abv ? ` (${x.abv})` : ""), one: true,
      lines: [...(x.note ? [x.note] : []), ...[["Glass", x.glass], ["Measure", x.measure], ["Pour", x.pour]].filter(([, v]) => v && v !== "As the drink").map(([t, v]) => `• ${t}: ${v}`)] })) };
};

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
.mk-cats{padding-block:8px 0}.mk-shelf{padding-block:6px 4px}.mk-shelf .chip,.mk-goes .chip{color:var(--fg)}.mk-goes .chip small{color:var(--muted);margin-left:4px}
.mk-hl b{color:var(--brass);font-weight:700}
.mk-own{margin:12px 0;padding:14px;border:1px solid var(--brass);border-radius:14px;background:var(--surface)}.mk-own ul{margin:6px 0 0;padding-left:18px}.mk-own li{padding:2px 0}.mk-own .m{margin:8px 0 0;font-size:14.5px}
.bt-card{padding:12px 0;border-bottom:1px solid var(--line)}
.bt-card .n{font-weight:700;font-size:17px;display:flex;justify-content:space-between;gap:8px}
.bt-card .abv{color:var(--brass);font-size:13px;white-space:nowrap}
.bt-note{margin:4px 0 0;font-size:14.5px;color:var(--muted)}
.bt-dl{display:grid;gap:4px;margin:8px 0;font-size:14.5px}.bt-dl div{display:grid;grid-template-columns:72px 1fr;gap:8px}.bt-dl dt{color:var(--muted)}.bt-dl dd{margin:0}
.bt-card .chip small{color:var(--muted);margin-left:4px}
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
  const qw = t.split(" "), ts = t.replace(/ /g, "");
  return MK.items.map((it) => {
    let s = 0;
    for (const a of it.al) {
      if (a === t) s = Math.max(s, 5);
      // With the spaces typed differently: "redbull", "gingerbeer", "corona0".
      else if (ts.length >= 4 && a.replace(/ /g, "").startsWith(ts)) s = Math.max(s, ts.length === a.replace(/ /g, "").length ? 5 : 3.5);
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
/* ---------- Make: follow an order, one ingredient at a time ----------
   Tap (or type) an ingredient and every drink with it lists straight away. Each tap narrows the list to drinks with all of
   them, and "Goes with" offers the next ingredient from what those drinks use. When nothing in the book has them all,
   it shows the closest and a drink of your own built from the house ratios. */
const MK_SHORT = { "Beer and cider": "Beer", "Rum and cachaça": "Rum", "Tequila and mezcal": "Tequila", "Whisky and whiskey": "Whisky", "Aperitifs, vermouth and wine": "Aperitifs & wine",
  "Creams, milk and foam": "Cream & milk", "Syrups and sauces": "Syrups", "Juices and purées": "Juices", "Mixers and fizz": "Mixers", "Fresh and garnish": "Fresh", "Bitters and seasoning": "Bitters" };
const mkCatName = (c) => MK_SHORT[c] || c;
// The chip to show for an ingredient: the generic of its kind when there is one (Smirnoff shows as Vodka).
const mkGen = (it) => MK.items.find((x) => x.gen && x.kind === it.kind) || it;
// The book's most used ingredients, for the shelf before anything's picked.
const MK_POP = (() => {
  const n = new Map();
  for (const r of MK.reqs.values()) for (const x of new Set(r.filter((q) => q.w >= 1).map((q) => mkGen(q.it)))) n.set(x, (n.get(x) || 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1]).slice(0, 24).map(([it]) => it);
})();
// Drinks with every pick in them. cover: how closely (1 the same, 0.7 a flavoured cousin, like Cîroc Apple for Vodka).
function mkOrder() {
  const picks = mk.pick;
  const rows = D.filter((d) => mkKindOk(d, mk.opt.kind)).map((d) => {
    const reqs = MK.reqs.get(d.id), hit = new Set(), short = [], lack = [];
    let has = 0, cover = 0;
    for (const p of picks) {
      let best = 0, at = null;
      for (const r of reqs) { const c = mkCover(r, p.k); if (c > best) { best = c; at = r; } }
      if (best >= 0.7) { has++; cover += best; hit.add(at); if (p.ml && at.ml && at.ml > p.ml) short.push(`${at.ml} ml ${at.it.n} (you have ${p.ml})`); } else lack.push(mkName(p.k));
    }
    return { d, has, cover: has ? cover / has : 0, hit, short, lack, size: reqs.filter((r) => r.w >= 1).length };
  });
  const by = (a, b) => b.cover - a.cover || a.short.length - b.short.length || a.size - b.size || (b.d.official ? 1 : 0) - (a.d.official ? 1 : 0);
  const all = rows.filter((r) => r.has === picks.length).sort(by);
  const near = all.length ? [] : rows.filter((r) => r.has && r.has === Math.max(...rows.map((x) => x.has))).sort(by);
  // What the drinks on screen use most, apart from what's already picked.
  const goes = new Map();
  for (const r of all) for (const it of new Set(MK.reqs.get(r.d.id).filter((q) => q.w >= 1 && !r.hit.has(q)).map((q) => mkGen(q.it)))) {
    if (!picks.some((p) => mkCover({ it, name: it.n }, p.k) >= 0.9)) goes.set(it, (goes.get(it) || 0) + 1);
  }
  return { all, near, goes: [...goes].sort((a, b) => b[1] - a[1]).slice(0, 12) };
}
// A drink of your own from the picks, on the house ratios. Spirits and liqueurs at 25/50 ml, citrus 25, syrup 20.
const MK_BASE = new Set(["Vodka", "Gin", "Rum and cachaça", "Tequila and mezcal", "Whisky and whiskey", "Brandy"]);
function mkOwn() {
  const its = mk.pick.map((p) => ({ p, it: mkLike(p.k) })).filter((x) => x.it);
  if (!its.length) return "";
  const of = (f) => its.filter(({ it }) => f(it));
  const base = of((it) => MK_BASE.has(it.cat)), mod = of((it) => /Liqueurs|Aperitifs/.test(it.cat) && it.kind !== "Sparkling wine"), fizzWine = of((it) => it.kind === "Sparkling wine");
  const citrus = of((it) => /Lime juice|Lemon juice/.test(it.kind)), juice = of((it) => it.cat === "Juices and purées" && !/Lime juice|Lemon juice/.test(it.kind));
  const syrup = of((it) => it.cat === "Syrups and sauces"), cream = of((it) => it.cat === "Creams, milk and foam"), mixer = of((it) => it.cat === "Mixers and fizz" || it.cat === "Beer and cider");
  const fresh = of((it) => it.cat === "Fresh and garnish"), bitters = of((it) => it.cat === "Bitters and seasoning"), coffee = of((it) => it.cat === "Coffee");
  const nm = (x) => mkName(x.p.k), ml = (x, n) => x.p.ml || n;
  const lines = [], add = (n, x) => lines.push(`${ml(x, n)} ml ${nm(x)}`);
  let style, glassTxt, how;
  const spirits = [...base, ...mod];
  // Split 50 ml of spirit across what's picked: one is 50, two are 35 + 15 (or 25 + 25 for two bases), three are 25 + 15 + 10.
  const share = (a) => (a.length === 1 ? [50] : a.length === 2 ? (base.length === 2 ? [25, 25] : [35, 15]) : [25, 15, 10, 10, 10].slice(0, a.length));
  if (fizzWine.length && mod.length && !base.length) {
    style = "spritz"; glassTxt = "Large wine glass, cubed ice"; how = "Build over ice: Prosecco, then the rest, top soda, gentle lift";
    fizzWine.forEach((x) => add(75, x)); mod.forEach((x) => add(mod.length > 1 ? 25 : 50, x)); juice.forEach((x) => add(25, x)); syrup.forEach((x) => add(10, x)); lines.push("Top 25 ml soda");
  } else if (!spirits.length) {
    style = "mocktail"; glassTxt = "Highball, cubed ice"; how = mixer.length ? "Shake everything but the fizz, strain over ice, top up" : "Shake hard, strain over ice";
    fresh.forEach((x) => lines.push(`A few ${nm(x).toLowerCase()}, pressed`)); juice.forEach((x) => add(juice.length > 1 ? 50 : 100, x)); citrus.forEach((x) => add(15, x));
    if (!citrus.length && juice.length) add(15, { p: { k: "lemon juice" } });
    (syrup.length ? syrup : [{ p: { k: "sugar syrup" } }]).forEach((x) => add(syrup.length > 1 ? 10 : 20, x)); coffee.forEach((x) => add(35, x)); cream.forEach((x) => add(25, x)); mixer.forEach((x) => lines.push(`Top ${nm(x)}`));
  } else if (cream.length || coffee.length) {
    style = coffee.length ? "coffee shake" : "creamy shake"; glassTxt = "Chilled coupe, no ice"; how = "Shake very hard, double strain";
    const s = share(spirits); spirits.forEach((x, i) => add(s[i] === 50 ? 35 : s[i], x)); coffee.forEach((x) => add(25, x)); cream.forEach((x) => add(25, x)); (syrup.length || mod.length ? syrup : [{ p: { k: "sugar syrup" } }]).forEach((x) => add(syrup.length ? 10 : 15, x)); juice.forEach((x) => add(15, x));
  } else if (mixer.length) {
    style = "highball"; glassTxt = "Highball, cubed ice"; how = "Build over ice, top up, quick stir";
    fresh.forEach((x) => lines.push(`A few ${nm(x).toLowerCase()}, pressed`)); share(spirits).forEach((n, i) => add(n, spirits[i])); juice.forEach((x) => add(25, x)); citrus.forEach((x) => add(15, x)); syrup.forEach((x) => add(10, x));
    mixer.forEach((x) => lines.push(`Top ${nm(x)}`)); bitters.forEach((x) => lines.push(`2 dashes ${nm(x)}`));
  } else if (citrus.length || juice.length) {
    style = "sour"; glassTxt = "Rocks, cubed ice"; how = fresh.length ? "Press the fresh bits in the tin, add the rest, shake, double strain over ice" : "Shake hard, strain over fresh ice";
    fresh.forEach((x) => lines.push(`A few ${nm(x).toLowerCase()}`)); share(spirits).forEach((n, i) => add(n, spirits[i])); juice.forEach((x) => add(juice.length > 1 ? 25 : 50, x));
    (citrus.length ? citrus : [{ p: { k: "lime juice" } }]).forEach((x) => add(citrus.length > 1 ? 15 : 25, x)); (syrup.length ? syrup : [{ p: { k: "sugar syrup" } }]).forEach((x) => add(syrup.length > 1 ? 10 : 20, x));
    bitters.forEach((x) => lines.push(`2 dashes ${nm(x)}`));
  } else {
    style = "stirred short"; glassTxt = "Rocks, one large cube"; how = "Stir with ice for 30 seconds, strain over a large cube";
    const s = spirits.length === 1 ? [50] : share(spirits); spirits.forEach((x, i) => add(s[i], x)); syrup.forEach((x) => add(7.5, x));
    (bitters.length ? bitters : [{ p: { k: "angostura" } }]).forEach((x) => lines.push(`2 dashes ${nm(x)}`)); fresh.forEach((x) => lines.push(`Garnish: ${nm(x).toLowerCase()}`));
  }
  return `<div class="mk-own"><div class="mini" style="margin-top:0">Make your own · a ${style}</div><ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
    <p class="m"><b>${esc(glassTxt)}</b> · ${esc(how)}</p><p class="note" style="margin:6px 0 0">House ratios, not a book spec. Taste it and adjust before it goes out.</p></div>`;
}
function mkOrderRow(r) {
  const d = r.d;
  const spec = d.spec.map((s) => (MK.reqs.get(d.id).some((q) => q.line === s && r.hit.has(q)) ? `<b>${esc(s)}</b>` : esc(s))).join(" · ");
  const tag = r.lack.length ? `<span class="pc" style="color:var(--warn)">No ${esc(r.lack.join(", ").toLowerCase())}</span>` : r.short.length ? `<span class="pc" style="color:var(--warn)">Short</span>` : r.cover < 1 ? `<span class="pc" style="color:var(--ok)">Close swap</span>` : "";
  return `<button class="mk-res" data-mk-open="${d.id}"><span class="g" aria-hidden="true">${glass(d)}</span><div><div class="n">${esc(d.name)}${tag}</div>
    <div class="ln">${esc(d.glass)} · ${esc(d.method)}</div>${r.short.length ? `<div class="ln miss">Needs ${esc(r.short.join("; "))}</div>` : ""}<div class="spec mk-hl">${spec}</div></div></button>`;
}
function mkShelf(on) {
  const cats = MK_CATS.map(([c]) => c);
  const its = mk.cat === "bt" ? BT_KEYS.map((k) => MK.byKey.get(k)) : mk.cat ? MK.items.filter((i) => i.cat === mk.cat) : MK_POP;
  return `<div class="chips hrow mk-cats" role="toolbar" aria-label="Ingredient groups"><button class="chip" aria-pressed="${mk.cat === "bt"}" data-mk-cat="bt">Black Tap</button><button class="chip" aria-pressed="${!mk.cat}" data-mk-cat="">Popular</button>${cats.map((c) => `<button class="chip" aria-pressed="${mk.cat === c}" data-mk-cat="${esc(c)}">${esc(mkCatName(c))}</button>`).join("")}</div>
    <div class="chips hrow mk-shelf" role="toolbar" aria-label="Ingredients">${its.map((i) => mkChip(i, on.has(i.k), "mk-pick")).join("")}</div>`;
}
function mkMakePane() {
  const on = new Set(mk.pick.map((p) => p.k));
  const ed = mk.edit && mk.pick.find((p) => p.k === mk.edit);
  const picks = mk.pick.length ? `<div class="mk-picks"><span class="mini" style="margin:0;align-self:center">Order:</span>${mk.pick.map((p) => `<span class="mk-pk"><button data-mk-ml="${esc(p.k)}" aria-label="Set ml for ${esc(mkName(p.k))}">${p.ml ? `<span class="ml">${p.ml} ml</span>` : ""}${esc(mkName(p.k))}${p.k.startsWith("~") ? " ✎" : ""}</button><button class="x" data-mk-rm="${esc(p.k)}" aria-label="Remove ${esc(mkName(p.k))}">×</button></span>`).join("")}<button class="chip" data-mk="clear">\u21ba Clear</button></div>
    ${ed ? `<div class="mk-mls"><div class="mini">How much ${esc(mkName(ed.k))}?</div>${[null, 10, 12.5, 15, 20, 25, 35, 50, 75, 100].map((n) => `<button class="chip" aria-pressed="${(ed.ml || null) === n}" data-mk-setml="${n ?? ""}">${n ? n + " ml" : "Any amount"}</button>`).join("")}</div>` : ""}` : "";
  const kinds = `<div class="chips hrow" role="toolbar" aria-label="Show">${MK_KINDS.map(([k, l]) => `<button class="chip" aria-pressed="${mk.opt.kind === k}" data-mk-kind="${k}">${l}</button>`).join("")}</div>`;
  let out;
  if (mk.pick.length) {
    const { all, near, goes } = mkOrder();
    const list = all.length ? all : near;
    MK.ids = list.map((r) => r.d.id);
    const what = mk.pick.map((p) => mkName(p.k)).join(" + ");
    out = (goes.length ? `<div class="mini">Goes with</div><div class="chips hrow mk-goes">${goes.map(([it, n]) => `<button class="chip" data-mk-pick="${esc(it.k)}">+ ${esc(it.n)} <small>${n}</small></button>`).join("")}</div>` : "")
      + (all.length ? `<div class="sec">${all.length} ${all.length === 1 ? "drink" : "drinks"} with ${esc(what)}</div>${all.slice(0, 60).map(mkOrderRow).join("")}${all.length > 60 ? `<p class="note">Add another ingredient to see the rest.</p>` : ""}${all.length <= 3 ? mkOwn() : ""}`
        : `<p class="empty" style="padding:14px 0 4px">No drink in the book has all of ${esc(what)}.</p>${mkOwn()}${near.length ? `<div class="sec">Closest in the book<span class="cnt">${near.length}</span></div>${near.slice(0, 30).map(mkOrderRow).join("")}` : ""}`)
      + (all.length > 3 ? `<details class="mk-cat"><summary>Make your own with these<span>House ratios</span></summary>${mkOwn()}</details>` : "")
      + (list.length ? `<div class="actions">${sendBtn("specs", "Send these specs", MK.ids.slice(0, SPEC_MAX).join(","))}</div>` : "")
      + `<div class="mk-row2"><button class="btn" data-mk="keep">☆ Keep in My bar</button><button class="btn" data-mk="clear">Clear and start again</button></div>`;
  } else if (mk.fromBar && mk.bar.length) {
    const res = mkMatches();
    MK.ids = res.map((r) => r.d.id);
    const ready = res.filter((r) => !r.miss.length), one = res.filter((r) => r.miss.length === 1), more = res.filter((r) => r.miss.length > 1).slice(0, 20);
    const block = (t, a) => a.length ? `<div class="sec">${t}<span class="cnt">${a.length}</span></div>${a.slice(0, 40).map(mkResHtml).join("")}` : "";
    out = `<div class="mk-opts"><span class="mini" style="margin:0;align-self:center">From My bar (${mk.bar.length})</span><button class="chip" aria-pressed="${mk.opt.basics}" data-mk-opt="basics">+ bar basics</button><button class="chip" data-mk="unbar">Close</button></div>`
      + (res.length ? mkNextHtml(one) + block("Make it now", ready) + block("Missing one thing", one) + block("Missing two or more", more) : `<p class="empty">Nothing in the book fits My bar yet.</p>`);
  } else {
    MK.ids = [];
    out = `<p class="empty" style="padding:18px 0">Tap what the guest wants, like vodka, apple juice or vanilla syrup.<br>The drinks with it list here, and each tap narrows them down.</p>
      <div class="mk-row2"><button class="btn pri" data-mk-pane="bt">Black Tap classics</button><button class="btn" data-mk-pane="mine">My drinks${mineAll().length ? ` (${mineAll().length})` : ""}</button></div>
      ${mk.bar.length ? `<button class="btn wide" style="margin-top:8px" data-mk="frombar">What can I make from My bar?</button>` : ""}`;
  }
  return `${mkTypeBox("make", "Type anything: vodka, 50ml lime…")}${mkShelf(on)}${picks}${kinds}<div id="mk-out">${out}</div>`;
}
// The bottles that would open up the most drinks: each "missing one thing" counts for the thing it's missing.
function mkNextHtml(one) {
  const n = new Map();
  for (const r of one) { const it = MK.items.find((i) => i.n === r.miss[0]); if (it) n.set(it, (n.get(it) || 0) + 1); }
  const top = [...n].sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (!top.length) return "";
  return `<div class="mini">Best next bottles</div><div class="chips hrow mk-next">${top.map(([it, c]) => `<button class="chip" data-mk-add="${esc(it.k)}" data-mk-to="bar">+ ${esc(it.n)} <small>${c} more</small></button>`).join("")}</div>`;
}
/* ---------- Line-up pane: Black Tap classics and the house serves ---------- */
const BT_VIEWS = [["classics", "Black Tap classics"], ...BT_LINEUP.map(([g]) => [g, g])];
function btServeHtml(x) {
  const n = btUses(x.k);
  return `<div class="bt-card"><div class="n"><span translate="no">${esc(x.name)}</span>${x.abv ? `<span class="abv" translate="no">${esc(x.abv)}</span>` : ""}</div>
    ${x.note ? `<p class="bt-note" translate="no">${esc(x.note)}</p>` : ""}
    <dl class="bt-dl">${[["Glass", x.glass], ["Measure", x.measure], ["Pour", x.pour]].filter(([, v]) => v && v !== "As the drink").map(([t, v]) => `<div><dt>${t}</dt><dd translate="no">${esc(v)}</dd></div>`).join("")}</dl>
    <div class="chips">${n ? `<button class="chip" data-bt-use="${esc(x.k)}">Drinks with it <small>${n}</small></button>` : ""}<button class="chip" data-fx-open="${esc(x.name)}">${factOf(x.name) ? "Allergens, size, once opened" : "Product facts"}</button></div></div>`;
}
function btPane() {
  const v = mk.bt.view;
  const chips = `<div class="chips hrow" role="toolbar" aria-label="Line-up">${BT_VIEWS.map(([k, l]) => `<button class="chip" aria-pressed="${v === k}" data-bt-view="${esc(k)}">${esc(l)}</button>`).join("")}</div>`;
  let out;
  if (v === "classics") {
    const { house, ready, swap, one } = btClassics(mk.bt.kind);
    MK.ids = [...house, ...ready, ...swap, ...one].map((r) => r.d.id);
    const block = (t, a, max = 80) => a.length ? `<div class="sec">${t}<span class="cnt">${a.length}</span></div>${a.slice(0, max).map(mkResHtml).join("")}` : "";
    out = `<div class="chips hrow" role="toolbar" aria-label="Show">${MK_KINDS.map(([k, l]) => `<button class="chip" aria-pressed="${mk.bt.kind === k}" data-bt-kind="${k}">${l}</button>`).join("")}</div>
      <p class="note">Ready: every bottle is in the line-up.</p>
      ${block("House cocktails", house)}${block("Ready with the line-up", ready)}${block("Ready with a swap", swap, 40)}${block("Add one thing", one, 40)}
      ${ready.length ? `<div class="actions">${sendBtn("specs", "Send these specs", MK.ids.slice(0, SPEC_MAX).join(","))}</div>` : ""}`;
  } else {
    MK.ids = [];
    out = BT.filter((x) => x.grp === v).map(btServeHtml).join("") + `<div class="actions">${sendBtn("lineup", "Send these serves", v)}</div>`;
  }
  return `${chips}<div id="bt-out">${out}</div>
    <button class="btn wide" style="margin-top:12px" data-mk="btbar">Put the whole line-up in My bar</button>`;
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
    <div class="mk-row2"><button class="btn" data-mk="btbar">Load the Black Tap line-up</button><button class="btn" data-mk="bt">Load the whole back bar</button></div>
    <button class="btn wide" style="margin-top:8px" data-mk="frombar"${mk.bar.length ? "" : " disabled"}>Make from My bar</button>
    <div style="margin-top:12px">${mkTypeBox("bar", "Add a bottle, juice or syrup")}</div>${mine}
    <div class="h3">Add from the list</div>${mkCatsHtml(on, "mk-bar")}`;
}
// "Only what My bar can make" counts only once My bar has something in it: an empty bar would leave nothing to spin.
const mkRndMine = () => mk.rnd.mine && mk.bar.length > 0;
function mkPool() {
  return D.filter((d) => (mk.rnd.mode === "any" || (mk.rnd.mode === "zero") === (mkKids(d) === "zero"))
    && (mk.rnd.mode !== "alc" || mk.rnd.kind === "all" || (mk.rnd.kind === "spritz" ? /Spritz/.test(d.section) : mkKids(d) === mk.rnd.kind))
    && (!mk.rnd.mood || d.tags.some((t) => FLAVOURS[mk.rnd.mood].includes(t)))
    && (!mk.rnd.base || mk.rnd.mode === "zero" || d._b === mk.rnd.base)
    && !isOut(d.name) && plOutOf(d).ok && (!mkRndMine() || mkCanMake(d)));
}
function mkRndCard(d) {
  if (!d) return `<div class="mk-rnd"><p class="sub" style="margin:0">Tap Spin and the book picks one for you.</p></div>`;
  return `<div class="mk-rnd" id="mk-card"><span class="g" aria-hidden="true">${glass(d)}</span><h3>${esc(d.name)}</h3><div class="sub">${esc(d.section)} · ${esc(blurb(d))}</div>
    <ul>${d.spec.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
    <div class="mk-how"><b>${esc(d.glass)}</b> · ${esc(d.ice)}<br>${esc(d.method)}<br>Garnish: ${esc(d.garnish)}</div>
    <button class="btn wide" data-mk-open="${d.id}">Open the full spec and step by step</button></div>`;
}
const MK_SPIRITS = [["vodka", "Vodka"], ["gin", "Gin"], ["rum", "Rum"], ["tequila", "Tequila"], ["whisky", "Whisky"]];
/* Shake the phone to spin, as on a dice app. iPhones ask once (the first Spin tap is the permission tap); a firm shake,
   not a walk across the bar, and only while the Spin page is showing. */
const MK_SHAKE = { can: typeof DeviceMotionEvent !== "undefined" && matchMedia("(pointer:coarse)").matches, on: false, last: 0 };
async function mkShakeOn() {
  if (!MK_SHAKE.can || MK_SHAKE.on) return;
  try { if (typeof DeviceMotionEvent.requestPermission === "function" && (await DeviceMotionEvent.requestPermission()) !== "granted") return; } catch { return; }
  MK_SHAKE.on = true;
  addEventListener("devicemotion", (e) => {
    const a = e.accelerationIncludingGravity; if (!a || $("#v-fun").hidden || !$("#sheet").hidden) return;
    const g = Math.hypot(a.x || 0, a.y || 0, a.z || 0), now = Date.now();
    if (g > 24 && now - MK_SHAKE.last > 1500) { MK_SHAKE.last = now; mkSpin(); }
  });
}
function mkRndPane() {
  const pool = mkPool();
  const seg = (k, l) => `<button aria-pressed="${mk.rnd.mode === k}" data-mk-rmode="${k}">${l}</button>`;
  return `<div class="h3">Spin for a drink</div><p class="lead">Can't decide? Spin for a drink. Hugo Spritz or a Jägerbomb, the book picks.</p>
    <div class="seg" style="grid-template-columns:repeat(3,1fr)" role="group" aria-label="Alcohol">${seg("alc", "Alcoholic")}${seg("zero", "Alcohol-free")}${seg("any", "Either")}</div>
    ${mk.rnd.mode === "alc" ? `<div class="chips hrow">${[["all", "Any"], ["cocktail", "Cocktail"], ["spritz", "Spritz"], ["shot", "Shot"]].map(([k, l]) => `<button class="chip" aria-pressed="${mk.rnd.kind === k}" data-mk-rkind="${k}">${l}</button>`).join("")}</div>` : ""}
    <div class="mini">Mood</div><div class="chips hrow">${Object.keys(FLAVOURS).map((k) => `<button class="chip" aria-pressed="${mk.rnd.mood === k}" data-mk-rmood="${esc(k)}">${esc(k)}</button>`).join("")}</div>
    ${mk.rnd.mode === "zero" ? "" : `<div class="mini">Spirit</div><div class="chips hrow">${MK_SPIRITS.map(([k, l]) => `<button class="chip" aria-pressed="${mk.rnd.base === k}" data-mk-rbase="${k}">${l}</button>`).join("")}</div>`}
    <div class="mk-opts"><button class="chip" aria-pressed="${mkRndMine()}" data-mk-rmine="1"${mk.bar.length ? "" : " disabled"}>Only what My bar can make</button></div>
    <p class="note">${pool.length} ${pool.length === 1 ? "drink" : "drinks"} in the hat.${mk.bar.length ? "" : " Add bottles to My bar to spin only what you can make."}${pool.length ? "" : " Take off a mood or spirit."}${MK_SHAKE.can ? " Or shake the phone." : ""}</p>
    <div id="mk-rcard">${mkRndCard(mk.rnd.cur && D[mk.rnd.cur])}</div>
    <button class="btn pri mk-spin" data-mk="spin"${pool.length ? "" : " disabled"}>${mk.rnd.cur != null ? "Spin again" : "Spin"}</button>`;
}
/* Games and drills (under More): the daily drill, quiz night and your month (fun.js), then the spec of the day and Spin.
   Nobody needs them mid-shift, so they're off the Drinks tab. A drill or quiz night takes over the page while it's on. */
function renderFun() {
  if (funScreen()) return;
  $("#v-fun").innerHTML = `<button class="back" data-back>‹ More</button><h2 style="font-size:28px">Games and drills</h2>${funTopHtml()}<div class="sec">Just for fun</div>${plDailyHtml()}<div id="fun-spin">${mkRndPane()}</div>`;
}
$("#v-fun").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  const ds = b.dataset, set = (f) => { f(); mk.rnd.cur = null; mkSave(); $("#fun-spin").innerHTML = mkRndPane(); };
  if (ds.mkOpen || ds.plDaily) return openSheet(+(ds.mkOpen || ds.plDaily));
  if (ds.mkRmode) return set(() => (mk.rnd.mode = ds.mkRmode));
  if (ds.mkRkind) return set(() => (mk.rnd.kind = ds.mkRkind));
  if ("mkRmood" in ds) return set(() => (mk.rnd.mood = mk.rnd.mood === ds.mkRmood ? null : ds.mkRmood));
  if ("mkRbase" in ds) return set(() => (mk.rnd.base = mk.rnd.base === ds.mkRbase ? null : ds.mkRbase));
  if (ds.mkRmine) return set(() => (mk.rnd.mine = !mk.rnd.mine));
  if (ds.mk === "spin") { mkShakeOn(); mkSpin(); }
});
function mkQsList() {
  const words = mk.qs.q.trim() ? plQuery(mk.qs.q.trim()).words : [];
  // A to Z with the letter strip; a search keeps the best matches first.
  const hits = D.filter((d) => mkKindOk(d, mk.qs.kind) && plHits(d, words) && (!mk.qs.mine || mkCanMake(d)));
  const rows = words.length ? plRank(hits, words) : azSort(hits, (d) => d.name);
  MK.ids = rows.map((d) => d.id);
  const row = (d) => `<button class="mk-q" data-mk-open="${d.id}"><div class="n">${esc(d.name)}<span>${esc(d.glass)}</span></div><div class="s">${esc(mkShort(d))}</div><div class="m">${esc(d.method)} · ${esc(d.garnish)}</div></button>`;
  return `<p class="count">${rows.length} ${rows.length === 1 ? "drink" : "drinks"}</p>${(words.length ? rows.map(row).join("") : azHtml(rows, (d) => d.name, row)) || `<p class="empty">Nothing matches.</p>`}`;
}
function mkQsPane() {
  return `<p class="lead">Every spec on one line, for when it's busy. Tap one for the full card.</p>
    <div class="search"><input id="mk-qs" type="search" placeholder="Search drink or ingredient" autocomplete="off" enterkeyhint="search" value="${esc(mk.qs.q)}" aria-label="Search quick specs"></div>
    <div class="chips hrow">${MK_KINDS.map(([k, l]) => `<button class="chip" aria-pressed="${mk.qs.kind === k}" data-mk-qkind="${k}">${l}</button>`).join("")}<button class="chip" aria-pressed="${mk.qs.mine}" data-mk-qmine="1">My bar can make</button></div>
    <div id="mk-qlist">${mkQsList()}</div>`;
}
function renderMaker() {
  const tabs = [["make", "Ingredients"], ["bt", "Black Tap"], ["bar", "My bar"], ["qs", "Specs"]];
  const pane = { make: mkMakePane, bt: btPane, bar: mkBarPane, qs: mkQsPane, mine: () => minePane() }[mk.pane] || mkMakePane;
  // By the English name, as the open ones may be showing in another language (trWas keeps the English).
  const open = [...$$("#v-make details[open] summary")].map((s) => trWas.get(s.firstChild) ?? s.firstChild.textContent);
  $("#v-make").innerHTML = `<h2 style="font-size:28px;margin-top:12px">What can I make?</h2>
    <div class="seg mk-seg" role="group" aria-label="Cocktail maker">${tabs.map(([k, l]) => `<button aria-pressed="${mk.pane === k}" data-mk-pane="${k}">${l}</button>`).join("")}</div>
    <div id="mk-pane">${pane()}</div>`;
  // Keep the same ingredient groups open after a tap.
  $$("#v-make details").forEach((x) => { if (open.includes(x.querySelector("summary").firstChild.textContent)) x.open = true; });
}
// Redraw without losing the page position or the keyboard.
let mkShelfCat = null;
function mkRedraw(focus) {
  // The side-scrolling rows keep their place too, so a tap far along the shelf doesn't jump back to the start.
  const rows = [".mk-cats", ".mk-shelf", ".mk-goes"], x = rows.map((r) => $("#v-make " + r)?.scrollLeft || 0), cat = mk.cat;
  const y = window.scrollY; renderMaker(); window.scrollTo(0, y);
  rows.forEach((r, i) => { const el = $("#v-make " + r); if (el) el.scrollLeft = r === ".mk-shelf" && cat !== mkShelfCat ? 0 : x[i]; });
  mkShelfCat = cat;
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
  if ("mkCat" in ds) { mk.cat = ds.mkCat || null; return mkRedraw(); }
  if (ds.mkKind) { mk.opt.kind = ds.mkKind; mkSave(); return mkRedraw(); }
  if (ds.btUse) { mk.pick = [{ k: ds.btUse }]; mk.fromBar = false; mk.edit = null; mk.pane = "make"; mkSave(); renderMaker(); window.scrollTo(0, 0); return; }
  if (ds.btView) { mk.bt.view = ds.btView; mkSave(); return mkRedraw(); }
  if (ds.btKind) { mk.bt.kind = ds.btKind; mkSave(); return mkRedraw(); }
  if (ds.mkQkind) { mk.qs.kind = ds.mkQkind; $("#mk-pane").innerHTML = mkQsPane(); return; }
  if (ds.mkQmine) { mk.qs.mine = !mk.qs.mine; $("#mk-pane").innerHTML = mkQsPane(); return; }
  const a = ds.mk;
  if (a === "btbar") { const ks = new Set(mk.bar); for (const k of BT_KEYS) ks.add(k); mk.bar = [...ks]; mkSave(); toast(`Line-up loaded: My bar has ${mk.bar.length} items`); return mkRedraw(); }
  if (a === "keep") { for (const p of mk.pick) if (!mk.bar.includes(p.k)) mk.bar.push(p.k); mkSave(); toast(`Kept in My bar (${mk.bar.length})`); return mkRedraw(); }
  if (a === "clear") { const was = mk.pick; mk.pick = []; mk.edit = null; mkSave(); mkRedraw(); if (was.length) undoToast("Cleared", () => { mk.pick = was; mkSave(); mkRedraw(); }); return; }
  if (a === "clearbar") { if (confirm("Clear everything from My bar on this phone?")) { mk.bar = []; mkSave(); mkRedraw(); } return; }
  if (a === "unbar") { mk.fromBar = false; return mkRedraw(); }
  if (a === "frombar") { mk.pick = []; mk.fromBar = true; mk.pane = "make"; mkSave(); renderMaker(); window.scrollTo(0, 0); return; }
  // Every ingredient the book's own drinks use: what's behind the Black Tap bar.
  if (a === "bt") { const ks = new Set(mk.bar); for (const r of MK.reqs.values()) for (const x of r) ks.add(x.it.k); mk.bar = [...ks]; mkSave(); toast(`My bar has ${mk.bar.length} items`); return mkRedraw(); }
});
