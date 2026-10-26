Nutrition data format: nutrition.json
=====================================

Purpose: nutrition for each ingredient in catalogue_slim.json (each item has id, name, unit g|ml|each|clove).
To add a new ingredient, add one entry to nutrition.json keyed by its catalogue id, following these rules.

What values to use
- Typical values for the everyday UK supermarket own-brand product, as sold (raw/uncooked).
- Dry pasta/rice/lentils: dry weight.
- Tins: drained where the recipe would drain them (i.e. chickpeas, beans, tuna).
- Coconut milk: full-fat.
- Mince: at the stated fat %.
- Source: standard nutrition tables (McCance & Widdowson, USDA) and typical UK labels.

Output: nutrition.json is an object keyed by id.
- unit g or ml -> {"per": 100, "kcal": n, "protein": n, "carbs": n, "fat": n}
  (values per 100 g or per 100 ml)
- unit each or clove -> {"per": 1, "grams": typical weight of one item, "kcal": n, "protein": n, "carbs": n, "fat": n}
  (values per ONE item/clove; e.g. one medium egg ~ 58 g, one brown onion ~ 160 g, one tortilla wrap ~ 62 g,
   one pitta ~ 60 g, one naan ~ 130 g, one salmon fillet ~ 120 g, one pork sausage ~ 57 g, one garlic clove ~ 4 g,
   one stock cube made up ~ 20 kcal)
- protein/carbs/fat in grams, one decimal place; kcal whole numbers.

Checks
- Every id in the catalogue must have an entry.
- The file must parse as JSON and cover every id.
- kcal ~ 4*protein + 4*carbs + 9*fat within ~15% for each entry (fix any that don't).
