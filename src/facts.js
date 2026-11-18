/* ---------- Product facts: what the maker says about everything we stock ----------
   Size, strength, what's in it, allergens, how long it keeps once opened and how to store it, each with where it was
   read and when. Read from the maker's own pages and spec sheets, or from the UK wholesalers and supermarkets that
   print the maker's label (Ocado, LWC, Brakes, Country Choice, Lynas, Thomas Ridley, One Stop, Sainsbury's), checked
   18 Nov 2026. Nothing here is guessed: what no source states is left out and shows as "not found". Allergens are
   only ever "the maker says it contains", never "free from": the label on the bottle in your hand has the final word.
   Once-opened days: the venue's own days (set on Labels) always win. The maker's days are the default where the venue
   hasn't set any. Where two of the maker's own sheets disagree, the shorter one is used and the card says so. */
var FX_SRC = {
  monin: ["Monin help centre: shelf life of opened products", "https://help.monin.com/hc/en-us/articles/43846255706637-What-is-the-shelf-life-of-opened-products"],
  moninNuts: ["Monin help centre: nut allergens", "https://help.monin.com/hc/en-us/articles/360039406731-Do-any-Monin-Flavors-contain-nut-allergens"],
  baileys: ["Baileys FAQ", "https://www.baileys.com/en/frequently-asked-questions"],
  funkinFaq: ["Funkin FAQs", "https://funkincocktails.co.uk/pages/faqs"],
  funkinPf: ["Funkin: passion fruit purée", "https://www.funkincocktails.co.uk/products/passion-fruit-puree"],
  funkinSt: ["Funkin: strawberry purée", "https://www.funkincocktails.co.uk/products/strawberry-puree"],
  funkinRb: ["Funkin: raspberry purée", "https://www.funkincocktails.co.uk/products/raspberry-puree"],
  funkinWp: ["Funkin: white peach purée", "https://funkincocktails.co.uk/products/white-peach-puree"],
  ocOrgeat: ["Ocado: Giffard Orgeat 1L", "https://www.ocado.com/products/giffard-orgeat-almond-syrup-546460011"],
  lwcOrgeat: ["LWC: Giffard Sirop Orgeat 1L", "https://catalog.lwc.co.uk/giffard-sirop-orgeat-almond-1ltr/"],
  dgCoco: ["Difford's Guide: Reàl Coco cream of coconut", "https://www.diffordsguide.com/beer-wine-spirits/1114/rel-coco-cream-of-coconut"],
  eeCoco: ["Easy Equipment: Re'al cream of coconut 500ml", "https://www.easyequipment.com/re-al-coco-cream-of-coconut-500ml-ka479-7192.html"],
  dvStr: ["Kerry spec via Lynas: DaVinci Strawberry Sauce 500g (4 Jul 2024)", "https://orders.lynasfoodservice.com/assets/file/spec/S7526.pdf"],
  dvStrMg: ["Kerry spec: DaVinci Drizzle Strawberry 12 x 500g (27 Mar 2024)", "https://pim.marketgrounds.sepia.de/pdf/1116408372_DaVinci_Gourmet_Drizzle_Strawberry.pdf"],
  ccStr: ["Country Choice: DaVinci Strawberry Drizzle 500g", "https://www.countrychoice.co.uk/ice-cream/tubs-scooping/toppings/davinci-gourmet-strawberry-flavoured-drizzle-sauce-500g/p/100534"],
  dvRas: ["Kerry spec via Lynas: DaVinci Raspberry Dessert Sauce 12 x 500g (4 Jul 2024)", "https://orders.lynasfoodservice.com/assets/file/spec/DESSR.pdf"],
  brRas: ["Brakes: DaVinci Raspberry Dessert Sauce 500g", "https://www.brake.co.uk/dry-store/dry-store-desserts/custard-sauces/dessert-sauces/davinci-raspberry-dessert-sauce/p/100536"],
  trRas: ["Thomas Ridley: DaVinci Raspberry Drizzle 12 x 500g", "https://thomasridley.co.uk/davinci-raspberry-drizzle-sauce-56031"],
  dvBel: ["Kerry spec via Lynas: DaVinci Belgian Chocolate Sauce 500g (4 Jul 2024)", "https://orders.lynasfoodservice.com/assets/file/spec/S7528.pdf"],
  ccBel: ["Country Choice: DaVinci Belgian Chocolate Drizzle 500g", "https://www.countrychoice.co.uk/drinks-snacks/snacks/preserves/davinci-gourmet-belgian-chocolate-flavoured-drizzle-sauce-500g/p/100530"],
  trBel: ["Thomas Ridley: DaVinci Belgian Chocolate Drizzle 12 x 500g", "https://www.thomasridley.co.uk/davinci-belgium-chocolate-drizzle-sauce-06231"],
  dvChoc: ["Kerry spec: DaVinci Sauce Chocolate 2.5kg (21 Jun 2024)", "https://pim.marketgrounds.sepia.de/pdf/21600121_DaVinci_Gourmet_Sauce_Chocolate.pdf"],
  dvCar: ["Kerry spec: DaVinci Sauce Caramel 2.5kg (9 Jul 2025)", "https://live.pim.marketgrounds.sepia.de/pdf/21800123_DaVinci_Gourmet_Sauce_Caramel.pdf"],
  dvWhite: ["Kerry spec: DaVinci Sauce White Chocolate 2.5kg (20 Jul 2026)", "https://live.pim.marketgrounds.sepia.de/pdf/21700122_DaVinci_Gourmet_Sauce_White_Chocolate.pdf"],
  dvSalt: ["Kerry spec via Lynas: DaVinci Salted Caramel Syrup 6 x 1L (4 Jul 2024)", "https://orders.lynasfoodservice.com/assets/file/spec/DVISALTC.pdf"],
  dvCarS: ["Kerry spec via Lynas: DaVinci Caramel Syrup 6 x 1L (4 Jul 2024)", "https://orders.lynasfoodservice.com/assets/file/spec/DSNZCAR.pdf"],
  dvVan: ["Kerry spec: DaVinci Vanilla Syrup 1L (14 Jun 2019)", "https://media.thomasridley.co.uk/Products/SPECS/09407.pdf"],
  dvMarsh: ["Coffee Supplies Direct: DaVinci Marshmallow Syrup 1L", "https://www.coffeesuppliesdirect.co.uk/products/davinci-gourmet-marshmallow-syrup-1l"],
  ocKahluaCr: ["Ocado: Kahlúa Coffee Cream Liqueur 70cl", "https://www.ocado.com/products/kahlua-coffee-cream-liqueur-695999011"],
  tweKahlua: ["The Whisky Exchange: Kahlúa Coffee Liqueur 16%", "https://www.thewhiskyexchange.com/p/3242/kahlua-coffee-liqueur-16"],
  ocFrang: ["Ocado: Frangelico 70cl", "https://www.ocado.com/products/frangelico-hazelnut-liqueur-44177011"],
  lwcFrang: ["LWC: Frangelico 70cl", "https://catalog.lwc.co.uk/frangelico-hazelnut-liqueur-70cl/"],
  ocDisa: ["Ocado: Disaronno Originale 70cl", "https://www.ocado.com/products/disaronno-amaretto-295396011"],
  lwcDisa: ["LWC: Disaronno 70cl", "https://catalog.lwc.co.uk/disaronno-amaretto-70cl/"],
  ocAdv: ["Ocado: Warninks Advocaat", "https://www.ocado.com/products/warninks-advocaat/16663011"],
  lwcAdv: ["LWC: Warninks Advocaat 70cl", "https://catalog.lwc.co.uk/warninks-advocaat-70cl"],
  ocSheep: ["Ocado: Sheep Dog Peanut Butter 70cl", "https://www.ocado.com/products/sheep-dog-peanut-butter-whiskey-liqueur-619651011"],
  ocRosso: ["Ocado: Martini Rosso 75cl", "https://www.ocado.com/products/martini-rosso-vermouth-450818011"],
  ocDry: ["Ocado: Martini Extra Dry 75cl", "https://www.ocado.com/products/martini-extra-dry-vermouth-aperitivo/450841011"],
  ocGuin: ["Ocado: Guinness Draught", "https://www.ocado.com/products/guinness-draught-stout-beer-16453011"],
  osCorona: ["One Stop spec: Corona Extra 330ml", "https://www.onestop.co.uk/wp-content/uploads/Corona-Extra-4-x-330ml-363487.pdf"],
  osCero: ["One Stop spec: Corona Cero 330ml", "https://www.onestop.co.uk/wp-content/uploads/Corona-Cero-4-x-330ml-403212.pdf"],
  osKopp: ["One Stop spec: Kopparberg Strawberry & Lime 500ml", "https://www.onestop.co.uk/wp-content/uploads/Kopparberg-Premium-Cider-Strawberry-and-Lime-500ml-372491.pdf"],
  ocJager: ["Ocado: Jägermeister 70cl", "https://www.ocado.com/products/jagermeister-herb-liqueur-58933011"],
  dbPimms: ["Dee Bee: Pimm's No. 1 70cl", "https://www.deebee.co.uk/product/id/012752"],
  dbAperol: ["Dee Bee: Aperol 70cl", "https://www.deebee.co.uk/product/id/615999"],
  osLp: ["One Stop spec: Lea & Perrins 150ml", "https://www.onestop.co.uk/wp-content/uploads/Lea-and-Perrins-Worcester-Sauce-150ml-314518.pdf"],
  brTonic: ["Brakes: Fever-Tree Indian Tonic 24 x 200ml", "https://brake.co.uk/drinks-snacks/cold-beverages/carbonates/mixers/fever-tree-premium-indian-tonic-water-24-x-200ml/p/130518"],
  osOatly: ["One Stop: Oatly Barista Edition 1L", "https://www.onestop.co.uk/?p=91610"],
  sMilk: ["Sainsbury's: British Whole Milk 2 pint", "https://www.sainsburys.co.uk/groceries/product/sainsburys-british-whole-milk-1-13l-2-pint"],
  ocCream: ["Ocado: British Double Cream", "https://www.ocado.com/products/ocado-british-double-cream/584185011"],
  ccLotus: ["Country Choice: Lotus Biscoff 300 biscuits", "https://www.countrychoice.co.uk/grocery/baking-mixes-ingredients/baking-ingredients/lotus-biscoff-biscuits-300-caramelised-biscuits/p/18019"],
  ccLotusCr: ["Country Choice: Lotus Biscoff crumbs 750g", "https://www.countrychoice.co.uk/grocery/baking-mixes-ingredients/baking-ingredients/lotus-biscoff-biscuit-crumbs-8-x-750g/p/185763"],
  ccJammie: ["Country Choice: Jammie Dodgers Original 140g", "https://www.countrychoice.co.uk/grocery/baking-mixes-ingredients/baking-ingredients/jammie-dodgers-original/p/132884"],
  fbcJammie: ["Fox's Burton's: Jammie Dodgers Giant", "https://www.fbc-uk.com/brands/jammie-dodgers/jammie-dodgers-giant"],
  ccOreo: ["Country Choice: Oreo crushed cookie pieces 400g", "https://www.countrychoice.co.uk/drinks-snacks/confectionery/chocolate/oreo-small-crushed-cookie-pieces-400g/p/127145"],
  brPhilly: ["Brakes: Philadelphia Original 1.65kg", "https://www.brake.co.uk/dairy/block-grated-cheese/soft-cheese/spreadable/philadelphia-original-1-65kg/p/71130"],
  osRb: ["One Stop spec: Red Bull 250ml", "https://www.onestop.co.uk/wp-content/uploads/Red-Bull-Energy-Drink-250ml-107639.pdf"],
  osRbSf: ["One Stop spec: Red Bull Sugar Free 250ml", "https://www.onestop.co.uk/wp-content/uploads/Red-Bull-Energy-Drink-Sugar-Free-250ml-351341.pdf"],
  jGuava: ["Lynas spec: Jarritos Guava 370ml", "https://orders.lynasfoodservice.com/assets/file/spec/S1434.pdf"],
  jMand: ["Lynas spec: Jarritos Mandarin 370ml", "https://orders.lynasfoodservice.com/assets/file/spec/S1432.pdf"],
  ufsMayo: ["Unilever Food Solutions: Hellmann's Real Squeezy 250ml", "https://www.unileverfoodsolutions.co.uk/product/hellmann-s-real-squeezy-mayonnaise-250ml-1-EN-258583.html"],
  which: ["Which?: what condiment labels say (updated 21 Jan 2026)", "https://www.which.co.uk/news/2020/02/are-you-storing-your-condiments-correctly/"],
  brColman: ["Brakes: Colman's English Mustard 2.25L", "https://www.brake.co.uk/dry-store/condiments-pickles/bulk-condiments/mustard/colman-s-english-mustard-2-25l/p/1295"],
  trEgg: ["Carron Lodge spec: Pasteurised Egg White 1kg", "https://media.thomasridley.co.uk/Products/SPECS/14632.pdf"],
  lwcAng: ["LWC: Angostura Bitters 20cl", "https://catalog.lwc.co.uk/angostura-bitters-200ml/"],
  sAng: ["Sainsbury's: Angostura Bitters 20cl", "https://sainsburys.co.uk/groceries/product/angostura-bitters-20cl"],
  dgEagCran: ["Difford's Guide: Eager Cranberry", "https://www.diffordsguide.com/beer-wine-spirits/4434/eager-cranberry-juice"],
  dgEagOr: ["Difford's Guide: Eager Smooth Orange", "https://www.diffordsguide.com/beer-wine-spirits/4437/eager-smooth-orange-juice"],
  dgEagPine: ["Difford's Guide: Eager Pineapple", "https://www.diffordsguide.com/beer-wine-spirits/4431/eager-pineapple-juice"],
  ocEagApple: ["Ocado: Eager Apple 1L", "https://www.ocado.com/products/eager-apple-juice-not-from-concentrate-56775011"],
  trEagCran: ["Eager spec: Cranberry Juice Drink 8 x 1L", "https://media.thomasridley.co.uk/Products/SPECS/05362.pdf"],
  pxEager: ["PlantX: Eager range", "https://plantx.uk/products/eager-juice"],
  trCokeBib: ["Coca-Cola spec: Original Taste 7L BIB", "https://media.thomasridley.co.uk/Products/SPECS/57174.pdf"],
  ccZeroBib: ["Country Choice: Coca-Cola Zero 7L BIB", "https://www.countrychoice.co.uk/drinks-snacks/drinks/carbonated/coca-cola-zero-bag-in-box-7l/p/27024"],
  lwcZeroBib: ["LWC: Coke Zero Sugar 7L BIB", "https://catalog.lwc.co.uk/coca-cola-coke-zero-sugar-7ltr-bib/"],
  trCokeBtl: ["Coca-Cola spec: Original Taste 330ml glass", "https://media.thomasridley.co.uk/Products/SPECS/27168.pdf"],
  lwcCokeBtl: ["LWC: Coke Original Taste 24 x 330ml glass", "https://catalog.lwc.co.uk/coca-cola-coke-original-taste-24-x-330ml-nrb/"],
};
var FX_DAY = "18 Nov 2026";
// One line per product. n: the name on the card. m: the names it goes by (matched on the lower-case name). Each fact is
// [what it says, source key]. open: days once opened (d), fridge once opened (f), and what the maker says (t).
var FACTS = [
  // ---- Juices: Eager (Derek, 18 Nov 2026) ----
  { n: "Eager Apple Juice", m: /apple juice/, maker: "Eager", size: ["1 litre carton", "ocEagApple"], ingr: ["Pressed apple juice not from concentrate, antioxidant (ascorbic acid)", "ocEagApple"],
    open: { d: 5, f: 1, t: "Once opened store in the fridge and drink within 5 days", s: "ocEagApple" }, store: ["Room temperature until opened", "ocEagApple"] },
  { n: "Eager Cranberry Juice Drink", m: /cranberry/, maker: "Eager", size: ["1 litre carton", "trEagCran"], ingr: ["Apple juice from concentrate, cranberry juice from concentrate (26%), cranberry purée (1.5%), natural flavour", "trEagCran"],
    none: ["None of the 14 allergens, and no sulphites, on Eager's spec sheet", "trEagCran"], open: { d: 5, f: 1, t: "Once opened store in the fridge and drink within 5 days", s: "trEagCran" },
    shelf: ["420 days from production, unopened", "trEagCran"], store: ["Room temperature until opened", "trEagCran"] },
  { n: "Eager Orange Juice", m: /orange juice/, maker: "Eager", size: ["1 litre carton", "dgEagOr"], ingr: ["100% squeezed orange juice, not from concentrate", "dgEagOr"],
    open: { d: 5, f: 1, t: "Refrigerate once opened and drink within 5 days", s: "dgEagOr" } },
  { n: "Eager Pineapple Juice", m: /pineapple juice/, maker: "Eager", size: ["1 litre carton", "dgEagPine"], ingr: ["100% pressed pineapple juice, not from concentrate", "dgEagPine"],
    open: { d: 5, f: 1, t: "Refrigerate once opened and drink within 5 days", s: "dgEagPine" } },
  { n: "Eager Pink Grapefruit Juice", m: /grapefruit juice/, maker: "Eager", size: ["1 litre", "pxEager"], ingr: ["Pressed pink grapefruit juice not from concentrate, antioxidant (ascorbic acid)", "pxEager"],
    open: { d: 5, f: 1, t: "Eager's other juices: fridge once opened, drink within 5 days. Not printed for this one on the pages read", s: "ocEagApple" } },
  { n: "Eager Tomato Juice", m: /tomato juice/, maker: "Eager", size: ["1 litre", "pxEager"],
    open: { d: 5, f: 1, t: "Eager's other juices: fridge once opened, drink within 5 days. Not printed for this one on the pages read", s: "ocEagApple" } },
  // ---- Purées and syrups: Funkin, Monin, Giffard, Coco Real ----
  { n: "Funkin purées", m: /funkin|pur[ée]e/, maker: "Funkin", size: ["1 kg resealable pouch", "funkinSt"],
    ingr: ["Passion fruit, sugar · Strawberry, sugar, colour (lycopene) · Raspberry, sugar · White peach, sugar, ruby peach, antioxidant (ascorbic acid)", "funkinPf"],
    gluten: ["“All our products are gluten-free”", "funkinFaq"], open: { d: 8, f: 1, t: "Purée, once opened: 8 days refrigerated (FAQ). The product pages say 10 days: the shorter is used", s: "funkinFaq" },
    store: ["Keep refrigerated", "funkinPf"], shelf: ["At least 3 months left when shipped", "funkinFaq"], more: [["Freezing", "Peach: can be frozen for up to 3 months", "funkinWp"]] },
  { n: "Monin syrups", m: /monin|strawberry syrup|watermelon syrup|passion fruit syrup|elderflower syrup/, maker: "Monin", size: ["70 cl glass bottle (UK)", ""],
    open: { f: 0, t: "Room temperature (18 to 27°C). Cap on: 90 to 180 days. With a pump or pourer: 30 to 60 days. Cover pumps overnight", s: "monin" },
    more: [["Nuts", "Monin's nut-flavoured syrups (hazelnut, almond, macadamia) are listed as not containing nut allergens. Formulas change: the back label is the most accurate source", "moninNuts"]] },
  { n: "Giffard Orgeat (almond syrup)", m: /orgeat/, maker: "Giffard", size: ["1 litre glass bottle", "ocOrgeat"], abv: ["0%", "lwcOrgeat"], contains: ["Tree nuts", "lwcOrgeat"],
    shelf: ["3 years sealed", "ocOrgeat"], store: ["Cool, dry place, away from light", "ocOrgeat"], more: [["Nuts", "Ocado's listing says it is NOT nut free: it's made with almonds", "ocOrgeat"]] },
  { n: "Coco Real (cream of coconut)", m: /coco real|cream of coconut/, maker: "Reàl", size: ["500 ml squeezy bottle", "dgCoco"],
    ingr: ["Coconut concentrate (18%), sugar, humectant (glycerol), salt, preservative (potassium sorbate), citric acid", "dgCoco"],
    open: { d: 90, f: 0, t: "Safe without the fridge for 3 months once opened; the fridge makes it last longer. Shake before use", s: "dgCoco" }, shelf: ["12 months unopened", "dgCoco"], more: [["Diet", "Vegan, gluten free", "eeCoco"]] },
  // ---- Shake station sauces: DaVinci Gourmet (Derek, 18 Nov 2026) ----
  { n: "DaVinci Strawberry Sauce", m: /strawberry sauce/, maker: "DaVinci Gourmet (Kerry)", size: ["500 g squeeze bottle, 12 to a case", "dvStrMg"],
    ingr: ["Glucose syrup, water, strawberry purée from concentrate (8.9%), dextrose, modified starch, acidity regulators, colours (anthocyanins, paprika extract), pectin, natural flavourings, potassium sorbate", "dvStr"],
    none: ["None of the 14 allergens", "ccStr"], may: ["Gluten, egg, soya, milk, sulphites (traces)", "dvStrMg"], open: { d: 14, f: 0, t: "Once opened, use within 14 days. Store between 10 and 25°C", s: "ccStr" },
    shelf: ["365 days from production", "dvStrMg"], weight: ["500 g in it. A case of 12 is 6.55 kg gross, so about 45 g of packaging a bottle including its share of the box", "dvStrMg"],
    more: [["Another sheet", "DaVinci drizzles on Thomas Ridley: after opening, 0 to 4°C for 4 weeks, or up to 30°C for 7 days", "trRas"]] },
  { n: "DaVinci Raspberry Sauce", m: /raspberry sauce/, maker: "DaVinci Gourmet (Kerry)", size: ["500 g bottle, 12 to a case", "brRas"],
    ingr: ["Glucose syrup, water, seedless raspberry purée from concentrate (9.6%), sugar, dextrose, modified starch, acidity regulators, colour (anthocyanin), pectin, potassium sorbate, natural flavourings", "brRas"],
    none: ["None of the 14 allergens", "brRas"], open: { d: 7, f: 0, t: "After opening: 0 to 4°C and use within 4 weeks, or up to 30°C and use within 7 days", s: "trRas" },
    weight: ["500 g in it. A case of 12 is 6.66 kg", "trRas"] },
  { n: "DaVinci Belgian Chocolate Sauce", m: /chocolate sauce/, maker: "DaVinci Gourmet (Kerry)", size: ["500 g squeeze bottle, 12 to a case", "ccBel"],
    ingr: ["Glucose syrup, water, sugar, dextrose, glycerol, fat-reduced cocoa powder, Belgian dark chocolate 3.5% (cocoa mass, sugar, dextrose, soya lecithin), modified starch, soya lecithin, natural flavouring", "dvBel"],
    contains: ["Soya", "ccBel"], open: { d: 14, f: 0, t: "Once opened, use within 14 days. Store between 10 and 25°C", s: "ccBel" }, weight: ["500 g in it. A case of 12 is 6.64 kg", "trBel"],
    more: [["Big bottle", "The 2.5 kg DaVinci Chocolate Sauce is a different recipe: none of the 14 allergens declared, may contain gluten, egg, soya, milk and sulphites. 720 days from production", "dvChoc"]] },
  { n: "DaVinci Caramel Sauce", m: /caramel sauce/, maker: "DaVinci Gourmet (Kerry)", size: ["2.5 kg, 6 to a case", "dvCar"],
    ingr: ["Glucose syrup, fructose syrup, sugar, water, sweetened condensed milk, glycerin, modified starch, unsalted butter (milk), colour, salt, flavouring, xanthan gum, potassium sorbate", "dvCar"],
    contains: ["Milk", "dvCar"], may: ["Gluten, soya, egg, sulphites (traces)", "dvCar"], shelf: ["360 days from production", "dvCar"], store: ["Cool and dry, not frozen, out of the sun", "dvCar"],
    more: [["Which one?", "DaVinci also make a Salted Caramel SYRUP (1 litre, none of the 14 allergens). Check the bottle: if ours is the syrup, its card is the one to use", "dvSalt"]] },
  { n: "DaVinci Vanilla Syrup", m: /vanilla syrup/, maker: "DaVinci Gourmet (Kerry)", size: ["1 litre bottle, 6 to a case", "dvVan"],
    ingr: ["Sugar, water, natural flavourings, glycerol, potassium sorbate, citric acid, caramel colour", "dvVan"], none: ["None needing a label", "dvVan"],
    may: ["Made on a site that also handles gluten, egg, soya, milk, celery and sulphites", "dvVan"], shelf: ["730 days unopened", "dvVan"], store: ["10 to 25°C", "dvVan"] },
  { n: "DaVinci Marshmallow Syrup", m: /marshmallow syrup/, maker: "DaVinci Gourmet (Kerry)", size: ["1 litre bottle", "dvMarsh"], ingr: ["Sugar, water, natural flavourings, potassium sorbate, citric acid", "dvMarsh"] },
  // ---- Liqueurs and aperitifs ----
  { n: "Baileys Original", m: /baileys|irish cream/, maker: "Diageo", abv: ["17%", "baileys"], contains: ["Milk (cream and milk proteins)", "baileys"],
    gluten: ["Made from gluten-free ingredients, but Baileys can't guarantee it's gluten free", "baileys"], open: { f: 0, t: "Lasts 2 years from bottling, opened or not, at 0 to 25°C. No fridge needed", s: "baileys" }, more: [["Vegan", "No", "baileys"]] },
  { n: "Kahlúa", m: /kahl[uú]a/, maker: "Pernod Ricard", size: ["70 cl", "tweKahlua"], abv: ["16%", "tweKahlua"],
    more: [["Not the cream one", "Kahlúa Coffee CREAM Liqueur (17%) is a different bottle and contains milk", "ocKahluaCr"]] },
  { n: "Frangelico", m: /frangelico/, maker: "Campari Group", size: ["70 cl", "ocFrang"], abv: ["20%", "ocFrang"], ingr: ["Water, sugar, alcohol, hazelnut distillate (1%), flavours, caramel colour", "ocFrang"],
    contains: ["Tree nuts", "lwcFrang"], may: ["Nuts", "ocFrang"] },
  { n: "Disaronno Originale", m: /disaronno|amaretto/, maker: "Illva Saronno", size: ["70 cl", "ocDisa"], abv: ["28%", "ocDisa"],
    more: [["Allergens", "Neither Ocado nor LWC lists an allergen for it. It tastes of almond: still tell any guest with a nut allergy and let them decide", "ocDisa"], ["Diet", "Vegetarian, vegan, gluten free (Ocado)", "ocDisa"]] },
  { n: "Warninks Advocaat", m: /advocaat/, maker: "Warninks", size: ["70 cl", "lwcAdv"], abv: ["17.2%", "ocAdv"], contains: ["Egg", "ocAdv"], may: ["LWC also lists milk", "lwcAdv"],
    open: { d: 180, f: 0, t: "Best consumed within 6 months of opening. Best stored in a cool place", s: "ocAdv" } },
  { n: "Sheep Dog Peanut Butter Whiskey", m: /sheep dog/, maker: "Sheep Dog", size: ["70 cl", "ocSheep"], abv: ["35%", "ocSheep"], may: ["Peanuts (traces)", "ocSheep"] },
  { n: "Jägermeister", m: /j[äa]germeister/, maker: "Mast-Jägermeister", size: ["70 cl", "ocJager"], abv: ["35%", "ocJager"], ingr: ["“A closely guarded secret”: 56 herbs and spices", "ocJager"] },
  { n: "Pimm's No. 1", m: /pimm/, maker: "Diageo", size: ["70 cl", "dbPimms"], abv: ["22%", "dbPimms"], ingr: ["Alcohol, gin, sugar, liqueur, flavours, caramel", "dbPimms"] },
  { n: "Aperol", m: /aperol/, maker: "Campari Group", size: ["70 cl", "dbAperol"], abv: ["11%", "dbAperol"],
    ingr: ["Water, sugar, alcohol, infusion of herbs and roots, flavours (contains quinine), salt, colours E110 and E124", "dbAperol"] },
  { n: "Martini Rosso", m: /martini rosso|sweet vermouth/, maker: "Bacardi-Martini", size: ["75 cl", "ocRosso"], abv: ["15%", "ocRosso"], contains: ["Sulphites", "ocRosso"] },
  { n: "Martini Extra Dry", m: /martini extra dry|dry vermouth/, maker: "Bacardi-Martini", size: ["75 cl", "ocDry"], abv: ["15%", "ocDry"], contains: ["Sulphites", "ocDry"],
    shelf: ["Best before on the back label", "ocDry"] },
  // ---- Bitters and sauces for drinks ----
  { n: "Angostura Aromatic Bitters", m: /angostura/, maker: "Angostura", size: ["20 cl", "lwcAng"], abv: ["44.7%", "lwcAng"], ingr: ["Alcohol, water, sugar, gentian, spices, natural aromas, caramel colour", "sAng"],
    contains: ["Sulphites (LWC's listing)", "lwcAng"], more: [["Diet", "Gluten free (Sainsbury's)", "sAng"]] },
  { n: "Lea & Perrins Worcestershire Sauce", m: /worcester/, maker: "Kraft Heinz", ingr: ["Malt vinegar (from barley), spirit vinegar, molasses, sugar, salt, anchovies (fish), tamarind, onions, garlic, spice, flavourings", "osLp"],
    contains: ["Fish (anchovies), barley (gluten)", "osLp"], shelf: ["Best before: see the cap", "osLp"], store: ["Ambient", "osLp"] },
  // ---- Beer and cider ----
  { n: "Guinness", m: /guinness(?! cake| stout cake)/, maker: "Diageo", abv: ["4.2%", "ocGuin"], contains: ["Barley (gluten)", "ocGuin"] },
  { n: "Corona Extra", m: /^corona(?! cero)| corona(?! cero)/, maker: "AB InBev", size: ["330 ml bottle", "osCorona"], abv: ["4.5%", "osCorona"], ingr: ["Water, barley malt, maize, rice, hops", "osCorona"], contains: ["Barley (gluten)", "osCorona"] },
  { n: "Corona Cero (alcohol-free)", m: /corona cero/, maker: "AB InBev", size: ["330 ml bottle", "osCero"], ingr: ["Water, barley malt, maize, sugar, hops, natural flavours", "osCero"], contains: ["Barley (gluten)", "osCero"] },
  { n: "Kopparberg Strawberry & Lime", m: /kopparberg strawberry/, maker: "Kopparberg", size: ["500 ml bottle", "osKopp"], abv: ["4%", "osKopp"], contains: ["Sulphites", "osKopp"] },
  // ---- Softs and mixers ----
  { n: "Coca-Cola postmix (7 litre bag-in-box)", m: /^(coke|coca cola|coke zero|diet coke)$|\(gun\)/, maker: "Coca-Cola", size: ["7 litre bag-in-box of syrup", "trCokeBib"],
    ingr: ["Coke: sugar, water, caramel colour E150d, phosphoric acid, natural flavourings including caffeine", "trCokeBib"], none: ["Coke: “allergen free”. Coke Zero: none of the 14 allergens", "trCokeBib"],
    more: [["Ratio", "Coke: set to 5.4 to 1, or 5.2 to 1 with ice", "trCokeBib"], ["Coke Zero", "Sweeteners aspartame (contains phenylalanine), acesulfame K, steviol glycosides", "ccZeroBib"]], shelf: ["Best before: end of the box", "trCokeBib"] },
  { n: "Coca-Cola glass bottles", m: /coke( zero| diet)? bottles|diet coke bottles|coca cola \(bottle\)|coke zero \(bottle\)|diet coke \(bottle\)/, maker: "Coca-Cola", size: ["330 ml glass bottle, crown cap, 24 to a case", "lwcCokeBtl"],
    ingr: ["Carbonated water, sugar, caramel colour E150d, phosphoric acid, natural flavourings including caffeine", "trCokeBtl"], none: ["“This product is allergen free”", "trCokeBtl"], shelf: ["Best before: side of the cap or the neck", "trCokeBtl"] },
  { n: "Red Bull", m: /red bull(?! sugar)/, maker: "Red Bull", size: ["250 ml can", "osRb"], ingr: ["Water, sucrose, glucose, citric acid, CO2, taurine (0.4%), caffeine (0.03%), vitamins, colours", "osRb"] },
  { n: "Red Bull Sugarfree", m: /red bull sugar/, maker: "Red Bull", size: ["250 ml can", "osRbSf"], ingr: ["Water, citric acid, CO2, taurine, sweeteners (acesulfame K, aspartame), caffeine, xanthan gum", "osRbSf"],
    more: [["Aspartame", "Contains a source of phenylalanine", "osRbSf"]] },
  { n: "Fever-Tree Indian Tonic", m: /^tonic$|indian tonic|tonic \(gun\)/, maker: "Fever-Tree", size: ["200 ml bottle, 24 to a case", "brTonic"], ingr: ["Carbonated spring water, sugar, citric acid, natural flavourings including quinine", "brTonic"],
    none: ["None of the 14 allergens", "brTonic"], store: ["Not in direct sunlight", "brTonic"] },
  { n: "Jarritos", m: /jarritos/, maker: "Jarritos", size: ["370 ml glass bottle, 24 to a case", "jGuava"], ingr: ["Guava: carbonated water, sugar, natural flavourings, citric acid, potassium sorbate, colour E160d", "jGuava"],
    none: ["None of the 14 allergens (guava, mandarin)", "jMand"], more: [["Mandarin colours", "E129 and E110: these carry the “may have an adverse effect on activity and attention in children” warning in the UK", "jMand"]] },
  // ---- Dairy, egg and foam ----
  { n: "Whole milk", m: /whole milk|^milk$/, size: ["2 pint (1.136 litre) bottle, if that's the one we buy", "sMilk"], contains: ["Milk", "sMilk"],
    open: { d: 3, f: 1, t: "Once opened, consume within 3 days. Keep below 5°C", s: "sMilk" } },
  { n: "Oatly Barista Edition", m: /oat ?milk|oatly|oat drink/, maker: "Oatly", size: ["1 litre carton", "osOatly"], ingr: ["Water, oats 10%, rapeseed oil, dipotassium phosphate, calcium carbonate, potassium iodide, salt, vitamins D2, riboflavin, B12", "osOatly"],
    contains: ["Oats", "osOatly"], open: { d: 5, f: 1, t: "Once opened keep refrigerated (max. 8°C) and consume within approx. 5 days", s: "osOatly" }, store: ["Up to 25°C unopened", "osOatly"],
    more: [["Gluten", "Oats are a cereal containing gluten in UK allergen law, so oat milk is a gluten allergen unless the pack says gluten free", ""]] },
  { n: "Double cream", m: /double cream/, contains: ["Milk", "ocCream"], open: { d: 5, f: 1, t: "A supermarket double cream says: once opened, consume within 5 days, 0 to 5°C. Our catering carton may say otherwise: the pack wins", s: "ocCream" } },
  { n: "Pasteurised egg white (carton)", m: /egg white/, maker: "Carron Lodge (one catering brand)", size: ["1 kg carton", "trEgg"], ingr: ["Egg white, citric acid, sodium citrate, potassium sorbate, guar gum, xanthan gum", "trEgg"],
    contains: ["Egg", "trEgg"], open: { d: 7, f: 1, t: "Once opened, one week if kept below 4°C", s: "trEgg" }, store: ["Chilled, 0 to 4°C", "trEgg"], shelf: ["84 days from production", "trEgg"] },
  // ---- Shake toppings and spreads ----
  { n: "Philadelphia Original", m: /philadelphia|cream cheese/, maker: "Mondelez", size: ["1.65 kg tub (catering)", "brPhilly"], ingr: ["Full fat soft cheese, salt, guar gum, citric acid", "brPhilly"], contains: ["Milk", "brPhilly"],
    store: ["Keep refrigerated", "brPhilly"] },
  { n: "Lotus Biscoff biscuits", m: /lotus/, maker: "Lotus", size: ["300 individually wrapped biscuits", "ccLotus"], contains: ["Wheat (gluten), soya", "ccLotus"],
    more: [["Crumbs", "Biscoff crumbs (750 g): contain wheat; may contain soya", "ccLotusCr"]] },
  { n: "Jammie Dodgers", m: /jammie/, maker: "Fox's Burton's", size: ["Original: 140 g pack", "ccJammie"], contains: ["Wheat (gluten), sulphites", "ccJammie"], may: ["Giant ones: milk", "fbcJammie"] },
  { n: "Oreo crushed cookie pieces", m: /oreo crumb|oreo pieces/, maker: "Mondelez", size: ["400 g bag", "ccOreo"], contains: ["Wheat (gluten), soya", "ccOreo"], may: ["Milk", "ccOreo"], store: ["Dry place, away from heat", "ccOreo"] },
  // ---- Condiments on the floor ----
  { n: "Hellmann's Real Mayonnaise", m: /mayo/, maker: "Unilever", contains: ["Egg", "ufsMayo"], open: { d: 30, f: 0, t: "Once opened, no fridge needed for up to 1 month, or in the fridge for up to 3 months", s: "ufsMayo" }, shelf: ["12 months", "ufsMayo"] },
  { n: "Heinz Tomato Ketchup", m: /ketchup/, maker: "Kraft Heinz", open: { d: 56, f: 1, t: "Label: refrigerate once open and eat within eight weeks", s: "which" } },
  { n: "Colman's English Mustard", m: /mustard/, maker: "Unilever", contains: ["Mustard, wheat (gluten)", "brColman"], open: { d: 90, f: 1, t: "Refrigerate after opening and use within 3 months", s: "brColman" } },
];
// Every kind of spirit is distilled: in UK allergen law, cereals used for distillates don't count as gluten (shown on
// every spirit's card). Not a reason to say "gluten free": the guest decides.
const fxNorm = (s) => ` ${String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9()]+/g, " ").trim()} `;
// The facts for a name, or null. The longest name that matches wins, so Red Bull Sugarfree isn't Red Bull.
function factOf(name) {
  const t = fxNorm(name).trim(), hits = FACTS.filter((f) => f.m.test(t) || fxNorm(f.n).trim() === t);
  return hits.sort((a, b) => b.n.length - a.n.length)[0] || null;
}
// The maker's once-opened days for a name, for date labels and Add something new: { d, f, t, src } or null.
function factKeep(name) { const f = factOf(name); return f?.open ? { ...f.open, n: f.n } : null; }

