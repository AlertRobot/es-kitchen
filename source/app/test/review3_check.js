// Third review's fixes (jsdom + in-memory store). Exits 1 if anything fails.
const { JSDOM } = require('jsdom'); const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../public/index.html', 'utf8').replace(/<script src="(app|firebase-config)\.js[^"]*"><\/script>/g, '');
const lib = fs.readFileSync(__dirname + '/../public/data/library.json', 'utf8');
const bundle = fs.readFileSync(__dirname + '/app.test.js', 'utf8');
const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const now = new Date(); const mon = new Date(now); mon.setDate(now.getDate() - ((now.getDay() + 6) % 7)); const day = k => { const x = new Date(mon); x.setDate(mon.getDate() + k); return x; };
const MON = iso(day(0)), NEXT = iso(day(7)), TODAY_IDX = (now.getDay() + 6) % 7, TODAY = iso(now);
const wait = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (cond, what) => { console.log((cond ? 'ok   ' : 'FAIL ') + what); if (!cond) fails++; };
const only = process.argv[2] ? Number(process.argv[2]) : 0;
function boot(opts) {
  opts = opts || {};
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://x.github.io/es-kitchen/', beforeParse(w) {
    if (opts.pre) w.__preDocs = new Map(Object.entries(JSON.parse(JSON.stringify(opts.pre))));
    for (const k in (opts.local || {})) w.localStorage.setItem(k, opts.local[k]);
    w.fetch = opts.fetch || (async () => ({ ok: true, json: async () => JSON.parse(lib) }));
    w.scrollTo = () => {};
  } });
  const w = dom.window, d = w.document; const errs = []; w.addEventListener('error', e => errs.push(e.message));
  w.console.warn = () => {};
  const s = d.createElement('script'); s.textContent = bundle; d.body.appendChild(s);
  if (opts.cal) w.Store.cal = opts.cal;
  const click = async (sel, ms) => { const el = d.querySelector(sel); if (!el) { console.log('  MISSING', sel); return false; } el.click(); await wait(ms || 250); return true; };
  const act = async (a, v, extra, ms) => { const b = d.createElement('button'); b.dataset.act = a; if (v != null) b.dataset.v = v; Object.assign(b.dataset, extra || {}); d.body.appendChild(b); b.click(); b.remove(); await wait(ms || 250); };
  const submit = async (sel, ms) => { d.querySelector(sel).dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(ms || 400); };
  const type = async (sel, v) => { const el = d.querySelector(sel); el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); await wait(300); const f = d.activeElement; if (f && f.blur) f.blur(); f && f.dispatchEvent(new w.FocusEvent('focusout', { bubbles: true })); await wait(100); };
  const start = async () => { await wait(150); await submit('[data-form="create"]', 600); };
  return { w, d, errs, click, act, submit, start, type };
}
const signedIn = (name) => ({ 'users/u_ethan': { households: ['h1'], current: 'h1', names: { h1: name || 'Home' } },
  'households/h1': { name: name || 'Home', members: ['u_ethan'], memberNames: { u_ethan: 'Ethan' }, inviteCode: 'K7RM2Q' } });

