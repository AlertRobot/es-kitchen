const C = require('../src/core.js'); const lib = require('../public/data/library.json');
const ING = {}; lib.ingredients.forEach(i => ING[i.id] = i); const RMAP = {}; lib.recipes.forEach(r => RMAP[r.id] = r);
for (const style of ['save', 'balanced', 'variety']) {
  const settings = { shop: 'tesco', useLoyalty: true, weeknightCap: 30, treatDays: [5], style, equipment: { hob: true, oven: true, grill: true, microwave: true, air_fryer: false, slow_cooker: false } };
  const ctx = { ING, RECIPES: lib.recipes.filter(r => !r.meal && !r.retired), RMAP, people: [{ name: 'Ethan', wontEat: ['mushrooms'] }], settings, today: '2026-10-22', ratings: {}, recent: {} };
  const cuis = {}, seen = new Set(); let cost = 0, treats = 0; const t0 = Date.now(); let weeks = [];
  let start = '2026-10-26';
  for (let k = 0; k < 6; k++) { // six consecutive weeks, feeding history forward
    const w = C.autoFill({ start, days: Array.from({ length: 7 }, () => ({})), carryIn: [] }, ctx, { beam: 3, branch: 5, jitter: 0.6, seed: start + Math.random() });
    const s = C.simulate(w, ctx); cost += s.buy.prefTotal;
    w.days.forEach(d => { const r = RMAP[d.r]; cuis[r.cuisine] = (cuis[r.cuisine] || 0) + 1; seen.add(r.id); if (r.category === 'treat') treats++; });
    weeks.push(w.days.map(d => RMAP[d.r].title.slice(0, 26)));
    // recency: shift ages and add this week
    for (const id in ctx.recent) ctx.recent[id]++; w.days.forEach(d => ctx.recent[d.r] = 1);
    start = C.addDays(start, 7);
  }
  console.log('\n' + style.toUpperCase(), 'avg £' + (cost / 6).toFixed(2) + '/wk', 'distinct', seen.size, 'of 42', 'treats', treats, (Date.now() - t0) / 6 | 0, 'ms/wk', JSON.stringify(cuis));
  if (style === 'balanced') weeks.slice(0, 2).forEach(w => console.log('  ' + w.join(' | ')));
}
// picker on an empty Wednesday
const ctx = { ING, RECIPES: lib.recipes.filter(r => !r.meal && !r.retired), RMAP, people: [], settings: { shop: 'tesco', weeknightCap: 30, treatDays: [5], style: 'balanced' }, ratings: {}, recent: {} };
const sg = C.suggest({ start: '2026-10-26', days: Array.from({ length: 7 }, () => ({})), carryIn: [] }, 2, ctx);
console.log('\nPICK top 10 Wed:', sg.slice(0, 10).map(x => x.r.cuisine + ':' + x.r.title.slice(0, 20)).join(' / '));
