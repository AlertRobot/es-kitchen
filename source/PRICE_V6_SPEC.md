# Price check v6: the best reading from every source we can find

A couple in Southampton (SO15 3NH) use a private meal-planning app that prices ~217 everyday ingredients at
**Tesco, Sainsbury's, Asda, Aldi and Lidl**. On 26 Oct 2026 we read each shop's own website. That left gaps, mostly
because Lidl (and some of Aldi's range) isn't listed online. Now we want the **most accurate price we can find for
every item at every shop, from any credible source**, each recorded with where it came from and how sure we are.
They'll refine it from their own receipts later.

**Read pages one at a time with WebFetch (and WebSearch to find them). No scraping, no scripts hitting sites in bulk,
and don't try to get round a page that refuses you. Never copy a page's text into the output beyond the product name.**

Your input file (path in your prompt) lists ingredients: id, name, unit (g, ml, each, clove), packs (usual sizes), aisle,
and `known`: prices we already have at other shops (label, pack, price), so you know exactly what kind of product it is.
Your prompt says which shop(s) to fill.

## Sources (best first; use as many as you need)
1. **The shop's own site** (basis `shop`, best):
   - **Lidl search API** (JSON): `https://www.lidl.co.uk/q/api/search?assortment=GB&locale=en_GB&version=v2.0.0&q=<term>`. Fields:
     `price`, `oldPrice`, `basePrice`, `lidlPlus[].price` (with end date), `canonicalUrl` (prefix `https://www.lidl.co.uk`).
     It errors now and then: retry once. It only holds web-listed lines (weekly offers, themed weeks), so most staples
     won't be there. Only accept an everyday line, not a Specialbuy or themed-week-only item (say so in `note` if it is).
   - **Aldi**: product pages `https://www.aldi.co.uk/product/...` and category pages under `https://www.aldi.co.uk/products/...`;
     find them with WebSearch `site:aldi.co.uk <product>` (the site search is blocked).
   - **Tesco** `https://www.tesco.com/groceries/en-GB/search?query=<term>`, **Sainsbury's**
     `https://www.sainsburys.co.uk/gol-ui/SearchResults/<term>`.
2. **Trolley.co.uk** (basis `compare`): product pages `https://www.trolley.co.uk/product/<slug>/<code>` list each shop's
   price ("Prices updated daily"), and price-index pages by category and shop, e.g.
   `https://www.trolley.co.uk/grocery-price-index/category_store/?store_id=10&category=Milk` (store_id 10 = Aldi). Covers
   Tesco, Sainsbury's, Asda, Aldi (not Lidl). Its search page is off-limits; find product pages with WebSearch
   `site:trolley.co.uk <product> aldi`. Read pages one at a time, at most ~60 trolley pages in your whole batch.
3. **Tesco's "Aldi Price Match"** (basis `match`): Tesco checks Aldi's prices twice a week and matches them pro rata on
   badged products (https://www.tesco.com/groceries/en-GB/zone/aldi-price-match). If the Tesco product for this item
   shows the "Aldi Price Match" badge, Aldi's regular price for the comparable product = Tesco's price scaled to Aldi's
   pack. Name the Tesco product in `note`, `conf: "medium"`.
4. **Open Food Facts Open Prices** (basis `crowd`; shoppers' receipts): prices for a product
   `https://prices.openfoodfacts.org/api/v1/prices?product_code=<EAN>&order_by=-date`; Lidl GB stores
   `https://prices.openfoodfacts.org/api/v1/locations?osm_name__like=Lidl&osm_address_country__like=United%20Kingdom&size=100`
   then `/api/v1/prices?location_id=<id>&order_by=-date&size=100`. Only GB prices from the last 6 months. Thin coverage
   (about 700 Lidl GB prices ever; stores with most: Cardiff, Hartlepool, London N22): worth a look for Lidl staples.
5. **News, leaflets, basket comparisons** (basis `news`): dated articles naming a specific Lidl/Aldi product price
   (e.g. "Lidl Milbona 4 pints £1.45"), Lidl's weekly leaflet pages. Promotional prices only count if clearly the regular
   price; say which in `note`.
6. **Model** (basis `model`, last resort, Lidl only): Lidl prices its own-label staples to match Aldi — in The Grocer 33
   (May 2024) "Lidl and Aldi priced 30 of the 33 items the same"
   (https://lidl.co.uk/static/assets/GrocerSuper33AlertMay24-957520.pdf), and in Which?'s monthly 89–93-item baskets Lidl
   was within about 1–1.5% of Aldi through 2026. So for **own-label commodity staples only** (milk, eggs, butter, cheese,
   yogurt, flour, sugar, pasta, rice, noodles, tinned and jarred basics, bread, frozen veg, everyday fresh fruit & veg,
   chicken, mince, sausages, bacon, basic oils, stock cubes, everyday sauces like ketchup/mayo/soy), if no source gives
   Lidl's own price: Lidl price = Aldi's regular price for the matching product, at the same pack (`src` = the Grocer PDF
   above, `note` = "matched Aldi <label> £x.xx", `conf: "low"`). Use the Aldi price in the input's `known`, or look it up.
   **Don't model** brands, particular meat/fish cuts (steak, lamb, salmon fillets, prawns etc.), spices, specialist
   sauces/pastes, world foods or anything where packs differ a lot: those stay `unlisted` unless a real source has them.

## Choosing the product
The everyday own-brand version a couple would buy, matching the ingredient as used in a home recipe and as close as
possible to the `known` products (same kind, similar pack). Not premium lines (Finest, Taste the Difference, Specially
Selected, Deluxe) unless that's all there is. For Lidl and Aldi, their own brands (e.g. Lidl: Birchwood, Milbona,
Baresa, Chef Select, Deluxe; Aldi: Ashfield Farm, Specially Selected, Cowbelle, Everyday Essentials).

## Recording (pack in the ingredient's unit)
- `pack`: the product's size in the ingredient's unit. For "each" items sold loose or by weight: onion 160 g, pepper 160 g,
  lemon 110 g, lime 70 g, courgette 250 g, sweet potato 300 g, garlic bulb ≈ 10 cloves; a pack of N = N.
- `price`: normal shelf price in £; `loyalty`: Clubcard / Nectar / Lidl Plus price if the source shows one (else null).
- `basis`: where the price came from — `shop` (the shop's own site or app page), `compare` (a price-comparison site),
  `app` (the shop on a delivery app; note any known mark-up and give the in-store price if you can work it out from the
  source, otherwise skip it), `crowd` (shoppers' receipts or shelf photos, e.g. Open Food Facts prices, Reddit/HotUKDeals
  receipts), `match` (Tesco's Aldi Price Match, for Aldi), `news` (a dated article, leaflet or basket comparison naming
  that product's price), `model` (last resort — see below).
- `seen`: the date the source saw that price (YYYY-MM-DD; for an article, its date). Prefer 2026; never older than
  1 Jan 2026 unless nothing newer exists (then say so in `note` and use `conf: "low"`).
- `conf`: `high` (shop's own page today, or two independent sources agree), `medium` (one credible non-shop source from
  the last ~3 months), `low` (older, a different size scaled, or a model).
- `checked`: "2026-10-26"; `label`: the product name as listed; `src`: the exact URL you read; `note`: anything useful
  (e.g. "Lidl Plus price £1.49", "matched Aldi 500g price; see src").
- **`model`** (only when no source anywhere gives that shop's price): base it on a matched price at another shop with
  stated evidence that the two track each other for that kind of item (e.g. an article showing Lidl matches Aldi on
  that staple). Give the evidence URL as `src`, the matched shop and price in `note`, `conf: "low"`.
- Not sold there at all / nothing credible: `{"unlisted": true, "note": "<what you searched, where>"}`.

## Output (path in your prompt)
JSON array, one object per input id, with only the shops you were asked to fill:
```json
[{"id":"whole_milk","prices":{"lidl":{"pack":2272,"price":1.45,"loyalty":null,"basis":"crowd","seen":"2026-10-11","conf":"medium","checked":"2026-10-26","label":"Milbona British Whole Milk 4 Pints","src":"https://prices.openfoodfacts.org/...","note":""}}},
 {"id":"tahini","prices":{"lidl":{"unlisted":true,"note":"searched lidl.co.uk, Open Food Facts, news; not stocked"}}}]
```
Validate with node (parses; every input id present; every priced entry has pack > 0, price > 0, basis, conf, seen, src).
Report back: counts by basis and by conf, and anything surprising (one line each).

## Cross-check batches (your prompt says if you're doing one)
For each item and each of the 5 shops that has a `known` price, look for a **second, independent reading** (trolley
product page, the shop's own page today, Lidl API, Open Prices). Output per shop either
`{"agrees": true, "price": <the second price>, "pack":..., "basis":..., "src":..., "seen":..., "conf":...}` when it's
within 5% (same pack), or `{"agrees": false, ...}` with the second reading. If the shop's **own page today** shows a
different price for the same product, add `"replace": true` (that becomes the price). Shops with no `known` price: fill
them as above. Aim to cover every item; skip a shop only if no second source exists (say so in `note`).
