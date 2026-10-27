// ===== Peckish v2 — app layer (plain script; uses window.Core and window.Store) =====
const {
  SHOPS, DAY_NAMES, DAY_LONG, AISLE_ORDER, STALE_DAYS, isoDate, parseIso, addDays, daysBetween, mondayOf, ageDays,
  fmtMoney, fmtQty, packLabel, checkPrefs, recipeNutrition, hasEquipment, shopPrice, unitPrice, simulate, shoppingList,
  suggest, autoFill, rescuePlans, blItems, seeded, baseOf, nobodyIn, awayOn, shiftOn, cookOn, guestsOn,
} = window.Core;
const Store = window.Store;

const TODAY = isoDate(new Date());
const EQUIPMENT = [['hob', 'Hob'], ['oven', 'Oven'], ['grill', 'Grill'], ['microwave', 'Microwave'], ['air_fryer', 'Air fryer'], ['slow_cooker', 'Slow cooker'], ['blender', 'Blender'], ['food_processor', 'Food processor']];
const DEFAULTS = { shop: 'tesco', useLoyalty: true, weeknightCap: 30, monthlyBudget: 450, treatDays: [5], style: 'balanced',
  equipment: { hob: true, oven: true, grill: true, microwave: true, air_fryer: false, slow_cooker: false, blender: false, food_processor: false } };
const CUISINES = ['Italian', 'British', 'American', 'Mexican', 'Middle Eastern', 'Indian', 'Asian'];
const PROTEINS = ['beef', 'pork', 'chicken', 'lamb', 'fish', 'prawns', 'veggie'];
const KCAL_BANDS = [['lt600', 'Under 600 kcal', 0, 600], ['600-800', '600–800', 600, 800], ['800-1000', '800–1,000', 800, 1000], ['gt1000', '1,000+', 1000, 99999]];
const SHOP_KEY_NAMES = { tesco: 'Tesco', 'tesco+': 'Tesco with Clubcard', sainsburys: "Sainsbury's", 'sainsburys+': "Sainsbury's with Nectar", 'lidl+': 'Lidl with Lidl Plus', asda: 'Asda', aldi: 'Aldi', lidl: 'Lidl' };
const UNITS = ['g', 'ml', 'each', 'clove'];

const S = {
  user: null, authReady: false, userDoc: null, household: null, hhError: null,
  tab: 'week', weekStart: mondayOf(TODAY),
  recipes: [], RMAP: {}, ING: {}, people: [], settings: clone(DEFAULTS), pantry: { status: {} },
  week: null, weekLoaded: false, prevWeek: null,
  lib: null, libError: null, thumbs: {}, fullPhotos: {}, photoPrefs: { hidden: {} }, ratings: {}, hist: {}, stepPhotos: {}, timers: [],
  loaded: { recipes: false, ing: false }, online: navigator.onLine,
  sheets: [], cook: null, filters: { q: '', cuisine: '', quick: false, protein: '', category: '', kcal: '', rated: '', meal: '' },
  pick: { q: '', cuisine: '', protein: '', category: '', kcal: '', rated: '' }, expanded: {}, priceQ: '', busy: false,
  confirm: {}, authMode: 'signin', authMsg: '', authBusy: false, onboard: 'choose',
};
const unsub = {}; const RAW = { myR: {}, myI: {}, gotR: false, gotI: false };

// ---------- helpers ----------
function $(sel) { return document.querySelector(sel); }
function h(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function clone(x) { return JSON.parse(JSON.stringify(x)); }
function cuisineClass(c) { return 'c-' + (CUISINES.includes(c) ? c.split(' ')[0] : 'Other'); }
function ratingSummary() {
  if (ratingSummary.src === S.ratings) return ratingSummary.out;
  const out = {};
  for (const rid in S.ratings) { const d = S.ratings[rid] || {}; const vals = Object.keys(d).map(k => num(d[k] && d[k].stars, 0)).filter(v => v >= 1 && v <= 5); if (vals.length) out[rid] = { avg: vals.reduce((a, b) => a + b, 0) / vals.length, n: vals.length }; }
  ratingSummary.src = S.ratings; ratingSummary.out = out; return out;
}
function recentMap() {
  const m = {}; const weeks = [[S.prevWeek, 1], [S.hist[2], 2], [S.hist[3], 3]];
  for (const [w, ago] of weeks) if (w && w.days) w.days.forEach(d => { if (d && d.r && !d.takeaway && !(m[d.r] <= ago)) m[d.r] = ago; });
  return m;
}
function isDinner(r) { return !r.meal || r.meal === 'dinner'; }
// Breakfast and lunch titles come in Title Case; show them in sentence case like the dinners, keeping brand and place names
const KEEP_CAPS = ['Weetabix', 'Rice Krispies', 'Special K', 'Corn Flakes', 'Crunchy Nut', 'Bran Flakes', "Fruit 'n Fibre", 'Shredded Wheat', 'Cheerios', 'Greek', 'Cajun', 'Thai', 'Italian', 'Mexican', 'Moroccan', 'Japanese', 'Korean', 'Coronation', 'Caesar', "Ploughman's"];
const scCache = new Map();
function sentenceCase(t) {
  if (scCache.has(t)) return scCache.get(t);
  let x = t.split(' ').map((wd, i) => /^[A-Z0-9]{2,}$/.test(wd) ? wd : i === 0 ? wd.charAt(0) + wd.slice(1).toLowerCase() : wd.toLowerCase()).join(' ');
  KEEP_CAPS.forEach(k => { x = x.replace(new RegExp('\\b' + k + '\\b', 'gi'), k); });
  scCache.set(t, x); return x;
}
function rt(r) { if (!r) return ''; if (r.short) return r.short; return r.custom || !r.title ? (r.title || '') : sentenceCase(r.title); }
function dinners() { if (dinners.src !== S.recipes) { dinners.src = S.recipes; dinners.out = S.recipes.filter(isDinner); } return dinners.out; }
function weekShop() { return (S.week && S.week.shop) || S.settings.shop; }
function ctx() { return { ING: S.ING, RECIPES: dinners(), RMAP: S.RMAP, people: S.people, settings: weekShop() !== S.settings.shop ? { ...S.settings, shop: weekShop() } : S.settings, today: TODAY, ratings: ratingSummary(), recent: recentMap(), pantry: S.pantry }; }
// the person in the household who is using this phone
function mePerson() { return S.people.find(p => p.uid && p.uid === myUid()) || S.people.find(p => p.id === myUid()) || null; }
// what a night would be without a hand-set "who's in" (shifts and plate answers only)
function naturalAway(w, p, d) { const x = { ...w, away: undefined }; return awayOn(x, p, d); }
function awayVal(w, p, d, wantIn) { return wantIn ? (naturalAway(w, p, d) ? 'in' : null) : 'dinner'; }
function myUid() { return (Store.uid && Store.uid()) || (S.user && S.user.uid) || 'me'; }
function stars(n) { return '★★★★★'.slice(0, Math.round(n)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(n)); }
function weeklyBudget() { return (Number(S.settings.monthlyBudget) || 450) * 12 / 52; }
function prefShopName() { const s = SHOPS.find(x => x.id === weekShop()) || SHOPS[0]; return s.name + (S.settings.useLoyalty !== false && s.loyalty ? ' (' + s.loyalty + ')' : ''); }
function ingName(id) { return S.ING[id] ? S.ING[id].name : id; }
function lowerName(id) { const n = ingName(id); return /^([A-Z]{2}|(Greek|Italian|Thai|Worcestershire|Cajun|Dijon|Chinese|Indian|Mexican|Bramley|Cumberland|Lincolnshire|Jersey)\b)/.test(n) ? n : n.charAt(0).toLowerCase() + n.slice(1); }
function myName() { return (S.user && S.user.name) || 'Someone'; }
// "pork sausages" -> "pork sausage" (only the last word before any brackets)
function singular(name) {
  return String(name).replace(/^([^(]*?)([A-Za-z]+)(\s*(\(.*)?)$/, (m, pre, wd, rest) => {
    let x = wd; if (/(ss|us|is)$/i.test(wd) || wd.length < 4) return m;
    if (/ies$/i.test(wd)) x = wd.slice(0, -3) + 'y'; else if (/(ches|shes|xes|oes)$/i.test(wd)) x = wd.slice(0, -2); else if (/s$/i.test(wd)) x = wd.slice(0, -1);
    return pre + x + rest;
  });
}
function leftText(id, q) {
  const ing = S.ING[id]; if (!ing) return '';
  const pack = (ing.packs && ing.packs[0]) || 1;
  let s = (ing.unit === 'each' ? fmtQty(q, 'each') : fmtQty(q, ing.unit)) + ' ' + (ing.unit === 'each' && q <= 1 + 1e-6 ? singular(lowerName(id)) : lowerName(id));
  if ((ing.unit === 'g' || ing.unit === 'ml') && pack > 1 && q < pack) { const f = q / pack; const fr = f < 0.2 ? 'a little' : f < 0.4 ? '⅓' : f < 0.6 ? '½' : f < 0.85 ? '¾' : 'most'; s += ' (' + fr + (fr.length < 3 ? ' pack' : ' of a pack') + ')'; }
  return s;
}
const costCache = new Map(), nutCache = new Map();
function recipeCost(r) {
  const key = r.id + '|' + S.settings.shop + '|' + S.settings.useLoyalty; if (costCache.has(key)) return costCache.get(key);
  let c = 0; for (const l of r.ingredients) { const ing = S.ING[l.i]; if (ing && l.q > 0) c += l.q * unitPrice(ing, S.settings.shop, S.settings.useLoyalty !== false); }
  c /= (r.servings || 2); costCache.set(key, c); return c;
}
function nut(r) { if (nutCache.has(r.id)) return nutCache.get(r.id); const n = recipeNutrition(r, S.ING); nutCache.set(r.id, n); return n; }
let cacheVer = 0;
function resetCaches() { costCache.clear(); nutCache.clear(); cacheVer++; }
function stepTitle(s) { return typeof s === 'string' ? '' : (s.title || ''); }
function stepText(s) { return typeof s === 'string' ? s : (s.text || ''); }
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2800); }
// "Tue 3 Nov", or "Nov 2027" for anything months away (frozen and long-life food)
function useByText(iso) { const d = parseIso(iso), days = daysBetween(TODAY, iso); return days > 60 ? 'keeps for months' : 'use by ' + d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); }
function fmtWhen(iso) { try { const d = new Date(iso); return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
// a photo someone added: from this household (or you), or from another household using the app
function ourPhoto(p) { return !!p && (p.uid === myUid() || (!!p.hid && !!S.household && p.hid === S.household.id)); }
// someone else's photo shows unless your household hid it (photos are shared with everyone who uses the app)
// a photo someone added is only ever shown as a picture saved in the app, never as a link to another website
const imgOk = x => typeof x === 'string' && /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(x);
// a step photo: ours, or another household's (which says so and can be hidden for this household, like recipe photos)
function stepPhoto(r, k) { const x = (S.stepPhotos[r.id] || {})[k]; if (!x || !imgOk(x.img)) return null; const ours = ourPhoto(x); return { x, ours, hidden: !ours && !!S.photoPrefs.hidden[r.id + '__' + k] }; }
function stepPhotoNote(r, k, sp) { return sp.ours ? '' : ' · <span class="muted">from someone else using Peckish</span> · <button class="linkish small" data-act="hide-photo" data-v="' + h(r.id + '__' + k) + '">Hide this photo</button>'; }
function stepPhotoLink(r, k, sp, cls) {
  if (sp && sp.hidden) return '<button class="linkish small steplink" data-act="unhide-photo" data-v="' + h(r.id + '__' + k) + '">Show the hidden step photo</button>';
  if (sp && !sp.ours) return ''; // only its household can replace it
  return '<label class="linkish ' + cls + ' steplink">' + ICON.camera + (sp ? (cls ? ' Replace step photo' : ' Replace the photo of this step') : ' Add a photo of this step') + '<input type="file" accept="image/*" capture="environment" data-stepphoto="' + h(r.id) + '|' + k + '" hidden></label>';
}
function userPhoto(r) { const p = S.thumbs[r.id]; return p && imgOk(p.thumb) && (ourPhoto(p) || !S.photoPrefs.hidden[r.id]) ? p : null; }
function photoFor(r) {
  const own = userPhoto(r);
  if (own) return { thumb: own.thumb, own: true };
  if (r.photo && r.photo.thumb && !S.photoPrefs.hidden[r.id]) return { thumb: r.photo.thumb, url: r.photo.url, credit: r.photo.credit, licence: r.photo.licence, source: r.photo.source };
  return null;
}
function tileHtml(r, big) {
  const p = photoFor(r);
  if (p) return '<span class="tile photo ' + cuisineClass(r.cuisine) + (big ? ' big' : '') + '" aria-hidden="true" data-icon="' + h(r.icon || '\ud83c\udf7d\ufe0f') + '"><img src="' + h(p.thumb) + '" alt="" loading="lazy" decoding="async" onerror="this.parentNode.classList.remove(\'photo\');this.parentNode.textContent=this.parentNode.dataset.icon"></span>';
  return '<span class="tile ' + (big ? 'big ' : '') + cuisineClass(r.cuisine) + '" aria-hidden="true">' + h(r.icon || '🍽️') + '</span>';
}
const ICON = {
  week: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  recipes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z"/><path d="M4 17a3 3 0 0 1 3-3h11"/></svg>',
  shop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18l-2 11H5z"/><path d="M8 6l2-3M16 6l-2-3"/><circle cx="9" cy="20" r="1"/><circle cx="16" cy="20" r="1"/></svg>',
  kitchen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="7" width="12" height="14" rx="2"/><path d="M8 3h8v4H8zM6 12h12"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
  left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  tick: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
  snow: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h13l-3-3M20 16H7l3 3"/></svg>',
  timer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>',
  bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14l-1 13H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
  google: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.8 3.6-4.9 6.7-4.9z"/></svg>',
};

// ---------- data: library + household overlays ----------
async function loadLibrary() {
  try {
    const res = await fetch('data/library.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    S.lib = await res.json(); S.libError = null; rebuild();
  } catch (e) { S.libError = 'Couldn’t load the recipe library. Connect to the internet once so it can be saved on this phone.'; schedule(); }
}
// spell out spoon measures ("2 tbsp" -> "2 tablespoons"), so nobody has to decode abbreviations
const SPOON_RE = /(\(?([\d½¼¾⅓⅔.]+(?:\s*[–-]\s*[\d½¼¾⅓⅔.]+)?)\s+(?:(heaped|level|rounded)\s+)?)?\b(tbsps?|tbs|tsps?)\b/gi;
function spellSpoons(text) {
  if (!text || !/\b(tbsp|tbs|tsp)/i.test(text)) return text;
  return text.replace(SPOON_RE, (m, pre, num, adj, unit) => {
    const word = /^tb/i.test(unit) ? 'tablespoon' : 'teaspoon';
    const one = !num || /^(1|½|¼|¾|⅓|⅔|0?\.\d+)$/.test(num.trim());
    let out = word + (one ? '' : 's');
    if (unit[0] === unit[0].toUpperCase() && !pre) out = out[0].toUpperCase() + out.slice(1);
    return (pre || '') + out;
  });
}
function spellRecipe(r) {
  if (!r || r._spelt) return r;
  r.ingredients = (r.ingredients || []).map(l => (l.t && /\b(tbsp|tbs|tsp)/i.test(l.t) ? { ...l, t: spellSpoons(l.t) } : l));
  r.steps = (r.steps || []).map(st => (typeof st === 'string' ? spellSpoons(st) : { ...st, text: spellSpoons(st.text), title: spellSpoons(st.title) }));
  Object.defineProperty(r, '_spelt', { value: true, enumerable: false });
  return r;
}
// Records come from either phone, a backup file or the sheet: numbers stay numbers, dates stay dates and words stay
// words before anything is shown, so an odd value can't break a page or end up as part of it
const num = (x, d) => { const n = typeof x === 'number' ? x : typeof x === 'string' && x.trim() !== '' ? Number(x) : NaN; return Number.isFinite(n) ? n : d; };
const txt = x => (typeof x === 'string' ? x : typeof x === 'number' ? String(x) : '');
const isoOk = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x);
const hhmm = x => typeof x === 'string' && /^\d{1,2}:\d{2}$/.test(x);
function tidyPrice(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  const x = { ...p };
  ['pack', 'price', 'loyalty', 'was'].forEach(k => { if (k in x) x[k] = num(x[k], null); });
  ['checked', 'seen'].forEach(k => { if (k in x && !isoOk(x[k])) delete x[k]; });
  ['src', 'label', 'note', 'basis', 'conf'].forEach(k => { if (k in x) x[k] = txt(x[k]); });
  if ('alt' in x) x.alt = (Array.isArray(x.alt) ? x.alt : []).map(a => ({ pack: num(a && a.pack, 0) })).filter(a => a.pack > 0);
  return x;
}
function tidyIng(over) {
  const x = { ...over };
  ['name', 'aisle', 'separable'].forEach(k => { if (k in x) x[k] = txt(x[k]); });
  if ('unit' in x && !UNITS.includes(x.unit)) x.unit = 'each';
  if ('packs' in x) { x.packs = (Array.isArray(x.packs) ? x.packs : []).map(p => num(p, 0)).filter(p => p > 0); if (!x.packs.length) x.packs = [1]; }
  ['keeps', 'life'].forEach(k => { if (k in x) x[k] = num(x[k], 3); });
  if ('tags' in x) x.tags = (Array.isArray(x.tags) ? x.tags : []).map(txt);
  if ('nut' in x) x.nut = x.nut && typeof x.nut === 'object' ? { per: num(x.nut.per, 100), kcal: num(x.nut.kcal, 0), protein: num(x.nut.protein, 0), carbs: num(x.nut.carbs, 0), fat: num(x.nut.fat, 0) } : undefined;
  if ('prices' in x) { const pr = {}; for (const sh in (x.prices && typeof x.prices === 'object' ? x.prices : {})) { const p = tidyPrice(x.prices[sh]); if (p) pr[sh] = p; } x.prices = pr; }
  return x;
}
function tidyRecipe(x) {
  const r = { ...x, time: num(x.time, 0), servings: num(x.servings, 0) > 0 ? num(x.servings, 2) : 2 };
  ['title', 'icon', 'cuisine', 'protein', 'category', 'meal', 'short', 'airFryer', 'batch', 'base', 'family'].forEach(k => { if (k in r) r[k] = txt(r[k]); });
  if ('keepsDays' in r) r.keepsDays = num(r.keepsDays, 0);
  ['equipment', 'tags'].forEach(k => { if (k in r) r[k] = (Array.isArray(r[k]) ? r[k] : []).map(txt); });
  if (Array.isArray(r.ingredients)) r.ingredients = r.ingredients.filter(l => l && typeof l === 'object').map(l => { const o = { ...l, i: txt(l.i), q: num(l.q, 0), t: txt(l.t) }; if ('swap' in l) o.swap = txt(l.swap) || undefined; return o; });
  if ('steps' in r) r.steps = (Array.isArray(r.steps) ? r.steps : []).map(s => (s && typeof s === 'object' ? { ...s, title: txt(s.title), text: txt(s.text) } : txt(s)));
  if (r.source && typeof r.source === 'object') r.source = { ...r.source, title: txt(r.source.title), site: txt(r.source.site), author: txt(r.source.author), url: txt(r.source.url) };
  else delete r.source;
  return r;
}
function tidyWeek(w) {
  w.carryIn = (Array.isArray(w.carryIn) ? w.carryIn : []).filter(c => c && typeof c === 'object').map(c => ({ ...c, i: txt(c.i), q: num(c.q, 0), exp: isoOk(c.exp) ? c.exp : null }));
  w.freezerMeals = (Array.isArray(w.freezerMeals) ? w.freezerMeals : []).filter(m => m && typeof m === 'object').map(m => ({ ...m, r: txt(m.r), portions: num(m.portions, 0) }));
  w.days = w.days.map(d => { if (!d || typeof d !== 'object') return {}; const x = { ...d }; if ('r' in x) x.r = txt(x.r); if ('guests' in x) x.guests = num(x.guests, 0); if ('extra' in x) x.extra = num(x.extra, 0); if ('extraUse' in x && x.extraUse !== 'freeze') x.extraUse = 'lunch'; return x; });
  w.extras = (Array.isArray(w.extras) ? w.extras : []).filter(e => e && typeof e === 'object').map(e => ({ ...e, name: txt(e.name) }));
  if (w.locked && typeof w.locked === 'object') w.locked = { ...w.locked, by: txt(w.locked.by) };
  return w;
}
function tidyPerson(p) {
  const x = { ...p, name: txt(p.name) };
  ['wontEat', 'dislikes', 'likes'].forEach(k => { x[k] = (Array.isArray(p[k]) ? p[k] : []).map(txt).filter(Boolean); });
  ['kcalTarget', 'proteinTarget'].forEach(k => { if (k in x) x[k] = num(x[k], null); });
  if ('portion' in x) x.portion = num(x.portion, 1);
  return x;
}
function tidySettings(s) {
  const x = { ...s };
  ['weeknightCap', 'monthlyBudget'].forEach(k => { x[k] = num(x[k], DEFAULTS[k]); });
  ['stapleBudget', 'freezerSpace'].forEach(k => { if (k in x) x[k] = num(x[k], k === 'stapleBudget' ? 8 : 0); });
  x.treatDays = (Array.isArray(x.treatDays) ? x.treatDays : []).map(d => num(d, -1)).filter(d => d >= 0 && d < 7);
  if ('lateCutoff' in x && !hhmm(x.lateCutoff)) delete x.lateCutoff;
  if (x.remind && typeof x.remind === 'object' && 'cookAt' in x.remind && !hhmm(x.remind.cookAt)) x.remind = { ...x.remind, cookAt: '18:00' };
  if (!SHOPS.some(sh => sh.id === x.shop)) x.shop = DEFAULTS.shop;
  return x;
}
function tidyShop(t) { return { ...t, amount: num(t.amount, 0), date: isoOk(t.date) ? t.date : '', shop: txt(t.shop), note: txt(t.note) }; }
function rebuild() {
  if (!S.lib) return;
  const recipes = {}; for (const r of S.lib.recipes) recipes[r.id] = r;
  // a recipe you've added or edited keeps the library's stock photo (if it has one), never a web address saved with it
  for (const id in RAW.myR) { const x = RAW.myR[id]; if (x.hidden) delete recipes[id]; else { const lib = recipes[id] && !RAW.myR[id].custom ? S.lib.recipes.find(r => r.id === id) : null; recipes[id] = { ...tidyRecipe(x), id, photo: lib ? lib.photo : undefined }; } }
  const all = Object.values(recipes).filter(r => r && r.title && Array.isArray(r.ingredients)).sort((a, b) => a.title.localeCompare(b.title));
  all.forEach(spellRecipe);
  S.RMAP = {}; all.forEach(r => S.RMAP[r.id] = r);
  S.recipes = all.filter(r => !r.retired); // retired recipes still open from old weeks, but aren't offered any more
  const ing = {}; for (const i of S.lib.ingredients) ing[i.id] = i;
  for (const id in RAW.myI) {
    const lib = ing[id], over = tidyIng(RAW.myI[id]);
    if (!lib) { ing[id] = { packs: [1], unit: 'each', keeps: 3, life: 7, ...over, name: over.name || id, prices: over.prices || {}, id }; continue; }
    // your own edits only change what you changed: staple, and the prices you entered. For each shop the newer price wins,
    // so a refreshed library price replaces an old copy, but a receipt you logged today stays.
    const prices = { ...(lib.prices || {}) };
    for (const sh in (over.prices || {})) { const o = over.prices[sh], l = prices[sh]; if (!o) continue; if (!l || (o.checked || '') >= (l.checked || '') || /receipt|in app/i.test(o.src || '')) { if (o.removed) delete prices[sh]; else prices[sh] = o; } }
    const extra = {}; for (const k in over) if (!(k in lib)) extra[k] = over[k];
    ing[id] = { ...lib, ...extra, staple: 'staple' in over ? over.staple : lib.staple, prices, id };
  }
  S.ING = ing; resetCaches();
  S.loaded.recipes = RAW.gotR; S.loaded.ing = RAW.gotI; schedule();
  maybeAutoBackup();
}
function unsubAll(keys) { for (const k of keys) { if (unsub[k]) { try { unsub[k](); } catch (e) {} delete unsub[k]; } } }
function onSubErr(e) { console.warn('sync error', e); if (e && e.code === 'permission-denied') { S.hhError = 'You don’t have access to this household any more.'; schedule(); } }
function subscribeHousehold(hid) {
  unsubAll(['hh', 'recipes', 'ing', 'people', 'settings', 'pantry', 'thumbs', 'photoPrefs', 'ratings', 'week', 'prev', 'thisW', 'nextW', 'backup', 'shops']);
  S.backup = null; autoTried = false;
  S.weekPicked = false; curHid = hid;
  Store.setHousehold(hid); pruneWeekCopies(hid); linkScope(hid);
  RAW.myR = {}; RAW.myI = {}; RAW.gotR = false; RAW.gotI = false; S.thumbs = {}; S.fullPhotos = {};
  // nothing from the household you were in carries over while this one loads
  S.pendingRestore = null; RAW.people = {}; S.people = []; S.settings = clone(DEFAULTS); S.pantry = { status: {} }; S.pantryRaw = null; S.photoPrefs = { hidden: {} }; S.ratings = {}; S.shopsLog = null; S.thisWeekDoc = null; S.histAll = null; S.histCost = {};
  unsub.hh = Store.watchHousehold(hid, hh => { S.household = hh; if (hh && Store.touchMember && S.user) Store.touchMember(hh, S.user); schedule(); }, onSubErr);
  unsub.backup = Store.sub('config/backup', d => { S.backup = d || null; schedule(); maybeAutoBackup(); }, () => {});
  unsub.recipes = Store.sub('recipes', docs => { RAW.myR = {}; docs.forEach(d => RAW.myR[d.id] = d); RAW.gotR = true; rebuild(); }, onSubErr);
  unsub.ing = Store.sub('ingredients', docs => { RAW.myI = {}; docs.forEach(d => RAW.myI[d.id] = d); RAW.gotI = true; rebuild(); }, onSubErr);
  unsub.people = Store.sub('people', docs => { RAW.people = {}; docs.forEach(d => { const x = clone(d); delete x.id; RAW.people[d.id] = x; }); S.people = docs.map(tidyPerson).sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0)); schedule(); if (S.cal.user && !S.cal.at && !S.cal.busy) setTimeout(() => calRefresh(true), 500); }, onSubErr);
  unsub.settings = Store.sub('config/settings', d => { S.settings = tidySettings({ ...clone(DEFAULTS), ...(d || {}) }); S.settings.equipment = { ...DEFAULTS.equipment, ...((d && d.equipment) || {}) }; resetCaches(); schedule(); }, onSubErr);
  unsub.pantry = Store.sub('config/pantry', d => { S.pantryRaw = d ? clone(d) : null; S.pantry = d ? clone(d) : { status: {} }; if (!S.pantry.status) S.pantry.status = {}; schedule(); }, onSubErr);
  unsub.photoPrefs = Store.sub('config/photoPrefs', d => { S.photoPrefs = d && d.hidden ? clone(d) : { hidden: {} }; schedule(); }, onSubErr);
  unsub.thumbs = Store.subG('dishThumbs', docs => { S.thumbs = {}; docs.forEach(d => S.thumbs[d.id] = d); schedule(); }, () => {});
  unsub.shops = Store.sub('shops', docs => { S.shopsLog = docs.map(tidyShop); schedule(); if (S.bg.cfg && (S.bg.wantSync || docs.some(t => t.budgie && (t.budgie.state === 'queued' || (t.removed && t.budgie.tid))))) { S.bg.wantSync = false; setTimeout(bgSyncShops, 800); } }, onSubErr);
  unsub.ratings = Store.sub('ratings', docs => { const m = {}; docs.forEach(d => { const x = { ...d }; delete x.id; m[d.id] = x; }); S.ratings = m; schedule(); }, onSubErr);
  subscribeWeek();
  // Always keep this week and next week on the phone, so the plan and list are there offline in the shop.
  const thisW = mondayOf(TODAY), nextW = addDays(thisW, 7); const seen = {};
  const pickWeek = () => {
    if (!('a' in seen) || !('b' in seen) || S.weekPicked) return; S.weekPicked = true;
    // From Friday, or when this week has nothing left to cook, open next week if it has a plan: that's the one being shopped for
    const today = daysBetween(thisW, TODAY), left = (seen.a && seen.a.days || []).slice(today).some(x => x && (x.r || x.takeaway));
    const nextPlanned = !!(seen.b && (seen.b.days || []).some(x => x && (x.r || x.takeaway)));
    const a = seen.a || {}, sorted = !!a.locked || (a.days || []).filter(x => x && (x.r || x.takeaway)).length >= 7;
    // Friday to Sunday: once this week is locked in or every night is filled (or next week is already planned), open next week
    if (S.weekStart === thisW && ((today >= 4 && (sorted || nextPlanned)) || (!left && nextPlanned))) { S.weekStart = nextW; subscribeWeek(); render(); }
  };
  const got = (k, start) => (d, meta) => { d = decWeek(withCopy(start, d, meta)); if (d) saveWeekCopy(start, d); else if (!S.online || (meta && meta.cache)) d = loadWeekCopy(start); seen[k] = d; if (k === 'a') { S.thisWeekDoc = d ? normWeek(clone(d), start) : null; schedule(); } pickWeek(); };
  unsub.thisW = Store.sub('weeks/' + thisW, got('a', thisW), () => { seen.a = loadWeekCopy(thisW); pickWeek(); });
  unsub.nextW = Store.sub('weeks/' + nextW, got('b', nextW), () => { seen.b = loadWeekCopy(nextW); pickWeek(); });
  setTimeout(() => { calStart(); if (S.bg.cfg) bgCall([], false).then(bgSyncShops).catch(e => { S.bg.err = e.message || String(e); schedule(); }); }, 2500);
}
// A plain backup of recent weeks on this phone, used only when offline and the database has no saved copy
function weekKey(start) { return 'esk-wk:' + (S.userDoc && S.userDoc.current) + ':' + start; }
// Offline, with the database's saved copy gone but the phone's plain copy still there: a change made now (a tick in the
// shop) is held by the database as just the fields that changed. Show it on top of the plain copy, not as the whole week.
// (The plain copy follows every change, so laying the database's version over it is right when both are there too.)
function withCopy(start, d, meta) {
  if (!d || !meta || !meta.cache || !meta.pending) return d;
  const c = loadWeekCopy(start); if (!c) return d;
  const x = encWeek(c); for (const k in d) x[k] = deepMerge(x[k], d[k]);
  return x;
}
// changed fields laid over the copy at every level (one person's night out, over their other nights)
function deepMerge(a, b) { if (!isObj(a) || !isObj(b)) return b; const x = { ...a }; for (const k in b) x[k] = deepMerge(a[k], b[k]); return x; }
// only this household's recent weeks are kept (Caledonite shows tonight's dinner from these copies, so another
// household's plan mustn't linger here, and old weeks needn't pile up)
function pruneWeekCopies(hid) {
  try {
    const keep = addDays(mondayOf(TODAY), -28), gone = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i), m = k && /^esk-wk:([^:]*):(\d{4}-\d{2}-\d{2})$/.exec(k); if (m && (m[1] !== hid || m[2] < keep)) gone.push(k); }
    gone.forEach(k => localStorage.removeItem(k));
  } catch (e) {}
}
function saveWeekCopy(start, d) { if (!d) return; try { localStorage.setItem(weekKey(start), JSON.stringify(d)); } catch (e) {} }
function loadWeekCopy(start) { try { const x = localStorage.getItem(weekKey(start)); return x ? decWeek(JSON.parse(x)) : null; } catch (e) { return null; } }
// Weeks are stored with days and extras as maps (days.d0 … days.d6, extras.<id>) so each phone writes only the night or item it
// changed. Older weeks stored them as arrays; the app works with arrays, and the first edit converts an old week.
// Breakfasts and lunches are a list for each day, so they're stored by day ({"0": [...], "3": [...]}): the database can't
// hold a list of lists.
const blMap = (o, f) => { const x = {}; for (const k in o) x[k] = f(o[k]); return x; };
const blDec = v => (isObj(v) ? Array.from({ length: 7 }, (_, k) => (Array.isArray(v[k]) ? v[k] : null)) : v);
const blEnc = v => { if (!Array.isArray(v)) return v; const m = {}; v.forEach((x, k) => { if (Array.isArray(x)) m[k] = x; }); return m; };
function decWeek(d) {
  if (!d) return d; const x = { ...d };
  if (isObj(x.bl)) x.bl = blMap(x.bl, s => (isObj(s) ? blMap(s, blDec) : s));
  if (x.days && !Array.isArray(x.days)) x.days = Array.from({ length: 7 }, (_, k) => x.days['d' + k] || {});
  if (Array.isArray(x.extras)) x.extras = x.extras.map((e, k) => ({ id: e.id || 'x' + k, ...e }));
  else if (x.extras) x.extras = Object.keys(x.extras).map(id => ({ ...x.extras[id], id })).sort((a, b) => (a.o || 0) - (b.o || 0) || (a.id < b.id ? -1 : 1));
  return x;
}
function encWeek(w) {
  if (!w) return w; const x = { ...w };
  if (isObj(x.bl)) x.bl = blMap(x.bl, s => (isObj(s) ? blMap(s, blEnc) : s));
  if (Array.isArray(x.days)) { const m = {}; x.days.forEach((d, k) => { if (d && Object.keys(d).length) m['d' + k] = d; }); x.days = m; }
  if (Array.isArray(x.extras)) { const m = {}; x.extras.forEach((e, k) => { const { id, ...rest } = e; m[SAFE_KEY.test(id || '') ? id : 'x' + k] = { ...rest, o: rest.o != null ? rest.o : k }; }); x.extras = m; }
  return x;
}
function subscribeWeek() {
  unsubAll(['week', 'prev']);
  const start = S.weekStart; S.week = null; S.prevWeek = null; S.weekLoaded = false;
  unsub.week = Store.sub('weeks/' + start, (d, meta) => {
    if (start !== S.weekStart) return;
    d = withCopy(start, d, meta);
    const legacy = !!(d && Array.isArray(d.days)); d = decWeek(d);
    if (d) saveWeekCopy(start, d);
    else if (!S.online || (meta && meta.cache)) { const c = loadWeekCopy(start); if (c) d = c; }
    S.weekRaw = d ? { start, doc: clone(d), legacy } : null;
    S.week = d ? normWeek(clone(d), start) : null; S.weekLoaded = true; schedule();
  }, e => { onSubErr(e); if (start !== S.weekStart) return; const c = loadWeekCopy(start); if (c && !S.week) S.week = normWeek(clone(c), start); S.weekLoaded = true; schedule(); });
  unsub.prev = Store.sub('weeks/' + addDays(start, -7), d => { if (start !== S.weekStart) return; d = decWeek(d); S.prevWeek = d ? normWeek(clone(d), addDays(start, -7)) : null; schedule(); }, onSubErr);
  S.hist = {};
  [2, 3].forEach(k => Store.get('weeks/' + addDays(start, -7 * k)).then(d => { if (start !== S.weekStart) return; S.hist[k] = decWeek(d); schedule(); }));
}
function normWeek(w, start) {
  w = Object.assign(w, decWeek(w)); w.start = start; w.days = Array.from({ length: 7 }, (_, k) => (w.days && w.days[k]) || {});
  w.checked = isObj(w.checked) ? w.checked : {};
  w.bumped = Array.isArray(w.bumped) ? w.bumped : []; w.suggestFirst = Array.isArray(w.suggestFirst) ? w.suggestFirst : [];
  return tidyWeek(w);
}
// Carry-overs are worked out live from what last week actually planned. Nothing planned last week = nothing carried.
// Only when someone edits the list in the Kitchen tab (carryEdited) is it kept as typed.
function weekHasDinners(w) { return !!(w && w.days && w.days.some(d => d && (d.r || d.takeaway))); }
function carryFromPrev() {
  const p = S.prevWeek;
  if (!p || !S.lib) return { carryIn: [], freezerMeals: [], suggestFirst: [] };
  const suggestFirst = (p.bumped || []).filter(id => S.RMAP[id]);
  if (!weekHasDinners(p)) return { carryIn: p.carryEdited ? p.carryIn : [], freezerMeals: p.carryEdited ? p.freezerMeals : [], suggestFirst };
  const older = [2, 3].map(k => S.hist[k] ? normWeek(clone(S.hist[k]), addDays(S.weekStart, -7 * k)) : null);
  const key = stable([p, older]) + '|' + cacheVer + '|' + stable(S.people) + '|' + stable(S.pantry) + '|' + stable(S.settings);
  if (carryMemo.key !== key) carryMemo = { key, val: carryInto(p, older) };
  return { ...carryMemo.val, suggestFirst };
}
let carryMemo = {};
// What a week passes on: its own carry-in (worked out from the week before, up to three weeks back, so frozen food
// isn't forgotten after one week) plus what it buys, minus what it cooks. Each week is priced at its own shop.
function carryInto(p, older) {
  if (!p) return { carryIn: [], freezerMeals: [] };
  if (!weekHasDinners(p)) return { carryIn: p.carryEdited ? p.carryIn : [], freezerMeals: p.carryEdited ? p.freezerMeals : [] };
  const inn = p.carryEdited ? { carryIn: p.carryIn, freezerMeals: p.freezerMeals } : older.length ? carryInto(older[0], older.slice(1)) : { carryIn: [], freezerMeals: [] };
  const sim = simulate({ ...p, ...inn }, { ...ctx(), settings: S.settings });
  return { carryIn: sim.carryOut, freezerMeals: sim.freezerOut };
}
function currentWeek() {
  const base = S.week || normWeek({ days: [], checked: {}, extras: [] }, S.weekStart);
  if (base.carryEdited) return base;
  const c = carryFromPrev();
  return { ...base, carryIn: c.carryIn, freezerMeals: c.freezerMeals, suggestFirst: c.suggestFirst };
}
function mutateCarry(fn) { mutateWeek(w => { fn(w); w.carryEdited = true; }); }
function save(rel, data) { Store.set(rel, data).catch(e => { console.warn(e); toast(e && e.code === 'permission-denied' ? 'You can’t change this household.' : 'Couldn’t save that change.'); }); }
// Both phones can change the same week at once (ticking the list in the shop, offline). Writing only the fields
// that changed means one phone's ticks never wipe out the other's.
const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
function stable(x) { return isObj(x) ? '{' + Object.keys(x).sort().map(k => JSON.stringify(k) + ':' + stable(x[k])).join(',') + '}' : Array.isArray(x) ? '[' + x.map(stable).join(',') + ']' : JSON.stringify(x === undefined ? null : x); }
const SAFE_KEY = /^[A-Za-z0-9_]+$/;
const DEEP = { away: true, plates: true };
function diffFields(a, b) {
  a = a || {}; b = b || {}; const out = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (stable(a[k]) === stable(b[k])) continue;
    if (!SAFE_KEY.test(k)) return null; // can't address this field on its own: write the whole document
    const A = isObj(a[k]) ? a[k] : a[k] === undefined ? {} : null;
    if (A && isObj(b[k]) && Object.keys(b[k]).concat(Object.keys(A)).every(x => SAFE_KEY.test(x))) {
      for (const sk of new Set([...Object.keys(A), ...Object.keys(b[k])])) {
        if (stable(A[sk]) === stable(b[k][sk])) continue;
        // who's in and plate answers are kept per person per night, so both phones can change different nights at once
        const A2 = isObj(A[sk]) ? A[sk] : A[sk] === undefined ? {} : null, B2 = b[k][sk];
        if (DEEP[k] && A2 && isObj(B2) && Object.keys(B2).concat(Object.keys(A2)).every(x => SAFE_KEY.test(x))) { for (const x of new Set([...Object.keys(A2), ...Object.keys(B2)])) if (stable(A2[x]) !== stable(B2[x])) out[k + '.' + sk + '.' + x] = B2[x] === undefined ? Store.DEL : B2[x]; }
        else out[k + '.' + sk] = B2 === undefined ? Store.DEL : B2;
      }
    } else out[k] = b[k] === undefined ? Store.DEL : b[k];
  }
  return out;
}
function saveDiff(rel, before, after, whole) {
  const fields = Store.patch ? diffFields(before || {}, after) : null;
  // an older-format field (an array) can't be patched part by part: write it whole once
  if (fields && whole) whole.forEach(f => { Object.keys(fields).forEach(x => { if (x.startsWith(f + '.')) delete fields[x]; }); fields[f] = after[f] === undefined ? Store.DEL : after[f]; });
  if (fields && !Object.keys(fields).length) return;
  const p = fields ? Store.patch(rel, fields) : Store.set(rel, after);
  p.catch(e => { console.warn(e); toast(e && e.code === 'permission-denied' ? 'You can\u2019t change this household.' : 'Couldn\u2019t save that change.'); });
}
function mutateWeek(fn) {
  if (!S.weekLoaded) { toast('This week is still loading. Try again in a moment.'); return; }
  const w = clone(currentWeek()); fn(w); w.updated = new Date().toISOString(); w.updatedBy = myName();
  if (!w.carryEdited) { delete w.carryIn; delete w.freezerMeals; delete w.suggestFirst; }
  const raw = S.weekRaw && S.weekRaw.start === w.start ? S.weekRaw : null;
  S.week = normWeek(clone(w), w.start); S.weekRaw = { start: w.start, doc: clone(w), legacy: false }; saveWeekCopy(w.start, clone(w)); schedule(); if (S.cal.user) calSoon();
  saveDiff('weeks/' + w.start, encWeek(raw && raw.doc), encWeek(w), raw && raw.legacy ? ['days', 'extras'] : null);
}
// change only the named fields of your own ingredient record ("prices.tesco", "staple")
function saveIng(id, flat) {
  const cur = clone(RAW.myI[id] || {});
  for (const k in flat) { const parts = k.split('.'); let o = cur; for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]] = o[parts[i]] || {}; if (flat[k] === Store.DEL) delete o[parts[parts.length - 1]]; else o[parts[parts.length - 1]] = flat[k]; }
  RAW.myI[id] = cur; rebuild();
  (Store.patch ? Store.patch('ingredients/' + id, flat) : Store.set('ingredients/' + id, cur)).catch(e => { console.warn(e); toast('Couldn\u2019t save that change.'); });
}
// people and settings: write only what changed, so two phones changing different things don't undo each other
function savePhotoPref(id, hide) { if (Store.patch && SAFE_KEY.test(id)) Store.patch('config/photoPrefs', { ['hidden.' + id]: hide ? true : Store.DEL }).catch(e => console.warn(e)); else save('config/photoPrefs', S.photoPrefs); }
function savePerson(p) { const d = clone(p); delete d.id; RAW.people = RAW.people || {}; const before = RAW.people[p.id] || null; RAW.people[p.id] = clone(d); saveDiff('people/' + p.id, before, d); }
function saveSettings(patch) {
  const before = S.settings;
  S.settings = { ...S.settings, ...patch }; resetCaches(); schedule();
  if (Store.patch && Object.keys(patch).every(k => SAFE_KEY.test(k))) {
    const flat = {};
    // a group of settings (equipment, reminders, who's who) is written item by item, so two phones changing
    // different items at once both keep theirs
    for (const k in patch) {
      const a = before[k], b = patch[k];
      if (isObj(a) && isObj(b) && Object.keys(a).concat(Object.keys(b)).every(x => SAFE_KEY.test(x))) { for (const x of new Set([...Object.keys(a), ...Object.keys(b)])) if (stable(a[x]) !== stable(b[x])) flat[k + '.' + x] = b[x] === undefined ? Store.DEL : b[x]; }
      else flat[k] = b === undefined ? Store.DEL : b;
    }
    if (!Object.keys(flat).length) return;
    Store.patch('config/settings', flat).catch(e => { console.warn(e); toast('Couldn\u2019t save that change.'); }); }
  else save('config/settings', S.settings);
}
function savePantry() { const before = S.pantryRaw; S.pantryRaw = clone(S.pantry); saveDiff('config/pantry', before, S.pantry); schedule(); }
function saveRating(rid, entry) { if (Store.patch && SAFE_KEY.test(myUid() || '')) Store.patch('ratings/' + rid, { [myUid()]: entry === null ? Store.DEL : entry }).catch(e => console.warn(e)); else { const d = { ...(S.ratings[rid] || {}) }; save('ratings/' + rid, d); } }

// ---------- rendering ----------
let raf = 0;
function schedule() { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; render(); }); }
function typingIn(el) { const a = document.activeElement; return a && el && el.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName); }
let pendingMain = false;
function render() {
  const app = $('#app');
  $('#offline').hidden = S.online;
  const gate = gateScreen();
  document.body.classList.toggle('gated', !!gate);
  if (typingIn(app)) pendingMain = true; else { pendingMain = false; app.innerHTML = gate || renderTab(); }
  $('#nav').innerHTML = gate ? '' : [['week', 'Week'], ['recipes', 'Recipes'], ['shop', 'Shop'], ['kitchen', 'Kitchen'], ['settings', 'Settings']]
    .map(([k, n]) => '<button data-act="tab" data-v="' + k + '" class="' + (S.tab === k ? 'on' : '') + '" aria-current="' + (S.tab === k ? 'page' : 'false') + '">' + ICON[k] + n + '</button>').join('');
  if (!gate) { renderSheet(); renderCook(); } else { $('#sheet').hidden = true; $('#cook').hidden = true; }
  histSoon();
  requestAnimationFrame(() => { const t = document.querySelector('#app > .top'); if (t) document.documentElement.style.setProperty('--toph', t.offsetHeight + 'px'); });
}
document.addEventListener('focusout', () => setTimeout(() => { if (pendingMain) schedule(); }, 0));
// The phone's Back button closes whatever is on top (cooking, a sheet, a settings page) instead of leaving the app.
let histDepth = 0, ignorePop = 0, histT = 0;
function layerDepth() { return (S.cook ? 1 : 0) + S.sheets.length + (S.tab === 'settings' && S.setPage ? 1 : 0) + (S.tab !== 'week' && !$('body').classList.contains('gated') ? 1 : 0); }
function syncHistory() {
  const d = layerDepth();
  try {
    while (histDepth < d) { history.pushState({ esk: histDepth + 1 }, ''); histDepth++; }
    if (histDepth > d) { ignorePop++; history.go(d - histDepth); histDepth = d; }
  } catch (e) { histDepth = d; }
}
function histSoon() { if (!histT) histT = setTimeout(() => { histT = 0; syncHistory(); }, 0); }
window.addEventListener('popstate', () => {
  if (ignorePop) { ignorePop--; return; }
  histDepth = Math.max(0, histDepth - 1);
  if (S.cook) stopCook();
  else if (S.sheets.length) { S.sheets.pop(); renderSheet(true); }
  else if (S.tab === 'settings' && S.setPage) { S.setPage = null; render(); window.scrollTo(0, 0); }
  else if (S.tab !== 'week') { S.tab = 'week'; render(); window.scrollTo(0, 0); }
  histSoon();
});

function gateScreen() {
  if (Store.kind === 'unconfigured') return '<div class="auth"><div class="brand"><span class="brand-mark" aria-hidden="true"><img src="icons/icon.svg" alt=""></span><h1>Almost there</h1><p class="muted">This copy of Peckish isn\u2019t connected to a database yet.</p></div><section class="panel"><p>Open <b>firebase-config.js</b> in your GitHub repository, paste in your Firebase settings (Firebase \u2192 Project settings \u2192 Your apps \u2192 Config), commit, then reload this page.</p></section></div>';
  if (!S.authReady) return '<div class="empty-state"><div class="spinner" aria-hidden="true"></div></div>';
  if (!S.user) return renderAuth();
  if (S.access === 'no' || S.access === 'verify') return renderInviteOnly();
  if (S.access === undefined) return '<div class="empty-state"><div class="spinner" aria-hidden="true"></div><p class="muted">Opening your kitchen…</p></div>';
  if (S.userDoc === undefined) return '<div class="empty-state"><div class="spinner" aria-hidden="true"></div><p class="muted">Opening your kitchen…</p>' +
    (S.userErr ? '<p class="small muted">Having trouble reaching your account (' + h(S.userErr) + '). Still trying…</p><button class="btn" data-act="me-retry">Try again</button><button class="linkish small" data-act="reset-local">Reset this phone\u2019s saved copy</button>' : '') + '</div>';
  if (!S.userDoc || !S.userDoc.current || S.onboard === 'force') return renderOnboard();
  if (S.hhError) return '<div class="panel empty-state"><h2>' + h(S.hhError) + '</h2><button class="btn" data-act="hh-reset">Choose another household</button></div>';
  return '';
}
function renderAuth() {
  const m = S.authMode;
  return '<div class="auth"><div class="brand"><span class="brand-mark" aria-hidden="true"><img src="icons/icon.svg" alt=""></span><h1>Peckish</h1><p class="muted">Plan the week, use every pack, shop for less.</p></div>' +
    '<section class="panel">' +
    '<button class="btn block google" data-act="auth-google" ' + (S.authBusy ? 'disabled' : '') + '>' + ICON.google + ' Continue with Google</button>' +
    '<div class="or"><span>or use email</span></div>' +
    '<form class="stack" data-form="auth">' + (m === 'signup' ? '<label class="field"><span>Your name</span><input class="input" id="au-name" autocomplete="name" required></label>' : '') +
    '<label class="field"><span>Email</span><input class="input" id="au-email" type="email" autocomplete="email" required></label>' +
    (m !== 'reset' ? '<label class="field"><span>Password</span><input class="input" id="au-pw" type="password" autocomplete="' + (m === 'signup' ? 'new-password' : 'current-password') + '" minlength="6" required></label>' : '') +
    '<button class="btn primary block" type="submit" ' + (S.authBusy ? 'disabled' : '') + '>' + (m === 'signup' ? 'Create account' : m === 'reset' ? 'Send reset link' : 'Sign in') + '</button></form>' +
    (S.authMsg ? '<p class="note ' + (S.authMsgOk ? 'good' : 'warn') + '">' + h(S.authMsg) + '</p>' : '') +
    '<div class="row wrap between small">' + (m === 'signin' ? '<button class="linkish" data-act="auth-mode" data-v="signup">New here? Create an account</button><button class="linkish" data-act="auth-mode" data-v="reset">Forgot password?</button>' : '<button class="linkish" data-act="auth-mode" data-v="signin">I already have an account</button>') + '</div>' +
    '</section><p class="muted small center">Sign in once on each phone. After that it works offline too.</p></div>';
}
function renderInviteOnly() {
  const email = (S.user && S.user.email) || '';
  const verify = S.access === 'verify';
  return '<div class="auth"><div class="brand"><span class="brand-mark" aria-hidden="true"><img src="icons/icon.svg" alt=""></span><h1>' + (verify ? 'Confirm your email' : 'Peckish is invite-only') + '</h1><p class="muted">' +
    (verify ? 'Open the link we emailed to <b>' + h(email) + '</b>, then come back here.' : 'It\u2019s just for Ethan, Sophie and family they invite. You\u2019re signed in as <b>' + h(email || 'an account with no email') + '</b>, which isn\u2019t on the list yet.') + '</p></div>' +
    '<section class="panel">' + (verify ? '<p class="small">Peckish checks every account\u2019s email before letting it in.</p><div class="row wrap"><button class="btn primary grow" data-act="verify-done">I\u2019ve confirmed it</button><button class="btn grow" data-act="verify-send">Send the link again</button></div>'
      : '<p class="small">Ask Ethan to add this email, then tap <b>Check again</b>. If you meant to use a different account, sign out and sign in with that one.</p><button class="btn primary block" data-act="verify-done">Check again</button>') +
    (S.authMsg ? '<p class="note ' + (S.authMsgOk ? 'good' : 'warn') + ' small">' + h(S.authMsg) + '</p>' : '') + '</section>' +
    '<button class="linkish center" data-act="sign-out">Sign out</button></div>';
}
function renderOnboard() {
  const names = (S.userDoc && S.userDoc.names) || {};
  const others = ((S.userDoc && S.userDoc.households) || []);
  let out = '<div class="auth"><div class="brand"><span class="brand-mark" aria-hidden="true"><img src="icons/icon.svg" alt=""></span><h1>Set up your kitchen</h1><p class="muted">A household shares one meal plan, shopping list and pantry.</p></div>';
  if (S.authMsg) out += '<p class="note warn" role="alert">' + h(S.authMsg) + '</p>';
  if (S.authBusy) out += '<p class="note"><span class="spinner sm" aria-hidden="true"></span> Working on it\u2026</p>';
  if (others.length) out += '<section class="panel"><h2>Your households</h2>' + others.map(id => '<button class="btn block" data-act="hh-switch" data-v="' + h(id) + '">' + h(names[id] || 'Household') + '</button>').join('') + '</section>';
  out += '<section class="panel"><h2>Join a household</h2><p class="muted small">Got an invite code from Ethan, Sophie or family? Enter it here.</p><form class="stack" data-form="join"><input class="input code-input" id="jn-code" placeholder="e.g. K7RM2Q" autocapitalize="characters" autocomplete="off" maxlength="8" required aria-label="Invite code"><label class="field"><span>Your name</span><input class="input" id="jn-name" value="' + h(myName()) + '" required></label><button class="btn primary" type="submit" ' + (S.authBusy ? 'disabled' : '') + '>Join</button></form></section>' +
    '<section class="panel"><h2>Start a new household</h2><form class="stack" data-form="create"><label class="field"><span>Household name</span><input class="input" id="cr-name" value="' + h(myName() + '’s kitchen') + '" required></label><label class="field"><span>Your name</span><input class="input" id="cr-me" value="' + h(myName()) + '" required></label><label class="field"><span>Anything you won’t eat? <span class="muted">(optional, comma separated)</span></span><input class="input" id="cr-wont" placeholder="e.g. mushrooms"></label><button class="btn primary" type="submit" ' + (S.authBusy ? 'disabled' : '') + '>Create household</button></form></section>';
  const dg = window.__meDiag || {};
  out += '<details class="small muted"><summary>Already in a household but it\u2019s not showing?</summary><div class="stack" style="padding-top:6px">' +
    '<p>Signed in as <b>' + h((S.user && S.user.email) || '?') + '</b> (' + h(((S.user && S.user.uid) || '').slice(0, 6)) + '\u2026). ' +
    (dg.src ? 'Account check at ' + h(dg.at) + ': ' + (dg.src === 'server' ? (dg.found ? 'found on the server.' : 'no household on the server.') : 'couldn\u2019t reach the server (' + h(dg.err || '') + ').') : '') + (S.userErr ? ' Last error: ' + h(S.userErr) + '.' : '') + '</p>' +
    '<div class="row wrap"><button class="btn small-btn" data-act="me-retry">Check again</button><button class="btn small-btn" data-act="reset-local">Reset this phone\u2019s saved copy</button></div>' +
    '<p>Resetting only clears the copy kept on this phone. Your plans are safe online. App version ' + h(((document.querySelector('script[src*="app.js"]') || {}).src || '').split('v=')[1] || '?') + '.</p></div></details>';
  out += '<button class="linkish center" data-act="sign-out">Sign out</button></div>';
  return out;
}

function notReady() {
  if (S.libError) return '<div class="panel empty-state"><h2>No recipes saved on this phone yet</h2><p class="muted">' + h(S.libError) + '</p><button class="btn" data-act="retry-lib">Try again</button></div>';
  if (!S.lib || !S.loaded.recipes || !S.loaded.ing) return '<div class="empty-state"><div class="spinner" aria-hidden="true"></div><p class="muted">Loading your recipes and prices…</p></div>';
  return '';
}
function renderTab() {
  const nr = notReady();
  if (S.tab === 'settings') return renderSettings();
  if (S.tab === 'recipes') return renderRecipes(nr);
  if (nr) return headerWeek(null) + nr;
  // until the week has arrived (a weak signal), it shows as loading rather than empty, so nobody plans over the other phone's plan
  if (!S.weekLoaded) return headerWeek(null) + '<div class="empty-state"><div class="spinner" aria-hidden="true"></div><p class="muted">Loading this week\u2026</p></div>';
  if (S.tab === 'week') return renderWeek();
  if (S.tab === 'shop') return renderShop();
  if (S.tab === 'kitchen') return renderKitchen();
  return '';
}

// ---------- WEEK ----------
function weekRange(start) {
  const a = parseIso(start), b = parseIso(addDays(start, 6));
  const m = d => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return m(a) + ' – ' + m(b);
}
function weekLabel() {
  const thisW = mondayOf(TODAY);
  if (S.weekStart === thisW) return 'This week';
  if (S.weekStart === addDays(thisW, 7)) return 'Next week';
  return S.weekStart > thisW ? 'Week ahead' : 'Past week';
}
function headerWeek(sim, list) {
  let stats = '';
  if (sim && (sim.portions || (list ? list.basket.prefTotal : sim.buy.prefTotal) > 0.005)) {
    const total = list ? list.basket.prefTotal : sim.buy.prefTotal, bud = weeklyBudget();
    const pct = Math.min(100, total / bud * 100);
    stats = '<button class="statline" data-act="go-cost" aria-label="See cost and waste"><span><b class="money">' + fmtMoney(total) + '</b> shop</span><span><b class="money">' + (sim.portions ? fmtMoney(sim.perPortion) : '\u2013') + '</b> a portion</span><span><b class="money" style="color:' + (sim.wasteValue > 1 ? 'var(--warn)' : 'inherit') + '">' + fmtMoney(sim.wasteValue) + '</b> waste</span></button>' +
      '<div class="meter slim" title="Against your weekly budget"><i class="' + (total > bud ? 'over' : '') + '" style="width:' + pct.toFixed(0) + '%"></i></div>';
  }
  return '<div class="top"><div class="weeknav"><button class="icon-btn" data-act="wk" data-v="-1" aria-label="Previous week">' + ICON.left + '</button>' +
    '<div class="title"><div class="label">' + weekLabel() + '</div><h1>' + weekRange(S.weekStart) + '</h1></div>' +
    '<button class="icon-btn" data-act="wk" data-v="1" aria-label="Next week">' + ICON.right + '</button></div>' + stats + '</div>';
}
function renderWeek() {
  const w = currentWeek(), C = ctx();
  const sim = simulate(w, C);
  const list = weekList(w, sim, C);
  const Cw = ctx(), outN = w.days.filter((x, d) => !x.r && !x.takeaway && nobodyIn(w, d, Cw)).length;
  const filled = w.days.filter(d => d.r || d.takeaway).length + outN;
  const locked = !!w.locked;
  let out = headerWeek(sim, list);
  out += tonightElsewhere();
  const view = S.weekView || 'dinners';
  const blOn = S.people.filter(p => p.plan && (p.plan.b || p.plan.l)).length;
  out += segHtml('week-view', view, [['dinners', 'Dinners', (filled - outN) + '/' + (7 - outN)], ['bl', 'Breakfast & lunch', blOn ? '' : 'off']]);
  if (view === 'bl') return out + blSection(w);
  const emptyN = 7 - filled, planned = filled - outN;
  const arrival = filled ? sim.freezeNotes.filter(n => n.onArrival) : [];
  if (arrival.length) out += '<div class="note">' + ICON.snow + ' <b>When you unpack the shop:</b> freeze ' + arrival.map(n => h(leftText(n.i, n.q)) + ' (for ' + DAY_LONG[n.forDay] + ')').join(', ') + '.</div>';
  const todayIdx = daysBetween(w.start, TODAY);
  out += tonightAndRatings(w, todayIdx) + plateAsks(w) + kcalGlance(w, todayIdx) + makeWithWhatYouHave(w, sim);
  const defrost = []; (sim.defrostNotes || []).forEach(n => { const k = defrost.find(x => x.d === n.d && x.i === n.i && x.meal === n.meal); if (k) k.q += n.q; else defrost.push({ ...n }); });
  out += '<div class="days">';
  const treatDays = S.settings.treatDays || [];
  for (let d = 0; d < 7; d++) {
    const day = w.days[d], r = day.r && S.RMAP[day.r];
    const isTreat = treatDays.includes(d);
    const eaters = S.people.filter(p => p.dinner !== false), inN = eaters.filter(p => !awayOn(w, p, d)), none = eaters.length > 0 && !inN.length;
    const whoTag = inN.length && inN.length < eaters.length ? '<span class="tag who">Just ' + h(inN.map(p => p.name).join(' & ')) + '</span>' : '';
    out += '<div class="day ' + (d === todayIdx ? 'today' : '') + '"><div class="when"><b>' + DAY_NAMES[d] + '</b><span>' + parseIso(addDays(w.start, d)).getDate() + '</span>' + (isTreat ? '<span class="treatdot" title="Treat night">★</span>' : '') + (eaters.length > 1 && !locked ? '<button class="whochip" data-act="who-cycle" data-n="' + d + '" aria-label="Who\u2019s in for dinner on ' + DAY_LONG[d] + ': ' + (none ? 'nobody' : h(inN.map(p => p.name).join(' and '))) + '. Tap to change">' + eaters.map(p => '<i class="' + (awayOn(w, p, d) ? 'off' : '') + '">' + h((p.name || '?').charAt(0).toUpperCase()) + '</i>').join('') + '</button>' : '') + '</div>';
    if (day.takeaway) {
      const was = day.was && S.RMAP[day.was];
      out += '<div class="meal takeaway"><span class="tile c-Other" aria-hidden="true">🥡</span><span class="body"><span class="ttl">Takeaway night</span>' + (was ? '<span class="muted small">Instead of ' + h(was.title) + '</span>' : '') + '<span><button class="chip" data-act="undo-takeaway" data-v="' + d + '">Undo</button></span></span></div>';
    } else if (r) {
      const pc = checkPrefs(r, S.people, S.ING), info = sim.dayInfo[d], n = nut(r);
      const tags = [];
      if (whoTag) tags.push(whoTag); else if (none) tags.push('<span class="tag warn">Nobody in</span>');
      const cook = cookOn(w, d, S.people); if (cook) tags.push('<span class="tag whocooks">' + h(cook.name) + ' cooks</span>');
      eaters.filter(p => { const sh = shiftOn(w, p, d); return sh && sh.miss && !awayOn(w, p, d); }).forEach(p => tags.push('<span class="tag">Plate for ' + h(p.name) + '</span>'));
      const downs = eaters.filter(p => voteOf(w, p.id, d) < 0);
      if (downs.length) tags.push('<span class="tag bad">' + h(downs.map(p => p.name).join(' & ')) + ' isn\u2019t keen</span>');
      else if (eaters.length > 1 && eaters.every(p => voteOf(w, p.id, d) > 0)) tags.push('<span class="tag good">\ud83d\udc4d Both keen</span>');
      if (guestsOn(w, d)) tags.push('<span class="tag">+' + guestsOn(w, d) + ' guest' + (guestsOn(w, d) > 1 ? 's' : '') + '</span>');
      if (day.freezer) tags.push('<span class="tag">' + ICON.snow + ' From the freezer</span>');
      if (r.category === 'treat') tags.push('<span class="tag treat">Treat</span>');
      pc.swaps.forEach(s => tags.push('<span class="tag swap">Swap for ' + h(s.person) + '</span>'));
      if (day.extra) tags.push('<span class="tag">+' + (Number(day.extra) || 0) + ' ' + (day.extraUse === 'freeze' ? 'to freeze' : 'for lunch') + '</span>');
      if (!hasEquipment(r, S.settings)) tags.push('<span class="tag warn">Needs ' + h(missingEquipment(r).join(', ')) + '</span>');
      const rs = ratingSummary()[r.id]; if (rs) tags.push('<span class="tag ' + (rs.avg < 3 ? 'bad' : 'good') + '">' + rs.avg.toFixed(1) + '★</span>');
      out += '<div class="mealwrap"><button class="meal" data-act="open-day" data-v="' + d + '">' + tileHtml(r) + '<span class="body"><span class="ttl">' + h(rt(r)) + '</span>' +
        '<span class="muted small">' + r.time + ' min · ' + (n.kcal ? n.kcal + ' kcal · ' : '') + (info && !day.freezer ? '<span class="money">' + fmtMoney(info.perPortion) + '</span>/portion' : h(r.cuisine)) + '</span>' + (tags.length ? '<span class="row wrap tagrow">' + tags.join('') + '</span>' : '') + '</span></button>' +
        (locked || day.freezer ? '' : '<button class="icon-btn swapbtn" data-act="swap-day" data-v="' + d + '" aria-label="Swap ' + DAY_LONG[d] + '\u2019s dinner for something else" title="Swap for something else">' + ICON.swap + '</button>') + '</div>';
    } else if (none) {
      out += '<button class="meal empty out" data-act="whosin" ' + (locked ? 'disabled' : '') + '>Nobody in for dinner <span class="small" style="font-weight:400">' + h(eaters.map(p => awayOn(w, p, d) === 'day' ? p.name + ' away' : p.name + ' out').join(' \u00b7 ')) + '</span></button>';
    } else {
      out += '<button class="meal empty" data-act="pick" data-v="' + d + '" ' + (locked ? 'disabled' : '') + '>' + (whoTag ? whoTag + ' ' : '') + (locked ? 'Nothing planned' : '+ Choose ' + DAY_LONG[d] + '’s dinner' + (isTreat ? ' <span class="small" style="font-weight:400">(treat night)</span>' : d < 5 ? ' <span class="small" style="font-weight:400">(≤' + S.settings.weeknightCap + ' min)</span>' : '')) + '</button>';
    }
    if (filled) defrost.filter(n => n.d === d + 1 || (d === 0 && n.d === 0)).forEach(n => { const what = n.meal ? 'the frozen ' + h(rt(S.RMAP[n.meal] || { title: 'meal' })) : h(leftText(n.i, n.q)); out += '<div class="daynote">' + ICON.snow + '<span>' + (n.d === d ? 'Defrost ' + what + ' in the fridge first thing (for tonight)' : 'Take ' + what + ' out of the freezer tonight, to thaw in the fridge for ' + DAY_LONG[n.d]) + '</span></div>'; });
    if (filled) sim.freezeNotes.filter(n => !n.onArrival && n.d === d).forEach(n => { out += '<div class="daynote">' + ICON.snow + '<span>Freeze the spare ' + h(leftText(n.i, n.q)) + ' tonight</span></div>'; });
    if (filled) sim.warnings.filter(x => x.d === d).forEach(x => { out += '<div class="daynote warn">' + ICON.info + '<span>' + h(x.msg) + '</span></div>'; });
    out += '</div>';
  }
  out += '</div>';
    out += '<div class="weekfoot">';
    if (S.busy) out += '<button class="btn primary block" disabled><span class="spinner sm" aria-hidden="true"></span> Planning\u2026</button>';
    else if (locked) out += '<div class="lockline">' + ICON.lock + '<span class="grow">Locked in by <b>' + h(w.locked.by) + '</b></span>' + (S.confirm.unlock ? '<button class="btn small-btn danger" data-act="unlock-yes">Unlock</button><button class="btn small-btn" data-act="unlock-no">Keep</button>' : '<button class="linkish small" data-act="unlock">Unlock</button>') + '</div>';
    else if (emptyN) out += '<button class="btn primary block" data-act="fill">Fill ' + (planned ? 'the rest' : 'the week') + ' for me</button>';
    else if (planned) out += '<button class="btn primary block" data-act="lock">' + ICON.lock + ' Lock in this week</button>';
    if (!locked && !S.busy) {
      const links = [];
      if (emptyN && planned) links.push('<button class="linkish small" data-act="lock">Lock in as it is</button>');
      if (planned) links.push(S.confirm.clear ? '<span class="small">Clear every night? <button class="linkish small" style="color:var(--bad)" data-act="clear-yes">Yes, clear</button> <button class="linkish small" data-act="clear-no">No</button></span>' : '<button class="linkish small" data-act="clear">Clear week</button>');
      const ev = S.people.filter(p => p.dinner !== false);
      if (planned && ev.length > 1) { const pend = ev.filter(p => w.days.some((x, k) => x.r && !x.takeaway && !voteOf(w, p.id, k))); links.unshift('<button class="linkish small" data-act="votes">' + (pend.length ? 'Thumbs up or down' + (pend.length < ev.length ? ' (' + h(pend.map(p => p.name).join(' & ')) + ' to do)' : '') : '\ud83d\udc4d Everyone\u2019s had a say') + '</button>'); }
      if (links.length) out += '<div class="weekfoot-links">' + links.join('<span class="dotsep" aria-hidden="true">\u00b7</span>') + '</div>';
    }
    out += '</div>';
    return out;
}
// Looking at next week (or any other week)? Keep tonight's dinner one tap away.
function tonightElsewhere() {
  const thisW = mondayOf(TODAY); if (S.weekStart === thisW) return '';
  const tw = S.thisWeekDoc; const d0 = daysBetween(thisW, TODAY); const day = tw && tw.days[d0];
  if (!day || (!day.r && !day.takeaway)) return '';
  if (day.takeaway) return '<div class="tonight compact"><div class="row" style="gap:12px"><span class="tile c-Other" aria-hidden="true">🥡</span><div class="grow"><div class="label">Tonight</div><div class="rtitle">Takeaway night</div></div><button class="btn small-btn" data-act="wk-this">This week</button></div></div>';
  const r = S.RMAP[day.r]; if (!r) return '';
  return '<section class="tonight compact"><div class="row" style="gap:12px">' + tileHtml(r) + '<div class="grow" style="min-width:0"><div class="label">Tonight \u00b7 ' + DAY_LONG[d0] + '</div><div class="rtitle">' + h(rt(r)) + '</div><div class="muted small">' + r.time + ' min</div></div></div>' +
    '<div class="row wrap"><button class="btn primary grow" data-act="cook" data-v="' + h(r.id) + '">Start cooking</button><button class="btn grow" data-act="open-recipe" data-v="' + h(r.id) + '">Recipe</button><button class="btn grow" data-act="wk-this">This week</button></div></section>';
}
// ---------- thumbs up or down: each of you says what you fancy before the week's locked in ----------
function voteOf(w, pid, d) { const v = ((w.votes || {})[pid] || {})[d]; return v && w.days[d] && v.r === w.days[d].r ? v.v : 0; }
function voteBtns(w, pid, d) {
  const v = voteOf(w, pid, d);
  return '<span class="votebtns"><button class="vbtn ' + (v > 0 ? 'on up' : '') + '" data-act="vote" data-v="' + d + '" data-n="1" aria-pressed="' + (v > 0) + '" aria-label="Thumbs up">👍</button><button class="vbtn ' + (v < 0 ? 'on down' : '') + '" data-act="vote" data-v="' + d + '" data-n="-1" aria-pressed="' + (v < 0) + '" aria-label="Thumbs down">👎</button></span>';
}
function othersVotes(w, d) { const me = mePerson(); return S.people.filter(p => p.dinner !== false && (!me || p.id !== me.id)).map(p => { const v = voteOf(w, p.id, d); return v ? h(p.name) + ' ' + (v > 0 ? '👍' : '👎') : ''; }).filter(Boolean).join(' · '); }
function dayVoteRow(w, d) {
  if (!mePerson() || S.people.filter(p => p.dinner !== false).length < 2 || w.locked) return '';
  const o = othersVotes(w, d);
  return '<div class="row between wrap"><span class="label">Fancy it?</span>' + voteBtns(w, mePerson().id, d) + '</div>' + (o ? '<p class="small muted">' + o + '</p>' : '');
}
function sheetVotes() {
  const w = currentWeek(), me = mePerson();
  if (!me) return '<p class="muted">Choose who you are first: Settings → Who’s eating.</p>';
  let out = '<p class="muted small">Give each dinner a thumbs up or down. Anything one of you isn’t keen on shows on the Week tab, so you can swap it before locking in.</p><div class="mgroup">';
  w.days.forEach((x, d) => {
    const r = x.r && !x.takeaway && S.RMAP[x.r]; if (!r) return;
    const o = othersVotes(w, d), mine = voteOf(w, me.id, d);
    out += '<div class="voterow">' + tileHtml(r) + '<span class="grow" style="min-width:0"><span class="label">' + DAY_LONG[d] + '</span><b class="ellip" style="display:block">' + h(rt(r)) + '</b>' + (o ? '<span class="small muted">' + o + '</span>' : '') +
      (mine < 0 && !w.locked ? ' <button class="linkish small" data-act="swap-day" data-v="' + d + '">Swap it</button>' : '') + '</span>' + voteBtns(w, me.id, d) + '</div>';
  });
  return out + '</div><button class="btn primary block" data-act="sheet-back">Done</button>';
}
// ---------- shifts from Caledonite: "save you a plate?" goes to the person working ----------
function shiftText(sh) { return sh.t === 'night' ? 'a night shift' : sh.e ? 'until ' + sh.e : 'a ' + sh.t + ' shift'; }
function plateAsks(w) {
  const me = mePerson(); if (!me || w.locked) return '';
  const today = daysBetween(w.start, TODAY); let out = '';
  for (let d = Math.max(0, today); d < 7; d++) {
    const sh = shiftOn(w, me, d); if (!sh || !sh.miss) continue;
    if (((w.plates || {})[me.id] || {})[d]) continue;
    const a = (w.away || {})[me.id]; if (a && a[d]) continue;
    const r = w.days[d].r && !w.days[d].takeaway && S.RMAP[w.days[d].r];
    out += '<div class="rateask plateask"><span class="grow">You’re working ' + h(shiftText(sh)) + ' on ' + DAY_LONG[d] + '. Save you a plate' + (r ? ' of <b>' + h(rt(r)) + '</b>' : '') + '?</span><span class="row" style="gap:6px"><button class="chip on" data-act="plate" data-v="' + d + '" data-s="save">Yes please</button><button class="chip" data-act="plate" data-v="' + d + '" data-s="skip">No thanks</button></span></div>';
  }
  return out;
}
function dayPlateRows(w, d) {
  const me = mePerson(); let out = '';
  S.people.filter(p => p.dinner !== false).forEach(p => {
    const sh = shiftOn(w, p, d); if (!sh) return;
    const pl = ((w.plates || {})[p.id] || {})[d];
    let line = h(p.name) + ' is working ' + h(shiftText(sh));
    if (sh.miss) line += pl === 'skip' ? ', not eating this one.' : ', so a plate is saved for later' + (pl ? '.' : ' (unless ' + (me && me.id === p.id ? 'you say' : 'they say') + ' no).');
    else line += ', home in time for dinner.';
    out += '<p class="small">' + line + (sh.miss && me && me.id === p.id && !w.locked ? ' <button class="linkish small" data-act="plate" data-v="' + d + '" data-s="' + (pl === 'skip' ? 'save' : 'skip') + '">' + (pl === 'skip' ? 'Save me a plate' : 'I’ll sort myself') + '</button>' : '') + '</p>';
  });
  return out;
}
// ---------- calories and protein at a glance (for the person using this phone) ----------
function kcalGlance(w, todayIdx) {
  const me = mePerson(); if (!me) return '';
  const target = Number(me.kcalTarget) || 0, pt = Number(me.proteinTarget) || 0;
  if (!target && !pt && !(me.plan && (me.plan.b || me.plan.l))) return '';
  let sk = 0, sp = 0, n = 0;
  for (let d = 0; d < 7; d++) { const t = personDay(w, me, d); if ((t.dinner || t.b.length || t.l.length) && !t.unknown) { sk += t.kcal; sp += t.protein; n++; } }
  if (!n) return '';
  const td = todayIdx >= 0 && todayIdx < 7 ? personDay(w, me, todayIdx) : null, tdOk = td && (td.dinner || td.b.length || td.l.length) && !td.unknown;
  const pct = tdOk && target ? Math.min(100, td.kcal / target * 100) : 0;
  return '<button class="glance" data-act="glance" aria-label="Calories and protein: open breakfasts and lunches">' +
    (tdOk ? '<span class="gl-main"><b class="num">' + td.kcal.toLocaleString('en-GB') + '</b> kcal today' + (target ? ' <span class="muted">of ' + target.toLocaleString('en-GB') + '</span>' : '') + '</span><span class="gl-main"><b class="num">' + td.protein + 'g</b> protein' + (pt ? ' <span class="muted">of ' + pt + 'g</span>' : '') + '</span>' : '') +
    '<span class="gl-sub muted">This week: ' + Math.round(sk / n).toLocaleString('en-GB') + ' kcal and ' + Math.round(sp / n) + 'g protein a day on average</span>' +
    (target && tdOk ? '<span class="meter slim"><i class="' + (td.kcal > target * 1.05 ? 'over' : '') + '" style="width:' + pct.toFixed(0) + '%"></i></span>' : '') + '</button>';
}
// ---------- "you can make this with what you've got" ----------
// spare = what's in the fridge and cupboards that this week's plan won't use (carried in, or left over)
function spareFood(sim) {
  const spare = {};
  (sim.carryOut || []).forEach(L => { if (S.ING[L.i] && !S.ING[L.i].staple) spare[L.i] = (spare[L.i] || 0) + L.q; });
  Object.keys(sim.waste || {}).forEach(id => { spare[id] = (spare[id] || 0) + sim.waste[id]; });
  return spare;
}
function makeableFrom(spare, w, limit) {
  const inWeek = new Set(w.days.map(x => x.r).filter(Boolean)), out = [];
  for (const r of dinners()) {
    if (inWeek.has(r.id) || !checkPrefs(r, S.people, S.ING).ok || !hasEquipment(r, S.settings)) continue;
    const rs = ratingSummary()[r.id]; if (rs && rs.avg < 3) continue;
    let need = 0, have = 0; const uses = [], missing = [];
    for (const l of r.ingredients) {
      const ing = S.ING[l.i]; if (!ing || ing.staple || l.opt || !(l.q > 0)) continue;
      const val = l.q * unitPrice(ing, S.settings.shop, true); need += val;
      const got = Math.min(spare[l.i] || 0, l.q); have += got * unitPrice(ing, S.settings.shop, true);
      if (got >= l.q * 0.75) uses.push(l.i); else missing.push(l.i);
    }
    if (!uses.length || need <= 0) continue;
    out.push({ r, cover: have / need, uses, missing });
  }
  return out.sort((a, b) => b.cover - a.cover || b.uses.length - a.uses.length).slice(0, limit || 5);
}
// Kitchen → Leftovers: what you could cook from what's spare, or with a particular ingredient
function makePanel(w, sim) {
  const q = (S.makeQ || '').trim().toLowerCase(), spare = spareFood(sim);
  let list;
  if (q) {
    const ids = Object.keys(S.ING).filter(id => S.ING[id].name.toLowerCase().includes(q));
    list = makeableFrom(Object.fromEntries(Object.keys(S.ING).map(id => [id, (spare[id] || 0) + (ids.includes(id) ? 1e9 : 0)])), w, 50).filter(x => x.uses.some(i => ids.includes(i))).slice(0, 6);
  } else list = makeableFrom(spare, w, 5).filter(x => x.cover >= 0.3);
  const today = daysBetween(w.start, TODAY);
  const empty = w.days.map((x, d) => (d >= Math.max(0, today) && !x.r && !x.takeaway && !nobodyIn(w, d, ctx())) ? d : -1).filter(d => d >= 0);
  let out = '<section class="panel"><h2>What can I make?</h2><p class="muted small">Dinners that use up what’s spare this week, best match first. Or type an ingredient you want to use.</p>' +
    '<input class="search" id="makeq" type="search" placeholder="e.g. chicken, peppers" value="' + h(S.makeQ || '') + '" data-input="makeq" aria-label="Find dinners that use an ingredient">';
  if (!list.length) return out + '<p class="muted">' + (q ? 'No dinners use that.' : 'Nothing much spare this week, so nothing to suggest yet.') + '</p></section>';
  out += '<div class="mgroup">' + list.map(x => '<div class="voterow">' + tileHtml(x.r) + '<span class="grow" style="min-width:0"><b class="ellip" style="display:block">' + h(rt(x.r)) + '</b><span class="small muted">' +
    (q ? '' : Math.round(x.cover * 100) + '% from what you’ve got · ') + 'uses ' + h(x.uses.slice(0, 3).map(lowerName).join(', ')) + (x.missing.length ? '; needs ' + h(x.missing.slice(0, 3).map(lowerName).join(', ')) + (x.missing.length > 3 ? '…' : '') : '') + '</span></span>' +
    (empty.length && !w.locked ? '<button class="chip" data-act="make-it" data-v="' + h(x.r.id) + '" data-n="' + empty[0] + '">' + DAY_NAMES[empty[0]] + '</button>' : '<button class="chip" data-act="peek" data-v="' + h(x.r.id) + '">See</button>') + '</div>').join('') + '</div>';
  return out + '</section>';
}
function makeWithWhatYouHave(w, sim) {
  if (w.locked) return '';
  const today = daysBetween(w.start, TODAY), empty = [];
  w.days.forEach((x, d) => { if (d >= Math.max(0, today) && !x.r && !x.takeaway && !nobodyIn(w, d, ctx())) empty.push(d); });
  if (!empty.length || !w.days.some(x => x.r)) return '';
  const best = makeableFrom(spareFood(sim), w, 1)[0];
  if (!best || best.cover < 0.85) return '';
  return '<div class="note good makeit"><span>' + ICON.info + '</span><span class="grow">You can make <b>' + h(rt(best.r)) + '</b> with what you’ve got. It uses up ' + h(best.uses.slice(0, 4).map(lowerName).join(', ')) + (best.missing.length ? ' (you’d just need ' + h(best.missing.map(lowerName).join(', ')) + ')' : '') + '. ' +
    '<button class="linkish small" data-act="make-it" data-v="' + h(best.r.id) + '" data-n="' + empty[0] + '">Have it on ' + DAY_LONG[empty[0]] + '</button></span></div>';
}
function tonightAndRatings(w, todayIdx) {
  let out = '';
  const tonight = todayIdx >= 0 && todayIdx < 7 ? w.days[todayIdx] : null;
  if (tonight && tonight.r && !tonight.takeaway && S.RMAP[tonight.r]) {
    const r = S.RMAP[tonight.r];
    out += '<section class="tonight slim"><div class="row" style="gap:12px">' + tileHtml(r) + '<div class="grow" style="min-width:0"><div class="label">Tonight \u00b7 ' + r.time + ' min</div><div class="rtitle">' + h(rt(r)) + '</div><button class="linkish small" data-act="takeaway" data-v="' + todayIdx + '" style="min-height:32px;padding:0">Takeaway instead?</button></div>' +
      '<button class="btn primary" data-act="cook" data-v="' + h(r.id) + '">Cook</button></div></section>';
  }
  // ask about dinners from the last few days that I haven't rated yet
  const me = myUid(); const asks = [];
  const pool = [];
  for (let d = Math.min(todayIdx - 1, 6); d >= 0; d--) pool.push(w.days[d]);
  if (S.prevWeek && todayIdx >= 0 && todayIdx <= 2) for (let d = 6; d >= 4; d--) pool.push(S.prevWeek.days[d]);
  for (const x of pool) { if (!x || !x.r || x.takeaway || !S.RMAP[x.r]) continue; const rr = S.ratings[x.r]; if (rr && rr[me]) continue; if (asks.find(a => a.id === x.r)) continue; asks.push(S.RMAP[x.r]); if (asks.length >= 2) break; }
  for (const r of asks) out += '<div class="rateask"><span class="grow">How was <b>' + h(rt(r)) + '</b>?</span>' + rateButtons(r.id, 0) + '<button class="linkish small" data-act="rate-skip" data-v="' + h(r.id) + '">Didn\u2019t make it</button></div>';
  return out;
}
function clearRating(rid) {
  const doc = { ...(S.ratings[rid] || {}) }; delete doc[myUid()];
  const next = { ...S.ratings }; if (Object.keys(doc).length) next[rid] = doc; else delete next[rid]; S.ratings = next;
  saveRating(rid, null);
  schedule(); renderSheet(true);
}
function rateButtons(rid, current) {
  return '<span class="stars" role="group" aria-label="Rate it">' + [1, 2, 3, 4, 5].map(k => '<button class="star ' + (k <= current ? 'on' : '') + '" data-act="rate" data-v="' + h(rid) + '" data-n="' + k + '" aria-label="' + k + ' star' + (k > 1 ? 's' : '') + '">★</button>').join('') + '</span>';
}
function missingEquipment(r) { const eq = S.settings.equipment || {}; return (r.equipment || []).filter(e => eq[e] === false).map(e => (EQUIPMENT.find(x => x[0] === e) || [e, e])[1].toLowerCase()); }

// ---------- BREAKFAST & LUNCH ----------
const SLOT_NAME = { b: 'Breakfast', l: 'Lunch' };
const SLOT_MEAL = { b: 'breakfast', l: 'lunch' };
function personById(pid) { return S.people.find(p => p.id === pid); }
function blPeople() { return S.people.slice(); }
function portionOf(p) { return Number(p && p.portion) > 0 ? Number(p.portion) : 1; }
// per-person totals for one day: breakfast + lunch + their share of dinner
function personDay(w, p, d) {
  const out = { kcal: 0, protein: 0, b: [], l: [], dinner: null, unknown: false };
  for (const slot of ['b', 'l']) for (const it of blItems(w, p, slot, d)) {
    if (it === 'lo') { const prev = w.days[d - 1]; const r = prev && !prev.takeaway && prev.r && S.RMAP[prev.r]; if (r) { const n = nut(r); out.kcal += n.kcal; out.protein += n.protein; out[slot].push({ lo: true, r, kcal: n.kcal }); } else out[slot].push({ lo: true, r: null, kcal: 0 }); continue; }
    const r = S.RMAP[it]; if (!r) continue; const n = nut(r); out.kcal += n.kcal; out.protein += n.protein; out[slot].push({ r, kcal: n.kcal });
  }
  const day = w.days[d];
  if (day && day.takeaway) out.unknown = true;
  else if (day && day.r && S.RMAP[day.r] && p.dinner !== false && !awayOn(w, p, d)) { const n = nut(S.RMAP[day.r]); const k = Math.round(n.kcal * portionOf(p)); out.dinner = { r: S.RMAP[day.r], kcal: k }; out.kcal += k; out.protein += Math.round(n.protein * portionOf(p)); }
  return out;
}
function setBl(pid, slot, d, items) {
  mutateWeek(w => {
    w.bl = w.bl || {}; const p = personById(pid);
    const cur = w.bl[pid] || {}; const arr = (cur[slot] || Array(7).fill(null)).slice();
    arr[d] = items; // other days keep following the usual until you change them
    w.bl[pid] = { ...cur, [slot]: arr };
  });
}
function clearBlOverrides(pid) { mutateWeek(w => { if (w.bl) { const bl = { ...w.bl }; delete bl[pid]; w.bl = bl; } }); }
// Sunday prep: the same breakfast or lunch on several days gets made in one go (batches of up to 3 days, so it keeps)
function prepPlan(w, p) {
  const groups = [];
  for (const slot of ['l', 'b']) {
    const byR = {};
    for (let d = 0; d < 7; d++) blItems(w, p, slot, d).forEach(it => { if (it !== 'lo' && S.RMAP[it] && !/cereal|toast|fruit|bar$/i.test(S.RMAP[it].title)) (byR[it] = byR[it] || []).push(d); });
    for (const id in byR) { let cur = []; byR[id].forEach(d => { if (cur.length && (d - cur[0] > 2)) { if (cur.length > 1) groups.push({ id, days: cur, slot }); cur = []; } cur.push(d); }); if (cur.length > 1) groups.push({ id, days: cur, slot }); }
  }
  if (!groups.length) return '';
  groups.sort((a, b) => a.days[0] - b.days[0]);
  return '<div class="prep"><span class="label">Batch prep</span>' + groups.map(g => { const r = S.RMAP[g.id], when = g.days[0] === 0 ? 'Sunday night' : DAY_LONG[g.days[0] - 1] + ' night';
    return '<div class="row between ruled-sm"><span class="grow" style="min-width:0"><b>' + h(rt(r)) + ' \u00d7' + g.days.length + '</b><span class="small muted" style="display:block">Make on ' + when + ' for ' + g.days.map(d => DAY_NAMES[d]).join(', ') + ', then keep in the fridge</span></span><button class="chip" data-act="prep-open" data-v="' + h(g.id) + '" data-n="' + g.days.length + '">Recipe \u00d7' + g.days.length + '</button></div>'; }).join('') + '</div>';
}
function blSection(w) {
  const ps = blPeople();
  if (!ps.length) return '<section class="panel"><p class="muted small">Plan breakfasts and packed lunches per person, with calories and protein for the whole day. Turn it on for each of you in Settings → Who’s eating.</p><button class="btn" data-act="go-set" data-v="people">Set it up</button></section>';
  if (!S.blPerson || !ps.find(p => p.id === S.blPerson)) S.blPerson = ps[0].id;
  const p = personById(S.blPerson);
  const target = Number(p.kcalTarget) || 0, ptarget = Number(p.proteinTarget) || 0;
  p.plan = p.plan || {};
  let out = (ps.length > 1 ? '<span class="seg full">' + ps.map(x => '<button class="' + (x.id === p.id ? 'on' : '') + '" data-act="bl-person" data-v="' + h(x.id) + '">' + h(x.name) + '</button>').join('') + '</span>' : '') + '<section class="panel blpanel">';
  if (!(p.plan && (p.plan.b || p.plan.l))) out += '<p class="note small">' + h(p.name) + '’s breakfasts and lunches aren’t being planned. <button class="linkish" data-act="go-set" data-v="people" data-p="' + h(p.id) + '">Turn it on</button></p>';
  out += '<p class="muted small">' + (target ? 'Daily target ' + target.toLocaleString('en-GB') + ' kcal' + (ptarget ? ' · ' + ptarget + 'g protein' : '') + '. ' : '') + 'Totals include ' + h(p.name) + '’s share of dinner' + (portionOf(p) !== 1 ? ' (' + (portionOf(p) === 0.75 ? '¾' : portionOf(p) === 0.5 ? '½' : portionOf(p)) + ' portion)' : '') + '.</p>';
  out += '<div class="blgrid">';
  let sumK = 0, sumP = 0, n = 0;
  for (let d = 0; d < 7; d++) {
    const t = personDay(w, p, d);
    const slots = ['b', 'l'];
    const cell = sl => '<button class="blslot" data-act="bl-pick" data-v="' + h(p.id) + '|' + sl + '|' + d + '"><span class="label">' + SLOT_NAME[sl] + '</span>' +
      (t[sl].length ? t[sl].map(x => '<span class="blitem">' + (x.lo ? 'Leftovers' + (x.r ? '' : ' (no dinner the night before)') : h(x.r.title)) + '</span>').join('') : '<span class="muted">+ Add</span>') + '</button>';
    const known = t.dinner || t.b.length || t.l.length;
    if (known && !t.unknown) { sumK += t.kcal; sumP += t.protein; n++; }
    const over = target && t.kcal > target * 1.05;
    out += '<div class="blday"><div class="blwhen"><b>' + DAY_NAMES[d] + '</b></div><div class="blslots">' + slots.map(cell).join('') + '</div>' +
      '<div class="bltot ' + (over ? 'over' : '') + '"><b class="num">' + (t.unknown ? '?' : t.kcal.toLocaleString('en-GB')) + '</b><span>kcal</span><span class="small muted">' + (t.unknown ? 'takeaway' : t.protein + 'g protein') + '</span></div></div>';
  }
  out += '</div>';
  if (n) out += '<p class="small">Average <b>' + Math.round(sumK / n).toLocaleString('en-GB') + ' kcal</b> and <b>' + Math.round(sumP / n) + 'g protein</b> a day' + (target ? ' (target ' + target.toLocaleString('en-GB') + ')' : '') + '.</p>';
  out += '<div class="row wrap">' + (p.plan && p.plan.l ? '<button class="btn soft grow" data-act="bl-auto" data-v="' + h(p.id) + '" ' + (w.locked ? 'disabled' : '') + '>Pick lunches for the week</button>' : '') + ((w.bl && w.bl[p.id]) ? '<button class="btn grow" data-act="bl-reset" data-v="' + h(p.id) + '">Back to usual</button>' : '') + '</div>';
  out += prepPlan(w, p);
  return out + '</section>';
}
function sheetBlPick(top) {
  const w = currentWeek(), p = personById(top.pid); if (!p) return '<p>Person not found.</p>';
  const slot = top.slot, d = top.d, items = blItems(w, p, slot, d);
  const t = personDay(w, p, d), target = Number(p.kcalTarget) || 0;
  let out = '<p class="muted small">' + h(p.name) + ' · ' + DAY_LONG[d] + ' · day total <b>' + t.kcal.toLocaleString('en-GB') + ' kcal</b>' + (target ? ' of ' + target.toLocaleString('en-GB') : '') + ', ' + t.protein + 'g protein</p>';
  out += '<section class="stack"><h3>' + SLOT_NAME[slot] + '</h3>';
  if (!items.length) out += '<p class="muted">Nothing yet. Add something below.</p>';
  items.forEach((it, k) => {
    const r = it === 'lo' ? null : S.RMAP[it];
    const prev = w.days[d - 1]; const lr = it === 'lo' && prev && prev.r && S.RMAP[prev.r];
    out += '<div class="row between ruled-sm"><span>' + (it === 'lo' ? 'Leftovers' + (lr ? ': ' + h(lr.title) : '') : r ? h(r.title) : h(it)) + ' <span class="muted small">' + (r ? nut(r).kcal + ' kcal' : lr ? nut(lr).kcal + ' kcal' : '') + '</span></span><button class="icon-btn" data-act="bl-remove" data-v="' + k + '" aria-label="Remove">' + ICON.close + '</button></div>';
  });
  out += '<div class="row wrap"><button class="btn small-btn" data-act="bl-usual">Make this my usual</button><button class="btn small-btn" data-act="bl-alldays">Same every ' + (slot === 'l' ? 'lunch' : 'breakfast') + ' day</button>' + (items.length ? '<button class="btn small-btn" data-act="bl-none">Nothing</button>' : '') + '</div></section>';
  const usual = (p.usual && p.usual[slot]) || [];
  if (usual.length) out += '<p class="muted small">Usual: ' + usual.map(id => id === 'lo' ? 'leftovers' : h((S.RMAP[id] || {}).title || id)).join(' + ') + '</p>';
  // leftovers option for lunch
  if (slot === 'l' && d > 0) { const prev = w.days[d - 1]; const r = prev && !prev.takeaway && prev.r && S.RMAP[prev.r]; if (r) out += '<div class="sugg"><span class="tile c-Other" aria-hidden="true">🍱</span><button class="pick" data-act="bl-add" data-v="lo"><b>Leftovers from last night</b><span class="why">' + h(r.title) + ' · ' + nut(r).kcal + ' kcal · cooks one extra portion</span></button><span></span></div>'; }
  // ranked options
  const C = ctx(); const meal = SLOT_MEAL[slot];
  const base = simulate(w, C);
  const remaining = target ? target - t.kcal : 0;
  const opts = S.recipes.filter(r => (r.meal === meal || (!isDinner(r) && (r.tags || []).includes('snack'))) && hasEquipment(r, S.settings) && (pc1 => pc1.ok && !pc1.swaps.length)(checkPrefs(r, S.people.filter(x => x.id === p.id), S.ING)) && !(ratingSummary()[r.id] && ratingSummary()[r.id].avg < 3))
    .filter(r => !top.q || r.title.toLowerCase().includes(top.q.toLowerCase()))
    .filter(r => { const tg = r.tags || [], quick = tg.includes('quick'); switch (top.cat || '') {
      case 'cereal': return tg.includes('cereal'); case 'quick': return quick && !tg.includes('cereal'); case 'cooked': return !quick;
      case 'batch': return (r.keepsDays || 0) > 1; case 'hot': return !!r.microwave || (r.equipment || []).some(e => e === 'hob' || e === 'oven'); default: return true; } })
    .map(r => {
      const trial = { ...w, bl: { ...(w.bl || {}), [p.id]: { ...((w.bl || {})[p.id] || {}), [slot]: Array.from({ length: 7 }, (_, k) => k === d ? items.concat([r.id]) : blItems(w, p, slot, k)) } } };
      const sim = simulate(trial, C); const extra = sim.buy.prefTotal - base.buy.prefTotal; const n = nut(r);
      let score = -extra * 0.8 + (ratingSummary()[r.id] ? (ratingSummary()[r.id].avg - 3) : 0.3);
      if (remaining > 0) score -= Math.max(0, n.kcal - remaining) / 120;
      if (top.packed && slot === 'l' && !r.packable) score -= 3;
      if ((r.tags || []).includes('quick')) score += 0.4;
      score += n.protein / 25;
      return { r, extra, n, score };
    }).sort((a, b) => b.score - a.score);
  out += '<input class="search" type="search" id="blq" placeholder="Search ' + (meal === 'lunch' ? 'lunches' : 'breakfasts') + '" value="' + h(top.q || '') + '" data-input="blq" aria-label="Search">';
  const cats = meal === 'breakfast' ? [['', 'All'], ['cereal', 'Cereals'], ['quick', 'Quick'], ['cooked', 'Cooked']] : [['', 'All'], ['quick', 'Quick'], ['batch', 'Make ahead'], ['hot', 'Hot']];
  out += '<div class="chips wrapchips">' + cats.map(([k, n]) => '<button class="chip ' + ((top.cat || '') === k ? 'on' : '') + '" data-act="bl-cat" data-v="' + k + '">' + n + '</button>').join('') + '</div>';
  out += '<section class="stack"><h3>Add ' + (items.length ? 'something else' : 'something') + '</h3>' + opts.slice(0, 40).map(x => '<div class="sugg">' + tileHtml(x.r) + '<button class="pick" data-act="bl-add" data-v="' + h(x.r.id) + '"><b>' + h(x.r.title) + '</b><span class="muted small">' + x.n.kcal + ' kcal · ' + x.n.protein + 'g protein · ' + (x.r.time ? x.r.time + ' min' : 'no cooking') + '</span><span class="why">' +
    (x.extra < 0.05 ? '<b>nothing extra to buy</b>' : 'adds <span class="money">' + fmtMoney(x.extra) + '</span>') + (x.r.packable ? ' · packable' : '') + (x.r.keepsDays > 1 ? ' · keeps ' + x.r.keepsDays + ' days' : '') + (remaining > 0 && x.n.kcal > remaining ? ' · <span class="warnt">over target</span>' : '') + '</span></button><button class="icon-btn" data-act="peek" data-v="' + h(x.r.id) + '" aria-label="See the recipe">' + ICON.info + '</button></div>').join('') + '</section>';
  return out;
}
function lunchMain(r) { const big = (r.ingredients || []).filter(l => S.ING[l.i] && /Meat & fish|Tins|Dairy/.test(S.ING[l.i].aisle || '') && !S.ING[l.i].staple).sort((a, b) => (b.q || 0) - (a.q || 0))[0]; return big ? big.i.replace(/_.*$/, '') : (r.protein || r.id); }
// pick lunches for the week in batches (made once, eaten over a few days)
function autoLunches(pid) {
  const p = personById(pid); if (!p || !p.plan || !p.plan.l) return;
  const w = clone(currentWeek()); const C = ctx();
  const days = ((p.days && p.days.l) || [0, 1, 2, 3, 4]).slice().sort();
  const target = Number(p.kcalTarget) || 0;
  const recentL = new Set(); [S.prevWeek].forEach(pw => { if (pw && pw.bl && pw.bl[pid] && pw.bl[pid].l) pw.bl[pid].l.forEach(a => Array.isArray(a) && a.forEach(x => recentL.add(x))); });
  const lunches = S.recipes.filter(r => r.meal === 'lunch' && hasEquipment(r, S.settings) && checkPrefs(r, [p], S.ING).ok && !(ratingSummary()[r.id] && ratingSummary()[r.id].avg < 3));
  if (!lunches.length) { toast('No lunch recipes fit ' + p.name + '’s preferences.'); return; }
  w.bl = w.bl || {}; const cur = w.bl[pid] || {};
  const arr = Array.from({ length: 7 }, (_, k) => blItems(w, p, 'l', k)); const used = new Set(), usedMains = [];
  let k = 0;
  while (k < days.length) {
    const d0 = days[k];
    let best = null;
    for (const r of lunches) {
      if (used.has(r.id)) continue;
      const span = Math.max(1, Math.min(3, (r.keepsDays || 1) + 1));
      const block = [days[k]]; for (let j = k + 1; j < Math.min(days.length, k + span) && days[j] - days[j - 1] === 1; j++) block.push(days[j]);
      const trialArr = arr.slice(); block.forEach(x => trialArr[x] = [r.id]);
      const trial = { ...w, bl: { ...w.bl, [pid]: { ...cur, l: trialArr } } };
      const base = { ...w, bl: { ...w.bl, [pid]: { ...cur, l: arr } } };
      const st = simulate(trial, C), sb = simulate(base, C);
      const extra = st.buy.prefTotal - sb.buy.prefTotal + 1.5 * (st.wasteValue - sb.wasteValue);
      const n = nut(r);
      const dayK = personDay({ ...w, bl: {} }, { ...p, plan: { ...p.plan, l: false } }, d0).kcal; // breakfast + dinner without lunch
      // variety: don't build the whole week round the same main thing (tuna every day)
      const main = lunchMain(r); const sameMain = usedMains.filter(x => x === main).length;
      let score = -extra / block.length + (ratingSummary()[r.id] ? ratingSummary()[r.id].avg - 3 : 0.5) + n.protein / 20 + seeded(w.start + pid + r.id) * 1.5 - (recentL.has(r.id) ? 2 : 0) - sameMain * 2.5;
      if (target) score -= Math.max(0, dayK + n.kcal - target) / 100; else score -= Math.max(0, n.kcal - 500) / 100;
      if (p.packed && !r.packable) score -= 4;
      if (!best || score > best.score) best = { r, block, score };
    }
    if (!best) break;
    best.block.forEach(x => arr[x] = [best.r.id]); used.add(best.r.id); usedMains.push(lunchMain(best.r));
    k += best.block.length;
  }
  mutateWeek(x => { x.bl = x.bl || {}; x.bl[pid] = { ...(x.bl[pid] || {}), l: arr }; });
  toast('Lunches planned for ' + p.name);
}

// ---------- RECIPES ----------
function recipeMatches(r, f) {
  if (f.meal && (r.meal || 'dinner') !== f.meal) return false;
  if (f.cuisine && r.cuisine !== f.cuisine) return false;
  if (f.protein && r.protein !== f.protein) return false;
  if (f.category && (r.category || 'everyday') !== f.category) return false;
  if (f.quick && r.time > (S.settings.weeknightCap || 30)) return false;
  if (f.rated) { const rs = ratingSummary()[r.id]; if (f.rated === 'fav' && !(rs && rs.avg >= 4)) return false; if (f.rated === 'new' && rs) return false; }
  if (f.kcal) { const b = KCAL_BANDS.find(x => x[0] === f.kcal); const k = nut(r).kcal; if (b && !(k >= b[2] && k < b[3])) return false; }
  if (f.q) { const q = f.q.toLowerCase(); const hay = (r.title + ' ' + r.cuisine + ' ' + r.protein + ' ' + (r.category || '') + ' ' + (r.tags || []).join(' ') + ' ' + r.ingredients.map(l => ingName(l.i)).join(' ')).toLowerCase(); if (!q.split(/\s+/).every(t => hay.includes(t))) return false; }
  return true;
}
function activeFilterCount(f) { return ['category', 'rated', 'kcal', 'cuisine', 'protein'].filter(k => f[k]).length + (f.quick ? 1 : 0); }
function filterPanel(f, prefix, opts) {
  opts = opts || {};
  const chip = (act, v, label, on) => '<button class="chip ' + (on ? 'on' : '') + '" data-act="' + prefix + act + '" data-v="' + h(v) + '" aria-pressed="' + !!on + '">' + label + '</button>';
  let out = '<div class="chips wrapchips">' + chip('category', 'treat', 'Treats', f.category === 'treat') + chip('category', 'everyday', 'Everyday', f.category === 'everyday') + chip('rated', 'fav', '★ Favourites', f.rated === 'fav') + chip('rated', 'new', 'Not tried yet', f.rated === 'new') +
    (opts.noQuick ? '' : chip('quick', '1', '≤' + (S.settings.weeknightCap || 30) + ' min', f.quick)) + KCAL_BANDS.map(b => chip('kcal', b[0], b[1], f.kcal === b[0])).join('') + '</div>';
  out += '<div class="chips wrapchips">' + CUISINES.map(c => chip('cuisine', c, c, f.cuisine === c)).join('') + '</div>';
  out += '<div class="chips wrapchips">' + PROTEINS.map(p => chip('protein', p, p.charAt(0).toUpperCase() + p.slice(1), f.protein === p)).join('') + '</div>';
  if (activeFilterCount(f)) out += '<div><button class="linkish small" data-act="clear-filters" data-v="' + prefix + '">Clear filters</button></div>';
  return out;
}
function filterChips(f, prefix, opts) {
  opts = opts || {};
  const chip = (act, v, label, on) => '<button class="chip ' + (on ? 'on' : '') + '" data-act="' + prefix + act + '" data-v="' + h(v) + '" aria-pressed="' + !!on + '">' + label + '</button>';
  const active = activeFilterCount(f);
  S.moreFilters = S.moreFilters || {};
  const open = !!S.moreFilters[prefix];
  // one short row always visible; the rest folds away so the recipes stay on screen
  const out = '<div class="chips wrapchips">' + (opts.meals ? chip('meal', 'dinner', 'Dinners', f.meal === 'dinner') + chip('meal', 'lunch', 'Lunches', f.meal === 'lunch') + chip('meal', 'breakfast', 'Breakfast', f.meal === 'breakfast') : '') +
    '<button class="chip ' + (active ? 'on' : '') + '" data-act="more-filters" data-v="' + prefix + '" aria-expanded="' + open + '">Filters' + (active ? ' · ' + active : '') + ' ' + (open ? '▴' : '▾') + '</button></div>';
  return open ? out + filterPanel(f, prefix, opts) : out;
}
// photo card used on the Recipes tab (carousels and grids)
function cardImg(r) {
  const p = photoFor(r);
  if (!p) return '<span class="femoji ' + cuisineClass(r.cuisine) + '">' + h(r.icon || '🍽️') + '</span>';
  const src = p.url && /images\.unsplash\.com/.test(p.url) ? p.url.replace(/([?&])w=\d+/, '$1w=480&h=360') : (p.url || p.thumb);
  return '<img src="' + h(src) + '" alt="" loading="lazy" decoding="async" onerror="var s=document.createElement(\'span\');s.className=\'femoji ' + cuisineClass(r.cuisine) + '\';s.textContent=' + h(JSON.stringify(r.icon || '🍽️')) + ';this.replaceWith(s)">';
}
function vcardHtml(r, act) {
  const pc = checkPrefs(r, S.people, S.ING), n = nut(r), rs = ratingSummary()[r.id], eq = hasEquipment(r, S.settings);
  let badge = '';
  if (!pc.ok) badge = '<span class="tag bad vtag">' + h(pc.blocked[0].person) + ' won’t eat ' + h(pc.blocked[0].what.toLowerCase()) + '</span>';
  else if (!eq) badge = '<span class="tag warn vtag">Needs ' + h(missingEquipment(r).join(', ')) + '</span>';
  else if (pc.swaps.length) badge = '<span class="tag onimg vtag">Easy swap for ' + h(pc.swaps.map(s => s.person).filter((x, i, a) => a.indexOf(x) === i).join(' & ')) + '</span>';
  else if (r.category === 'treat') badge = '<span class="tag treat vtag">Treat</span>';
  else if (r.custom) badge = '<span class="tag onimg vtag">Yours</span>';
  const star = rs ? '<span class="tag onimg vstar">' + rs.avg.toFixed(1) + '★</span>' : '';
  const dim = !pc.ok || !eq || (rs && rs.avg < 3);
  return '<button class="vcard' + (dim ? ' blocked' : '') + '" data-act="' + act + '" data-v="' + h(r.id) + '"><span class="fimg">' + cardImg(r) + badge + star + '</span>' +
    '<span class="vb"><b>' + h(rt(r)) + '</b><span class="muted small">' + (r.time ? r.time + ' min · ' : '') + (n.kcal ? n.kcal + ' kcal · ' : '') + '<span class="money">' + fmtMoney(recipeCost(r)) + '</span></span></span></button>';
}
// best first: things everyone can eat, then favourites, then ones with a photo
function shelfSort(list) {
  const RS = ratingSummary();
  const key = r => { const pc = checkPrefs(r, S.people, S.ING); const rs = RS[r.id]; return (pc.ok && hasEquipment(r, S.settings) && !(rs && rs.avg < 3) ? 0 : 100) - (rs ? rs.avg * 3 : 0) - (photoFor(r) ? 4 : 0) + seeded(r.id + TODAY) ; };
  return list.map(r => [key(r), r]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
}
function shelfHtml(title, list, see) {
  if (!list.length) return '';
  return '<section class="shelf"><div class="row between"><h2>' + h(title) + '</h2>' + (list.length > 3 ? '<button class="chip" data-act="f-shelf" data-v="' + h(see) + '">See all ' + list.length + '</button>' : '') + '</div>' +
    '<div class="carousel">' + shelfSort(list).slice(0, 12).map(r => vcardHtml(r, 'open-recipe')).join('') + '</div></section>';
}
function renderRecipes(nr) {
  const f = S.filters, meal = f.meal || '', active = activeFilterCount(f);
  S.moreFilters = S.moreFilters || {};
  const open = !!S.moreFilters['f-'];
  let out = '<div class="top"><div class="row between"><h1>Recipes</h1><button class="btn soft" data-act="new-recipe">' + ICON.plus + ' Add your own</button></div>' +
    '<div class="toolbar"><input class="search" id="rq" type="search" placeholder="Search recipes" value="' + h(f.q) + '" data-input="rq" aria-label="Search recipes">' +
    '<button class="btn' + (active ? ' primary' : '') + '" data-act="more-filters" data-v="f-" aria-expanded="' + open + '">Filters' + (active ? ' · ' + active : '') + '</button></div>' +
    '<span class="seg full" role="tablist">' + [['', 'All'], ['dinner', 'Dinners'], ['lunch', 'Lunches'], ['breakfast', 'Breakfast']].map(([k, n]) => '<button role="tab" class="' + (meal === k ? 'on' : '') + '" data-act="f-meal-set" data-v="' + k + '" aria-selected="' + (meal === k) + '">' + n + '</button>').join('') + '</span></div>';
  if (open) out += '<div class="panel" style="gap:8px">' + filterPanel(f, 'f-') + '</div>';
  if (nr) return out + nr;
  // recipes you can't make (missing equipment) or someone won't eat are tucked away unless you ask to see them
  const canMake = r => hasEquipment(r, S.settings) && checkPrefs(r, S.people, S.ING).ok;
  const all = S.recipes.filter(r => recipeMatches(r, f)), hiddenN = all.filter(r => !canMake(r)).length;
  const list = S.showHidden ? all : all.filter(canMake);
  const hiddenNote = hiddenN ? '<p class="muted small center">' + (S.showHidden ? 'Showing ' + hiddenN + ' you can\u2019t make as things stand. <button class="linkish small" data-act="show-hidden">Hide them</button>' : hiddenN + ' hidden because they need kit you don\u2019t have or someone won\u2019t eat them. <button class="linkish small" data-act="show-hidden">Show them</button>') + '</p>' : '';
  const browsing = !f.q && !active && (meal === '' || meal === 'dinner');
  if (browsing) {
    const RS = ratingSummary(), cap = S.settings.weeknightCap || 30;
    const din = list.filter(isDinner);
    out += shelfHtml('Your favourites', list.filter(r => RS[r.id] && RS[r.id].avg >= 4), 'rated=fav');
    out += shelfHtml('Quick weeknights', din.filter(r => r.time <= cap && r.category !== 'treat'), 'quick=1,meal=dinner');
    out += shelfHtml('Treat nights', din.filter(r => r.category === 'treat'), 'category=treat,meal=dinner');
    for (const c of CUISINES) out += shelfHtml(c, din.filter(r => r.cuisine === c), 'cuisine=' + c + ',meal=dinner');
    const other = din.filter(r => !CUISINES.includes(r.cuisine)); if (other.length) out += shelfHtml('Other', other, 'meal=dinner');
    if (!meal) { out += shelfHtml('Lunches', list.filter(r => r.meal === 'lunch'), 'meal=lunch'); out += shelfHtml('Breakfasts', list.filter(r => r.meal === 'breakfast'), 'meal=breakfast'); }
    return out + hiddenNote;
  }
  const shown = shelfSort(list).slice(0, S.recMore || 60);
  out += '<div class="row between"><p class="muted small">' + list.length + ' recipe' + (list.length === 1 ? '' : 's') + '</p>' + (active || f.q ? '<button class="linkish small" data-act="f-reset">Show everything</button>' : '') + '</div>';
  out += '<div class="vgrid">' + shown.map(r => vcardHtml(r, 'open-recipe')).join('') + '</div>';
  if (list.length > shown.length) out += '<button class="btn block" data-act="rec-more">Show more (' + (list.length - shown.length) + ' left)</button>';
  if (!list.length) out += '<p class="empty-state muted">Nothing matches. Try fewer filters.</p>';
  return out + hiddenNote;
}

// ---------- SHOP ----------
// the shopping list minus anything you've said you already have
function weekList(w, sim, C) {
  const have = w.have || {};
  const purchases = {}; for (const id in sim.purchases) if (!have[id]) purchases[id] = sim.purchases[id];
  const status = { ...((S.pantry && S.pantry.status) || {}) }; for (const id in have) delete status[id];
  return shoppingList({ ...sim, purchases }, C, { ...(S.pantry || {}), status });
}
function listText(list, w) {
  const lines = ['Shopping list · ' + weekRange(w.start), ''];
  for (const a of list.aisles) {
    lines.push(a.toUpperCase());
    for (const row of list.groups[a]) {
      const ing = S.ING[row.i]; const counts = {}; row.packs.forEach(p => counts[p] = (counts[p] || 0) + 1);
      lines.push((w.checked[row.i] ? '✓ ' : '• ') + ing.name + ' — ' + Object.keys(counts).map(p => counts[p] + ' × ' + packLabel(ing, Number(p))).join(' + '));
    }
    lines.push('');
  }
  w.extras.forEach(x => lines.push((x.done ? '✓ ' : '• ') + x.name));
  lines.push('', 'Estimated ' + fmtMoney(list.basket.prefTotal) + ' at ' + prefShopName());
  return lines.join('\n');
}
function segHtml(act, cur, opts) {
  return '<span class="seg full" role="tablist">' + opts.map(([k, n, c]) => '<button role="tab" class="' + (cur === k ? 'on' : '') + '" data-act="' + act + '" data-v="' + k + '" aria-selected="' + (cur === k) + '">' + n + (c ? '<span class="count">' + c + '</span>' : '') + '</button>').join('') + '</span>';
}
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-');
function renderShop() {
  const w = currentWeek(), C = ctx();
  const sim = simulate(w, C), list = weekList(w, sim, C), B = list.basket;
  let out = headerWeek(sim, list);
  const prefKey = B.prefKey;
  const nItems = B.rows.length, nDone = B.rows.filter(r => w.checked[r.i]).length;
  if (!nItems) return out + '<div class="panel empty-state"><h2>Nothing to buy yet</h2><p class="muted">Plan some dinners on the Week tab and the list builds itself, rounded up to whole packs.</p><button class="btn primary" data-act="tab" data-v="week">Plan the week</button></div>';
  const view = S.shopView || 'list';
  out += segHtml('shop-view', view, [['list', 'List', nDone + '/' + nItems], ['compare', 'Compare'], ['cost', 'Costs']]);
  if (view === 'compare') return out + renderComparison(B);
  if (view === 'cost') return out + shopLogPanel(B) + '<section class="panel"><h2>Waste and cost</h2><div class="grid2">' +
    '<div><div class="label">Dinners cost</div><div class="money big-num">' + fmtMoney(sim.consumed) + '</div><div class="muted small">' + sim.portions + ' portions · ' + fmtMoney(sim.perPortion) + ' each' + (sim.blPortions ? '<br>Breakfasts &amp; lunches ' + fmtMoney(sim.blCost) + ' for ' + sim.blPortions : '') + '</div></div>' +
    '<div><div class="label">Likely unused</div><div class="money big-num" style="color:' + (sim.wasteValue > 1 ? 'var(--warn)' : 'inherit') + '">' + fmtMoney(sim.wasteValue) + '</div><div class="muted small">' + (Object.keys(sim.waste).length ? Object.keys(sim.waste).length + ' item' + (Object.keys(sim.waste).length > 1 ? 's' : '') : 'nothing') + '</div></div></div>' +
    (Object.keys(sim.waste).length ? '<div class="leftlist">' + Object.keys(sim.waste).map(id => '<div class="left"><span>' + h(leftText(id, sim.waste[id])) + '<br><button class="linkish small" data-act="use-up" data-v="' + h(id) + '">Find a meal or lunch that uses it</button></span><span class="money">' + fmtMoney(sim.waste[id] * unitPrice(S.ING[id], weekShop(), S.settings.useLoyalty !== false)) + '</span></div>').join('') + '</div>' : '') +
    (() => { const n = sim.carryOut.filter(L => S.ING[L.i] && !S.ING[L.i].staple).length; return n ? '<p class="muted small">' + n + ' spare thing' + (n > 1 ? 's carry' : ' carries') + ' into next week, and suggestions there use ' + (n > 1 ? 'them' : 'it') + ' first. <button class="linkish small" data-act="go-left">See what\u2019s left</button></p>' : ''; })() +
    '<p class="muted small">Meal costs include a share of pantry staples. Spare food that keeps or freezes carries into next week and isn’t counted as waste.</p></section>';
  const isTop = row => row.staple;
  let foodTotal = 0, topTotal = 0;
  B.rows.forEach(r => { if (isTop(r)) topTotal += r.byShop[prefKey].cost; else foodTotal += r.byShop[prefKey].cost; });
  const tops = B.rows.filter(isTop).sort((x, y) => (x.always === y.always ? S.ING[x.i].name.localeCompare(S.ING[y.i].name) : x.always ? -1 : 1));
  const aisles = list.aisles.filter(a => list.groups[a].some(r => !isTop(r)));
  out += '<div class="row between"><span class="muted small">Prices at ' + h(prefShopName()) + '</span><button class="btn small-btn" data-act="share-menu" aria-expanded="' + !!S.shareMenu + '">' + ICON.share + ' Share</button></div>';
  if (S.shareMenu) out += '<div class="mgroup popmenu" role="menu"><button class="mrow1" role="menuitem" data-act="copy-list">Copy the list</button><a class="mrow1" role="menuitem" href="https://wa.me/?text=' + encodeURIComponent(listText(list, w)) + '" target="_blank" rel="noopener">Send it on WhatsApp</a></div>';
  for (const a of aisles) {
    const rows = list.groups[a].filter(r => !isTop(r));
    out += '<section class="aisle" id="sec-' + slug(a) + '"><h3>' + h(a) + '</h3>' + rows.slice().sort((x, y) => (w.checked[x.i] ? 1 : 0) - (w.checked[y.i] ? 1 : 0)).map(r => shopRowHtml(r, B, w)).join('') + '</section>';
  }
  out += '<div class="subtot"><span>Food for the week</span><span class="money">' + fmtMoney(foodTotal) + '</span></div>';
  if (tops.length) {
    out += '<section class="aisle topups" id="sec-topups"><h3>Cupboard top-ups</h3><p class="muted small">Staples you marked low that this week’s meals use. A pack lasts weeks, so this is mostly a one-off. Skip anything you can do without.</p>' + tops.map(r => shopRowHtml(r, B, w)).join('') + '</section>';
    out += '<div class="subtot"><span>Cupboard top-ups</span><span class="money">' + fmtMoney(topTotal) + '</span></div>';
  }
  if (sim.skippedOpt && sim.skippedOpt.length) { const ids = Array.from(new Set(sim.skippedOpt.map(x => x.i))); out += '<p class="muted small">Left off because they’re optional and you’re low: ' + ids.map(id => h(lowerName(id))).join(', ') + '.</p>'; }
  out += '<section class="panel" id="sec-extras"><h3>Anything else?</h3>';
  w.extras.forEach((x, k) => { out += '<div class="item ' + (x.done ? 'done' : '') + '" style="border-top:0;padding:4px 0"><button class="check ' + (x.done ? 'on' : '') + '" data-act="tick-extra" data-v="' + k + '" aria-label="Tick ' + h(x.name) + '">' + (x.done ? ICON.tick : '') + '</button><div class="iname">' + h(x.name) + '</div><button class="icon-btn" data-act="del-extra" data-v="' + k + '" aria-label="Remove ' + h(x.name) + '">' + ICON.close + '</button></div>'; });
  const haveIds = Object.keys(w.have || {}).filter(id => S.ING[id]);
  if (haveIds.length) out += '<details class="havebox"><summary>Already at home (' + haveIds.length + ')</summary>' + haveIds.map(id => '<div class="row between ruled-sm"><span>' + h(ingName(id)) + '</span><button class="chip" data-act="unhave" data-v="' + h(id) + '">Put back on list</button></div>').join('') + '</details>';
  out += '<form class="row" data-form="extra"><input class="input grow" id="extra-name" placeholder="e.g. toilet roll, milk for tea" aria-label="Add an item"><button class="btn" type="submit">Add</button></form><p class="muted small">Extra items aren’t priced.</p></section>';
  out += '<p class="muted small">Tap a price to compare shops. Ticks sync between your phones and work offline.</p>';
  if (nDone && nDone >= nItems * 0.6) out += '<button class="btn block" data-act="go-cost">Done the shop? Log what you paid</button>';
  return out;
}
function shopRowHtml(row, B, w) {
  const prefKey = B.prefKey;
  const ing = S.ING[row.i], done = !!w.checked[row.i], ps = row.byShop[prefKey];
  const counts = {}; row.packs.forEach(p => counts[p] = (counts[p] || 0) + 1);
  const packTxt = Object.keys(counts).sort((x, y) => y - x).map(p => counts[p] + ' × ' + packLabel(ing, Number(p))).join(' + ');
  const open = S.expanded['s:' + row.i];
  let why;
  if (row.staple) {
    const forR = (row.forWhat || []).map(id => S.RMAP[id] && S.RMAP[id].title).filter(Boolean);
    why = row.always ? 'always buy when low' : 'for ' + Array.from(new Set(row.forDays)).map(x => DAY_NAMES[x]).join(', ') + (forR.length ? ' (' + h(forR[0].split(/ with | & |,/)[0]) + (forR.length > 1 ? ' +' + (forR.length - 1) : '') + ')' : '');
  } else why = 'need ' + fmtQty(row.need, ing.unit);
  let out = '<div class="item ' + (done ? 'done' : '') + '"><button class="check ' + (done ? 'on' : '') + '" data-act="tick" data-v="' + h(row.i) + '" aria-label="' + (done ? 'Untick ' : 'Tick ') + h(ing.name) + '" aria-pressed="' + done + '">' + (done ? ICON.tick : '') + '</button>' +
    '<div style="min-width:0"><div class="iname">' + h(ing.name) + '</div><div class="muted small">' + packTxt + ' · ' + why + '</div>' + (row.staple ? '<button class="linkish small" data-act="have" data-v="' + h(row.i) + '">Skip this week</button>' : '') + '</div>' +
    '<button class="more" data-act="expand" data-v="s:' + h(row.i) + '" aria-expanded="' + !!open + '">' + (ps.missing ? '<span class="tag warn">add price</span>' : '<span class="money">' + fmtMoney(ps.cost) + '</span>' + (ps.stale ? ' <span class="tag warn">old</span>' : '')) + '</button>';
  if (open) {
    const sp = shopPrice(ing, weekShop(), false);
    out += '<div class="shopprices">' + B.keys.map(k => { const x = row.byShop[k.key]; return '<div><span>' + SHOP_KEY_NAMES[k.key] + (x.pack && !x.missing ? ' <span class="muted">' + x.count + ' × ' + packLabel(ing, x.pack) + '</span>' : '') + '</span><span><span class="money">' + fmtMoney(x.cost) + '</span>' + (x.missing ? ' <span class="tag">no price</span>' : x.stale ? ' <span class="tag warn">old</span>' : x.est ? ' <span class="tag">est.</span>' : '') + '</span></div>'; }).join('') +
      '<form class="row paidrow" data-form="paid" data-v="' + h(row.i) + '"><label for="paid-' + h(row.i) + '" class="small">I paid £</label><input class="input" id="paid-' + h(row.i) + '" type="number" step="0.01" min="0" inputmode="decimal" placeholder="' + (sp ? sp.price.toFixed(2) : '') + '"><span class="small muted">for ' + (sp ? packLabel(ing, sp.pack) : 'one pack') + ' at ' + h((SHOPS.find(x => x.id === weekShop()) || SHOPS[0]).name) + '</span><button class="btn small-btn" type="submit">Save</button></form>' +
      '<div><span class="muted">Prices last checked ' + lastChecked(ing) + '</span><span class="row" style="gap:6px"><button class="chip" data-act="have" data-v="' + h(row.i) + '">We have it</button><button class="chip" data-act="edit-price" data-v="' + h(row.i) + '">Edit prices</button></span></div></div>';
  }
  return out + '</div>';
}
function lastChecked(ing) {
  const dates = SHOPS.map(s => ing.prices && ing.prices[s.id] && ing.prices[s.id].checked).filter(Boolean).sort();
  if (!dates.length) return 'never';
  const d = dates[dates.length - 1], age = ageDays(dates[0], TODAY);
  return parseIso(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) + (age > STALE_DAYS ? ' (some over 2 months old)' : '');
}
function renderComparison(B) {
  const order = ['tesco', 'tesco+', 'sainsburys', 'sainsburys+', 'asda', 'aldi', 'lidl', 'lidl+'];
  const max = Math.max(...order.filter(k => B.totals[k].comparable).map(k => B.totals[k].total), 1), bud = weeklyBudget();
  const best = B.cheapest, pref = B.prefKey;
  let out = '<section class="panel"><div class="row between"><h2>Price comparison</h2><span class="muted small">This week\u2019s list</span></div>';
  if (weekShop() !== S.settings.shop) out += '<div class="note">This week you\u2019re shopping at <b>' + h((SHOPS.find(x => x.id === weekShop()) || {}).name) + '</b>, so the list uses its pack sizes. <button class="linkish" data-act="week-shop" data-v="' + h(S.settings.shop) + '">Back to ' + h((SHOPS.find(x => x.id === S.settings.shop) || {}).name) + '</button></div>';
  const saving = best === pref ? 0 : B.totals[pref].total - B.totals[best].total, worth = saving >= Math.max(2, B.totals[pref].total * 0.05);
  if (best !== pref && !worth) out += '<div class="note good"><b>' + SHOP_KEY_NAMES[pref] + ' is within <span class="money">' + fmtMoney(saving) + '</span> of the cheapest</b> (' + SHOP_KEY_NAMES[best] + '), so it\u2019s not worth switching this week.</div><div class="compare">';
  else out += '<div class="note ' + (best === pref ? 'good' : '') + '">' + (best === pref ? '<b>' + SHOP_KEY_NAMES[pref] + ' is already the cheapest</b> for this list.' :
    'Cheapest: <b>' + SHOP_KEY_NAMES[best] + ' at <span class="money">' + fmtMoney(B.totals[best].total) + '</span></b>, saving <span class="money">' + fmtMoney(B.totals[pref].total - B.totals[best].total) + '</span> on ' + SHOP_KEY_NAMES[pref] + '.' +
      (!currentWeek().locked && best.replace('+', '') !== weekShop() ? '<div style="margin-top:8px"><button class="btn small-btn primary" data-act="week-shop" data-v="' + best.replace('+', '') + '">Shop at ' + h((SHOPS.find(x => x.id === best.replace('+', '')) || {}).name) + ' this week</button></div>' : '')) + '</div><div class="compare">';
  for (const k of order) {
    const T = B.totals[k]; const flags = [];
    if (!T.comparable && k.includes('+')) continue;
    if (!T.comparable) { out += '<div class="cmp nocmp"><span class="sname">' + SHOP_KEY_NAMES[k] + '</span><span class="muted small">Not enough prices</span><span class="muted small" style="grid-column:1/3">Only ' + (B.rows.length - T.missing) + ' of ' + B.rows.length + ' items on this list are listed on ' + h((SHOPS.find(x => x.id === k.replace('+', '')) || {}).name) + '\u2019s website' + (k.startsWith('lidl') ? '. Lidl doesn\u2019t sell online, so most of its range has no published price. Shop there once and add what you paid (tap a price on the list), and it\u2019ll be compared properly from then on.' : '.') + '</span></div>'; continue; }
    if (T.missing) flags.push(T.missing + ' not sold there online (priced at ' + h((SHOPS.find(x => x.id === weekShop()) || {}).name) + ')');
    
    if (T.stale) flags.push(T.stale + ' over 2 months old');
    if (T.rough) flags.push(T.rough + ' a rough guide (e.g. matched to Aldi)');
    const base = k.replace('+', ''), isShop = base === weekShop();
    out += '<div class="cmp ' + (k === best ? 'best' : '') + '"><span class="sname">' + SHOP_KEY_NAMES[k] + (k === pref ? ' <span class="tag">your shop</span>' : '') + (k === best ? ' <span class="tag good">cheapest</span>' : '') + '</span><span class="money">' + fmtMoney(T.total) + '</span>' +
      '<span class="bar"><i style="width:' + (T.total / max * 100).toFixed(1) + '%"></i></span>' +
      (!k.includes('+') && !isShop && !currentWeek().locked ? '<button class="linkish small" style="grid-column:1/3;justify-self:start;min-height:32px;padding:0" data-act="week-shop" data-v="' + base + '">Shop here this week</button>' : '') +
      '<span class="muted small" style="grid-column:1/3">' + (T.total <= bud ? fmtMoney(bud - T.total) + ' under' : fmtMoney(T.total - bud) + ' over') + ' your ' + fmtMoney(bud) + ' week' + (flags.length ? ' · ' + flags.join(', ') : '') + '</span></div>';
  }
  out += '</div><p class="muted small">Other shops are priced with their own pack sizes, so the amount you take home can differ a little. Clubcard and Nectar prices are short-term offers.</p></section>';
  return out;
}

// ---------- KITCHEN ----------
function carryRow(c, k) {
  const ing = S.ING[c.i]; if (!ing) return '';
  return '<div class="stack ruled"><div class="row between"><b>' + h(ing.name) + '</b><button class="icon-btn" data-act="del-carry" data-v="' + k + '" aria-label="Remove ' + h(ing.name) + '">' + ICON.close + '</button></div>' +
    '<div class="grid2"><label class="field"><span>Amount (' + (ing.unit === 'each' ? 'items' : h(ing.unit)) + ')</span><input class="input" type="number" min="0" step="any" id="cq-' + k + '" data-change="carry-q" data-v="' + k + '" value="' + (Number(c.q) || 0) + '"></label>' +
    '<label class="field"><span>' + (c.frozen ? 'In the freezer' : 'Use by') + '</span>' + (c.frozen ? '<button class="btn" data-act="carry-thaw" data-v="' + k + '">Mark thawed</button>' : '<input class="input" type="date" id="ce-' + k + '" data-change="carry-exp" data-v="' + k + '" value="' + h(c.exp || '') + '">') + '</label></div></div>';
}
function carryAddForm(w, frozen) {
  const ingOpts = Object.values(S.ING).filter(i => !i.staple && (!frozen || i.freeze)).sort((a, b) => a.name.localeCompare(b.name)).map(i => '<option value="' + h(i.id) + '">' + h(i.name) + '</option>').join('');
  return '<details class="fold"><summary><span class="row" style="gap:8px">' + ICON.plus + ' Add something ' + (frozen ? 'from the freezer' : 'you have') + '</span></summary><div class="in"><form class="stack" data-form="carry-add"><select class="input" id="ca-i" aria-label="Ingredient">' + ingOpts + '</select>' +
    '<div class="grid2"><input class="input" id="ca-q" type="number" min="0" step="any" placeholder="Amount" aria-label="Amount"><input class="input" id="ca-e" type="date" aria-label="Use by" value="' + addDays(w.start, 2) + '"></div>' +
    '<label class="row"><input type="checkbox" id="ca-f" class="cb"' + (frozen ? ' checked' : '') + '> It’s in the freezer</label><button class="btn" type="submit">Add</button></form></div></details>';
}
function renderKitchen() {
  const w = currentWeek(), C = ctx(), sim = simulate(w, C);
  let out = headerWeek(null);
  const nLow = Object.values(S.ING).filter(i => i.staple && ['low', 'out'].includes(S.pantry.status[i.id])).length;
  const fresh = w.carryIn.map((c, k) => [c, k]).filter(([c]) => !c.frozen), frozen = w.carryIn.map((c, k) => [c, k]).filter(([c]) => c.frozen);
  const nFreezer = frozen.length + w.freezerMeals.length;
  const view = S.kitView || 'pantry';
  out += segHtml('kit-view', view, [['pantry', 'Pantry', nLow ? nLow + ' low' : ''], ['left', 'Leftovers', fresh.length || ''], ['freezer', 'Freezer', nFreezer || '']]);
  const carryHead = (title) => '<div class="row between"><h2>' + title + '</h2><span class="row" style="gap:6px">' + (w.carryEdited ? '<button class="chip" data-act="reload-carry">Work it out again</button>' : '') + (w.carryIn.length || w.freezerMeals.length ? '<button class="chip" data-act="clear-carry">Clear all</button>' : '') + '</span></div>';
  if (view === 'left') {
    out += '<section class="panel">' + carryHead('Coming into this week') + '<p class="muted small">' + (w.carryEdited ? 'You’ve edited this list, so it stays as you set it.' : 'Worked out from what last week used and left over.') + ' Suggestions use these first.</p>' +
      (fresh.length ? fresh.map(([c, k]) => carryRow(c, k)).join('') : '<p class="muted">Nothing left over from last week.</p>') + '</section>';
    out += carryAddForm(w, false);
    out += makePanel(w, sim);
    const outs = sim.carryOut.filter(L => !L.frozen);
    out += '<section class="panel"><h2>Going into next week</h2>' + (outs.length ? outs.map(L => '<div class="left"><span>' + h(leftText(L.i, L.q)) + '</span><span class="muted small">' + (L.exp ? useByText(L.exp) : '') + '</span></div>').join('') : '<p class="muted">Nothing yet.</p>') + '</section>';
    return out;
  }
  if (view === 'freezer') {
    const F = sim.freezer || {}, cap = Number(S.settings.freezerSpace) || 0;
    const pct = cap ? Math.min(100, Math.round(Math.max(F.start, F.end) / cap * 100)) : 0;
    out += '<section class="panel"><div class="row between"><h2>Freezer space</h2>' + (cap ? '<span class="tag ' + (F.peak >= cap ? 'warn' : 'good') + '">' + F.start + ' of ' + cap + ' things</span>' : '') + '</div>';
    if (!cap) out += '<p class="small">How much room is in your freezer? The planner then stops freezing extras once it\u2019s full, so it never gets out of hand.</p>';
    else out += '<div class="meter"><i class="' + (F.peak >= cap ? 'over' : '') + '" style="width:' + pct + '%"></i></div><p class="muted small">Now: ' + F.start + ' thing' + (F.start === 1 ? '' : 's') + ' (packs, bags and portions). After this week\u2019s plan: ' + F.end + (F.peak > F.end ? ', ' + F.peak + ' at the busiest point' : '') + '.' + (F.fullSkips ? ' <b>It fills up this week</b>, so some spares won\u2019t be frozen: the planner favours meals that use what\u2019s in there.' : '') + '</p>';
    out += '<div class="stack" style="gap:6px"><span class="label">Room for about</span><div class="row wrap" style="gap:6px">' + [[8, 'Small \u00b7 8'], [15, 'Fridge-freezer \u00b7 15'], [30, 'Tall freezer \u00b7 30']].map(([v, n]) => '<button class="chip ' + (cap === v ? 'on' : '') + '" data-act="freezer-space" data-v="' + h(v) + '">' + n + '</button>').join('') +
      (cap ? '<span class="row" style="gap:4px"><button class="icon-btn" data-act="freezer-space" data-v="' + Math.max(1, cap - 1) + '" aria-label="Less room">\u2212</button><b class="num">' + cap + '</b><button class="icon-btn" data-act="freezer-space" data-v="' + (cap + 1) + '" aria-label="More room">+</button></span>' : '') + '</div></div></section>';
    out += '<section class="panel"><h2>Cooked meals</h2>';
    if (!w.freezerMeals.length) out += '<p class="muted">No cooked meals in the freezer. Add extra portions to a dinner and choose “to freeze” to bank some.</p>';
    w.freezerMeals.forEach((m, k) => { const r = S.RMAP[m.r]; out += '<div class="row between ruled-sm"><span>' + h(r ? rt(r) : m.r) + ' · ' + (Number(m.portions) || 0) + ' portion' + (m.portions > 1 ? 's' : '') + '</span><button class="icon-btn" data-act="del-fm" data-v="' + k + '" aria-label="Remove">' + ICON.close + '</button></div>'; });
    out += '</section><section class="panel">' + carryHead('Frozen ingredients') + (frozen.length ? frozen.map(([c, k]) => carryRow(c, k)).join('') : '<p class="muted">Nothing frozen. Spare meat, fish and bread get frozen automatically when a plan leaves some over.</p>') + '</section>';
    out += carryAddForm(w, true);
    const outs = sim.carryOut.filter(L => L.frozen);
    if (outs.length || sim.freezerOut.length) out += '<section class="panel"><h2>Still frozen next week</h2>' + outs.map(L => '<div class="left"><span>' + h(leftText(L.i, L.q)) + '</span><span class="muted small">frozen</span></div>').join('') + sim.freezerOut.map(m => { const r = S.RMAP[m.r]; return '<div class="left"><span>' + h(r ? rt(r) : m.r) + '</span><span class="muted small">' + (Number(m.portions) || 0) + ' portion' + (m.portions > 1 ? 's' : '') + '</span></div>'; }).join('') + '</section>';
    return out;
  }
  const always = S.pantry.always || { milk: true };
  const q = (S.pantryQ || '').toLowerCase();
  const staples = Object.values(S.ING).filter(i => i.staple && (!q || i.name.toLowerCase().includes(q))).sort((a, b) => a.name.localeCompare(b.name));
  if (!S.pantry.checkedOnce) out += '<div class="note"><b>Quick cupboard check.</b> Everything starts as \u201cGot it\u201d, so the first list assumes you have it all. Open each group and tap <b>Low</b> on anything you\u2019re out of.<div style="margin-top:8px"><button class="btn small-btn" data-act="pantry-checked">Done, that\u2019s everything</button></div></div>';
  out += '<p class="muted small">Mark something <b>Low</b> and it goes on the shopping list only in a week where a meal needs it. Turn on <b>Always buy</b> for things you use every day, like milk for tea.</p>' +
    '<input class="search" type="search" id="pantryq" placeholder="Search your staples" value="' + h(S.pantryQ || '') + '" data-input="pantryq" aria-label="Search staples">';
  const groups = {}; staples.forEach(i => (groups[i.aisle || 'Other'] = groups[i.aisle || 'Other'] || []).push(i));
  const order = AISLE_ORDER.filter(a => groups[a]).concat(Object.keys(groups).filter(a => !AISLE_ORDER.includes(a)));
  out += '<section class="panel pantrylist">';
  for (const a of order) {
    const list = groups[a], low = list.filter(i => ['low', 'out'].includes(S.pantry.status[i.id])).length;
    const open = q || S.expanded['pan:' + a];
    out += '<details class="pgroup" data-pgroup="' + h(a) + '"' + (open ? ' open' : '') + '><summary><span>' + h(a) + ' <span class="muted small">' + list.length + '</span></span>' + (low ? '<span class="tag warn">' + low + ' low</span>' : '') + '</summary>';
    list.forEach(i => {
      const st = S.pantry.status[i.id] || 'have';
      out += '<div class="stack ruled-sm" style="gap:6px"><div class="pantryrow"><span>' + h(i.name) + '</span><span class="seg" role="group" aria-label="' + h(i.name) + '"><button class="' + (st === 'have' ? 'on' : '') + '" data-act="pantry" data-v="' + h(i.id) + '" data-s="have">Got it</button><button class="' + (st !== 'have' ? 'on' : '') + '" data-act="pantry" data-v="' + h(i.id) + '" data-s="low">Low</button></span></div>' +
        (st !== 'have' ? '<label class="row small"><input type="checkbox" class="cb" data-change="pantry-always" data-v="' + h(i.id) + '" ' + (always[i.id] ? 'checked' : '') + '> Always buy when low</label>' : '') + '</div>';
    });
    out += '</details>';
  }
  out += '</section>';
  if (q && !staples.length) out += '<p class="muted small">No staples match “' + h(S.pantryQ) + '”.</p>';
  const addable = q ? Object.values(S.ING).filter(i => !i.staple && i.name.toLowerCase().includes(q)).slice(0, 6) : [];
  if (addable.length) out += '<div class="stack" style="gap:6px"><span class="label">Add as a staple</span>' + addable.map(i => '<div class="row between ruled-sm"><span>' + h(i.name) + '</span><button class="chip" data-act="make-staple" data-v="' + h(i.id) + '">' + ICON.plus + ' Add</button></div>').join('') + '</div>';
  else if (!q) out += '<p class="muted small">Missing something? Search for it above to add it as a staple.</p>';
  return out;
}

// ---------- LINKED APPS: Caledonite (shifts → who's in, reminders) and Budgie (what you paid) ----------
let curHid = null;
const LINK = { get(k, d) { try { const v = localStorage.getItem('peckish.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { try { if (v == null) localStorage.removeItem('peckish.' + k); else localStorage.setItem('peckish.' + k, JSON.stringify(v)); } catch (e) {} } };
const CAL_TYPES = { long: { start: '07:30', end: '20:00' }, night: { start: '19:30', end: '08:00' }, early: { start: '07:00', end: '15:30' }, late: { start: '12:30', end: '20:30' }, leave: { allDay: true }, off: { allDay: true } };
S.cal = { on: false, user: null, data: null, err: '', busy: false, at: 0 };
// Caledonite and Budgie stay with the household they were linked in, so another household you're in never gets your
// shifts, reminders or Budgie food payments. (A link made before this goes with the first household opened.)
// Caledonite can be linked in each household you choose; Budgie in one (linking it in another moves it)
function calHids() { const c = LINK.get('cal', false); return Array.isArray(c) ? c : typeof c === 'string' ? [c] : []; }
function linkScope(hid) {
  if (LINK.get('cal', false) === true) LINK.set('cal', [hid]);
  // the household just opened gets its shifts (and reminders) checked as soon as its people arrive
  S.cal.on = calHids().includes(hid); S.cal.at = 0;
  if (!S.cal.on) { if (S.cal.unsub) { S.cal.unsub(); S.cal.unsub = null; } S.cal.user = null; S.cal.data = null; S.cal.at = 0; }
  let b = LINK.get('budgie', null); if (b && !b.hid) { b = { ...b, hid }; LINK.set('budgie', b); }
  S.bg.cfg = b && b.hid === hid ? b : null; S.bg.err = ''; S.bg.at = 0;
  S.bg.data = S.bg.cfg ? LINK.get('budgieData', null) || { since: 0, me: '', rows: {} } : { since: 0, me: '', rows: {} };
}
function calStart() {
  if (!Store.cal || !S.cal.on || S.cal.unsub) return;
  S.cal.unsub = Store.cal.onUser(u => { S.cal.user = u; schedule(); if (u) calRefresh(true); });
}
async function calLink() {
  if (!Store.cal) { toast('Linking needs the installed app.'); return; }
  LINK.set('cal', Array.from(new Set(calHids().concat(curHid ? [curHid] : [])))); S.cal.on = true; S.cal.err = ''; calStart();
  try { await Store.cal.signIn(); } catch (e) { S.cal.err = e.message || String(e); schedule(); }
}
async function calUnlink() {
  const rest = calHids().filter(x => x !== curHid), tag = calTag(curHid), sent = LINK.get('calNotes', {});
  // this household's reminders still waiting in Caledonite are taken back, so none arrive after unlinking
  // (one from before reminders named their household goes too when no other household is linked)
  for (const id in sent) {
    if (!(id.slice(14).startsWith(tag + '-') || (calLegacy(id) && !rest.length))) continue;
    if (Store.cal && S.cal.user) { try { await Store.cal.unnotify(id); } catch (e) { console.warn(e); } }
    delete sent[id];
  }
  LINK.set('cal', rest.length ? rest : false); LINK.set('calNotes', rest.length ? sent : null); S.cal.on = false;
  try { if (Store.cal && !rest.length) await Store.cal.signOut(); } catch (e) {}
  if (S.cal.unsub) { S.cal.unsub(); S.cal.unsub = null; } S.cal.user = null; S.cal.data = null; schedule();
}
// Each household's reminders have their own ids ("pk-<week>-h<household>-…"), so two households linked to Caledonite never
// replace or take back each other's. Ids from before that ("pk-<week>-<day>-…") are looked after by whichever runs first.
const calTag = hid => 'h' + String(hid || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 10);
const calLegacy = id => /^pk-\d{4}-\d{2}-\d{2}-\d/.test(id);
// Peckish person → Caledonite person: by name unless set in Settings → Linked apps
function calPidFor(p) { const m = (S.settings.calMap || {})[p.id]; if (m) return m === '-' ? null : m; const D = S.cal.data; if (!D) return null; const x = D.people.find(q => (q.name || '').toLowerCase() === (p.name || '').toLowerCase()); return x ? x.id : null; }
const hm = dt => String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0');
const toMins = t => { const [a, b] = String(t || '0:0').split(':').map(Number); return a * 60 + (b || 0); };
function calInfer(ev) {
  const t = (ev.t || '').toLowerCase();
  if (ev.ad) { if (/leave|holiday|annual|\bal\b/.test(t)) return 'leave'; if (/off|rest/.test(t)) return 'off'; return null; }
  if (/night/.test(t)) return 'night'; if (/long/.test(t)) return 'long'; if (/early/.test(t)) return 'early'; if (/late/.test(t)) return 'late';
  const s = new Date(ev.s), e = new Date(ev.e);
  if (e.getDate() !== s.getDate() || s.getHours() >= 18) return 'night';
  if ((e - s) / 3600000 >= 11) return 'long'; if (s.getHours() < 10) return 'early'; return 'late';
}
// one person's shifts for a week, with "miss": out at work through dinner and home after the cut-off (then they're asked about a plate)
function calShiftsFor(D, cpid, start) {
  const person = D.people.find(x => x.id === cpid); if (!person) return {};
  const st = person.settings || {}, types = { ...CAL_TYPES, ...(st.shiftTypes || {}) };
  const travel = Number(st.travelMins) || 30, dinner = toMins((D.household && D.household.dinnerTime) || '19:00'), cutoff = toMins(S.settings.lateCutoff || '20:30');
  const evs = []; D.feeds.filter(f => f.owner === cpid).forEach(f => (f.events || []).forEach(ev => evs.push(ev)));
  const out = {};
  for (let d = 0; d < 7; d++) {
    const key = addDays(start, d); let sh = null;
    const ov = D.shifts.find(x => x.person === cpid && x.day === key);
    if (ov) { const def = types[ov.type] || {}; sh = def.allDay || ov.type === 'off' || ov.type === 'leave' ? { t: ov.type, allDay: true } : { t: ov.type, s: ov.start || def.start, e: ov.end || def.end }; }
    else {
      const ev = evs.find(x => x.ad ? x.sd === key : isoDate(new Date(x.s)) === key);
      if (ev) { const t = calInfer(ev); sh = ev.ad ? (t ? { t, allDay: true } : null) : { t: t || 'other', s: hm(new Date(ev.s)), e: hm(new Date(ev.e)) }; }
    }
    if (!sh) continue;
    if (sh.allDay) { out[d] = { t: sh.t }; continue; }
    const s = toMins(sh.s), e = toMins(sh.e), home = (e <= s ? 1440 : 0) + e + travel, leave = s - travel;
    out[d] = { t: sh.t, s: sh.s, e: sh.e, miss: !(home <= cutoff || leave >= dinner + 60) };
  }
  return out;
}
async function calRefresh(force) {
  if (!S.cal.user || S.cal.busy || !S.household || !S.people.length) return;
  if (!force && Date.now() - S.cal.at < 10 * 60000) return;
  S.cal.busy = true; const hid0 = curHid;
  try {
    const thisW = mondayOf(TODAY), starts = [thisW, addDays(thisW, 7)];
    const months = [...new Set([thisW, addDays(thisW, 13)].map(x => x.slice(0, 7)))];
    const D = await Store.cal.read(months, thisW);
    // switched to another household meanwhile: its weeks don't get these shifts
    if (curHid !== hid0 || !S.cal.on) { S.cal.busy = false; return; }
    S.cal.data = D; S.cal.err = ''; S.cal.at = Date.now();
    for (const start of starts) {
      const want = {};
      S.people.forEach(p => { const cp = calPidFor(p); if (!cp) return; const m = calShiftsFor(D, cp, start); if (Object.keys(m).length) want[p.id] = m; });
      const have = (decWeek(await Store.get('weeks/' + start)) || {}).shifts || {};
      if (curHid !== hid0) break;
      const flat = {};
      new Set([...Object.keys(have), ...Object.keys(want)]).forEach(pid => { if (stable(have[pid]) !== stable(want[pid])) flat['shifts.' + pid] = want[pid] || Store.DEL; });
      if (Object.keys(flat).length && Store.patch) await Store.patch('weeks/' + start, flat);
    }
    calSoon(1500);
  } catch (e) { S.cal.err = e.message || String(e); console.warn(e); }
  S.cal.busy = false; schedule();
}
// Reminders go through Caledonite's notifications (it sends them within about 10 minutes of the time).
let calT = 0;
function calSoon(ms) { clearTimeout(calT); calT = setTimeout(() => { calReminders().catch(e => console.warn(e)); }, ms || 5000); }
function wantedReminders(w) {
  const R = { cook: true, defrost: true, plates: true, cookAt: '18:00', ...(S.settings.remind || {}) }, want = {}, past = {}, now = Date.now();
  const at = (d, t) => { const x = parseIso(addDays(w.start, d)); const [a, b] = t.split(':').map(Number); x.setHours(a, b, 0, 0); return x.getTime(); };
  // one whose time has come is left alone: Caledonite may not have sent it yet (it sends within about 10 minutes)
  const add = (key, p, title, body, when) => { const cp = calPidFor(p); if (!cp) return; const id = 'pk-' + w.start + '-' + calTag(curHid) + '-' + key + '-' + cp; if (when < now - 60000) { past[id] = true; return; } want[id] = { to: cp, kind: 'reminders', title, body, link: '../es-kitchen/', sendAfter: Math.max(when, now) }; };
  const eaters = S.people.filter(p => p.dinner !== false);
  const sim = simulate(w, ctx());
  for (let d = 0; d < 7; d++) {
    const day = w.days[d], r = day.r && !day.takeaway && S.RMAP[day.r];
    const inN = eaters.filter(p => !awayOn(w, p, d));
    if (r && R.cook) { const cook = cookOn(w, d, S.people); (cook ? [cook] : inN).forEach(p => add(d + '-cook', p, 'Dinner tonight: ' + rt(r), (cook ? 'You’re cooking. ' : '') + r.time + ' minutes.' + (eaters.some(q => { const sh = shiftOn(w, q, d); return sh && sh.miss && !awayOn(w, q, d); }) ? ' Save a plate for ' + eaters.filter(q => { const sh = shiftOn(w, q, d); return sh && sh.miss && !awayOn(w, q, d); }).map(q => q.name).join(' & ') + '.' : ''), at(d, R.cookAt))); }
    if (R.plates) eaters.forEach(p => { const sh = shiftOn(w, p, d); if (!sh || !sh.miss || ((w.plates || {})[p.id] || {})[d] || ((w.away || {})[p.id] || {})[d] || !r) return; add(d + '-plate', p, 'Save you a plate on ' + DAY_LONG[d] + '?', 'You’re working ' + shiftText(sh) + '. Open Peckish to say yes or no.', now); });
  }
  if (R.defrost) {
    const byDay = {};
    (sim.defrostNotes || []).forEach(n => { (byDay[n.d] = byDay[n.d] || []).push(n); });
    Object.keys(byDay).forEach(k => {
      const d = Number(k), what = byDay[d].map(n => n.meal ? 'the frozen ' + rt(S.RMAP[n.meal] || { title: 'meal' }) : leftText(n.i, n.q)).filter((x, i, a) => a.indexOf(x) === i).join(', ');
      const r = w.days[d] && S.RMAP[w.days[d].r]; const when = d === 0 ? at(0, '07:30') : at(d - 1, '20:00');
      const cook = cookOn(w, d, S.people); (cook ? [cook] : eaters.filter(p => !awayOn(w, p, d))).forEach(p => add(d + '-defrost', p, d === 0 ? 'Out of the freezer this morning' : 'Out of the freezer tonight', 'Take ' + what + ' out to thaw in the fridge for ' + (r ? rt(r) : 'dinner') + (d === 0 ? ' tonight.' : ' tomorrow.'), when));
    });
  }
  return { want, past, now };
}
async function calReminders() {
  if (!S.cal.user || !S.cal.data || !S.week || !Store.cal) return;
  const w = currentWeek(), thisW = mondayOf(TODAY);
  if (w.start !== thisW && w.start !== addDays(thisW, 7)) return;
  const { want, past, now } = wantedReminders(w), sent = LINK.get('calNotes', {}), wk = 'pk-' + w.start + '-', mine = wk + calTag(curHid) + '-';
  // Caledonite saying no (its rules don't let Peckish queue reminders) shows in Linked apps rather than failing quietly
  let refused = false, through = false;
  const no = e => { console.warn(e); if (e && e.code === 'permission-denied') refused = true; };
  // one that's due straight away ("save you a plate?") isn't queued again just because the time has moved on
  for (const id in want) { const hsh = stable({ ...want[id], sendAfter: want[id].sendAfter <= now ? 0 : want[id].sendAfter }); if (sent[id] === hsh) continue; try { await Store.cal.notify(id, want[id]); sent[id] = hsh; through = true; } catch (e) { no(e); } }
  for (const id in sent) {
    // an old-style id stands for this household's reminder with the same week, day and person
    const legacy = calLegacy(id) && id.startsWith(wk), as = legacy ? mine + id.slice(wk.length) : id;
    if (!(legacy || id.startsWith(mine)) || (want[as] && !legacy) || past[as]) continue;
    try { await Store.cal.unnotify(id); delete sent[id]; } catch (e) { no(e); if (!(e && e.code === 'permission-denied')) delete sent[id]; }
  }
  if (refused !== !!S.cal.refused && (refused || through)) { S.cal.refused = refused; schedule(); }
  // forget old weeks
  Object.keys(sent).forEach(id => { const st = id.slice(3, 13); if (st < addDays(thisW, -7)) delete sent[id]; });
  LINK.set('calNotes', sent);
}

// ---------- Budgie ----------
S.bg = { cfg: null, data: { since: 0, me: '', rows: {} }, busy: false, err: '', at: 0 };
function bgParseLink(text) {
  const m = String(text || '').match(/#connect=([A-Za-z0-9_\-=]+)/); if (!m) return null;
  try { const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/'); const j = JSON.parse(decodeURIComponent(escape(atob(b64 + '==='.slice((b64.length + 3) % 4))))); if (!j.u || !j.k) return null;
    // only ever a Google Apps Script web app over https, and only Peckish's own limited link, never Budgie's full key
    const url = new URL(j.u); if (url.protocol !== 'https:' || !/^script\.google(usercontent)?\.com$/.test(url.hostname) || !/^app_peckish_[0-9a-f]{64}$/.test(String(j.k))) return null;
    return { u: j.u, k: j.k }; } catch (e) { return null; }
}
async function bgCall(ops, full) {
  const c = S.bg.cfg; if (!c) throw new Error('Budgie isn’t linked.');
  const D = S.bg.data;
  const res = await fetch(c.u, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ key: c.k, since: full ? 0 : D.since, full: !!full || !D.since, ops: ops || [] }) });
  const j = await res.json();
  // an old link with Budgie's full key: forget it and ask for Peckish's own limited link instead
  if (j.keyType === 'full' || (!j.ok && /link for Peckish|not allowed with this link/i.test(j.error || ''))) { bgUnlink(); throw new Error('For safety, Budgie now gives Peckish its own link. In Budgie, go to Settings, then Linked apps, tap Link Peckish and paste the link here.'); }
  if (!j.ok) throw new Error(j.error || 'Budgie said no');
  if (j.full) D.rows = {};
  for (const t of ['people', 'budgets', 'transactions', 'splits', 'accounts']) (j.rows && j.rows[t] || []).forEach(r => { D.rows[t] = D.rows[t] || {}; D.rows[t][r.id] = r; });
  D.since = j.now; D.me = j.person; LINK.set('budgieData', D); S.bg.at = Date.now();
  return j;
}
function bgFoodBudgets() { return bgRows('budgets').filter(b => b.person === S.bg.data.me && /food|grocer/i.test(b.name || '')); }
function bgRows(t) { return Object.values((S.bg.data.rows || {})[t] || {}).filter(r => r && !r.deleted && r.deleted !== 'TRUE' && r.deleted !== true); }
function bgFoodBudget() {
  // Budgie only takes shops into one of your own food budgets
  const mine = bgFoodBudgets();
  return mine.find(b => b.id === S.settings.budgieBudget) || mine[0] || null;
}
// Peckish person ↔ Budgie person, by name
function bgPidFor(p) { const x = bgRows('people').find(q => (q.name || '').toLowerCase() === (p.name || '').toLowerCase()); return x ? x.id : (p.name || '').toLowerCase(); }
function peckFromBg(pid) { const x = bgRows('people').find(q => q.id === pid); const name = (x ? x.name : pid || '').toLowerCase(); return S.people.find(p => (p.name || '').toLowerCase() === name) || null; }
async function bgLink(cfg) {
  cfg = { ...cfg, hid: curHid }; S.bg.cfg = cfg; LINK.set('budgie', cfg); S.bg.data = { since: 0, me: '', rows: {} }; S.bg.err = ''; schedule();
  try { await bgCall([], true); toast('Budgie linked'); await bgSyncShops(); } catch (e) { S.bg.err = e.message || String(e); }
  schedule();
}
function bgUnlink() { S.bg.cfg = null; LINK.set('budgie', null); LINK.set('budgieData', null); S.bg.data = { since: 0, me: '', rows: {} }; schedule(); }
// Shops paid by whoever's phone this is go to Budgie as a food payment split half each; Budgie food payments come back as shops.
async function bgSyncShops() {
  if (!S.bg.cfg || S.bg.busy || !S.household) return;
  // wait for this household's shops before comparing them with Budgie's
  if (!S.shopsLog) { S.bg.wantSync = true; return; }
  S.bg.busy = true;
  const hid0 = curHid, here = () => { if (curHid !== hid0) throw new Error('Switched household'); };
  try {
    const me = S.bg.data.me, fb = bgFoodBudget(), ops = [], mePk = me ? peckFromBg(me) : null;
    if (me && fb) (S.shopsLog || []).forEach(t => {
      // the payer's phone sends it (matched by who paid, in case the phone that logged it didn't know their Budgie name)
      if (!t.budgie || (t.budgie.person !== me && !(mePk && t.paidBy === mePk.id))) return;
      // a shop taken off in Peckish comes off in Budgie too, then goes from here
      if (t.removed) { if (t.budgie.tid) ops.push({ op: 'delete', table: 'transactions', id: t.budgie.tid, shop: t.id }); return; }
      if (t.budgie.state !== 'queued' || !t.date) return;
      const tid = 't-pk-' + t.id;
      ops.push({ op: 'put', table: 'transactions', row: { id: tid, date: t.date, person: me, amount: Number(t.amount), budget: fb.id, account: fb.account || '', split: t.split === 'half' ? 'half' : '', note: (SHOP_KEY_NAMES[t.shop] || t.shop || 'Food') + ' shop (Peckish)', source: 'peckish' }, shop: t.id });
    });
    // at most 40 at a time; the rest go next time. Only what Budgie took is marked sent, or taken off here.
    const batch = ops.slice(0, 40), sent = await bgCall(batch.map(({ shop, ...o }) => o), false), refused = {};
    (sent.rejected || []).forEach(r => { refused[r.id] = r.error || 'Budgie didn’t take it'; });
    const done = batch.filter(o => o.op === 'put').map(o => [o.shop, o.row.id]);
    for (const [id, tid] of done) { here(); if ((S.shopsLog || []).some(t => t.id === id)) await Store.patch('shops/' + id, { budgie: refused[tid] ? { state: 'refused', why: String(refused[tid]).slice(0, 120), person: me } : { state: 'sent', tid, person: me } }); }
    for (const o of batch) if (o.op === 'delete' && !refused[o.id]) { here(); await Store.del('shops/' + o.shop); }
    // shops Peckish sent follow Budgie too: a new amount or date (fixed there, or matched to the bank) comes back here,
    // and one taken off there goes from here (told by the payer's phone, which sees all of its own)
    const ours = {}; (S.shopsLog || []).forEach(t => { if (t.source !== 'budgie' && !t.removed && t.budgie && t.budgie.state === 'sent' && t.budgie.tid) ours[t.budgie.tid] = t; });
    const oursSeen = new Set(done.map(x => x[1]));
    for (const tx of bgRows('transactions')) {
      const t = ours[tx.id]; if (!t) continue; oursSeen.add(tx.id);
      const amount = Math.round((Number(tx.amount) || 0) * 100) / 100, date = String(tx.date || '').slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(date) && (amount !== Number(t.amount) || date !== t.date)) here(), await Store.patch('shops/' + t.id, { amount, date, week: mondayOf(date) });
    }
    if (sent.full === true) for (const tid in ours) { const t = ours[tid]; if (!oursSeen.has(tid) && t.budgie.person === me && String(t.date || '') >= addDays(mondayOf(TODAY), -120)) here(), await Store.del('shops/' + t.id); }
    // food payments logged in Budgie (by either of you) show up here too, and follow it when they're changed or taken off there
    const known = new Set((S.shopsLog || []).map(t => t.budgie && t.budgie.tid).filter(Boolean));
    const imported = {}; (S.shopsLog || []).forEach(t => { if (t.source === 'budgie' && t.budgie && t.budgie.tid) imported[t.budgie.tid] = t; });
    const foodIds = new Set(bgRows('budgets').filter(b => /food|grocer/i.test(b.name)).map(b => b.id)); if (fb) foodIds.add(fb.id);
    const since = addDays(mondayOf(TODAY), -120), seen = new Set();
    for (const tx of bgRows('transactions')) {
      if (tx.source === 'peckish' || /^t-pk-/.test(String(tx.id)) || !(foodIds.has(tx.budget) || /food/i.test(tx.budget || ''))) continue;
      if (!tx.date || String(tx.date).slice(0, 10) < since) continue;
      const cur = imported[tx.id]; if (!cur && known.has(tx.id)) continue;
      seen.add(tx.id);
      const who = peckFromBg(tx.person), date = String(tx.date).slice(0, 10);
      const doc = { date, amount: Number(tx.amount) || 0, shop: guessShop(tx.note), note: tx.note || '', paidBy: who ? who.id : '', split: tx.split || '', week: mondayOf(date), source: 'budgie', budgie: { state: 'sent', tid: tx.id, person: tx.person }, by: 'Budgie' };
      // "via": the phone that brought it in, which is the one that can tell when it's gone (each of you sees a slightly different set)
      here();
      if (cur) { if (stable({ ...doc, via: cur.via || me }) !== stable({ ...doc, ...pickKeys(cur, Object.keys(doc)), via: cur.via })) await Store.set('shops/' + cur.id, { ...doc, via: cur.via || me }); }
      else await Store.set('shops/' + 'b_' + String(tx.id).replace(/[^A-Za-z0-9_]/g, '_'), { ...doc, via: me });
    }
    if (sent.full === true) for (const tid in imported) { const t = imported[tid]; if (!seen.has(tid) && t.via && t.via === me && String(t.date || '') >= since) here(), await Store.del('shops/' + t.id); }
    S.bg.err = '';
  } catch (e) { if (curHid !== hid0) { S.bg.busy = false; return; } S.bg.err = navigator.onLine === false ? 'Offline: it’ll sync when you’re back online' : (e.message || String(e)); console.warn(e); }
  S.bg.busy = false; schedule();
}
function pickKeys(o, keys) { const x = {}; keys.forEach(k => { if (o[k] !== undefined) x[k] = o[k]; }); return x; }
function guessShop(note) { const n = String(note || '').toLowerCase(); return (SHOPS.find(s => n.includes(s.id) || n.includes(s.name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 5))) || {}).id || ''; }
function liveShops() { return (S.shopsLog || []).filter(t => !t.removed); }
function shopsThisMonth() { const m = TODAY.slice(0, 7); return liveShops().filter(t => (t.date || '').startsWith(m)); }
// log what you paid for a shop (Shop tab). Saved in Peckish for both phones, and sent to Budgie by the payer's phone.
function logShop(amount, shop, paidBy, split, date) {
  const id = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), p = personById(paidBy);
  const doc = { date: date || TODAY, amount: Math.round(amount * 100) / 100, shop, paidBy, split: split ? 'half' : '', week: S.weekStart, source: 'peckish', by: myName(), budgie: { state: 'queued', person: p ? bgPidFor(p) : '' } };
  S.shopsLog = (S.shopsLog || []).concat({ id, ...doc });
  Store.set('shops/' + id, doc).then(() => bgSyncShops()).catch(e => { console.warn(e); toast('Couldn’t save that.'); });
  schedule();
}
function shopLogPanel(B) {
  const list = shopsThisMonth().sort((a, b) => a.date < b.date ? 1 : -1), total = list.reduce((a, t) => a + (Number(t.amount) || 0), 0), bud = Number(S.settings.monthlyBudget) || 450;
  const me = mePerson(), est = B ? B.prefTotal : 0;
  let out = '<section class="panel"><div class="row between"><h2>Shops this month</h2><span class="small money">' + fmtMoney(total) + ' of ' + fmtMoney(bud) + '</span></div><div class="meter"><i class="' + (total > bud ? 'over' : '') + '" style="width:' + Math.min(100, total / bud * 100).toFixed(0) + '%"></i></div>';
  out += list.length ? '<div class="leftlist">' + list.map(t => { const who = personById(t.paidBy); return '<div class="left"><span style="flex:1;min-width:0">' + h(niceDate(t.date)) + ' · ' + h(SHOP_KEY_NAMES[t.shop] || t.shop || 'Shop') + '<span class="small muted" style="display:block">' + (who ? h(who.name) + ' paid' : '') + (t.split === 'half' ? ' · half each, ' + fmtMoney(t.amount / 2) + ' each' : '') + (t.source === 'budgie' ? ' · from Budgie' : t.budgie && t.budgie.state === 'sent' ? ' · in Budgie' : t.budgie && t.budgie.state === 'refused' ? ' · Budgie didn’t take this one' : S.bg.cfg && t.budgie && t.budgie.state === 'queued' ? ' · goes to Budgie from ' + h(who ? who.name : '') + '’s phone' : '') +
    // a shop logged here can be taken off (a typo, a duplicate); one from Budgie is changed there
    (t.source === 'budgie' ? '' : S.confirm['rmshop:' + t.id] ? ' · Remove it? <button class="linkish small" style="color:var(--bad)" data-act="rm-shop-yes" data-v="' + h(t.id) + '">Yes</button> <button class="linkish small" data-act="rm-shop-no">No</button>' : ' · <button class="linkish small" data-act="rm-shop" data-v="' + h(t.id) + '">Remove</button>') + '</span></span><span class="money">' + fmtMoney(t.amount) + '</span></div>'; }).join('') + '</div>' : '<p class="muted small">Nothing logged this month yet.</p>';
  out += '<form class="stack" data-form="logshop" style="gap:8px"><span class="label">Done a shop? Log what you paid</span><div class="lsrow"><input class="input" id="ls-amt" type="number" step="0.01" min="0" inputmode="decimal" placeholder="' + (est ? est.toFixed(2) : '0.00') + '" aria-label="Amount paid in pounds"><select class="input" id="ls-shop" aria-label="Shop">' + SHOPS.map(s => '<option value="' + s.id + '"' + (s.id === weekShop() ? ' selected' : '') + '>' + h(s.name) + '</option>').join('') + '</select></div>' +
    (S.people.length > 1 ? '<div class="row wrap" style="gap:6px"><span class="small">Paid by</span>' + S.people.map(p => '<label class="chip"><input type="radio" name="ls-who" value="' + h(p.id) + '"' + ((me ? me.id === p.id : p === S.people[0]) ? ' checked' : '') + '> ' + h(p.name) + '</label>').join('') + '<label class="chip"><input type="checkbox" id="ls-split" checked> Half each</label></div>' : '') +
    '<button class="btn primary" type="submit">Log it</button>' + (S.bg.cfg ? '' : '<p class="muted small">Link Budgie in Settings → Linked apps and shops go there too, split half each.</p>') + '</form></section>';
  return out;
}

function bgElsewhere() { const b = LINK.get('budgie', null); return b && b.hid && b.hid !== curHid ? b.hid : null; }
function linkedSummary() { return [S.cal.user ? 'Caledonite' : '', S.bg.cfg ? 'Budgie' : ''].filter(Boolean).join(' · ') || 'Caledonite and Budgie'; }
function setLinked() {
  const D = S.cal.data, R = { cook: true, defrost: true, plates: true, cookAt: '18:00', ...(S.settings.remind || {}) };
  let out = '<p class="muted small">Your three apps share what they know, so nothing gets typed twice.</p>';
  // Caledonite
  out += '<section class="panel"><div class="row between"><h2>Caledonite</h2>' + (S.cal.user ? '<span class="tag good">Linked</span>' : '') + '</div>';
  if (!S.cal.user) {
    out += '<p class="small">Sophie’s shifts set who’s in for dinner and who cooks. On a long day she’s back for a late dinner and you cook; on a night, or a shift that runs past the cut-off, she’s asked whether to save her a plate. Shift days get a packed lunch, and reminders come through Caledonite’s notifications.</p>' +
      '<button class="btn primary" data-act="cal-link"' + (S.cal.on && S.cal.unsub && !S.cal.err ? ' disabled' : '') + '>Link with Google</button><p class="muted small">Use the Google account you use in Caledonite. This phone only; do it on both phones for reminders on each.</p>' + (S.cal.err ? '<p class="note warn small">' + h(S.cal.err) + '</p>' : '');
  } else {
    out += '<p class="small">Signed in as <b>' + h(S.cal.user.email) + '</b>' + (S.cal.at ? ' · checked ' + new Date(S.cal.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '') + (S.cal.busy ? ' · checking…' : '') + '</p>' + (S.cal.err ? '<p class="note warn small">' + h(S.cal.err) + '</p>' : '');
    if (D) out += '<div class="stack" style="gap:6px"><span class="label">Who’s who</span>' + S.people.map(p => '<label class="row between small"><span>' + h(p.name) + ' in Peckish is</span><select class="input" data-change="calmap" data-p="' + h(p.id) + '">' + '<option value="-">nobody in Caledonite</option>' + D.people.map(q => '<option value="' + h(q.id) + '"' + (calPidFor(p) === q.id ? ' selected' : '') + '>' + h(q.name || q.id) + '</option>').join('') + '</select></label>').join('') + '</div>';
    out += '<div class="stack" style="gap:6px"><span class="label">Late shifts: still in for dinner if home by</span><span class="seg full">' + ['20:00', '20:30', '21:00'].map(t => '<button class="' + ((S.settings.lateCutoff || '20:30') === t ? 'on' : '') + '" data-act="set-cutoff" data-v="' + t + '">' + t + '</button>').join('') + '</span></div>';
    const shifty = S.people.filter(p => calPidFor(p) && D && (D.people.find(q => q.id === calPidFor(p)) || {}).settings && D.people.find(q => q.id === calPidFor(p)).settings.hasShifts);
    if (shifty.length) out += '<div class="stack" style="gap:6px"><span class="label">Packed lunches</span>' + shifty.map(p => '<label class="row small" style="gap:8px"><input type="checkbox" data-change="lunch-shifts" data-p="' + h(p.id) + '"' + (p.lunchOnShifts ? ' checked' : '') + '> Plan ' + h(p.name) + '’s lunches on shift days only</label>').join('') + '</div>';
    out += '<div class="stack" style="gap:6px"><span class="label">Reminders on your phones</span>' +
      '<label class="row small" style="gap:8px"><input type="checkbox" data-change="remind" data-k="cook"' + (R.cook ? ' checked' : '') + '> Time to start dinner, to whoever’s cooking</label>' +
      (R.cook ? '<span class="seg full">' + ['17:30', '18:00', '18:30'].map(t => '<button class="' + (R.cookAt === t ? 'on' : '') + '" data-act="remind-at" data-v="' + t + '">' + t + '</button>').join('') + '</span>' : '') +
      '<label class="row small" style="gap:8px"><input type="checkbox" data-change="remind" data-k="defrost"' + (R.defrost ? ' checked' : '') + '> Take something out of the freezer (8pm the night before)</label>' +
      '<label class="row small" style="gap:8px"><input type="checkbox" data-change="remind" data-k="plates"' + (R.plates ? ' checked' : '') + '> Ask about saving a plate on late shifts</label>' +
      (S.cal.refused ? '<p class="note warn small">Caledonite isn\u2019t taking reminders from Peckish at the moment, so none are queued. It needs updating to accept them.</p>' : '<p class="muted small">They arrive as Caledonite notifications, so keep notifications on there. Tapping one opens Peckish.</p>') + '</div>';
    out += '<div class="row wrap"><button class="btn" data-act="cal-refresh">Check shifts now</button><button class="btn danger" data-act="cal-unlink">Unlink</button></div>';
  }
  out += '</section>';
  // Budgie: linked with its own limited link, made in Budgie (Settings, Linked apps), never Budgie's full one
  out += '<section class="panel"><div class="row between"><h2>Budgie</h2>' + (S.bg.cfg ? '<span class="tag good">Linked</span>' : '') + '</div>';
  if (!S.bg.cfg) {
    out += '<p class="small">Log a food shop here or in Budgie and it shows in both, split half each, so Budgie keeps track of who owes who.</p>' +
      '<p class="small muted">In Budgie, go to Settings, then Linked apps, and tap Link Peckish. Copy the link it makes and paste it here. It only lets Peckish add food shops and see your food budget.</p>' +
      (bgElsewhere() ? '<p class="note small">Budgie is linked in ' + h(((S.userDoc && S.userDoc.names) || {})[bgElsewhere()] || 'another of your households') + ' on this phone. Linking it here moves it.</p>' : '') +
      '<form class="stack" data-form="bg-link" style="gap:6px"><label class="small" for="bg-url">Your Peckish link from Budgie</label><input class="input" id="bg-url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://alertrobot.github.io/es-kitchen/#connect=…"><button class="btn" type="submit">Link</button></form>' + (S.bg.err ? '<p class="note warn small">' + h(S.bg.err) + '</p>' : '');
  } else {
    const me = bgRows('people').find(q => q.id === S.bg.data.me), mine = bgFoodBudgets(), fb = bgFoodBudget();
    out += '<p class="small">Linked as <b>' + h(me ? me.name : S.bg.data.me || '…') + '</b>' + (S.bg.at ? ' · synced ' + new Date(S.bg.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '') + (S.bg.busy ? ' · syncing…' : '') + '</p>' + (S.bg.err ? '<p class="note warn small">' + h(S.bg.err) + '</p>' : '');
    if (mine.length) out += '<label class="row between small"><span>Food shops go to</span><select class="input" data-change="bg-budget">' + mine.map(b => '<option value="' + h(b.id) + '"' + (fb && fb.id === b.id ? ' selected' : '') + '>' + h(b.name) + '</option>').join('') + '</select></label>';
    else if (!S.bg.busy) out += '<p class="note small">Budgie has no food budget for you yet. Add one called Food or Groceries in Budgie and shops go there.</p>';
    out += '<p class="muted small">Each phone sends the shops its owner paid for. A shop Sophie paid for goes to Budgie from her phone when she next opens Peckish.</p><div class="row wrap"><button class="btn" data-act="bg-sync">Sync now</button><button class="btn danger" data-act="bg-unlink">Unlink</button></div>';
  }
  out += '</section>';
  return out;
}

// ---------- look & feel (saved on this phone only) ----------
const PALETTES = [['', 'Garden', '#1D6A48', '#63C392'], ['ocean', 'Ocean', '#1F5FA8', '#6AA8F0'], ['berry', 'Berry', '#A8326E', '#F07AB4'], ['sunset', 'Sunset', '#B84E15', '#F59A5E'],
  ['lavender', 'Lavender', '#6A4FC4', '#A895F5'], ['sunshine', 'Sunshine', '#7D6000', '#F2C94C'], ['teal', 'Teal', '#0B6E69', '#4FD1C5'], ['rose', 'Rose', '#B3364A', '#F28B9C'],
  ['mocha', 'Mocha', '#7A4E2D', '#D9A77A'], ['slate', 'Slate', '#27272A', '#E4E4E7']];
// special themes: [key, name, blurb, background, accent, second colour, dark?]
const THEMES = [
  ['empyrean', 'Empyrean', 'Emerald dragon scales and old gold', '#07120D', '#3FD08E', '#DDBB63', true],
  ['dreamland', 'Dreamland', 'Storybook kingdom, purple ink on parchment', '#F3E6CB', '#6E2DA8', '#C98B12', false],
  ['starship', 'Starship', 'Bridge console, cyan on a dark grid', '#050A13', '#33E0F6', '#1A3350', true],
  ['neon', 'Neon City', 'Synthwave pink and cyan after dark', '#0C0617', '#FF3FA4', '#2DE2E6', true],
  ['mars', 'Red Planet', 'Dusty orange skies on a colony outpost', '#120806', '#FF7B3D', '#F2B35A', true],
  ['hearth', 'Hearth', 'Cosy autumn kitchen, pumpkin and moss', '#F6EBDD', '#B4441B', '#4F7A3A', false],
  ['frost', 'Frost', 'Snowy winter night by candlelight', '#0A1020', '#8CC8FF', '#F2C46D', true],
];
const isSpecial = k => THEMES.some(t => t[0] === k);
function getLook() { try { return JSON.parse(localStorage.getItem('esk-look') || '{}') || {}; } catch (e) { return {}; } }
function applyLook(L) {
  const r = document.documentElement;
  ['palette', 'theme', 'size'].forEach(k => { if (L[k]) r.dataset[k] = L[k]; else delete r.dataset[k]; });
  if (L.oled && !isSpecial(L.palette)) r.dataset.oled = '1'; else delete r.dataset.oled; // pure black dark mode
  try { localStorage.setItem('esk-look', JSON.stringify(L)); } catch (e) {}
  // match the phone's status bar to the app background
  requestAnimationFrame(() => { const bg = getComputedStyle(r).getPropertyValue('--bg').trim(); document.querySelectorAll('meta[name="theme-color"]').forEach(m => { m.setAttribute('content', bg); m.removeAttribute('media'); }); });
}
function lookName() { const L = getLook(); const t = THEMES.find(x => x[0] === L.palette); if (t) return t[1]; const p = PALETTES.find(x => x[0] === (L.palette || '')); return (p ? p[1] : 'Garden') + ' · ' + ({ light: 'light', dark: 'dark' }[L.theme] || 'matches phone'); }
function lookHtml() {
  const L = getLook(), special = isSpecial(L.palette);
  const dark = L.theme === 'dark' || (!L.theme && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  return '<p class="muted small">Just for this phone, so you and Sophie can each have your own.</p>' +
    '<section class="panel"><h2>Colours</h2><div class="swatches">' + PALETTES.map(([k, n, lc, dc]) => '<button class="swatch ' + (!special && (L.palette || '') === k ? 'on' : '') + '" data-act="look" data-k="palette" data-v="' + k + '" aria-pressed="' + (!special && (L.palette || '') === k) + '"><i style="background:' + (dark ? dc : lc) + '"></i>' + n + '</button>').join('') + '</div>' +
    '<div class="stack" style="gap:6px"><span class="label">Light or dark</span>' + (special ? '<span class="muted small">Special themes have their own look. Pick a colour above to use light or dark mode.</span>' :
      '<span class="seg full">' + [['', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(([k, n]) => '<button class="' + ((L.theme || '') === k ? 'on' : '') + '" data-act="look" data-k="theme" data-v="' + k + '">' + n + '</button>').join('') + '</span><span class="muted small">Auto follows your phone\u2019s setting.</span>' +
      (L.theme !== 'light' ? '<span class="label" style="margin-top:6px">Dark mode</span><span class="seg full">' + [['', 'Soft dark'], ['1', 'Pure black']].map(([k, n]) => '<button class="' + ((L.oled || '') === k ? 'on' : '') + '" data-act="look" data-k="oled" data-v="' + k + '">' + n + '</button>').join('') + '</span><span class="muted small">Pure black looks sharp and saves battery on Galaxy screens.</span>' : '')) + '</div></section>' +
    '<section class="panel"><h2>Special themes</h2><div class="themegrid">' + THEMES.map(([k, n, blurb, bg, a1, a2]) => '<button class="theme ' + (L.palette === k ? 'on' : '') + '" data-act="look" data-k="palette" data-v="' + k + '" aria-pressed="' + (L.palette === k) + '"><span class="tprev" style="background:' + bg + '"><i style="background:' + a1 + '"></i><i style="background:' + a2 + '"></i></span><span class="tname"><b>' + n + '</b><span>' + blurb + '</span></span></button>').join('') + '</div></section>' +
    '<section class="panel"><h2>Text size</h2><span class="seg full">' + [['', 'Normal'], ['large', 'Larger']].map(([k, n]) => '<button class="' + ((L.size || '') === k ? 'on' : '') + '" data-act="look" data-k="size" data-v="' + k + '">' + n + '</button>').join('') + '</span></section>';
}
applyLook(getLook());

// ---------- SETTINGS: a menu of short pages ----------
const niceDate = iso => { try { return parseIso(String(iso).slice(0, 10)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return iso; } };
const APP_VERSION = (((document.querySelector('script[src*="app.js"]') || {}).src || '').split('v=')[1] || 'dev');
const MI = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.2a5 5 0 0 1 5.5 5.8"/></svg>',
  sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>',
  pot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"/><path d="M2 10h20M9 6c0-1 .5-2 1.5-2M14 6c0-1 .5-2 1.5-2"/></svg>',
  tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/></svg>',
  palette: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a4 4 0 0 0 4-4c0-4.4-4-8-9-8z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10" cy="7" r="1.2"/><circle cx="15" cy="7.5" r="1.2"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.4 1.5A3.8 3.8 0 0 1 17.5 18z"/><path d="M12 11v5M9.5 13.5L12 11l2.5 2.5"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M11 18.5h2"/></svg>',
};
function hhSummary() { const hh = S.household; if (!hh) return ''; const n = Object.values(hh.memberNames || {}); return n.join(', ') + (hh.inviteCode ? ' · code ' + hh.inviteCode : ''); }
function eatSummary() { const w = []; S.people.forEach(p => (p.wontEat || []).forEach(t => w.push(t))); return S.people.map(p => p.name).join(', ') + (w.length ? ' · won’t eat ' + Array.from(new Set(w)).slice(0, 3).join(', ') : ''); }
function planSummary() { const st = S.settings; return ({ save: 'Save money', balanced: 'Balanced', variety: 'Mix it up' })[st.style || 'balanced'] + ' · ' + st.weeknightCap + ' min weeknights · ' + (SHOPS.find(x => x.id === st.shop) || SHOPS[0]).name + ' · ' + fmtMoney(Number(st.monthlyBudget) || 0) + '/month'; }
function eqSummary() { const eq = S.settings.equipment || {}; const have = EQUIPMENT.filter(([k]) => eq[k] !== false).map(x => x[1]); return have.length + ' of ' + EQUIPMENT.length + ': ' + have.slice(0, 4).join(', ') + (have.length > 4 ? '…' : ''); }
function treatSummary() { const t = (S.settings.treatDays || []).slice().sort(); return t.length ? t.map(d => DAY_NAMES[d]).join(', ') : 'None'; }
const SET_PAGES = [
  { k: 'household', g: 'Household', t: 'Household & invites', i: 'home', sum: hhSummary, show: () => !!S.household },
  { k: 'people', g: 'Household', t: 'Who’s eating', i: 'people', sum: eatSummary },
  { k: 'linked', g: 'Household', t: 'Linked apps', i: 'link', sum: linkedSummary },
  { k: 'planning', g: 'Planning', t: 'Planning & budget', i: 'sliders', sum: planSummary },
  { k: 'treats', g: 'Planning', t: 'Treat nights', i: 'star', sum: treatSummary },
  { k: 'equipment', g: 'Planning', t: 'Kitchen equipment', i: 'pot', sum: eqSummary },
  { k: 'prices', g: 'Food', t: 'Ingredients & prices', i: 'tag', sum: () => Object.keys(S.ING).length + ' ingredients' + (S.lib && S.lib.updated ? ' \u00b7 prices checked ' + niceDate(S.lib.updated) : '') },
  { k: 'history', g: 'Food', t: 'History & stats', i: 'chart', sum: histSummary },
  { k: 'look', g: 'This phone', t: 'Look & feel', i: 'palette', sum: lookName },
  { k: 'backup', g: 'This phone', t: 'Backup & restore', i: 'cloud', sum: backupSummary },
  { k: 'account', g: 'This phone', t: 'Offline & account', i: 'phone', sum: () => (S.online ? 'Online' : 'Offline') + ' · ' + (S.user ? (S.user.email || S.user.name || '') : '') + ' · v' + APP_VERSION },
];
// ---------- history & stats: every week you've planned, what you cooked and spent ----------
function histSummary() { const n = S.histAll ? S.histAll.filter(x => weekHasDinners(x.w)).length : 0; return n ? n + ' weeks planned' : 'What you’ve cooked and spent'; }
function loadHistory(force) {
  if (S.histLoading || (S.histAll && !force) || !Store.list) return;
  S.histLoading = true;
  Store.list('weeks').then(rows => { S.histAll = rows.map(x => ({ start: x.id, w: normWeek(decWeek(clone(x.data)), x.id) })).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x.start)).sort((a, b) => b.start < a.start ? -1 : 1); S.histLoading = false; S.histCost = {}; schedule(); })
    .catch(e => { console.warn(e); S.histLoading = false; S.histAll = []; schedule(); });
}
function weekCost(x) { S.histCost = S.histCost || {}; if (S.histCost[x.start] == null) { try { S.histCost[x.start] = simulate(x.w, { ...ctx(), settings: S.settings }).buy.prefTotal; } catch (e) { S.histCost[x.start] = 0; } } return S.histCost[x.start]; }
function setHistory() {
  loadHistory();
  if (!S.histAll) return '<p class="muted"><span class="spinner sm" aria-hidden="true"></span> Loading your weeks…</p>';
  const weeks = S.histAll.filter(x => weekHasDinners(x.w));
  if (!weeks.length) return '<p class="muted">Nothing planned yet. Your weeks show up here once you’ve planned some dinners.</p>';
  const past = weeks.filter(x => x.start <= TODAY);
  const count = {}, cuis = {}; let cooked = 0, takeaways = 0, kc = 0, kn = 0;
  past.forEach(x => x.w.days.forEach((d, k) => { if (addDays(x.start, k) > TODAY) return; if (d.takeaway) { takeaways++; return; } const r = d.r && S.RMAP[d.r]; if (!r) return; cooked++; count[r.id] = (count[r.id] || 0) + 1; cuis[r.cuisine] = (cuis[r.cuisine] || 0) + 1; const n = nut(r); if (n.kcal) { kc += n.kcal; kn++; } }));
  // money by month: logged shops (from Budgie or this app) and what the plans cost
  const months = {}; const mk = iso => String(iso || '').slice(0, 7);
  weeks.forEach(x => { const m = mk(x.start); months[m] = months[m] || { plan: 0, paid: 0 }; months[m].plan += weekCost(x); });
  liveShops().forEach(t => { const m = mk(t.date); months[m] = months[m] || { plan: 0, paid: 0 }; months[m].paid += Number(t.amount) || 0; });
  const mkeys = Object.keys(months).sort().slice(-6), mmax = Math.max(1, ...mkeys.map(m => Math.max(months[m].plan, months[m].paid)));
  const monthName = m => parseIso(m + '-01').toLocaleDateString('en-GB', { month: 'short' });
  const budget = Number(S.settings.monthlyBudget) || 450;
  let out = '<section class="panel"><h2>So far</h2><div class="grid2">' +
    '<div><div class="label">Dinners cooked</div><div class="big-num num">' + cooked + '</div><div class="muted small">' + takeaways + ' takeaway' + (takeaways === 1 ? '' : 's') + ' · ' + past.length + ' week' + (past.length === 1 ? '' : 's') + '</div></div>' +
    '<div><div class="label">Average dinner</div><div class="big-num num">' + (kn ? Math.round(kc / kn).toLocaleString('en-GB') : '–') + '</div><div class="muted small">kcal a portion</div></div></div></section>';
  out += '<section class="panel"><div class="row between"><h2>Spending by month</h2><span class="muted small">Budget ' + fmtMoney(budget) + '</span></div><div class="mbars">' + mkeys.map(m => {
    const M = months[m];
    return '<div class="mbar"><span class="mb-track"><i class="plan" style="height:' + (M.plan / mmax * 100).toFixed(0) + '%"></i><i class="paid' + (M.paid > budget ? ' over' : '') + '" style="height:' + (M.paid / mmax * 100).toFixed(0) + '%"></i></span><span class="small">' + monthName(m) + '</span><span class="small money">' + fmtMoney(M.paid || M.plan) + '</span></div>';
  }).join('') + '</div><p class="muted small"><span class="key plan"></span> what the plans cost &nbsp; <span class="key paid"></span> what you logged paying' + (S.bg.cfg ? ' (with Budgie)' : '') + '</p></section>';
  const top = Object.keys(count).sort((a, b) => count[b] - count[a]).slice(0, 5);
  if (top.length) out += '<section class="panel"><h2>Most cooked</h2>' + top.map(id => '<div class="row between ruled-sm"><button class="linkish" data-act="peek" data-v="' + h(id) + '">' + h(rt(S.RMAP[id])) + '</button><span class="muted small">' + count[id] + '×</span></div>').join('') + '</section>';
  const rs = ratingSummary(), fav = Object.keys(rs).filter(id => S.RMAP[id] && rs[id].avg >= 4).sort((a, b) => rs[b].avg - rs[a].avg).slice(0, 5);
  if (fav.length) out += '<section class="panel"><h2>Your favourites</h2>' + fav.map(id => '<div class="row between ruled-sm"><button class="linkish" data-act="peek" data-v="' + h(id) + '">' + h(rt(S.RMAP[id])) + '</button><span class="small">' + rs[id].avg.toFixed(1) + '★</span></div>').join('') + '</section>';
  const ck = Object.keys(cuis).sort((a, b) => cuis[b] - cuis[a]);
  if (ck.length) out += '<section class="panel"><h2>What you eat</h2><div class="stack" style="gap:6px">' + ck.map(c => '<div class="cuisbar"><span class="small">' + h(c) + '</span><span class="bar"><i style="width:' + (cuis[c] / cooked * 100).toFixed(0) + '%"></i></span><span class="small muted">' + Math.round(cuis[c] / cooked * 100) + '%</span></div>').join('') + '</div></section>';
  out += '<section class="panel"><h2>Every week</h2>' + weeks.slice(0, 26).map(x => {
    const n = x.w.days.filter(d => d.r && !d.takeaway).length, paid = liveShops().filter(t => t.week === x.start).reduce((a, t) => a + (Number(t.amount) || 0), 0);
    return '<button class="mrow1 histrow" data-act="go-week" data-v="' + x.start + '"><span class="grow"><b>' + weekRange(x.start) + '</b><span class="small muted" style="display:block">' + n + ' dinner' + (n === 1 ? '' : 's') + (x.w.locked ? ' · locked in' : '') + '</span></span><span class="small money">' + (paid ? fmtMoney(paid) + ' paid' : fmtMoney(weekCost(x)) + ' planned') + '</span></button>';
  }).join('') + '</section>';
  return out;
}
function renderSettings() {
  const pg = S.setPage && SET_PAGES.find(p => p.k === S.setPage);
  if (!pg) return settingsMenu();
  const body = { household: setHousehold, people: setPeople, planning: setPlanning, treats: setTreats, equipment: setEquipment, prices: setPrices, history: setHistory, linked: setLinked, look: lookHtml, backup: setBackup, account: setAccount }[pg.k]();
  return '<div class="top pagehead"><button class="icon-btn" data-act="set-page" data-v="" aria-label="Back to Settings">' + ICON.left + '</button><h1>' + h(pg.t) + '</h1><span></span></div>' + body;
}
function settingsMenu() {
  let out = '<div class="top"><h1>Settings</h1></div><div class="menu">';
  if (Store.kind === 'artifact' && S.household) out += '<p class="note small">This is the claude.ai preview: everyone who can open this page shares one plan. Sign-in, invite codes and offline use come with the installed app.</p>';
  let g = '';
  for (const p of SET_PAGES) {
    if (p.show && !p.show()) continue;
    if (p.g !== g) { if (g) out += '</div>'; g = p.g; out += '<span class="label">' + h(g) + '</span><div class="mgroup">'; }
    out += '<button class="mrow" data-act="set-page" data-v="' + p.k + '"><span class="mi" aria-hidden="true">' + MI[p.i] + '</span><span class="mt"><b>' + h(p.t) + '</b><span>' + h(p.sum() || '') + '</span></span>' + ICON.right + '</button>';
  }
  return out + '</div></div>';
}
function setHousehold() {
  const hh = S.household; if (!hh) return '<p class="muted">No household.</p>';
  const members = Object.entries(hh.memberNames || {}).map(([, n]) => n);
  return '<section class="panel"><h2>' + h(hh.name) + '</h2><p class="muted small">Everyone in this household shares the same plan, list and pantry, live.</p>' +
    '<div class="pchips">' + members.map(n => '<span class="chip static">' + h(n) + '</span>').join('') + '</div></section>' +
    '<section class="panel"><div class="invite"><div><div class="label">Invite code</div><div class="code">' + h(hh.inviteCode || '') + '</div></div><div class="row wrap"><button class="btn" data-act="copy-code">Copy</button><a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent('Join our meal plan on Peckish: open ' + location.origin + location.pathname + ' , sign in, and enter the code ' + (hh.inviteCode || '')) + '">WhatsApp</a></div></div>' +
    '<p class="muted small">Send this to Sophie to join this household. For family, ask them to start their own household instead, so their plan stays separate.</p></section>' +
    '<section class="panel"><h2>Manage</h2><form class="row" data-form="hh-rename"><input class="input grow" id="hh-name" value="' + h(hh.name) + '" aria-label="Household name"><button class="btn" type="submit">Rename</button></form>' +
    '<button class="btn" data-act="new-code">Make a new invite code</button><button class="btn" data-act="hh-other">Switch, join or start another household</button>' +
    (S.confirm.leave ? '<button class="btn danger" data-act="leave-yes">Yes, leave ' + h(hh.name) + '</button>' : '<button class="btn danger" data-act="leave">Leave this household</button>') + '</section>';
}
function setPeople() {
  if (!S.setPerson || !S.people.find(p => p.id === S.setPerson)) S.setPerson = (S.people.find(p => p.uid === myUid()) || S.people[0] || {}).id || '';
  const p = S.people.find(x => x.id === S.setPerson);
  const names0 = S.people.map(x => String(x.name || '').trim().toLowerCase()); const dupes0 = names0.filter((n, i) => names0.indexOf(n) !== i);
  let out = '<span class="seg full" role="tablist">' + S.people.map(x => '<button role="tab" class="' + (x.id === S.setPerson ? 'on' : '') + '" data-act="set-person" data-v="' + h(x.id) + '" aria-selected="' + (x.id === S.setPerson) + '">' + h(x.name) + (dupes0.includes(String(x.name || '').trim().toLowerCase()) ? (x.uid ? ' \u00b7 account' : ' \u00b7 added') : '') + '</button>').join('') + '</span>';
  const dupes = S.people.filter((x, i, a) => a.findIndex(y => String(y.name || '').trim().toLowerCase() === String(x.name || '').trim().toLowerCase()) !== i);
  if (dupes.length) out += '<p class="note warn small">' + dupes.map(x => h(x.name)).join(', ') + ' ' + (dupes.length > 1 ? 'are' : 'is') + ' here twice, so dinners are being planned for an extra person. Open the one without the settings you want and remove it.</p>';
  out += '<p class="muted small">Recipes with something on a “won’t eat” list are hidden, unless the card has a simple swap (like leaving it off one plate). Dislikes push a recipe down the list; likes push it up.</p>';
  if (p) {
    out += '<section class="panel">';
    for (const [key, label] of [['wontEat', 'Won’t eat'], ['dislikes', 'Dislikes'], ['likes', 'Likes']]) {
      out += '<div class="stack" style="gap:6px"><span class="label">' + label + '</span><div class="pchips">' + (p[key] || []).map((t, k) => '<span class="chip">' + h(t) + '<button data-act="pref-del" data-v="' + h(p.id) + '" data-k="' + key + '" data-i="' + k + '" aria-label="Remove ' + h(t) + '">' + ICON.close + '</button></span>').join('') + '</div>' +
        '<form class="row" data-form="pref-add" data-v="' + h(p.id) + '" data-k="' + key + '"><input class="input grow" id="pa-' + h(p.id) + '-' + key + '" placeholder="' + (key === 'wontEat' ? 'e.g. mushrooms, prawns' : key === 'likes' ? 'e.g. Thai, halloumi, spicy' : 'e.g. peppers, coriander') + '" aria-label="Add to ' + label + ' for ' + h(p.name) + '"><button class="btn" type="submit">Add</button></form></div>';
    }
    out += '</section><section class="panel">' + personPlanHtml(p) + '</section>';
    out += '<div class="row">' + (S.confirm['rmp:' + p.id] ? '<button class="btn danger" data-act="rm-person-yes" data-v="' + h(p.id) + '">Yes, remove ' + h(p.name) + '</button>' : '<button class="linkish small" data-act="rm-person" data-v="' + h(p.id) + '">Remove ' + h(p.name) + ' from the plan</button>') + '</div>';
  }
  out += '<form class="row" data-form="add-person"><input class="input grow" id="np-name" placeholder="Add someone else who eats with you" aria-label="Name"><button class="btn" type="submit">Add</button></form>';
  return out;
}
function setEquipment() {
  const st = S.settings;
  return '<p class="muted small">Recipes that need something you don’t have are left out of suggestions. With an air fryer, recipes show the air-fryer method too.</p><div class="eqgrid">' +
    EQUIPMENT.map(([k, n]) => '<button class="eq ' + (st.equipment[k] !== false ? 'on' : '') + '" data-act="eq" data-v="' + k + '" aria-pressed="' + (st.equipment[k] !== false) + '">' + (st.equipment[k] !== false ? ICON.tick : '') + '<span>' + n + '</span></button>').join('') + '</div>';
}
function setTreats() {
  const st = S.settings;
  return '<p class="muted small">On these nights the planner picks a treat: burgers, fried chicken, pizza, curry-house favourites. Other nights stay everyday. Treat nights can take up to an hour.</p><div class="chips wrapchips">' +
    DAY_NAMES.map((n, d) => '<button class="chip ' + ((st.treatDays || []).includes(d) ? 'on' : '') + '" data-act="treat-day" data-v="' + d + '" aria-pressed="' + (st.treatDays || []).includes(d) + '">' + n + '</button>').join('') + '</div>';
}
function setPlanning() {
  const st = S.settings;
  return '<section class="panel"><h2>How to plan</h2>' +
    '<div class="stack" style="gap:6px"><span class="label">Planning style</span><span class="seg full">' + [['save', 'Save money'], ['balanced', 'Balanced'], ['variety', 'Mix it up']].map(([k, n]) => '<button class="' + ((st.style || 'balanced') === k ? 'on' : '') + '" data-act="set-style" data-v="' + k + '">' + n + '</button>').join('') + '</span>' +
    '<span class="muted small">' + ({ save: 'Cheapest weeks, using every pack. Expect more repeats.', balanced: 'Uses packs up, but rotates cuisines and avoids repeats from recent weeks.', variety: 'Something different most nights. Costs a bit more.' })[st.style || 'balanced'] + '</span></div>' +
    '<div class="stack" style="gap:6px"><span class="label">Weeknight cooking time (Mon–Fri)</span><span class="seg full">' + [20, 30, 45, 60].map(v => '<button class="' + (Number(st.weeknightCap) === v ? 'on' : '') + '" data-act="set-cap" data-v="' + h(v) + '">' + v + ' min</button>').join('') + '</span></div>' +
    '<label class="row"><input type="checkbox" id="set-skipopt" class="cb" data-change="set-skipopt" ' + (st.skipOptional ? 'checked' : '') + '> Leave out optional extras (garnishes) when they’d mean buying a pack</label></section>' +
    '<section class="panel"><h2>Shop &amp; budget</h2>' +
    '<label class="field"><span>Your usual shop (sets the list prices)</span><select class="input" id="set-shop" data-change="set-shop">' + SHOPS.map(s => '<option value="' + s.id + '" ' + (st.shop === s.id ? 'selected' : '') + '>' + s.name + '</option>').join('') + '</select></label>' +
    '<label class="row"><input type="checkbox" id="set-loy" class="cb" data-change="set-loy" ' + (st.useLoyalty !== false ? 'checked' : '') + '> Use Clubcard / Nectar / Lidl Plus prices where there’s an offer</label>' +
    '<div class="grid2"><label class="field"><span>Monthly food budget (£)</span><input class="input" type="number" min="0" step="10" id="set-budget" data-change="set-budget" value="' + h(st.monthlyBudget) + '"></label>' +
    '<label class="field"><span>Cupboard top-ups a week (£)</span><input class="input" type="number" min="0" step="1" id="set-staple-budget" data-change="set-staple-budget" value="' + h(st.stapleBudget == null ? 8 : st.stapleBudget) + '"></label></div>' +
    '<p class="muted small">That’s about ' + fmtMoney(weeklyBudget()) + ' a week. When you’re low on staples, the planner favours meals that use what you’ve got, so restocking is spread over a few weeks.</p></section>';
}
const PRICE_PAGE = 40;
function setPrices() {
  if (!S.lib) return '<p class="muted">The recipe library hasn’t loaded yet.</p>';
  const q = (S.priceQ || '').toLowerCase(), aisle = S.priceAisle || '';
  const stale = ing => SHOPS.some(s => ing.prices && ing.prices[s.id] && ageDays(ing.prices[s.id].checked, TODAY) > STALE_DAYS);
  const all = Object.values(S.ING);
  const aisles = AISLE_ORDER.filter(a => all.some(i => (i.aisle || 'Other') === a));
  const list = all.filter(i => (!q || i.name.toLowerCase().includes(q)) && (!aisle || (aisle === '_old' ? stale(i) : aisle === '_staple' ? i.staple : (i.aisle || 'Other') === aisle))).sort((a, b) => a.name.localeCompare(b.name));
  const shown = list.slice(0, S.priceMore || PRICE_PAGE);
  let out = '<p class="muted small">Prices were looked up from public supermarket pages and comparison sites' + (S.lib.updated ? ' (checked ' + h(niceDate(S.lib.updated)) + ')' : '') + '. Edit any price and it’s marked as checked today, for your household only.</p>';
  out += '<div class="toolbar"><input class="search" type="search" id="pq" placeholder="Find an ingredient" value="' + h(S.priceQ) + '" data-input="pq" aria-label="Find an ingredient"><button class="btn soft" data-act="ing-new" aria-label="Add an ingredient">' + ICON.plus + '</button></div>';
  out += '<div class="jump" role="group" aria-label="Show">' + [['', 'All'], ['_staple', 'Staples'], ['_old', 'Old prices']].concat(aisles.map(a => [a, a])).map(([k, n]) => '<button class="chip ' + (aisle === k ? 'on' : '') + '" data-act="price-aisle" data-v="' + h(k) + '" aria-pressed="' + (aisle === k) + '">' + h(n) + '</button>').join('') + '</div>';
  if (S.ingNew) out += '<section class="panel"><div class="row between"><h2>Add an ingredient</h2><button class="icon-btn" data-act="ing-new" aria-label="Close">' + ICON.close + '</button></div>' + ingForm() + '</section>';
  out += '<p class="muted small">' + list.length + ' ingredient' + (list.length === 1 ? '' : 's') + '</p><div class="mgroup" style="padding:0 12px">';
  for (const ing of shown) {
    const p = shopPrice(ing, S.settings.shop, false), rec = p && p.rec;
    const open = S.expanded['p:' + ing.id];
    out += '<button class="prow" data-act="expand" data-v="p:' + h(ing.id) + '" aria-expanded="' + !!open + '"><span style="min-width:0"><b>' + h(ing.name) + '</b>' + (ing.staple ? ' <span class="tag">staple</span>' : '') + '<br><span class="muted small">' + (ing.packs || []).map(x => packLabel(ing, x)).join(' / ') + ' · keeps ' + ing.keeps + ' day' + (ing.keeps === 1 ? '' : 's') + ' once opened' + (ing.freeze ? ' · freezes' : '') + '</span></span>' +
      '<span class="right"><span class="money">' + (rec ? fmtMoney(rec.price) : '–') + '</span><br>' + (stale(ing) ? '<span class="tag warn">old</span>' : rec && rec.est ? '<span class="tag">est.</span>' : '') + '</span></button>';
    if (open) out += priceEditor(ing);
  }
  out += '</div>';
  if (!list.length) out += '<p class="muted">Nothing matches. <button class="linkish" data-act="ing-new">Add it as a new ingredient</button></p>';
  if (list.length > shown.length) out += '<button class="btn block" data-act="price-more">Show more (' + (list.length - shown.length) + ' left)</button>';
  return out;
}
function setAccount() {
  return '<section class="panel"><h2>Works offline</h2><p class="small">Once you’ve opened it with signal, the app, recipes, this week and next week, the list and the pantry all work offline. Changes you make offline sync when you’re back online. Nothing here depends on Claude: the app runs on your phone and keeps its data in your own Firebase database.</p>' +
    '<p class="small">To install it: in Chrome on Android tap ⋮ → Install app (or Add to Home screen). On iPhone, Share → Add to Home Screen.</p>' +
    '<dl class="kv"><dt>Connection</dt><dd>' + (S.online ? 'online' : 'offline') + '</dd><dt>App version</dt><dd>' + h(APP_VERSION) + '</dd><dt>Recipes on this phone</dt><dd>' + (S.lib ? S.recipes.length : 'not loaded') + '</dd></dl></section>' +
    (Store.kind === 'artifact' ? '' : '<section class="panel"><h2>Account</h2><p class="small">Signed in as <b>' + h(S.user ? (S.user.email || S.user.name) : '') + '</b></p><div class="row wrap"><button class="btn" data-act="sign-out">Sign out</button></div>' +
      '<details><summary class="small">Something stuck?</summary><div class="stack" style="padding-top:8px"><p class="small muted">Resetting clears only the copy kept on this phone and reloads. Your plans are safe online, but anything changed offline and not yet synced would be lost.</p><button class="btn" data-act="reset-local">Reset this phone’s saved copy</button></div></details></section>');
}
// where each shop's price came from, in plain words
const BASIS = { shop: 'the shop\u2019s website', compare: 'a price-comparison site', app: 'the shop on a delivery app', crowd: 'shoppers\u2019 receipts and shelf photos', news: 'a dated article or leaflet', match: 'Tesco\u2019s Aldi Price Match', model: 'worked out from a matched price at another shop', receipt: 'your receipt' };
const CONFW = { high: 'sure', medium: 'fairly sure', low: 'a rough guide' };
function priceSources(ing) {
  const rows = SHOPS.map(s => { const p = ing.prices && ing.prices[s.id]; if (!p || !p.price) return (ing.unlisted && ing.unlisted[s.id]) ? '<li><b>' + s.name + ':</b> no price found anywhere</li>' : ''; const basis = /receipt/i.test(p.src || '') ? 'receipt' : /in app/i.test(p.src || '') ? null : (p.basis || (/trolley\.co\.uk/.test(p.src || '') ? 'compare' : 'shop'));
    if (!basis) return '<li><b>' + s.name + ':</b> entered by you</li>';
    let host = ''; try { host = /^https?:/.test(p.src) ? new URL(p.src).hostname.replace(/^www\./, '') : ''; } catch (e) {}
    return '<li><b>' + s.name + ':</b> ' + h(p.label || '') + (p.label ? ', ' : '') + 'from ' + BASIS[basis] + (host && basis !== 'shop' ? ' (' + h(host) + ')' : '') + (p.seen && p.seen !== p.checked ? ', seen ' + niceDate(p.seen) : '') + (p.conf && p.conf !== 'high' ? ' \u00b7 ' + CONFW[p.conf] : '') + '</li>'; }).join('');
  return rows ? '<ul class="small muted srclist">' + rows + '</ul>' : '';
}
function priceEditor(ing) {
  let out = '<form class="stack" data-form="prices" data-v="' + h(ing.id) + '" style="padding:10px 0 14px"><div class="scrollx"><table class="pricetable"><thead><tr><th>Shop</th><th>Pack (' + h(ing.unit) + ')</th><th>Price £</th><th>Offer £</th><th>Checked</th></tr></thead><tbody>';
  for (const s of SHOPS) {
    const p = (ing.prices && ing.prices[s.id]) || {}; const age = ageDays(p.checked, TODAY);
    out += '<tr><td><b>' + s.name + '</b></td>' +
      '<td><input type="number" step="any" min="0" id="pe-' + h(ing.id) + '-' + s.id + '-pack" value="' + (p.pack != null ? p.pack : '') + '" aria-label="' + s.name + ' pack size"></td>' +
      '<td><input type="number" step="0.01" min="0" id="pe-' + h(ing.id) + '-' + s.id + '-price" value="' + (p.price != null ? p.price : '') + '" aria-label="' + s.name + ' price"></td>' +
      '<td>' + (s.loyalty ? '<input type="number" step="0.01" min="0" id="pe-' + h(ing.id) + '-' + s.id + '-loy" value="' + (p.loyalty != null ? p.loyalty : '') + '" placeholder="' + s.loyalty + '" aria-label="' + s.name + ' ' + s.loyalty + ' price">' : '<span class="muted">–</span>') + '</td>' +
      '<td class="small">' + (p.checked ? '<span class="' + (age > STALE_DAYS ? 'tag warn' : '') + '">' + parseIso(p.checked).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + '</span>' + (p.est ? ' <span class="tag">est.</span>' : '') : '<span class="muted">–</span>') + '</td></tr>';
  }
  out += '</tbody></table></div>' + priceSources(ing) + '<div class="row wrap"><button class="btn primary" type="submit">Save prices</button><button class="btn" type="button" data-act="toggle-staple" data-v="' + h(ing.id) + '">' + (ing.staple ? 'Not a staple' : 'Make it a staple') + '</button></div></form>';
  return out;
}
function ingForm() {
  return '<form class="stack" data-form="ing-add" style="padding-top:10px"><label class="field"><span>Name</span><input class="input" id="ni-name" required placeholder="e.g. Butter beans (tin)"></label>' +
    '<div class="grid2"><label class="field"><span>Aisle</span><select class="input" id="ni-aisle">' + AISLE_ORDER.map(a => '<option>' + a + '</option>').join('') + '</select></label>' +
    '<label class="field"><span>Measured in</span><select class="input" id="ni-unit">' + UNITS.map(u => '<option>' + u + '</option>').join('') + '</select></label></div>' +
    '<div class="grid2"><label class="field"><span>Pack sizes (comma separated)</span><input class="input" id="ni-packs" placeholder="400" inputmode="decimal"></label><label class="field"><span>Price at your shop £</span><input class="input" id="ni-price" type="number" step="0.01" min="0"></label></div>' +
    '<div class="grid2"><label class="field"><span>Keeps once opened (days)</span><input class="input" id="ni-keeps" type="number" min="0" value="3"></label><label class="field"><span>Lasts unopened (days)</span><input class="input" id="ni-life" type="number" min="0" value="7"></label></div>' +
    '<div class="grid2"><label class="field"><span>kcal per 100' + ' (g/ml) or per item</span><input class="input" id="ni-kcal" type="number" min="0"></label><label class="field"><span>Protein (g) same basis</span><input class="input" id="ni-protein" type="number" min="0" step="0.1"></label></div>' +
    '<label class="row"><input type="checkbox" id="ni-freeze" class="cb"> Freezes well</label><label class="row"><input type="checkbox" id="ni-staple" class="cb"> Pantry staple</label>' +
    '<button class="btn primary" type="submit">Add ingredient</button></form>';
}

function personPlanHtml(p) {
  const plan = p.plan || {}, days = p.days || {};
  const dayChips = slot => '<div class="chips wrapchips">' + DAY_NAMES.map((n, d) => { const on = (days[slot] || (slot === 'l' ? [0, 1, 2, 3, 4] : [0, 1, 2, 3, 4, 5, 6])).includes(d); return '<button class="chip ' + (on ? 'on' : '') + '" data-act="p-day" data-v="' + h(p.id) + '" data-s="' + slot + '" data-n="' + d + '" aria-pressed="' + on + '">' + n + '</button>'; }).join('') + '</div>';
  const usual = slot => { const u = (p.usual && p.usual[slot]) || []; return '<span class="muted small">Usual: ' + (u.length ? u.map(id => id === 'lo' ? 'leftovers' : h((S.RMAP[id] || {}).title || id)).join(' + ') : 'none yet. Pick one on the Week tab and tap \u201cMake this my usual\u201d.') + '</span>'; };
  return '<div class="stack" style="gap:8px"><span class="label">Portions &amp; daily plan</span>' +
    '<div class="row wrap between"><span class="small">Dinner portion</span><span class="seg">' + [[0.5, '½'], [0.75, '¾'], [1, 'Normal'], [1.25, '1¼'], [1.5, '1½']].map(([v, n]) => '<button class="' + (portionOf(p) === v ? 'on' : '') + '" data-act="p-portion" data-v="' + h(p.id) + '" data-n="' + v + '">' + n + '</button>').join('') + '</span></div>' +
    '<label class="row small"><input type="checkbox" class="cb" data-change="p-dinner" data-v="' + h(p.id) + '" ' + (p.dinner === false ? '' : 'checked') + '> Eats the planned dinners</label>' +
    '<div class="grid2"><label class="field"><span>Daily calories <span class="muted">(optional)</span></span><input class="input" type="number" min="0" step="50" id="pk-' + h(p.id) + '" data-change="p-kcal" data-v="' + h(p.id) + '" value="' + (p.kcalTarget || '') + '"></label><label class="field"><span>Protein, g <span class="muted">(optional)</span></span><input class="input" type="number" min="0" step="5" id="pp-' + h(p.id) + '" data-change="p-protein" data-v="' + h(p.id) + '" value="' + (p.proteinTarget || '') + '"></label></div>' +
    '<label class="row"><input type="checkbox" class="cb" data-change="p-plan" data-s="b" data-v="' + h(p.id) + '" ' + (plan.b ? 'checked' : '') + '> Plan breakfasts</label>' + (plan.b ? dayChips('b') + usual('b') : '') +
    '<label class="row"><input type="checkbox" class="cb" data-change="p-plan" data-s="l" data-v="' + h(p.id) + '" ' + (plan.l ? 'checked' : '') + '> Plan lunches</label>' + (plan.l ? dayChips('l') + '<label class="row small"><input type="checkbox" class="cb" data-change="p-packed" data-v="' + h(p.id) + '" ' + (p.packed ? 'checked' : '') + '> Packed lunches to take to work (favours ones that travel)</label>' + usual('l') : '') +
    '</div>';
}

// ---------- BACKUP: a Google Sheet laid out as tables, plus a file you keep ----------
// The sheet is a copy, never the live data: the app keeps working from Firebase and from the copy on each phone.
// Each household's rows are replaced on every backup; the "Docs" tab holds the raw records so a restore is exact.
const CHUNK = 45000; // a Google Sheets cell holds up to 50,000 characters
let backupBusy = false, autoTried = false;
const libVersion = () => (S.lib ? (S.lib.updated || '') + '/' + (S.lib.recipes || []).length : '');
function backupSummary() {
  const b = S.backup;
  if (!b || !b.url) return 'Not connected · you can still save a backup file';
  if (b.lastOk === false && b.lastTry && (!b.last || b.lastTry > b.last)) return 'Last try failed · ' + fmtWhen(b.lastTry);
  return b.last ? 'Backed up ' + fmtWhen(b.last) : 'Connected · not backed up yet';
}
async function collectDocs() {
  const out = [];
  for (const c of ['people', 'weeks', 'recipes', 'ingredients', 'ratings', 'shops', 'config']) {
    const ds = await Store.list(c);
    ds.forEach(d => { if (c === 'config' && d.id === 'backup') return; out.push({ path: c + '/' + d.id, data: d.data }); });
  }
  return out;
}
// a long record is split over several cells, never in the middle of an emoji, and no cell starts with a character
// Sheets treats specially (= + - @ or an apostrophe), so the pieces join back exactly
function chunks(s) {
  const out = []; let i = 0;
  while (i < s.length) { let j = Math.min(s.length, i + CHUNK); while (j < s.length && j > i + 1 && /[\udc00-\udfff=+\-@']/.test(s[j])) j--; out.push(s.slice(i, j)); i = j; }
  return out.length ? out : [''];
}
function cellText(x) { if (x == null) return ''; const s = typeof x === 'object' ? JSON.stringify(x) : String(x); return s.length > CHUNK ? s.slice(0, CHUNK) + '…' : s; }
function recipeLines(r) { return (r.ingredients || []).map(l => { const ing = S.ING[l.i]; return (l.t ? l.t + ' ' : (l.q != null ? fmtQty(l.q, ing ? ing.unit : '') + ' ' : '')) + (ing ? ing.name : l.i) + (l.opt ? ' (optional)' : ''); }).join('\n'); }
function recipeMethod(r) { return (r.steps || []).map((s, k) => (k + 1) + '. ' + (typeof s === 'string' ? s : (s.title ? s.title + ': ' : '') + s.text)).join('\n'); }
function buildTables(docs, withLib) {
  const hh = S.household, hid = hh.id, now = new Date().toISOString(), T = {};
  const t = (name, cols) => (T[name] = T[name] || { cols, rows: [] });
  const rname = id => (S.RMAP[id] ? rt(S.RMAP[id]) : id || '');
  const yes = v => (v ? 'yes' : '');
  const byPath = {}; docs.forEach(d => { byPath[d.path] = d.data; });
  const coll = c => docs.filter(d => d.path.startsWith(c + '/')).map(d => ({ id: d.path.slice(c.length + 1), data: d.data }));
  t('Households', ['household_id', 'name', 'invite_code', 'members', 'member_ids', 'created', 'backed_up_at', 'backed_up_by'])
    .rows.push([hid, hh.name || '', hh.inviteCode || '', Object.values(hh.memberNames || {}).join(', '), (hh.members || []).join(', '), hh.created || '', now, myName()]);
  const A = t('Accounts', ['household_id', 'user_id', 'name', 'email', 'households']);
  (hh.members || []).forEach(uid => { const me = uid === myUid(); A.rows.push([hid, uid, (hh.memberNames || {})[uid] || '', (hh.memberEmails || {})[uid] || (me && S.user ? S.user.email || '' : ''), me && S.userDoc ? (S.userDoc.households || []).map(x => ((S.userDoc.names || {})[x] || x)).join(', ') : '']); });
  const P = t('People', ['household_id', 'person_id', 'name', 'wont_eat', 'dislikes', 'likes', 'dinner_portion', 'eats_dinners', 'daily_kcal', 'daily_protein_g', 'plans_breakfast', 'plans_lunch', 'packed_lunch', 'usual_breakfast', 'usual_lunch']);
  coll('people').forEach(({ id, data: p }) => P.rows.push([hid, id, p.name || '', (p.wontEat || []).join(', '), (p.dislikes || []).join(', '), (p.likes || []).join(', '), p.portion || 1, p.dinner === false ? 'no' : 'yes', p.kcalTarget || '', p.proteinTarget || '', yes(p.plan && p.plan.b), yes(p.plan && p.plan.l), yes(p.packed),
    ((p.usual && p.usual.b) || []).map(x => x === 'lo' ? 'leftovers' : rname(x)).join(' + '), ((p.usual && p.usual.l) || []).map(x => x === 'lo' ? 'leftovers' : rname(x)).join(' + ')]));
  const W = t('Weeks', ['household_id', 'week_start', 'day', 'date', 'dinner_id', 'dinner', 'takeaway', 'from_freezer', 'extra_portions', 'extra_for', 'locked_by', 'last_changed_by', 'last_changed']);
  const BL = t('BreakfastLunch', ['household_id', 'week_start', 'person', 'day', 'meal', 'items']);
  const SH = t('Shopping', ['household_id', 'week_start', 'aisle', 'item', 'packs', 'price', 'shop', 'ticked']);
  const thisW = mondayOf(TODAY), C = ctx();
  coll('weeks').sort((a, b) => a.id.localeCompare(b.id)).forEach(({ id, data }) => {
    const w = normWeek(clone(data), id);
    w.days.forEach((d, k) => W.rows.push([hid, id, DAY_LONG[k], addDays(id, k), d.r || '', d.takeaway ? 'Takeaway' : rname(d.r), yes(d.takeaway), yes(d.freezer), d.extra || '', d.extra ? (d.extraUse === 'freeze' ? 'freezer' : 'lunch') : '', w.locked ? w.locked.by || 'yes' : '', w.updatedBy || '', w.updated || '']));
    S.people.forEach(p => { for (const slot of ['b', 'l']) { if (!(p.plan && p.plan[slot])) continue; for (let d = 0; d < 7; d++) { const items = blItems(w, p, slot, d); if (items.length) BL.rows.push([hid, id, p.name, DAY_LONG[d], SLOT_NAME[slot], items.map(x => x === 'lo' ? 'leftovers' : rname(x)).join(' + ')]); } } });
    if (id === thisW || id === addDays(thisW, 7)) {
      try {
        const sim = simulate(w, C), list = weekList(w, sim, C), shop = prefShopName();
        for (const a of list.aisles) for (const row of list.groups[a]) { const ing = S.ING[row.i]; const counts = {}; row.packs.forEach(x => counts[x] = (counts[x] || 0) + 1);
          SH.rows.push([hid, id, a, ing ? ing.name : row.i, Object.keys(counts).map(x => counts[x] + ' x ' + packLabel(ing, Number(x))).join(' + '), Number(row.byShop[list.basket.prefKey].cost.toFixed(2)), shop, yes(w.checked[row.i])]); }
        (w.extras || []).forEach(x => SH.rows.push([hid, id, 'Extras', x.name, '', '', '', yes(x.done)]));
      } catch (e) { console.warn('shopping table', e); }
    }
  });
  const pan = byPath['config/pantry'] || {}; const PA = t('Pantry', ['household_id', 'ingredient_id', 'ingredient', 'status', 'always_buy']);
  Object.values(S.ING).filter(i => i.staple || (pan.status || {})[i.id]).sort((a, b) => a.name.localeCompare(b.name)).forEach(i => PA.rows.push([hid, i.id, i.name, (pan.status || {})[i.id] || 'have', yes((pan.always || { milk: true })[i.id])]));
  const ST = t('Settings', ['household_id', 'setting', 'value']);
  const st = byPath['config/settings'] || {}; Object.keys(st).sort().forEach(k => ST.rows.push([hid, k, cellText(st[k])]));
  const RA = t('Ratings', ['household_id', 'recipe_id', 'recipe', 'person', 'stars']);
  coll('ratings').forEach(({ id, data }) => Object.keys(data).forEach(uid => RA.rows.push([hid, id, rname(id), (hh.memberNames || {})[uid] || uid, typeof data[uid] === 'object' ? data[uid].n || data[uid].stars || cellText(data[uid]) : data[uid]])));
  const MR = t('MyRecipes', ['household_id', 'recipe_id', 'name', 'meal', 'cuisine', 'protein', 'minutes', 'ingredients', 'method', 'json']);
  coll('recipes').forEach(({ id, data: r }) => MR.rows.push([hid, id, r.title || '', r.meal || 'dinner', r.cuisine || '', r.protein || '', r.time || '', recipeLines(r), recipeMethod(r), cellText(r)]));
  const SL = t('Shops', ['household_id', 'shop_id', 'date', 'shop', 'amount', 'paid_by', 'split', 'week_start', 'from', 'budgie', 'note']);
  coll('shops').filter(x => !x.data.removed).sort((a, b) => String(a.data.date || '').localeCompare(String(b.data.date || ''))).forEach(({ id, data: x }) => SL.rows.push([hid, id, x.date || '', SHOP_KEY_NAMES[x.shop] || x.shop || '', Number(x.amount) || 0, (S.people.find(p => p.id === x.paidBy) || {}).name || x.paidBy || '', x.split === 'half' ? 'half each' : '', x.week || '', x.source || '', (x.budgie && x.budgie.state) || '', x.note || '']));
  const PO = t('PriceOverrides', ['household_id', 'ingredient_id', 'ingredient', 'json']);
  coll('ingredients').forEach(({ id, data }) => PO.rows.push([hid, id, data.name || ingName(id), cellText(data)]));
  const D = t('Docs', ['household_id', 'path', 'part', 'parts', 'json', 'backed_up_at']);
  docs.forEach(d => { const parts = chunks(JSON.stringify(d.data)); parts.forEach((x, k) => D.rows.push([hid, d.path, k + 1, parts.length, x, now])); });
  if (withLib && S.lib) {
    const R = t('Recipes', ['household_id', 'recipe_id', 'name', 'full_title', 'meal', 'cuisine', 'protein', 'category', 'minutes', 'kcal', 'protein_g', 'cost_per_portion', 'ingredients', 'method', 'based_on', 'photo', 'json']);
    (S.lib.recipes || []).forEach(r0 => { const r = S.RMAP[r0.id] || r0; let n = { kcal: '', protein: '' }, cost = ''; try { n = nut(r); cost = Number(recipeCost(r).toFixed(2)); } catch (e) {}
      const src = r0.source || {}; R.rows.push(['library', r0.id, rt(r0), r0.title || '', r0.meal || 'dinner', r0.cuisine || '', r0.protein || '', r0.category || 'everyday', r0.time || '', n.kcal, n.protein, cost, recipeLines(r0), recipeMethod(r0), [src.title, src.site, src.author].filter(Boolean).join(' — '), (r0.photo && r0.photo.credit) || '', cellText(r0)]); });
    const I = t('Ingredients', ['household_id', 'ingredient_id', 'name', 'aisle', 'unit', 'packs', 'keeps_days_opened', 'lasts_days', 'freezes', 'tesco', 'sainsburys', 'asda', 'aldi', 'lidl', 'prices_checked']);
    (S.lib.ingredients || []).forEach(i => { const pr = s => { const p = i.prices && i.prices[s]; return p && p.price != null ? p.price + ' / ' + packLabel(i, p.pack) : ''; };
      const ds = SHOPS.map(s => i.prices && i.prices[s.id] && i.prices[s.id].checked).filter(Boolean).sort();
      I.rows.push(['library', i.id, i.name, i.aisle || '', i.unit || '', (i.packs || []).join(', '), i.keeps || '', i.life || '', yes(i.freeze), pr('tesco'), pr('sainsburys'), pr('asda'), pr('aldi'), pr('lidl'), ds[ds.length - 1] || '']); });
  }
  return T;
}
async function postScript(url, body) {
  let res;
  try { res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' }); }
  catch (e) { throw new Error('Couldn’t reach the backup sheet. Check you have signal.'); }
  const txt = await res.text(); let j;
  try { j = JSON.parse(txt); } catch (e) { throw new Error('The backup script didn’t answer properly. Check the web address ends in /exec and the script is deployed to “Anyone”.'); }
  if (!j.ok) throw new Error(j.error || 'The backup script said no.');
  return j;
}
async function runBackup(manual) {
  const b = S.backup; if (!b || !b.url || backupBusy || !S.household) return;
  if (!S.online) { if (manual) toast('You’re offline. Back up when you have signal.'); return; }
  backupBusy = true; S.backupBusy = true; schedule();
  const t0 = Date.now();
  try {
    const docs = await collectDocs();
    const withLib = manual || b.libVersion !== libVersion();
    const tables = buildTables(docs, withLib);
    const r = await postScript(b.url, { key: b.key, action: 'backup', hid: S.household.id, household: S.household.name || '', by: myName(), at: new Date().toISOString(), tables });
    const counts = {}; for (const k in tables) counts[k] = tables[k].rows.length;
    await Store.merge('config/backup', { last: new Date().toISOString(), lastBy: myName(), lastOk: true, lastErr: '', counts, libVersion: withLib ? libVersion() : (b.libVersion || ''), ms: Date.now() - t0, sheetUrl: r.sheetUrl || b.sheetUrl || '' });
    if (manual) toast('Backed up to Google Sheets');
  } catch (e) {
    await Store.merge('config/backup', { lastTry: new Date().toISOString(), lastOk: false, lastErr: String((e && e.message) || e).slice(0, 240) }).catch(() => {});
    if (manual) toast('Backup didn’t work: ' + ((e && e.message) || e));
  }
  backupBusy = false; S.backupBusy = false; schedule();
}
// once a day, quietly, from whichever phone opens the app first
function maybeAutoBackup() {
  const b = S.backup; if (!b || !b.url || b.auto === false || autoTried) return;
  if (!S.online || !S.loaded.recipes || !S.loaded.ing || !S.lib || !S.household || !Store.list) return;
  const age = b.last ? Date.now() - Date.parse(b.last) : Infinity, tryAge = b.lastTry ? Date.now() - Date.parse(b.lastTry) : Infinity;
  if (age < 20 * 3600e3 || tryAge < 3600e3) return;
  autoTried = true; setTimeout(() => runBackup(false), 5000);
}
function backupFile(docs) {
  const hh = S.household || {};
  return { app: 'Peckish', kind: 'backup', format: 1, exported: new Date().toISOString(), by: myName(), appVersion: APP_VERSION,
    household: { id: hh.id, name: hh.name, inviteCode: hh.inviteCode, memberNames: hh.memberNames || {}, memberEmails: hh.memberEmails || {} }, docs };
}
async function saveBackupFile(share) {
  try {
    const data = backupFile(await collectDocs());
    const name = 'peckish-backup-' + TODAY + '.json';
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    if (share && navigator.canShare) { const f = new File([blob], name, { type: 'application/json' }); if (navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: 'Peckish backup' }); return; } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    toast('Saved ' + name + ' to your Downloads');
  } catch (e) { if (!(e && e.name === 'AbortError')) toast('Couldn’t make the file: ' + ((e && e.message) || e)); }
}
function stageRestore(obj, source) {
  const docs = (obj && Array.isArray(obj.docs) ? obj.docs : []).filter(d => d && typeof d.path === 'string' && d.data && typeof d.data === 'object' && /^(people|weeks|recipes|ingredients|ratings|shops|config)\/[A-Za-z0-9_-]{1,120}$/.test(d.path) && d.path !== 'config/backup');
  if (!docs.length) { toast('That doesn’t look like a Peckish backup.'); return; }
  S.pendingRestore = { docs, at: obj.exported || obj.at || '', by: obj.by || '', source, from: (obj.household && obj.household.name) || '' };
  S.tab = 'settings'; S.setPage = 'backup'; render(); window.scrollTo(0, 0);
}
async function applyRestore() {
  const pr = S.pendingRestore; if (!pr) return;
  S.restoring = true; render();
  let n = 0;
  try { for (const d of pr.docs) { await Store.set(d.path, d.data); n++; } toast('Restored ' + n + ' records'); }
  catch (e) { toast('Restore stopped after ' + n + ' records: ' + ((e && e.message) || e)); }
  S.pendingRestore = null; S.restoring = false; render();
}
async function restoreFromSheet() {
  const b = S.backup; if (!b || !b.url) return;
  try { S.restoring = true; render(); const r = await postScript(b.url, { key: b.key, action: 'restore', hid: S.household.id }); S.restoring = false; stageRestore({ docs: r.docs, exported: r.at, by: r.by, household: { name: S.household.name } }, 'the Google Sheet'); }
  catch (e) { S.restoring = false; render(); toast((e && e.message) || String(e)); }
}
async function connectBackup(url, key) {
  url = String(url || '').trim(); key = String(key || '').trim();
  if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)) { toast('The web address should start https://script.google.com and end /exec'); return; }
  S.backupBusy = true; render();
  try { const r = await postScript(url, { key, action: 'ping' }); await Store.merge('config/backup', { url, key, auto: true, sheetUrl: r.sheetUrl || '', connectedBy: myName(), connected: new Date().toISOString() }); S.backupDraft = null; toast('Connected to ' + (r.sheetName || 'the backup sheet')); autoTried = false; setTimeout(() => runBackup(true), 300); }
  catch (e) { toast((e && e.message) || String(e)); }
  S.backupBusy = false; render();
}
function setBackup() {
  const b = S.backup || {}, on = !!b.url, pr = S.pendingRestore;
  let out = '';
  if (pr) out += '<section class="panel" style="border-color:var(--warn)"><h2>Restore this backup?</h2><p class="small">From ' + h(pr.source) + (pr.at ? ', saved ' + h(fmtWhen(pr.at)) : '') + (pr.by ? ' by ' + h(pr.by) : '') + (pr.from ? ' (' + h(pr.from) + ')' : '') + '. It has ' + pr.docs.length + ' records: ' +
    ['people', 'weeks', 'recipes', 'ratings', 'shops'].map(c => { const n = pr.docs.filter(d => d.path.startsWith(c + '/')).length; return n ? n + ' ' + ({ people: 'people', weeks: 'weeks', recipes: 'own recipes', ratings: 'ratings', shops: 'logged shops' })[c] : ''; }).filter(Boolean).join(', ') + '.</p>' +
    '<p class="small muted">Anything in the backup replaces what’s in the app now (for both of you). Anything added since the backup stays.</p><div class="row wrap"><button class="btn primary" data-act="restore-yes" ' + (S.restoring ? 'disabled' : '') + '>' + (S.restoring ? '<span class="spinner sm" aria-hidden="true"></span> Restoring…' : 'Restore') + '</button><button class="btn" data-act="restore-no">Cancel</button></div></section>';
  const failed = b.lastOk === false && b.lastTry && (!b.last || b.lastTry > b.last);
  out += '<section class="panel"><h2>Google Sheets</h2>';
  if (on) {
    out += '<div class="backupstat"><span class="dot ' + (failed ? 'bad' : b.last ? 'good' : 'warn') + '" aria-hidden="true"></span><span class="small">' + (b.last ? 'Last backup <b>' + h(fmtWhen(b.last)) + '</b>' + (b.lastBy ? ' from ' + h(b.lastBy) + '’s phone' : '') : 'Connected, not backed up yet') + (failed ? '<br><span style="color:var(--bad)">Last try ' + h(fmtWhen(b.lastTry)) + ' failed: ' + h(b.lastErr || '') + '</span>' : '') + '</span></div>' +
      '<div class="row wrap"><button class="btn primary grow" data-act="backup-now" ' + (S.backupBusy || !S.online ? 'disabled' : '') + '>' + (S.backupBusy ? '<span class="spinner sm" aria-hidden="true"></span> Backing up…' : 'Back up now') + '</button>' + (/^https:\/\/docs\.google\.com\//.test(b.sheetUrl || '') ? '<a class="btn grow" href="' + h(b.sheetUrl) + '" target="_blank" rel="noopener">Open the sheet</a>' : '') + '</div>' +
      '<label class="row"><input type="checkbox" class="cb" data-change="backup-auto" ' + (b.auto !== false ? 'checked' : '') + '> Back up automatically once a day, and when a week is locked in</label>';
    if (b.counts) out += '<p class="muted small">Last backup: ' + ['Weeks', 'People', 'Recipes', 'MyRecipes', 'Ingredients', 'Docs'].filter(k => num(b.counts[k], null) != null).map(k => num(b.counts[k], 0) + ' ' + ({ Weeks: 'week-day rows', People: 'people', Recipes: 'library recipes', MyRecipes: 'own recipes', Ingredients: 'ingredients', Docs: 'raw records' })[k]).join(', ') + '.</p>';
  } else out += '<p class="small">Copies every household, account, person, week, shopping list, pantry, rating, recipe and price into a Google Sheet, one tab per table. It runs from your phones, so it carries on even if you never open Claude again.</p>';
  const d = S.backupDraft || { url: b.url || '', key: b.key || '' };
  out += '<details class="fold"' + (on ? '' : ' open') + '><summary>' + (on ? 'Connection' : 'Connect a backup sheet') + '</summary><div class="in"><form class="stack" data-form="backup-connect">' +
    '<label class="field"><span>Backup script web address</span><input class="input" id="bk-url" inputmode="url" autocomplete="off" placeholder="https://script.google.com/macros/s/…/exec" value="' + h(d.url) + '"></label>' +
    '<label class="field"><span>Backup key</span><input class="input" id="bk-key" autocomplete="off" value="' + h(d.key) + '"></label>' +
    '<div class="row wrap"><button class="btn" type="submit" ' + (S.backupBusy ? 'disabled' : '') + '>' + (on ? 'Reconnect' : 'Connect') + '</button>' + (on ? (S.confirm.bkoff ? '<button class="btn danger" type="button" data-act="backup-off-yes">Yes, disconnect</button>' : '<button class="btn" type="button" data-act="backup-off">Disconnect</button>') : '') + '</div>' +
    '<p class="muted small">The sheet and its script live in the Google account that set them up. The key stops anyone else writing to it. Both phones share this connection.</p></form></div></details></section>';
  out += '<section class="panel"><h2>A file you keep</h2><p class="small">Saves everything to one file on this phone (or Google Drive, WhatsApp, email). Works without the sheet, and can be restored on any phone.</p>' +
    '<div class="row wrap"><button class="btn grow" data-act="backup-file">Save a backup file</button>' + (navigator.canShare ? '<button class="btn grow" data-act="backup-share">Share…</button>' : '') + '</div></section>';
  out += '<section class="panel"><h2>Restore</h2><div class="row wrap">' + (on ? '<button class="btn grow" data-act="restore-sheet" ' + (S.restoring || !S.online ? 'disabled' : '') + '>From the Google Sheet</button>' : '') +
    '<label class="btn grow" for="restore-file">From a file<input type="file" id="restore-file" accept="application/json,.json" data-change="restore-file" hidden></label></div><p class="muted small">You’ll see what’s in it before anything changes.</p></section>';
  out += '<details class="fold"><summary>Why the app keeps working without Claude</summary><div class="in small"><p>Claude built the app, but doesn’t run it. The app is a website on GitHub Pages, the data is in your own Firebase project, and each phone keeps a full copy for offline use. The Google Sheet is a third copy, and the file a fourth.</p><p>If GitHub Pages or Firebase ever went away, the sheet and the file still have every recipe, plan and price in plain tables.</p></div></details>';
  return out;
}
// "#backup=..." links (from the backup sheet's setup) fill in the connection
function readConnectLink() {
  const m = /[#&]backup=([A-Za-z0-9_\-=]+)/.exec(location.hash || ''); if (!m) return;
  try { const j = JSON.parse(atob(m[1].replace(/-/g, '+').replace(/_/g, '/'))); if (j.u) { S.backupDraft = { url: j.u, key: j.k || '' }; S.tab = 'settings'; S.setPage = 'backup'; } } catch (e) {}
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
}
readConnectLink();

// ---------- SHEETS ----------
function pushSheet(s) { S.sheets.push(s); renderSheet(true); }
function popSheet() { S.sheets.pop(); renderSheet(true); }
function closeSheets() { S.sheets = []; renderSheet(true); }
function renderSheet(force, keep) {
  histSoon();
  const el = $('#sheet'); const top = S.sheets[S.sheets.length - 1];
  if (!top) { el.hidden = true; el.innerHTML = ''; document.body.style.overflow = ''; return; }
  if (!force && (top.type === 'form' || typingIn(el))) return;
  const scroll = force && !keep ? 0 : el.scrollTop;
  let title = '', body = '';
  if (top.type === 'pick') { title = DAY_LONG[top.d] + '’s dinner'; body = sheetPick(top); }
  else if (top.type === 'recipe') { const r = S.RMAP[top.id]; title = r ? r.title : 'Recipe'; body = r ? sheetRecipe(r, top) : '<p>Recipe not found.</p>'; }
  else if (top.type === 'form') { title = top.id ? 'Edit recipe' : 'Add a recipe'; body = sheetForm(top); }
  else if (top.type === 'votes') { title = 'Thumbs up or down'; body = sheetVotes(top); }
  else if (top.type === 'whosin') { title = 'Who\u2019s in each night'; body = sheetWhosIn(top); }
  else if (top.type === 'rescue') { title = isTonight(top.d) ? 'Takeaway tonight' : 'Takeaway on ' + DAY_LONG[top.d]; body = sheetRescue(top); }
  else if (top.type === 'blpick') { const p = personById(top.pid); title = (p ? p.name + '\u2019s ' : '') + SLOT_NAME[top.slot].toLowerCase() + ' · ' + DAY_NAMES[top.d]; body = sheetBlPick(top); }
  el.innerHTML = '<div class="shead"><div class="in"><button class="icon-btn" data-act="sheet-back" aria-label="' + (S.sheets.length > 1 ? 'Back' : 'Close') + '">' + (S.sheets.length > 1 ? ICON.left : ICON.close) + '</button><h2 class="grow ellip">' + h(title) + '</h2></div></div><div class="sbody">' + body + '</div>';
  el.hidden = false; document.body.style.overflow = 'hidden'; el.scrollTop = scroll;
}
function sheetPick(top) {
  const w = currentWeek(), C = ctx(), d = top.d;
  // suggestions take a moment to work out: keep them while nothing they depend on has changed (typing in the search, a sync)
  const key = stable([w, d, !!top.anyTime]) + '|' + cacheVer + '|' + stable(S.people) + '|' + stable(S.settings) + '|' + stable(S.pantry);
  if (!top.memo || top.memo.key !== key) { const b0 = simulate(w, C); top.memo = { key, base: b0, sugg: suggest(w, d, C, { base: b0, ignoreTime: !!top.anyTime }) }; }
  const base = top.memo.base, sugg = top.memo.sugg;
  const spare = {};
  base.carryOut.forEach(L => { if (S.ING[L.i] && !S.ING[L.i].staple) spare[L.i] = (spare[L.i] || 0) + L.q; });
  Object.keys(base.waste).forEach(id => spare[id] = (spare[id] || 0) + base.waste[id]);
  const spareIds = Object.keys(spare).sort((a, b) => spare[b] * unitPrice(S.ING[b], S.settings.shop, true) - spare[a] * unitPrice(S.ING[a], S.settings.shop, true));
  const isTreat = (S.settings.treatDays || []).includes(d);
  let out = '';
  if (isTreat) out += '<div class="note treatnote">★ <b>' + DAY_LONG[d] + ' is a treat night</b>, so treats come first.</div>';
  if (spareIds.length) out += '<div class="note"><b>You’ll have spare:</b> ' + spareIds.slice(0, 6).map(id => h(leftText(id, spare[id]))).join(', ') + (spareIds.length > 6 ? ' and more' : '') + '. The top picks use these up.</div>';
  const fm = (w.freezerMeals || []).filter(m => m.portions >= 1);
  if (fm.length) out += '<section class="stack"><h3>From the freezer</h3>' + fm.map(m => { const r = S.RMAP[m.r]; return r ? '<div class="sugg"><span class="tile ' + cuisineClass(r.cuisine) + '">' + h(r.icon) + '</span><button class="pick" data-act="choose-freezer" data-v="' + h(r.id) + '"><b>' + h(r.title) + '</b><span class="why">' + (Number(m.portions) || 0) + ' portion' + (m.portions > 1 ? 's' : '') + ' frozen · nothing to buy</span></button><span></span></div>' : ''; }).join('') + '</section>';
  // rows that each show something different, without repeating a recipe or (within a row) a cuisine
  const used = new Set();
  const row = (title, list, n) => {
    const picked = [], cu = new Set(), bs = new Set();
    for (const x of list) {
      const b = baseOf(x.r); if (used.has(x.r.id) || cu.has(x.r.cuisine) || x.clash || bs.has(b)) continue;
      picked.push(x); cu.add(x.r.cuisine); bs.add(b); if (picked.length >= n) break;
    }
    picked.forEach(x => used.add(x.r.id));
    return picked.length ? '<section class="stack"><h3>' + title + '</h3>' + picked.map((x, k) => suggHtml(x, false)).join('') + '</section>' : '';
  };
  const weekCuisines = new Set(w.days.filter((x, k) => k !== d && x.r && S.RMAP[x.r]).map(x => S.RMAP[x.r].cuisine));
  const byMoney = sugg.slice().sort((a, b) => b.money - a.money);
  const different = sugg.filter(x => !weekCuisines.has(x.r.cuisine));
  const treats = sugg.filter(x => x.r.category === 'treat');
  const favs = sugg.filter(x => { const rs = ratingSummary()[x.r.id]; return rs && rs.avg >= 4; });
  const sections = [];
  if (isTreat) sections.push(row('★ Treat yourself', treats, 3));
  sections.push(row(spareIds.length ? 'Uses what you\u2019ve got' : 'Best value', byMoney, 3));
  sections.push(row('Something different', different, 3));
  if (!isTreat) sections.push(row('Treat yourself', treats, 2));
  sections.push(row('Your favourites', favs, 3));
  sections.push(row('Not tried yet', sugg.filter(x => !ratingSummary()[x.r.id]), 2));
  out += sections.join('') || '<p class="muted">No recipes fit. Try allowing longer recipes below, or check your equipment and preferences in Settings.</p>';
  if (d < 5) out += '<button class="btn" data-act="pick-anytime" data-v="' + d + '">' + (top.anyTime ? 'Only show recipes that fit the time limit' : 'Show longer recipes too') + '</button>';
  const f = { ...S.pick, quick: false };
  const rest = sugg.filter(s => !used.has(s.r.id) && recipeMatches(s.r, f));
  out += '<section class="stack"><h3>Browse everything that fits</h3><input class="search" type="search" id="pickq" placeholder="Search" value="' + h(S.pick.q) + '" data-input="pickq" aria-label="Search recipes">' + filterChips(f, 'p-', { noQuick: true }) +
    rest.slice(0, 60).map(s => suggHtml(s, false)).join('') + (rest.length > 60 ? '<p class="muted small">Showing 60 of ' + rest.length + '. Search to narrow it down.</p>' : '') + '</section>';
  return out;
}
function suggHtml(s, best) {
  const r = s.r; const parts = [];
  if (s.uses.length) parts.push('Uses <b>' + s.uses.map(u => h(leftText(u.i, u.q))).join(', ') + '</b>');
  parts.push(s.dBuy < 0.05 ? '<b>nothing extra to buy</b>' : 'adds <span class="money">' + fmtMoney(s.dBuy) + '</span> to the shop');
  if (s.dWaste < -0.1) parts.push('cuts waste by <span class="money">' + fmtMoney(-s.dWaste) + '</span>');
  else if (s.dWaste > 0.1) parts.push('leaves <span class="money">' + fmtMoney(s.dWaste) + '</span> likely unused');
  const n = nut(r);
  const tags = [];
  if (s.clash) tags.push('<span class="tag warn">' + h(s.clash) + '</span>');
  if (r.category === 'treat') tags.push('<span class="tag treat">Treat</span>');
  if ((currentWeek().suggestFirst || []).includes(r.id)) tags.push('<span class="tag good">Moved from last week</span>');
  s.pc.swaps.forEach(x => tags.push('<span class="tag swap">Swap for ' + h(x.person) + '</span>'));
  s.pc.dislikes.forEach(x => tags.push('<span class="tag warn">' + h(x.person) + ' dislikes ' + h(x.what) + '</span>'));
  s.pc.likes.slice(0, 1).forEach(x => tags.push('<span class="tag good">' + h(x.person) + ' likes ' + h(x.what) + '</span>'));
  return '<div class="sugg ' + (best ? 'top' : '') + '">' + tileHtml(r) +
    '<button class="pick" data-act="choose" data-v="' + h(r.id) + '"><b>' + h(rt(r)) + '</b><span class="muted small">' + r.time + ' min · ' + (n.kcal ? n.kcal + ' kcal · ' : '') + h(r.cuisine) + '</span><span class="why">' + parts.join(' · ') + '</span>' + (tags.length ? '<span class="row wrap tagrow">' + tags.join('') + '</span>' : '') + '</button>' +
    '<button class="icon-btn" data-act="peek" data-v="' + h(r.id) + '" aria-label="See the recipe for ' + h(r.title) + '">' + ICON.info + '</button></div>';
}
function heroHtml(r) {
  const own = userPhoto(r);
  if (own) {
    const full = S.fullPhotos[r.id];
    if (full === undefined) { S.fullPhotos[r.id] = null; Store.getG('dishPhotos/' + r.id).then(d => { S.fullPhotos[r.id] = (d && imgOk(d.img) && d.img) || own.thumb; renderSheet(); }); }
    return '<figure class="hero"><img src="' + h(full || own.thumb) + '" alt="' + h(r.title) + ', as made at home"><figcaption>Photo by ' + h(own.by || 'one of you') + (ourPhoto(own) ? '' : ' · <span class="muted">from someone else using Peckish</span> · <button class="linkish small" data-act="hide-photo" data-v="' + h(r.id) + '">Hide this photo</button>') + '</figcaption></figure>';
  }
  if ((S.thumbs[r.id] || (r.photo && r.photo.url)) && S.photoPrefs.hidden[r.id]) return '<p class="muted small">You hid the ' + (S.thumbs[r.id] ? '' : 'stock ') + 'photo for this recipe. <button class="linkish" data-act="unhide-photo" data-v="' + h(r.id) + '">Show it again</button></p>';
  if (r.photo && r.photo.url) return '<figure class="hero"><img src="' + h(r.photo.url) + '" alt="' + h(r.photo.alt || r.title) + '" loading="lazy" onerror="this.parentNode.hidden=true"><figcaption>Photo: ' + h(r.photo.credit || '') + (r.photo.licence ? ' · ' + h(r.photo.licence) : '') + (/^https?:\/\//i.test(r.photo.source || '') ? ' · <a href="' + h(r.photo.source) + '" target="_blank" rel="noopener">source</a>' : '') + ' · <span class="muted">a similar dish, not this exact recipe</span> · <button class="linkish small" data-act="hide-photo" data-v="' + h(r.id) + '">Hide this photo</button></figcaption></figure>';
  return '';
}
// how many portions a planned night cooks: everyone eating + extra portions + leftovers for lunch
function plannedPortions(r, start, d) {
  try { const w = start === S.weekStart ? currentWeek() : (S.thisWeekDoc && S.thisWeekDoc.start === start ? S.thisWeekDoc : null); if (!w || !w.days[d] || w.days[d].r !== r.id || w.days[d].freezer) return null;
    const info = simulate(w, ctx()).dayInfo[d]; return info && info.portions ? Math.round(info.portions * 4) / 4 : null; } catch (e) { return null; }
}
const SPOONISH = /spoon|tbsp|tsp|pinch|taste|splash|drizzle|handful|sprinkle|dash|glug|knob|squeeze|sprig|few /i;
function multText(f) { const w = Math.floor(f + 1e-9), fr = f - w; const q = Math.abs(fr - 0.5) < 0.01 ? '½' : Math.abs(fr - 0.25) < 0.01 ? '¼' : Math.abs(fr - 0.75) < 0.01 ? '¾' : fr > 0.01 ? fr.toFixed(1).slice(1) : ''; return '\u00d7' + (w || '') + q; }
// the amount to show for one ingredient line at a different number of servings
function amtFor(l, f) {
  const ing = S.ING[l.i];
  if (Math.abs(f - 1) < 0.01 || !(l.q > 0)) return l.t || '';
  if (l.t && SPOONISH.test(l.t)) {
    // "3 tablespoons" x1.5 -> "4½ tablespoons"; anything without a leading number gets "x1½"
    const FR = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };
    const m = /^(\d+(?:\.\d+)?)?\s*([½¼¾⅓⅔])?\s+(.*)$/.exec(l.t);
    if (m && (m[1] || m[2])) {
      const v = (Number(m[1]) || 0) + (FR[m[2]] || 0), x = Math.round(v * f * 4) / 4, w0 = Math.floor(x), fr = x - w0;
      const sym = fr === 0.5 ? '½' : fr === 0.25 ? '¼' : fr === 0.75 ? '¾' : '';
      let rest = m[3]; if (x > 1 && /^(tablespoon|teaspoon)\b(?!s)/.test(rest)) rest = rest.replace(/^(tablespoon|teaspoon)/, '$1s');
      return (w0 || (sym ? '' : '0')) + sym + ' ' + rest;
    }
    return l.t + ' ' + multText(f);
  }
  return fmtQty(l.q * f, ing ? ing.unit : 'g');
}
function sheetRecipe(r, top) {
  if (top.serv == null && top.d != null) top.serv = plannedPortions(r, S.weekStart, top.d) || undefined;
  const serv = top.serv || r.servings || 2, f = serv / (r.servings || 2);
  const pc = checkPrefs(r, S.people, S.ING), n = nut(r);
  const w = currentWeek(), locked = !!w.locked;
  let out = heroHtml(r);
  out += '<div class="row" style="align-items:flex-start;gap:16px">' + (out ? '' : tileHtml(r, true)) + '<div class="stack" style="gap:6px;min-width:0"><h1>' + h(r.title) + '</h1>' +
    '<div class="row wrap tagrow"><span class="tag">' + r.time + ' min</span><span class="tag">Serves ' + serv + '</span><span class="tag">' + h(r.cuisine) + '</span>' + (r.category === 'treat' ? '<span class="tag treat">Treat</span>' : '') + '<span class="tag"><span class="money">' + fmtMoney(recipeCost(r)) + '</span>/portion</span></div></div></div>';
  if (n.kcal) out += '<div class="nutri"><div><b>' + n.kcal + '</b><span>kcal</span></div><div><b>' + n.protein + 'g</b><span>protein</span></div><div><b>' + n.carbs + 'g</b><span>carbs</span></div><div><b>' + n.fat + 'g</b><span>fat</span></div></div><p class="muted small center">Per portion, estimated from the ingredients.</p>';
  pc.blocked.forEach(b => { out += '<div class="note warn"><b>' + h(b.person) + ' won’t eat ' + h(b.what.toLowerCase()) + '</b>, and there’s no simple swap, so this won’t be suggested.</div>'; });
  pc.swaps.forEach(s => { out += '<div class="note good"><b>Swap for ' + h(s.person) + ':</b> ' + h(s.note) + ' (' + h(s.ingName.toLowerCase()) + ').</div>'; });
  {
    const rr = S.ratings[r.id] || {}; const me = myUid(); const mine = num(rr[me] && rr[me].stars, 0);
    const others = Object.keys(rr).filter(k => k !== me && rr[k] && num(rr[k].stars, 0) >= 1).map(k => h(rr[k].name || 'Someone') + ' ' + Math.round(num(rr[k].stars, 0)) + '★');
    const rs = ratingSummary()[r.id];
    out += '<section class="ratebox"><div class="row wrap between"><span class="label">' + (mine ? 'Your rating' : 'Made it? Rate it') + '</span>' + rateButtons(r.id, mine) + '</div>' +
      (rr[me] ? '<div><button class="linkish small" data-act="rate-clear" data-v="' + h(r.id) + '">Clear my rating</button></div>' : '') +
      (others.length ? '<p class="small muted">' + others.join(' · ') + '</p>' : '') +
      (rs && rs.avg < 3 ? '<p class="small">Rated under 3★, so it won\u2019t be suggested or added to your weeks. Change the rating to bring it back.</p>' : '') + '</section>';
  }
  if (!hasEquipment(r, S.settings)) out += '<div class="note warn">Needs a ' + h(missingEquipment(r).join(' and a ')) + ', which isn’t in your kitchen settings.</div>';
  if (r.airFryer && S.settings.equipment && S.settings.equipment.air_fryer) out += '<div class="note"><b>Air fryer:</b> ' + h(r.airFryer) + '</div>';
  if (top.d != null && w.days[top.d] && w.days[top.d].r === r.id) {
    const day = w.days[top.d];
    const eat = S.people.filter(p => p.dinner !== false);
    out += '<section class="panel"><div class="row between"><h3>' + DAY_LONG[top.d] + '</h3><button class="btn primary" data-act="cook" data-v="' + h(r.id) + '">Start cooking</button></div>' +
      (eat.length > 1 && !locked ? '<div class="stack" style="gap:6px"><span class="label">Who\u2019s eating</span><div class="row wrap" style="gap:6px">' + eat.map(p => { const a = awayOn(w, p, top.d); return '<button class="chip ' + (a ? 'outd' : 'on') + '" data-act="away-toggle" data-v="' + h(p.id) + '" data-n="' + top.d + '">' + h(p.name) + (a ? ' \u00b7 out' : '') + '</button>'; }).join('') + '</div></div>' : '') +
      dayVoteRow(w, top.d) + dayPlateRows(w, top.d) +
      '<button class="btn block takeaway-btn" data-act="takeaway" data-v="' + top.d + '">' + ICON.bag + ' Getting a takeaway instead?</button>' +
      (locked ? '<p class="muted small">This week is locked in. Unlock it on the Week tab to change dinners.</p>' :
        '<div class="stack" style="gap:6px"><span class="label">Guests for dinner</span><div class="row wrap"><span class="seg">' + [0, 1, 2, 3, 4].map(k => '<button class="' + ((day.guests || 0) === k ? 'on' : '') + '" data-act="guests" data-v="' + top.d + '" data-n="' + k + '">' + (k ? '+' + k : 'None') + '</button>').join('') + '</span></div></div>' +
        '<div class="stack" style="gap:6px"><span class="label">Extra portions</span><div class="row wrap"><span class="seg">' + [0, 1, 2, 4].map(k => '<button class="' + ((day.extra || 0) === k ? 'on' : '') + '" data-act="extra" data-v="' + top.d + '" data-n="' + k + '">' + (k ? '+' + k : 'None') + '</button>').join('') + '</span>' +
        ((day.extra || 0) ? '<span class="seg"><button class="' + (day.extraUse !== 'freeze' ? 'on' : '') + '" data-act="extra-use" data-v="' + top.d + '" data-s="lunch">Lunch</button><button class="' + (day.extraUse === 'freeze' ? 'on' : '') + '" data-act="extra-use" data-v="' + top.d + '" data-s="freeze">Freeze</button></span>' : '') + '</div></div>' +
        '<div class="stack" style="gap:6px"><span class="label">Move to another day</span><div class="chips">' + DAY_NAMES.map((nm, k) => k === top.d ? '' : '<button class="chip" data-act="move-day" data-v="' + top.d + '" data-to="' + k + '">' + nm + (w.days[k].r || w.days[k].takeaway ? ' ⇄' : '') + '</button>').join('') + '</div><span class="muted small">⇄ swaps the two days</span></div>' +
        '<div class="row wrap"><button class="btn" data-act="change-day" data-v="' + top.d + '">Change dinner</button><button class="btn danger" data-act="remove-day" data-v="' + top.d + '">Remove</button></div>') + '</section>';
  } else if (!isDinner(r)) {
    const slot = r.meal === 'breakfast' ? 'b' : 'l';
    out += '<div class="row wrap"><button class="btn primary" data-act="cook" data-v="' + h(r.id) + '">Start cooking</button>' + (top.fromBl ? '<button class="btn soft" data-act="bl-add-from" data-v="' + h(r.id) + '">Add to ' + h((personById(top.fromBl.pid) || {}).name || '') + '\u2019s ' + DAY_LONG[top.fromBl.d] + '</button>' : '') + '</div>';
    if (r.batch) out += '<p class="note">' + h(r.batch) + '</p>';
    if (!top.fromBl) out += S.people.map(p => '<div class="stack" style="gap:6px"><span class="label">Add to ' + h(p.name) + '\u2019s ' + SLOT_NAME[slot].toLowerCase() + ' (' + weekRange(S.weekStart) + ')</span><div class="chips">' + DAY_NAMES.map((nm, d) => { const on = blItems(w, p, slot, d).includes(r.id); return '<button class="chip ' + (on ? 'on' : '') + '" data-act="bl-add-day" data-v="' + h(p.id) + '|' + slot + '|' + d + '" data-r="' + h(r.id) + '" aria-pressed="' + on + '">' + nm + '</button>'; }).join('') + '</div></div>').join('');
  } else {
    out += '<div class="row wrap"><button class="btn primary" data-act="cook" data-v="' + h(r.id) + '">Start cooking</button>' + (top.fromPick != null ? '<button class="btn soft" data-act="choose" data-v="' + h(r.id) + '">Add to ' + DAY_LONG[top.fromPick] + '</button>' : '') + '</div>';
    if (top.fromPick == null && !locked) out += '<div class="stack" style="gap:6px"><span class="label">Add to ' + weekLabel().toLowerCase() + ' (' + weekRange(S.weekStart) + ')</span><div class="chips">' + DAY_NAMES.map((nm, d) => '<button class="chip ' + (w.days[d].r === r.id ? 'on' : '') + '" data-act="add-to-day" data-v="' + d + '" data-r="' + h(r.id) + '">' + nm + (w.days[d].r && w.days[d].r !== r.id ? ' •' : '') + '</button>').join('') + '</div><span class="muted small">• already has a dinner (it’ll be replaced)</span></div>';
  }
  out += '<section class="stack" style="gap:6px"><div class="row between"><h2>Ingredients</h2><span class="seg" aria-label="Servings">' + Array.from(new Set((isDinner(r) ? [2, 3, 4] : [1, 2, 3]).concat([serv]))).sort((a, b) => a - b).map(k => '<button class="' + (serv === k ? 'on' : '') + '" data-act="serv" data-v="' + k + '">' + k + '</button>').join('') + '</span></div><div class="ings">' +
    r.ingredients.map(l => { const ing = S.ING[l.i]; const amt = amtFor(l, f); const low = ing && ing.staple && ['low', 'out'].includes((S.pantry.status || {})[l.i]); return '<div class="ing"><span>' + h(ing ? ing.name : l.i) + (ing && ing.staple ? ' <span class="tag ' + (low ? 'warn' : '') + '">' + (low ? 'pantry · low' : 'pantry') + '</span>' : '') + (l.opt ? ' <span class="tag">optional</span>' : '') + (ing && pc.swaps.some(x => x.ingName === ing.name) ? ' <span class="tag swap">swap for ' + h(pc.swaps.filter(x => x.ingName === ing.name).map(x => x.person).join(' & ')) + '</span>' : '') + '</span><span class="amt">' + h(amt) + '</span></div>'; }).join('') + '</div></section>';
  loadStepPhotos(r);
  out += '<section class="stack"><h2>Method</h2>' + (Math.abs(f - 1) > 0.01 ? '<p class="note small">The method is written for ' + (r.servings || 2) + '. Use the amounts above for ' + serv + '.</p>' : '') + '<ol class="steps">' + r.steps.map((s, k) => { const sp = stepPhoto(r, k); return '<li><div>' + (stepTitle(s) ? '<b class="stitle">' + h(stepTitle(s)) + '</b>' : '') + '<p>' + h(stepText(s)) + '</p>' +
    (sp && !sp.hidden ? '<figure class="stepimg"><img src="' + h(sp.x.img) + '" alt="How step ' + (k + 1) + ' should look" loading="lazy"><figcaption>' + h(sp.x.by || '') + (sp.x.uid === myUid() ? ' · <button class="linkish small" data-act="del-step-photo" data-v="' + h(r.id) + '" data-n="' + k + '">Remove</button>' : '') + stepPhotoNote(r, k, sp) + '</figcaption></figure>' : '') +
    stepPhotoLink(r, k, sp, 'small') + '</div></li>'; }).join('') + '</ol></section>';
  if (r.source && r.source.site) {
    const s = r.source, by = s.author ? ' by ' + h(s.author) : '';
    out += '<p class="muted small credit">' + (s.match === 'loose' ? 'Inspired by ' : 'Based on ') + '“' + h(s.title) + '”' + by + ' (' + h(s.site) + '). ' +
      (s.match === 'close' ? 'Scaled and written up for this app.' : 'Adapted to UK supermarket ingredients and rewritten for this app.') + '</p>';
  }
  const own = S.thumbs[r.id];
  // only the person who added a photo, or their household, can replace it
  if (own && !ourPhoto(own)) out += '<section class="panel"><h3>Your photo</h3><p class="muted small">Someone else using Peckish has added a photo of this dish, so yours can\u2019t go on the card. You can hide theirs for your household.</p></section>';
  else out += '<section class="panel"><h3>Your photo</h3><p class="muted small">' + (own ? 'This photo shows on the card for everyone using the app.' : 'Made it? Add a photo of how yours turned out. It shows on the card for everyone using the app.') + '</p><div class="row wrap"><label class="btn soft">' + ICON.camera + (own ? ' Replace photo' : ' Add a photo') + '<input type="file" accept="image/*" capture="environment" data-photo="' + h(r.id) + '" hidden></label>' + (own && own.uid === myUid() ? '<button class="btn danger" data-act="del-photo" data-v="' + h(r.id) + '">Remove</button>' : '') + '</div></section>';
  out += '<div class="row wrap"><button class="btn" data-act="edit-recipe" data-v="' + h(r.id) + '">Edit recipe</button>' + (top.confirmDel ? '<button class="btn danger" data-act="del-recipe-yes" data-v="' + h(r.id) + '">Yes, remove it</button>' : '<button class="btn danger" data-act="del-recipe" data-v="' + h(r.id) + '">Remove from library</button>') + '</div>';
  return out;
}
// tap a name to cycle: in for dinner -> out for dinner (night shift, out with friends) -> away all day (no breakfast or lunch either)
function sheetWhosIn(top) {
  const w = currentWeek(), ps = S.people.filter(p => p.dinner !== false);
  if (!ps.length) return '<p class="muted">Add who\u2019s eating in Settings first.</p>';
  let out = '<p class="muted small">Tap a name to change it. Dinners are cooked for whoever\u2019s in, so a night for one buys and cooks for one. <b>Out</b> means no dinner that night (a night shift, a night out). <b>Away</b> also skips their breakfast and lunch.</p>';
  out += '<div class="row wrap" style="gap:6px">' + ps.map(p => '<button class="chip" data-act="away-week" data-v="' + h(p.id) + '">' + h(p.name) + ' away all week</button>').join('') + (w.away && Object.keys(w.away).length ? '<button class="chip" data-act="away-clear">Everyone in</button>' : '') + '</div>';
  out += '<div class="mgroup">';
  for (let d = 0; d < 7; d++) {
    out += '<div class="whorow"><b>' + DAY_NAMES[d] + ' <span class="muted small">' + parseIso(addDays(w.start, d)).getDate() + '</span></b><span class="row wrap" style="gap:6px">' + ps.map(p => {
      const a = awayOn(w, p, d);
      return '<button class="chip ' + (a ? (a === 'day' ? 'away' : 'outd') : 'on') + '" data-act="away-cycle" data-v="' + h(p.id) + '" data-n="' + d + '" aria-label="' + h(p.name) + ' on ' + DAY_LONG[d] + ': ' + (a === 'day' ? 'away' : a ? 'out for dinner' : 'in') + '">' + h(p.name) + (a === 'day' ? ' \u00b7 away' : a ? ' \u00b7 out' : '') + '</button>';
    }).join('') + '</span></div>';
  }
  out += '</div><button class="btn primary block" data-act="sheet-back">Done</button>';
  return out;
}
function setAway(pid, d, val) { mutateWeek(w => { const a = { ...((w.away || {})[pid] || {}) }; const p = personById(pid); if (!val && p && naturalAway(w, p, d)) val = 'in'; if (val) a[d] = val; else delete a[d]; const all = { ...(w.away || {}) }; if (Object.keys(a).length) all[pid] = a; else delete all[pid]; w.away = all; if (!Object.keys(all).length) delete w.away; }); renderSheet(true, true); }
function isTonight(d) { return S.weekStart === mondayOf(TODAY) && daysBetween(S.weekStart, TODAY) === d; }
function sheetRescue(top) {
  const w = currentWeek(), d = top.d, r = S.RMAP[(w.days[d] || {}).r];
  if (!top.plans) top.plans = rescuePlans(w, d, ctx());
  const { options, base } = top.plans;
  const skip = options.find(o => o.detail.skip !== undefined);
  const tn = isTonight(d), when = tn ? 'tonight' : 'on ' + DAY_LONG[d];
  const lowest = options.slice(0, 4).reduce((a, o) => (!a || o.waste + o.extra < a.waste + a.extra - 0.005 ? o : a), null);
  const label = o => tn ? o.label : o.label.replace('Skip tonight\u2019s dinner', 'Skip ' + DAY_LONG[d] + '\u2019s dinner').replace('Move tonight to tomorrow', 'Move it to ' + (DAY_LONG[d + 1] || 'the next day'));
  let out = '<p>Enjoy it. Here\u2019s how to rearrange the rest of the week so nothing you\u2019ve bought goes to waste.</p>';
  if (r) out += '<div class="note">' + (tn ? 'Tonight' : DAY_LONG[d]) + ' was <b>' + h(rt(r)) + '</b>.</div>';
  const describe = o => {
    const bits = [];
    if (o.detail.shift) bits.push('Each dinner from ' + DAY_LONG[d] + ' onwards moves one day later.');
    if (o.detail.to != null) bits.push((r ? h(rt(r)) : 'Tonight’s dinner') + ' moves to ' + DAY_LONG[o.detail.to] + '.');
    if (o.bumped.length) bits.push(o.bumped.map(id => '<b>' + h((S.RMAP[id] || {}).title || id) + '</b>').join(', ') + ' moves to next week (it’ll be suggested first).');
    if (o.detail.skip !== undefined) bits.push('Nothing moves. ' + (tn ? 'Tonight\u2019s' : 'That night\u2019s') + ' ingredients are left over.');
    return bits.join(' ');
  };
  const actions = o => {
    const out2 = [];
    o.sim.freezeNotes.filter(n => n.d === d || n.d === d - 1).forEach(n => out2.push(ICON.snow + ' Freeze the ' + h(leftText(n.i, n.q)) + ' ' + when));
    // only waste this change causes, not waste the week already had
    Object.keys(o.sim.waste).filter(id => o.sim.waste[id] > ((base && base.waste[id]) || 0) + 0.01).forEach(id => out2.push(ICON.info + ' ' + h(leftText(id, o.sim.waste[id])) + ' will probably go off. Use it in a lunch or freeze it if you can.'));
    return out2;
  };
  options.slice(0, 4).forEach((o, k) => {
    const saving = skip && o !== skip ? skip.waste + skip.extra - (o.waste + o.extra) : 0;
    const acts = actions(o);
    out += '<section class="panel ' + (o === lowest ? 'bestplan' : '') + '">' + (o === lowest ? '<span class="tag good">Least waste</span>' : '') + '<h3>' + h(label(o)) + '</h3><p class="small">' + describe(o) + '</p>' +
      '<p class="small">Likely waste <span class="money">' + fmtMoney(o.waste) + '</span>' + (o.extra > 0.05 ? ' · extra to buy <span class="money">' + fmtMoney(o.extra) + '</span>' : '') + (saving > 0.05 ? ' · saves <span class="money">' + fmtMoney(saving) + '</span> vs skipping' : '') + '</p>' +
      (acts.length ? '<ul class="acts">' + acts.map(a => '<li>' + a + '</li>').join('') + '</ul>' : '') +
      '<button class="btn ' + (o === lowest ? 'primary' : '') + ' block" data-act="rescue-apply" data-v="' + k + '">Use this plan</button></section>';
  });
  return out;
}
// ---------- recipe import: a web link or a photo of a cookbook page, read by your own Google script ----------
const FRAC = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };
const UNIT_RE = /^(kg|g|grams?|ml|millilitres?|l|litres?|liters?|tbsp|tablespoons?|tbs|tsp|teaspoons?|cups?|oz|lb|cloves?|tins?|cans?|pinch|handful|bunch|pack(?:et)?s?|slices?|rashers?)\b\.?/i;
function parseAmount(s) {
  s = s.replace(/^about\s+|^approx\.?\s+/i, '');
  const m = s.match(/^(\d+(?:[.,]\d+)?)?\s*([½¼¾⅓⅔⅛])?(?:\s*(\d+)\/(\d+))?(?:\s*[-–to]+\s*\d+(?:[.,]\d+)?)?\s*/);
  let q = 0; if (m[1]) q += Number(m[1].replace(',', '.')); if (m[2]) q += FRAC[m[2]]; if (m[3] && m[4]) q += Number(m[3]) / Number(m[4]);
  return { q, rest: s.slice(m[0].length) };
}
// "200g chicken breast, diced" -> {q: 200, unit: 'g', name: 'chicken breast', note: 'diced'}
function parseIngLine(line) {
  let s = String(line).replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim();
  const a = parseAmount(s); s = a.rest;
  let unit = ''; const u = s.match(UNIT_RE); if (u) { unit = u[1].toLowerCase(); s = s.slice(u[0].length).trim(); }
  s = s.replace(/^(of|x)\s+/i, '');
  const [name, ...note] = s.split(/,|\s+-\s+/);
  return { q: a.q, unit, name: name.trim(), full: s.replace(/,/g, ' '), note: note.join(',').trim(), raw: String(line).trim() };
}
const STOP = new Set(['fresh', 'large', 'small', 'medium', 'of', 'a', 'the', 'and', 'or', 'finely', 'chopped', 'sliced', 'diced', 'to', 'serve', 'taste', 'free', 'range', 'british', 'tin', 'can', 'pack', 'good', 'quality', 'ripe', 'boneless', 'skinless', 'extra', 'virgin', 'plus', 'more', 'for']);
const words = s => String(s).toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter(x => x && !STOP.has(x)).map(x => x.endsWith('ies') ? x.slice(0, -3) + 'y' : x.endsWith('oes') ? x.slice(0, -2) : x.endsWith('s') && !x.endsWith('ss') ? x.slice(0, -1) : x);
function matchIng(...names) {
  let best = null, bestScore = 0;
  for (const name of names) {
    const want = words(name); if (!want.length) continue;
    for (const ing of Object.values(S.ING)) {
      const have = words(ing.name.replace(/\(.*?\)/g, ''));
      if (!have.length) continue;
      const hit = want.filter(x => have.includes(x)).length; if (!hit) continue;
      const score = 0.7 * hit / have.length + 0.3 * hit / want.length + (have[have.length - 1] === want[want.length - 1] ? 0.2 : 0);
      if (score > bestScore) { bestScore = score; best = ing; }
    }
  }
  return bestScore >= 0.55 ? best : null;
}
// the amount in the ingredient's own unit, for 2 servings
function toIngQty(p, ing, scale) {
  const q = (p.q || 1) * scale, u = p.unit, iu = ing.unit;
  const per = { kg: 1000, g: 1, gram: 1, grams: 1, ml: 1, millilitre: 1, millilitres: 1, l: 1000, litre: 1000, litres: 1000, liter: 1000, liters: 1000, tbsp: 15, tbs: 15, tablespoon: 15, tablespoons: 15, tsp: 5, teaspoon: 5, teaspoons: 5, cup: 240, cups: 240, oz: 28, lb: 454, pinch: 0.5, handful: 30 };
  if ((iu === 'g' || iu === 'ml') && per[u]) return Math.round(q * per[u] * 10) / 10;
  if ((iu === 'g' || iu === 'ml') && /^(tin|can)/.test(u)) return Math.round(q * 400);
  if ((iu === 'g' || iu === 'ml') && !u && !p.q) return 10; // "to serve", "a handful": a little
  if ((iu === 'g' || iu === 'ml') && !u) { const pack = (ing.packs && ing.packs[0]) || 100; return Math.round(q * (pack <= 20 ? pack : 100)); }
  if (iu === 'clove') return Math.round(q * (u.startsWith('clove') ? 1 : 1) * 2) / 2;
  return Math.round(q * 4) / 4;
}
function draftFromImport(R) {
  const serv = Number(R.servings) > 0 ? Number(R.servings) : 2, scale = 2 / serv;
  const lines = (R.ingredients || []).map(raw => { const p = parseIngLine(raw), ing = matchIng(p.name, p.full); return ing ? { i: ing.id, q: toIngQty(p, ing, scale), t: '' } : { i: '', q: '', t: '', missing: raw }; });
  let steps = (R.steps || []).map(x => String(x).trim()).filter(Boolean);
  while (steps.length > 8) { const out = []; for (let k = 0; k < steps.length; k += 2) out.push(steps.slice(k, k + 2).join(' ')); steps = out; }
  const cuisine = CUISINES.find(c => (R.cuisine || '').toLowerCase().includes(c.toLowerCase().split(' ')[0])) || 'British';
  let site = 'Your cookbook'; try { if (R.source && /^https?:/.test(R.source)) site = new URL(R.source).hostname.replace(/^www\./, ''); } catch (e) {}
  return { id: '', title: R.title || '', time: Number(R.time) || 30, cuisine, servings: 2, icon: '🍲', equipment: ['hob'], steps: steps.map(t => ({ title: '', text: t })), lines, source: { title: R.title || '', site, url: /^https?:/.test(R.source || '') ? R.source : '', match: 'close' }, imported: true, servedOrig: serv };
}
async function importRecipe(payload) {
  const b = S.backup; const top = S.sheets[S.sheets.length - 1];
  if (!b || !b.url) { toast('Connect your Google Sheet backup first (Settings → Backup & restore); its script does the reading.'); return; }
  if (!S.online) { toast('You need signal to import a recipe.'); return; }
  top.importing = true; top.importErr = ''; renderSheet(true);
  try {
    const r = await postScript(b.url, { key: b.key, action: 'recipe', ...payload });
    const dr = draftFromImport(r.recipe || {}); top.draft = dr; top.lines = dr.lines; top.importing = false;
    const miss = dr.lines.filter(l => !l.i).length;
    toast('Read it. ' + (miss ? miss + ' ingredient' + (miss > 1 ? 's' : '') + ' to match by hand.' : 'Check it over and save.'));
  } catch (e) {
    top.importing = false;
    top.importErr = /Unknown action/i.test(e.message) ? 'Your Google script needs the recipe reader added first (see Settings → Backup & restore).' : e.message;
  }
  renderSheet(true);
}
function shrinkPhoto(file, max) {
  return new Promise((res, rej) => { const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { const k = Math.min(1, (max || 1600) / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.85).split(',')[1]); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('That file isn’t a photo we can read.')); }; img.src = url; });
}
function importBox(top) {
  if (top.id) return '';
  return '<section class="panel importbox"><h3>Import a recipe</h3><p class="muted small">Paste a link to a recipe page, or take a photo of a page in one of your cookbooks. It fills in the form below for you to check.</p>' +
    '<form class="row" data-form="import-url" style="gap:8px"><input class="input grow" id="imp-url" type="url" placeholder="https://…" aria-label="Recipe web link"><button class="btn" type="submit"' + (top.importing ? ' disabled' : '') + '>Import</button></form>' +
    '<label class="btn soft block">' + ICON.camera + ' Photo of a cookbook page<input type="file" accept="image/*" capture="environment" data-import-photo="1" hidden></label>' +
    (top.importing ? '<p class="small"><span class="spinner sm" aria-hidden="true"></span> Reading the recipe…</p>' : '') + (top.importErr ? '<p class="note warn small">' + h(top.importErr) + '</p>' : '') +
    (top.draft && top.draft.servedOrig && top.draft.servedOrig !== 2 ? '<p class="note small">The original serves ' + top.draft.servedOrig + '; amounts below are scaled for 2.</p>' : '') +
    (top.draft && top.lines.some(l => !l.i) ? '<p class="note warn small">Couldn’t match: ' + h(top.lines.filter(l => !l.i).map(l => l.missing).join('; ')) + '. Pick the closest for each, or add it in Settings → Ingredients &amp; prices.</p>' : '') + '</section>';
}

function sheetForm(top) {
  const r = top.id ? S.RMAP[top.id] : top.draft || null;
  const lines = top.lines || (r ? r.ingredients.map(l => ({ ...l })) : [{ i: '', q: '', t: '' }, { i: '', q: '', t: '' }, { i: '', q: '', t: '' }]);
  top.lines = lines;
  const steps = r ? r.steps.map(s => ({ title: stepTitle(s), text: stepText(s) })) : [];
  while (steps.length < 8) steps.push({ title: '', text: '' });
  const opts = sel => '<option value="">Choose…</option>' + Object.values(S.ING).sort((a, b) => a.name.localeCompare(b.name)).map(i => '<option value="' + h(i.id) + '" ' + (sel === i.id ? 'selected' : '') + '>' + h(i.name) + ' (' + h(i.unit) + ')</option>').join('');
  const eq = r ? (r.equipment || []) : ['hob'];
  let out = importBox(top) + '<form class="stack" data-form="recipe" data-v="' + h(r && r.id ? r.id : '') + '">' +
    '<label class="field"><span>Name</span><input class="input" id="rf-title" required value="' + h(r ? r.title : '') + '" placeholder="e.g. Nan’s sausage casserole"></label>' +
    '<div class="grid2"><label class="field"><span>Icon (an emoji)</span><input class="input" id="rf-icon" value="' + h(r ? r.icon : '🍲') + '" maxlength="4"></label><label class="field"><span>Total time (min)</span><input class="input" id="rf-time" type="number" min="5" step="5" required value="' + (r ? r.time : 30) + '"></label></div>' +
    '<div class="grid2"><label class="field"><span>Cuisine</span><select class="input" id="rf-cuisine">' + CUISINES.map(c => '<option ' + (r && r.cuisine === c ? 'selected' : '') + '>' + c + '</option>').join('') + '</select></label><label class="field"><span>Main protein</span><select class="input" id="rf-protein">' + PROTEINS.map(p => '<option ' + (r && r.protein === p ? 'selected' : '') + '>' + p + '</option>').join('') + '</select></label></div>' +
    '<label class="field"><span>Type</span><select class="input" id="rf-category"><option value="everyday" ' + (!r || r.category !== 'treat' ? 'selected' : '') + '>Everyday</option><option value="treat" ' + (r && r.category === 'treat' ? 'selected' : '') + '>Treat</option></select></label>' +
    '<div class="stack" style="gap:6px"><span class="label">Equipment needed</span><div class="pchips">' + EQUIPMENT.map(([k, n]) => '<label class="chip"><input type="checkbox" class="cb" id="rf-eq-' + k + '" ' + (eq.includes(k) ? 'checked' : '') + '> ' + n + '</label>').join('') + '</div></div>' +
    '<h3>Ingredients (for ' + (r && r.servings === 1 ? '1' : '2') + ')</h3><p class="muted small">Missing an ingredient? Add it in Settings → Ingredients &amp; prices first. Amounts use the unit shown.</p>';
  lines.forEach((l, k) => {
    out += '<div class="stack ruled" style="gap:6px"><select class="input" id="rf-i-' + k + '" aria-label="Ingredient ' + (k + 1) + '">' + opts(l.i) + '</select><div class="grid2"><input class="input" id="rf-q-' + k + '" type="number" step="any" min="0" placeholder="Amount" value="' + (l.q === '' || l.q == null ? '' : l.q) + '" aria-label="Amount"><input class="input" id="rf-t-' + k + '" placeholder="' + (l.missing ? h(l.missing) : 'Shown as, e.g. 1, sliced') + '" value="' + h(l.t || '') + '" aria-label="Shown as"></div>' +
      '<input class="input" id="rf-s-' + k + '" placeholder="Optional swap if someone won’t eat it" value="' + h(l.swap || '') + '" aria-label="Swap note"></div>';
  });
  out += '<button class="btn" type="button" data-act="rf-more">' + ICON.plus + ' Another ingredient</button><h3>Steps (up to 8, prep first)</h3>' +
    steps.slice(0, 8).map((s, k) => '<div class="stack ruled" style="gap:6px"><input class="input" id="rf-stt-' + k + '" placeholder="Step ' + (k + 1) + ' title, e.g. Make the slaw" value="' + h(s.title) + '"><textarea class="input" id="rf-st-' + k + '" rows="3" placeholder="What to do">' + h(s.text) + '</textarea></div>').join('') +
    '<button class="btn primary" type="submit">Save recipe</button></form>';
  return out;
}
function readFormLines(top) {
  return top.lines.map((l, k) => ({ i: ($('#rf-i-' + k) || {}).value || '', q: ($('#rf-q-' + k) || {}).value || '', t: ($('#rf-t-' + k) || {}).value || '', swap: ($('#rf-s-' + k) || {}).value || '' }));
}

// ---------- COOK MODE ----------
let wakeLock = null;
async function startCook(id, serv) { S.cook = { id, step: 0, showIngs: false, serv: serv || null }; renderCook(); try { if (navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { wakeLock = null; } }
function speakStep() {
  if (!S.cook || !S.cook.speak || !('speechSynthesis' in window)) return;
  const r = S.RMAP[S.cook.id]; const st = r && r.steps[S.cook.step]; if (!st) return;
  try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance('Step ' + (S.cook.step + 1) + '. ' + (stepTitle(st) ? stepTitle(st) + '. ' : '') + stepText(st)); u.lang = 'en-GB'; u.rate = 0.95; speechSynthesis.speak(u); } catch (e) {}
}
function stopCook() { try { speechSynthesis.cancel(); } catch (e) {} S.cook = null; renderCook(); try { if (wakeLock) wakeLock.release(); } catch (e) {} wakeLock = null; }
function cookF(r) { return S.cook && S.cook.serv ? S.cook.serv / (r.servings || 2) : 1; }
// swap notes (e.g. "cook the peas separately for Sophie") on the steps they matter for
function cookSwaps(r, k, s) {
  const sw = checkPrefs(r, S.people, S.ING).swaps; if (!sw.length) return '';
  const txt = (stepTitle(s) + ' ' + stepText(s)).toLowerCase();
  const hit = sw.filter(x => { const words = String(x.ingName || '').toLowerCase().replace(/\(.*?\)/g, '').split(/[^a-z]+/).filter(wd => wd.length > 3); return words.some(wd => txt.includes(wd.replace(/(es|s)$/, ''))); });
  const show = k === 0 ? sw : hit; if (!show.length) return '';
  return show.map(x => '<div class="note good"><b>For ' + h(x.person) + ':</b> ' + h(x.note) + '</div>').join('');
}
function renderCook() {
  histSoon();
  const el = $('#cook');
  if (!S.cook) { el.hidden = true; el.innerHTML = ''; return; }
  const r = S.RMAP[S.cook.id]; if (!r) { el.hidden = true; return; }
  const k = S.cook.step, n = r.steps.length, s = r.steps[k];
  loadStepPhotos(r);
  el.innerHTML = '<div class="chead"><button class="icon-btn" data-act="cook-close" aria-label="Stop cooking">' + ICON.close + '</button><b class="grow ellip">' + h(rt(r)) + '</b><span id="tmrs" class="tmrs">' + timersHtml() + '</span>' + ('speechSynthesis' in window ? '<button class="chip ' + (S.cook.speak ? 'on' : '') + '" data-act="cook-speak" aria-pressed="' + !!S.cook.speak + '">' + (S.cook.speak ? 'Reading aloud' : 'Read aloud') + '</button>' : '') + '<button class="chip ' + (S.cook.showIngs ? 'on' : '') + '" data-act="cook-ings">Ingredients</button></div>' +
    '<div class="cbody">' + (S.cook.showIngs ? '<div class="ings" style="font-size:1.15rem">' + (cookF(r) !== 1 ? '<p class="muted small">Amounts for ' + S.cook.serv + '. The steps are written for ' + (r.servings || 2) + '.</p>' : '') + r.ingredients.map(l => '<div class="ing"><span>' + h(ingName(l.i)) + '</span><span class="amt">' + h(amtFor(l, cookF(r))) + '</span></div>').join('') + '</div>' :
      '<div class="stepno">Step ' + (k + 1) + ' of ' + n + '</div>' + (stepTitle(s) ? '<div class="steptitle">' + h(stepTitle(s)) + '</div>' : '') + '<div class="steptext">' + h(stepText(s)) + '</div>' + cookSwaps(r, k, s) + cookExtras(r, k, s) + (S.settings.equipment && S.settings.equipment.air_fryer && r.airFryer && /oven|fry|crisp|chips|wedges/i.test(stepText(s)) ? '<div class="note"><b>Air fryer:</b> ' + h(r.airFryer) + '</div>' : '')) + '</div>' +
    '<div class="cfoot"><button class="btn" data-act="cook-prev" ' + (k === 0 ? 'disabled' : '') + '>Back</button><div class="dots" aria-hidden="true">' + r.steps.map((_, j) => '<i class="' + (j === k ? 'on' : '') + '"></i>').join('') + '</div><button class="btn primary" data-act="' + (k === n - 1 ? 'cook-close' : 'cook-next') + '">' + (k === n - 1 ? 'Done' : 'Next') + '</button></div>';
  el.hidden = false;
}

// ---------- cooking timers ----------
function stepTimes(text) {
  const out = []; const re = /(\d+)(?:\s*(?:–|-|to)\s*(\d+))?\s*(?:min|mins|minutes)\b/gi; let m;
  while ((m = re.exec(text)) && out.length < 3) { const mins = Number(m[2] || m[1]); if (mins > 0 && mins <= 240 && !out.includes(mins)) out.push(mins); }
  return out;
}
function cookExtras(r, k, s) {
  const sp = stepPhoto(r, k);
  const times = stepTimes(stepText(s));
  return (times.length ? '<div class="row wrap">' + times.map(m => '<button class="btn soft" data-act="timer" data-v="' + m + '" data-l="' + h((stepTitle(s) || 'Step ' + (k + 1)).slice(0, 28)) + '">' + ICON.timer + ' ' + m + ' min timer</button>').join('') + '</div>' : '') +
    (sp && !sp.hidden ? '<figure class="cookimg"><img src="' + h(sp.x.img) + '" alt="How this step should look"><figcaption>How it looked for ' + h(sp.x.by || 'someone') + stepPhotoNote(r, k, sp) + '</figcaption></figure>' : '') +
    stepPhotoLink(r, k, sp, '');
}
function timersHtml() {
  const now = Date.now();
  return S.timers.map(t => { const left = Math.max(0, Math.round((t.end - now) / 1000)); const mm = Math.floor(left / 60), ss = String(left % 60).padStart(2, '0');
    return '<button class="tmr ' + (left === 0 ? 'done' : '') + '" data-act="timer-stop" data-v="' + h(t.id) + '" aria-label="' + h(t.label) + ' timer, tap to stop">' + ICON.timer + ' ' + mm + ':' + ss + '</button>'; }).join('');
}
let timerTick = null, audioCtx = null;
function beep() { try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); [0, 0.35, 0.7].forEach(t => { const o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.frequency.value = 880; o.connect(g); g.connect(audioCtx.destination); g.gain.setValueAtTime(0.25, audioCtx.currentTime + t); o.start(audioCtx.currentTime + t); o.stop(audioCtx.currentTime + t + 0.2); }); } catch (e) {} }
function startTimer(mins, label) {
  try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  S.timers.push({ id: Date.now().toString(36), label, end: Date.now() + mins * 60000, rang: false });
  if (!timerTick) timerTick = setInterval(() => {
    const now = Date.now();
    for (const t of S.timers) if (!t.rang && t.end <= now) { t.rang = true; beep(); try { navigator.vibrate && navigator.vibrate([300, 150, 300]); } catch (e) {} toast('Timer done: ' + t.label); }
    const el = $('#tmrs'); if (el) el.innerHTML = timersHtml();
    if (!S.timers.length) { clearInterval(timerTick); timerTick = null; }
  }, 1000);
  renderCook();
}

// ---------- photos ----------
function resize(file, max, q) {
  return new Promise((resolve, reject) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => { const sc = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', q)); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file isn’t a photo we can read.')); };
    img.src = url;
  });
}
function loadStepPhotos(r) {
  if (S.stepPhotos[r.id] !== undefined) return; S.stepPhotos[r.id] = {};
  Promise.all(r.steps.map((_, k) => Store.getG('stepPhotos/' + r.id + '__' + k))).then(list => {
    const m = {}; list.forEach((d, k) => { if (d && d.img) m[k] = d; }); S.stepPhotos[r.id] = m; renderSheet(); renderCook();
  });
}
async function addStepPhoto(rid, k, file) {
  try {
    toast('Saving step photo…');
    const cap = Math.min(Store.maxDocBytes || 700000, 400000);
    let img = await resize(file, 900, 0.7); if (img.length > cap) img = await resize(file, 700, 0.6); if (img.length > cap) img = await resize(file, 520, 0.55);
    const d = { img, by: myName(), uid: myUid(), at: new Date().toISOString(), rid, step: k, hid: (S.userDoc && S.userDoc.current) || '' };
    S.stepPhotos[rid] = { ...(S.stepPhotos[rid] || {}), [k]: d }; renderSheet(true); renderCook();
    Store.setG('stepPhotos/' + rid + '__' + k, d).then(() => toast('Step photo saved for everyone')).catch(() => toast('Couldn\u2019t save the photo.'));
  } catch (e) { toast(e.message || 'Couldn\u2019t add that photo.'); }
}
async function addPhoto(rid, file) {
  try {
    toast('Saving photo…');
    const cap = Store.maxDocBytes || 700000;
    let full = await resize(file, 1100, 0.72); if (full.length > cap) full = await resize(file, 800, 0.6); if (full.length > cap) full = await resize(file, 600, 0.55);
    const thumb = await resize(file, 260, 0.7);
    const at = new Date().toISOString();
    const uid = myUid();
    S.thumbs[rid] = { id: rid, thumb, by: myName(), uid, at }; S.fullPhotos[rid] = full; renderSheet(true); schedule();
    Store.setG('dishPhotos/' + rid, { img: full, by: myName(), uid, at, hid: (S.userDoc && S.userDoc.current) || '' }).catch(() => toast('Couldn\u2019t save the photo.'));
    Store.setG('dishThumbs/' + rid, { thumb, by: myName(), uid, at, hid: (S.userDoc && S.userDoc.current) || '' }).catch(() => {});
    toast('Photo added');
  } catch (e) { toast(e.message || 'Couldn’t add that photo.'); }
}

// ---------- actions ----------
function setDay(d, patch) { mutateWeek(w => { w.days[d] = { ...patch }; }); }
// what belongs to the night rather than the dinner: guests coming, and extra portions for lunch or the freezer
function nightKeep(old) { const o = old || {}; return { extra: o.extra || 0, extraUse: o.extraUse, guests: o.guests }; }
function guardLocked() { if (currentWeek().locked) { toast('This week is locked in. Unlock it to change dinners.'); return true; } return false; }
// run the planner in a background worker on the phone; fall back to running it here (tests, old browsers, a worker error)
let fillWorker = null, fillSeq = 0;
function autoFillAsync(w, C, opts) {
  if (typeof Worker === 'undefined' || APP_VERSION === 'dev') return new Promise(res => setTimeout(() => res(autoFill(w, C, opts)), 30));
  return new Promise(res => {
    const id = ++fillSeq; let done = false;
    const local = () => { if (done) return; done = true; try { if (fillWorker) fillWorker.terminate(); } catch (e) {} fillWorker = null; res(autoFill(w, C, opts)); };
    try { if (!fillWorker) fillWorker = new Worker('fill-worker.js?v=' + APP_VERSION); } catch (e) { return local(); }
    fillWorker.onmessage = ev => { if (ev.data.id !== id || done) return; if (ev.data.ok) { done = true; res(ev.data.filled); } else local(); };
    fillWorker.onerror = () => local();
    try { fillWorker.postMessage({ id, w, C, opts }); } catch (e) { local(); }
  });
}
function doFill(jitter, clearAuto) {
  if (S.busy || guardLocked()) return;
  if (!S.weekLoaded) { toast('This week is still loading. Try again in a moment.'); return; }
  S.busy = true; render();
  const C = ctx(); const w = clone(currentWeek());
  if (clearAuto) w.days = w.days.map(x => x.auto ? {} : x);
  autoFillAsync(w, C, { jitter, beam: 3, branch: 5 }).then(filled => {
    try {
      const empties = w.days.map((x, d) => (!x.r && !x.takeaway && !nobodyIn(w, d, C)) ? d : -1).filter(d => d >= 0);
      S.busy = false;
      // planning takes a moment: if you've gone to another week meanwhile, don't put this plan on it
      if (S.weekStart !== w.start) { toast('You moved to another week, so nothing was filled in. Tap Fill again here.'); render(); return; }
      if (!empties.some(d => filled.days[d].r)) { toast('No recipes fit the remaining days. Try loosening the weeknight time, equipment or preferences.'); render(); return; }
      // only nights that are still empty (the other phone may have chosen one meanwhile)
      mutateWeek(x => { empties.forEach(d => { if (filled.days[d].r && !x.days[d].r && !x.days[d].takeaway) x.days[d] = { ...x.days[d], ...filled.days[d], auto: true }; }); });
      toast('Week planned. Swap any day you don’t fancy.');
    } catch (e) { S.busy = false; render(); toast('Couldn’t plan the week.'); console.error(e); }
  });
}
async function copyText(text, okMsg) {
  try { await navigator.clipboard.writeText(text); toast(okMsg); }
  catch (e) { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast(okMsg); } catch (x) { toast('Couldn’t copy. Select the text and copy it yourself.'); } ta.remove(); }
}
async function withBusy(fn) { S.authBusy = true; S.authMsg = ''; render(); try { await fn(); } catch (e) { S.authMsg = e.message || String(e); S.authMsgOk = false; } S.authBusy = false; render(); }

document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  const a = b.dataset.act, v = b.dataset.v;
  const top = S.sheets[S.sheets.length - 1];
  if (S.shareMenu && a !== 'share-menu') S.shareMenu = false;
  switch (a) {
    case 'pantry-checked': S.pantry = { ...S.pantry, checkedOnce: true }; savePantry(); toast('Thanks. The list now knows what you have.'); break;
    case 'away-toggle': { const d = Number(b.dataset.n); const cur = awayOn(currentWeek(), { id: v }, d); top.serv = undefined; setAway(v, d, cur ? null : 'dinner'); break; }
    case 'show-hidden': S.showHidden = !S.showHidden; render(); break;
    case 'freezer-space': saveSettings({ freezerSpace: Number(v) }); break;
    case 'who-cycle': { if (guardLocked()) break; const d = Number(b.dataset.n), w0 = currentWeek(), ps = S.people.filter(p => p.dinner !== false);
      if (ps.length !== 2) { pushSheet({ type: 'whosin' }); break; }
      const st = ps.map(p => !awayOn(w0, p, d)); // true = in
      const next = st[0] && st[1] ? [true, false] : st[0] && !st[1] ? [false, true] : !st[0] && st[1] ? [false, false] : [true, true];
      mutateWeek(w => { const all = { ...(w.away || {}) }; ps.forEach((p, k) => { const a = { ...(all[p.id] || {}) }; const val = awayVal(w, p, d, next[k]); if (val) a[d] = val; else delete a[d]; if (Object.keys(a).length) all[p.id] = a; else delete all[p.id]; }); if (Object.keys(all).length) w.away = all; else delete w.away; });
      const names = ps.filter((p, k) => next[k]).map(p => p.name);
      toast(DAY_LONG[d] + ': ' + (names.length === 2 ? 'both in' : names.length ? 'just ' + names[0] : 'nobody in, no dinner'));
      break; }
    case 'whosin': if (guardLocked()) break; pushSheet({ type: 'whosin' }); break;
    case 'away-cycle': { const d = Number(b.dataset.n), cur = awayOn(currentWeek(), { id: v }, d); setAway(v, d, !cur ? 'dinner' : cur === 'dinner' ? 'day' : null); break; }
    case 'away-week': { mutateWeek(w => { w.away = { ...(w.away || {}), [v]: { 0: 'day', 1: 'day', 2: 'day', 3: 'day', 4: 'day', 5: 'day', 6: 'day' } }; }); renderSheet(true, true); break; }
    case 'away-clear': mutateWeek(w => { delete w.away; }); renderSheet(true, true); break;
    case 'week-shop': mutateWeek(w => { if (v === S.settings.shop) delete w.shop; else w.shop = v; }); toast(v === S.settings.shop ? 'Back to your usual shop' : 'This week\u2019s list is now in ' + (SHOPS.find(x => x.id === v) || {}).name + '\u2019s pack sizes'); break;
    case 'share-menu': S.shareMenu = !S.shareMenu; render(); break;
    case 'go-left': S.tab = 'kitchen'; S.kitView = 'left'; closeSheets(); window.scrollTo(0, 0); render(); break;
    case 'go-cost': S.tab = 'shop'; S.shopView = 'cost'; closeSheets(); window.scrollTo(0, 0); render(); break;
    case 'tab': if (S.tab === v && v === 'settings') S.setPage = null; S.tab = v; closeSheets(); window.scrollTo(0, 0); render(); break;
    case 'backup-now': runBackup(true); break;
    case 'backup-file': saveBackupFile(false); break;
    case 'backup-share': saveBackupFile(true); break;
    case 'restore-sheet': restoreFromSheet(); break;
    case 'restore-yes': applyRestore(); break;
    case 'restore-no': S.pendingRestore = null; render(); break;
    case 'backup-off': S.confirm.bkoff = true; render(); break;
    case 'backup-off-yes': S.confirm = {}; Store.set('config/backup', { auto: false, disconnected: new Date().toISOString(), disconnectedBy: myName() }).then(() => toast('Backup sheet disconnected')); break;
    case 'set-page': S.setPage = v || null; S.confirm = {}; S.ingNew = false; S.priceMore = 0; window.scrollTo(0, 0); render(); break;
    case 'go-set': S.tab = 'settings'; S.setPage = v; if (b.dataset.p) S.setPerson = b.dataset.p; closeSheets(); window.scrollTo(0, 0); render(); break;
    case 'set-person': S.setPerson = v; S.confirm = {}; render(); break;
    case 'price-aisle': S.priceAisle = v; S.priceMore = 0; render(); break;
    case 'price-more': S.priceMore = (S.priceMore || PRICE_PAGE) + PRICE_PAGE; render(); break;
    case 'ing-new': S.ingNew = !S.ingNew; render(); break;
    case 'f-meal-set': S.filters.meal = v; S.recMore = 0; render(); window.scrollTo(0, 0); break;
    case 'f-shelf': { const q = S.filters.q; S.filters = { q, cuisine: '', quick: false, protein: '', category: '', kcal: '', rated: '', meal: '' };
      String(v).split(',').forEach(kv => { const [k, x] = kv.split('='); S.filters[k] = k === 'quick' ? true : x; }); S.recMore = 0; render(); window.scrollTo(0, 0); break; }
    case 'f-reset': S.filters = { q: '', cuisine: '', quick: false, protein: '', category: '', kcal: '', rated: '', meal: '' }; S.recMore = 0; render(); window.scrollTo(0, 0); break;
    case 'rec-more': S.recMore = (S.recMore || 60) + 60; render(); break;
    case 'week-view': S.weekView = v; render(); window.scrollTo(0, 0); break;
    case 'shop-view': S.shopView = v; render(); window.scrollTo(0, 0); break;
    case 'kit-view': S.kitView = v; render(); window.scrollTo(0, 0); break;
    case 'wk-this': S.weekPicked = true; S.weekStart = mondayOf(TODAY); S.confirm = {}; subscribeWeek(); render(); window.scrollTo(0, 0); break;
    case 'wk': S.weekPicked = true; S.weekStart = addDays(S.weekStart, 7 * Number(v)); S.confirm = {}; subscribeWeek(); render(); break;
    case 'fill': doFill(0.6, false); break;
    case 'clear': S.confirm.clear = true; render(); renderSheet(true, true); break;
    case 'clear-no': S.confirm = {}; render(); break;
    case 'clear-yes': S.confirm = {}; mutateWeek(w => { w.days = w.days.map(() => ({})); w.checked = {}; w.bumped = []; w.have = {}; }); break;
    case 'lock': mutateWeek(w => { w.locked = { by: myName(), at: new Date().toISOString() }; }); toast('Week locked in on both phones. Time to shop!'); if (S.backup && S.backup.url && S.backup.auto !== false) setTimeout(() => runBackup(false), 4000); break;
    case 'unlock': S.confirm.unlock = true; render(); renderSheet(true, true); break;
    case 'unlock-no': S.confirm = {}; render(); break;
    case 'unlock-yes': S.confirm = {}; mutateWeek(w => { delete w.locked; }); break;
    case 'pick': if (guardLocked()) break; S.pick = { q: '', cuisine: '', protein: '', category: '', kcal: '', rated: '' }; pushSheet({ type: 'pick', d: Number(v) }); break;
    case 'pick-anytime': top.anyTime = !top.anyTime; renderSheet(true, true); break;
    case 'open-day': { const d = Number(v); pushSheet({ type: 'recipe', id: currentWeek().days[d].r, d }); break; }
    case 'open-recipe': pushSheet({ type: 'recipe', id: v }); break;
    case 'peek': if (top && top.type === 'blpick') pushSheet({ type: 'recipe', id: v, fromBl: { pid: top.pid, slot: top.slot, d: top.d } }); else pushSheet({ type: 'recipe', id: v, fromPick: top && top.d }); break;
    case 'bl-person': S.blPerson = v; render(); break;
    case 'bl-pick': { const [pid, slot, d] = v.split('|'); pushSheet({ type: 'blpick', pid, slot, d: Number(d), packed: !!(personById(pid) || {}).packed }); break; }
    case 'bl-add': { const p = personById(top.pid); setBl(top.pid, top.slot, top.d, blItems(currentWeek(), p, top.slot, top.d).concat([v])); renderSheet(true); break; }
    case 'bl-add-from': { const fb = top.fromBl; const p = personById(fb.pid); setBl(fb.pid, fb.slot, fb.d, blItems(currentWeek(), p, fb.slot, fb.d).concat([v])); popSheet(); toast('Added'); break; }
    case 'bl-add-day': { const [pid, slot, d] = v.split('|'); const p = personById(pid); const cur = blItems(currentWeek(), p, slot, Number(d)); const rid = b.dataset.r; setBl(pid, slot, Number(d), cur.includes(rid) ? cur.filter(x => x !== rid) : cur.concat([rid])); renderSheet(true); break; }
    case 'bl-remove': { const p = personById(top.pid); const cur = blItems(currentWeek(), p, top.slot, top.d).slice(); cur.splice(Number(v), 1); setBl(top.pid, top.slot, top.d, cur); renderSheet(true); break; }
    case 'bl-none': setBl(top.pid, top.slot, top.d, []); renderSheet(true); break;
    case 'bl-usual': { const p = clone(personById(top.pid)); p.usual = { ...(p.usual || {}), [top.slot]: blItems(currentWeek(), personById(top.pid), top.slot, top.d) }; S.people = S.people.map(x => x.id === p.id ? p : x); savePerson(p); toast('Saved as ' + p.name + '\u2019s usual ' + SLOT_NAME[top.slot].toLowerCase()); renderSheet(true); break; }
    case 'bl-alldays': { const p = personById(top.pid); const items = blItems(currentWeek(), p, top.slot, top.d); const days = (p.days && p.days[top.slot]) || [0, 1, 2, 3, 4, 5, 6];
      mutateWeek(w => { w.bl = w.bl || {}; const cur = w.bl[p.id] || {}; const arr = Array.from({ length: 7 }, (_, k) => blItems(w, p, top.slot, k)); days.forEach(k => arr[k] = items.slice()); w.bl[p.id] = { ...cur, [top.slot]: arr }; }); toast('Copied to every ' + (top.slot === 'l' ? 'lunch' : 'breakfast') + ' day'); renderSheet(true); break; }
    case 'bl-auto': autoLunches(v); break;
    case 'bl-reset': clearBlOverrides(v); toast('Back to usual'); break;
    case 'p-portion': { const p = clone(personById(v)); p.portion = Number(b.dataset.n); S.people = S.people.map(x => x.id === v ? p : x); savePerson(p); render(); break; }
    case 'p-day': { const p = clone(personById(v)); const slot = b.dataset.s, d = Number(b.dataset.n); p.days = { ...(p.days || {}) }; const cur = new Set(p.days[slot] || (slot === 'l' ? [0, 1, 2, 3, 4] : [0, 1, 2, 3, 4, 5, 6])); cur.has(d) ? cur.delete(d) : cur.add(d); p.days[slot] = Array.from(cur).sort(); S.people = S.people.map(x => x.id === v ? p : x); savePerson(p); render(); break; }
    case 'choose': {
      const pick = S.sheets.slice().reverse().find(s => s.type === 'pick');
      if (pick) { const d = pick.d; const old = currentWeek().days[d]; setDay(d, { r: v, ...nightKeep(old) }); closeSheets(); toast((S.RMAP[v] || {}).title + ' added to ' + DAY_LONG[d]); }
      break;
    }
    case 'choose-freezer': { const pick = S.sheets.find(s => s.type === 'pick'); setDay(pick.d, { r: v, freezer: true, guests: currentWeek().days[pick.d].guests }); closeSheets(); break; }
    case 'add-to-day': { if (guardLocked()) break; const d = Number(v); setDay(d, { r: b.dataset.r, ...nightKeep(currentWeek().days[d]) }); toast('Added to ' + DAY_LONG[d]); renderSheet(true); break; }
    case 'change-day': { if (guardLocked()) break; const d = Number(v); S.sheets = []; pushSheet({ type: 'pick', d }); break; }
    case 'remove-day': if (guardLocked()) break; setDay(Number(v), {}); closeSheets(); break;
    case 'takeaway': pushSheet({ type: 'rescue', d: Number(v) }); break;
    case 'rescue-apply': {
      const o = top.plans.options[Number(v)];
      mutateWeek(w => { w.undoTk = { d: top.d, days: w.days.map(x => ({ ...x })), bumped: (w.bumped || []).slice() }; w.days = o.days.map(x => ({ ...x })); w.bumped = Array.from(new Set((w.bumped || []).concat(o.bumped))); });
      closeSheets(); toast('Plan updated. Enjoy the takeaway!'); break;
    }
    // put the whole week back exactly as it was before the takeaway plan (not just that night)
    case 'undo-takeaway': { const d = Number(v); mutateWeek(w => { if (w.undoTk && w.undoTk.d === d) { w.days = w.undoTk.days; w.bumped = w.undoTk.bumped; delete w.undoTk; } else { const was = w.days[d].was; w.days[d] = was ? { r: was } : {}; } }); break; }
    case 'go-week': S.weekStart = v; S.tab = 'week'; S.weekPicked = true; subscribeWeek(); window.scrollTo(0, 0); render(); break;
    case 'prep-open': pushSheet({ type: 'recipe', id: v, serv: Number(b.dataset.n) }); break;
    case 'cal-link': calLink(); break;
    case 'cal-unlink': calUnlink(); break;
    case 'cal-refresh': calRefresh(true); break;
    case 'set-cutoff': saveSettings({ lateCutoff: v }); calRefresh(true); break;
    case 'remind-at': saveSettings({ remind: { cook: true, defrost: true, plates: true, ...(S.settings.remind || {}), cookAt: v } }); calSoon(500); break;
    case 'bg-unlink': bgUnlink(); break;
    case 'bg-sync': bgCall([], false).then(bgSyncShops).catch(e => { S.bg.err = e.message; schedule(); }); break;
    case 'votes': pushSheet({ type: 'votes' }); break;
    case 'vote': { const d = Number(v), val = Number(b.dataset.n), me = mePerson(); if (!me) { toast('Pick who you are in Settings \u2192 Who\u2019s eating first.'); break; }
      mutateWeek(w => { const all = { ...(w.votes || {}) }, mine = { ...(all[me.id] || {}) }; if (voteOf(w, me.id, d) === val) delete mine[d]; else mine[d] = { r: w.days[d].r, v: val }; all[me.id] = mine; w.votes = all; });
      renderSheet(true); if (val < 0 && voteOf(currentWeek(), me.id, d) < 0) toast('Noted. Swap it, or leave it for the other one to decide.'); break; }
    case 'plate': { const d = Number(v), val = b.dataset.s, pid = b.dataset.p || (mePerson() || {}).id; if (!pid) break;
      mutateWeek(w => { const all = { ...(w.plates || {}) }; all[pid] = { ...(all[pid] || {}), [d]: val }; w.plates = all; });
      top && top.type === 'recipe' ? (top.serv = undefined, renderSheet(true)) : 0;
      toast(val === 'save' ? 'A plate will be saved on ' + DAY_LONG[d] : DAY_LONG[d] + ': dinner planned without you'); break; }
    case 'glance': { const me = mePerson(); if (me) { S.weekView = 'bl'; S.blPerson = me.id; render(); window.scrollTo(0, 0); } break; }
    case 'make-it': { const d = Number(b.dataset.n); if (guardLocked()) break; mutateWeek(w => { w.days[d] = { ...w.days[d], r: v, auto: false }; }); toast(DAY_LONG[d] + ': ' + rt(S.RMAP[v])); break; }
    case 'guests': { const d = Number(v), n = Number(b.dataset.n); mutateWeek(w => { if (n) w.days[d].guests = n; else delete w.days[d].guests; }); top.serv = undefined; renderSheet(true); toast(n ? DAY_LONG[d] + ': cooking for ' + n + ' more' : 'No guests on ' + DAY_LONG[d]); break; }
    case 'extra': { const d = Number(v); mutateWeek(w => { w.days[d].extra = Number(b.dataset.n); if (!w.days[d].extraUse) w.days[d].extraUse = 'lunch'; }); renderSheet(true); break; }
    case 'extra-use': { const d = Number(v); mutateWeek(w => { w.days[d].extraUse = b.dataset.s; }); renderSheet(true); break; }
    case 'serv': top.serv = Number(v); renderSheet(true); break;
    case 'sheet-back': popSheet(); break;
    case 'cook': { const r = S.RMAP[v]; let serv = null;
      if (top && top.type === 'recipe' && top.id === v && top.serv) serv = top.serv;
      else if (r) { const thisW = mondayOf(TODAY), d0 = daysBetween(thisW, TODAY); serv = plannedPortions(r, thisW, d0); }
      startCook(v, serv); break; }
    case 'cook-close': stopCook(); break;
    case 'cook-next': S.cook.step++; S.cook.showIngs = false; renderCook(); speakStep(); break;
    case 'cook-prev': S.cook.step = Math.max(0, S.cook.step - 1); S.cook.showIngs = false; renderCook(); speakStep(); break;
    case 'cook-speak': S.cook.speak = !S.cook.speak; renderCook(); if (S.cook.speak) speakStep(); else try { speechSynthesis.cancel(); } catch (e) {} break;
    case 'cook-ings': S.cook.showIngs = !S.cook.showIngs; renderCook(); break;
    case 'f-quick': S.filters.quick = !S.filters.quick; render(); break;
    case 'look': { const L = getLook(); L[b.dataset.k] = v; applyLook(L); render(); break; }
    case 'bl-cat': top.cat = v; renderSheet(true, true); break;
    case 'more-filters': S.moreFilters = S.moreFilters || {}; S.moreFilters[v] = !S.moreFilters[v]; if (v === 'p-') renderSheet(true, true); else render(); break;
    case 'clear-filters': { const o = v === 'p-' ? S.pick : S.filters; ['category', 'rated', 'kcal', 'cuisine', 'protein', 'quick'].forEach(k => { o[k] = k === 'quick' ? false : ''; }); if (v === 'p-') renderSheet(true, true); else render(); break; }
    case 'f-cuisine': case 'f-protein': case 'f-category': case 'f-kcal': case 'f-rated': case 'f-meal': { const k = a.slice(2); S.filters[k] = S.filters[k] === v ? '' : v; render(); break; }
    case 'p-cuisine': case 'p-protein': case 'p-category': case 'p-kcal': case 'p-rated': { const k = a.slice(2); S.pick[k] = S.pick[k] === v ? '' : v; renderSheet(true, true); break; }
    case 'expand': S.expanded[v] = !S.expanded[v]; render(); break;
    case 'tick': mutateWeek(w => { w.checked[v] = !w.checked[v]; }); break;
    case 'tick-extra': mutateWeek(w => { w.extras[Number(v)].done = !w.extras[Number(v)].done; }); break;
    case 'del-extra': mutateWeek(w => { w.extras.splice(Number(v), 1); }); break;
    case 'copy-list': { const w = currentWeek(); const list = weekList(w, simulate(w, ctx()), ctx()); copyText(listText(list, w), 'List copied. Paste it into Notes or WhatsApp.'); break; }
    case 'edit-price': S.tab = 'settings'; S.setPage = 'prices'; S.priceAisle = ''; S.priceQ = ingName(v); S.expanded['p:' + v] = true; render(); window.scrollTo(0, 0); break;
    case 'del-carry': mutateCarry(w => { w.carryIn.splice(Number(v), 1); }); break;
    case 'carry-thaw': mutateCarry(w => { const c = w.carryIn[Number(v)]; c.frozen = false; c.exp = addDays(TODAY > w.start ? TODAY : w.start, 1); }); break;
    case 'reload-carry': mutateWeek(w => { w.carryEdited = false; }); toast('Back to working it out from last week'); break;
    case 'clear-carry': mutateCarry(w => { w.carryIn = []; w.freezerMeals = []; }); toast('Cleared'); break;
    case 'del-fm': mutateCarry(w => { w.freezerMeals.splice(Number(v), 1); }); break;
    case 'pantry': S.pantry.status[v] = b.dataset.s; savePantry(); break;
    case 'pref-del': { const p = clone(S.people.find(x => x.id === v)); p[b.dataset.k].splice(Number(b.dataset.i), 1); S.people = S.people.map(x => x.id === v ? p : x); savePerson(p); render(); break; }
    case 'rm-shop': S.confirm = { ['rmshop:' + v]: true }; render(); break;
    case 'rm-shop-no': S.confirm = {}; render(); break;
    case 'rm-shop-yes': { S.confirm = {}; const t = (S.shopsLog || []).find(x => x.id === v); if (!t) break;
      // sent to Budgie: marked, and the payer's phone takes it off there and then here; otherwise it just goes
      if (t.budgie && t.budgie.state === 'sent' && t.budgie.tid) { S.shopsLog = S.shopsLog.map(x => x.id === v ? { ...x, removed: true } : x); Store.patch('shops/' + v, { removed: true }).then(() => bgSyncShops()).catch(e => { console.warn(e); toast('Couldn\u2019t remove that.'); }); toast('Removed. It comes off in Budgie too.'); }
      else { S.shopsLog = S.shopsLog.filter(x => x.id !== v); Store.del('shops/' + v).catch(e => { console.warn(e); toast('Couldn\u2019t remove that.'); }); toast('Removed'); }
      render(); break; }
    case 'rm-person': S.confirm['rmp:' + v] = true; render(); break;
    case 'rm-person-yes': S.confirm = {}; S.people = S.people.filter(x => x.id !== v); Store.del('people/' + v).catch(() => {}); render(); break;
    case 'eq': { const eq = { ...S.settings.equipment, [v]: S.settings.equipment[v] === false }; saveSettings({ equipment: eq }); break; }
    case 'treat-day': { const d = Number(v); const t = new Set(S.settings.treatDays || []); t.has(d) ? t.delete(d) : t.add(d); saveSettings({ treatDays: Array.from(t).sort() }); break; }
    case 'set-cap': saveSettings({ weeknightCap: Number(v) }); break;
    case 'toggle-staple': saveIng(v, { staple: !S.ING[v].staple }); break;
    case 'new-recipe': pushSheet({ type: 'form' }); break;
    case 'edit-recipe': pushSheet({ type: 'form', id: v }); break;
    case 'rf-more': top.lines = readFormLines(top); top.lines.push({ i: '', q: '', t: '' }); renderSheet(true); break;
    case 'del-recipe': top.confirmDel = true; renderSheet(true); break;
    case 'del-recipe-yes': if (S.RMAP[v] && S.RMAP[v].custom) Store.del('recipes/' + v).catch(() => {}); else save('recipes/' + v, { hidden: true }); closeSheets(); toast('Recipe removed'); break;
    case 'del-photo': delete S.thumbs[v]; delete S.fullPhotos[v]; Store.delG('dishThumbs/' + v).catch(() => {}); Store.delG('dishPhotos/' + v).catch(() => {}); renderSheet(true); schedule(); break;
    case 'timer': startTimer(Number(v), b.dataset.l || 'Timer'); toast(v + ' min timer started'); break;
    case 'timer-stop': S.timers = S.timers.filter(t => t.id !== v); renderCook(); break;
    case 'rate-clear': clearRating(v); toast('Rating cleared'); break;
    case 'rate': {
      const n = Number(b.dataset.n); const cur = S.ratings[v] || {};
      if (cur[myUid()] && cur[myUid()].stars === n) { clearRating(v); toast('Rating cleared'); break; }
      const doc = { ...cur, [myUid()]: { stars: n, name: myName(), at: new Date().toISOString() } };
      S.ratings = { ...S.ratings, [v]: doc }; saveRating(v, doc[myUid()]); schedule(); renderSheet(true);
      toast(n < 3 ? 'Got it. We won\u2019t suggest that again.' : n >= 4 ? 'Noted. It\u2019ll come up more often.' : 'Thanks, rating saved.'); break;
    }
    case 'rate-skip': { const cur = S.ratings[v] || {}; const doc = { ...cur, [myUid()]: { skipped: true, name: myName(), at: new Date().toISOString() } }; S.ratings = { ...S.ratings, [v]: doc }; saveRating(v, doc[myUid()]); schedule(); break; }
    case 'swap-day': {
      if (guardLocked()) break;
      const d = Number(v), w = currentWeek(), day = w.days[d], cur = day.r;
      const skipped = (day.skipped || []).concat(cur ? [cur] : []).slice(-12);
      const sg = suggest(w, d, ctx(), { seed: 'swap' + Math.random(), hard: true, filter: r => r.id !== cur && !skipped.includes(r.id) && (!S.RMAP[cur] || r.cuisine !== S.RMAP[cur].cuisine || Math.random() < 0.3) });
      const pick = sg[0]; if (!pick) { toast('Nothing else fits that day.'); break; }
      mutateWeek(x => { x.days[d] = { r: pick.r.id, auto: true, skipped, ...nightKeep(day) }; });
      toast(DAY_LONG[d] + ': ' + pick.r.title); break;
    }
    case 'move-day': { if (guardLocked()) break; const a = Number(v), t = Number(b.dataset.to); mutateWeek(x => { const tmp = x.days[a]; x.days[a] = x.days[t]; x.days[t] = tmp; }); closeSheets(); toast('Moved to ' + DAY_LONG[t]); break; }
    case 'del-step-photo': { const k = Number(b.dataset.n); const m = { ...(S.stepPhotos[v] || {}) }; delete m[k]; S.stepPhotos[v] = m; Store.delG('stepPhotos/' + v + '__' + k).catch(() => {}); renderSheet(true); break; }
    case 'have': mutateWeek(w => { w.have = { ...(w.have || {}), [v]: true }; }); toast('Taken off the list'); break;
    case 'unhave': mutateWeek(w => { const hv = { ...(w.have || {}) }; delete hv[v]; w.have = hv; }); break;
    case 'set-style': saveSettings({ style: v }); break;
    case 'use-up': S.tab = 'recipes'; S.filters = { q: ingName(v).replace(/\(.*?\)/g, '').trim().split(' ').slice(-2).join(' '), cuisine: '', quick: false, protein: '', category: '', kcal: '', rated: '', meal: '' }; closeSheets(); window.scrollTo(0, 0); render(); break;
    case 'make-staple': { saveIng(v, { staple: true }); toast(ingName(v) + ' added to staples'); break; }
    case 'hide-photo': S.photoPrefs.hidden[v] = true; savePhotoPref(v, true); renderSheet(true); renderCook(); schedule(); toast('Photo hidden for your household'); break;
    case 'unhide-photo': delete S.photoPrefs.hidden[v]; savePhotoPref(v, false); renderSheet(true); renderCook(); schedule(); break;
    case 'retry-lib': S.libError = null; schedule(); loadLibrary(); break;
    // auth & households
    case 'auth-google': withBusy(() => Store.signInGoogle()); break;
    case 'auth-mode': S.authMode = v; S.authMsg = ''; render(); break;
    case 'sign-out': unsubAll(Object.keys(unsub)); S.household = null; S.userDoc = undefined; Store.signOut(); break;
    case 'copy-code': copyText(S.household.inviteCode, 'Invite code copied'); break;
    case 'new-code': Store.newInviteCode(S.household).then(c => toast('New code: ' + c)).catch(() => toast('Couldn’t make a new code. Are you online?')); break;
    case 'hh-other': case 'hh-reset': S.onboard = 'force'; S.hhError = null; render(); break;
    case 'hh-switch': withBusy(async () => { await Store.switchHousehold(S.user, v); S.onboard = 'choose'; if (window.__refreshMe) await window.__refreshMe(); }); break;
    case 'verify-done': S.authMsg = ''; if (window.__recheckAccess) window.__recheckAccess(); break;
    case 'verify-send': withBusy(async () => { await Store.sendVerify(); S.authMsg = 'Sent. Check your inbox (and spam) for the link.'; S.authMsgOk = true; }); break;
    case 'me-retry': if (window.__refreshMe) window.__refreshMe(); break;
    case 'reset-local': if (Store.resetLocal) Store.resetLocal(); break;
    case 'leave': S.confirm.leave = true; render(); break;
    case 'leave-yes': S.confirm = {}; withBusy(() => Store.leaveHousehold(S.user, S.household)); break;
  }
});
document.addEventListener('toggle', e => { const ds = (e.target && e.target.dataset) || {}; if (ds.pgroup) S.expanded['pan:' + ds.pgroup] = e.target.open; if (ds.fold) S.expanded[ds.fold] = e.target.open; }, true);
let blqT = null;
document.addEventListener('input', e => {
  const k = e.target.dataset.input; if (!k) return;
  const keep = (sel) => { const el = $(sel); if (!el) return; el.focus(); try { el.setSelectionRange(pos, pos); } catch (x) {} };
  const pos = e.target.selectionStart;
  if (k === 'rq') { S.filters.q = e.target.value; $('#app').innerHTML = renderTab(); keep('#rq'); }
  if (k === 'makeq') { S.makeQ = e.target.value; $('#app').innerHTML = renderTab(); keep('#makeq'); }
  if (k === 'pq') { S.priceQ = e.target.value; $('#app').innerHTML = renderTab(); keep('#pq'); }
  if (k === 'pantryq') { S.pantryQ = e.target.value; $('#app').innerHTML = renderTab(); keep('#pantryq'); }
  if (k === 'pickq') { S.pick.q = e.target.value; renderSheet(true); keep('#pickq'); }
  if (k === 'blq') { const top = S.sheets[S.sheets.length - 1]; top.q = e.target.value; clearTimeout(blqT); blqT = setTimeout(() => { renderSheet(true); const el = $('#blq'); if (el) { el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch (x) {} } }, 250); }
});
document.addEventListener('change', e => {
  if (e.target.dataset.stepphoto && e.target.files && e.target.files[0]) { const [rid, k] = e.target.dataset.stepphoto.split('|'); addStepPhoto(rid, Number(k), e.target.files[0]); e.target.value = ''; return; }
  if (e.target.dataset.importPhoto && e.target.files && e.target.files[0]) { const f = e.target.files[0]; e.target.value = ''; shrinkPhoto(f, 1600).then(img => importRecipe({ image: img, mime: 'image/jpeg' })).catch(err => toast(err.message)); return; }
  if (e.target.dataset.photo && e.target.files && e.target.files[0]) { addPhoto(e.target.dataset.photo, e.target.files[0]); e.target.value = ''; return; }
  const k = e.target.dataset.change; if (!k) return;
  const v = e.target.dataset.v;
  if (k === 'calmap') { saveSettings({ calMap: { ...(S.settings.calMap || {}), [e.target.dataset.p]: e.target.value } }); calRefresh(true); return; }
  if (k === 'lunch-shifts') { const p = clone(personById(e.target.dataset.p)); p.lunchOnShifts = e.target.checked; S.people = S.people.map(x => x.id === p.id ? p : x); savePerson(p); render(); return; }
  if (k === 'remind') { saveSettings({ remind: { cook: true, defrost: true, plates: true, cookAt: '18:00', ...(S.settings.remind || {}), [e.target.dataset.k]: e.target.checked } }); calSoon(500); render(); return; }
  if (k === 'bg-budget') { saveSettings({ budgieBudget: e.target.value }); return; }
  if (k === 'backup-auto') { Store.merge('config/backup', { auto: e.target.checked }).catch(() => toast('Couldn’t save that.')); return; }
  if (k === 'restore-file') { const file = e.target.files && e.target.files[0]; e.target.value = ''; if (!file) return; file.text().then(t => { let j = null; try { j = JSON.parse(t); } catch (x) {} stageRestore(j, 'the file ' + file.name); }); return; }
  if (k === 'carry-q') { const q = Number(e.target.value); mutateCarry(w => { if (q > 0) w.carryIn[Number(v)].q = q; else w.carryIn.splice(Number(v), 1); }); }
  if (k === 'carry-exp') mutateCarry(w => { w.carryIn[Number(v)].exp = e.target.value || null; });
  if (k === 'pantry-always') { S.pantry.always = { ...(S.pantry.always || { milk: true }), [v]: e.target.checked }; savePantry(); }
  if (k === 'p-kcal' || k === 'p-protein' || k === 'p-plan' || k === 'p-packed' || k === 'p-dinner') {
    const p = clone(personById(v)); if (!p) return;
    if (k === 'p-kcal') p.kcalTarget = Number(e.target.value) || null;
    if (k === 'p-protein') p.proteinTarget = Number(e.target.value) || null;
    if (k === 'p-plan') { const slot = e.target.dataset.s; p.plan = { ...(p.plan || {}), [slot]: e.target.checked }; p.days = { ...(p.days || {}) }; if (!p.days[slot]) p.days[slot] = slot === 'l' ? [0, 1, 2, 3, 4] : [0, 1, 2, 3, 4, 5, 6]; }
    if (k === 'p-packed') p.packed = e.target.checked;
    if (k === 'p-dinner') p.dinner = e.target.checked ? undefined : false;
    S.people = S.people.map(x => x.id === v ? p : x); savePerson(p); render();
  }
  if (k === 'set-staple-budget') { const n = Number(e.target.value); saveSettings({ stapleBudget: n >= 0 ? n : 8 }); }
  if (k === 'set-skipopt') saveSettings({ skipOptional: e.target.checked });
  if (k === 'set-shop') saveSettings({ shop: e.target.value });
  if (k === 'set-loy') saveSettings({ useLoyalty: e.target.checked });
  if (k === 'set-budget') { const n = Number(e.target.value); if (n > 0) saveSettings({ monthlyBudget: n }); }
});
document.addEventListener('submit', e => {
  const f = e.target; const k = f.dataset.form; if (!k) return; e.preventDefault();
  if (k === 'backup-connect') { S.backupDraft = { url: ($('#bk-url') || {}).value, key: ($('#bk-key') || {}).value }; connectBackup(S.backupDraft.url, S.backupDraft.key); return; }
  if (k === 'auth') {
    const email = ($('#au-email') || {}).value, pw = ($('#au-pw') || {}).value, name = ($('#au-name') || {}).value;
    if (S.authMode === 'reset') withBusy(async () => { await Store.resetPassword(email); S.authMsg = 'Check your email for a reset link.'; S.authMsgOk = true; });
    else if (S.authMode === 'signup') withBusy(() => Store.signUpEmail(name, email, pw));
    else withBusy(() => Store.signInEmail(email, pw));
  }
  if (k === 'create') {
    const name = $('#cr-name').value.trim(), me = $('#cr-me').value.trim(), wont = $('#cr-wont').value.split(',').map(s => s.trim()).filter(Boolean);
    withBusy(async () => { await Store.createHousehold(S.user, name, { name: me, wontEat: wont }); S.onboard = 'choose'; if (window.__refreshMe) await window.__refreshMe(); });
  }
  if (k === 'join') { const code = $('#jn-code').value, me = $('#jn-name').value.trim(); withBusy(async () => { await Store.joinHousehold(S.user, code, me); S.onboard = 'choose'; if (window.__refreshMe) await window.__refreshMe(); }); }
  if (k === 'hh-rename') { const n = $('#hh-name').value.trim(); if (n) Store.renameHousehold(S.user, S.household, n).then(() => toast('Renamed')).catch(() => toast('Couldn’t rename.')); }
  if (k === 'import-url') { const u = $('#imp-url').value.trim(); if (!/^https?:\/\//i.test(u)) { toast('Paste a web link that starts with https://'); return; } importRecipe({ url: u }); return; }
  if (k === 'bg-link') { const c = bgParseLink($('#bg-url').value); if (!c) { toast('That isn\u2019t a Peckish link from Budgie. In Budgie, go to Settings, then Linked apps, and tap Link Peckish.'); return; } bgLink(c); return; }
  if (k === 'logshop') {
    const amt = Number($('#ls-amt').value); if (!(amt > 0)) { toast('Enter what you paid, e.g. 48.20'); return; }
    const who = (document.querySelector('input[name="ls-who"]:checked') || {}).value || (mePerson() || S.people[0] || {}).id, split = $('#ls-split') ? $('#ls-split').checked : false;
    logShop(amt, $('#ls-shop').value, who, split); toast('Logged ' + fmtMoney(amt) + (split ? ', half each' : '') + (S.bg.cfg ? '. Sending to Budgie\u2026' : '')); return;
  }
  if (k === 'extra') { const n = $('#extra-name').value.trim(); if (!n) return; mutateWeek(w => { w.extras.push({ id: 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), o: Date.now(), name: n, done: false }); }); }
  if (k === 'carry-add') {
    const i = $('#ca-i').value, q = Number($('#ca-q').value), fr = $('#ca-f').checked, ex = $('#ca-e').value;
    if (!i || !(q > 0)) { toast('Choose an ingredient and an amount.'); return; }
    mutateCarry(w => { w.carryIn.push({ i, q, frozen: fr, exp: fr ? null : (ex || null), opened: true }); });
  }
  if (k === 'pref-add') {
    const id = f.dataset.v, key = f.dataset.k, input = f.querySelector('input'); const t = input.value.trim(); if (!t) return;
    const p = clone(S.people.find(x => x.id === id)); p[key] = (p[key] || []).concat(t.split(',').map(s => s.trim()).filter(Boolean));
    S.people = S.people.map(x => x.id === id ? p : x); input.value = ''; savePerson(p); render();
  }
  if (k === 'add-person') {
    const n = $('#np-name').value.trim(); if (!n) return;
    const id = 'p_' + Date.now().toString(36); const p = { id, name: n, order: S.people.length + 1, wontEat: [], dislikes: [], likes: [] };
    S.people = S.people.concat(p); savePerson(p); render();
  }
  if (k === 'paid') {
    const id = f.dataset.v, ing = S.ING[id], val = Number(($('#paid-' + id) || {}).value);
    if (!(val > 0)) { toast('Enter what you paid, e.g. 1.85'); return; }
    const prices = clone(ing.prices || {}); const shop = weekShop(); const old = prices[shop] || {};
    const pack = old.pack || (ing.packs && ing.packs[0]) || 1;
    const isLoy = !!(S.settings.useLoyalty !== false && old.loyalty);
    prices[shop] = { ...old, pack, price: isLoy ? (old.price || val) : val, loyalty: isLoy ? val : (old.loyalty || null), checked: TODAY, est: false, verified: true, src: 'Your receipt', note: '' };
    saveIng(id, { ['prices.' + shop]: prices[shop] }); toast('Saved: ' + ing.name + ' ' + fmtMoney(val));
  }
  if (k === 'prices') {
    const id = f.dataset.v, ing = S.ING[id]; const prices = clone(ing.prices || {}), flat = {};
    for (const s of SHOPS) {
      const g = n => { const el = $('#pe-' + id + '-' + s.id + '-' + n); return el && el.value !== '' ? Number(el.value) : null; };
      const pack = g('pack'), price = g('price'), loy = s.loyalty ? g('loy') : null;
      const old = prices[s.id] || {};
      if (pack == null && price == null) { if (prices[s.id]) flat['prices.' + s.id] = ing.custom ? Store.DEL : { removed: true, checked: TODAY, src: 'Edited in app' }; continue; }
      if (old.pack !== pack || old.price !== price || (s.loyalty && (old.loyalty == null ? null : old.loyalty) !== loy)) flat['prices.' + s.id] = { ...old, pack, price, loyalty: loy, checked: TODAY, est: false, src: 'Edited in app', note: '' };
    }
    if (Object.keys(flat).length) saveIng(id, flat); toast('Prices saved');
  }
  if (k === 'ing-add') {
    const name = $('#ni-name').value.trim(); if (!name) return;
    const id = name.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || ('ing_' + Date.now());
    if (S.ING[id]) { toast('There’s already an ingredient called that.'); return; }
    const packs = $('#ni-packs').value.split(',').map(x => Number(x.trim())).filter(x => x > 0);
    const unit = $('#ni-unit').value; const price = Number($('#ni-price').value);
    const kcal = Number($('#ni-kcal').value), protein = Number($('#ni-protein').value);
    const doc = { name, aisle: $('#ni-aisle').value, unit, packs: packs.length ? packs : [1], keeps: Number($('#ni-keeps').value) || 3, life: Number($('#ni-life').value) || 7,
      freeze: $('#ni-freeze').checked, staple: $('#ni-staple').checked, tags: [], prices: {}, custom: true };
    if (kcal > 0) doc.nut = { per: unit === 'g' || unit === 'ml' ? 100 : 1, kcal, protein: protein || 0, carbs: 0, fat: 0 };
    if (price > 0) doc.prices[S.settings.shop] = { pack: doc.packs[0], price, loyalty: null, checked: TODAY, est: false, src: 'Added in app' };
    RAW.myI[id] = doc; rebuild(); save('ingredients/' + id, doc); toast(name + ' added'); f.reset();
  }
  if (k === 'recipe') {
    const top = S.sheets[S.sheets.length - 1]; const lines = readFormLines(top);
    const ings = lines.filter(l => l.i).map(l => { const o = { i: l.i, q: Number(l.q) || 0, t: l.t || (l.q ? fmtQty(Number(l.q), S.ING[l.i].unit) : '') }; if (l.swap) o.swap = l.swap; const was = f.dataset.v && S.RMAP[f.dataset.v] && S.RMAP[f.dataset.v].ingredients.find(x => x.i === o.i); if (was && was.opt) o.opt = true; return o; });
    const steps = [0, 1, 2, 3, 4, 5, 6, 7].map(k2 => ({ title: $('#rf-stt-' + k2).value.trim(), text: $('#rf-st-' + k2).value.trim() })).filter(s => s.text);
    const title = $('#rf-title').value.trim();
    if (!title || !ings.length || !steps.length) { toast('Add a name, at least one ingredient and one step.'); return; }
    const old = f.dataset.v ? S.RMAP[f.dataset.v] : null;
    const id = old ? old.id : 'my_' + title.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40) + '_' + Date.now().toString(36);
    const equipment = EQUIPMENT.map(x => x[0]).filter(x => $('#rf-eq-' + x).checked);
    const doc = { ...(old || {}), title, icon: $('#rf-icon').value.trim() || '🍽️', cuisine: $('#rf-cuisine').value, category: $('#rf-category').value, protein: $('#rf-protein').value, time: Number($('#rf-time').value) || 30, servings: old ? (old.servings || 2) : 2, equipment, ingredients: ings, steps, tags: old ? (old.tags || []) : [], custom: old ? !!old.custom : true };
    const dr = top.draft; if (!old && dr && dr.source) doc.source = dr.source;
    delete doc.id;
    RAW.myR[id] = doc; rebuild(); save('recipes/' + id, doc); toast(old ? 'Recipe updated' : 'Recipe added'); S.sheets.pop(); renderSheet(true);
  }
});
document.addEventListener('keydown', e => {
  if (S.cook && (e.key === 'ArrowRight' || e.key === ' ')) { const r = S.RMAP[S.cook.id]; if (S.cook.step < r.steps.length - 1) { S.cook.step++; renderCook(); e.preventDefault(); } }
  else if (S.cook && e.key === 'ArrowLeft') { S.cook.step = Math.max(0, S.cook.step - 1); renderCook(); }
  else if (e.key === 'Escape') { if (S.cook) stopCook(); else if (S.sheets.length) popSheet(); }
});
// left open overnight: start the new day fresh (Tonight, this week) when the app comes back
// (checked when the app comes back, and every minute while it's open, waiting until nothing is open or being typed)
function newDayCheck() { if (document.visibilityState === 'visible' && isoDate(new Date()) !== TODAY && !S.cook && !S.sheets.length && !typingIn(document.body)) location.reload(); }
document.addEventListener('visibilitychange', newDayCheck);
// linked apps: check shifts and Budgie when the app comes back to the front (at most every 10 minutes)
document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible') return; if (S.cal.user) calRefresh(); if (S.bg.cfg && Date.now() - S.bg.at > 10 * 60000) bgCall([], false).then(bgSyncShops).catch(() => {}); });
setInterval(newDayCheck, 60000);
document.addEventListener('visibilitychange', async () => { if (S.cook && document.visibilityState === 'visible' && navigator.wakeLock) { try { wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {} } });
window.addEventListener('online', () => { S.online = true; schedule(); if (!S.lib) loadLibrary(); });
window.addEventListener('offline', () => { S.online = false; schedule(); });

// ---------- boot ----------
(function boot() {
  render();
  loadLibrary();
  let userUnsub = null;
  Store.onUser(u => {
    S.authReady = true; S.user = u; S.authMsg = '';
    if (userUnsub) { userUnsub(); userUnsub = null; }
    if (!u) { S.userDoc = undefined; unsubAll(Object.keys(unsub)); render(); return; }
    S.userDoc = undefined; S.access = Store.access ? undefined : 'yes'; render();
    checkAccess(u);
  });
  // Peckish is invite-only: someone signed in whose email isn't on the list sees a calm note instead of the app
  async function checkAccess(u) {
    if (!Store.access) { watchMe(u, 0); return; }
    let a = 'unknown'; try { a = await Store.access(u); } catch (e) {}
    if (S.user !== u) return;
    S.access = a === 'no' || a === 'verify' ? a : 'yes'; render();
    if (S.access === 'yes') watchMe(u, 0);
  }
  window.__recheckAccess = async () => {
    if (!S.user) return;
    let u = S.user; try { if (Store.recheck) u = (await Store.recheck()) || u; } catch (e) {}
    S.user = u; S.access = undefined; render(); checkAccess(u);
  };
  function gotUserDoc(d, meta) {
    // "No household" from this phone's saved copy isn't trusted: ask the server before showing the join page
    if (!d && meta && meta.fromCache) {
      if (S.userDoc === undefined && !gotUserDoc.checking) { gotUserDoc.checking = true; Store.getUser(S.user.uid).then(x => { gotUserDoc.checking = false; gotUserDoc(x); }).catch(e => { gotUserDoc.checking = false; S.userErr = (e && e.code) || 'error'; render(); }); }
      return;
    }
    const prev = S.userDoc && S.userDoc.current;
    S.userDoc = d || null; S.userErr = null;
    const cur = d && d.current;
    if (cur && cur !== prev) { S.hhError = null; S.household = null; subscribeHousehold(cur); }
    // left the household (or never had one): stop following it, so nothing more is read from or written to it
    if (!cur) { unsubAll(['hh', 'recipes', 'ing', 'people', 'settings', 'pantry', 'thumbs', 'photoPrefs', 'ratings', 'week', 'prev', 'thisW', 'nextW', 'backup', 'shops']); S.household = null; curHid = null; S.bg.cfg = null; S.cal.on = false; }
    render();
  }
  // Listen to the signed-in person's record. If loading it fails, try a direct read and keep retrying,
  // rather than treating the person as having no household.
  function watchMe(u, attempt) {
    if (userUnsub) { userUnsub(); userUnsub = null; }
    userUnsub = Store.watchUser(u.uid, gotUserDoc, async e => {
      if (!S.user || S.user.uid !== u.uid) return;
      S.userErr = (e && e.code) || 'error';
      try { const d = await Store.getUser(u.uid); if (S.userDoc === undefined || d) gotUserDoc(d); } catch (x) { render(); }
      if (attempt < 6) setTimeout(() => { if (S.user && S.user.uid === u.uid) watchMe(u, attempt + 1); }, Math.min(15000, 1500 * (attempt + 1)));
    });
  }
  window.__refreshMe = async () => { if (!S.user) return; try { const d = await Store.getUser(S.user.uid); gotUserDoc(d); } catch (e) { S.userErr = (e && e.code) || 'error'; render(); } watchMe(S.user, 0); };
  if (Store.kind === 'firebase' && 'serviceWorker' in navigator && location.protocol === 'https:') {
    // updates: check whenever the app comes back to the screen; when a new version takes over, reload at a calm moment
    const hadController = !!navigator.serviceWorker.controller; let reloading = false;
    navigator.serviceWorker.register('sw.js').then(reg => {
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    }).catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloading) return;
      const calm = () => !S.cook && !S.sheets.length && !(document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName));
      const go = () => { if (reloading) return; if (calm()) { reloading = true; location.reload(); } else setTimeout(go, 5000); };
      go();
    });
  }
})();
