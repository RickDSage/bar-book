/* ---------- The food menu, for guests (food.js) ----------
   Black Tap London Soho's food menu, copied from blacktap.com/restaurant-menu/london-soho on 18 Nov 2026: names and
   what's in them only. No prices (they change) and no allergen or diet claims beyond the menu's own (vegan bun and shakes) and Derek's (the chicken is halal, the beef is not): allergy questions go to the
   allergy card and a manager with the kitchen's allergen chart. Shown only on the guest screen, in the guest's
   language (section names by hand, the rest live when live translation is on). Staff fill gaps in the menu here.
   [section, [[name, what's in it], …]] */
const FOOD = [
  ["Snacks", [
    ["Hot fried pickles", "with spiced buttermilk-dill", 7.5],
    ["Fried mozzarella", "smoky chipotle tomato sauce", 12],
    ["Truffle and black garlic spinach dip", "black garlic, truffle, parmesan, spinach, cream, served with fried naan", 12],
    ["Queso and chips", "zesty cheese sauce with warm tortilla chips", 8],
    ["Guac and chips", "smashed avocado, pico de gallo, coriander, spring onion, with salsa verde", 8],
    ["Buttermilk fried chicken tenders", "served with house buttermilk-dill, Korean BBQ and lime honey mustard", 12],
    ["Teriyaki broccoli", "ginger, garlic, sesame seeds, spring onion", 8],
    ["Caesar salad", "lettuce, shaved parmesan, croutons, Caesar dressing", 7],
    ["House salad", "lettuce, tomato, cucumber, pickled onion, house vinaigrette", 7],
    ["Rocket salad", "rocket, roasted tomatoes, parmesan, house vinaigrette", 7],
  ]],
  ["Wings", [
    ["Korean BBQ wings", "6 pieces: sweet and spicy BBQ, spring onion, sesame seeds, lime, with house buttermilk-dill", 13],
    ["Black Tap Hot wings", "6 pieces: spicy dry rub, with house buttermilk-dill", 13],
    ["Mexican Hot wings", "6 pieces: spicy hot sauce, blue cheese crumbles, spring onion, with blue cheese dressing", 13],
    ["Texas BBQ wings", "6 pieces: sweet and smoky BBQ, spring onion, with house buttermilk-dill", 13],
  ]],
  ["Burgers", [
    ["The All-American Burger", "burger, American cheese, special sauce", 20],
    ["The Texan", "burger, bacon, aged cheddar, crispy onion ring, BBQ sauce, mayo", 22],
    ["The Champ", "wagyu burger, house buttermilk-dill, blue cheese, rocket", 26],
    ["The Wagyu Steakhouse Burger", "wagyu burger, pepper jack cheese, crispy onions, A1 sauce, roasted garlic mayo", 26],
    ["The Falafel Burger", "falafel burger, vegan feta, pickled onions, hummus, tahini, coriander, parsley, wholewheat vegan bun", 17],
    ["The Black Truffle Burger", "wagyu burger, havarti cheese, rocket, truffle-yuzu vinaigrette, black garlic peppercorn aioli, shaved parmesan, truffle oil", 26],
    ["The French Onion Burger", "burger, provolone, parmesan, simmered onions, French onion broth, roasted garlic mayo", 21],
    ["Zhoug Lamb Burger", "seasoned lamb patty, Swiss cheese, spicy pickled cucumbers and onion, parsley, zhoug yoghurt sauce", 23],
    ["Crispy Chicken", "buttermilk coleslaw, coriander, fresh lime, spicy mayo, Korean BBQ", 19],
    ["BT Hot Chicken", "crispy chicken, hot chilli oil, black garlic and chilli seasoning, pickle chips, buttermilk-dill, parsley", 19],
    ["The Cali Chicken", "grilled chicken, Swiss cheese, truffle mayo, sliced avocado, pickled onions, house vinaigrette, parsley", 19],
    ["BT Fish and Chips Sandwich", "battered cod, tartare sauce, malt vinegar and black pepper spice, black pepper fries, lemon and dill slaw", 19],
  ]],
  ["Salads", [
    ["Crispy Chicken Caesar", "crispy chicken, lettuce, roasted tomato, Moroccan spice, shaved parmesan, croutons, Caesar dressing", 16.5],
    ["Burger Chopped Salad", "burger, smoked salt and black pepper rub, bacon, cherry tomato, red onion, pickles, iceberg lettuce, spring onion, black pepper parmesan dressing", 16],
    ["Falafel Burger Salad", "house-made falafel, lettuce, cucumber, tomatoes, kalamata olives, hummus, vegan feta, pickled onions, tahini dressing", 16],
    ["Korean BBQ Chopped Salad", "crispy chicken tenders, Korean BBQ sauce, cherry tomatoes, cucumber, avocado, sweetcorn, red peppers, spring onions, crispy onions, buttermilk-dill dressing", 17],
    ["Texas Cobb Salad", "crispy chicken, lettuce, pickled onions, smoked bacon, peppers, hard-boiled eggs, avocado, cherry tomatoes, cotija cheese, chipotle buttermilk, coriander", 18],
  ]],
  ["Fries and rings", [
    ["Idaho fries", "with a house sauce of your choice", 7.5],
    ["Sweet potato fries", "with a house sauce of your choice", 8],
    ["Onion rings", "made here, with a house sauce of your choice", 7.5],
    ["Cheese fries", "zesty cheese sauce, parmesan, bacon, spring onion, sour cream and onion", 11],
    ["Black truffle fries", "smoked salt, black truffle, parmesan, black garlic peppercorn aioli", 11.5],
  ]],
  ["Sauces", [
    ["Special sauce", "", 1.5], ["Truffle mayo", "", 1.5], ["Chipotle mayo", "", 1.5], ["House buttermilk-dill", "", 1.5], ["Korean BBQ", "", 1.5],
    ["Texas BBQ", "", 1.5], ["Garlic mayo", "", 1.5], ["Salsa verde", "", 1.5],
  ]],
  // From the website's burger list: bun swaps and add-ons, ticked like anything else (no prices).
  ["Extras", [
    ["Gluten-free bun", "instead of the usual bun, on any burger", 1], ["Wholewheat vegan bun", "instead of the usual bun, on any burger", 1],
    ["Side salad instead of fries", "with a burger", 0], ["Onion rings instead of fries", "with a burger", 2], ["Sweet potato fries instead of fries", "with a burger", 1.5], ["Speciality fries instead of fries", "with a burger", 3.5],
    ["Fried egg", "", 1.5], ["Bacon", "", 2], ["Avocado", "", 2], ["Extra cheese", "", 1.5], ["Any house sauce", "", 1.5], ["Sautéed mushrooms", "", 1.5], ["Caramelised onions", "", 1.5],
  ]],
  ["Shakes", [
    ["Strawberry shake", "", 7.5], ["Chocolate shake", "", 7.5], ["Vanilla shake", "", 7.5], ["Oreo shake", "", 8.5],
    ["Strawberry cheesecake shake", "", 8.5], ["Lotus Biscoff shake", "", 8.5], ["Guinness shake", "", 9],
    ["Vegan shake", "any classic shake made with vegan ice cream and vegan whipped cream"],
  ]],
  ["CrazyShake®", [
    ["The Cookie Shake", "vanilla shake with a cookie-crumble rim, topped with a cookie sandwich, cookies, chocolate chips, whipped cream and chocolate sauce", 16],
    ["The CakeShake®", "cake batter shake with a sprinkles rim, topped with a slice of funfetti cake, whipped cream, sprinkles and a cherry", 16],
    ["Brooklyn Blackout", "chocolate shake with a chocolate-chip rim, topped with brownies, whipped cream and chocolate sauce", 16],
    ["Cookies 'n Cream Supreme", "Oreo shake with a crushed-Oreo rim, topped with a cookies and cream sandwich, whipped cream and chocolate sauce", 16],
    ["Cotton Candy", "strawberry shake with a sprinkles rim, topped with a lollipop, rock candy, whipped cream and candy floss", 16],
    ["New Yorker", "strawberry shake with a biscuit-crumb rim, topped with a slice of strawberry cheesecake, whipped cream and a fresh strawberry", 16],
    ["Jammy Dodger", "raspberry shake with a Jammy Dodger rim, topped with a giant Jammy Dodger, raspberry sauce, whipped cream and fresh raspberries", 16],
    ["Guinness CakeShake®", "Guinness chocolate shake with a white-chocolate rim, topped with Guinness chocolate cake, half a brownie, whipped cream and chocolate sauce", 16],
  ]],
];
// Not on the website, so staff tell Derek and he adds them here: desserts other than shakes, hot drinks (coffee, tea),
// a children's menu, and anything only on the printed menu or the night's specials.
const FOOD_NOTE = "Burgers come with fries, lettuce, tomato and a pickle. Ask us for a side salad, onion rings or other fries instead.";
// Drink prices from the same page (18 Nov 2026), for the guest menu only (the staff app shows no prices). Draught
// beer is a pint. Left out where the website's product isn't clearly the same as ours (waters, wine by the glass,
// Sprite, Fanta, Stella bottles): those show no price and the till has it.
const DRINK_PRICE = {
  "London Cosmo": 14, "Uptown Hustle": 14, "Salted Caramel Buzz": 14, "Cali Heatwave": 14.75, "West Coast Love": 14, "The Paddington": 14,
  "Marshmallow Boulevard": 14, "The Rockefeller": 14.75,
  Guinness: 7.9, Corona: 7.7, Stella: 7.1, "Goose Island": 7.9, Bud: 7.1, "Signature Roadie": 7.9, "San Miguel": 7.4, "Camden Hells": 7.8,
  "Camden Off Menu IPA": 7.8, "Kopparberg Apple (draught)": 7.2, "Corona bottles": 6, "Corona Cero": 5.5, "Kopparberg Strawberry & Lime (bottle)": 7,
  "Kopparberg Mixed Fruit (bottle)": 7, "Kopparberg Mixed Fruit 0%": 6.7, "Prosecco bottle": 38,
  Coke: 3.5, "Diet Coke": 3.5, "Coke bottles": 4, "Coke Zero bottles": 4, "Diet Coke bottles": 4, Lemonade: 4, "Red Bull": 4.5, "Red Bull Sugarfree": 4.5,
  Tonic: 4, "Light tonic": 4, "Ginger beer": 4, "Ginger ale": 4,
};
// What a guest's list adds up to. The service charge is optional and the till is always right.
const FOOD_PRICE = new Map(FOOD.flatMap(([, xs]) => xs.filter((x) => x[2] != null).map((x) => [x[0], x[2]])));
const PRICE_AS_OF = "18 Nov 2026", SERVICE_PC = 13.5;
const gPrice = (n) => FOOD_PRICE.get(n) ?? DRINK_PRICE[n];
const gMoney = (x) => "£" + (Number.isInteger(x) ? x : x.toFixed(2));
