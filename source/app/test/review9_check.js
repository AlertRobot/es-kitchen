// Ninth review: phones side by side on one shared store with a stand-in Budgie (as in review8_check.js).
// behaves like Budgie's Peckish link (each key is one person; it only takes that person's own t-pk- shops into their own
// food budget; it shows each person their own Peckish shops and split payments, and only the partner's split ones).
// Exits 1 if anything fails. `node test/review8_check.js 3` runs only test 3.
const { JSDOM } = require('jsdom'); const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../public/index.html', 'utf8').replace(/<script src="(app|firebase-config)\.js[^"]*"><\/script>/g, '');
const lib = fs.readFileSync(__dirname + '/../public/data/library.json', 'utf8');
const bundle = fs.readFileSync(__dirname + '/app.test.js', 'utf8');
const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const now = new Date(); const mon = new Date(now); mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
const MON = iso(mon), TODAY_ = iso(now);
const wait = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (cond, what) => { console.log((cond ? 'ok   ' : 'FAIL ') + what); if (!cond) fails++; };
const only = process.argv[2] ? Number(process.argv[2]) : 0;
const KEY = { ethan: 'app_peckish_' + 'e'.repeat(64), sophie: 'app_peckish_' + '5'.repeat(64) };
const USERS = { ethan: { uid: 'u_ethan', name: 'Ethan', email: 'ethan@example.com' }, sophie: { uid: 'u_sophie', name: 'Sophie', email: 'sophie@example.com' }, mum: { uid: 'u_mum', name: 'Mum', email: 'mum@example.com' } };

// ---- a stand-in for Budgie's side of the Peckish link (apps-script/Code.gs: appAllowed_, appRowOk_, appSync_) ----
function budgie(opts) {
  opts = opts || {};
  const B = { people: [{ id: 'ethan', name: 'Ethan', partner: 'sophie' }, { id: 'sophie', name: 'Sophie', partner: 'ethan' }],
    budgets: [{ id: 'e-food', person: 'ethan', name: 'Food' }, { id: 's-food', person: 'sophie', name: 'Groceries' }, { id: 'e-fun', person: 'ethan', name: 'Fun' }],
    transactions: opts.transactions || [], puts: [], dels: [], calls: 0 };
  const food = id => { const b = B.budgets.find(x => x.id === id); return !!b && /food|grocer/i.test(b.name); };
  const no = m => { const e = new Error(m); e.refused = true; return e; };
  function one(me, op) {
    const id = String(op.id || (op.row && op.row.id) || '');
    if (op.table !== 'transactions' || !/^t-pk-[A-Za-z0-9_-]+$/.test(id)) throw no('Not allowed with this link');
    const ex = B.transactions.find(t => t.id === id);
    if (!ex && id.length > 500) throw no('That id is too long');
    if (op.op === 'delete') { if (!ex) return; if (ex.person !== me || ex.source !== 'peckish') throw no('Not allowed with this link'); ex.deleted = true; B.dels.push(id); return; }
    const row = { ...(ex || {}), ...op.row };
    if (ex && (ex.person !== me || ex.source !== 'peckish')) throw no('Not allowed with this link');
    if (row.person !== me || row.source !== 'peckish') throw no('Not allowed with this link');
    const bud = B.budgets.find(b => b.id === row.budget);
    if (!bud || bud.person !== me || !/food|grocer/i.test(bud.name)) throw no('Not allowed with this link (only your food budget)');
    if (row.split && row.split !== 'half') throw no('Not allowed with this link (split half each or not at all)');
    if (!(+row.amount > 0 && +row.amount <= 2000)) throw no('Not allowed with this link (amount or date)');
    if (ex) Object.assign(ex, row); else B.transactions.push(row);
    B.puts.push(id);
  }
  function view(me) {
    return B.transactions.filter(t => !t.deleted && (t.person === me ? (!!t.split || t.source === 'peckish') : !!t.split) && (t.source === 'peckish' || food(t.budget)))
      .map(t => ({ id: t.id, date: t.date, person: t.person, amount: t.amount, budget: t.budget, split: t.split || '', note: t.note || '', source: t.source || '' }));
  }
  B.fetch = async (url, o) => {
    if (!/script\.google\.com/.test(url)) return { ok: true, json: async () => JSON.parse(lib) };
    B.calls++;
    const b = JSON.parse(o.body), me = Object.keys(KEY).find(k => KEY[k] === b.key); if (!me) return { ok: true, json: async () => ({ ok: false, error: 'Wrong key' }) };
    const rejected = [];
    (b.ops || []).forEach((op, i) => { try { one(me, op); } catch (e) { rejected.push({ i, table: op.table, id: op.id || (op.row && op.row.id), error: e.message, retry: !e.refused }); } });
    const rows = { people: B.people.map(p => ({ id: p.id, name: p.name })), budgets: B.budgets.filter(x => x.person === me && /food|grocer/i.test(x.name)), transactions: view(me), splits: [], accounts: [] };
    return { ok: true, json: async () => JSON.parse(JSON.stringify({ ok: true, person: me, keyType: 'app', now: Date.now(), full: true, rows, rejected })) };
  };
  return B;
}

