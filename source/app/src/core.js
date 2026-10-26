// ===== Meal planner core logic (pure functions; inlined into the page and tested in node) =====
const SHOPS = [
  { id: 'tesco', name: 'Tesco', loyalty: 'Clubcard' },
  { id: 'sainsburys', name: "Sainsbury's", loyalty: 'Nectar' },
  { id: 'asda', name: 'Asda' },
  { id: 'aldi', name: 'Aldi' },
  { id: 'lidl', name: 'Lidl', loyalty: 'Lidl Plus' },
];
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const AISLE_ORDER = ['Fruit & veg', 'Meat & fish', 'Dairy & eggs', 'Chilled', 'Bakery', 'Frozen',
  'Tins & jars', 'World foods', 'Dry goods', 'Herbs & spices', 'Oils & sauces', 'Other'];
const STALE_DAYS = 60;
const PEOPLE_SERVINGS = 2;
const EPS = 1e-6;

// ---------- dates ----------
function isoDate(d) { const z = new Date(d); return z.getFullYear() + '-' + String(z.getMonth() + 1).padStart(2, '0') + '-' + String(z.getDate()).padStart(2, '0'); }
function parseIso(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(s, n) { const d = parseIso(s); d.setDate(d.getDate() + n); return isoDate(d); }
function daysBetween(a, b) { return Math.round((parseIso(b) - parseIso(a)) / 86400000); }
function mondayOf(s) { const d = parseIso(s); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return isoDate(d); }
function ageDays(checked, today) { if (!checked) return 9999; return daysBetween(checked, today); }

// ---------- formatting ----------
function fmtMoney(x) { if (x == null || isNaN(x)) return '–'; return '£' + x.toFixed(2); }
function fmtQty(q, unit) {
  if (q == null) return '';
  if (unit === 'g' || unit === 'ml') {
    if (q >= 1000) return (Math.round(q / 100) / 10) + (unit === 'g' ? 'kg' : 'L');
    return Math.round(q) + unit;
  }
  const whole = Math.floor(q + EPS), frac = q - whole;
  let f = '';
  if (frac > 0.2 && frac < 0.4) f = '⅓'; else if (frac >= 0.4 && frac < 0.6) f = '½'; else if (frac >= 0.6 && frac < 0.85) f = '¾';
  else if (frac >= 0.85) return String(whole + 1) + (unit === 'clove' ? ' cloves' : '');
  const s = (whole ? String(whole) : (f ? '' : '0')) + f;
  if (unit === 'clove') return s + (q > 1 ? ' cloves' : ' clove');
  return s;
}
function packLabel(ing, size) {
  if (ing.unit === 'g' || ing.unit === 'ml') return fmtQty(size, ing.unit);
  if (ing.unit === 'clove') return size + ' cloves';
  return size === 1 ? 'single' : size + '-pack';
}

// ---------- matching preferences ----------
function norm(s) { return String(s || '').toLowerCase().trim(); }
function termMatchesIng(term, ing) {
  const t = norm(term); if (!t) return false;
  const singular = t.replace(/s$/, '');
  const hay = [norm(ing.name), norm(ing.id).replace(/_/g, ' '), ...(ing.tags || []).map(norm)];
  // whole words only, so "peas" doesn't catch chickpeas and "nut" doesn't catch nutmeg
  const esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('(^|[^a-z])(' + esc(t) + (singular !== t && singular.length > 2 ? '|' + esc(singular) : '') + ')(s|es)?($|[^a-z])');
  return hay.some(h => re.test(h));
}
function termInName(term, name) { const esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); const t = norm(term); if (!t || !name) return false; const sing = t.replace(/(es|s)$/, ''); return new RegExp('(^|[^a-z])(' + esc(t) + (sing !== t && sing.length > 2 ? '|' + esc(sing) : '') + '|' + (t === 'peas' ? 'matar|mattar' : t === 'mushrooms' ? 'mushroom' : '$^') + ')(s|es)?($|[^a-z])').test(name); }
function termMatchesRecipe(term, r) {
  const t = norm(term); if (!t) return false;
  return termInName(t, norm(r.title)) || norm(r.cuisine) === t || norm(r.protein) === t || (r.tags || []).some(x => norm(x) === t);
}
// Returns {ok, swaps:[{person, ingName, note}], dislikes:[{person, what}], likes:[{person, what}]}
// cached per recipe, per list of people and per ingredient set (each is replaced, never changed in place, when it changes)
const prefMemo = new WeakMap(), NOBODY = [];
function checkPrefs(r, people, ING) {
  const pk = people || NOBODY; let m = prefMemo.get(pk);
  if (!m || m.ING !== ING) { m = { ING, map: new WeakMap() }; prefMemo.set(pk, m); }
  let out = m.map.get(r); if (!out) { out = checkPrefsNow(r, people, ING); m.map.set(r, out); }
  return out;
}
function checkPrefsNow(r, people, ING) {
  const out = { ok: true, swaps: [], dislikes: [], likes: [], blocked: [] };
  for (const p of people || []) {
    for (const term of p.wontEat || []) {
      // a dish named after it (Mushroom risotto, Pea & bacon risotto) is out, even if a line could be swapped
      const named = norm(r.short || String(r.title || '').split(/ with | & /i)[0]);
      if ((termMatchesRecipe(term, r) && !r.ingredients.some(l => ING[l.i] && termMatchesIng(term, ING[l.i]))) || termInName(term, named)) {
        out.ok = false; out.blocked.push({ person: p.name, what: term }); continue;
      }
      for (const l of r.ingredients) {
        const ing = ING[l.i]; if (!ing || !termMatchesIng(term, ing)) continue;
        const note = l.swap || ing.separable || (l.opt ? 'It\u2019s optional: leave it off one plate.' : null);
        if (note) out.swaps.push({ person: p.name, ingName: ing.name, note });
        else { out.ok = false; out.blocked.push({ person: p.name, what: ing.name }); }
      }
    }
    for (const term of p.dislikes || []) {
      if (termMatchesRecipe(term, r) || r.ingredients.some(l => ING[l.i] && termMatchesIng(term, ING[l.i]))) out.dislikes.push({ person: p.name, what: term });
    }
    for (const term of p.likes || []) {
      if (termMatchesRecipe(term, r) || r.ingredients.some(l => ING[l.i] && termMatchesIng(term, ING[l.i]))) out.likes.push({ person: p.name, what: term });
    }
  }
  return out;
}

