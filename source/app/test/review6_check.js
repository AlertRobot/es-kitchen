// Sixth review's fixes (jsdom + in-memory store). Exits 1 if anything fails. `node test/review6_check.js 3` runs only test 3.
const { JSDOM } = require('jsdom'); const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../public/index.html', 'utf8').replace(/<script src="(app|firebase-config)\.js[^"]*"><\/script>/g, '');
const lib = fs.readFileSync(__dirname + '/../public/data/library.json', 'utf8');
const bundle = fs.readFileSync(__dirname + '/app.test.js', 'utf8');
const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const now = new Date(); const mon = new Date(now); mon.setDate(now.getDate() - ((now.getDay() + 6) % 7)); const day = k => { const x = new Date(mon); x.setDate(mon.getDate() + k); return x; };
const MON = iso(day(0)), TODAY_ = iso(now);
const wait = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (cond, what) => { console.log((cond ? 'ok   ' : 'FAIL ') + what); if (!cond) fails++; };
const only = process.argv[2] ? Number(process.argv[2]) : 0;
function boot(opts) {
  opts = opts || {};
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://x.github.io/es-kitchen/', beforeParse(w) {
    if (opts.pre) w.__preDocs = new Map(Object.entries(JSON.parse(JSON.stringify(opts.pre))));
    for (const k in (opts.local || {})) w.localStorage.setItem(k, opts.local[k]);
    Object.assign(w, opts.win || {});
    w.fetch = opts.fetch || (async () => ({ ok: true, json: async () => JSON.parse(lib) }));
    w.scrollTo = () => {};
  } });
  const w = dom.window, d = w.document; const errs = []; w.addEventListener('error', e => errs.push(e.message));
  w.console.warn = () => {};
  const s = d.createElement('script'); s.textContent = bundle; d.body.appendChild(s);
  if (opts.cal) w.Store.cal = opts.cal;
  const act = async (a, v, extra, ms) => { const b = d.createElement('button'); b.dataset.act = a; if (v != null) b.dataset.v = v; Object.assign(b.dataset, extra || {}); d.body.appendChild(b); b.click(); b.remove(); await wait(ms || 250); };
  const docAt = p => w.__docs.get(p);
  const switchTo = async (hid, ms) => { w.__docs.set('users/u_ethan', { ...w.__docs.get('users/u_ethan'), current: hid }); await w.__refreshMe(); await wait(ms == null ? 3000 : ms); };
  return { w, d, errs, act, docAt, switchTo };
}
const R = ['it_tuna_puttanesca', 'in_chicken_tikka_masala', 'br_cottage_pie', 'am_sloppy_joes', 'as_sweet_sour_chicken', 'am_double_smash_burgers', 'am_jambalaya'];
const planned = list => { const days = {}; (list || R).forEach((r, k) => { days['d' + k] = { r }; }); return { days }; };
const home = (hid, name, extra) => ({ ['households/' + hid]: { name, members: ['u_ethan'], memberNames: { u_ethan: 'Ethan' }, inviteCode: 'C' + hid },
  ['households/' + hid + '/people/u_ethan']: { name: 'Ethan', uid: 'u_ethan', order: 1 }, ...(extra || {}) });
const calMock = (CAL, NOTIFS, opts) => ({ onUser(cb) { setTimeout(() => cb({ email: 'ethan@example.com', uid: 'c1' }), 0); return () => {}; }, async signIn() {}, async signOut() {},
  async read() { if (opts && opts.slow) await wait(opts.slow); return JSON.parse(JSON.stringify(CAL)); },
  async notify(id, data) { NOTIFS[id] = data; return 'ok'; }, async unnotify(id) { delete NOTIFS[id]; } });

