// Black Tap Soho's food, shakes and drinks, for the Allergens tab. Names and descriptions come from the Soho menu on
// blacktap.com and the Soho Toast page (25 Oct 2026). Neither publishes allergens, so none are set here: a manager
// confirms each item's allergens in the app from the kitchen's own allergen sheet (menuAllergens in firestore.rules).
// Each item's id is its section key and name, so two items with the same name (Korean BBQ wings and dip) stay apart.
// Changing an item's name or section changes its id and drops what was confirmed for it, so add new items instead.
const SECTIONS = [
  ["food", "snacks", "Snacks", [
    ["Hot Fried Pickles", "with spiced buttermilk-dill"],
    ["Fried Mozzarella", "smoky chipotle tomato sauce"],
    ["Truffle & Black Garlic Spinach Dip", "black garlic, truffle, parmesan, spinach, cream, served with fried naan"],
    ["Queso & Chips", "zesty cheese sauce with warm tortilla chips"],
    ["Guac & Chips", "smashed avocado, pico de gallo, cilantro, scallion with salsa verde"],
    ["Buttermilk Fried Chicken Tenders", "served with house buttermilk-dill, korean bbq & lime honey mustard"],
    ["Teriyaki Broccoli", "ginger, garlic, sesame seeds, scallion"],
    ["Caesar Salad", "lettuce, shaved parmesan, croutons, caesar dressing"],
    ["House Salad", "lettuce, tomato, cucumber, pickled onion, house vinaigrette"],
    ["Rocket Salad", "rocket, roasted tomatoes, parmesan cheese, house vinaigrette"],
  ]],
  ["food", "wings", "Wings", [
    ["Korean BBQ Wings", "sweet & spicy bbq, scallion, sesame seeds, lime, served with house buttermilk-dill"],
    ["Black Tap Hot Wings", "spicy dry rub served with house buttermilk-dill"],
    ["Mexican Hot Wings", "spicy hot sauce, blue cheese crumbles, scallion, served with blue cheese dressing"],
    ["Texas BBQ Wings", "sweet & smokey bbq, scallion, served with house buttermilk-dill"],
  ]],
  ["food", "burgers", "Craft burgers", [
    ["The All-American Burger", "burger, american cheese, special sauce"],
    ["The Texan", "burger, bacon, aged cheddar, crispy onion ring, bbq sauce, mayo"],
    ["The Champ", "wagyu burger, house buttermilk-dill, blue cheese, rocket"],
    ["The Wagyu Steakhouse Burger", "wagyu burger, pepper jack cheese, crispy onions, A1 sauce, roasted garlic mayo"],
    ["The Falafel Burger", "falafel burger, vegan feta, pickled onions, hummus, tahini, cilantro, parsley, whole wheat vegan bun"],
    ["The Black Truffle Burger", "wagyu burger, havarti cheese, rocket, truffle-yuzu vinaigrette, black garlic peppercorn aioli, shaved parmesan, truffle oil"],
    ["The French Onion Burger", "burger, provolone, parmesan, simmered onions, french onion broth, roasted garlic mayo"],
    ["Zhoug Lamb Burger", "seasoned lamb patty, swiss cheese, spicy pickled cucumbers and onion, parsley, zhoug yogurt sauce"],
  ]],
  ["food", "sandwiches", "Sandwiches", [
    ["Crispy Chicken", "buttermilk coleslaw, cilantro, fresh lime, spicy mayo, korean bbq"],
    ["BT Hot Chicken", "crispy chicken, hot chili oil, black garlic and chili seasoning, pickle chips, buttermilk-dill, parsley"],
    ["The Cali Chicken", "grilled chicken, swiss, truffle mayo, sliced avocado, pickled onions, house vinaigrette, parsley"],
    ["BT Fish & Chips Sandwich", "battered cod, down east tartar sauce, malt vinegar & black pepper spice, black pepper fries, lemon & dill slaw"],
    ["Miso Spicy Chicken Sandwich", ""],
  ]],
  ["food", "salads", "Craft salads", [
    ["Crispy Chicken Caesar", "crispy chicken, lettuce, roasted tomato, moroccan spice, shaved parmesan, croutons, caesar dressing"],
    ["Burger Chopped Salad", "burger, smoked salt & black pepper rub, bacon, cherry tomato, red onion, kosher pickles, iceberg, scallion, black pepper parmesan dressing"],
    ["House-Made Falafel Burger Salad", "house-made falafel patty, lettuce, cucumber, tomatoes, kalamata olives, hummus, vegan feta, pickled onions, tahini dressing"],
    ["Korean BBQ Chopped Salad", "crispy chicken tenders, korean bbq sauce, cherry tomatoes, cucumber, avocado, sweet corn, red peppers, spring onions, crispy onions, buttermilk dill dressing"],
    ["Texas Cobb Salad", "crispy chicken, green leaf lettuce, pickled onions, smoked bacon, diced peppers, hard boiled eggs, avocado, cherry tomatoes, cotija cheese, chipotle buttermilk, cilantro"],
  ]],
  ["food", "fries", "Fries and rings", [
    ["Idaho Fries", ""],
    ["Sweet Potato Fries", ""],
    ["Housemade Onion Rings", ""],
    ["Cheese Fries", "zesty cheese sauce, parmesan, bacon, scallion, sour cream & onion"],
    ["Black Truffle Fries", "smoked salt, black truffle peel, parmesan, black garlic peppercorn aioli"],
  ]],
  ["food", "sauces", "Dips and house sauces", [
    ["Special Sauce", ""], ["Truffle Mayo", ""], ["Chipotle Mayo", ""], ["House Buttermilk-Dill", ""], ["Korean BBQ", ""],
    ["Texas BBQ", ""], ["Garlic Mayo", ""], ["Salsa Verde", ""], ["Mayo", ""], ["Lime Honey Mustard", ""], ["Blue Cheese Dressing", ""],
  ]],
  ["food", "extras", "Buns and add-ons", [
    ["Burger Bun", "the standard bun"], ["Gluten-Free Bun", ""], ["Whole Wheat Vegan Bun", ""], ["Fried Egg", ""], ["Bacon", ""], ["Avocado", ""],
    ["Extra Cheese", ""], ["Sautéed Mushrooms", ""], ["Caramelised Onions", ""],
  ]],
  ["food", "kids", "Kids", [
    ["Fish & Chips Kids", ""], ["Cheese Toastie & Chips Kids", ""], ["Chicken & Chips Kids", ""], ["The Mini", ""], ["Crispy Chicken Sandwich Kids", ""],
  ]],
  ["shakes", "classic", "Classic shakes", [
    ["Strawberry", ""], ["Chocolate", ""], ["Vanilla", ""], ["Oreo", ""], ["Strawberry Cheesecake", ""], ["Lotus Biscoff", ""], ["Guinness", ""],
  ]],
  ["shakes", "vegan", "Vegan shakes", [
    ["Vegan Chocolate", "vegan ice cream and vegan whipped cream"], ["Vegan Vanilla", "vegan ice cream and vegan whipped cream"],
    ["Vegan Strawberry", "vegan ice cream and vegan whipped cream"], ["Vegan Oreo", "vegan ice cream and vegan whipped cream"],
  ]],
  ["shakes", "crazy", "CrazyShakes", [
    ["The Cookie Shake", "vanilla cookie shake, vanilla frosted rim with cookie crumbles topped with a 'cookiewich', crumble cookies, chocolate chips, whipped cream & chocolate drizzle"],
    ["The CakeShake", "cake batter shake, vanilla frosted rim with rainbow sprinkles topped with a funfetti cake slice, whipped cream, rainbow sprinkles & a cherry"],
    ["Brooklyn Blackout", "chocolate shake, chocolate frosted rim with mini chocolate chips topped with brownies, whipped cream & chocolate drizzle"],
    ["Cookies 'n Cream Supreme", "oreo shake, vanilla frosted rim with crushed oreos topped with a 'cookies 'n cream' sandwich, crumbled oreo, whipped cream & chocolate drizzle"],
    ["Cotton Candy", "strawberry shake, vanilla frosted rim with blue, pink sprinkles topped with a pink lollipop, blue and pink rock candy, whipped cream & cotton candy"],
    ["New Yorker", "strawberry shake, vanilla frosted rim with crushed graham crackers, topped with a slice of strawberry cheesecake, whipped cream, fresh strawberry"],
    ["Jammy Dodger", "raspberry shake, vanilla frosted rim with crushed jammy dodgers cookies, topped with extra-large jammy dodgers cookie, raspberry sauce drizzle, whip cream, cookie crumbs, and fresh raspberries"],
    ["Guinness CakeShake", "guinness chocolate shake, vanilla frosted rim with white chocolate chips, topped with a slice of guinness chocolate cake, a half of a brownie, whipped cream & chocolate drizzle"],
  ]],
  ["shakes", "buzzy", "Buzzy shakes (with alcohol)", [
    ["Salted Dulce Booze Shake", ""], ["Espressotini Affogato Shake", ""],
  ]],
  ["drinks", "soft", "Soft drinks", [
    ["Coca-Cola", ""], ["Diet Coke", ""], ["Coke Zero", ""], ["Fanta Orange", ""], ["Sprite", ""], ["Sprite Zero", ""],
    ["Homemade Lemonade", ""], ["Homemade Iced Tea", ""], ["Fever-Tree Indian Tonic", ""], ["Fever-Tree Light Tonic", ""],
    ["Fever-Tree Mediterranean Tonic", ""], ["Fever-Tree Ginger Ale", ""], ["Fever-Tree Ginger Beer", ""], ["Red Bull", ""], ["Red Bull Sugar Free", ""],
    ["J2O Apple & Raspberry", ""], ["J2O Orange & Passion Fruit", ""], ["Appletiser", ""], ["Rubicon Pomegranate", ""],
    ["Soda & Lime Cordial", ""], ["Soda & Blackcurrant Cordial", ""], ["Orange Juice", ""], ["Apple Juice", ""], ["Pineapple Juice", ""],
    ["Cranberry Juice", ""], ["Tomato Juice", ""], ["Still Water", ""], ["Sparkling Water", ""],
  ]],
  ["drinks", "hot", "Hot drinks", [
    ["English Breakfast Tea", ""], ["Green Tea", ""], ["Espresso", ""], ["Americano", ""], ["Flat White", ""], ["Cappuccino", ""], ["Latte", ""],
  ]],
  ["drinks", "beer", "Beer and cider", [
    ["Guinness Stout", ""], ["Purity Pilsner", ""], ["Signature Haze Machine Pale", ""], ["Signature Roadie IPA", ""], ["Lost and Grounded Keller Pils", ""],
    ["Camden Hells", ""], ["Camden Off Menu IPA", ""], ["Camden Eazy IPA", ""], ["Goose Island Midway Session IPA", ""], ["Corona Extra", ""],
    ["San Miguel Especial", ""], ["Stella Artois", ""], ["Budweiser", ""], ["Kopparberg Crisp Apple", ""], ["Lost and Grounded Wanna Go to the Sun", ""],
    ["Signature Studio Lager", ""], ["Camden Pale", ""], ["Kopparberg Strawberry & Lime", ""], ["Kopparberg Mixed Fruit", ""], ["Stella Artois Gluten Free", ""],
    ["Athletic IPA 0%", ""], ["Athletic Upside Dawn 0%", ""], ["Athletic Lager 0%", ""], ["Big Drop Reef Point 0%", ""], ["Corona Cero 0%", ""],
    ["San Miguel 0%", ""], ["Kopparberg Mixed Fruit 0%", ""],
  ]],
  ["drinks", "wine", "Wine and fizz", [
    ["Prosecco", ""], ["Moët & Chandon Brut Réserve", ""], ["Veuve Clicquot Yellow Label", ""], ["Veuve Clicquot Rosé", ""],
    ["House White", ""], ["Down Under Chardonnay", ""], ["Waddling Duck Sauvignon Blanc", ""], ["House Rosé", ""], ["Quinson Côtes de Provence", ""],
    ["House Red", ""], ["Viña Cerrada Crianza Rioja", ""], ["La Grupa Malbec", ""],
  ]],
];
// Lower case, with every run of other characters turned into one dash, as everywhere else in the app.
const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const items = SECTIONS.flatMap(([tab, key, section, list]) => list.map(([name, desc]) => ({ id: `${key}-${slug(name)}`, tab, key, section, name, desc })));
const ids = items.map((x) => x.id);
if (new Set(ids).size !== ids.length) throw new Error("Duplicate menu item id");
module.exports = { sections: SECTIONS.map(([tab, key, section]) => ({ tab, key, section })), items };