// ---------- prices ----------
// Effective price record for one shop. useLoyalty: Clubcard / Nectar price if present.
function shopPrice(ing, shop, useLoyalty) {
  const p = ing.prices && ing.prices[shop];
  if (!p || !p.price || !p.pack) return null;
  const price = (useLoyalty && p.loyalty) ? p.loyalty : p.price;
  return { pack: p.pack, price, unit: price / p.pack, rec: p };
}
// Unit price used for valuing stock/waste/portion cost: preferred shop, else median of others.
function unitPrice(ing, shop, useLoyalty) {
  const sp = shopPrice(ing, shop, useLoyalty);
  if (sp) return sp.unit;
  const all = SHOPS.map(s => shopPrice(ing, s.id, false)).filter(Boolean).map(x => x.unit).sort((a, b) => a - b);
  if (!all.length) return 0;
  return all[Math.floor(all.length / 2)];
}

// The pack sizes you'd actually buy at this shop: its own product's pack (plus any other sizes recorded for it);
// Tesco's range (or the catalogue sizes) only when that shop's price isn't known.
function packsAt(ing, shop) {
  const p = shop && ing.prices && ing.prices[shop];
  if (shop && shop !== 'tesco' && p && p.pack > 0 && p.price > 0) return [p.pack].concat((p.alt || []).filter(a => a && a.pack > 0).map(a => a.pack));
  return ing.packs && ing.packs.length ? ing.packs : [1];
}
// Choose whole packs to cover `need`, minimising excess then pack count.
function choosePacks(ing, need, shop) {
  const sizes = Array.from(new Set(packsAt(ing, shop))).sort((a, b) => b - a);
  if (need <= EPS) return [];
  let best = null;
  const maxCount = sizes.map(s => Math.ceil(need / s) + 1);
  function rec(k, counts, total) {
    if (k === sizes.length) {
      if (total + EPS < need) return;
      const n = counts.reduce((a, b) => a + b, 0);
      const excess = total - need;
      if (!best || excess < best.excess - EPS || (Math.abs(excess - best.excess) < EPS && n < best.n)) best = { counts: counts.slice(), excess, n, total };
      return;
    }
    for (let c = 0; c <= maxCount[k]; c++) { counts.push(c); rec(k + 1, counts, total + c * sizes[k]); counts.pop(); if (total + c * sizes[k] >= need + sizes[sizes.length - 1]) break; }
  }
  rec(0, [], 0);
  const out = [];
  best.counts.forEach((c, k) => { for (let j = 0; j < c; j++) out.push(sizes[k]); });
  return out;
}

