# Recipe spec v2 — real recipes, HelloFresh-style steps

App: a meal planner for a UK couple (Southampton) cooking dinner for 2. It plans a week so whole supermarket
packs get used up, prices the shop at Tesco/Sainsbury's/Asda/Aldi/Lidl, and computes calories and macros from
ingredient amounts. The couple's feedback on v1 was: recipes felt generic and "AI-written", steps too thin,
and they want proper treat food (burgers, fried chicken, pizza) alongside everyday meals.

## What makes a v2 recipe
1. **Based on a real, popular, well-reviewed recipe.** Use WebSearch (budget: at most 25 searches for your whole
   batch — search for a few dishes at once, e.g. "best fried chicken burger recipe BBC Good Food") to find
   dishes people actually cook and rate highly (BBC Good Food, Jamie Oliver, Nigella, Mob, HelloFresh UK,
   Gousto, Recipe Tin Eats, Serious Eats, Kenji, Delicious magazine, Hairy Bikers, Pinch of Nom, etc.).
   Use the source to get the dish, the flavour profile and sensible proportions right.
   **Never copy the source's wording.** Write the method entirely in your own words, adapted to 2 portions and
   to our ingredient catalogue. Record provenance privately in `basedOn` (it is not shown in the app).
2. **A dish people would get excited about.** A specific, appetising title the way a meal kit names it
   ("Crispy Buttermilk Chicken Burger with Sriracha Mayo & Slaw", not "Chicken Burger"). No filler dishes.
3. **HelloFresh-style steps.** 4–6 steps. Each step has a short imperative `title` ("Make the slaw",
   "Fry the chicken") and `text` of 2–4 sentences with concrete cues: heat level, times, what it should
   look like when it's done ("until golden and the juices run clear", "until the sauce coats the back of a
   spoon"). Step 1 is prep (oven on, kettle on, chop/grate/marinate). Cook steps in a sensible order so
   things finish together. Mention which pan/tray to use.
4. **Equipment** it needs, from: hob, oven, grill, microwave, air_fryer, slow_cooker, blender, food_processor.
   Only list what is genuinely required. If the recipe uses the oven or deep/shallow-frying for something an
   air fryer does well (chips, wedges, crispy chicken, wings, roast veg, halloumi, fish), add `airFryer`:
   one or two sentences giving the air-fryer method (temperature, time, shake/turn).
5. **Category**: `"everyday"` or `"treat"`. Treat = fakeaway / indulgent / weekend-comfort food
   (burgers, fried chicken, pizza, loaded fries, curry-house style, creamy pasta bakes, pies with pastry).
   Everyday = normal weeknight dinners. Both should taste great.
6. Realistic `time` (total minutes). At least half of your batch must be ≤ 30 min. Treats may be longer.

## Ingredients
Use the catalogue at /home/claude/mealplan/v2/data/catalogue_slim.json (id, name, unit, packs, staple).
`q` is in the catalogue unit (g, ml, each, clove). For 2 adults. Spices: 1 tsp ≈ 2 g; 1 tbsp oil ≈ 15 ml;
1 tbsp sauce/paste ≈ 15 g; rice for 2 ≈ 150 g; pasta ≈ 180 g. Tins are 400 g (half a tin = 200).
`t` is how the amount is shown ("1 tbsp", "½ tin", "2, thinly sliced").
Staples (staple:true) can be used freely. Prefer catalogue items, and reuse the high-waste ones (mince, chicken
thighs/breast, spinach, coriander, peppers, cream, yogurt, feta, halloumi, coconut milk, spring onions, wraps,
buns, tins) so packs get used up across a week.
If a real recipe genuinely needs something missing (buttermilk, pizza flour, dried yeast, pepperoni, cornflakes,
pickles, American mustard, BBQ sauce, gherkins, sriracha, brioche buns, hot dog rolls, etc.), add it to your
new-ingredients file with the same schema as catalogue_slim.json plus `tags` (e.g. ["dairy"], ["pork","meat"],
["gluten"]), real Tesco pack sizes, `life` (days unopened) and `keeps` (days once opened). Use generic snake_case
ids (`buttermilk`, `strong_white_flour`, `dried_yeast`, `pepperoni`, `bbq_sauce`, `sriracha`, `gherkins`,
`hot_dog_rolls`, `cornflakes`, `pizza_mozzarella`) so batches merge. Keep it to ≤ 10 new ingredients.
`swap`: on any ingredient that can be cooked separately or left out of one portion — always for mushrooms
(one partner won't eat them: e.g. "Fry the mushrooms in a separate pan and add them to one plate only"),
and where sensible for chilli, coriander, olives, feta. No people's names in it.

## Schema (one object per recipe)
```json
{
  "id": "am_buttermilk_chicken_burger",
  "title": "Crispy Buttermilk Chicken Burger with Sriracha Mayo & Slaw",
  "icon": "🍔",
  "cuisine": "American",                 // Italian | British | American | Mexican | Middle Eastern | Indian | Asian
  "category": "treat",                   // everyday | treat
  "protein": "chicken",                  // beef | pork | chicken | lamb | fish | prawns | veggie
  "time": 40,
  "servings": 2,
  "equipment": ["hob"],
  "airFryer": "Spray the coated chicken with oil and air-fry at 200°C for 14–16 min, turning halfway, until golden and cooked through.",
  "ingredients": [ {"i": "chicken_thighs", "q": 300, "t": "2 large thighs (300g)"}, ... ],
  "steps": [ {"title": "Marinate the chicken", "text": "..."}, ... ],
  "tags": ["fakeaway", "crispy"],        // optional: quick, one-pot, traybake, freezable, spicy, comfort, light, fakeaway, crispy, spicy, kid-friendly
  "basedOn": "BBC Good Food — Buttermilk fried chicken burger (4.6★, 300+ ratings)"
}
```

## Output
Write the JSON array to the recipes path you're given and new ingredients to the new-ingredients path
(write [] if none). Validate with node: both parse; every `i` exists in the catalogue or your new file;
servings 2; 4–6 steps each with title and text; equipment non-empty; ids unique with your prefix;
category is everyday/treat. Report back: count, ≤30-min count, treat count, new ingredient ids, searches used.
