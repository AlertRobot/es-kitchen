const C = require('../src/core.js'); const lib = require('../public/data/library.json');
const ING = {}; lib.ingredients.forEach(i => ING[i.id] = i); const RMAP = {}; lib.recipes.forEach(r => RMAP[r.id] = r);
const settings = { shop: 'tesco', useLoyalty: true, weeknightCap: 30, treatDays: [5], equipment: { hob: true, oven: true, grill: true, microwave: true, air_fryer: false, slow_cooker: false, blender: false, food_processor: false } };
const ctx = { ING, RECIPES: lib.recipes.filter(r => !r.meal && !r.retired), RMAP, people: [{ name: 'Ethan', wontEat: ['mushrooms'] }, { name: 'Sophie', wontEat: [] }], settings, today: '2026-10-22' };
const kc = lib.recipes.map(r => C.recipeNutrition(r, ING).kcal).sort((a, b) => a - b);
console.log('kcal min/median/max', kc[0], kc[105], kc[209], 'unknown nut', lib.recipes.filter(r => !C.recipeNutrition(r, ING).known).length);
const costs = lib.recipes.map(r => [r.ingredients.reduce((a, l) => a + l.q * C.unitPrice(ING[l.i], 'tesco', true), 0) / 2, r.title]).sort((a, b) => a[0] - b[0]);
console.log('cost/portion cheapest', costs.slice(0, 2).map(x => x[0].toFixed(2) + ' ' + x[1]).join(' ; '));
console.log('dearest', costs.slice(-2).map(x => x[0].toFixed(2) + ' ' + x[1]).join(' ; '));
for (let run = 0; run < 3; run++) {
  const t = Date.now();
  const w = C.autoFill({ start: '2026-10-26', days: Array.from({ length: 7 }, () => ({})), carryIn: [] }, ctx, { beam: 3, branch: 5, jitter: run ? 2.5 : 0.6 });
  const s = C.simulate(w, ctx); const L = C.shoppingList(s, ctx, { status: {} });
  console.log('\nRUN', run, (Date.now() - t) + 'ms', '£' + L.basket.prefTotal.toFixed(2), 'waste £' + s.wasteValue.toFixed(2), 'pp £' + s.perPortion.toFixed(2), 'cheapest', L.basket.cheapest, '£' + L.basket.totals[L.basket.cheapest].total.toFixed(2));
  w.days.forEach((d, k) => { const r = RMAP[d.r]; console.log(' ', C.DAY_NAMES[k], r.category === 'treat' ? '★' : ' ', r.cuisine.padEnd(14), r.protein.padEnd(7), (r.time + 'm').padEnd(5), C.recipeNutrition(r, ING).kcal + 'kcal', r.title); });
}
