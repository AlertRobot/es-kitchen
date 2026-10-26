# Photo matching spec (openly licensed photos only)

We want one appetising photo per recipe card, **only where there is a convincing match**. A missing photo is
fine (the card shows an icon); a wrong or unappetising photo is not. The couple said: "if it looks bad, don't".

## Source and licence — Unsplash only, free photos only
Use WebFetch on the Unsplash search API (works, returns JSON):
`https://unsplash.com/napi/search/photos?query=<url-encoded query>&per_page=20`
Ask WebFetch's prompt to return, for each result: id, alt_description, description, urls.regular, urls.small,
user.name, user.username, links.html, premium, plus.

**Reject any result where premium or plus is true, or whose URL is on plus.unsplash.com** — those are Unsplash+
photos with a paid licence. Only use `images.unsplash.com` URLs (free Unsplash Licence).

## Matching rules
- The photo must clearly show **this dish** (or something a reasonable person would accept as this dish when
  plated at home): e.g. "Smash cheeseburger with fries" → a cheeseburger; "Chicken tikka masala with rice" →
  an orange/red chicken curry with rice; "Pad thai" → pad thai. Judge from alt_description + description.
- Reject if the description suggests the wrong dish, a different main ingredient (e.g. shrimp pasta for a
  bacon carbonara), raw ingredients rather than the cooked dish, a restaurant menu, people as the subject,
  text overlays, packaging, or a whole table spread where the dish isn't the subject.
- Generic dishes are fine if the type matches ("Chicken & chorizo traybake" → a chicken traybake with peppers).
- Search with 1–3 short queries per recipe (dish name, then a simpler version). Don't spend more than 3 fetches
  on one recipe. If nothing convincing, skip it.
- Prefer photos whose description mentions the dish by name. Avoid reusing the same photo for two recipes.

## Output
Write a JSON object keyed by recipe id to the output path you're given:
```json
{
  "it_spaghetti_carbonara": {
    "url": "https://images.unsplash.com/photo-1633337474564-1d9478ca4e2e?auto=format&fit=crop&w=1080&q=75",
    "thumb": "https://images.unsplash.com/photo-1633337474564-1d9478ca4e2e?auto=format&fit=crop&w=300&h=300&q=70",
    "credit": "Rob Wicks on Unsplash",
    "licence": "Unsplash Licence",
    "source": "https://unsplash.com/photos/a-white-plate-topped-with-spaghetti-and-bacon-fDLBn8X_IlU",
    "alt": "Spaghetti carbonara with bacon on a white plate",
    "confidence": "high"            // high = description names the dish; medium = clearly the same type of dish
  }
}
```
Build `url`/`thumb` from the base photo URL (everything before `?`) plus the query strings shown above.
Only include high or medium matches. Validate the file parses with node. Report back: how many recipes got a
photo (high/medium) and how many were skipped.
