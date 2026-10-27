// Seventh review's fixes (jsdom + in-memory store). Exits 1 if anything fails. `node test/review7_check.js 3` runs only test 3.
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
const BG = { 'peckish.budgie': JSON.stringify({ u: 'https://script.google.com/macros/s/B/exec', k: 'app_peckish_' + 'e'.repeat(64), hid: 'h1' }) };
function budgieMock(B, OPS, opts) {
  return async (url, opt) => {
    if (!/script\.google\.com/.test(url)) return { ok: true, json: async () => JSON.parse(lib) };
    const b = JSON.parse(opt.body), rejected = [];
    (b.ops || []).forEach((o, i) => { if (opts && opts.reject) { const r = opts.reject(o, i); if (r) { rejected.push({ i, table: o.table, id: o.id || o.row.id, ...r }); return; } } OPS.push(o); if (o.op === 'put') { const k = B.transactions.findIndex(x => x.id === o.row.id); if (k >= 0) B.transactions[k] = { ...o.row }; else B.transactions.push({ ...o.row }); } });
    const rows = JSON.parse(JSON.stringify(B)); rows.transactions = rows.transactions.filter(t => !t.deleted);
    return { ok: true, json: async () => ({ ok: true, person: 'ethan', keyType: 'app', now: Date.now(), full: true, rows, rejected }) };
  };
}