// ---------- the week simulation ----------
// week: {start, days:[{r, extra, extraUse, freezer, takeaway}], carryIn, freezerMeals,
//        bl: {<personId>: {b: [[items] x7], l: [[items] x7]}}}   items = recipe ids, or 'lo' (lunch = leftovers of last night's dinner)
// ctx: {ING, RMAP, settings, pantry:{status,always}, people:[{id, portion, plan:{b,l}, usual:{b:[],l:[]}, days:{b:[],l:[]}}]}
function dinnerPortions(ctx) {
  const ps = (ctx.people || []).filter(p => p.dinner !== false);
  if (!ps.length) return PEOPLE_SERVINGS;
  return ps.reduce((a, p) => a + (Number(p.portion) > 0 ? Number(p.portion) : 1), 0);
}
// what each person eats for breakfast/lunch on day d: stored choice, else their usual on their planned days
function blItems(week, person, slot, d) {
  if (awayOn(week, person, d) === 'day') return [];
  const st = week.bl && week.bl[person.id] && week.bl[person.id][slot];
  if (st && Array.isArray(st[d])) return st[d];
  const plan = person.plan || {};
  if (!plan[slot]) return [];
  // packed lunches follow the rota when the person has shifts from Caledonite this week
  if (slot === 'l' && person.lunchOnShifts && week.shifts && week.shifts[person.id]) { if (!dayShift(week, person, d)) return []; }
  else { const days = (person.days && person.days[slot]) || [0, 1, 2, 3, 4, 5, 6]; if (!days.includes(d)) return []; }
  return ((person.usual && person.usual[slot]) || []).slice();
}
function pantryStatus(ctx, id) { const st = ctx.pantry && ctx.pantry.status; return (st && st[id]) || 'have'; }
// who's in for dinner on night d.
//   away = {personId: {d: 'dinner' | 'day' | 'in'}}  set by hand ('in' overrides a shift)
//   shifts = {personId: {d: {t, s, e, miss}}}       from Caledonite (miss: works through dinner and home after the cut-off)
//   plates = {personId: {d: 'save' | 'skip'}}       their answer to "save you a portion?" (no answer = save one)
function awayOn(week, p, d) {
  const a = week && week.away && week.away[p.id], m = a ? a[d] || a[String(d)] || null : null;
  if (m === 'in') return null; if (m) return m;
  const sh = shiftOn(week, p, d);
  if (sh && sh.miss) { const pl = week.plates && week.plates[p.id]; if (pl && (pl[d] || pl[String(d)]) === 'skip') return 'dinner'; }
  return null;
}
function shiftOn(week, p, d) { const s = week && week.shifts && week.shifts[p.id]; return (s && (s[d] || s[String(d)])) || null; }
// working a day shift (packed lunch day): early, late or long; nights and days off don't count
function dayShift(week, p, d) { const sh = shiftOn(week, p, d); return !!(sh && /^(early|late|long|day)$/.test(sh.t)); }
// on a shift day the person who's home cooks
function cookOn(week, d, people) {
  const eaters = (people || []).filter(p => p.dinner !== false); if (eaters.length < 2) return null;
  // working into the evening (home after about half five), or a night shift; an early shift is home in time to cook
  const hm = t => { const [a, b] = String(t || '0:0').split(':').map(Number); return a * 60 + (b || 0); };
  const working = eaters.filter(p => { const sh = shiftOn(week, p, d); return sh && sh.t !== 'off' && sh.t !== 'leave' && (sh.t === 'night' || !sh.e || hm(sh.e) >= 17 * 60 || hm(sh.e) < hm(sh.s)); });
  if (!working.length || working.length === eaters.length) return null;
  const home = eaters.filter(p => !working.includes(p) && !awayOn(week, p, d));
  return home.length === 1 ? home[0] : null;
}
function guestsOn(week, d) { const day = week && week.days && week.days[d]; return (day && Number(day.guests)) || 0; }
function dinnerPortionsOn(week, d, ctx) {
  const all = ctx.people || [];
  if (!all.length) return PEOPLE_SERVINGS;
  return all.filter(p => p.dinner !== false && !awayOn(week, p, d)).reduce((a, p) => a + (Number(p.portion) > 0 ? Number(p.portion) : 1), 0) + guestsOn(week, d);
}
function nobodyIn(week, d, ctx) { return (ctx.people || []).length > 0 && dinnerPortionsOn(week, d, ctx) === 0; }
// a week can be shopped somewhere other than the usual shop
function withShop(week, ctx) { return week && week.shop && week.shop !== ctx.settings.shop ? { ...ctx, settings: { ...ctx.settings, shop: week.shop } } : ctx; }
function simulate(week, ctx) {
  ctx = withShop(week, ctx);
  const shopId = ctx.settings.shop || 'tesco';
  const { ING, RMAP } = ctx;
  const shop = ctx.settings.shop || 'tesco', loy = ctx.settings.useLoyalty !== false;
  const skipOpt = !!ctx.settings.skipOptional;
  const up = id => unitPrice(ING[id], shop, loy);
  const lots = [];
  for (const c of week.carryIn || []) {
    if (!ING[c.i] || !(c.q > EPS)) continue;
    const exp = c.frozen || !c.exp ? 999 : daysBetween(week.start, c.exp);
    lots.push({ i: c.i, q: c.q, exp, frozen: !!c.frozen, opened: !!c.opened, carried: true });
  }
  const purchases = {}; // id -> {need, packs:[], bought, staple?, forDays?}
  const waste = {};     // id -> qty
  const freezeNotes = [], warnings = [], dayInfo = [], defrostNotes = [];
  const freezerMeals = (week.freezerMeals || []).map(m => ({ ...m }));
  const newFreezerMeals = [];
  const usedFromCarry = {};
  const staplesUsed = {}; // staple id -> day indices it's needed on
  const skippedOpt = [];  // optional lines left out because you'd have to buy them
  const people = ctx.people || [];
  const basePortions = dinnerPortions(ctx);
  // freezer space, counted in "things" (a pack, a bag, a portion of a cooked meal)
  const freezerCap = Number(ctx.settings.freezerSpace) > 0 ? Number(ctx.settings.freezerSpace) : Infinity;
  let inFreezer = lots.filter(L => L.frozen).length + freezerMeals.reduce((a, m) => a + (m.portions || 0), 0);
  const freezerStart = inFreezer; let freezerPeak = inFreezer, freezerFullSkips = 0;
  const roomFor = n => inFreezer + n <= freezerCap;
  const addFrozen = n => { inFreezer += n; freezerPeak = Math.max(freezerPeak, inFreezer); };

  function expire(day) {
    for (let k = lots.length - 1; k >= 0; k--) {
      const L = lots[k];
      if (L.exp < day && L.q > EPS) {
        const ing = ING[L.i];
        if (ing.freeze && !L.frozen && roomFor(1)) { L.frozen = true; L.exp = 999; addFrozen(1); freezeNotes.push({ d: Math.max(0, day - 1), i: L.i, q: L.q }); }
        else {
          if (ing.freeze && !L.frozen) { freezerFullSkips++; warnings.push({ d: Math.max(0, day - 1), i: L.i, full: true, msg: 'The freezer\u2019s full, so the spare ' + ing.name.toLowerCase() + ' can\u2019t go in. Use it up or swap a meal.' }); }
          waste[L.i] = (waste[L.i] || 0) + L.q; lots.splice(k, 1);
        }
      }
    }
  }
  // use `need` of an ingredient line on day d; returns the cost attributed to the meal
  function use(l, need, d, forWhat) {
    const ing = ING[l.i]; if (!ing || !(need > 0)) return 0;
    if (ing.staple) {
      (staplesUsed[l.i] = staplesUsed[l.i] || []).push(d);
      const st = pantryStatus(ctx, l.i);
      if (st !== 'low' && st !== 'out') return need * up(l.i);
      const P = purchases[l.i];
      if (P) { if (!P.forDays.includes(d)) P.forDays.push(d); if (forWhat && !P.forWhat.includes(forWhat)) P.forWhat.push(forWhat); return need * up(l.i); }
      if (l.opt) { skippedOpt.push({ i: l.i, d, staple: true }); return 0; }
      const packs = choosePacks(ing, need, shopId); const total = packs.reduce((a, b) => a + b, 0);
      purchases[l.i] = { need, packs, bought: total, staple: true, forDays: [d], forWhat: forWhat ? [forWhat] : [] };
      return need * up(l.i);
    }
    let remain = need;
    const avail = lots.filter(L => L.i === l.i && L.exp >= d && L.q > EPS).sort((a, b) => a.exp - b.exp);
    for (const L of avail) {
      if (remain <= EPS) break;
      const take = Math.min(L.q, remain);
      L.q -= take; remain -= take;
      if (L.carried) usedFromCarry[l.i] = (usedFromCarry[l.i] || 0) + take;
      if (!L.frozen && ing.unit === 'each') {
        // whole items in a multi-pack stay sealed; only a part-used item goes off quickly
        const whole = Math.floor(L.q + EPS), frac = L.q - whole;
        if (frac > EPS) { L.q = whole; lots.push({ i: l.i, q: frac, exp: Math.min(L.exp, d + ing.keeps), frozen: false, opened: true, carried: L.carried }); }
      } else if (!L.frozen && !L.opened) { L.opened = true; L.exp = Math.min(L.exp, d + ing.keeps); }
      // only the amount used comes out of the freezer; the rest stays frozen (thawed raw food is never refrozen)
      if (L.frozen && ing.aisle === 'Meat & fish') defrostNotes.push({ d, i: l.i, q: take });
    }
    for (let k = lots.length - 1; k >= 0; k--) if (lots[k].q <= EPS) { if (lots[k].frozen) inFreezer--; lots.splice(k, 1); }
    if (remain > EPS) {
      if (l.opt && skipOpt) { skippedOpt.push({ i: l.i, d }); return (need - remain) * up(l.i); }
      const packs = choosePacks(ing, remain, shopId);
      const total = packs.reduce((a, b) => a + b, 0);
      const P = purchases[l.i] || (purchases[l.i] = { need: 0, packs: [], bought: 0 });
      P.need += remain; P.packs.push(...packs); P.bought += total;
      if (d > ing.life) {
        if (ing.freeze && roomFor(1)) { addFrozen(1); freezeNotes.push({ d: -1, i: l.i, q: total, onArrival: true, forDay: d }); if (ing.aisle === 'Meat & fish') defrostNotes.push({ d, i: l.i, q: remain }); }
        else if (ing.freeze) { freezerFullSkips++; warnings.push({ d, i: l.i, full: true, msg: 'No room in the freezer for the ' + ing.name.toLowerCase() + ': buy it nearer ' + DAY_LONG[d] }); }
        else warnings.push({ d, i: l.i, msg: ing.name + ' may not last until ' + DAY_LONG[d] + ' — buy it later in the week' });
      }
      const left = total - remain;
      // frozen on arrival: only the amount needed is defrosted, the rest of the pack stays frozen
      const frozeOnArrival = d > ing.life && ing.freeze && freezeNotes.some(n => n.onArrival && n.i === l.i && n.forDay === d);
      if (frozeOnArrival && left <= EPS) inFreezer--; // the whole pack came out on the day it was needed
      if (left > EPS && frozeOnArrival) lots.push({ i: l.i, q: left, exp: 999, frozen: true, opened: false });
      else if (left > EPS) {
        if (ing.unit === 'each') {
          const whole = Math.floor(left + EPS), frac = left - whole;
          if (whole > 0) lots.push({ i: l.i, q: whole, exp: ing.life, frozen: false, opened: false });
          if (frac > EPS) lots.push({ i: l.i, q: frac, exp: Math.min(ing.life, d + ing.keeps), frozen: false, opened: true });
        } else lots.push({ i: l.i, q: left, exp: Math.min(ing.life, d + ing.keeps), frozen: false, opened: true });
      }
    }
    return need * up(l.i);
  }

  // breakfasts & lunches, per person per day; 'lo' adds a portion to the night before's dinner
  const blPlan = []; const loFor = [0, 0, 0, 0, 0, 0, 0];
  for (let d = 0; d < 7; d++) {
    const today = [];
    for (const p of people) for (const slot of ['b', 'l']) for (const it of blItems(week, p, slot, d)) {
      if (it === 'lo') { if (d > 0) loFor[d - 1]++; today.push({ pid: p.id, slot, lo: true }); }
      else if (RMAP[it]) today.push({ pid: p.id, slot, r: it });
    }
    blPlan.push(today);
  }
  let blCost = 0, blPortions = 0;

  for (let d = 0; d < 7; d++) {
    expire(d);
    const day = (week.days || [])[d] || {};
    const info = { d, cost: 0, perPortion: 0, portions: 0, bl: [] };
    dayInfo.push(info);
    // morning: breakfasts and lunches
    for (const e of blPlan[d]) {
      if (e.lo) { const prev = (week.days || [])[d - 1] || {}; info.bl.push({ ...e, from: prev.r && !prev.takeaway ? prev.r : null }); continue; }
      const r = RMAP[e.r]; let c = 0;
      for (const l of r.ingredients) if (l.q > 0) c += use(l, l.q / (r.servings || 1), d, null);
      blCost += c; blPortions++; info.bl.push({ ...e, cost: c });
    }
    // evening: dinner
    if (day.takeaway) { info.takeaway = true; continue; }
    if (!day.r || !RMAP[day.r]) continue;
    const r = RMAP[day.r];
    if (day.freezer) {
      const fm = freezerMeals.find(m => m.r === day.r && m.portions > 0);
      const nP = dinnerPortionsOn(week, d, ctx);
      if (fm) { const take = Math.min(fm.portions, nP); fm.portions -= take; inFreezer -= take; }
      if (nP) defrostNotes.push({ d, meal: day.r, q: nP });
      info.fromFreezer = true; info.portions = nP; continue;
    }
    const portions = dinnerPortionsOn(week, d, ctx) + (day.extra || 0) + loFor[d];
    if (!(portions > 0)) { info.nobodyIn = true; continue; }
    const factor = portions / (r.servings || 2);
    info.portions = portions; info.forLunch = loFor[d];
    let cost = 0;
    for (const l of r.ingredients) if (l.q > 0) cost += use(l, l.q * factor, d, r.id);
    info.cost = cost; info.perPortion = cost / portions;
    if ((day.extra || 0) > 0 && day.extraUse === 'freeze') {
      if (roomFor(day.extra)) { newFreezerMeals.push({ r: day.r, portions: day.extra }); addFrozen(day.extra); }
      else { freezerFullSkips++; warnings.push({ d, full: true, msg: 'No room in the freezer for ' + day.extra + ' more portion' + (day.extra > 1 ? 's' : '') + '. Have them for lunch instead.' }); }
    }
  }
  // End of week: anything that goes off before next Monday is waste (or frozen if it can be)
  expire(7);
  const carryOut = [];
  for (const L of lots) {
    if (L.q <= EPS) continue;
    carryOut.push({ i: L.i, q: Math.round(L.q * 100) / 100, frozen: L.frozen, opened: L.opened, exp: L.frozen || L.exp >= 900 ? null : addDays(week.start, L.exp) });
  }
  const fmOut = freezerMeals.filter(m => m.portions > 0).concat(newFreezerMeals);

  let wasteValue = 0; for (const id in waste) wasteValue += waste[id] * up(id);
  let leftoverValue = 0; for (const L of carryOut) leftoverValue += L.q * up(L.i);
  let consumed = 0, portions = 0; for (const x of dayInfo) { consumed += x.cost; portions += x.fromFreezer ? 0 : x.portions; }
  const buy = basketTotals(purchases, ctx);
  let stapleCost = 0; for (const row of buy.rows) if (row.staple) stapleCost += row.byShop[buy.prefKey].cost;
  return { purchases, waste, wasteValue, carryOut, freezerOut: fmOut, leftoverValue, freezeNotes, defrostNotes, warnings, dayInfo, freezer: { start: freezerStart, peak: freezerPeak, end: inFreezer, cap: freezerCap, fullSkips: freezerFullSkips }, consumed, portions,
    perPortion: portions ? consumed / portions : 0, buy, usedFromCarry, staplesUsed, skippedOpt, stapleCost, blCost, blPortions };
}

