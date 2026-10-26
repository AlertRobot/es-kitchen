# Price verification spec (v3 baseline)

Goal: an accurate one-off baseline of shelf prices for a personal meal-planning app, taken from the supermarkets'
own public product/search pages wherever possible. Today is 23 October 2026. The current values (some estimated)
are in /home/claude/mealplan/v2/data/prices_current.json (keyed by ingredient id: name, unit, packs, prices per shop).

## For each ingredient id in your group, and each shop
- **tesco** — fetch `https://www.tesco.com/groceries/en-GB/search?query=<term>` (this works). Pick the everyday own-brand
  product matching the ingredient (not Finest; "Stockwell"/"Grower's Harvest" value lines only if that's the normal
  choice; branded only if there's no own-brand). Record price and Clubcard price if shown.
- **sainsburys** — fetch `https://www.sainsburys.co.uk/gol-ui/SearchResults/<term>`. Record price and Nectar price if shown.
- **aldi** — aldi.co.uk product or category pages (search pages are blocked — don't try them). If not findable, keep
  the current value.
- **asda** — groceries.asda.com refuses automated reads; use trolley.co.uk product pages for the Asda product.
- **lidl** — Lidl GB publishes no online prices. Don't search; keep the current entry (estimate from Aldi).
Use WebFetch; use WebSearch only to find a product page URL you can't guess (at most 10 searches for your group —
the search budget is shared). If a page refuses, don't try to get round it; move on.

## Recording
- `pack` in the ingredient's unit (g, ml, each, clove). For "each" items sold by weight, convert (onion 160 g, pepper 160 g,
  lemon 110 g, lime 70 g, courgette 250 g, sweet potato 300 g; garlic bulb ≈ 10 cloves). For a pack of N items, pack = N.
- `price` normal shelf price in £; `loyalty` the Clubcard/Nectar price only when a member price is shown for that product
  now (else null; multibuys are NOT loyalty prices — put them in `note`).
- `checked` = "2026-10-23" when you saw it on a live page today; otherwise keep the old date.
- `verified` = true when the price came from a page you fetched today; false when you kept the old value.
- `est` = true only for Lidl estimates, or when the pack size had to be assumed.
- `label` = the exact product name; `src` = the URL you fetched.
- `tescoPack` = Tesco's standard pack size in the ingredient's unit (helps fix catalogue pack sizes).

## Output
JSON array to your output path, one object per id:
```json
{"id":"beef_mince","tescoPack":500,"prices":{"tesco":{"pack":500,"price":3.69,"loyalty":3.25,"checked":"2026-10-23","verified":true,"est":false,"label":"Tesco 5% Fat Beef Steak Mince 500G","src":"https://…","note":""}, "sainsburys":{…}, "asda":{…}, "aldi":{…}, "lidl":{…}}}
```
Every id in your group must appear; every shop key present (null only if the shop genuinely doesn't stock it).
Validate it parses with node. Report back briefly: how many prices verified today vs kept, and any big changes (> 25%)
from the current value with a one-line reason.
