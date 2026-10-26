// Assemble public/data/library.json from recipes, catalogue, nutrition, prices and photos.
const fs = require('fs'), path = require('path');
const V2 = path.join(__dirname, '..');
const rd = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const ex = f => fs.existsSync(f);
const ING = {};
for (const i of rd(V2 + '/data/catalogue.json')) ING[i.id] = { ...i };
// reviewed versions of each dinner batch win over the originals; breakfasts & lunches come from bl/
const recipeFiles = fs.readdirSync(V2 + '/recipes').filter(f => f.endsWith('.json') && !f.endsWith('_new.json'))
  .map(f => ex(V2 + '/recipes_reviewed/' + f) ? V2 + '/recipes_reviewed/' + f : V2 + '/recipes/' + f)
  .concat(ex(V2 + '/new_dinners') ? fs.readdirSync(V2 + '/new_dinners').filter(f => /^batch\d+\.json$/.test(f)).map(f => V2 + '/new_dinners/' + f) : [])
  .concat(['breakfasts.json', 'lunches.json', 'breakfasts_v4.json', 'lunches_v4.json'].map(f => V2 + '/bl/' + f).filter(ex));
// v4 audit: experimental and near-duplicate dinners are dropped; kept ones get a carb base, dish type and a plain short name
const AUDIT = ex(V2 + '/data/audit.json') ? rd(V2 + '/data/audit.json').dinners : {};
// new ingredients from v2 batches
for (const f of fs.readdirSync(V2 + '/recipes').filter(f => f.endsWith('_new.json'))) for (const i of rd(V2 + '/recipes/' + f)) {
  if (ING[i.id]) { ING[i.id].tags = [...new Set([...(ING[i.id].tags || []), ...(i.tags || [])])]; continue; }
  ING[i.id] = { tags: [], prices: {}, ...i };
}
// breakfast & lunch ingredients (first definition wins; the lunch file has the fuller pack lists for shared ones)
const BLNUT = {};
const extraNew = ['lunches_new.json', 'breakfasts_new.json', 'v4_new.json'].map(f => V2 + '/bl/' + f)
  .concat(ex(V2 + '/new_dinners') ? fs.readdirSync(V2 + '/new_dinners').filter(f => /_new\.json$/.test(f)).map(f => V2 + '/new_dinners/' + f) : []);
