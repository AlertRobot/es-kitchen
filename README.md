# Peckish

Meal planner for two: plans the week to use up whole packs, prices the shop at five supermarkets, works offline and syncs live between phones.

## How it fits together

- **The app** is this folder, served free by GitHub Pages. It's plain HTML, JavaScript and fonts, with nothing loaded from anyone else's servers except Firebase.
- **The data** lives in your own Firebase project (Firestore). Each household is one document with sub-collections: `people`, `weeks`, `config` (settings, pantry, photo choices, backup), `recipes` (your own and edited recipes), `ingredients` (your price changes) and `ratings`. Accounts are `users/{uid}`; invite codes are `invites/{code}`.
- **It's invite-only.** Only a signed-in, verified email with a document at `allowed/{email}` (the email in lower case) can read or write anything, including the shared recipe photos. Add or remove people in the Firebase console (Firestore > `allowed`); the app can never change the list. Someone not on it sees a note saying Peckish is invite-only.
- **Each phone keeps a full copy** (Firestore's offline cache, plus a plain copy of this week and next week), so the plan, list and pantry work with no signal. Changes made offline sync when you're back online.
- **The recipe library** (`data/library.json`) is built into the app and saved on the phone by the service worker (`sw.js`).
- **Backups** go to a Google Sheet, one tab per table, through the small Apps Script in `apps-script/Code.gs`, once a day and when a week is locked in. Settings > Backup & restore can also save everything to a single file, and restore from either.

Nothing here depends on Claude: Claude built it, but the app runs on GitHub Pages, Firebase and your phones.

## Files

- `firebase-config.js`: Firebase settings (safe to publish; access is controlled by the security rules)
- `firestore.rules`: the database security rules (paste into Firebase > Firestore Database > Rules)
- `data/library.json`: recipes, ingredients, prices and nutrition
- `fonts/`: the app's fonts (SIL Open Font Licence)
- `apps-script/Code.gs`: the Google Sheets backup receiver (setup steps at the top of the file)

Recipes are adapted from published recipes; each recipe card credits its source.
