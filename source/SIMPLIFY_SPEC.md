# Simplify Peckish's dinners (4 Nov 2026)

Ethan and Sophie (a couple in Southampton; she's a nurse, he's a software engineer, both busy) found the recipes ask for too much. Example: chicken fajitas asks for smoked paprika, ground cumin, ground coriander, chilli flakes, a lime, an avocado, fresh coriander and garlic. They'd normally just use peppers, an onion, chicken, wraps, a fajita seasoning sachet and some soured cream. Every extra item lands on the shopping list or the "check you've got" list, and costs money.

Your job: for each dinner in your input file, decide whether a normal UK home cook would make it more simply, and if so rewrite it the way a sensible busy couple (or a student) would make it, keeping it recognisably the same dish and still tasty. Most recipes should change at least a little; a few already are simple and stay as they are.

## What to change
1. **Spice lists → one everyday product**, where that's how people normally do it:
   - Fajitas / fajita-style chicken, burritos, quesadillas, tacos → `fajita_seasoning` (1 sachet = `q: 1`, enough for 2 people and up to ~500g meat; it's an `each` item).
   - Chilli con carne / chilli → `chilli_mix` (1 sachet, `each`), plus the tomatoes and beans.
   - Indian curries that list 3+ ground spices → a jar paste that already exists (`tikka_paste` for tikka/masala/butter chicken style, about 2-3 tbsp = 45-60g) or `curry_powder` (1-2 tbsp = 6-12g) for others like jalfrezi, keema, dhal. Keep garam masala only if the dish really needs a finish (usually drop it).
   - Thai curries already use paste; just trim extras.
   - Italian dishes with several dried herbs → `mixed_herbs`.
   Only use ids listed in `ingredients.json` plus these three new ones: `fajita_seasoning` (each), `chilli_mix` (each), `curry_powder` (g).
2. **Cheffy extras → optional or gone.** Fresh herbs as garnish, avocado/guacamole on fajitas, lime wedges, a second cheese, chilli flakes on top, toasted seeds, pickled onions, microgreens etc. Either delete them, or keep with `"opt": true` if they genuinely make the dish nicer and people often add them. An avocado on fajitas: optional. Fresh coriander on a curry: delete or optional.
3. **Fewer pans and steps where it's easy**: e.g. don't make a separate guacamole, salsa or slaw from scratch if a dish works without it; the kit/jar/sauce version or simply serving with soured cream is fine. Shop-bought is fine where it's what people do (e.g. a jar of salsa isn't in the catalogue, so just drop homemade salsa).
4. **Keep**: the main protein, the carb (rice, pasta, wraps...), the core veg, and anything that defines the dish (e.g. coconut milk in a Thai curry, cream in a carbonara-style sauce, cheese on a pizza). Don't change servings (2) or protein amounts. Keep it calorie-sensible; don't add butter/cream that wasn't there.
5. **Don't simplify for its own sake**: if a recipe is already short (about 6-8 non-staple items, no fussy extras), leave it out of your output.

## Steps
Rewrite `steps` so they match the new ingredients exactly: same format (`{title, text}`), plain friendly British English, HelloFresh style, no abbreviations (write "tablespoon", "teaspoon", "minutes", "grams" in full — Sophie is dyslexic and doesn't read tbsp/tsp). At most 6 steps. Don't mention any ingredient that's no longer in the list. Use packet-style wording for seasoning: "Sprinkle over the fajita seasoning and stir to coat."

Ingredient lines are `{ "i": id, "q": number in the ingredient's unit, "t": "how it reads, e.g. 1 sachet / 2 tablespoons (45g) / 1, sliced" }`, keep any `swap` text on lines you keep (update it if it mentions removed things), and `"opt": true` for optional ones. In `t`, also avoid tbsp/tsp: write "2 tablespoons".

## Output
Write a JSON array to the path you're given, one object per recipe you changed:
```json
{ "id": "...", "ingredients": [...full new list...], "steps": [...full new steps...], "time": 25, "changed": "one short sentence: what changed, e.g. 'Fajita seasoning instead of four spices; avocado and coriander optional; no homemade guacamole.'" }
```
Include `time` only if it changes (it should usually drop a bit when steps go). Keep `title`/`short` unchanged unless the old title names something you removed (e.g. "with Guacamole" → then also include a new `title`, and `short` if present).

Then check your file: valid JSON, every `i` is a known id or one of the three new ones, no step mentions a removed ingredient, no "tbsp"/"tsp" anywhere. Return a summary: how many recipes in, how many changed, and 3 example `changed` lines.