for (const f of extraNew) if (ex(f)) for (const i of rd(f)) {
  if (i.nutrition) BLNUT[i.id] = i.nutrition;
  if (ING[i.id]) continue; const o = { tags: [], prices: {}, ...i }; delete o.nutrition; ING[i.id] = o;
}
// extra prices for new ingredients
if (ex(V2 + '/prices')) for (const f of fs.readdirSync(V2 + '/prices').filter(f => f.endsWith('.json'))) for (const p of rd(V2 + '/prices/' + f)) {
  const ing = ING[p.id]; if (!ing) continue; ing.prices = ing.prices || {};
  for (const [shop, x] of Object.entries(p.prices || {})) if (x && x.price > 0 && x.pack > 0) ing.prices[shop] = { pack: x.pack, price: Math.round(x.price * 100) / 100, loyalty: x.loyalty > 0 ? Math.round(x.loyalty * 100) / 100 : null, checked: x.checked || '2026-10-22', src: x.src || '', est: !!x.est, note: x.note || '', label: x.label || '' };
  if (p.tescoPack > 0 && ing.packs && !ing.packs.includes(p.tescoPack) && ing.packs.length === 1) ing.packs = [p.tescoPack];
}
// v3 baseline: prices re-checked on the shops' own pages (verified) override earlier values
const today = '2026-10-23';
if (ex(V2 + '/prices_v3')) for (const f of fs.readdirSync(V2 + '/prices_v3').filter(f => f.endsWith('.json'))) for (const p of rd(V2 + '/prices_v3/' + f)) {
  const ing = ING[p.id]; if (!ing) continue; ing.prices = ing.prices || {};
  for (const [shop, x] of Object.entries(p.prices || {})) {
    if (!x || !(x.price > 0) || !(x.pack > 0)) continue;
    ing.prices[shop] = { pack: x.pack, price: Math.round(x.price * 100) / 100, loyalty: x.loyalty > 0 ? Math.round(x.loyalty * 100) / 100 : null, checked: x.checked || today, src: x.src || '', est: !!x.est, verified: !!x.verified, note: x.note || '', label: x.label || '' };
  }
  if (p.tescoPack > 0 && ing.packs && !ing.packs.includes(p.tescoPack)) ing.packs = ing.packs.length === 1 ? [p.tescoPack] : ing.packs.concat([p.tescoPack]).sort((a, b) => a - b);
}
if (ex(V2 + '/new_dinners')) for (const f of fs.readdirSync(V2 + '/new_dinners').filter(f => /_prices\.json$/.test(f))) for (const p of rd(V2 + '/new_dinners/' + f)) {
  const ing = ING[p.id]; if (!ing) continue; ing.prices = ing.prices || {};
  for (const [shop, x] of Object.entries(p.prices || {})) { if (!x || !(x.price > 0) || !(x.pack > 0)) continue; ing.prices[shop] = { pack: x.pack, price: Math.round(x.price * 100) / 100, loyalty: x.loyalty > 0 ? Math.round(x.loyalty * 100) / 100 : null, checked: x.checked || today, src: x.src || '', est: !!x.est, verified: !!x.verified, note: x.note || '', label: x.label || '' }; }
}
// v5: live-page check of every shop, each shop's own product and pack (26 Oct 2026). "unlisted" = that shop doesn't
// list it online, so it has no price there (rather than a guess).
if (ex(V2 + '/prices_v5')) for (const f of fs.readdirSync(V2 + '/prices_v5').filter(f => /_out\.json$/.test(f))) for (const p of rd(V2 + '/prices_v5/' + f)) {
  const ing = ING[p.id]; if (!ing) continue; ing.prices = ing.prices || {};
  for (const [shop, x] of Object.entries(p.prices || {})) {
    if (!x) continue;
    if (x.unlisted) { delete ing.prices[shop]; (ing.unlisted = ing.unlisted || {})[shop] = x.note || 'not listed online'; continue; }
    if (!(x.price > 0) || !(x.pack > 0)) continue;
    ing.prices[shop] = { pack: x.pack, price: Math.round(x.price * 100) / 100, loyalty: x.loyalty > 0 ? Math.round(x.loyalty * 100) / 100 : null, checked: x.checked || '2026-10-26', src: x.src || '', est: false, verified: true, note: x.note || '', label: x.label || '' };
    if (ing.unlisted) delete ing.unlisted[shop];
  }
}
// no estimates: anything not confirmed on a live page is dropped and shows as "no price" for that shop
let droppedEst = 0;
for (const id in ING) { const ps = ING[id].prices || {}; for (const shop of Object.keys(ps)) if (ps[shop] && (ps[shop].est || !ps[shop].src)) { delete ps[shop]; droppedEst++; } }
console.log('estimated prices dropped:', droppedEst);
if (ING.oil) { ING.oil.name = 'Vegetable oil'; ING.oil.packs = [1000]; }
// shelf life once opened and freezability, checked against usual UK storage advice (freeze = fine frozen for cooking)
const SHELF = { greek_yogurt: { keeps: 7, freeze: true }, anchovies: { keeps: 14 }, feta: { keeps: 7, freeze: true }, broccoli: { keeps: 5 },
  coriander: { freeze: true }, basil: { freeze: true }, spinach: { keeps: 3, freeze: true }, double_cream: { keeps: 4, freeze: true },
  peppers: { freeze: true }, leeks: { freeze: true }, mushrooms: { freeze: true }, sour_cream: { keeps: 7 }, skyr: { keeps: 7 },
  spring_onions: { keeps: 7 }, weetabix: { staple: true }, porridge_oats: { staple: true },
  // whole fruit and veg don't go off just because the bag's been opened
  leeks: { keeps: 10 }, peppers: { keeps: 7 }, red_onion: { keeps: 21 }, onion: { keeps: 21 }, green_chillies: { keeps: 10 }, lemon: { keeps: 14 }, lime: { keeps: 14 },
  cherry_tomatoes: { keeps: 7 }, sweet_potato: { keeps: 14 }, carrots: { keeps: 14 }, courgette: { keeps: 7 }, apples: { keeps: 21 } };
