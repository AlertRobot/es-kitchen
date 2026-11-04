# Easy-meal products: prices and nutrition (4 Nov 2026)

Peckish is getting an "Easy" category: kit, jar and freezer dinners (fajita kit + chicken, curry kit + chicken, frozen pizza, fish fingers and chips...). Each product below needs a real UK price at each of five shops and its nutrition.

## Shops
tesco, sainsburys, asda, aldi, lidl. Pick the product a normal shopper would grab: the shop's own-brand standard version if it exists, otherwise the common branded one (Old El Paso, Patak's, Dolmio, Uncle Ben's/Ben's Original, Birds Eye, Aunt Bessie's, McCain...). Prefer the cheapest sensible standard-range option, not "Finest"/"Taste the Difference" and not value lines that are a different thing.

## Rules (same as the rest of Peckish's prices)
- **No estimates.** Every price must come from a page you actually read: the shop's own site first (basis "shop"), then trolley.co.uk or another price-comparison site (basis "compare"), a delivery app listing like Uber Eats / Deliveroo / Just Eat for that shop (basis "app"), shoppers' receipts/shelf-photo sites (basis "crowd"), or a dated article/leaflet (basis "news"). Use WebSearch (mode "standard", "extended" when thin) and WebFetch. Shops' own sites often block fetching; trolley.co.uk usually works for Tesco/Sainsbury's/Asda/Aldi; Aldi's own site (aldi.co.uk/product/...) often works; Lidl has little online, so try Lidl's own site, then crowd/news sources.
- If you genuinely can't find a price for a shop, leave that shop out and add it to `"missing"`. A missing price is fine; a guessed one is not.
- For Lidl only, if no real price exists but Aldi's equivalent is known, you may give Aldi's price with `"basis": "model", "conf": "low"` and a note saying it's matched to Aldi's. Never do this for any other shop.
- Record Clubcard/Nectar prices in `loyalty` (null if none). `price` is the normal shelf price.
- `pack` is in the ingredient's unit (see table): grams or ml for g/ml items, a count for `each` items.

## Output
Write ONE JSON file to the path you're told, shaped exactly:

```json
{
  "ingredients": [
    { "id": "fajita_kit", "name": "Fajita kit (wraps, seasoning and salsa)", "aisle": "World foods", "unit": "each", "packs": [1], "life": 365, "keeps": 2, "freeze": false, "staple": false, "tags": [],
      "nutrition": { "per": 1, "kcal": 1430, "protein": 40, "carbs": 260, "fat": 22 },
      "nutritionSrc": "url you read it from" }
  ],
  "prices": [
    { "id": "fajita_kit", "prices": {
        "tesco": { "pack": 1, "price": 2.75, "loyalty": 2.25, "checked": "2026-11-04", "src": "https://...", "basis": "shop", "conf": "high", "label": "Old El Paso Smoky BBQ Fajita Kit 500G", "note": "own-brand kit £1.85 also stocked" }
    } }
  ],
  "missing": ["fajita_kit lidl"]
}
```

- `nutrition`: for g/ml units give it per 100 (`"per": 100`, values per 100g/ml as on the pack). For `each` units give it per ONE item (`"per": 1`): e.g. a whole kit, one pizza, one kiev, one fish finger, one burger. Work it out from the pack's per-100g figures and weight, and say so in `nutritionSrc`.
- `life` = days unopened (frozen/dry ~365, chilled = typical use-by from purchase); `keeps` = days once opened (frozen/dry jars: jar sauce ~3 after opening, frozen ~90).
- `aisle` is one of: Bakery, Chilled, Dairy & eggs, Dry goods, Frozen, Fruit & veg, Meat & fish, Oils & sauces, Tins & jars, World foods.
- Keep `label` to the exact product name as the shop lists it.

Return a short summary: how many shop prices found per product, anything odd.
