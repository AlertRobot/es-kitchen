const C = require('../src/core.js'); const lib = require('../public/data/library.json');
const ING = {}; lib.ingredients.forEach(i => ING[i.id] = i); const RMAP = {}; lib.recipes.forEach(r => RMAP[r.id] = r);
const settings = { shop: 'tesco', useLoyalty: true, weeknightCap: 30, treatDays: [5], style: 'balanced', equipment: { hob: true, oven: true, grill: true, microwave: true, air_fryer: false, slow_cooker: false } };
const ctx = { ING, RECIPES: lib.recipes.filter(r => !r.meal && !r.retired), RMAP, people: [{ name: 'Ethan', wontEat: ['mushrooms'] }], settings, ratings: {}, recent: {} };
const staples = lib.ingredients.filter(i => i.staple).map(i => i.id);
const pantry = { status: Object.fromEntries(staples.map(id => [id, 'low'])), always: {} };
let tot = { food: 0, stap: 0, n: 0, nst: 0 };
for (let k = 0; k < 5; k++) {
  const w = C.autoFill({ start: '2026-10-26', days: Array.from({ length: 7 }, () => ({})), carryIn: [] }, ctx, { beam: 3, branch: 5, jitter: 0.6, seed: 'x' + k });
  const s = C.simulate(w, ctx); const L = C.shoppingList(s, ctx, pantry);
  const pk = L.basket.prefKey; let food = 0, stap = 0; const st = [];
  L.basket.rows.forEach(r => { const c = r.byShop[pk].cost; if (r.staple) { stap += c; st.push(r.i + ' £' + c.toFixed(2)); } else food += c; });
  tot.food += food; tot.stap += stap; tot.n++; tot.nst += st.length;
  if (k === 0) { console.log('food £' + food.toFixed(2), 'staples £' + stap.toFixed(2), st.length, 'staples'); console.log(st.join(', ')); }
}
console.log('avg food £' + (tot.food / tot.n).toFixed(2), 'avg staples £' + (tot.stap / tot.n).toFixed(2), 'avg #staples', tot.nst / tot.n);
// staple usage across library
const cnt = {}; lib.recipes.forEach(r => r.ingredients.forEach(l => { if (ING[l.i].staple) cnt[l.i] = (cnt[l.i] || 0) + 1; }));
console.log('staples by #recipes:', Object.entries(cnt).sort((a, b) => a[1] - b[1]).map(([k, v]) => k + ':' + v).join(' '));
const spices = lib.recipes.map(r => r.ingredients.filter(l => ING[l.i].staple).length); spices.sort((a, b) => a - b);
console.log('staple lines per recipe median', spices[105], 'max', spices[209]);
