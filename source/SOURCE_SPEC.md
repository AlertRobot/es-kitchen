# Recipe source check

The couple want to know each recipe in their app is legitimately based on a real, published, well-regarded
recipe rather than invented. Each recipe in your batch has a `basedOn` field naming a source, but most of those were
written from memory and never opened. Your job: confirm a real published source for every recipe, and check our
version is a faithful home adaptation of it.

## For each recipe in your batch
1. Find the real published recipe that best matches our dish. Start from `basedOn` (site + dish name). Look on
   the named site first, then other reputable recipe publishers (BBC Good Food, Jamie Oliver, Nigella, Delicious,
   Olive, RecipeTin Eats, Serious Eats, NYT Cooking, Mob, Gousto, HelloFresh UK, Hairy Bikers, Pinch of Nom,
   Waitrose, Sainsbury's/Tesco Real Food, BBC Food, Rick Stein, Meera Sodha/Guardian, Felicity Cloake/Guardian,
   Just One Cookbook, Maangchi, The Woks of Life, Hebbars Kitchen, Swasthi's, Dishoom).
   - Prefer WebFetch on site search pages, e.g. `https://www.bbcgoodfood.com/search?q=<dish>`,
     `https://www.recipetineats.com/?s=<dish>`, `https://www.jamieoliver.com/search/?s=<dish>`, then fetch the
     recipe page itself to confirm it exists and read its ingredients and method.
   - Use WebSearch only when needed (at most 20 for your whole batch — the budget is shared).
   - If a site refuses a fetch, don't try to get round it; use another source.
2. Compare: the defining ingredients, rough proportions (scaled to 2), cooking method and times.
   - `match`: "close" (same dish, same key ingredients and method, scaled), "adapted" (same dish, sensible
     substitutions for UK supermarket ingredients or our catalogue, e.g. red curry paste + spices for massaman
     paste), or "loose" (only the idea is shared).
   - If our version has a real mistake compared with established recipes (wrong cooking time for the meat,
     unsafe chicken/rice handling, a missing defining ingredient, wildly off quantity), list it in `fix`.
3. Never copy wording from the source. You're only recording where it came from.

## Output
JSON object keyed by recipe id → your output path:
```json
{"it_spaghetti_carbonara": {"title": "Spaghetti carbonara", "site": "BBC Good Food", "url": "https://www.bbcgoodfood.com/recipes/ultimate-spaghetti-carbonara-recipe", "author": "Angela Nilsen", "match": "close", "checked": "2026-10-23", "fix": ""}}
```
- `url` must be a page you actually fetched (or a search-result URL you confirmed exists). If you could not confirm
  any source, set `url` to "" and `match` to "unverified" and say why in `fix` — don't guess.
- `author` only if the page names one.
Validate with node. Report back: counts of close/adapted/loose/unverified, and every `fix` (one line each).

## Fixes
For any recipe where you found a real mistake (or where `match` would be "loose"/"unverified" and you can bring it in
line with a real published recipe you fetched by small changes — ingredients from our catalogue
`/home/claude/mealplan/v2/data/catalogue.json` ids only, same schema), write the full corrected recipe object(s) as a JSON
array to `<your output path minus .json>_fixed.json` (write `[]` if none). Keep id, schema and style (4–8 steps,
`{title,text}`, HelloFresh-clear, quantities for our servings), keep `swap`/`opt` fields, and set `basedOn` to the source you
confirmed. Then update that recipe's entry in your sources JSON so `match` reflects the fixed version.
Don't edit any other file.
