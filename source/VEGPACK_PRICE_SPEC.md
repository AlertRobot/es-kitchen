# Frozen veg steam packs: prices and nutrition (15 Nov 2026)

Peckish needs one new ingredient: `frozen_veg_pack`, a frozen mixed vegetable pack in a cook-in-the-bag / steam bag (the kind sold as "steam bags", "steam fresh", "microwave steam bags" — mixed veg such as broccoli, carrots, peas, sweetcorn, green beans, cauliflower). Ethan and Sophie buy Lidl's because it's cheap.

## Shops
tesco, sainsburys, asda, aldi, lidl. Pick the cheapest normal own-brand mixed veg steam bag pack at each (e.g. Tesco "Steam Bags Mixed Vegetables 4 x 150g" or whatever exists now; Aldi Four Seasons; Lidl's own frozen brand). If a shop only sells single bags or only multipacks, use what's there and record the total grams. Branded (Birds Eye Steamfresh) only if the shop has no own-brand.

## Rules (same as the rest of Peckish's prices)
- **No estimates.** Every price must come from a page you actually read: shop's own site (basis "shop"), a price-comparison site like trolley.co.uk product pages (basis "compare"; trolley's search page is blocked, find product pages via WebSearch), shoppers' receipts/shelf-photo sites (basis "crowd"), or a dated article/leaflet (basis "news"). Use WebSearch (mode "standard", "extended" when thin) and WebFetch.
- Lidl: try hard (Lidl's own site, Lidl Plus offers, Open Food Facts / Open Prices, Reddit or news). Ethan says Lidl's are cheap, so a real Lidl price matters most here. Only if nothing real exists, use Aldi's price with `"basis": "model", "conf": "low"` and a note saying it's matched to Aldi's.
- A missing price is fine; a guessed one is not. List missing ones in `"missing"`.
- `pack` is total grams in the pack (e.g. 4 x 150g = 600).

## Output
Write ONE JSON file to /home/claude/es-kitchen/source/easy/prices_vegpack.json shaped exactly:

```json
{
  "ingredients": [
    { "id": "frozen_veg_pack", "name": "Frozen veg steam bags (mixed veg)", "aisle": "Frozen", "unit": "g", "packs": [600], "life": 365, "keeps": 90, "freeze": false, "staple": false, "tags": [],
      "nutrition": { "per": 100, "kcal": 45, "protein": 2.5, "carbs": 6, "fat": 0.5 },
      "nutritionSrc": "url you read it from" }
  ],
  "prices": [
    { "id": "frozen_veg_pack", "prices": {
        "lidl": { "pack": 600, "price": 1.29, "loyalty": null, "checked": "2026-11-15", "src": "https://...", "basis": "shop", "conf": "high", "label": "exact product name", "note": "" }
    } }
  ],
  "missing": []
}
```
`packs` lists the distinct pack sizes (grams) you found. Nutrition per 100g from one real product page (prefer the Lidl or Tesco one). Return a short summary: each shop's product, pack and price, and anything odd.