// Price the purchases at every shop. Preferred shop uses the packs the plan bought; other shops cover the same need with their own pack size.
function basketTotals(purchases, ctx, extraRows) {
  const { ING } = ctx;
  const pref = ctx.settings.shop || 'tesco', loy = ctx.settings.useLoyalty !== false;
  const keys = [];
  for (const s of SHOPS) { keys.push({ key: s.id, shop: s.id, loyalty: false }); if (s.loyalty) keys.push({ key: s.id + '+', shop: s.id, loyalty: true }); }
  const totals = {}; keys.forEach(k => totals[k.key] = { total: 0, missing: 0, est: 0, stale: 0, rough: 0 });
  const rows = [];
  const today = ctx.today || isoDate(new Date());
  const ids = Object.keys(purchases);
  for (const id of ids) {
    const ing = ING[id], P = purchases[id];
    const row = { i: id, need: P.need, packs: P.packs, bought: P.bought, staple: !!P.staple, forDays: P.forDays || [], forWhat: P.forWhat || [], always: !!P.always, byShop: {} };
    for (const k of keys) {
      const sp = shopPrice(ing, k.shop, k.loyalty);
      let cost, missing = false, est = false, stale = false, rough = false, count = 0, pack = null;
      if (sp) {
        pack = sp.pack;
        if (k.shop === pref && P.packs.length) { // same shop as the plan: price the exact packs bought
          // price each planned pack proportionally to the shop's recorded pack
          cost = P.packs.reduce((a, size) => a + (Math.abs(size - sp.pack) < EPS ? sp.price : sp.unit * size), 0);
          count = P.packs.length;
        } else { count = Math.max(1, Math.ceil(P.need / sp.pack - 1e-9)); cost = count * sp.price; }
        est = !!sp.rec.est; rough = sp.rec.conf === 'low' || sp.rec.basis === 'model'; stale = ageDays(sp.rec.checked, today) > STALE_DAYS;
      } else {
        missing = true; cost = P.bought * unitPrice(ing, pref, false); est = true;
      }
      row.byShop[k.key] = { cost, missing, est, stale, rough, count, pack };
      const T = totals[k.key]; T.total += cost; if (missing) T.missing++; if (est) T.est++; if (stale) T.stale++; if (rough) T.rough++;
    }
    rows.push(row);
  }
  const prefKey = pref + (loy && SHOPS.find(s => s.id === pref).loyalty ? '+' : '');
  // a shop can only be "cheapest" if nearly everything on the list has a real price there
  const n = rows.length; for (const k of keys) totals[k.key].comparable = totals[k.key].missing <= Math.max(2, Math.floor(n * 0.2));
  let cheapest = null;
  for (const k of keys) { if (!totals[k.key].comparable) continue; if (!cheapest || totals[k.key].total < totals[cheapest].total - EPS) cheapest = k.key; }
  if (!cheapest) cheapest = pref + (loy && SHOPS.find(s => s.id === pref).loyalty ? '+' : '');
  return { rows, totals, keys, prefKey, prefTotal: totals[prefKey].total, cheapest };
}

