/* ---------- The food menu, for guests (food.js) ----------
   Black Tap London Soho's food menu, copied from blacktap.com/restaurant-menu/london-soho on 18 Nov 2026: names and
   what's in them only. No prices (they change) and no allergen, vegan or diet claims: allergy questions go to the
   allergy card and a manager with the kitchen's allergen chart. Shown only on the guest screen, in the guest's
   language (section names by hand, the rest live when live translation is on). Staff fill gaps in the menu here.
   [section, [[name, what's in it], …]] */
const FOOD = [
  ["Snacks", [
    ["Hot fried pickles", "with spiced buttermilk-dill"],
    ["Fried mozzarella", "smoky chipotle tomato sauce"],
    ["Truffle and black garlic spinach dip", "black garlic, truffle, parmesan, spinach, cream, served with fried naan"],
    ["Queso and chips", "zesty cheese sauce with warm tortilla chips"],
    ["Guac and chips", "smashed avocado, pico de gallo, coriander, spring onion, with salsa verde"],
    ["Buttermilk fried chicken tenders", "served with house buttermilk-dill, Korean BBQ and lime honey mustard"],
    ["Teriyaki broccoli", "ginger, garlic, sesame seeds, spring onion"],
    ["Caesar salad", "lettuce, shaved parmesan, croutons, Caesar dressing"],
    ["House salad", "lettuce, tomato, cucumber, pickled onion, house vinaigrette"],
    ["Rocket salad", "rocket, roasted tomatoes, parmesan, house vinaigrette"],
  ]],
  ["Wings", [
    ["Korean BBQ wings", "6 pieces: sweet and spicy BBQ, spring onion, sesame seeds, lime, with house buttermilk-dill"],
    ["Black Tap Hot wings", "6 pieces: spicy dry rub, with house buttermilk-dill"],
    ["Mexican Hot wings", "6 pieces: spicy hot sauce, blue cheese crumbles, spring onion, with blue cheese dressing"],
    ["Texas BBQ wings", "6 pieces: sweet and smoky BBQ, spring onion, with house buttermilk-dill"],
  ]],
  ["Burgers", [
    ["The All-American Burger", "burger, American cheese, special sauce"],
    ["The Texan", "burger, bacon, aged cheddar, crispy onion ring, BBQ sauce, mayo"],
    ["The Champ", "wagyu burger, house buttermilk-dill, blue cheese, rocket"],
    ["The Wagyu Steakhouse Burger", "wagyu burger, pepper jack cheese, crispy onions, A1 sauce, roasted garlic mayo"],
    ["The Falafel Burger", "falafel burger, vegan feta, pickled onions, hummus, tahini, coriander, parsley, wholewheat vegan bun"],
    ["The Black Truffle Burger", "wagyu burger, havarti cheese, rocket, truffle-yuzu vinaigrette, black garlic peppercorn aioli, shaved parmesan, truffle oil"],
    ["The French Onion Burger", "burger, provolone, parmesan, simmered onions, French onion broth, roasted garlic mayo"],
    ["Zhoug Lamb Burger", "seasoned lamb patty, Swiss cheese, spicy pickled cucumbers and onion, parsley, zhoug yoghurt sauce"],
    ["Crispy Chicken", "buttermilk coleslaw, coriander, fresh lime, spicy mayo, Korean BBQ"],
    ["BT Hot Chicken", "crispy chicken, hot chilli oil, black garlic and chilli seasoning, pickle chips, buttermilk-dill, parsley"],
    ["The Cali Chicken", "grilled chicken, Swiss cheese, truffle mayo, sliced avocado, pickled onions, house vinaigrette, parsley"],
    ["BT Fish and Chips Sandwich", "battered cod, tartare sauce, malt vinegar and black pepper spice, black pepper fries, lemon and dill slaw"],
  ]],
  ["Salads", [
    ["Crispy Chicken Caesar", "crispy chicken, lettuce, roasted tomato, Moroccan spice, shaved parmesan, croutons, Caesar dressing"],
    ["Burger Chopped Salad", "burger, smoked salt and black pepper rub, bacon, cherry tomato, red onion, pickles, iceberg lettuce, spring onion, black pepper parmesan dressing"],
    ["Falafel Burger Salad", "house-made falafel, lettuce, cucumber, tomatoes, kalamata olives, hummus, vegan feta, pickled onions, tahini dressing"],
    ["Korean BBQ Chopped Salad", "crispy chicken tenders, Korean BBQ sauce, cherry tomatoes, cucumber, avocado, sweetcorn, red peppers, spring onions, crispy onions, buttermilk-dill dressing"],
    ["Texas Cobb Salad", "crispy chicken, lettuce, pickled onions, smoked bacon, peppers, hard-boiled eggs, avocado, cherry tomatoes, cotija cheese, chipotle buttermilk, coriander"],
  ]],
  ["Fries and rings", [
    ["Idaho fries", "with a house sauce of your choice"],
    ["Sweet potato fries", "with a house sauce of your choice"],
    ["Onion rings", "made here, with a house sauce of your choice"],
    ["Cheese fries", "zesty cheese sauce, parmesan, bacon, spring onion, sour cream and onion"],
    ["Black truffle fries", "smoked salt, black truffle, parmesan, black garlic peppercorn aioli"],
  ]],
  ["Sauces", [
    ["Special sauce", ""], ["Truffle mayo", ""], ["Chipotle mayo", ""], ["House buttermilk-dill", ""], ["Korean BBQ", ""],
    ["Texas BBQ", ""], ["Garlic mayo", ""], ["Salsa verde", ""],
  ]],
  ["Shakes", [
    ["Strawberry shake", ""], ["Chocolate shake", ""], ["Vanilla shake", ""], ["Oreo shake", ""],
    ["Strawberry cheesecake shake", ""], ["Lotus Biscoff shake", ""], ["Guinness shake", ""],
  ]],
  ["CrazyShake®", [
    ["The Cookie Shake", "vanilla shake with a cookie-crumble rim, topped with a cookie sandwich, cookies, chocolate chips, whipped cream and chocolate sauce"],
    ["The CakeShake®", "cake batter shake with a sprinkles rim, topped with a slice of funfetti cake, whipped cream, sprinkles and a cherry"],
    ["Brooklyn Blackout", "chocolate shake with a chocolate-chip rim, topped with brownies, whipped cream and chocolate sauce"],
    ["Cookies 'n Cream Supreme", "Oreo shake with a crushed-Oreo rim, topped with a cookies and cream sandwich, whipped cream and chocolate sauce"],
    ["Cotton Candy", "strawberry shake with a sprinkles rim, topped with a lollipop, rock candy, whipped cream and candy floss"],
    ["New Yorker", "strawberry shake with a biscuit-crumb rim, topped with a slice of strawberry cheesecake, whipped cream and a fresh strawberry"],
    ["Jammy Dodger", "raspberry shake with a Jammy Dodger rim, topped with a giant Jammy Dodger, raspberry sauce, whipped cream and fresh raspberries"],
    ["Guinness CakeShake®", "Guinness chocolate shake with a white-chocolate rim, topped with Guinness chocolate cake, half a brownie, whipped cream and chocolate sauce"],
  ]],
];
// Not on the website, so staff tell Derek and he adds them here: desserts other than shakes, hot drinks (coffee, tea),
// a children's menu, and anything only on the printed menu or the night's specials.
const FOOD_NOTE = "Burgers come with fries, lettuce, tomato and a pickle. Ask us for a side salad, onion rings or other fries instead.";
