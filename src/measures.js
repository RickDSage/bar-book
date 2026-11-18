/* ---------- What a full one is: every bottle and pack the bar stocks, filled in ----------
   So a weight on the kitchen scale turns straight into ml, and nobody has to type sizes in. Each bottle has its size,
   the empty bottle's weight and how heavy its liquid is (a liqueur with sugar weighs more than water; a spirit less), and
   the full weight is worked out from those. Each pack has what one of them is, and where it can be weighed, what's in it
   and what the packaging weighs.
   Sizes: from the UK label (the brand, or the trade and retail listings of the same product: Matthew Clark, LWC, Tesco,
   The Whisky Exchange). 70 cl is the UK size for spirits; a size the label doesn't settle (a house bottle, a brand
   that isn't named) is marked as a guess.
   Weights: no brand publishes an empty bottle's weight, so every one here is an estimate: from published tare lists for
   the same bottle in 75 cl (scaled to 70 cl) where there is one, else from the bottle's build (a heavy base, a decanter).
   Liquid weights: published specific gravities (Smirnoff 0.950, Tanqueray 0.937, Kahlúa 1.079, Baileys 1.057, Cointreau
   1.039, Campari 1.066, Chambord 1.130, Archers 1.103, Malibu 1.044, Grenadine 1.287), else from strength and sugar.
   A manager corrects any of them in one go by weighing a sealed bottle (the empty weight follows from it), or both
   weights in Set up the count. What a manager sets always wins and is shown as checked. */