/* ---- The card: search anything we stock and see what the maker says ----
   Key facts first (size, strength, allergens, once opened and the use-by if it's opened today), the rest folded under
   More details, then where each fact came from. Anything with no facts yet still gets a card with what Bar Book knows
   (where it's counted, its date label), and says what's still to find, so a manager can read it off the pack. */
const FX_OFF = new Set(["Bar supplies", "Floor supplies"]);
// Everything we stock or date, once: the stock list, the line-up, Black Tap's date label list and the team's adds.
function fxAll() {
  const seen = new Map(), add = (n, g) => { const k = itNorm(n); if (!seen.has(k)) seen.set(k, { n, g }); else if (g && !seen.get(k).g) seen.get(k).g = g; };
  for (const [g, xs] of Object.entries(stockGroups())) if (!FX_OFF.has(g)) xs.forEach((n) => add(n, g));
  BT.forEach((x) => add(x.name, x.grp));
  for (const side of Object.keys(LABEL_IDEAS)) for (const [g, xs] of LABEL_IDEAS[side]) xs.forEach(([n]) => add(n, g));
  return [...seen.values()];
}
// How long it keeps once opened, the venue's own days first: a date label already set up, then Black Tap's list, then
// the maker, then what that kind of thing typically keeps.
function fxDays(name) {
  const lb = (LIVE.labels || []).find((x) => itNorm(x.item) === itNorm(name));
  if (lb?.life) return { d: lb.life, from: "venue", t: `Set on Labels (${lower(sideName(lb.side))})`, on: lb.on };
  for (const side of Object.keys(LABEL_IDEAS)) for (const [, xs] of LABEL_IDEAS[side]) { const x = xs.find(([n]) => itNorm(n) === itNorm(name)); if (x?.[1]) return { d: x[1], from: "venue", t: "Black Tap's own rule", on: true }; }
  const mk = factKeep(name);
  if (mk?.d) return { d: mk.d, from: "maker", t: mk.t, s: mk.s, on: fxNeedsLabel(name) };
  const k = itKeep(name);
  if (k?.days) return { d: k.days, from: "typical", t: k.say, on: fxNeedsLabel(name) };
  return mk ? { d: 0, from: "maker", t: mk.t, s: mk.s, on: fxNeedsLabel(name) } : k ? { d: 0, from: "typical", t: k.say, on: fxNeedsLabel(name) } : null;
}
// On Black Tap's date label list, or on Labels already.
function fxNeedsLabel(name) {
  const n = itNorm(name);
  if ((LIVE.labels || []).some((x) => itNorm(x.item) === n)) return (LIVE.labels || []).find((x) => itNorm(x.item) === n).on;
  return Object.values(LABEL_IDEAS).some((gs) => gs.some(([, xs]) => xs.some(([m]) => itNorm(m) === n)));
}
const fxSrcLink = (s) => (s && FX_SRC[s] ? ` <a class="fx-src" href="${esc(FX_SRC[s][1])}" target="_blank" rel="noopener" aria-label="Source: ${esc(FX_SRC[s][0])}">source</a>` : "");
const fxVal = (v) => (v ? `${esc(v[0])}${fxSrcLink(v[1])}` : "");
function fxCardHtml(name) {
  const f = factOf(name), g = itStock(name)?.group || fxAll().find((x) => itNorm(x.n) === itNorm(name))?.g || "";
  const days = fxDays(name), row = (ctRows(true) || []).find((r) => itNorm(r.item) === itNorm(name));
  const spirit = /^(Vodka|Gin|Rum and cachaça|Tequila and mezcal|Whiskey|Brandy|Spirits)$/.test(g);
  const al = [f?.contains && `<b>Maker says it contains:</b> ${fxVal(f.contains)}`, f?.may && `<b>May contain:</b> ${fxVal(f.may)}`, f?.none && `<b>The maker declares:</b> ${fxVal(f.none)}`, f?.gluten && `<b>Gluten, in the maker's words:</b> ${fxVal(f.gluten)}`].filter(Boolean);
  const use = days?.d ? `<b>Keeps ${nDays(days.d)} once opened</b> <span class="pill${days.from === "venue" ? " ok" : ""}">${{ venue: "Venue rule", maker: "Maker's guidance", typical: "Typical" }[days.from]}</span>
      <div class="fx-use">Opened today? Use by <b>${dayName(addDays(shiftDay(), days.d))}</b></div>` : "";
  const size = f?.size ? fxVal(f.size) : row?.size ? `${esc(row.size)}${row.guess ? " <span class=\"pill\">not off the label yet</span>" : ""}` : "";
  const weight = row && (row.f || row.pw) ? (row.u === "bottle" ? `Full ${row.f} g, empty ${row.e} g` : `${row.pw} g in it${row.e ? `, packaging ${row.e} g` : ""}`) + (row.lock ? " · weighed by a manager" : " · estimate until a manager weighs a sealed one") : "";
  const key = [["Size", size], ["Strength", f?.abv && `${fxVal(f.abv)} ABV`], ["Allergens", al.join("<br>")], ["Once opened", use + (days?.t ? `<div class="s">${esc(days.t)}${fxSrcLink(days.s)}</div>` : "")],
    ["For the count", weight]].filter(([, v]) => v);
  const more = [["Maker", f?.maker && esc(f.maker)], ["What's in it", f?.ingr && fxVal(f.ingr)], ["Storage", f?.store && fxVal(f.store)], ["Shelf life sealed", f?.shelf && fxVal(f.shelf)],
    ...(f?.more || []).map(([t, v, s]) => [t, fxVal([v, s])]), ["Stock list", g && esc(g)], ["Counted at", row && esc([...new Set((ctRows(true) || []).filter((r) => r.item === row.item).map((r) => r.area))].join(", "))],
    spirit && ["Spirits and gluten", "Spirits are distilled. In UK allergen law, cereals used to make a distilled spirit are not counted as a gluten allergen. Flavoured ones and liqueurs can still contain allergens: check the label"]].filter((x) => x && x[1]);
  const boozy = spirit || /Liqueurs|Aperitifs|Beer|Cider|Wine|Draught|Bottles and cans/.test(g);
  const missing = [["Size", size], ["Strength", !boozy || f?.abv], ["What's in it", f?.ingr], ["Allergens", al.length || spirit], ["Once opened", days]].filter(([, v]) => !v).map(([t]) => t);
  const srcs = [...new Set([f?.size, f?.abv, f?.ingr, f?.contains, f?.may, f?.none, f?.gluten, f?.store, f?.shelf, ...(f?.more || []).map((x) => [0, x[2]]), f?.open && [0, f.open.s]].filter(Boolean).map((x) => x[1]).filter((s) => FX_SRC[s]))];
  const bt = BT.find((x) => itNorm(x.name) === itNorm(name) || itNorm(MK.byKey.get(x.k)?.n || "") === itNorm(name)), uses = bt ? btUses(bt.k) : 0;
  return `<div class="fx-card">
    <div class="fx-h"><h2 id="sh-name" translate="no">${esc(f?.n || name)}</h2>${days?.on ? `<span class="pill wait">Needs a date label</span>` : ""}</div>
    ${f && f.n !== name ? `<p class="s" translate="no">On our lists as ${esc(name)}</p>` : ""}
    ${key.length ? `<dl class="bt-dl fx-dl">${key.map(([t, v]) => `<div><dt>${t}</dt><dd>${v}</dd></div>`).join("")}</dl>` : `<p class="note">Nothing from the maker on file yet.</p>`}
    ${al.length ? `<p class="note fx-warn">Always check the label on the bottle or pack in your hand: recipes change.</p>` : ""}
    ${bt?.note ? `<p class="bt-note" translate="no">${esc(bt.note)}</p>` : ""}
    ${uses ? `<button class="chip" data-fx-uses="${esc(bt.k)}">Drinks with it <small>${uses}</small></button>` : ""}
    ${more.length ? `<details class="fx-more"><summary>More details</summary><dl class="bt-dl fx-dl">${more.map(([t, v]) => `<div><dt>${t}</dt><dd>${v}</dd></div>`).join("")}</dl></details>` : ""}
    ${missing.length ? `<details class="fx-more"><summary>Not found yet: ${missing.length}</summary><p class="note">${esc(missing.join(", "))}. No maker page we checked prints ${missing.length === 1 ? "it" : "them"}. Read ${missing.length === 1 ? "it" : "them"} off the pack${LIVE.admin ? ", and set the days on Labels and the weights in Set up the count" : " and tell a manager"}.</p></details>` : ""}
    ${srcs.length ? `<details class="fx-more"><summary>Where this comes from</summary><ul class="fx-srcs">${srcs.map((s) => `<li><a href="${esc(FX_SRC[s][1])}" target="_blank" rel="noopener">${esc(FX_SRC[s][0])}</a></li>`).join("")}</ul><p class="note">All checked ${FX_DAY}.</p></details>` : ""}
  </div>`;
}
let fxQ = "", fxCur = "";
function fxListHtml() {
  const q = fxNorm(fxQ).trim(), xs = fxAll().filter((x) => !q || fxNorm(`${x.n} ${factOf(x.n)?.n || ""} ${x.g || ""}`).includes(q));
  const row = (x) => { const f = factOf(x.n), d = fxDays(x.n);
    return `<button class="gd-row" data-fx-open="${esc(x.n)}"><span><b translate="no">${esc(x.n)}</b><small>${esc([f?.contains && `Contains ${f.contains[0]}`, d?.d && `keeps ${nDays(d.d)} opened`, !f && "no maker facts yet"].filter(Boolean).join(" · ") || (x.g || ""))}</small></span><i>›</i></button>`; };
  return xs.length ? azHtml(xs, (x) => x.n, row, 15) : `<p class="note">Nothing called that. ${LIVE.me ? `<button class="linkbtn" data-fx-new="${esc(fxQ)}">Add it with Add something new ›</button>` : ""}</p>`;
}
// The page: a search over everything, or one product's card. Opening one from elsewhere (Find, the line-up, a label)
// goes straight to its card, and Back goes back to where you were.
function openFacts(name = "") {
  if ($("#sheet").hidden) lastFocus = document.activeElement;
  fxCur = name;
  $("#sheet").innerHTML = `<div class="sheet-top"><div class="bar1"><button class="back" id="sh-close">‹ Back</button><span class="t">${name ? "Product facts" : "Everything we stock"}</span><span></span></div></div>
    <div class="gut fx">${name ? fxCardHtml(name) + `<button class="btn wide" data-fx-list>Everything we stock</button>` : `
      <p class="lead">Search anything we stock: what the maker says about its size, strength, allergens and how long it keeps once opened, and its use-by if you open one today.</p>
      <div class="search"><input id="fx-q" type="search" placeholder="Search: Baileys, oat milk, chocolate sauce" autocomplete="off" spellcheck="false" enterkeyhint="search" aria-label="Search everything we stock" value="${esc(fxQ)}"></div>
      <div id="fx-out">${fxListHtml()}</div>`}</div>`;
  showSheet(false); $("#sheet").scrollTop = 0;
}
document.addEventListener("input", (e) => { if (e.target.id !== "fx-q") return; fxQ = e.target.value; $("#fx-out").innerHTML = fxListHtml(); });
document.addEventListener("click", (e) => {
  const o = e.target.closest("[data-fx-open]"); if (o) { haptic(); if (!$("#help").hidden) helpClose(); openFacts(o.dataset.fxOpen); return; }
  if (e.target.closest("[data-fx-list]")) { haptic(); openFacts(""); return; }
  const u = e.target.closest("[data-fx-uses]"); if (u) { closeSheet(); mk.pick = [{ k: u.dataset.fxUses }]; mk.fromBar = false; mk.edit = null; mk.pane = "make"; mkSave(); show("make"); renderMaker(); window.scrollTo(0, 0); return; }
  const nw = e.target.closest("[data-fx-new]"); if (nw) { closeSheet(); itOpen = true; openAt("count"); setTimeout(() => { $("#it-add")?.scrollIntoView({ block: "start" }); if (nw.dataset.fxNew) itLook(nw.dataset.fxNew); }, 120); }
});
// For Find: products whose name (or maker's name) has every word typed. FX_ASK words are the question, not the product.
const FX_ASK = /^(allergens?|allergy|allergies|ingredients?|expiry|expires?|keeps?|label|labels|size|weight|abv|strength|contains?|opened|use|by|facts?)$/;
function fxFind(hit) { return fxAll().filter((x) => hit(`${x.n} ${factOf(x.n)?.n || ""}`)).slice(0, 4); }
document.head.insertAdjacentHTML("beforeend", `<style>
.fx-h{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}.fx-h h2{margin:0}
.fx-dl div{grid-template-columns:96px 1fr}.fx-dl dd .s{color:var(--muted);font-size:13.5px;margin-top:2px}
.fx-use{margin-top:4px;padding:6px 10px;border-radius:10px;background:var(--surface);border:1px solid var(--brass);display:inline-block}
.fx-warn{color:var(--warn)}
.fx-more{margin:10px 0;border-top:1px solid var(--line);padding-top:8px}.fx-more summary{font-weight:700;cursor:pointer;min-height:36px;display:flex;align-items:center}
.fx-src{font-size:12.5px;color:var(--brass);margin-left:4px}.fx-srcs{margin:6px 0;padding-left:18px;font-size:14px}.fx-srcs li{padding:3px 0}.fx-srcs a{color:var(--brass)}
.fx .chip small{color:var(--muted);margin-left:4px}
</style>`);
