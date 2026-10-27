// Fifth review's fixes (jsdom + in-memory store). Exits 1 if anything fails. `node test/review5_check.js 3` runs only test 3.
const { JSDOM } = require('jsdom'); const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../public/index.html', 'utf8').replace(/<script src="(app|firebase-config)\.js[^"]*"><\/script>/g, '');
const lib = fs.readFileSync(__dirname + '/../public/data/library.json', 'utf8');
const bundle = fs.readFileSync(__dirname + '/app.test.js', 'utf8');
const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const now = new Date(); const mon = new Date(now); mon.setDate(now.getDate() - ((now.getDay() + 6) % 7)); const day = k => { const x = new Date(mon); x.setDate(mon.getDate() + k); return x; };
const MON = iso(day(0));
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
  // ---- 1. joining: the invite code a household was joined with can't be reused by someone who doesn't know it ----
  if (!only || only === 1) {
    const rules = fs.readFileSync(__dirname + '/../firestore.rules', 'utf8').replace(/\/\/.*$/gm, ''), store = fs.readFileSync(__dirname + '/../src/store.js', 'utf8');
    const join = (/match \/households\/\{hid\} \{[\s\S]*?allow update: if ([\s\S]*?);\n/.exec(rules) || [])[1] || '';
    ok(/request\.resource\.data\.joinCode == resource\.data\.inviteCode \+ '\.' \+ request\.auth\.uid/.test(join), 'join rule: the code saved by a joiner names who joined, so it can’t be left there for the next person');
    // the older form (just the code) only counts when it's being written now, never when it was already there
    const legacy = /request\.resource\.data\.joinCode == resource\.data\.inviteCode\s*&&\s*resource\.data\.get\('joinCode', ''\) != resource\.data\.inviteCode/.test(join);
    ok(legacy && !/\|\| \(request\.resource\.data\.joinCode == resource\.data\.inviteCode\s*\n?\s*&& request\.resource\.data\.members/.test(join), 'join rule: an already-saved plain code never lets anyone else in');
    ok(/joinCode: code \+ '\.' \+ user\.uid/.test(store), 'joining saves the code with who used it');
    ok(fs.readFileSync(__dirname + '/../../../firestore.rules', 'utf8') === fs.readFileSync(__dirname + '/../firestore.rules', 'utf8'), 'join rule: both copies of the rules are the same');
  }
  // ---- 2. nobody in "Who's eating" is you: you can say which one is ----
  if (!only || only === 2) {
    const pre = { 'users/u_ethan': { households: ['h1'], current: 'h1', names: { h1: 'Home' } }, 'households/h1': { name: 'Home', members: ['u_ethan'], memberNames: { u_ethan: 'Ethan' }, inviteCode: 'C1' },
      'households/h1/people/p_e': { name: 'Ethan', order: 1 }, 'households/h1/people/p_s': { name: 'Sophie', order: 2 }, ['households/h1/weeks/' + MON]: planned() };
    const A = boot({ pre }); await wait(2500);
    await A.act('tab', 'settings'); await A.act('set-page', 'people', null, 400);
    const picks = [...A.d.querySelectorAll('[data-act="this-is-me"]')].map(b => b.dataset.v);
    ok(picks.includes('p_e') && picks.includes('p_s'), 'who you are: with nobody here linked to your account, Who’s eating asks which one is you (' + picks.join(',') + ')');
    await A.act('this-is-me', 'p_e', null, 500);
    ok((A.docAt('households/h1/people/p_e') || {}).uid === 'u_ethan' && !A.d.querySelector('[data-act="this-is-me"]'), 'who you are: tapping your name links it to your account, and the question goes');
    await A.act('tab', 'week', null, 400); await A.act('vote', '0', { n: '1' }, 400);
    const v = ((A.docAt('households/h1/weeks/' + MON) || {}).votes || {}).p_e || {};
    ok(v[0] && v[0].v === 1, 'who you are: and thumbs up or down then work (' + JSON.stringify(v) + ')');
    ok(!A.errs.length, 'who you are: no page errors ' + A.errs.join(' | '));
  }
  // ---- 3. a recipe of your own that you remove stays on the weeks it's planned in, and can be brought back ----
  if (!only || only === 3) {
    const mine = { title: 'Nan’s stew', custom: true, cuisine: 'British', protein: 'beef', time: 30, servings: 2, icon: '🍲', equipment: ['hob'], ingredients: [{ i: 'onion', q: 1, t: '1' }], steps: [{ title: '', text: 'Stew it.' }] };
    const days = planned().days; days.d1 = { r: 'my_stew' };
    const pre = { 'users/u_ethan': { households: ['h1'], current: 'h1', names: { h1: 'Home' } }, ...home('h1', 'Home', { ['households/h1/weeks/' + MON]: { days }, 'households/h1/recipes/my_stew': mine }) };
    const A = boot({ pre }); await wait(2500);
    await A.act('open-recipe', 'my_stew', null, 400); await A.act('del-recipe', 'my_stew', null, 300); await A.act('del-recipe-yes', 'my_stew', null, 600);
    const titles = () => [...A.d.querySelectorAll('.meal .ttl')].map(x => x.textContent).join(' | ');
    ok(/Nan.s stew/i.test(titles()), 'own recipe removed: the night it’s planned on keeps it (' + titles().slice(0, 60) + ')');
    const rec = A.docAt('households/h1/recipes/my_stew') || {};
    ok(rec.hidden === true && /stew/i.test(rec.title || ''), 'own recipe removed: it’s kept, marked removed');
    await A.act('open-recipe', 'my_stew', null, 400);
    ok(!!A.d.querySelector('[data-act="restore-recipe"]'), 'own recipe removed: its page offers to bring it back');
    await A.act('restore-recipe', 'my_stew', null, 600);
    const back = A.docAt('households/h1/recipes/my_stew') || {};
    ok(!back.hidden && /stew/i.test(back.title || '') && Array.isArray(back.ingredients), 'own recipe removed: bringing it back keeps it whole');
    ok(!A.errs.length, 'own recipe removed: no page errors ' + A.errs.join(' | '));
  }
  // ---- 4. Caledonite: reminders the other phone took back (by unlinking) are put back by this phone ----
  if (!only || only === 4) {
    const NOTIFS = {};
    const CAL = { household: { dinnerTime: '19:00' }, people: [{ id: 'ethan', name: 'Ethan', email: 'ethan@example.com', settings: {} }], calendars: [], shifts: [], feeds: [], me: 'ethan' };
    const pre = { 'users/u_ethan': { households: ['h1'], current: 'h1', names: { h1: 'Home' } }, ...home('h1', 'Home', { ['households/h1/weeks/' + MON]: planned(), 'households/h1/config/settings': { remind: { cook: true, defrost: true, plates: true, cookAt: '23:59' } } }) };
    const A = boot({ pre, cal: calMock(CAL, NOTIFS), local: { 'peckish.cal': JSON.stringify(['h1']) } });
    await wait(9000);
    const first = Object.keys(NOTIFS).length;
    // the other phone unlinks: this household's waiting reminders are taken back from Caledonite
    Object.keys(NOTIFS).forEach(k => delete NOTIFS[k]);
    const real = A.w.Date.now.bind(A.w.Date); A.w.Date.now = () => real() + 3.2 * 3600e3;
    await A.act('tick', 'milk', null, 7000);
    const back = Object.keys(NOTIFS).length;
    ok(first > 0 && back > 0, 'reminders: ones the other phone took back are queued again by this phone a few hours on (' + first + ' then ' + back + ')');
    A.w.Date.now = real;
  }
  // ---- 5. Caledonite: switching household while shifts are being checked still checks the household you switch to ----
  if (!only || only === 5) {
    const NOTIFS = {};
    const CAL = { household: { dinnerTime: '19:00' }, people: [{ id: 'ethan', name: 'Ethan', email: 'ethan@example.com', settings: { hasShifts: true } }], calendars: [],
      shifts: [0, 1, 2, 3, 4, 5, 6].map(k => ({ person: 'ethan', day: iso(day(k)), type: 'night' })), feeds: [], me: 'ethan' };
    const pre = { 'users/u_ethan': { households: ['h1', 'h2'], current: 'h1', names: { h1: 'Home', h2: 'Mum’s' } }, ...home('h1', 'Home'), ...home('h2', 'Mum’s') };
    const A = boot({ pre, cal: calMock(CAL, NOTIFS, { slow: 2500 }), local: { 'peckish.cal': JSON.stringify(['h1', 'h2']) } });
    await wait(3300); await A.switchTo('h2', 9000);
    const sh = ((A.docAt('households/h2/weeks/' + MON) || {}).shifts || {}).u_ethan;
    ok(!!sh && Object.keys(sh).length === 7, 'shifts: the household you switch to while shifts are being checked gets its own (' + JSON.stringify(sh || null).slice(0, 60) + ')');
    ok(!((A.docAt('households/h1/weeks/' + MON) || {}).shifts), 'shifts: and the one you left isn’t given them after you’ve gone');
  }
  // ---- 6. a huge amount of something with several pack sizes doesn't hold up the planner ----
  if (!only || only === 6) {
    const Core = require('../src/core.js');
    const t0 = Date.now(); const packs = Core.choosePacks({ unit: 'g', packs: [400, 250, 100] }, 100000, 'tesco'); const ms = Date.now() - t0;
    ok(ms < 50 && packs.reduce((a, b) => a + b, 0) >= 100000, 'packs: 100kg of something with three pack sizes is worked out at once (' + ms + 'ms, ' + packs.length + ' packs)');
    const usual = Core.choosePacks({ unit: 'g', packs: [500, 250] }, 600, 'tesco');
    ok(usual.slice().sort().join() === '250,500', 'packs: ordinary amounts still get the best mix (' + usual.join('+') + ')');
  }
  // ---- 7. no signal: a dinner added to a week this phone couldn't fetch doesn't blank the other phone's lists ----
  if (!only || only === 7) {
    const A = boot({ win: { __noCache: true } }); await wait(150);
    A.d.querySelector('[data-form="create"]').dispatchEvent(new A.w.Event('submit', { bubbles: true, cancelable: true })); await wait(1500);
    await A.act('add-to-day', '2', { r: 'it_tuna_puttanesca' }, 500);
    const wk = A.docAt('households/h1/weeks/' + MON) || {};
    ok(((wk.days || {}).d2 || {}).r === 'it_tuna_puttanesca' && !('bumped' in wk), 'no signal: adding a dinner writes that night, not an empty "moved from last week" list (' + Object.keys(wk).join(',') + ')');
  }
  // ---- 8. removing a night's dinner keeps the guests coming that night ----
  if (!only || only === 8) {
    const wk = planned(); wk.days.d2.guests = 2;
    const pre = { 'users/u_ethan': { households: ['h1'], current: 'h1', names: { h1: 'Home' } }, ...home('h1', 'Home', { ['households/h1/weeks/' + MON]: wk }) };
    const A = boot({ pre }); await wait(2500);
    await A.act('open-day', '2', null, 400); await A.act('remove-day', '2', null, 500);
    const d2 = ((A.docAt('households/h1/weeks/' + MON) || {}).days || {}).d2 || {};
    ok(!d2.r && d2.guests === 2, 'remove: the dinner goes, the guests stay on their night (' + JSON.stringify(d2) + ')');
    await A.act('pick', '2', null, 1500); const sugg = A.d.querySelector('#sheet [data-act="choose"]'); if (sugg) { sugg.click(); await wait(500); }
    const d2b = ((A.docAt('households/h1/weeks/' + MON) || {}).days || {}).d2 || {};
    ok(!!d2b.r && d2b.guests === 2, 'remove: and whatever is chosen instead is cooked for them too (' + JSON.stringify(d2b) + ')');
    ok(!A.errs.length, 'remove: no page errors ' + A.errs.join(' | '));
  }
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails ? 1 : 0);
})();