for (const id in SHELF) if (ING[id]) Object.assign(ING[id], SHELF[id]);
// Only suggest freezing what people really freeze and use again: raw meat and fish, bread, things bought frozen, pastry.
// Cream, cheese, yogurt, herbs, fresh veg and opened tins are never sent to the freezer.
const FREEZE_OK_AISLE = new Set(['Meat & fish', 'Bakery', 'Frozen']);
const FREEZE_EXTRA = new Set(['puff_pastry']);
const FREEZE_NO = new Set(['cooked_chicken_slices', 'ham_slices', 'smoked_mackerel']);
for (const id in ING) { const i = ING[id]; i.freeze = (FREEZE_OK_AISLE.has(i.aisle) || FREEZE_EXTRA.has(id)) && !FREEZE_NO.has(id); }
// pack sizes corrected from the price checks (Tesco standard packs)
const PACK_FIX = { smoked_haddock: [280], pork_shoulder_steaks: [700], pork_shoulder: [700], beef_steak: [395], dried_yeast: [56], pepperoni: [120], bbq_sauce: [440], mayonnaise: [460], ketchup: [555],
  black_bean_sauce: [205], oyster_sauce: [180], beef_stir_fry_strips: [357], pork_loin_steaks: [480], gherkins: [480], apples: [5], pineapple_chunks: [425],
  branston_pickle: [295], ground_almonds: [250], mango_chutney: [230], capers: [120], chilli_powder: [50], pecorino: [170], fennel_seeds: [36], chipotle_paste: [95], zaatar: [35], olives: [163] };