// Bottles: name: [ml, empty bottle in grams, grams per ml of what's in it, 1 if the size is off the label].
var CT_BOTTLE = {
  // Vodka
  "Smirnoff": [700, 420, 0.952, 1], "Smirnoff Vanilla": [700, 440, 0.955, 1], "Smirnoff Miami Peach": [700, 440, 0.98, 1],
  "Grey Goose": [700, 780, 0.95, 1], "Belvedere Blackberry & Lemongrass": [700, 600, 0.953, 1],
  "Cîroc Red Berry": [700, 680, 0.955, 1], "Cîroc Apple": [700, 680, 0.955, 1], "Cîroc Pineapple": [700, 680, 0.955, 1], "Cîroc Mango": [700, 680, 0.955, 1],
  "Chase Marmalade": [700, 620, 0.955, 1], "Chase Rhubarb": [700, 620, 0.955, 1],
  // Gin
  "Tanqueray": [700, 530, 0.937, 1], "Tanqueray Flor de Sevilla": [700, 530, 0.955, 1], "Drumshanbo Gunpowder": [700, 720, 0.94, 1], "Roku": [700, 600, 0.94, 1],
  "Monkey 47": [500, 480, 0.935, 1], "Aviation": [700, 560, 0.94, 1], "The Botanist": [700, 750, 0.935, 1], "Cygnet": [700, 600, 0.94, 1], "Brockmans": [700, 620, 0.948, 1],
  // Rum and cachaça
  "Captain Morgan White": [700, 390, 0.957, 1], "Captain Morgan Spiced Gold": [700, 400, 0.962, 1], "Captain Morgan Dark": [700, 400, 0.955, 1],
  "Kraken": [700, 640, 0.965, 1], "Zacapa 23": [700, 700, 0.975, 1], "52North Spiced": [700, 550, 0.96, 1], "Malibu": [700, 560, 1.044, 1], "Abelha cachaça": [700, 600, 0.952, 1],
  // Tequila and mezcal
  "El Jimador Blanco": [700, 520, 0.951, 1], "El Jimador Reposado": [700, 520, 0.951, 1], "Don Julio Blanco": [700, 640, 0.95, 1], "Don Julio Añejo": [700, 630, 0.95, 1],
  "Don Julio 1942": [700, 1050, 0.95, 1], "Clase Azul Reposado": [700, 1350, 0.95, 1], "Amarás Mezcal": [700, 600, 0.945, 1],
  // Whiskey
  "Jack Daniel's": [700, 460, 0.95, 1], "Jameson": [700, 510, 0.95, 1], "Buffalo Trace": [700, 560, 0.948, 1], "Bulleit": [700, 600, 0.94, 1], "Bulleit Rye": [700, 600, 0.94, 1],
  "Elijah Craig": [700, 560, 0.937, 1], "Michter's": [700, 650, 0.94, 1], "Johnnie Walker Black": [700, 480, 0.948, 1], "Johnnie Walker Blue": [700, 620, 0.948, 1],
  "Talisker 10": [700, 520, 0.94, 1], "Port Charlotte 10": [700, 600, 0.93, 1], "Glenmorangie Signet": [700, 900, 0.94, 1], "Hakushu 12": [700, 560, 0.945, 1],
  "Hibiki Harmony": [700, 780, 0.945, 1], "Sheep Dog Peanut Butter": [700, 470, 0.99, 1],
  // Brandy
  "Martell VS": [700, 480, 0.955, 1], "Courvoisier VSOP": [700, 540, 0.955, 1], "Hennessy XO": [700, 900, 0.955, 1], "Rémy Martin XO": [700, 570, 0.955, 1], "Avallen Calvados": [700, 560, 0.952, 1],
  // Liqueurs and vermouth
  "Aperol": [700, 480, 1.04, 1], "Campari": [700, 460, 1.066, 1], "Sarti Rosa": [700, 480, 1.04, 1], "Martini Rosso": [750, 530, 1.05, 1], "Martini Extra Dry": [750, 530, 1.0, 1],
  "Pimm's": [700, 500, 1.0, 1], "Cointreau": [700, 720, 1.039, 1], "Grand Marnier": [700, 640, 1.03, 1], "Kahlúa": [700, 580, 1.079, 1], "Baileys": [700, 630, 1.057, 1],
  "Disaronno": [700, 770, 1.08, 1], "Frangelico": [700, 520, 1.065, 1], "Chambord": [700, 520, 1.13, 1], "Heering Cherry": [700, 520, 1.07, 1], "Luxardo Limoncello": [700, 480, 1.05, 1],
  "Midori": [700, 640, 1.05, 1], "Passoa": [700, 520, 1.09, 1], "Archers": [700, 460, 1.103, 1], "Apple liqueur": [700, 500, 1.06, 0], "Ancho Reyes": [700, 560, 1.02, 1],
  "Yellow Chartreuse": [700, 550, 1.04, 1], "Jägermeister": [700, 600, 1.007, 1], "Absinthe": [700, 520, 0.9, 0], "Crème de violette": [500, 420, 1.12, 0], "Maraschino": [700, 600, 1.1, 1],
  // Wine
  "Prosecco bottle": [750, 560, 0.99, 1],
  // Syrups and bitters: Monin's 70 cl glass; Coco Real's 50 cl squeezy bottle (595 g in it)
  "Sugar syrup": [700, 460, 1.33, 0], "Vanilla syrup": [700, 460, 1.32, 1], "Marshmallow syrup": [700, 460, 1.32, 1], "Orgeat": [1000, 600, 1.3, 1], "Grenadine": [700, 460, 1.287, 1],
  "Elderflower cordial": [700, 460, 1.25, 0], "Honey syrup": [700, 460, 1.3, 0], "Coco Real": [500, 60, 1.19, 1],
  "Angostura bitters": [200, 230, 0.99, 1], "Peychaud's bitters": [148, 200, 1.0, 1], "Cocoa bitters": [100, 160, 0.96, 0],
  // Juices: Eager 1 litre (facts.js), the fresh citrus in the house's own bottles
  "Lime juice": [1000, 60, 1.03, 0], "Lemon juice": [1000, 60, 1.03, 0], "Orange juice": [1000, 35, 1.045, 1], "Pineapple juice": [1000, 35, 1.05, 1], "Cranberry juice": [1000, 35, 1.04, 1],
  "Apple juice": [1000, 35, 1.045, 1], "Grapefruit juice": [1000, 35, 1.04, 1], "Tomato juice": [1000, 35, 1.03, 1],
  // Salted caramel: DaVinci, but which one (the 2.5 kg sauce or the 1 litre syrup) isn't known yet, so it stays a guess
  "Salted caramel sauce": [1000, 70, 1.3, 0],
};
// Packs: name: [what one is, grams in it, grams of packaging, 1 if the size is off the label]. Grams only where a
// kitchen scale (up to 5 kg) can weigh an open one.
var CT_PACK = {
  "Stella bottles": ["330 ml bottle", 0, 0, 1], "Corona bottles": ["330 ml bottle", 0, 0, 1], "Corona Cero": ["330 ml bottle", 0, 0, 1], "San Miguel 0,0": ["330 ml bottle", 0, 0, 1],
  "Kopparberg Strawberry & Lime (bottle)": ["500 ml bottle", 0, 0, 1], "Kopparberg Mixed Fruit (bottle)": ["500 ml bottle", 0, 0, 1],
  "Coke": ["7 litre bag-in-box", 0, 0, 1], "Coke Zero": ["7 litre bag-in-box", 0, 0, 1], "Diet Coke": ["7 litre bag-in-box", 0, 0, 1],
  "Coke bottles": ["330 ml glass bottle", 0, 0, 1], "Coke Zero bottles": ["330 ml glass bottle", 0, 0, 1], "Diet Coke bottles": ["330 ml glass bottle", 0, 0, 1],
  // DaVinci Gourmet 500 g squeeze bottles (Kerry's specs): weighed like a pack, the bottle and cap an estimate
  "Strawberry sauce": ["500 g DaVinci squeeze bottle", 500, 40, 1], "Raspberry sauce": ["500 g DaVinci squeeze bottle", 500, 40, 1], "Chocolate sauce": ["500 g DaVinci squeeze bottle", 500, 40, 1],
  "Red Bull": ["250 ml can", 0, 0, 1], "Red Bull Sugarfree": ["250 ml can", 0, 0, 1], "Crodino": ["175 ml bottle", 0, 0, 1],
  "Tonic": ["200 ml Fever-Tree bottle", 0, 0, 1], "Light tonic": ["200 ml Fever-Tree bottle", 0, 0, 1], "Ginger beer": ["200 ml Fever-Tree bottle", 0, 0, 1], "Ginger ale": ["200 ml Fever-Tree bottle", 0, 0, 1],
  "Jarritos Guava": ["370 ml bottle", 0, 0, 1], "Jarritos Mandarin": ["370 ml bottle", 0, 0, 1], "Jarritos Pineapple": ["370 ml bottle", 0, 0, 1],
  "Jarritos Grapefruit": ["370 ml bottle", 0, 0, 1], "Jarritos Strawberry": ["370 ml bottle", 0, 0, 1], "Jarritos Lime": ["370 ml bottle", 0, 0, 1],
  "Still water, large": ["750 ml bottle", 0, 0, 0], "Still water, small": ["330 ml bottle", 0, 0, 0], "Sparkling water, large": ["750 ml bottle", 0, 0, 0], "Sparkling water, small": ["330 ml bottle", 0, 0, 0],
  "Whole milk": ["2 pint (1.14 litre) bottle", 1170, 40, 0], "Oat milk": ["1 litre carton", 1030, 30, 0], "Double cream": ["1 litre carton", 980, 35, 0],
  "Egg whites": ["1 kg carton", 1000, 35, 0], "Funkin purées": ["1 kg pouch", 1000, 30, 1], "Espresso beans": ["1 kg bag", 1000, 15, 0],
  "Ice cream": ["4 litre tub", 2200, 200, 0], "Vegan ice cream": ["4 litre tub", 2200, 200, 0],
};
// The full weight a bottle comes to: the empty one plus what's in it.
const ctFullG = (ml, e, d) => Math.round(e + ml * d);