// ---------- shopping list (purchases + low staples) ----------
function shoppingList(sim, ctx, pantry) {
  const purchases = {};
  for (const id in sim.purchases) purchases[id] = { ...sim.purchases[id] };
  // low staples needed by a meal are already in sim.purchases; 'always buy' ones are added whether or not a meal needs them
  const status = (pantry && pantry.status) || {};
  const always = (pantry && pantry.always) || { milk: true };
  for (const id in status) {
    if (status[id] !== 'low' && status[id] !== 'out') continue;
    const ing = ctx.ING[id]; if (!ing || purchases[id] || !always[id]) continue;
    const size = (ing.packs && ing.packs[0]) || 1;
    purchases[id] = { need: size, packs: [size], bought: size, staple: true, always: true, forDays: [] };
  }
  const basket = basketTotals(purchases, ctx);
  const groups = {};
  for (const row of basket.rows) {
    const aisle = (ctx.ING[row.i].aisle) || 'Other';
    (groups[aisle] = groups[aisle] || []).push(row);
  }
  const aisles = AISLE_ORDER.filter(a => groups[a]).concat(Object.keys(groups).filter(a => !AISLE_ORDER.includes(a)));
  aisles.forEach(a => groups[a].sort((x, y) => ctx.ING[x.i].name.localeCompare(ctx.ING[y.i].name)));
  return { basket, groups, aisles };
}

// ---------- variety / preference penalty for a recipe on day d ----------
// The carb on the plate and the kind of dish, so the week doesn't turn into pasta, pasta, pasta.
const BASE_RE = [
  ['pasta', /\b(pasta|spaghetti|penne|linguine|tagliatelle|lasagne|gnocchi|orzo|macaroni|orecchiette|rigatoni|fusilli|ravioli|tortellini|cannelloni)\b/],
  ['noodles', /\b(noodles?|udon|ramen)\b/],
  ['rice', /\b(rice|basmati|pilau|risotto|biryani|paella)\b/],
  ['bread', /\b(tortillas?|wraps?|tacos?|burritos?|quesadillas?|fajitas?|naan|pitta|flatbreads?|buns?|bread|baguette|pizza|sandwich|toast|bagels?)\b/],
  ['potato', /\b(potato(es)?|chips|mash|wedges|fries|jacket)\b/],
  ['grain', /\b(couscous|bulgur|quinoa)\b/],
];
function baseOf(r) {
  if (!r) return 'none'; if (r.base) return r.base;
  if (r._base) return r._base;
  const hay = (r.title + ' ' + r.ingredients.map(l => l.i.replace(/_/g, ' ')).join(' ')).toLowerCase();
  const t = r.title.toLowerCase();
  // the title decides first (a "burger with fries" is a burger), then the ingredients
  let b = (BASE_RE.find(([, re]) => re.test(t)) || BASE_RE.find(([, re]) => re.test(hay)) || ['none'])[0];
  try { Object.defineProperty(r, '_base', { value: b, enumerable: false }); } catch (e) {}
  return b;
}
function familyOf(r) { return (r && r.family) || baseOf(r) + '_dish'; }
const STRINGY = { pasta: 1, noodles: 1 }; // pasta then noodles still feels like the same dinner twice
const BASE_NEXT = { pasta: 6, noodles: 4, rice: 2.5, bread: 2, potato: 1.5, grain: 2 };   // same carb two nights running
const BASE_WEEK = { pasta: 2, noodles: 2, rice: 3, bread: 3, potato: 3, grain: 2 };        // most per week before it hurts
function varietyPenalty(r, d, days, RMAP) {
  let pen = 0;
  const near = [d - 1, d + 1].map(x => days[x] && days[x].r && RMAP[days[x].r]).filter(Boolean);
  const rb = baseOf(r), rf = familyOf(r);
  for (const n of near) {
    if (n.protein === r.protein) pen += r.protein === 'veggie' ? 1 : 2.5;
    if (n.cuisine === r.cuisine) pen += 1;
    if (baseOf(n) === rb && BASE_NEXT[rb]) pen += BASE_NEXT[rb];
    else if (STRINGY[rb] && STRINGY[baseOf(n)]) pen += 4;
    if (r.family && n.family === r.family) pen += 3;
  }
  let sameProtein = 0, sameCuisine = 0, sameBase = 0, sameFamily = 0;
  days.forEach((x, k) => {
    if (k === d || !x || !x.r || !RMAP[x.r]) return; const o = RMAP[x.r];
    if (o.protein === r.protein) sameProtein++;
    if (o.cuisine === r.cuisine) sameCuisine++;
    if (baseOf(o) === rb) sameBase++;
    if (r.family && o.family === r.family) sameFamily++;
  });
  if (r.protein !== 'veggie' && sameProtein >= 2) pen += 2 * (sameProtein - 1);
  if (sameCuisine >= 2) pen += 2.5 * (sameCuisine - 1);
  if (r.protein === 'veggie') { let veg = 0; days.forEach((x, k) => { if (k !== d && x && x.r && RMAP[x.r] && RMAP[x.r].protein === 'veggie') veg++; }); if (veg >= 3) pen += 1.5 * (veg - 2); }
  if (BASE_WEEK[rb] && sameBase >= BASE_WEEK[rb]) pen += 3 * (sameBase - BASE_WEEK[rb] + 1);
  if (sameFamily >= 2) pen += 3 * (sameFamily - 1);
  return pen;
}
// Why a recipe would make the week samey (shown on cards), or '' if it's fine
function varietyClash(r, d, days, RMAP) {
  const rb = baseOf(r);
  for (const k of [d - 1, d + 1]) {
    const n = days[k] && days[k].r && RMAP[days[k].r]; if (!n) continue;
    const nb = baseOf(n);
    if (STRINGY[rb] && STRINGY[nb]) return (nb === 'pasta' ? 'Pasta' : 'Noodles') + ' the night ' + (k < d ? 'before' : 'after');
    if (r.family && n.family === r.family && r.family !== 'other') return 'Similar to the night ' + (k < d ? 'before' : 'after');
  }
  let sameBase = 0, stringy = 0; days.forEach((x, k) => { if (k !== d && x && x.r && RMAP[x.r]) { const b = baseOf(RMAP[x.r]); if (b === rb) sameBase++; if (STRINGY[b]) stringy++; } });
  if (BASE_WEEK[rb] && sameBase >= BASE_WEEK[rb]) return 'Already ' + sameBase + ' ' + rb + ' dinners this week';
  if (STRINGY[rb] && stringy >= 3) return 'Already ' + stringy + ' pasta or noodle dinners this week';
  return '';
}
function prefScore(pc) { return pc.likes.length * 1.0 - pc.dislikes.length * 1.5 - pc.swaps.length * 0.3; }

