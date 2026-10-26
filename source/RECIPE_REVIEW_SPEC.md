# Recipe review spec (v3)

You are reviewing one batch of dinner recipes for E&S Kitchen, a meal planner used by a UK couple cooking for 2.
They loved how easy HelloFresh cards are to follow. Feedback on the current recipes: steps sometimes cram too much
in; some ingredients (peas) have no swap even though one partner won't eat them; buying every spice at once is
expensive. Your job is a careful editorial pass, recipe by recipe — not a rewrite of the dishes.

Inputs
- Your batch: the recipes file you're given (JSON array; schema below).
- Ingredient catalogue: /home/claude/mealplan/v2/data/catalogue_current.json (id, name, unit, packs, staple, tags).
  `q` amounts are in the catalogue unit (g, ml, each, clove).

Output
- Write the reviewed array to the output path you're given (same order, same ids, same schema).
- Write a short change log to the log path you're given: one line per recipe you changed ("id: what changed").
- Validate with node (checks at the bottom). Report back: recipes changed, step counts before/after, swaps added,
  optional lines marked, any recipe you think should be dropped and why.

## What to check and fix in EVERY recipe

1. **Steps read like a HelloFresh card.**
   - 4 to 8 steps. Each step is ONE job at ONE station: "Prep the veg", "Cook the rice", "Fry the chicken",
     "Make the sauce", "Finish and serve". If a step does two or three separate jobs, split it. Use 7–8 steps only
     when the dish genuinely needs them; don't pad short recipes.
   - Each step: a short imperative `title` (2–5 words) and `text` of 2–4 short sentences (≤ 25 words each).
   - Say which pan/tray, the heat (low/medium/medium-high/high, oven °C fan), the time, and the cue for done
     ("until golden and the juices run clear", "until the sauce coats a spoon").
   - Step 1 is prep: oven/kettle on, then all chopping, grating and measuring, so later steps flow.
   - Make timing explicit where things overlap: "While the rice cooks, …". Things should finish together.
   - Use the same names as the ingredient list (don't say "shallot" if the list says brown onion). Use amounts in
     the text when it helps ("half the garlic", "the remaining 1 tbsp oil").
   - Plain British English. No chef jargon without a short explanation. No people's names.
2. **Ingredients and steps match.** Every ingredient in the list is used in a step, and every ingredient a step
   uses is in the list (add it from the catalogue, or reword the step). Amounts are realistic for 2 adults; `t`
   (display text) agrees with `q` and the unit. Fix obvious errors (e.g. 6 eggs where 2 are meant, 200 ml of oil to
   shallow-fry is fine but say "for frying"; if most of a frying oil is discarded say so in the step).
3. **Swaps** — one partner won't eat mushrooms; someone may not eat peas. Add a `swap` string (no names) to these
   lines whenever they can be cooked or served separately and added to one plate only:
   frozen_peas, sweetcorn, mushrooms, olives, capers, coriander, basil, rocket, spring_onions (as garnish),
   chilli_flakes / fresh or green chillies / jalapenos (as heat or garnish), feta, sun_dried_tomatoes,
   beansprouts, gherkins, pickles. Example peas swap: "Cook the peas in a small pan of boiling water for 3 min and
   stir them into one portion only." If the item is baked in and can't be separated (peas in a pie filling), you may
   still add a swap like "Leave the peas out and add an extra handful of spinach/sweetcorn instead" when it really
   works; otherwise leave no swap.
4. **Optional lines** — add `"opt": true` to lines the dish works without: garnishes and finishing touches (herbs to
   serve, chilli flakes to serve, lemon wedges, sesame seeds, a drizzle of honey/oil at the end), and a minor 3rd/4th
   spice used at ≤ 1 tsp when the main flavour is carried by others. Never mark the main protein, carb, sauce base or
   the defining spice/paste as optional. In the step text, say "(optional)" where it's used.
5. **Time** — `time` is realistic total minutes from starting prep to plating for a home cook. If the steps add up to
   more, raise it; keep weeknight dishes honest (a "25 min" recipe with a 25 min oven bake is not 25 min).
6. **Equipment** — `equipment` lists only what's needed (hob, oven, grill, microwave, air_fryer, slow_cooker, blender,
   food_processor). Keep `airFryer` notes accurate (temp, time, shake/turn).
7. **Keep**: id, cuisine, category (everyday/treat), protein, servings 2, icon, basedOn. You may tighten a title that
   is too long (aim ≤ 60 characters, keep it appetising and specific). Don't change the dish into a different one.
   Don't add new ingredient ids that aren't in the catalogue unless unavoidable; if you must, list them in your report
   with name, aisle, unit, Tesco pack size, life/keeps days, freeze, staple.

## Schema reminder
```json
{"id":"…","title":"…","icon":"🍝","cuisine":"Italian","category":"everyday","protein":"beef","time":35,"servings":2,
 "equipment":["hob"],"airFryer":"optional string","tags":["…"],"basedOn":"…",
 "ingredients":[{"i":"beef_mince","q":250,"t":"250g"},{"i":"frozen_peas","q":80,"t":"80g","swap":"…"},{"i":"coriander","q":10,"t":"a small handful, to serve","opt":true,"swap":"…"}],
 "steps":[{"title":"Prep the veg","text":"…"}]}
```

## Validation (run with node before you finish)
- Parses; same number of recipes and same ids in the same order as the input.
- Every `i` exists in the catalogue (or your reported new ingredients).
- 4–8 steps each, each with non-empty title and text; no step text over ~110 words.
- Every ingredient id appears at least once in the recipe; no duplicate ingredient ids in a recipe.
- frozen_peas and mushrooms lines all have a `swap` unless you explain in the report why not.
