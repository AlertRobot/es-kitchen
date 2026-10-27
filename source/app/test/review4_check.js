// Fourth review's fixes (jsdom + in-memory store). Exits 1 if anything fails. `node test/review4_check.js 3` runs only test 3.
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
    Object.assign(w, opts.win || {});
    w.fetch = opts.fetch || (async () => ({ ok: true, json: async () => JSON.parse(lib) }));
    w.scrollTo = () => {};
  } });
  const w = dom.window, d = w.document; const errs = []; w.addEventListener('error', e => errs.push(e.message));
  w.console.warn = () => {};
  const s = d.createElement('script'); s.textContent = bundle; d.body.appendChild(s);
  if (opts.cal) w.Store.cal = opts.cal;
  const act = async (a, v, extra, ms) => { const b = d.createElement('button'); b.dataset.act = a; if (v != null) b.dataset.v = v; Object.assign(b.dataset, extra || {}); d.body.appendChild(b); b.click(); b.remove(); await wait(ms || 250); };
  const submit = async (sel, ms) => { d.querySelector(sel).dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(ms || 400); };
  const docAt = p => w.__docs.get(p);
  const switchTo = async hid => { w.__docs.set('users/u_ethan', { ...w.__docs.get('users/u_ethan'), current: hid }); await w.__refreshMe(); await wait(3000); };
  return { w, d, errs, act, submit, docAt, switchTo };
}
const R = ['it_tuna_puttanesca', 'in_chicken_tikka_masala', 'br_cottage_pie', 'am_sloppy_joes', 'as_sweet_sour_chicken', 'am_double_smash_burgers', 'am_jambalaya'];
const R2 = ['am_buttermilk_chicken_burger', 'am_philly_cheesesteak', 'am_meatball_subs', 'am_chicken_pot_pie', 'as_chicken_katsu_curry', 'am_bbq_bacon_burger', 'am_mini_meatloaves'];
const planned = list => { const days = {}; (list || R).forEach((r, k) => { days['d' + k] = { r }; }); return { days }; };
const home = (hid, name, extra) => ({ ['households/' + hid]: { name, members: ['u_ethan'], memberNames: { u_ethan: 'Ethan' }, inviteCode: 'C' + hid },
  ['households/' + hid + '/people/u_ethan']: { name: 'Ethan', uid: 'u_ethan', order: 1 }, ...(extra || {}) });

