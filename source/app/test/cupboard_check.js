// Cupboard staples on the shopping list (26 Nov 2026):
//  - an optional extra you're low on (fennel seeds for the sausage pasta) goes in Cupboard top-ups marked optional, not left off
//  - a staple used by an optional line and a normal one isn't marked optional
//  - staples the week uses that nobody's confirmed are reported (staplesUsed / usesOf) so the list can ask about them
const C = require('../src/core.js'); const lib = require('../public/data/library.json');
const ING = {}; lib.ingredients.forEach(i => ING[i.id] = i); const RMAP = {}; lib.recipes.forEach(r => RMAP[r.id] = r);
const din = lib.recipes.filter(r => !r.meal && !r.retired);
let fails = 0; const ok = (c, what) => { console.log((c ? 'ok   ' : 'FAIL ') + what); if (!c) fails++; };
const base = { ING, RECIPES: din, RMAP, people: [{ id: 'e', name: 'Ethan', wontEat: [] }, { id: 's', name: 'Sophie', wontEat: [] }], settings: { shop: 'tesco', useLoyalty: true }, recent: {}, today: '2026-11-23' };
const week = (days) => ({ start: '2026-11-23', days: Array.from({ length: 7 }, (_, d) => days[d] ? { r: days[d] } : {}), carryIn: [], freezerMeals: [] });
const w1 = week({ 3: 'it_sausage_broccoli_orecchiette', 6: 'as_teriyaki_chicken_noodles' });

let pantry = { status: { fennel_seeds: 'low' } };
let s = C.simulate(w1, { ...base, pantry }); let L = C.shoppingList(s, { ...base, pantry }, pantry);
let row = L.basket.rows.find(r => r.i === 'fennel_seeds');
ok(row && row.staple && row.opt, 'optional fennel seeds you are low on go on the list as an optional top-up');
ok(!(s.skippedOpt || []).some(x => x.i === 'fennel_seeds'), 'and aren\'t reported as left off');

const w2 = week({ 2: 'it_sausage_fennel_ragu', 3: 'it_sausage_broccoli_orecchiette' });
s = C.simulate(w2, { ...base, pantry }); L = C.shoppingList(s, { ...base, pantry }, pantry);
row = L.basket.rows.find(r => r.i === 'fennel_seeds');
ok(row && !row.opt, 'fennel seeds needed by the ragu as well aren\'t marked optional');

pantry = { status: {} };
s = C.simulate(w1, { ...base, pantry }); L = C.shoppingList(s, { ...base, pantry }, pantry);
ok(!L.basket.rows.some(r => r.i === 'fennel_seeds' || r.i === 'sesame_oil'), 'with nothing marked, staples are assumed in the cupboard (not bought)');
ok(s.staplesUsed.fennel_seeds && s.staplesUsed.sesame_oil, 'but the week reports it uses fennel seeds and sesame oil, so the list can ask');
ok((s.usesOf.sesame_oil || []).some(u => u.r === 'as_teriyaki_chicken_noodles' && u.d === 6), 'with what each is for');
process.exit(fails ? 1 : 0);