(async () => {
  // ---- 1. nothing anyone else can write (household records, the shared photos, Caledonite, Budgie) becomes markup ----
  if (!only || only === 1) {
    const P = '1"\'><b class="xss">x</b>';
    const dayIs = k => k === TODAY_IDX;
    const days = {}; for (let k = 0; k < 7; k++) days['d' + k] = k === 5 ? { takeaway: true, was: 'my_x' } : k === 6 ? {} : k === 3 ? { r: 'am_double_smash_burgers', freezer: true } : { r: 'my_x', guests: P, extra: P, extraUse: P };
    const pre = {
      'users/u_ethan': { households: ['h1', 'h2'], current: 'h1', names: { h1: P, h2: P } },
      'households/h1': { name: P, members: ['u_ethan'], memberNames: { u_ethan: P, u_x: P }, inviteCode: P, memberEmails: { u_ethan: P } },
      'households/h1/people/u_ethan': { name: 'Ethan', uid: 'u_ethan', order: 1, wontEat: [P], dislikes: [P], likes: [P], kcalTarget: P, proteinTarget: P, portion: P, plan: { b: true, l: true }, usual: { b: ['my_x', P], l: ['lo'] }, days: { b: [0, 1, 2, 3, 4, 5, 6], l: [0, 1, 2, 3, 4] }, packed: true },
      'households/h1/people/p_s': { name: P, order: 2, wontEat: [], dislikes: [], likes: [], plan: { b: true }, usual: { b: [P] } },
      'households/h1/recipes/my_x': { title: P, icon: P, cuisine: P, protein: P, category: 'everyday', time: P, servings: 2, equipment: [P], meal: 'dinner', custom: true, tags: [P], airFryer: P, batch: P, short: P,
        ingredients: [{ i: 'ing_x', q: P, t: P, swap: P }, { i: 'beef_mince', q: 400, t: P }, { i: P, q: 1, t: P }], steps: [{ title: P, text: P + ' 10 minutes' }, P], source: { title: P, site: P, author: P, url: P, match: P } },
      'households/h1/recipes/my_l': { title: P, icon: P, cuisine: 'British', protein: 'veggie', time: 5, servings: 1, equipment: [], meal: 'lunch', custom: true, keepsDays: P, packable: true,
        ingredients: [{ i: 'ing_x', q: 1, t: P }], steps: [{ title: '', text: P }] },
      ['households/h1/recipes/my_q"\'><b class="xss">']: { title: 'Odd id', icon: 'x', cuisine: 'British', protein: 'veggie', time: 5, servings: 2, equipment: [], custom: true, ingredients: [{ i: 'beef_mince', q: 100 }], steps: [{ text: 'Cook' }] },
      'households/h1/ingredients/ing_x': { name: P, aisle: P, unit: P, packs: [P], keeps: P, life: P, freeze: true, staple: true, tags: [P], custom: true, separable: P, nut: { per: P, kcal: P, protein: P },
        prices: { tesco: { pack: P, price: P, loyalty: P, checked: P, src: P, label: P, seen: P, conf: P, basis: P, alt: [{ pack: P }] }, aldi: { pack: 1, price: 1, checked: P, src: 'https://x"><b class="xss">/' } }, unlisted: { lidl: true } },
      'households/h1/ingredients/beef_mince': { staple: false, note: P, prices: { tesco: { pack: P, price: P, loyalty: P, checked: '2099-01-01', src: 'Your receipt', label: P, seen: P } } },
      ['households/h1/weeks/' + MON]: { days, carryEdited: true, carryIn: [{ i: 'beef_mince', q: P, exp: P, frozen: false }, { i: 'ing_x', q: P, frozen: true }, { i: 'chicken_breast', q: 300, exp: P }], freezerMeals: [{ r: P, portions: P }, { r: 'my_x', portions: P }],
        extras: { x1: { name: P, done: false, o: 1 } }, checked: { beef_mince: true }, have: { ing_x: true, [P]: true }, votes: { u_ethan: { 0: { r: 'my_x', v: 1 } }, p_s: { 0: { r: 'my_x', v: -1 } } },
        away: { p_s: { 1: P } }, shifts: { u_ethan: { [TODAY_IDX]: { t: P, s: P, e: P, miss: true }, 2: { t: 'long', s: '07:30', e: P, miss: true } } }, plates: {}, updatedBy: P, updated: P, shop: 'tesco',
        bl: { u_ethan: { b: [['my_x', P, 'lo'], null, null, null, null, null, null], l: [[P], ['lo']] } }, bumped: [P, 'my_x'], undoTk: { d: 5, days: [] } },
      ['households/h1/weeks/' + NEXT]: { days: { d0: { r: 'my_x' } }, locked: { by: P, at: P }, extras: [{ name: P }], updatedBy: P },
      ['households/h1/ratings/my_x']: { u_x: { stars: 2, name: P }, [P]: { stars: P, name: P } },
      'households/h1/shops/s1': { date: TODAY.slice(0, 8) + P, amount: P, shop: P, paidBy: 'u_ethan', split: 'half', week: MON, source: 'peckish', by: P, budgie: { state: 'queued', person: P }, note: P },
      'households/h1/shops/s2': { date: TODAY, amount: 5, shop: P, paidBy: 'p_s', split: 'half', week: MON, source: 'budgie', by: P, budgie: { state: 'refused', why: P, person: P }, note: P },
      'households/h1/config/settings': { shop: 'tesco', weeknightCap: P, monthlyBudget: P, stapleBudget: P, freezerSpace: P, treatDays: [P, 4], lateCutoff: P, calMap: { p_s: 'sophie' }, remind: { cookAt: '18:00', cook: true }, style: P, budgieBudget: P, equipment: { [P]: false } },
      'households/h1/config/pantry': { status: { beef_mince: 'low', ing_x: P, [P]: 'low' }, always: { ing_x: true }, checkedOnce: false },
      'households/h1/config/backup': { url: 'https://script.google.com/macros/s/x/exec', key: P, last: P, lastBy: P, lastOk: false, lastTry: P, lastErr: P, sheetUrl: 'javascript:document.body.classList.add("xss")', counts: { Weeks: P, Docs: P }, auto: false },
      'dishThumbs/my_x': { thumb: P, by: P, uid: 'u_other', hid: 'h_other' },
      'dishThumbs/am_double_smash_burgers': { thumb: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', by: P, uid: 'u_other', hid: 'h_other' },
      'stepPhotos/am_double_smash_burgers__0': { img: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', by: P, uid: 'u_other', hid: 'h_other' },
    };
    const CAL = { household: { dinnerTime: P }, people: [{ id: 'ethan', name: 'Ethan', email: 'ethan@example.com', settings: { hasShifts: true, travelMins: P, shiftTypes: { [P]: { start: P, end: P } } } }, { id: 'sophie', name: P, settings: { hasShifts: true } }, { id: P, name: P }],
      calendars: [{ owner: 'ethan', calKey: 'rota', role: 'rota' }], shifts: [{ person: 'ethan', day: iso(day(1)), type: P, start: P, end: P }], feeds: [{ owner: 'ethan', events: [{ t: P, s: day(2).getTime(), e: day(2).getTime() + 9 * 3600e3 }, { ad: true, sd: iso(day(4)), t: P }] }], me: 'ethan' };
    const bgData = { since: 1, me: 'ethan', rows: { people: { ethan: { id: 'ethan', name: P }, sophie: { id: 'sophie', name: P } }, budgets: { b1: { id: 'b1', person: 'ethan', name: P + ' food', account: P } }, transactions: {}, splits: {}, accounts: {} } };
    const A = boot({ pre, local: { 'peckish.cal': 'true', 'peckish.budgie': JSON.stringify({ u: 'https://script.google.com/macros/s/B/exec', k: 'app_peckish_' + 'a'.repeat(64), hid: 'h1' }), 'peckish.budgieData': JSON.stringify(bgData) },
      fetch: async (url, opt) => /script\.google\.com/.test(url) ? { ok: true, json: async () => ({ ok: false, error: P }), text: async () => JSON.stringify({ ok: false, error: P }) } : { ok: true, json: async () => JSON.parse(lib) },
      cal: { onUser(cb) { setTimeout(() => cb({ email: P, uid: 'c1' }), 0); return () => {}; }, async signIn() {}, async signOut() {}, async read() { return JSON.parse(JSON.stringify(CAL)); }, async notify() { return 'ok'; }, async unnotify() {} } });
    const { d } = A; const seen = new Set();
    const ctxs = new Set();
    const check = what => { const els = [...d.querySelectorAll('.xss')]; if (els.length || d.body.classList.contains('xss')) seen.add(what); if (process.env.XSS_DEBUG) els.forEach(e => { const c = (e.parentElement ? e.parentElement.outerHTML : '').replace(/\s+/g, ' ').slice(0, 220); if (!ctxs.has(c)) { ctxs.add(c); console.log('  [' + what + '] ' + c); } }); };
    await wait(3500); check('week');
    const sweep = async (label, fn) => { try { await fn(); } catch (e) { A.errs.push(label + ': ' + e.message); } check(label); };
    await sweep('week bl', async () => { await A.act('week-view', 'bl'); await A.act('bl-person', 'p_s'); await A.act('bl-person', 'u_ethan'); });
    await sweep('bl pick', async () => { await A.act('bl-pick', 'u_ethan|b|0', null, 600); await A.act('sheet-back'); await A.act('bl-pick', 'u_ethan|l|1', null, 600); await A.act('sheet-back'); });
    await A.act('week-view', 'dinners');
    await sweep('recipe sheet', async () => { await A.act('open-day', '0', null, 500); });
    await sweep('recipe form', async () => { await A.act('edit-recipe', 'my_x', null, 400); await A.act('sheet-back'); await A.act('sheet-back'); });
    await sweep('freezer recipe', async () => { await A.act('open-day', '3', null, 500); await A.act('sheet-back'); });
    await sweep('pick sheet', async () => { await A.act('pick', '6', null, 1500); await A.act('more-filters', 'p-', null, 400); await A.act('sheet-back'); });
    await sweep('votes', async () => { await A.act('votes'); await A.act('sheet-back'); });
    await sweep('whosin', async () => { await A.act('whosin'); await A.act('sheet-back'); });
    await sweep('rescue', async () => { await A.act('takeaway', '0', null, 1500); await A.act('sheet-back'); });
    await sweep('cook', async () => { await A.act('cook', 'my_x', null, 300); await A.act('cook-ings'); await A.act('cook-ings'); await A.act('cook-next'); await A.act('cook-close'); });
    await sweep('cook burger', async () => { await A.act('cook', 'am_double_smash_burgers', null, 300); await A.act('cook-close'); });
    await sweep('odd recipe', async () => { await A.act('open-recipe', 'my_q"\'><b class="xss">', null, 400); await A.act('edit-recipe', 'my_q"\'><b class="xss">', null, 300); await A.act('sheet-back'); await A.act('sheet-back'); });
    await sweep('lunch recipe', async () => { await A.act('open-recipe', 'my_l', null, 400); await A.act('sheet-back'); });
    await sweep('next week', async () => { await A.act('wk', '1', null, 600); await A.act('wk', '-1', null, 600); });
    await sweep('recipes', async () => { await A.act('tab', 'recipes', null, 500); await A.act('more-filters', 'f-'); await A.type('#rq', '1'); await A.type('#rq', ''); });
    await sweep('shop', async () => { await A.act('tab', 'shop', null, 500); for (const b of [...d.querySelectorAll('[data-act="expand"]')].map(x => x.dataset.v)) await A.act('expand', b, null, 100); await A.act('share-menu'); });
    await sweep('compare', async () => { await A.act('shop-view', 'compare', null, 400); });
    await sweep('costs', async () => { await A.act('shop-view', 'cost', null, 400); });
    await sweep('kitchen', async () => { await A.act('tab', 'kitchen', null, 400); for (const g of d.querySelectorAll('details')) g.open = true; await wait(100); });
    await sweep('leftovers', async () => { await A.act('kit-view', 'left', null, 400); for (const g of d.querySelectorAll('details')) g.open = true; });
    await sweep('freezer', async () => { await A.act('kit-view', 'freezer', null, 400); });
    await A.act('tab', 'settings', null, 300); check('settings menu');
    for (const pg of ['household', 'people', 'linked', 'planning', 'treats', 'equipment', 'prices', 'history', 'look', 'backup', 'account']) {
      await sweep('settings ' + pg, async () => { await A.act('set-page', pg, null, pg === 'history' ? 800 : 300); if (pg === 'people') { await A.act('set-person', 'p_s'); } if (pg === 'prices') { await A.act('ing-new'); await A.type('#pq', '1"'); await A.act('expand', 'p:ing_x', null, 200); await A.type('#pq', 'mince'); await A.act('expand', 'p:beef_mince', null, 200); await A.type('#pq', ''); await A.act('price-aisle', '_old', null, 200); } });
    }
    await A.act('set-page', 'backup', null, 300);
    ok(!d.querySelector('a[href^="javascript"]'), 'links: a backup sheet address that isn\u2019t a Google Sheet isn\u2019t offered as a link');
    ok(!seen.size, 'markup: nothing written by someone else shows as markup' + (seen.size ? ' (in ' + [...seen].join(', ') + ')' : ''));
    ok(!A.errs.length, 'markup: the app copes with odd values without errors ' + A.errs.slice(0, 5).join(' | '));
  }
  // ---- 2. Budgie and Caledonite stay with the household they were linked in ----
  if (!only || only === 2) {
    const B = { people: [{ id: 'ethan', name: 'Ethan' }], budgets: [{ id: 'e-food', person: 'ethan', name: 'Food' }], transactions: [{ id: 't-abc', date: TODAY, person: 'ethan', amount: 31.4, budget: 'e-food', split: 'half', note: 'Aldi shop' }], splits: [], accounts: [] };
    const posts = [];
    const fetch = async (url, opt) => { if (!/script\.google\.com/.test(url)) return { ok: true, json: async () => JSON.parse(lib) }; posts.push(JSON.parse(opt.body)); return { ok: true, json: async () => ({ ok: true, person: 'ethan', keyType: 'app', now: Date.now(), full: true, rows: B }) }; };
    const reads = [];
    const cal = { onUser(cb) { setTimeout(() => cb({ email: 'ethan@example.com', uid: 'c1' }), 0); return () => {}; }, async signIn() {}, async signOut() {}, async read() { reads.push(1); return { household: {}, people: [{ id: 'ethan', name: 'Ethan', email: 'ethan@example.com', settings: { hasShifts: true } }], calendars: [], shifts: [{ person: 'ethan', day: iso(day(1)), type: 'night' }], feeds: [], me: 'ethan' }; }, async notify() { return 'ok'; }, async unnotify() {} };
    const pre = { 'users/u_ethan': { households: ['h1', 'h2'], current: 'h1', names: { h1: 'Home', h2: 'Mum’s' } },
      'households/h1': { name: 'Home', members: ['u_ethan'], memberNames: { u_ethan: 'Ethan' }, inviteCode: 'K7RM2Q' }, 'households/h1/people/u_ethan': { name: 'Ethan', uid: 'u_ethan', order: 1 },
      'households/h2': { name: 'Mum’s', members: ['u_ethan', 'u_mum'], memberNames: { u_ethan: 'Ethan', u_mum: 'Mum' }, inviteCode: 'MUMMUM' }, 'households/h2/people/u_ethan': { name: 'Ethan', uid: 'u_ethan', order: 1 }, 'households/h2/people/u_mum': { name: 'Mum', uid: 'u_mum', order: 2 } };
    // a link saved before links were kept per household
    const A = boot({ pre, fetch, cal, local: { 'peckish.cal': 'true', 'peckish.budgie': JSON.stringify({ u: 'https://script.google.com/macros/s/B/exec', k: 'app_peckish_' + 'b'.repeat(64) }) } });
    await wait(4500);
    const shopsIn = hid => [...A.w.__docs.keys()].filter(k => k.startsWith('households/' + hid + '/shops/'));
    const shiftsIn = hid => [...A.w.__docs.keys()].filter(k => k.startsWith('households/' + hid + '/weeks/') && (A.w.__docs.get(k) || {}).shifts);
    ok(shopsIn('h1').length === 1 && shiftsIn('h1').length > 0, 'links: in the household they were linked in, Budgie shops and Caledonite shifts come through');
    const n0 = posts.length, r0 = reads.length;
    A.w.__docs.set('users/u_ethan', { ...A.w.__docs.get('users/u_ethan'), current: 'h2' }); await A.w.__refreshMe(); await wait(4500);
    await A.act('bg-sync', null, null, 1500); await A.act('cal-refresh', null, null, 1500);
    ok(posts.length === n0 && shopsIn('h2').every(k => (A.w.__docs.get(k) || {}).source === 'peckish'), 'links: another household you’re in gets none of your Budgie food payments, and sends nothing to your Budgie');
    ok(reads.length === r0 && !shiftsIn('h2').length, 'links: nor your Caledonite shifts');
    await A.act('tab', 'settings', null, 300); await A.act('set-page', 'linked', null, 300);
    ok(!!A.d.querySelector('[data-form="bg-link"]') && !!A.d.querySelector('[data-act="cal-link"]'), 'links: there they show as not linked');
    A.w.__docs.set('users/u_ethan', { ...A.w.__docs.get('users/u_ethan'), current: 'h1' }); await A.w.__refreshMe(); await wait(4500);
    ok(posts.length > n0, 'links: back home, Budgie syncs again');
    ok(JSON.parse(A.w.localStorage.getItem('peckish.budgie')).hid === 'h1', 'links: the old link was kept for the household it was used in');
  }
  // ---- 3. Budgie: only what Budgie took is marked sent or taken off; the rest wait for next time ----
  if (!only || only === 3) {
    const B = { people: [{ id: 'ethan', name: 'Ethan' }], budgets: [{ id: 'e-food', person: 'ethan', name: 'Food' }], transactions: [], splits: [], accounts: [] };
    let posted = null;
    const fetch = async (url, opt) => { if (!/script\.google\.com/.test(url)) return { ok: true, json: async () => JSON.parse(lib) }; const b = JSON.parse(opt.body); if (posted && (b.ops || []).length) return { ok: true, json: async () => ({ ok: false, error: 'Try later' }) }; if ((b.ops || []).length) posted = b.ops;
      const rejected = (b.ops || []).filter(o => o.op === 'delete' && o.id === 't-pk-gone0').map(o => ({ id: o.id, error: 'Locked month' }));
      return { ok: true, json: async () => ({ ok: true, person: 'ethan', keyType: 'app', now: Date.now(), full: false, rows: B, rejected }) }; };
    const pre = signedIn(); pre['households/h1/people/u_ethan'] = { name: 'Ethan', uid: 'u_ethan', order: 1 };
    for (let k = 0; k < 2; k++) pre['households/h1/shops/gone' + k] = { date: TODAY, amount: 10, shop: 'tesco', paidBy: 'u_ethan', source: 'peckish', removed: true, budgie: { state: 'sent', tid: 't-pk-gone' + k, person: 'ethan' } };
    for (let k = 0; k < 45; k++) pre['households/h1/shops/q' + pad(k)] = { date: TODAY, amount: 1, shop: 'tesco', paidBy: 'u_ethan', source: 'peckish', budgie: { state: 'queued', person: 'ethan' } };
    pre['households/h1/shops/zgone'] = { date: TODAY, amount: 10, shop: 'tesco', paidBy: 'u_ethan', source: 'peckish', removed: true, budgie: { state: 'sent', tid: 't-pk-zgone', person: 'ethan' } };
    const A = boot({ pre, fetch, local: { 'peckish.budgie': JSON.stringify({ u: 'https://script.google.com/macros/s/B/exec', k: 'app_peckish_' + 'c'.repeat(64), hid: 'h1' }), 'peckish.budgieData': JSON.stringify({ since: 1, me: 'ethan', rows: { people: { ethan: B.people[0] }, budgets: { 'e-food': B.budgets[0] } } }) } });
    await wait(5000);
    const has = id => A.w.__docs.has('households/h1/shops/' + id);
    ok(posted && posted.length === 40, 'budgie: sends at most 40 at once (' + (posted && posted.length) + ')');
    ok(has('gone0'), 'budgie: a shop Budgie wouldn’t take off stays, so it isn’t left behind in Budgie');
    ok(!has('gone1'), 'budgie: one Budgie took off goes from here');
    ok(has('zgone') && !(posted || []).some(o => o.id === 't-pk-zgone'), 'budgie: one that didn’t fit in this batch waits for the next, rather than going from here only');
    const q = id => (A.w.__docs.get('households/h1/shops/' + id) || {}).budgie || {};
    ok(q('q37').state === 'sent' && q('q44').state === 'queued', 'budgie: only the shops that were sent are marked sent');
  }
  // ---- 4. on a weak signal, a week that hasn't arrived yet can't be planned over ----
  if (!only || only === 4) {
    const pre = signedIn(); pre['households/h1/people/u_ethan'] = { name: 'Ethan', uid: 'u_ethan', order: 1 };
    const theirs = { d0: { r: 'it_tuna_puttanesca' }, d1: { r: 'in_chicken_tikka_masala' } };
    pre['households/h1/weeks/' + MON] = { days: theirs, updatedBy: 'Sophie' };
    const A = boot({ pre }); A.w.__slowWeeks = 2500; await wait(1200);
    const shown = A.d.querySelector('#app').textContent;
    ok(/Loading this week/.test(shown) && !A.d.querySelector('[data-act="fill"]'), 'loading: the week shows as loading, not as an empty week to fill');
    await A.act('fill', null, null, 300); await A.act('pick', '0', null, 200); await A.act('choose', 'it_tuna_puttanesca', null, 200);
    await wait(3500);
    const days = (A.w.__docs.get('households/h1/weeks/' + MON) || {}).days || {};
    ok(days.d0 && days.d0.r === 'it_tuna_puttanesca' && days.d1 && days.d1.r === 'in_chicken_tikka_masala' && Object.keys(days).length === 2, 'loading: a tap meanwhile doesn\u2019t plan over the other phone\u2019s week (' + JSON.stringify(days) + ')');
    ok(A.d.querySelectorAll('.meal .ttl').length === 2, 'loading: then the week shows with their plan');
  }
  // ---- 5. backup sheet: long records split cleanly, and text can't turn into a formula ----
  if (!only || only === 5) {
    const pre = signedIn(); pre['households/h1/people/u_ethan'] = { name: '=HYPERLINK("https://x.example","Ethan")', uid: 'u_ethan', order: 1 };
    for (let k = 0; k < 5; k++) pre['households/h1/recipes/my_long' + k] = { title: 'Long ' + k, icon: '\ud83c\udf72', cuisine: 'British', protein: 'veggie', time: 30, servings: 2, equipment: [], custom: true, ingredients: [{ i: 'onion', q: 1 }], steps: [{ title: '', text: 'x'.repeat(k) + 'a\ud83d\ude00\'=-'.repeat(20000) }] };
    let tables = null;
    const fetch = async (url, opt) => { if (!/script\.google\.com/.test(url)) return { ok: true, json: async () => JSON.parse(lib) }; const b = JSON.parse(opt.body); if (b.action === 'backup') tables = b.tables; return { ok: true, text: async () => JSON.stringify({ ok: true, sheetUrl: 'https://docs.google.com/spreadsheets/d/x' }) }; };
    pre['households/h1/config/backup'] = { url: 'https://script.google.com/macros/s/x/exec', key: 'k', auto: false };
    const A = boot({ pre, fetch }); await wait(1500);
    await A.act('tab', 'settings'); await A.act('set-page', 'backup'); await A.act('backup-now', null, null, 2500);
    const rows = tables ? tables.Docs.rows.filter(r => /my_long/.test(r[1])) : [];
    const byPath = {}; rows.forEach(r => (byPath[r[1]] = byPath[r[1]] || []).push(r));
    const starts = rows.filter(r => r[2] > 1).map(r => r[4].charCodeAt(0));
    ok(rows.length > 5 && starts.every(c => !(c >= 0xdc00 && c <= 0xdfff) && !/[=+\-@']/.test(String.fromCharCode(c))), 'backup: a long record is split without cutting an emoji in two or starting a cell with = + - @ or an apostrophe');
    ok(Object.keys(byPath).length === 5 && Object.keys(byPath).every(pth => { const j = byPath[pth].sort((a, b) => a[2] - b[2]).map(r => r[4]).join(''); try { return JSON.parse(j).steps[0].text.length > 90000; } catch (e) { return false; } }), 'backup: and the pieces join back into the record');
    const vm = require('vm'), gs = {}; vm.createContext(gs); vm.runInContext(fs.readFileSync(__dirname + '/../../../apps-script/Code.gs', 'utf8'), gs);
    ok(gs.cell_('=IMPORTXML("https://x.example")') === '\'=IMPORTXML("https://x.example")' && gs.cell_('-4.5') === '-4.5' && gs.cell_('Ethan') === 'Ethan', 'backup sheet: text that starts like a formula is kept as text');
  }
  // ---- 6. offline with only the phone's copy: a change to who's in keeps that person's other nights ----
  if (!only || only === 6) {
    const pre = signedIn(); pre['households/h1/people/u_ethan'] = { name: 'Ethan', uid: 'u_ethan', order: 1 }; pre['households/h1/people/p_s'] = { name: 'Sophie', order: 2 };
    const copy = { start: MON, days: Array.from({ length: 7 }, () => ({ r: 'it_tuna_puttanesca' })), away: { p_s: { 1: 'dinner' } }, checked: {}, extras: [], bumped: [] };
    const A = boot({ pre, local: { ['esk-wk:h1:' + MON]: JSON.stringify(copy) } }); A.w.__offlineWeeks = true; await wait(1500);
    const outOn = d => { const c = A.d.querySelector('[data-act="who-cycle"][data-n="' + d + '"]'); return c ? [...c.querySelectorAll('i')].map(i => i.className === 'off') : []; };
    ok(outOn(1)[1] === true, 'offline copy: Sophie shows out on Tuesday from the phone\u2019s copy');
    await A.act('whosin'); await A.click('#sheet [data-act="away-cycle"][data-v="p_s"][data-n="3"]', 400); await A.act('sheet-back');
    ok(outOn(3)[1] === true && outOn(1)[1] === true, 'offline copy: marking her out on Thursday keeps her out on Tuesday too (' + JSON.stringify([outOn(1), outOn(3)]) + ')');
    // a week whose record was started by Caledonite's shifts (so it has no start date yet): a tick in the shop keeps the plan
    const B = boot({ pre, local: { ['esk-wk:h1:' + MON]: JSON.stringify({ days: copy.days, shifts: { p_s: {} } }) } }); B.w.__offlineWeeks = true; await wait(1500);
    await B.act('tab', 'shop', null, 400); await B.click('[data-act="tick"]', 400); await B.act('tab', 'week', null, 400);
    ok(B.d.querySelectorAll('.meal .ttl').length === 7, 'offline copy: a tick on a week Caledonite started keeps the plan showing (' + B.d.querySelectorAll('.meal .ttl').length + ')');
  }
  // ---- 7. after leaving a household, nothing more is read from it or written to it ----
  if (!only || only === 7) {
    const B = { people: [{ id: 'ethan', name: 'Ethan' }], budgets: [{ id: 'e-food', person: 'ethan', name: 'Food' }], transactions: [{ id: 't-new', date: TODAY, person: 'ethan', amount: 9, budget: 'e-food', note: 'Tesco' }], splits: [], accounts: [] };
    let posts = 0;
    const fetch = async (url) => { if (!/script\.google\.com/.test(url)) return { ok: true, json: async () => JSON.parse(lib) }; posts++; return { ok: true, json: async () => ({ ok: true, person: 'ethan', keyType: 'app', now: Date.now(), full: true, rows: B }) }; };
    const pre = signedIn(); pre['households/h1/people/u_ethan'] = { name: 'Ethan', uid: 'u_ethan', order: 1 };
    const A = boot({ pre, fetch, local: { 'peckish.budgie': JSON.stringify({ u: 'https://script.google.com/macros/s/B/exec', k: 'app_peckish_' + 'd'.repeat(64), hid: 'h1' }) } });
    await wait(4000);
    [...A.w.__docs.keys()].filter(k => k.includes('/shops/')).forEach(k => A.w.__docs.delete(k));
    A.w.__docs.set('users/u_ethan', { households: [], current: null, names: {} }); await A.w.__refreshMe(); await wait(500);
    const n0 = posts; await A.act('bg-sync', null, null, 1500);
    ok(posts === n0 && ![...A.w.__docs.keys()].some(k => k.includes('/shops/')), 'leaving: Budgie stops syncing into the household you left');
    ok(/Set up your kitchen/.test(A.d.querySelector('#app').textContent), 'leaving: and you\u2019re back at the start');
  }
  // ---- 8. a recipe record can't bring in a picture from another website ----
  if (!only || only === 8) {
    const pre = signedIn(); pre['households/h1/people/u_ethan'] = { name: 'Ethan', uid: 'u_ethan', order: 1 };
    const libR = JSON.parse(lib).recipes.find(r => r.photo && r.photo.url);
    pre['households/h1/recipes/my_pic'] = { title: 'Pixel pie', icon: 'x', cuisine: 'British', protein: 'veggie', time: 20, servings: 2, equipment: [], custom: true, ingredients: [{ i: 'onion', q: 1 }], steps: [{ text: 'Cook' }], photo: { thumb: 'https://tracker.example/t.gif', url: 'https://tracker.example/big.gif', source: 'https://tracker.example/' } };
    pre['households/h1/recipes/' + libR.id] = { ...libR, title: libR.title + ' (ours)', photo: { thumb: 'https://tracker.example/t2.gif', url: 'https://tracker.example/big2.gif' } };
    const A = boot({ pre }); await wait(1500);
    await A.act('tab', 'recipes', null, 500); await A.act('open-recipe', 'my_pic', null, 400); await A.act('sheet-back'); await A.act('open-recipe', libR.id, null, 400);
    const html = A.d.body.innerHTML;
    ok(!/tracker\.example/.test(html), 'photos: a recipe record\u2019s own picture address isn\u2019t loaded');
    ok(html.includes(libR.photo.url.split('?')[0].slice(0, 40)), 'photos: an edited library recipe keeps the library\u2019s photo');
  }
  // ---- 9. a restore waiting to be confirmed doesn't follow you into another household ----
  if (!only || only === 9) {
    const pre = signedIn(); pre['users/u_ethan'] = { households: ['h1', 'h2'], current: 'h1', names: { h1: 'Home', h2: 'Mum\u2019s' } };
    pre['households/h2'] = { name: 'Mum\u2019s', members: ['u_ethan'], memberNames: { u_ethan: 'Ethan' }, inviteCode: 'MUMMUM' };
    const A = boot({ pre }); await wait(1500);
    await A.act('tab', 'settings'); await A.act('set-page', 'backup', null, 300);
    const inp = A.d.querySelector('#restore-file'); const file = { name: 'b.json', text: async () => JSON.stringify({ app: 'Peckish', docs: [{ path: 'ratings/it_tuna_puttanesca', data: { u_ethan: { stars: 5 } } }] }) };
    Object.defineProperty(inp, 'files', { value: [file] }); inp.dispatchEvent(new A.w.Event('change', { bubbles: true })); await wait(500);
    const staged = !!A.d.querySelector('[data-act="restore-yes"]');
    A.w.__docs.set('users/u_ethan', { ...A.w.__docs.get('users/u_ethan'), current: 'h2' }); await A.w.__refreshMe(); await wait(800);
    await A.act('restore-yes', null, null, 800);
    ok(staged && !A.w.__docs.has('households/h2/ratings/it_tuna_puttanesca'), 'restore: one staged in one household isn\u2019t put into another');
  }
  // ---- 10. breakfasts and lunches are saved, so the other phone sees them ----
  if (!only || only === 10) {
    const pre = signedIn(); pre['households/h1/people/u_ethan'] = { name: 'Ethan', uid: 'u_ethan', order: 1, plan: { b: true, l: true }, days: { b: [0, 1, 2, 3, 4, 5, 6], l: [0, 1, 2, 3, 4] } };
    const A = boot({ pre }); await wait(1500); A.w.console.warn = (...a) => A.errs.push(a.map(String).join(' '));
    await A.act('week-view', 'bl', null, 300); await A.act('bl-pick', 'u_ethan|b|0', null, 800);
    const add = A.d.querySelector('#sheet [data-act="bl-add"]:not([data-v="lo"])'), rid = add && add.dataset.v; add && add.click(); await wait(500);
    await A.act('sheet-back'); await A.act('bl-auto', 'u_ethan', null, 1500);
    const wk = A.w.__docs.get('households/h1/weeks/' + MON) || {}, bl = (wk.bl || {}).u_ethan || {};
    const b0 = bl.b && bl.b[0], lunches = bl.l ? Object.keys(bl.l).filter(k => Array.isArray(bl.l[k]) && bl.l[k].length) : [];
    ok(Array.isArray(b0) && b0.includes(rid), 'breakfast: a breakfast added for Monday is saved (' + JSON.stringify(b0) + ')');
    ok(lunches.length === 5, 'lunches: the week\u2019s lunches are saved (' + lunches.length + ' days)');
    ok(!A.errs.some(e => /Nested arrays|Couldn/.test(e)) && !/Couldn/.test(A.d.querySelector('#toast').textContent), 'breakfast & lunch: the database takes them (' + A.errs.slice(0, 2).join(' | ') + ')');
    const here = [...A.d.querySelectorAll('.blday')].map(x => x.textContent);
    const docs = Object.fromEntries([...A.w.__docs.entries()]);
    const B = boot({ pre: docs }); await wait(1500); await B.act('week-view', 'bl', null, 300);
    const cells = [...B.d.querySelectorAll('.blday')].map(x => x.textContent);
    ok(cells.length === 7 && cells.join('|') === here.join('|') && /Weetabix/i.test(cells[0]), 'breakfast & lunch: the other phone shows the same');
  }
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails ? 1 : 0);
})();
