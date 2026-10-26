const C = require('../src/core.js'); const lib = require('../public/data/library.json');
const ING = {}; lib.ingredients.forEach(i => ING[i.id] = i); const RMAP = {}; lib.recipes.forEach(r => RMAP[r.id] = r);
const din = lib.recipes.filter(r => !r.meal && !r.retired);
const opts = JSON.parse(process.argv[2] || '{}');
const ctx = { ING, RECIPES: din, RMAP, people: [{ id: 'e', name: 'Ethan', wontEat: ['mushrooms'] }, { id: 's', name: 'Sophie', wontEat: ['peas'] }], settings: { shop: 'tesco', useLoyalty: true, weeknightCap: 30, treatDays: [5], style: 'balanced', stapleBudget: 8 }, ratings: {}, recent: {}, pantry: { status: {} } };
let totW = 0, totB = 0, items = {}, t0 = Date.now(), runs = 0;
for (let seed = 0; seed < 3; seed++) {
  let carry = [], fm = []; ctx.recent = {};
  for (let wk = 0; wk < 3; wk++) {
    const start = C.addDays('2026-10-26', 7 * wk);
    const w = C.autoFill({ start, days: Array.from({ length: 7 }, () => ({})), carryIn: carry, freezerMeals: fm }, ctx, { beam: opts.beam || 3, branch: opts.branch || 5, jitter: 0.6, seed: 's' + seed + wk });
    const s = C.simulate(w, ctx); totW += s.wasteValue; totB += s.buy.prefTotal; runs++;
    for (const id in s.waste) items[id] = (items[id] || 0) + s.waste[id] * C.unitPrice(ING[id], 'tesco', true);
    carry = s.carryOut; fm = s.freezerOut; for (const id in ctx.recent) ctx.recent[id]++; w.days.forEach(d => ctx.recent[d.r] = 1);
  }
}
console.log('avg waste/wk £' + (totW / runs).toFixed(2), 'avg shop £' + (totB / runs).toFixed(2), ((Date.now() - t0) / runs | 0) + 'ms/wk');
console.log('top waste:', Object.entries(items).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => k + ' £' + (v / runs).toFixed(2)).join(', '));
