# Breakfast & packed-lunch spec (v3)

E&S Kitchen plans dinners for a UK couple (Southampton). Now it also plans breakfasts and lunches PER PERSON:
- Ethan works from home. He's calorie-conscious and losing weight (on Mounjaro); his usual is a Weetabix and a
  protein bar or two before dinner (~300–400 kcal). He'd like some nicer lunches that still fit.
- Sophie is a hospital nurse (long shifts): she needs packed lunches (and sometimes breakfast) she can take to work,
  with no oven, maybe a microwave, eaten at a break. Things that survive a day in a bag/fridge.
Everything is costed against whole supermarket packs (Tesco/Sainsbury's/Asda/Aldi/Lidl), so reuse ingredients across
recipes and with dinners (catalogue below) so packs get used up.

Inputs
- Ingredient catalogue: /home/claude/mealplan/v2/data/catalogue_current.json (id, name, unit, packs, staple).
- Dinner recipe schema example: any file in /home/claude/mealplan/v2/recipes/ (e.g. italian.json) — same shape.

## Recipe shape (one PORTION per recipe — these are per person)
```json
{"id":"lu_chicken_pesto_pasta_salad","title":"Chicken Pesto Pasta Salad","icon":"🥗","meal":"lunch",
 "cuisine":"Italian","category":"everyday","protein":"chicken","time":20,"servings":1,
 "packable":true,"microwave":false,"keepsDays":3,"batch":"Make 3 portions on Sunday; keeps 3 days in the fridge.",
 "equipment":["hob"],
 "ingredients":[{"i":"pasta","q":60,"t":"60g"}, …],
 "steps":[{"title":"Cook the pasta","text":"…"}, …],
 "tags":["light","high-protein","no-cook","batch"]}
```
- `meal`: "lunch" or "breakfast". `servings`: always 1 (amounts are for ONE portion). `keepsDays`: how many days a
  made-ahead portion keeps in the fridge (0 = make fresh). `batch`: one sentence on prepping several at once, or "".
- `packable`: true if it travels in a lunchbox. `microwave`: true if it should be reheated (say so in the last step).
- Steps: 1–5 steps, HelloFresh-style (short title + 1–3 short sentences, clear cues). Quick items may have 1 step.
- `cuisine` from: Italian, British, American, Mexican, Middle Eastern, Indian, Asian (or "British" for generic).
- Prefer catalogue ingredients. New ingredients allowed (≤ 25 across your file), schema as catalogue plus
  `life` (days unopened), `keeps` (days once opened), `freeze` (bool), `tags`, realistic Tesco pack sizes in `packs`.
  Use generic snake_case ids. Likely needed: weetabix (24 pack, unit each = 1 biscuit), protein_bar (unit each, 4-pack
  or 12-pack), porridge_oats, banana (each), frozen_berries, wholemeal_bread (unit each = 1 slice, 800g loaf ≈ 18–20
  slices), skyr or fat_free_greek_yogurt, cottage_cheese, cooked_chicken_slices, ham_slices, hummus, salad_leaves,
  microwave_rice_pouch, quinoa, apples exist already, etc. Check the catalogue first (eggs, wraps, pitta, tinned
  tuna, chickpeas, feta, spinach, cucumber, cherry tomatoes, peppers, greek_yogurt, milk already exist).

## What to write — two files
1. LUNCHES (`lu_` ids) → the lunches output path you're given. 30 recipes:
   - Calories per portion mostly 300–500 (a few 250–300 "light" ones, a few up to 550). Compute from typical
     values and put your estimate in a `kcalEst` field — the app recalculates from ingredients anyway.
   - Mostly packable, keeps 2–3 days, batch-friendly: grain/pasta salads, wraps and sandwiches built to not go soggy
     (pack fillings separately where needed — say so), bento-style boxes, protein pots, soups for a flask or
     microwave, noodle jars, rice bowls, frittata/egg muffins, chicken or tuna salads, hummus boxes.
   - High protein where possible (≥ 25 g per portion for most). Tasty — "nicer lunches", not sad desk food.
   - A handful of hot work-from-home lunches too (`packable:false`): e.g. a quick omelette, beans on toast upgrade.
2. BREAKFASTS & QUICK ITEMS (`bf_` ids) → the breakfasts output path you're given. 20 recipes:
   - Quick items (`tags:["quick"]`, 1 step): "Protein bar" (just protein_bar ×1), "Weetabix with milk" (1 biscuit +
     100 ml semi-skimmed milk), "2 Weetabix with milk", "Banana", "Greek yogurt pot with berries", "Boiled eggs ×2".
   - Made breakfasts, 150–400 kcal: overnight oats (several flavours, packable for a shift), protein porridge, egg
     muffins (batch, packable), scrambled eggs on toast, yogurt & granola-free parfait, smoothie (needs blender),
     cottage cheese on toast, etc.
   - Mark which are packable for an early shift.

## Validation (node) — run before finishing
- Both files parse; ids unique with the right prefix; servings 1; `meal` correct; every `i` in catalogue or your new
  ingredients file; 1–5 steps each with title and text.
- Write new ingredients (merged from both files, no duplicates, none clashing with catalogue ids) to the
  new-ingredients path you're given (`[]` if none).
Report back: counts, kcal range, new ingredient ids.
