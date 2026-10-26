// Review fixes in the planner core (plain node, no page). Exits 1 if anything fails.
const Core = require('../src/core.js');
const L = require('../public/data/library.json');
let fails = 0; const ok = (cond, what) => { console.log((cond ? 'ok   ' : 'FAIL ') + what); if (!cond) fails++; };
const ING = {}; L.ingredients.forEach(i => ING[i.id] = i);
const RECIPES = L.recipes.filter(r => !r.meal || r.meal === 'dinner'); const RMAP = {}; L.recipes.forEach(r => RMAP[r.id] = r);
const people = [{ id: 'e', name: 'Ethan' }, { id: 's', name: 'Sophie' }];
const C = { ING, RECIPES, RMAP, people, settings: { shop: 'tesco', useLoyalty: true, weeknightCap: 30, treatDays: [5], equipment: {} }, pantry: { status: {} } };
const ids = RECIPES.slice(0, 7).map(r => r.id);
// Thursday: nobody's in, but a dinner was left on it from before the shifts came in
const week = { start: '2026-10-26', days: ids.map(r => ({ r })), away: { e: { 3: 'dinner' }, s: { 3: 'dinner' } } };
const { options } = Core.rescuePlans(week, 1, C);
const shift = options.find(o => o.detail.shift);
const placed = shift.days.map(x => x.r).filter(Boolean);
ok(new Set(placed).size === placed.length, 'takeaway "shift the rest" never puts the same dinner on two nights');
ok(shift.days[3].r === ids[3], 'a night nobody is in stays as it was');
ok(shift.days[1].takeaway && shift.days[2].r === ids[1], 'tonight moves to tomorrow');
process.exit(fails ? 1 : 0);