function hasEquipment(r, settings) {
  const eq = settings && settings.equipment; if (!eq) return true;
  return (r.equipment || []).every(e => eq[e] !== false);
}
function isTreatDay(d, settings) { return (settings.treatDays || []).includes(d); }
function allowedOnDay(r, d, ctx) {
  const cap = ctx.settings.weeknightCap || 30;
  const dayCap = isTreatDay(d, ctx.settings) ? Math.max(cap, 60) : cap;
  if (d < 5 && r.time > dayCap) return false;
  if (!hasEquipment(r, ctx.settings)) return false;
  return true;
}
// treat nights: treats are wanted on treat days and gently kept off the others
function treatScore(r, d, settings) {
  const treat = r.category === 'treat';
  if (isTreatDay(d, settings)) return treat ? 5 : -3;
  return treat ? -2.5 : 0;
}
// ---------- nutrition (per portion) ----------
function recipeNutrition(r, ING) {
  const out = { kcal: 0, protein: 0, carbs: 0, fat: 0, known: true };
  for (const l of r.ingredients) {
    const ing = ING[l.i]; if (!ing || !(l.q > 0)) continue;
    const n = ing.nut; if (!n) { out.known = false; continue; }
    let q = l.q;
    // frying oil: most of it stays in the pan; count the first 30 ml fully and ~15% of the rest
    if ((l.i === 'oil' || /oil$/.test(l.i)) && q > 30) q = 30 + (q - 30) * 0.15;
    const f = (ing.unit === 'g' || ing.unit === 'ml') ? q / (n.per || 100) : q;
    out.kcal += f * n.kcal; out.protein += f * n.protein; out.carbs += f * n.carbs; out.fat += f * n.fat;
  }
  const s = r.servings || 2;
  return { kcal: Math.round(out.kcal / s), protein: Math.round(out.protein / s), carbs: Math.round(out.carbs / s), fat: Math.round(out.fat / s), known: out.known };
}

// ---------- variety, ratings, recency ----------
function seeded(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 100000) / 100000; }
const STYLE = { save: { money: 1.0, variety: 0.6 }, balanced: { money: 0.55, variety: 1.0 }, variety: { money: 0.3, variety: 1.6 } };
function styleOf(settings) { return STYLE[settings.style] || STYLE.balanced; }
function ratingOf(ctx, rid) { const x = ctx.ratings && ctx.ratings[rid]; return x && x.n ? x.avg : null; }
function excludedByRating(ctx, rid) { const a = ratingOf(ctx, rid); return a != null && a < 3; }
// extra score: rating, how recently it was eaten, cuisine rotation, a little seeded shuffle
function tasteScore(r, d, days, ctx, seed) {
  const st = styleOf(ctx.settings); let s = 0;
  const a = ratingOf(ctx, r.id);
  if (a == null) s += 0.6; else if (a >= 4.5) s += 2.5; else if (a >= 4) s += 1.8; else if (a >= 3) s += 0.4;
  const ago = ctx.recent && ctx.recent[r.id];
  if (ago === 1) s -= 4 * st.variety; else if (ago === 2) s -= 2.5 * st.variety; else if (ago === 3) s -= 1.2 * st.variety;
  const cuisinesThisWeek = new Set(); days.forEach((x, k) => { if (k !== d && x && x.r && ctx.RMAP[x.r]) cuisinesThisWeek.add(ctx.RMAP[x.r].cuisine); });
  if (!cuisinesThisWeek.has(r.cuisine)) s += 1.2 * st.variety;
  if (seed != null) s += (seeded(seed + '|' + r.id) - 0.5) * 2.4 * st.variety;
  return s;
}
// hard limits used when filling a week: at most 2 per cuisine, 2 per main protein (veggie 3), nothing eaten last week
function breaksLimits(r, d, days, ctx) {
  let sameC = 0, sameP = 0;
  days.forEach((x, k) => { if (k === d || !x || !x.r || !ctx.RMAP[x.r]) return; const o = ctx.RMAP[x.r]; if (o.cuisine === r.cuisine) sameC++; if (o.protein === r.protein) sameP++; });
  if (sameC >= 2) return true;
  if (sameP >= (r.protein === 'veggie' ? 3 : 2)) return true;
  if (varietyClash(r, d, days, ctx.RMAP)) return true;
  if (r.protein === 'fish' || r.protein === 'prawns') { let sea = 0; days.forEach((x, k) => { if (k !== d && x && x.r && ctx.RMAP[x.r] && /^(fish|prawns)$/.test(ctx.RMAP[x.r].protein)) sea++; }); if (sea >= 2) return true; }
  if (ctx.recent && ctx.recent[r.id] === 1) return true;
  return false;
}

// cupboard top-ups above the weekly limit count extra, so the cupboard is built up over a few weeks
function overStaple(sim, ctx) { const lim = ctx.settings.stapleBudget == null ? 8 : Number(ctx.settings.stapleBudget); return Math.max(0, (sim.stapleCost || 0) - lim) * 0.6; }
function planCost(sim) { return sim.buy.prefTotal - 0.65 * (sim.stapleCost || 0); }

