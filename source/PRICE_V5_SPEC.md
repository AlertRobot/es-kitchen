# Price check v5: real prices only, each shop's own pack sizes

The couple (Southampton, SO15 3NH) now want **no estimated prices at all**. Every price in the app must come from a
live page you fetched today (26 October 2026), and each shop's entry must use **that shop's own product and pack size**
(the app will now buy in Lidl's packs when they shop at Lidl, Aldi's at Aldi, and so on). UK supermarkets price the same
nationally online, so the national online price is the right one for their local stores.

Your input file (path in your prompt) is an array of ingredients: id, name, unit (g, ml, each, clove), packs (the
catalogue's usual sizes), aisle, and `current` prices per shop (may be estimates — don't trust them).

## Where to look (WebFetch; read pages, never copy text into the app)
- **lidl** — Lidl's site search returns JSON:
  `https://www.lidl.co.uk/q/api/search?assortment=GB&locale=en_GB&version=v2.0.0&q=<term>`
  Each item has a title/fullTitle, price.price (shelf price; can be missing when only a Lidl Plus price is shown —
  then the regular price is usually in the basePrice/packaging text, e.g. "Regular price £3.59"), basePrice (per kg),
  packaging or keyfacts (pack size) and canonicalUrl (`https://www.lidl.co.uk` + it). Lidl only lists part of its range
  online, and also lists short-term specials ("from 29.10", "Middle of Lidl"): use only an everyday line product that is
  the same kind of thing. If Lidl doesn't list a suitable product, record it as `unlisted` (see below) — do NOT
  estimate, and don't use other websites' Lidl prices.
- **aldi** — aldi.co.uk product pages (`https://www.aldi.co.uk/product/...`) and category pages (e.g.
  `https://www.aldi.co.uk/products/fresh-food/...`). Their search page may be blocked; you can try
  `https://www.aldi.co.uk/results?q=<term>` once, and otherwise use category pages or a WebSearch for
  `site:aldi.co.uk <product>` (at most 15 searches for your whole batch). If Aldi doesn't sell it, record `unlisted`.
- **asda** — groceries.asda.com refuses automated reads; use trolley.co.uk product pages for the Asda product
  (`https://www.trolley.co.uk/search/?q=<term>` then the product page, which lists prices per shop).
- **tesco** — `https://www.tesco.com/groceries/en-GB/search?query=<term>`.
- **sainsburys** — `https://www.sainsburys.co.uk/gol-ui/SearchResults/<term>`.
If a page refuses, don't try to get round it.

## Choosing the product
The everyday own-brand version that matches the ingredient as used in a home recipe (e.g. "Chicken breast fillets" =
plain fresh British chicken breast fillets, not mini fillets or XXL bulk packs; "Chopped tomatoes (tin)" = 400g tin).
Prefer the normal family pack a couple would buy. Not premium lines (Finest/Taste the Difference/Deluxe/Specially
Selected) unless that's the only option.

## Recording (pack in the ingredient's unit)
- `pack`: the product's size in the ingredient's unit. For "each" items sold loose or by weight, convert: onion 160 g,
  pepper 160 g, lemon 110 g, lime 70 g, courgette 250 g, sweet potato 300 g, garlic bulb ≈ 10 cloves; a pack of N = N.
- `price`: normal shelf price in £. `loyalty`: Clubcard / Nectar / Lidl Plus member price only if shown for that
  product now (else null). Multibuys go in `note`.
- `checked`: "2026-10-26"; `verified`: true; `est`: false; `label`: exact product name; `src`: the URL you fetched
  (for Lidl, the product's canonical URL).
- Not sold / not listed online: `{"unlisted": true, "note": "<what you searched>"}`.

## Output (path in your prompt)
JSON array, one object per input id, with ONLY the shops you were asked to check:
```json
[{"id":"beef_mince","prices":{"lidl":{"pack":500,"price":3.49,"loyalty":null,"checked":"2026-10-26","verified":true,"est":false,"label":"Birchwood 5% Fat Beef Steak Mince 500g","src":"https://www.lidl.co.uk/p/...","note":""}}},
 {"id":"tahini","prices":{"lidl":{"unlisted":true,"note":"searched tahini, sesame paste"}}}]
```
Validate with node (parses; every input id present; every priced entry has pack > 0, price > 0, verified true, a src).
Report back: priced vs unlisted counts, and any price that differs from `current` by more than 30% (one line each).