// ---- phones sharing one store ----
const phones = [];
function phone(who, docs, B, opts) {
  opts = opts || {};
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://x.github.io/es-kitchen/', beforeParse(w) {
    w.__preDocs = docs; w.__user = USERS[who];
    w.__onWrite = () => phones.forEach(p => { if (p.w !== w && p.w.__notify) p.w.__notify(); });
    const lk = opts.link || (opts.budgie !== false && KEY[who] ? { k: KEY[who] } : null);
    if (lk) w.localStorage.setItem('peckish.budgie', JSON.stringify({ u: 'https://script.google.com/macros/s/B/exec', hid: 'h1', ...lk }));
    w.fetch = (opts.fetch || B.fetch); w.scrollTo = () => {};
  } });
  const w = dom.window, d = w.document; const errs = []; w.addEventListener('error', e => errs.push(e.message));
  w.console.warn = () => {};
  const s = d.createElement('script'); s.textContent = bundle; d.body.appendChild(s);
  const act = async (a, v, extra, ms) => { const b = d.createElement('button'); b.dataset.act = a; if (v != null) b.dataset.v = v; Object.assign(b.dataset, extra || {}); d.body.appendChild(b); b.click(); b.remove(); await wait(ms || 250); };
  // log a shop on this phone's Shop tab, as someone would
  const logShop = async (amount, paidBy, half, ms) => {
    await act('go-cost', null, null, 300);
    d.querySelector('#ls-amt').value = String(amount);
    const r = d.querySelector('input[name="ls-who"][value="' + paidBy + '"]'); if (r) r.checked = true;
    const sp = d.querySelector('#ls-split'); if (sp) sp.checked = !!half;
    d.querySelector('form[data-form="logshop"]').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    await wait(ms || 2500);
  };
  const lines = () => [...d.querySelectorAll('.leftlist .left')].map(x => x.textContent.replace(/\s+/g, ' '));
  const P = { w, d, errs, act, logShop, lines, who };
  phones.push(P); return P;
}
const R = ['it_tuna_puttanesca', 'in_chicken_tikka_masala', 'br_cottage_pie', 'am_sloppy_joes', 'as_sweet_sour_chicken', 'am_double_smash_burgers', 'am_jambalaya'];
const planned = () => { const days = {}; R.forEach((r, k) => { days['d' + k] = { r }; }); return { days }; };
const NEXT = iso(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 7));
function household(extra) {
  const m = new Map(Object.entries(JSON.parse(JSON.stringify({
    'users/u_ethan': { households: ['h1'], current: 'h1', names: { h1: 'Home' } }, 'users/u_sophie': { households: ['h1'], current: 'h1', names: { h1: 'Home' } }, 'users/u_mum': { households: ['h1'], current: 'h1', names: { h1: 'Home' } },
    'households/h1': { name: 'Home', members: ['u_ethan', 'u_sophie', 'u_mum'], memberNames: { u_ethan: 'Ethan', u_sophie: 'Sophie', u_mum: 'Mum' }, inviteCode: 'K7RM2Q' },
    'households/h1/people/u_ethan': { name: 'Ethan', uid: 'u_ethan', order: 1 }, 'households/h1/people/u_sophie': { name: 'Sophie', uid: 'u_sophie', order: 2 }, 'households/h1/people/u_mum': { name: 'Mum', uid: 'u_mum', order: 3 },
    ['households/h1/weeks/' + MON]: planned(), ['households/h1/weeks/' + NEXT]: planned(),
    ...(extra || {}) }))));
  return m;
}
const shopsIn = docs => [...docs.keys()].filter(k => /^households\/h1\/shops\//.test(k)).map(k => ({ id: k.split('/').pop(), ...docs.get(k) }));
const stuck = docs => shopsIn(docs).filter(t => t.budgie && t.budgie.state === 'queued');
const twice = B => B.puts.filter((x, i, a) => a.indexOf(x) !== i);

// Peckish names from a Google sign-in ("Ethan Dunning"), Budgie's from its own setup ("Ethan")
function fullNames(docs) {
  for (const [id, n] of [['u_ethan', 'Ethan Dunning'], ['u_sophie', 'Sophie Smith']]) docs.set('households/h1/people/' + id, { ...docs.get('households/h1/people/' + id), name: n });
  docs.set('households/h1', { ...docs.get('households/h1'), memberNames: { u_ethan: 'Ethan Dunning', u_sophie: 'Sophie Smith', u_mum: 'Mum' } });
  return docs;
}

(async () => {
  // ---- 1. signed in with Google, so named "Ethan Dunning" in Peckish and "Ethan" in Budgie: shops still go ----
  if (!only || only === 1) {
    phones.length = 0;
    const docs = fullNames(household()), B = budgie();
    const E = phone('ethan', docs, B), M = phone('mum', docs, B), So = phone('sophie', docs, B, { budgie: false });
    await wait(4000);
    await E.logShop(40, 'u_ethan', true);
    ok(B.transactions.some(t => t.amount === 40 && t.person === 'ethan'), 'Ethan’s own shop goes into his Budgie (' + JSON.stringify(shopsIn(docs).map(t => t.budgie)) + ')');
    await M.logShop(15, 'u_ethan', true, 1500); await E.act('bg-sync', null, null, 3000);
    const m1 = shopsIn(docs).find(t => t.amount === 15);
    await E.act('go-cost', null, null, 400);
    ok(m1 && !!E.d.querySelector('[data-act="bg-mine"][data-v="' + m1.id + '"]'), 'a shop Mum logged as paid by Ethan offers him Add to my Budgie (' + E.lines().filter(l => /15/.test(l)).join('') + ')');
    if (m1) await E.act('bg-mine', m1.id, null, 3000);
    ok(B.transactions.some(t => t.amount === 15 && t.person === 'ethan'), '...and it goes once he adds it');
    // Sophie logs her own shop on a phone that isn't linked yet: Ethan's phone says it goes from hers, not that she must add it
    await So.logShop(31, 'u_sophie', true, 1500); await E.act('go-cost', null, null, 400);
    const l31 = E.lines().filter(l => /31\.00/.test(l)).join('');
    ok(/goes to Budgie from Sophie Smith.s phone/.test(l31) && !/adds it/.test(l31), 'a shop Sophie logged for herself reads as going from her phone (' + l31 + ')');
    ok(![E, M, So].some(p => p.errs.length), 'no page errors ' + [E, M, So].map(p => p.errs.join(' | ')).join(''));
  }
  // ---- 2. switching to another household and straight back while a shop is on its way to Budgie ----
  if (!only || only === 2) {
    phones.length = 0;
    const docs = household({ 'users/u_ethan': { households: ['h1', 'h2'], current: 'h1', names: { h1: 'Home', h2: 'Mum’s' } },
      'households/h2': { name: 'Mum’s', members: ['u_ethan'], memberNames: { u_ethan: 'Ethan' }, inviteCode: 'MUM234' }, 'households/h2/people/u_ethan': { name: 'Ethan', uid: 'u_ethan', order: 1 } }), B = budgie();
    let slow = 0; const fetch = async (u, o) => { if (slow && /script\.google/.test(u)) await wait(slow); return B.fetch(u, o); };
    const E = phone('ethan', docs, B, { fetch });
    await wait(4000);
    const sw = async hid => { docs.set('users/u_ethan', { ...docs.get('users/u_ethan'), current: hid }); await E.w.__refreshMe(); };
    slow = 1500; E.logShop(26, 'u_ethan', true, 1); await wait(400);
    E.w.__slowShops = 3000; await sw('h2'); await wait(100); await sw('h1'); await wait(2500); E.w.__slowShops = 0; slow = 0;
    await wait(4000); await E.act('bg-sync', null, null, 3000);
    const t = shopsIn(docs).find(x => x.amount === 26);
    ok(t && t.budgie.state === 'sent' && B.transactions.some(x => x.id === t.budgie.tid && !x.deleted), 'the shop is in Peckish and Budgie afterwards (' + JSON.stringify(t && t.budgie) + ' / ' + JSON.stringify(B.transactions.filter(x => x.amount === 26).map(x => x.deleted || false)) + ')');
    ok(!E.errs.length, 'no page errors ' + E.errs.join(' | '));
  }
  // ---- 3. a shop removed on another phone isn't brought back as a scrap by a tap on this one; a marked one still follows Budgie ----
  if (!only || only === 3) {
    phones.length = 0;
    const docs = household(), B = budgie();
    let slow = 0; const fetch = async (u, o) => { if (slow && /script\.google/.test(u)) await wait(slow); return B.fetch(u, o); };
    const E = phone('ethan', docs, B, { fetch }), So = phone('sophie', docs, B, { fetch }), M0 = phone('mum', docs, B);
    await wait(4000);
    await E.logShop(40, 'u_ethan', true, 3000); await M0.logShop(14, 'u_ethan', true, 1500);
    const t = shopsIn(docs).find(x => x.amount === 40), m = shopsIn(docs).find(x => x.amount === 14);
    // Sophie removes both on her phone just as Ethan taps on them (his phone hasn't heard yet)
    docs.delete('households/h1/shops/' + t.id); docs.delete('households/h1/shops/' + m.id);
    await E.act('go-cost', null, null, 300); await E.act('bg-mine', m.id, null, 1500); await E.act('rm-shop-yes', t.id, null, 1500);
    ok(!shopsIn(docs).some(x => x.id === t.id || x.id === m.id), 'a shop removed on another phone doesn’t come back as a scrap (' + JSON.stringify(shopsIn(docs)) + ')');
    // Mum marking a shop brought in from Budgie as hers doesn't stop Ethan's phone following Budgie
    B.transactions.push({ id: 'tx-e1', date: TODAY_, person: 'ethan', amount: 8, budget: 'e-food', split: 'half', note: 'Tesco', source: '' });
    await E.act('bg-sync', null, null, 3000);
    const b1 = shopsIn(docs).find(x => x.budgie && x.budgie.tid === 'tx-e1');
    ok(!!b1, 'a payment in Budgie comes in as a shop');
    if (b1) docs.set('households/h1/shops/' + b1.id, { ...docs.get('households/h1/shops/' + b1.id), okBy: 'u_mum' }); E.w.__notify(); await wait(300);
    B.transactions.find(x => x.id === 'tx-e1').amount = 9; await E.act('bg-sync', null, null, 3000);
    ok(shopsIn(docs).some(x => x.budgie && x.budgie.tid === 'tx-e1' && x.amount === 9), '...and still follows Budgie after someone marks it (' + shopsIn(docs).filter(x => x.budgie && x.budgie.tid === 'tx-e1').map(x => x.amount).join() + ')');
    ok(![E, So, M0].some(p => p.errs.length), 'no page errors ' + [E, So, M0].map(p => p.errs.join(' | ')).join(''));
  }
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails ? 1 : 0);
})();
