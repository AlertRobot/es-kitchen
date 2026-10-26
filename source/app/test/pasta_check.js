// Monday is pasta: what does the picker offer for Tuesday and Wednesday? And what do auto-filled weeks look like by carb?
const C = require('../src/core.js'); const lib = require('../public/data/library.json');
const ING = {}; lib.ingredients.forEach(i => ING[i.id] = i); const RMAP = {}; lib.recipes.forEach(r => RMAP[r.id] = r);
const D = lib.recipes.filter(r => !r.meal && !r.retired);
const settings = { shop: 'tesco', useLoyalty: true, weeknightCap: 30, treatDays: [5], style: 'balanced', equipment: { hob: true, oven: true, grill: true, microwave: true } };
const ctx = { ING, RECIPES: D, RMAP, people: [{ name: 'Ethan', wontEat: ['mushrooms'] }, { name: 'Sophie', wontEat: ['peas'] }], settings, today: '2026-10-26', ratings: {}, recent: {} };
const pasta = D.find(r => /carbonara/i.test(r.title));
const week = { start: '2026-10-26', days: Array.from({ length: 7 }, () => ({})), carryIn: [] }; week.days[0] = { r: pasta.id };
const sg = C.suggest(week, 1, ctx);
const top = sg.slice(0, 12);
console.log('Mon:', pasta.title); console.log('Tue top 12 bases:', top.map(x => C.baseOf(x.r)).join(' '));
console.log('  pasta in top 12:', top.filter(x => C.baseOf(x.r) === 'pasta').length, '| clashes flagged:', sg.filter(x => x.clash).length);
const byMoney = sg.filter(x => !x.clash).sort((a, b) => b.money - a.money).slice(0, 3); console.log('  uses-what-you-got row:', byMoney.map(x => x.r.title.slice(0, 30) + ' [' + C.baseOf(x.r) + ']').join(' / '));
let pastaRuns = 0, maxPasta = 0;
for (let k = 0; k < 8; k++) {
  const w = C.autoFill({ start: '2026-10-26', days: Array.from({ length: 7 }, () => ({})), carryIn: [] }, ctx, { beam: 3, branch: 5, jitter: 0.6, seed: 's' + k });
  const b = w.days.map(x => C.baseOf(RMAP[x.r])); const p = b.filter(x => x === 'pasta').length; maxPasta = Math.max(maxPasta, p);
  for (let i = 1; i < 7; i++) if (b[i] === b[i - 1] && (b[i] === 'pasta' || b[i] === 'noodles')) pastaRuns++;
  if (k < 3) console.log('week', k, b.join(' '));
}
console.log('back-to-back pasta/noodles in 8 weeks:', pastaRuns, '| max pasta in a week:', maxPasta);
const c = {}; D.forEach(r => { const b = C.baseOf(r); c[b] = (c[b] || 0) + 1; }); console.log('library bases:', JSON.stringify(c));
// arrange: chosen dinners including two pastas and a treat
const pick = [pasta.id, D.find(r => /bolognese/i.test(r.title)).id, D.find(r => /smash/i.test(r.title) || r.category === 'treat').id, D.find(r => /tikka masala/i.test(r.title)).id, D.find(r => /fish/i.test(r.title) && r.protein === 'fish').id];
const t0 = Date.now(); const arr = C.arrangeWeek({ start: '2026-10-26', days: Array.from({ length: 7 }, () => ({})), carryIn: [] }, pick, ctx);
console.log('arranged in', Date.now() - t0, 'ms:', arr.days.map((x, d) => C.DAY_NAMES[d] + ':' + (x.r ? RMAP[x.r].title.slice(0, 18) + '[' + C.baseOf(RMAP[x.r]) + (RMAP[x.r].category === 'treat' ? ',treat' : '') + ',' + RMAP[x.r].time + 'm]' : '-')).join(' | '));
const filled = C.autoFill(arr, ctx, { beam: 3, branch: 5 }); console.log('then filled:', filled.days.map(x => C.baseOf(RMAP[x.r])).join(' '));