(async () => {
  // ---- 1. Caledonite reminders: each household linked to Caledonite keeps its own; unlinking takes back what's waiting ----
  if (!only || only === 1) {
    const NOTIFS = {}, GONE = []; let writes = 0;
    const CAL = { household: { dinnerTime: '19:00' }, people: [{ id: 'ethan', name: 'Ethan', email: 'ethan@example.com', settings: { hasShifts: true } }], calendars: [],
      shifts: [0, 1, 2, 3, 4, 5, 6].map(k => ({ person: 'ethan', day: iso(day(k)), type: 'night' })), feeds: [], me: 'ethan' };
    const cal = { onUser(cb) { setTimeout(() => cb({ email: 'ethan@example.com', uid: 'c1' }), 0); return () => {}; }, async signIn() {}, async signOut() {}, async read() { return JSON.parse(JSON.stringify(CAL)); },
      async notify(id, data) { writes++; NOTIFS[id] = data; return 'ok'; }, async unnotify(id) { GONE.push(id); delete NOTIFS[id]; } };
    const remind = { remind: { cook: true, defrost: true, plates: true, cookAt: '23:59' } };
    const pre = { 'users/u_ethan': { households: ['h1', 'h2'], current: 'h1', names: { h1: 'Home', h2: 'Mum’s' } },
      ...home('h1', 'Home', { ['households/h1/weeks/' + MON]: planned(), 'households/h1/config/settings': remind }),
      ...home('h2', 'Mum’s', { ['households/h2/weeks/' + MON]: planned(R2), 'households/h2/config/settings': remind }) };
    // a reminder queued before reminders named their household, for a night still to come
    const later = Math.min(6, TODAY_IDX + 1), oldId = 'pk-' + MON + '-' + later + '-cook-ethan';
    NOTIFS[oldId] = { to: 'ethan', kind: 'reminders' };
    const A = boot({ pre, cal, local: { 'peckish.cal': JSON.stringify(['h1', 'h2']), 'peckish.calNotes': JSON.stringify({ [oldId]: 'x' }) } });
    await wait(9000);
    const ids = () => Object.keys(NOTIFS).filter(id => id.startsWith('pk-' + MON + '-'));
    const h1 = ids(); const plate = h1.filter(id => /-plate-/.test(id)), mark = () => h1.map(id => (NOTIFS[id] || {}).title || 'gone').join('|'), h1Text = mark();
    ok(h1.length > 0 && !NOTIFS[oldId] && !h1.some(id => id === 'pk-' + MON + '-' + later + '-cook-ethan'), 'reminders: an old-style reminder is replaced by this household’s own, not sent twice (' + h1.length + ')');
    const w0 = writes; await A.act('tick', 'milk', null, 6500);
    ok(writes === w0 || !plate.length, 'reminders: "save you a plate?" isn’t queued again every time something changes (' + (writes - w0) + ' writes)');
    await A.switchTo('h2'); await A.act('tick', 'milk', null, 7000);
    const both = ids();
    ok(mark() === h1Text, 'reminders: opening another household linked to Caledonite doesn’t replace or take back the first one’s');
    ok(both.length > h1.length, 'reminders: and the second household queues its own alongside (' + (both.length - h1.length) + ')');
    await A.act('tab', 'settings'); await A.act('set-page', 'linked'); await A.act('cal-unlink', null, null, 1500);
    const left = ids();
    ok(mark() === h1Text && left.length === h1.length, 'reminders: unlinking Caledonite in one household takes back its waiting reminders and keeps the other’s (' + left.length + ' of ' + h1.length + ')');
    ok(!A.errs.length, 'reminders: no page errors ' + A.errs.join(' | '));
  }
  // ---- 2. a recipe removed from the library: still on the weeks it was planned in, and can be brought back ----
  if (!only || only === 2) {
    const days = planned().days; days.d1 = { r: 'my_deleted_one' }; // a recipe of yours that's since been deleted
    const pre = { 'users/u_ethan': { households: ['h1'], current: 'h1', names: { h1: 'Home' } }, ...home('h1', 'Home', { ['households/h1/weeks/' + MON]: { days },
      'households/h1/recipes/br_cottage_pie': { ...JSON.parse(lib).recipes.find(r => r.id === 'br_cottage_pie'), title: 'Nan’s cottage pie', short: undefined } }) };
    const A = boot({ pre }); await wait(2500);
    const seg = () => (A.d.querySelector('[data-act="week-view"][data-v="dinners"]') || {}).textContent || '';
    ok(/6\/7/.test(seg()) && !!A.d.querySelector('[data-act="fill"]'), 'removed: a night whose recipe was deleted counts as one still to choose (' + seg() + ')');
    await A.act('fill', null, null, 6000);
    const n1 = ((A.docAt('households/h1/weeks/' + MON).days || {}).d1 || {}).r;
    ok(!!n1 && n1 !== 'my_deleted_one' && !!JSON.parse(lib).recipes.find(r => r.id === n1), 'removed: and "Fill the rest" gives it a dinner (' + n1 + ')');
    for (const id of ['it_tuna_puttanesca', 'br_cottage_pie']) { await A.act('open-recipe', id, null, 400); await A.act('del-recipe', id, null, 300); await A.act('del-recipe-yes', id, null, 600); }
    const titles = () => [...A.d.querySelectorAll('.meal .ttl')].map(x => x.textContent).join(' | ');
    ok(/Tuna puttanesca/.test(titles()) && /Nan.s cottage pie/i.test(titles()), 'removed: dinners already planned stay on the week (' + titles().slice(0, 80) + ')');
    const pie = A.docAt('households/h1/recipes/br_cottage_pie') || {};
    ok(pie.hidden === true && /Nan/.test(pie.title || ''), 'removed: your edits to a library recipe are kept when it’s removed');
    const search = async q => { const el = A.d.querySelector('#rq'); el.value = q; el.dispatchEvent(new A.w.Event('input', { bubbles: true })); await wait(300); const f = A.d.activeElement; if (f && f.blur) f.blur(); if (f) f.dispatchEvent(new A.w.FocusEvent('focusout', { bubbles: true })); await wait(100); };
    await A.act('tab', 'recipes', null, 500); await search('tuna');
    const listed = () => [...A.d.querySelectorAll('.vcard')].map(x => x.dataset.v);
    ok(!listed().includes('it_tuna_puttanesca') && /you removed/.test(A.d.querySelector('#app').textContent), 'removed: it isn’t listed, and the page says how many you removed');
    await A.act('show-hidden', null, null, 300);
    ok(listed().includes('it_tuna_puttanesca'), 'removed: "Show them" lists it');
    await A.act('open-recipe', 'it_tuna_puttanesca', null, 400);
    ok(!!A.d.querySelector('[data-act="restore-recipe"]'), 'removed: its page offers to bring it back');
    await A.act('restore-recipe', 'it_tuna_puttanesca', null, 600); await A.act('sheet-back');
    await A.act('open-recipe', 'br_cottage_pie', null, 400); await A.act('restore-recipe', 'br_cottage_pie', null, 600); await A.act('sheet-back');
    const pie2 = A.docAt('households/h1/recipes/br_cottage_pie') || {};
    ok(!A.docAt('households/h1/recipes/it_tuna_puttanesca') && !pie2.hidden && /Nan/.test(pie2.title || '') && !('removed' in pie2), 'removed: bringing them back keeps your edits');
    await A.act('show-hidden', null, null, 300); await search('tuna'); const t1 = listed(); await search('cottage'); const t2 = listed();
    ok(t1.includes('it_tuna_puttanesca') && t2.includes('br_cottage_pie'), 'removed: and they’re back in the library');
    await A.act('edit-recipe', 'it_tuna_puttanesca', null, 400); A.d.querySelector('#rf-title').value = 'Ethan’s puttanesca'; await A.submit('[data-form="recipe"]', 600);
    await A.act('tab', 'week', null, 500);
    ok(/Ethan.s puttanesca/.test(titles()), 'recipes: a library recipe you rename shows its new name on the week (' + titles().slice(0, 40) + ')');
    ok(!A.errs.length, 'removed: no page errors ' + A.errs.join(' | '));
  }
  // ---- 3. no signal and a week this phone has never fetched: it isn't planned over the other phone's plan by accident ----
  if (!only || only === 3) {
    const A = boot({ win: { __noCache: true } }); await wait(150); await A.submit('[data-form="create"]', 1500);
    const txt = () => A.d.querySelector('#app').textContent, days = () => Object.keys((A.docAt('households/h1/weeks/' + MON) || {}).days || {}).length;
    ok(/hasn.t been able to fetch this week/.test(txt()), 'no signal: the week says it couldn\u2019t be fetched yet');
    await A.act('fill', null, null, 3000);
    ok(days() === 0 && /Plan it anyway/.test(txt()), 'no signal: the first tap on Fill plans nothing and asks again (' + days() + ' nights written)');
    await A.act('fill', null, null, 6000);
    ok(days() > 0, 'no signal: a second tap plans it (' + days() + ' nights)');
    const B = boot(); await wait(150); await B.submit('[data-form="create"]', 1500); await B.act('fill', null, null, 6000);
    ok(Object.keys((B.docAt('households/h1/weeks/' + MON) || {}).days || {}).length > 0 && !/fetch this week/.test(B.d.querySelector('#app').textContent), 'with signal: one tap fills the week as before');
    ok(!A.errs.length && !B.errs.length, 'no signal: no page errors ' + A.errs.concat(B.errs).join(' | '));
  }
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails ? 1 : 0);
})();
