# Frozen veg pack sides (15 Nov 2026)

Ethan and Sophie often swap a dinner's vegetable side for a cheap frozen steam-bag pack of mixed veg (e.g. Lidl's), because it's easier. Peckish is getting a "switch side" option on a planned dinner: the side veg comes off the shopping list and a frozen veg pack goes on, and the method changes to match.

Your job: for each dinner in your input file, decide whether it has a **vegetable side** that a frozen mixed veg pack could replace, and if so write the switched version.

## What counts as a veg side
- Veg cooked and served *alongside* the main thing, not cooked into it: e.g. steamed broccoli with a pie, boiled carrots and peas with a roast, green beans next to salmon, sweetcorn on the side of fried chicken, a pan of peas with fish and chips, broccoli with a katsu.
- **Not** a side (leave the recipe out): veg that's part of the dish itself (broccoli *in* mac and cheese, beef and broccoli stir-fry, spinach in a saag, veg in a stew/curry/soup/pasta sauce/frittata/chowder/fried rice/pad thai, peas in a fish pie filling, corn in a burrito bowl or tuna jacket filling), salads and slaws, onions/garlic/peppers in the main, potatoes/chips/rice/mash (those are carbs).
- If only *some* of the side veg is a side (e.g. carrots in the stew but peas on the side), only the side part is swapped.

## The switched version
- `remove`: ingredient ids of the side veg that come out (only lines that were purely for the side; if a line is used both in the dish and the side, leave it in and say so in `note`).
- `q`: grams of frozen veg pack for the recipe's servings. Use 80g per serving (so 160 for 2 servings) unless the original side was clearly bigger or smaller (e.g. a roast with lots of veg: 100g per serving).
- `steps`: the FULL new method (same `{title, text}` format, at most 6 steps), identical to the original except where the side veg was prepared or cooked: that now says something like "Cook the frozen veg pack following the packet." at a sensible moment so it's ready with the main. Don't say microwave or steam explicitly (the packets vary); "following the packet" is right. Remove any mention of the removed veg (including in serving lines — say "the veg" instead). No abbreviations: write "tablespoon", "teaspoon", "minutes", "grams" in full. British English, friendly, HelloFresh style.
- Use the new ingredient id `frozen_veg_pack` (unit grams) in your head; you don't need to add it to the ingredient list yourself, the app does that from `q`.

## Output
Write a JSON array to the path you're given, one object per recipe that has a side (skip the rest):
```json
{ "id": "br_cottage_pie", "remove": ["broccoli"], "q": 160, "steps": [...full new steps...], "why": "Broccoli is steamed and served on the side." }
```
Then check your file with a Python script: valid JSON, every `remove` id is in that recipe's ingredients, no step mentions a removed ingredient by name (watch for plurals like "carrots", "peas"), no "tbsp"/"tsp"/"min "/"mins", at most 6 steps, every step that didn't involve the side is unchanged word for word.

Return a short summary: recipes in, how many have a side, 3 example `why` lines, and any borderline calls you made.
