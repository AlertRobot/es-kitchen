# New dinners spec (v4)

The couple said the dinner library had too many experimental, samey dishes and nothing looked appetising "off the
bat". You're writing replacement dinners: familiar, popular UK weeknight and treat-night food that looks great on a
photo card. Each one must be based on a real, published, well-regarded recipe.

## Your batch
A list of dishes (name, cuisine, protein, base, family, category) in your prompt. Write one recipe per dish.

## Rules
- **Recipe style**: follow /home/claude/mealplan/v2/RECIPE_REVIEW_SPEC.md exactly (HelloFresh-clear steps, 4–8
  steps, one job per step, timings and cues, swaps for peas/mushrooms/sweetcorn/garnishes, `opt` on garnishes,
  honest `time`, accurate `equipment`, servings 2, British English).
- **Source**: before writing, find and read a real published recipe for the dish (RecipeTin Eats, Tesco Real Food,
  Sainsbury's, HelloFresh UK, Gousto, Pinch of Nom, Jamie Oliver pages that load, Kitchen Sanctuary, Taming Twins,
  Hairy Bikers, Mob recipe pages, Delicious pages that load, Serious Eats is blocked, etc.). Follow
  /home/claude/mealplan/v2/SOURCE_SPEC.md for what to record. bbcgoodfood.com, BBC Food and the Guardian are blocked
  for fetching; do NOT use bbcgoodfoodme.com or any mirror or cache to get round that. Adapt to UK supermarket
  ingredients and two portions; never copy wording.
- **Ingredients**: use ids from /home/claude/mealplan/v2/data/catalogue_current.json (plus
  /home/claude/mealplan/v2/bl/breakfasts_new.json and lunches_new.json). Reuse common ingredients so packs get used
  up across the week. Avoid building dishes around mushrooms or peas (allowed only with a swap). If a new ingredient
  is truly unavoidable (max 3 per batch), add it to your `_new.json` with name, aisle, unit, packs (Tesco sizes),
  life, keeps, freeze (only true for raw meat/fish, bread, frozen goods), staple, tags, and `nutrition`
  {per:100, kcal, protein, carbs, fat} (or per 1 for "each" units, with grams), and price it at all five shops per
  /home/claude/mealplan/v2/PRICE_VERIFY_SPEC.md (records in your `_prices.json`).
- **Extra fields on every recipe**: `short` (the plain name a person would say, ≤ 30 chars: "Chicken fajitas"),
  `base` and `family` (as given), `title` (≤ 55 chars, appetising, e.g. "Chicken Fajitas with Guacamole & Soured Cream"),
  `icon` (one emoji), `tags`, `basedOn` (site — recipe title — author).
- **Photo**: find one per dish following /home/claude/mealplan/v2/PHOTO_SPEC.md (Unsplash only, free licence,
  must clearly be this dish and look appetising; skip rather than use a weak match). Record it on the recipe as
  `photo` in the same shape PHOTO_SPEC describes.
- ids: `<cuisine prefix>_<snake_name>` with prefixes am_, as_, br_, in_, it_, mx_, me_; must not clash with existing
  ids in /home/claude/mealplan/v2/recipes_reviewed/*.json.

## Output (paths given in your prompt)
- `<name>.json` — array of recipes.
- `<name>_sources.json` — SOURCE_SPEC format keyed by id.
- `<name>_new.json` and `<name>_prices.json` — only if you added ingredients (else `[]`).
Validate with node: every ingredient id exists (catalogue or your _new file), 4–8 steps, every step has title+text,
servings 2, every id has a source with a fetched url, photo URLs start with https://images.unsplash.com/.
Report back: dishes written, sources used, photos found/missing, any new ingredients.