(async () => {
  // ---- 1. logging a shop on a phone that doesn't know which person is you never guesses who paid ----
  if (!only || only === 1) {
    const pre = { 'users/u_ethan': { households: ['h1'], current: 'h1', names: { h1: 'Home' } }, 'households/h1': { name: 'Home', members: ['u_ethan'], memberNames: { u_ethan: 'Ethan' }, inviteCode: 'C1' },
      'households/h1/people/p_e': { name: 'Ethan', order: 1 }, 'households/h1/people/p_s': { name: 'Sophie', order: 2 }, ['households/h1/weeks/' + MON]: planned() };
    const A = boot({ pre }); await wait(2500);
    await A.act('go-cost', null, null, 600);
    const radios = [...A.d.querySelectorAll('input[name="ls-who"]')];
    ok(radios.length === 2 && !radios.some(r => r.checked), 'paid by: with nobody here linked to your account, nobody is ticked as the payer');
    const shops = () => [...A.w.__docs.keys()].filter(k => k.startsWith('households/h1/shops/'));
    A.d.querySelector('#ls-amt').value = '23.40'; A.d.querySelector('[data-form="logshop"]').dispatchEvent(new A.w.Event('submit', { bubbles: true, cancelable: true })); await wait(500);
    ok(!shops().length, 'paid by: and a shop isn’t logged as someone’s until you say who paid');
    A.d.querySelector('#ls-amt').value = '23.40'; A.d.querySelector('input[name="ls-who"][value="p_s"]').checked = true;
    A.d.querySelector('[data-form="logshop"]').dispatchEvent(new A.w.Event('submit', { bubbles: true, cancelable: true })); await wait(500);
    ok(shops().length === 1 && A.docAt(shops()[0]).paidBy === 'p_s', 'paid by: once you tap who paid, it’s logged as theirs');
    ok(!A.errs.length, 'paid by: no page errors ' + A.errs.join(' | '));
  }
  // ---- 2. an amount far beyond any shop (a typo, an odd record) can't break or freeze the planner ----
  if (!only || only === 2) {
    const Core = require('../src/core.js');
    const ing = { id: 'x', name: 'X', unit: 'g', packs: [0.1], keeps: 3, life: 7, prices: { tesco: { pack: 0.1, price: 1 } }, aisle: 'Other' };
    const run = sv => { try { const t0 = Date.now(); const s = Core.simulate({ start: MON, days: [{ r: 'r', guests: 20 }], carryIn: [] }, { ING: { x: ing }, RMAP: { r: { id: 'r', title: 'R', time: 10, servings: sv, ingredients: [{ i: 'x', q: 100000 }] } }, people: [{ id: 'a' }, { id: 'b' }], settings: { shop: 'tesco' }, pantry: {} }); return Date.now() - t0 < 2000 && s.buy.rows.length === 1; } catch (e) { return false; } };
    ok(run(2), 'planner: 100kg of something sold in tiny packs is worked out without breaking');
    const mine = { title: 'Odd one', custom: true, cuisine: 'British', protein: 'beef', time: 30, servings: 0.001, icon: '🍲', equipment: ['hob'], ingredients: [{ i: 'onion', q: 1, t: '1' }], steps: [{ title: '', text: 'Cook.' }] };
    const pre = { 'users/u_ethan': { households: ['h1'], current: 'h1', names: { h1: 'Home' } }, ...home('h1', 'Home', { 'households/h1/recipes/my_odd': mine }) };
    const A = boot({ pre }); await wait(2500);
    await A.act('open-recipe', 'my_odd', null, 500);
    const tags = [...A.d.querySelectorAll('#sheet .tag')].map(x => x.textContent).join(' | ');
    ok(/Serves 1\b/.test(tags), 'planner: a recipe saved as serving a tiny fraction counts as serving one (' + tags.slice(0, 60) + ')');
    ok(!A.errs.length, 'planner: no page errors ' + A.errs.join(' | '));
  }
  // ---- 3. Budgie: a shop someone outside your Budgie (family) logs as paid by you waits until you add it ----
  if (!only || only === 3) {
    const B = { people: [{ id: 'ethan', name: 'Ethan' }, { id: 'sophie', name: 'Sophie Smith' }], budgets: [{ id: 'e-food', person: 'ethan', name: 'Food' }], transactions: [{ id: 't-pk-sx-uu_sophie', date: TODAY_, person: 'sophie', amount: 9, budget: 's-food', split: 'half', note: 'Tesco shop (Peckish)', source: 'peckish' }], splits: [], accounts: [] };
    const OPS = [];
    const fetch = async (url, opt) => { if (!/script\.google\.com/.test(url)) return { ok: true, json: async () => JSON.parse(lib) }; const b = JSON.parse(opt.body); (b.ops || []).forEach(o => OPS.push(o));
      return { ok: true, json: async () => ({ ok: true, person: 'ethan', keyType: 'app', now: Date.now(), full: false, rows: B }) }; };
    const shop = (by, extra) => ({ date: TODAY_, amount: 30, shop: 'tesco', paidBy: 'u_ethan', split: 'half', week: MON, source: 'peckish', by: by.n, ...(by.u ? { byUid: by.u } : {}), budgie: { state: 'queued', person: 'ethan' }, ...(extra || {}) });
    const pre = { 'users/u_ethan': { households: ['h1'], current: 'h1', names: { h1: 'Family' } }, ...home('h1', 'Family', {
      'households/h1/people/u_sophie': { name: 'Sophie', uid: 'u_sophie', order: 2 }, 'households/h1/people/u_mum': { name: 'Mum', uid: 'u_mum', order: 3 },
      'households/h1/shops/s_soph': shop({ n: 'Sophie', u: 'u_sophie' }), 'households/h1/shops/s_mum': shop({ n: 'Mum', u: 'u_mum' }), 'households/h1/shops/s_mine': shop({ n: 'Ethan', u: 'u_ethan' }), 'households/h1/shops/s_old': shop({ n: 'Sophie' }), ['households/h1/weeks/' + MON]: planned() }) };
    pre['households/h1'].members = ['u_ethan', 'u_sophie', 'u_mum'];
    const A = boot({ pre, fetch, local: { 'peckish.budgie': JSON.stringify({ u: 'https://script.google.com/macros/s/B/exec', k: 'app_peckish_' + 'e'.repeat(64), hid: 'h1' }), 'peckish.budgieData': JSON.stringify({ since: 1, me: 'ethan', rows: { people: { ethan: B.people[0], sophie: B.people[1] }, budgets: { 'e-food': B.budgets[0] } } }) } });
    await wait(5000);
    const sentIds = () => OPS.filter(o => o.op === 'put').map(o => o.row.id.replace(/-u[A-Za-z0-9_]+$/, ''));
    ok(sentIds().includes('t-pk-s_soph') && sentIds().includes('t-pk-s_mine') && sentIds().includes('t-pk-s_old'), 'budgie: shops you or your Budgie partner logged go to your Budgie by themselves (' + sentIds().join(',') + ')');
    ok(!sentIds().includes('t-pk-s_mum'), 'budgie: one family logged as paid by you doesn\u2019t go into your Budgie by itself');
    await A.act('go-cost', null, null, 600);
    ok(!!A.d.querySelector('[data-act="bg-mine"][data-v="s_mum"]') && /logged by Mum/.test(A.d.querySelector('#app').textContent), 'budgie: it shows who logged it, with Add to my Budgie');
    await A.act('bg-mine', 's_mum', null, 2500);
    ok(sentIds().includes('t-pk-s_mum') && ((A.docAt('households/h1/shops/s_mum') || {}).budgie || {}).state === 'sent', 'budgie: once you add it, it goes');
    ok(!A.errs.length, 'budgie: no page errors ' + A.errs.join(' | '));
  }
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails ? 1 : 0);
})();