for (const id in PACK_FIX) if (ING[id]) ING[id].packs = PACK_FIX[id];
// nutrition
const NUT = {};
Object.assign(NUT, BLNUT);
for (const f of ['nutrition.json', 'nutrition_extra.json', 'nutrition_bl_lunch.json', 'nutrition_v3.json']) if (ex(V2 + '/data/' + f)) Object.assign(NUT, rd(V2 + '/data/' + f));
// vegetable oil, not olive oil
NUT.oil = { per: 100, kcal: 828, protein: 0, carbs: 0, fat: 92 };
for (const id in ING) if (NUT[id]) ING[id].nut = NUT[id];
// photos
const PH = {}; for (const f of fs.readdirSync(V2 + '/data').filter(f => /^photos_\d+\.json$/.test(f))) Object.assign(PH, rd(V2 + '/data/' + f));
{ // one photo per recipe: if two recipes share a photo, keep it on the higher-confidence match
  const byBase = {};
  for (const k of Object.keys(PH)) { const base = (PH[k].url || '').split('?')[0]; const prev = byBase[base];
    if (!prev) { byBase[base] = k; continue; }
    const keepNew = PH[k].confidence === 'high' && PH[prev].confidence !== 'high';
    if (keepNew) { delete PH[prev]; byBase[base] = k; } else delete PH[k]; }
}
for (const k in PH) { const p = PH[k]; if (!p || !/^https:\/\/images\.unsplash\.com\//.test(p.url || '') || !/^https:\/\/images\.unsplash\.com\//.test(p.thumb || '')) delete PH[k]; else delete p.confidence; }
// the same product added by different batches under different ids
const ALIAS = { white_fish: 'cod_fillets', white_fish_fillets: 'cod_fillets', black_olives: 'olives' };
// ingredients that can almost always be cooked or served separately, so someone who won't eat them isn't blocked
const SEPARABLE = { frozen_peas: 'Cook the peas separately and add them to the other plate only.', sweetcorn: 'Cook the sweetcorn separately and add it to the other plate only.',
  mushrooms: 'Fry the mushrooms in a separate pan and add them to the other plate only.', olives: 'Leave the olives off one plate.', capers: 'Leave the capers off one plate.',
  coriander: 'Scatter the coriander over one plate only.', basil: 'Tear the basil over one plate only.', rocket: 'Serve the rocket on the side.', spring_onions: 'Scatter the spring onions over one plate only.',
  chilli_flakes: 'Add the chilli flakes to one plate only.', green_chillies: 'Add the chilli to one portion only.', jalapenos: 'Add the jalapeños to one plate only.', feta: 'Crumble the feta over one plate only.',
  sun_dried_tomatoes: 'Leave the sun-dried tomatoes out of one portion.', beansprouts: 'Add the beansprouts to one bowl only.', gherkins: 'Leave the gherkins off one plate.', avocado: 'Serve the avocado on the side.',
  sour_cream: 'Serve the soured cream on the side.', salted_peanuts: 'Scatter the peanuts over one plate only.', pickled: '' };
for (const id in SEPARABLE) if (ING[id] && SEPARABLE[id]) ING[id].separable = SEPARABLE[id];
for (const a in ALIAS) delete ING[a];
if (ING.cod_fillets) ING.cod_fillets.name = 'White fish fillets (cod or haddock)';
if (ING.olives) ING.olives.name = 'Pitted black olives';
// source check: corrected versions replace the originals, and each recipe carries a plain-text credit (no links)
const FIXED = {}, SRC = {};
if (ex(V2 + '/new_dinners')) for (const f of fs.readdirSync(V2 + '/new_dinners').filter(f => /_sources\.json$/.test(f))) Object.assign(SRC, rd(V2 + '/new_dinners/' + f));
if (ex(V2 + '/sources')) for (const f of fs.readdirSync(V2 + '/sources').filter(f => f.endsWith('.json'))) {
  const d = rd(V2 + '/sources/' + f);
  if (f.endsWith('_fixed.json')) { for (const r of d) FIXED[r.id] = r; } else Object.assign(SRC, d);
}
const recipes = [], seen = new Set(), problems = [], dropped = [];
for (const f of recipeFiles) for (const r0 of rd(f)) {
  const r = FIXED[r0.id] ? { ...r0, ...FIXED[r0.id] } : r0;
  const au = AUDIT[r.id];
  if (au && au.verdict === 'replace') { dropped.push(r.id); r.retired = true; } // hidden from browsing and suggestions; kept so old plans still open
  if (au) { r.base = r.base || au.base; r.family = r.family || au.family; r.short = r.short || au.short; }
  if (r.photo && !(/^https:\/\/images\.unsplash\.com\//.test(r.photo.url || '') && /^https:\/\/images\.unsplash\.com\//.test(r.photo.thumb || r.photo.url || ''))) delete r.photo;
  if (r.photo && !r.photo.thumb) r.photo.thumb = r.photo.url.replace(/([?&])w=\d+/, '$1w=400');
  const sc = SRC[r.id];
  if (sc && sc.site && sc.title && sc.url && ['close', 'adapted', 'loose'].includes(sc.match)) { r.source = { title: sc.title, site: sc.site, match: sc.match }; if (sc.author) r.source.author = sc.author; }
  else if (ex(V2 + '/sources') && !(r.tags || []).includes('quick')) problems.push('no source ' + r.id);
  if (seen.has(r.id)) { problems.push('dup ' + r.id); continue; }
  const merged = [];
  for (const l of r.ingredients) { const i = ALIAS[l.i] || l.i; const x = merged.find(m => m.i === i); if (x) { x.q = (Number(x.q) || 0) + (Number(l.q) || 0); } else merged.push({ ...l, i }); }
  r.ingredients = merged;
  const missing = r.ingredients.filter(l => !ING[l.i]).map(l => l.i);
  if (missing.length) problems.push(r.id + ' unknown ' + missing.join(','));
  r.ingredients = r.ingredients.filter(l => ING[l.i]).map(l => { const o = { i: l.i, q: Number(l.q) || 0, t: l.t || '' }; if (l.swap) o.swap = l.swap; if (l.opt) o.opt = true; return o; });
  r.steps = (r.steps || []).slice(0, 8).map(s => typeof s === 'string' ? { title: '', text: s } : { title: s.title || '', text: s.text || '' });
  const bl = r.meal === 'breakfast' || r.meal === 'lunch';
  r.servings = bl ? 1 : 2; r.category = r.category === 'treat' ? 'treat' : 'everyday';
  r.equipment = Array.isArray(r.equipment) ? r.equipment : []; if (!bl && !r.equipment.length) r.equipment = ['hob'];
  delete r.kcalEst; delete r.proteinEst;
  if (PH[r.id]) r.photo = PH[r.id];
  delete r.basedOn; // provenance stays in the source files, not shipped to the app
  seen.add(r.id); recipes.push(r);
}
// Automatic "leave it off one plate" swaps: when a fresh ingredient only appears in a salad, garnish, side or topping
// (never cooked into the dish), someone who won't eat it can skip it, so the recipe isn't hidden from them.
const COOK_RE = /\b(fry|fried|frying|cook|cooks|cooked|cooking|simmer|simmering|bake|baked|baking|roast|roasted|roasting|boil|boiling|grill|grilled|sauté|saute|sizzle|blend|blitz|whizz|marinate|marinade|melt|reduce|braise|stew|soften|caramelise|wilt|stir-fry|stir it into the (?:pan|sauce|curry|pot)|into the (?:pan|sauce|curry|pot|tray|tin|dish|filling|batter|mix))\b/i;
const SIDE_RE = /\b(salad|slaw|salsa|raita|tzatziki|relish|pickle[sd]?|garnish|dip|side)\b/i;
const SERVE_RE = /\b(serve|serving|to serve|scatter|top with|topped|sprinkle|pile|load|tuck|fill|assemble|garnish|on the side|alongside|spoon over)\b/i;
const SEP_AISLES = new Set(['Fruit & veg', 'Tins & jars', 'Dairy & eggs', 'Chilled', 'World foods']);
const ALWAYS_SEP = new Set(['cucumber', 'little_gem', 'lettuce', 'salad_leaves', 'rocket', 'red_cabbage', 'radishes', 'watercress']);
const NEVER_SEP = new Set(['ham_slices', 'shortcrust_pastry', 'puff_pastry', 'cooked_chicken_slices', 'onion', 'garlic', 'ginger', 'chopped_tomatoes', 'passata', 'tomato_puree', 'coconut_milk', 'double_cream', 'butter', 'milk', 'eggs', 'potatoes', 'sweet_potato', 'carrots', 'leeks', 'celery', 'stock_cubes', 'kidney_beans', 'black_beans', 'chickpeas', 'butter_beans', 'cannellini_beans', 'lentils', 'mozzarella', 'cheddar', 'parmesan', 'paneer', 'halloumi', 'tofu']);
let autoSwaps = 0;
for (const r of recipes) {
  const sentences = r.steps.flatMap(st => (st.text || '').split(/(?<=[.!?])\s+/));
  const title = (r.short || r.title.split(/ with /i)[0]).toLowerCase(); // the dish itself, not its sides
  for (const l of r.ingredients) {
    const ing = ING[l.i]; if (!ing || l.swap || l.opt || ing.separable || !SEP_AISLES.has(ing.aisle) || ing.staple || NEVER_SEP.has(l.i)) continue;
    const words = ing.name.toLowerCase().replace(/\(.*?\)/g, '').split(/[^a-z]+/).filter(w => w.length > 3 && !/^(fresh|large|small|ready|baby|cooked|tinned|chopped|sliced|mixed|light|whole|semi|skimmed|free|range|natural|plain|pack)$/.test(w));
    const key = words[words.length - 1]; if (!key) continue;
    const stem = key.replace(/(es|s)$/, '');
    if (title.includes(stem)) continue; // it's what the dish is about
    const re = new RegExp('\\b(?:' + (ALWAYS_SEP.has(l.i) ? words.map(w => w.replace(/(es|s)$/, '')) : [stem]).join('|') + ')(e?s)?\\b', 'i');
    const hits = sentences.filter(x => re.test(x)); if (!hits.length && !ALWAYS_SEP.has(l.i)) continue;
    // Look clause by clause: cooked if a clause naming it also cooks it, or puts it in/on the pan, tray, sauce or oven.
    if (/juice|zest/i.test(l.t || '')) continue; // used as a flavouring, not a garnish
    // salad veg is never cooked into a dish: always fine to make one portion without it
    const always = ALWAYS_SEP.has(l.i);
    const clauses = hits.flatMap(x => x.split(/;|\bthen\b|\bwhile\b|\buntil\b/i)).filter(c => re.test(c));
    const CLAUSE_COOK = /\b(fry|fried|frying|sauté|saute|roast|roasting|bake|baking|simmer|simmering|boil|grill|cook|cooking|soften|stir-fry|braise|caramelise|wilt\w*|sizzle|char|blister|through the hot)\b/i;
    const MARINADE = /\b(marinade|marinate\w*|spread (?:it )?over|coat\w*|rub\w*)\b|\bmix\w*\b[^.]*\b(?:paste|masala|spice|spices|paprika|cumin|chicken|beef|lamb|pork|salmon|prawns|mince)\b/i;
    const INTO = /\b(?:to|into|in|onto|on|over)\s+(?:the\s+)?(?:hot\s+|same\s+|large\s+|lined\s+)?(?:pan|wok|sauce|curry|pot|tray|trays|baking tray|tin|dish|oven|casserole|stew|soup|broth|filling|batter|mixture|pizza|pizzas|base|bases|dough|burgers? patty|mince)\b/i;
    const ADDIN = /\b(add|adding|stir in|stir through|tip in|throw in|scatter|tip)\b/i;
    const cooked = clauses.some(c => !SIDE_RE.test(c) && (CLAUSE_COOK.test(c) || INTO.test(c) || MARINADE.test(c) || (ADDIN.test(c) && !SERVE_RE.test(c))));
    if (cooked && !always) continue;
    // and it must actually be served as a side, salad, garnish or topping somewhere
    const served = hits.some(x => SIDE_RE.test(x) || SERVE_RE.test(x)) || /\bto serve|to garnish|sticks|wedges, to serve|on the side\b/i.test(l.t || '');
    if (!served && !always) continue;
    let comp = (hits.map(x => (x.match(SIDE_RE) || [])[1]).find(Boolean) || '').toLowerCase();
    if (!comp && always) { const lt = (l.t || '').toLowerCase() + ' ' + r.title.toLowerCase(); comp = (/raita|tzatziki|salad|slaw|salsa/.exec(r.steps.map(x => x.title + ' ' + x.text).join(' ').toLowerCase().split(/(?<=[.!?])\s+/).filter(x => re.test(x)).join(' ')) || [''])[0]; }
    const nm = stem.endsWith('o') ? stem + 'es' : (key);
    l.swap = comp && comp !== 'side' && comp !== 'garnish' && !/^pickle/.test(comp) ? 'Make one portion of the ' + comp + ' without the ' + nm + ', or serve the ' + nm + ' on the side.'
      : r.family === 'pizza' ? 'Leave the ' + nm + ' off half the pizza.' : 'Leave the ' + nm + ' off one plate.';
    l.autoSwap = true; autoSwaps++;
  }
}
console.log('automatic swaps added:', autoSwaps);
const used = new Set(); recipes.forEach(r => r.ingredients.forEach(l => used.add(l.i)));
const ingredients = Object.values(ING).filter(i => used.has(i.id) || i.staple).map(i => { const o = { ...i }; o.prices = o.prices || {}; return o; });
const noNut = ingredients.filter(i => !i.nut).map(i => i.id), noPrice = ingredients.filter(i => !Object.keys(i.prices).length).map(i => i.id);
const lib = { version: Date.now(), updated: process.env.LIB_DATE || new Date().toISOString().slice(0, 10), recipes, ingredients };
fs.mkdirSync(__dirname + '/public/data', { recursive: true });
fs.writeFileSync(__dirname + '/public/data/library.json', JSON.stringify(lib));
console.log('recipes', recipes.length, 'ingredients', ingredients.length, 'KB', Math.round(JSON.stringify(lib).length / 1024));
if (noNut.length) console.log('NO NUTRITION:', noNut.join(' '));
if (noPrice.length) console.log('NO PRICE:', noPrice.join(' '));
if (problems.length) console.log('PROBLEMS:\n' + problems.join('\n'));
console.log('dropped by audit:', dropped.length);
const byC = {}; recipes.forEach(r => { const k = r.meal || r.cuisine; byC[k] = (byC[k] || 0) + 1; }); console.log(byC, 'treats', recipes.filter(r => r.category === 'treat').length, 'photos', recipes.filter(r => r.photo).length);