// ---------- suggestions ----------
// Returns ranked [{r, score, dBuy, dWaste, uses:[{i,q}], usedValue, pc}]
function suggest(week, d, ctx, opts) {
  opts = opts || {};
  const { ING, RECIPES, RMAP } = ctx;
  const base = opts.base || simulate(week, ctx);
  const shop = ctx.settings.shop || 'tesco', loy = ctx.settings.useLoyalty !== false;
  // what's left over that nobody is using yet (end stock + would-be waste)
  const left = {};
  for (const L of base.carryOut) left[L.i] = (left[L.i] || 0) + L.q;
  for (const id in base.waste) left[id] = (left[id] || 0) + base.waste[id];
  const inWeek = new Set((week.days || []).map(x => x && x.r).filter(Boolean));
  const out = [];
  for (const r of RECIPES) {
    if (inWeek.has(r.id)) continue;
    if (!opts.ignoreTime && !allowedOnDay(r, d, ctx)) continue;
    const pc = checkPrefs(r, ctx.people, ING);
    if (!pc.ok) continue;
    if (excludedByRating(ctx, r.id)) continue;
    if (opts.filter && !opts.filter(r)) continue;
    if (opts.hard && breaksLimits(r, d, week.days || [], ctx)) continue;
    const days = (week.days || []).map(x => ({ ...(x || {}) }));
    days[d] = { r: r.id, extra: (days[d] && days[d].extra) || 0, extraUse: days[d] && days[d].extraUse };
    const sim = simulate({ ...week, days }, ctx);
    const dBuy = sim.buy.prefTotal - base.buy.prefTotal;
    const dPlan = planCost(sim) + overStaple(sim, ctx) - planCost(base) - overStaple(base, ctx);
    const dWaste = sim.wasteValue - base.wasteValue;
    const uses = []; let usedValue = 0;
    for (const l of r.ingredients) {
      const ing = ING[l.i]; if (!ing || ing.staple || !left[l.i]) continue;
      const q = Math.min(l.q, left[l.i]);
      if (q > EPS) { uses.push({ i: l.i, q }); usedValue += q * unitPrice(ing, shop, loy) * ((ing.keeps || 0) >= 60 || (!ing.keeps && (ing.life || 0) >= 180) ? 0.25 : 1); }
    }
    const vp = varietyPenalty(r, d, days, RMAP);
    const first = (week.suggestFirst || []).includes(r.id) ? 3 : 0;
    const money = usedValue - dPlan - 0.8 * dWaste;
    const clash = varietyClash(r, d, days, RMAP);
    const wastePen = WASTE_W * dWaste;
    const taste = tasteScore(r, d, days, ctx, opts.seed != null ? opts.seed : week.start + '|' + d);
    const score = money * styleOf(ctx.settings).money - wastePen - vp + prefScore(pc) + treatScore(r, d, ctx.settings) + first + taste + (opts.jitter ? (Math.random() - 0.5) * opts.jitter : 0);
    out.push({ r, score: score - (clash ? 4 : 0), money, taste, dBuy, dWaste, uses, usedValue, pc, vp, sim, clash });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

const WASTE_W = 1.5;
// ---------- whole-week objective & auto-fill ----------
function weekObjective(week, ctx) {
  const sim = simulate(week, ctx);
  let pen = 0;
  week.days.forEach((x, d) => {
    if (!x || !x.r || !ctx.RMAP[x.r]) return;
    const r = ctx.RMAP[x.r];
    pen += varietyPenalty(r, d, week.days, ctx.RMAP) / 2; // each adjacency counted from both sides
    pen -= prefScore(checkPrefs(r, ctx.people, ctx.ING));
    pen -= treatScore(r, d, ctx.settings);
    pen -= tasteScore(r, d, week.days, ctx, null);
  });
  const m = styleOf(ctx.settings).money;
  // waste counts in full whatever the planning style, on top of its cost share
  return { value: (planCost(sim) + overStaple(sim, ctx) + sim.wasteValue - 0.5 * sim.leftoverValue) * m + WASTE_W * sim.wasteValue + pen, sim };
}

function autoFill(week, ctx, opts) {
  opts = opts || {};
  const beam = opts.beam || 4, branch = opts.branch || 6, jitter = opts.jitter || 0;
  const empty = [];
  week.days.forEach((x, d) => { if ((!x || (!x.r && !x.takeaway)) && !nobodyIn(week, d, ctx)) empty.push(d); });
  let states = [{ week: { ...week, days: week.days.map(x => ({ ...(x || {}) })) }, value: 0 }];
  for (const d of empty) {
    const next = [];
    for (const st of states) {
      const base = simulate(st.week, ctx);
      let cands = suggest(st.week, d, ctx, { base, jitter, hard: true, seed: (opts.seed || '') + '|' + d }).slice(0, branch);
      if (!cands.length) cands = suggest(st.week, d, ctx, { base, jitter, seed: (opts.seed || '') + '|' + d }).slice(0, branch);
      for (const c of cands) {
        const days = st.week.days.map(x => ({ ...x }));
        days[d] = { ...days[d], r: c.r.id };
        const w = { ...st.week, days };
        next.push({ week: w, value: weekObjective(w, ctx).value - c.taste * 0.5 + (jitter ? (Math.random() - 0.5) * jitter : 0) });
      }
    }
    if (!next.length) break;
    next.sort((a, b) => a.value - b.value);
    // keep distinct plans
    const seen = new Set(); states = [];
    for (const s of next) { const key = s.week.days.map(x => x.r || '').join('|'); if (seen.has(key)) continue; seen.add(key); states.push(s); if (states.length >= beam) break; }
  }
  return polish(states[0].week, ctx, new Set(empty), opts);
}
// After filling, try swapping filled-in days for dinners that use up whatever is still going to waste.
function polish(week, ctx, editable, opts) {
  opts = opts || {};
  let best = { week, ...weekObjective(week, ctx) };
  for (let pass = 0; pass < 2; pass++) {
    const wasted = Object.keys(best.sim.waste); if (!wasted.length) break;
    const inWeek = new Set(best.week.days.map(x => x && x.r).filter(Boolean));
    const cands = ctx.RECIPES.filter(r => !inWeek.has(r.id) && r.ingredients.some(l => wasted.includes(l.i)) && checkPrefs(r, ctx.people, ctx.ING).ok && !excludedByRating(ctx, r.id))
      .sort((a, b) => b.ingredients.filter(l => wasted.includes(l.i)).length - a.ingredients.filter(l => wasted.includes(l.i)).length).slice(0, 30);
    let improved = false;
    for (const d of editable) {
      for (const r of cands) {
        if (!allowedOnDay(r, d, ctx)) continue;
        const days = best.week.days.map(x => ({ ...x })); const old = days[d];
        if (!old || !old.r) continue;
        if (breaksLimits(r, d, days, ctx)) continue;
        days[d] = { ...old, r: r.id };
        const w = { ...best.week, days }; const o = weekObjective(w, ctx);
        if (o.value < best.value - 0.05) { best = { week: w, ...o }; improved = true; }
      }
    }
    if (!improved) break;
  }
  return best.week;
}

// ---------- takeaway rescue ----------
// The shop for the week is assumed done: stock = what the current plan buys. Try ways to re-plan the rest of
// the week around a takeaway on day d and rank them by waste + anything extra to buy.
function simulateBought(week, bought, ctx) {
  const carry = (week.carryIn || []).slice();
  const status = { ...((ctx.pantry && ctx.pantry.status) || {}) };
  for (const id in bought) { if (ctx.ING[id].staple) { status[id] = 'have'; continue; } carry.push({ i: id, q: bought[id].bought, exp: addDays(week.start, ctx.ING[id].life), opened: false, bought: true }); }
  return simulate({ ...week, carryIn: carry }, { ...ctx, pantry: { ...(ctx.pantry || {}), status } });
}
function rescuePlans(week, d, ctx) {
  const base = simulate(week, ctx);
  const bought = base.purchases;
  const tonight = week.days[d] && week.days[d].r;
  const opts = [];
  const mk = (label, days, bumped, detail) => {
    const w = { ...week, days };
    const sim = simulateBought(w, bought, ctx);
    const extra = sim.buy.prefTotal;
    const score = sim.wasteValue + extra + bumped.length * 0.4 + (detail.moves || 0) * 0.05;
    opts.push({ label, days, bumped, sim, waste: sim.wasteValue, extra, score, detail });
  };
  const old = week.days.map(x => ({ ...(x || {}) }));
  const tk = { takeaway: true, was: tonight || null };
  // 1. just skip tonight
  { const days = old.map(x => ({ ...x })); days[d] = tk; mk('Skip tonight\u2019s dinner', days, [], { moves: 0, skip: tonight }); }
  if (tonight) {
    // 2. shift everything one day later; Sunday's dinner moves to next week
    { const days = old.map(x => ({ ...x })); let bumped = [];
      // takeaway nights, freezer meals and nights nobody's in stay where they are; cooked dinners shift into the free nights
      const fixed = k => k !== d && (old[k].takeaway || old[k].freezer || nobodyIn(week, k, ctx));
      const tail = old.slice(d).filter((x, i) => x.r && !x.takeaway && (i === 0 || !x.freezer));
      for (let k = d; k < 7; k++) if (!fixed(k)) days[k] = {};
      days[d] = tk; let k = d + 1;
      for (const x of tail) { while (k < 7 && fixed(k)) k++; if (k < 7) { days[k] = { ...x }; k++; } else bumped.push(x.r); }
      mk('Move tonight to tomorrow and shift the rest', days, bumped, { moves: tail.length, shift: true }); }
    // 3. swap tonight's recipe into a later day; that day's dinner moves to next week (or fills an empty day)
    for (let k = d + 1; k < 7; k++) {
      const days = old.map(x => ({ ...x })); days[d] = tk;
      const bumped = old[k].r && !old[k].takeaway ? [old[k].r] : [];
      days[k] = { r: tonight, extra: old[d].extra || 0, extraUse: old[d].extraUse };
      mk('Cook it on ' + DAY_LONG[k] + (bumped.length ? ' instead' : ''), days, bumped, { moves: 1, to: k, replaces: bumped[0] || null });
    }
  }
  opts.sort((a, b) => a.score - b.score);
  return { options: opts, base };
}

// ---------- "pick what you fancy": put chosen dinners on the best nights ----------
// Treats go to treat nights, longer recipes to nights that allow them, no pasta (or the same kind of dish) two nights
// running, and perishables are used before they go off (the week objective already counts waste and cost).
function arrangeWeek(week, ids, ctx) {
  const empty = []; week.days.forEach((x, d) => { if ((!x || (!x.r && !x.takeaway)) && !nobodyIn(week, d, ctx)) empty.push(d); });
  ids = ids.filter(id => ctx.RMAP[id]).slice(0, empty.length);
  const treatDays = ctx.settings.treatDays || [];
  const build = slots => { const days = week.days.map(x => ({ ...(x || {}) })); slots.forEach((id, k) => { if (id) days[empty[k]] = { ...days[empty[k]], r: id }; }); return { ...week, days }; };
  const cost = slots => {
    const w = build(slots); let pen = 0;
    slots.forEach((id, k) => {
      if (!id) return; const r = ctx.RMAP[id], d = empty[k];
      if (!allowedOnDay(r, d, ctx)) pen += 25;
      if (varietyClash(r, d, w.days, ctx.RMAP)) pen += 15;
      if (treatDays.length && (r.category === "treat") !== treatDays.includes(d)) pen += 3;
    });
    return weekObjective(w, ctx).value + pen;
  };
  let slots = Array(empty.length).fill(null);
  // place the hardest to fit first: treats, then the longest recipes
  const order = ids.slice().sort((a, b) => (ctx.RMAP[b].category === 'treat') - (ctx.RMAP[a].category === 'treat') || (ctx.RMAP[b].time || 0) - (ctx.RMAP[a].time || 0));
  for (const id of order) {
    let best = -1, bestC = Infinity;
    slots.forEach((x, k) => { if (x) return; const t = slots.slice(); t[k] = id; const c = cost(t); if (c < bestC) { bestC = c; best = k; } });
    if (best >= 0) slots[best] = id;
  }
  // then try swapping pairs of nights until nothing improves
  let cur = cost(slots);
  for (let pass = 0; pass < 4; pass++) {
    let improved = false;
    for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) {
      if (!slots[i] && !slots[j]) continue;
      const t = slots.slice(); [t[i], t[j]] = [t[j], t[i]]; const c = cost(t);
      if (c < cur - 0.01) { slots = t; cur = c; improved = true; }
    }
    if (!improved) break;
  }
  return build(slots);
}

if (typeof module !== 'undefined') module.exports = { dinnerPortionsOn, nobodyIn, awayOn, shiftOn, dayShift, cookOn, guestsOn, packsAt, withShop, SHOPS, DAY_NAMES, DAY_LONG, AISLE_ORDER, STALE_DAYS, isoDate, parseIso, addDays, daysBetween, mondayOf, ageDays, fmtMoney, fmtQty, packLabel,
  termMatchesIng, checkPrefs, recipeNutrition, hasEquipment, isTreatDay, treatScore, rescuePlans, simulateBought, blItems, dinnerPortions, polish, seeded, tasteScore, breaksLimits, excludedByRating, ratingOf, shopPrice, unitPrice, choosePacks, simulate, basketTotals, shoppingList, varietyPenalty, varietyClash, baseOf, familyOf, suggest, weekObjective, autoFill, allowedOnDay, arrangeWeek };