(async () => {
  // ---- 1. nobody in the household can get a shop into someone else's Budgie by naming themselves after the partner,
  //         by saying someone else logged it, or by marking it "theirs" for them ----
  if (!only || only === 1) {
    const B = { people: [{ id: 'ethan', name: 'Ethan' }, { id: 'sophie', name: 'Sophie Smith' }], budgets: [{ id: 'e-food', person: 'ethan', name: 'Food' }],
      // a shop Sophie's own phone put in Budgie: it names her account
      transactions: [{ id: 't-pk-sx-uu_sophie', date: TODAY_, person: 'sophie', amount: 9, budget: 's-food', split: 'half', note: 'Tesco shop (Peckish)', source: 'peckish' }], splits: [], accounts: [] };
    const OPS = [];
    const shop = (by, extra) => ({ date: TODAY_, amount: 30, shop: 'tesco', paidBy: 'u_ethan', split: 'half', week: MON, source: 'peckish', by: by.n, ...(by.u ? { byUid: by.u } : {}), budgie: { state: 'queued', person: 'ethan' }, ...(extra || {}) });
    const pre = { 'users/u_ethan': { households: ['h1'], current: 'h1', names: { h1: 'Family' } }, ...home('h1', 'Family', {
      // Mum (a family member) has named herself Sophie in Who's eating; Sophie Jr shares Sophie's first name
      'households/h1/people/u_sophie': { name: 'Sophie Smith', uid: 'u_sophie', order: 2 }, 'households/h1/people/u_mum': { name: 'Sophie', uid: 'u_mum', order: 3 }, 'households/h1/people/u_jr': { name: 'Sophie', uid: 'u_jr', order: 4 },
      'households/h1/shops/s_soph': shop({ n: 'Sophie', u: 'u_sophie' }), 'households/h1/shops/s_mum': shop({ n: 'Sophie', u: 'u_mum' }), 'households/h1/shops/s_jr': shop({ n: 'Sophie', u: 'u_jr' }),
      'households/h1/shops/s_okold': shop({ n: 'Sophie', u: 'u_mum' }, { budgie: { state: 'queued', person: 'ethan', ok: 'ethan' } }), 'households/h1/shops/s_okmum': shop({ n: 'Sophie', u: 'u_mum' }, { okBy: 'u_mum' }),
      'households/h1/shops/s_mine': shop({ n: 'Ethan', u: 'u_ethan' }), 'households/h1/shops/s_old': shop({ n: 'Sophie' }), ['households/h1/weeks/' + MON]: planned() }) };
    pre['households/h1'].members = ['u_ethan', 'u_sophie', 'u_mum', 'u_jr'];
    const A = boot({ pre, fetch: budgieMock(B, OPS), local: { ...BG, 'peckish.budgieData': JSON.stringify({ since: 1, me: 'ethan', rows: {} }) } });
    await wait(5000);
    const puts = () => OPS.filter(o => o.op === 'put').map(o => o.row.id);
    const sent = id => puts().some(x => x === 't-pk-' + id || x.startsWith('t-pk-' + id + '-u'));
    ok(sent('s_soph') && sent('s_mine') && sent('s_old'), 'budgie: shops logged by you, by your Budgie partner’s account, or by an older copy go by themselves (' + puts().join(',') + ')');
    ok(!sent('s_mum') && !sent('s_jr'), 'budgie: someone in the household called (or calling themselves) Sophie isn’t taken for your partner');
    ok(!sent('s_okold') && !sent('s_okmum'), 'budgie: an "it’s mine" mark you didn’t make yourself doesn’t send it');
    ok(puts().every(x => /^t-pk-s_[a-z]+-uu_ethan$/.test(x)), 'budgie: what this phone sends names its account');
    await A.act('go-cost', null, null, 600);
    ok(!!A.d.querySelector('[data-act="bg-mine"][data-v="s_mum"]'), 'budgie: a held shop still offers Add to my Budgie');
    await A.act('bg-mine', 's_mum', null, 2500);
    ok(sent('s_mum') && (A.docAt('households/h1/shops/s_mum') || {}).okBy === 'u_ethan' && ((A.docAt('households/h1/shops/s_mum') || {}).budgie || {}).state === 'sent', 'budgie: once you add it yourself, it goes');
    ok(!A.errs.length, 'budgie: no page errors ' + A.errs.join(' | '));
  }
  // ---- 2. a Budgie payment brought in by the other phone, changed in Budgie, is written again as theirs; a restore
  //         carries on past a shop the database won't take back ----
  if (!only || only === 2) {
    const B = { people: [{ id: 'ethan', name: 'Ethan' }, { id: 'sophie', name: 'Sophie' }], budgets: [{ id: 'e-food', person: 'ethan', name: 'Food' }],
      transactions: [{ id: 't-abc', date: TODAY_, person: 'sophie', amount: 33.9, budget: 's-food', split: 'half', note: 'Aldi shop', source: 'app' },
      { id: 't-pk-s_sent', date: TODAY_, person: 'ethan', amount: 20, budget: 'e-food', split: 'half', note: 'Tesco shop (Peckish)', source: 'peckish' }], splits: [], accounts: [] };
    const OPS = [], budgie = budgieMock(B, OPS);
    const fetch = async (url, opt) => {
      if (/script\.google\.com\/macros\/s\/BK/.test(url)) { const b = JSON.parse(opt.body); const r = b.action === 'restore' ? { ok: true, at: '2026-10-26T10:00:00Z', by: 'Ethan', docs: [
        { path: 'shops/s_sent', data: { date: TODAY_, amount: 20, shop: 'tesco', paidBy: 'u_ethan', split: 'half', week: MON, source: 'peckish', by: 'Sophie', byUid: 'u_sophie', budgie: { state: 'queued', person: 'ethan' } } },
        { path: 'config/settings', data: { weeknightCap: 45 } }] } : { ok: true }; return { ok: true, text: async () => JSON.stringify(r) }; }
      return budgie(url, opt);
    };
    const imp = { date: TODAY_, amount: 31.4, shop: 'aldi', note: 'Aldi shop', paidBy: 'u_sophie', split: 'half', week: MON, source: 'budgie', budgie: { state: 'sent', tid: 't-abc', person: 'sophie' }, by: 'Budgie', via: 'sophie', byUid: 'u_sophie' };
    const pre = { 'users/u_ethan': { households: ['h1'], current: 'h1', names: { h1: 'Home' } }, ...home('h1', 'Home', {
      'households/h1/people/u_sophie': { name: 'Sophie', uid: 'u_sophie', order: 2 }, 'households/h1/shops/b_t_abc': imp,
      'households/h1/shops/s_sent': { date: TODAY_, amount: 20, shop: 'tesco', paidBy: 'u_ethan', split: 'half', week: MON, source: 'peckish', by: 'Sophie', byUid: 'u_sophie', budgie: { state: 'sent', tid: 't-pk-s_sent', person: 'ethan' } },
      'households/h1/config/backup': { url: 'https://script.google.com/macros/s/BK/exec', key: 'k', auto: false }, ['households/h1/weeks/' + MON]: planned() }) };
    pre['households/h1'].members = ['u_ethan', 'u_sophie'];
    const A = boot({ pre, fetch, local: { ...BG, 'peckish.budgieData': JSON.stringify({ since: 1, me: 'ethan', rows: {} }) } });
    await wait(5000);
    const d = A.docAt('households/h1/shops/b_t_abc') || {};
    ok(d.amount === 33.9 && d.byUid === 'u_sophie', 'budgie: a payment the other phone brought in follows Budgie, still as theirs (' + d.amount + ', ' + d.byUid + ')');
    await A.act('tab', 'settings', null, 300); await A.act('set-page', 'backup', null, 300);
    await A.act('restore-sheet', null, null, 800); await A.act('restore-yes', null, null, 1200);
    ok(((A.docAt('households/h1/shops/s_sent') || {}).budgie || {}).state === 'sent', 'restore: a shop already in Budgie isn’t put back to waiting (it would go again)');
    ok((A.docAt('households/h1/config/settings') || {}).weeknightCap === 45, 'restore: ...and the rest of the backup still comes back');
    ok(!A.errs.length, 'no page errors ' + A.errs.join(' | '));
  }
  // ---- 3. a shop Budgie couldn't save just then (a hiccup) stays waiting and goes next time ----
  if (!only || only === 3) {
    const B = { people: [{ id: 'ethan', name: 'Ethan' }], budgets: [{ id: 'e-food', person: 'ethan', name: 'Food' }], transactions: [], splits: [], accounts: [] };
    const OPS = []; let hiccup = true;
    const fetch = budgieMock(B, OPS, { reject: (o, i) => hiccup ? (i === 0 ? { error: 'Service Spreadsheets timed out', retry: true } : { error: 'Waiting for an earlier change', retry: true, notTried: true }) : null });
    const shop = id => ({ date: TODAY_, amount: 30 + id.length, shop: 'tesco', paidBy: 'u_ethan', split: 'half', week: MON, source: 'peckish', by: 'Ethan', byUid: 'u_ethan', budgie: { state: 'queued', person: 'ethan' } });
    const pre = { 'users/u_ethan': { households: ['h1'], current: 'h1', names: { h1: 'Home' } }, ...home('h1', 'Home', { 'households/h1/shops/s_a': shop('s_a'), 'households/h1/shops/s_bb': shop('s_bb'), ['households/h1/weeks/' + MON]: planned() }) };
    const A = boot({ pre, fetch, local: { ...BG, 'peckish.budgieData': JSON.stringify({ since: 1, me: 'ethan', rows: {} }) } });
    await wait(5000);
    const st = id => ((A.docAt('households/h1/shops/' + id) || {}).budgie || {}).state;
    ok(st('s_a') === 'queued' && st('s_bb') === 'queued', 'budgie: after a hiccup both shops are still waiting, not marked as turned down (' + st('s_a') + ', ' + st('s_bb') + ')');
    hiccup = false; await A.act('bg-sync', null, null, 2500);
    ok(st('s_a') === 'sent' && st('s_bb') === 'sent' && B.transactions.length === 2, 'budgie: ...and they go on the next sync');
    ok(!A.errs.length, 'no page errors ' + A.errs.join(' | '));
  }
  // ---- 4. History & stats opened just before switching household shows the household you switched to ----
  if (!only || only === 4) {
    const old = iso(day(-21));
    const pre = { 'users/u_ethan': { households: ['h1', 'h2'], current: 'h1', names: { h1: 'Home', h2: 'Mum' } },
      ...home('h1', 'Home', { ['households/h1/weeks/' + MON]: planned(), ['households/h1/weeks/' + old]: planned() }), ...home('h2', 'Mum', { ['households/h2/weeks/' + MON]: planned() }) };
    const A = boot({ pre }); await wait(2500);
    const list0 = A.w.Store.list; A.w.Store.list = rel => list0.call(A.w.Store, rel).then(x => (rel === 'weeks' ? wait(1500) : null).then(() => x));
    await A.act('tab', 'settings', null, 200); await A.act('set-page', 'history', null, 200);
    await A.switchTo('h2', 3500);
    await A.act('tab', 'settings', null, 200); await A.act('set-page', '', null, 100); await A.act('set-page', 'history', null, 2500);
    const rows = A.d.querySelectorAll('.histrow').length;
    ok(rows === 1, 'history: after switching, it shows this household’s weeks, not the last one’s (' + rows + ' weeks)');
    ok(!A.errs.length, 'no page errors ' + A.errs.join(' | '));
  }
  // ---- 5. a shop paid by someone who isn't in Budgie (family) doesn't say it's waiting to go there ----
  if (!only || only === 5) {
    const B = { people: [{ id: 'ethan', name: 'Ethan' }, { id: 'sophie', name: 'Sophie' }], budgets: [{ id: 'e-food', person: 'ethan', name: 'Food' }], transactions: [], splits: [], accounts: [] };
    const pre = { 'users/u_ethan': { households: ['h1'], current: 'h1', names: { h1: 'Home' } }, ...home('h1', 'Home', {
      'households/h1/people/u_mum': { name: 'Mum', uid: 'u_mum', order: 2 }, ['households/h1/weeks/' + MON]: planned(),
      'households/h1/shops/s_m': { date: TODAY_, amount: 25, shop: 'tesco', paidBy: 'u_mum', split: '', week: MON, source: 'peckish', by: 'Mum', byUid: 'u_mum', budgie: { state: 'queued', person: 'mum' } } }) };
    const A = boot({ pre, fetch: budgieMock(B, []), local: { ...BG, 'peckish.budgieData': JSON.stringify({ since: 1, me: 'ethan', rows: {} }) } });
    await wait(4000); await A.act('go-cost', null, null, 600);
    const line = [...A.d.querySelectorAll('.leftlist .left')].map(x => x.textContent).join(' | ');
    ok(/Mum paid/.test(line) && !/Budgie/.test(line), 'budgie: a shop Mum paid says nothing about going to Budgie (' + line.slice(0, 80) + ')');
  }
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails ? 1 : 0);
})();
