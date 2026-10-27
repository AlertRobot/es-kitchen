// Tenth review: phones side by side on one shared store, with stand-ins for Budgie's Peckish link (as in review9_check.js)
// and for Caledonite's reminders. Exits 1 if anything fails. `node test/review10_check.js 3` runs only test 3.
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
const USERS = { ethan: { uid: 'u_ethan', name: 'Ethan Whitfield', email: 'ethan@example.com' }, sophie: { uid: 'u_sophie', name: 'Sophie Smith', email: 'sophie@example.com' }, mum: { uid: 'u_mum', name: 'Mum', email: 'mum@example.com' },
  dad: { uid: 'u_dad', name: 'Ethan Whitfield Sr', email: 'dad@example.com' }, cousin: { uid: 'u_cousin', name: 'Sophie Jones', email: 'cousin@example.com' } };
const linkFor = who => 'https://alertrobot.github.io/es-kitchen/#connect=' + Buffer.from(JSON.stringify({ u: 'https://script.google.com/macros/s/B/exec', k: KEY[who] })).toString('base64url');

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
  if (opts.cal) w.Store.cal = opts.cal;
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

// Peckish names from a Google sign-in ("Ethan Whitfield"), Budgie's from its own setup ("Ethan")
function fullNames(docs) {
  for (const [id, n] of [['u_ethan', 'Ethan Whitfield'], ['u_sophie', 'Sophie Smith']]) docs.set('households/h1/people/' + id, { ...docs.get('households/h1/people/' + id), name: n });
  docs.set('households/h1', { ...docs.get('households/h1'), memberNames: { u_ethan: 'Ethan Whitfield', u_sophie: 'Sophie Smith', u_mum: 'Mum' } });
  return docs;
}


// ---- a stand-in for Caledonite (src/store.js Store.cal): its people and shifts, and its notify queue shared by every phone ----
function caledonite() {
  const days = []; for (let k = -7; k < 21; k++) days.push(iso(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + k)));
  const C = { data: { household: { dinnerTime: '19:00' }, people: [{ id: 'ethan', name: 'Ethan', email: 'ethan@example.com', settings: { hasShifts: false } }, { id: 'sophie', name: 'Sophie', email: 'sophie@example.com', settings: { hasShifts: true, travelMins: 30 } }],
    calendars: [], shifts: days.map(day => ({ person: 'sophie', day, type: 'late' })), feeds: [] }, q: {}, writes: 0 };
  C.for = email => ({
    onUser(cb) { setTimeout(() => cb({ email, uid: 'c-' + email, name: '' }), 0); return () => {}; }, async signIn() {}, async signOut() {},
    async read() { const D = JSON.parse(JSON.stringify(C.data)); D.me = (D.people.find(x => x.email === email) || {}).id || null; return D; },
    async notify(id, data) {
      const cur = C.q[id]; if (cur && cur.sent) return 'sent';
      const asap = k => k === 'sendAfter' && typeof data[k] === 'number' && data[k] <= Date.now() + 60000 && cur && typeof cur[k] === 'number';
      if (cur && Object.keys(data).every(k => asap(k) || JSON.stringify(cur[k]) === JSON.stringify(data[k]))) return 'same';
      C.q[id] = { ...data, sent: false, created: (cur && cur.created) || Date.now() }; C.writes++; return 'ok';
    },
    async unnotify(id) { const cur = C.q[id]; if (cur && !cur.sent) delete C.q[id]; },
  });
  return C;
}
const goLinked = async P => { await P.act('tab', 'settings', null, 200); await P.act('set-page', 'linked', null, 300); };
const pasteBudgie = async (P, who, ms) => { await goLinked(P); P.d.querySelector('#bg-url').value = linkFor(who); P.d.querySelector('form[data-form="bg-link"]').dispatchEvent(new P.w.Event('submit', { bubbles: true, cancelable: true })); await wait(ms || 3000); };
const shopsOf = docs => [...docs.keys()].filter(k => /^households\/h1\/shops\//.test(k)).map(k => ({ id: k.split('/').pop(), ...docs.get(k) }));
const peopleOf = docs => [...docs.keys()].filter(k => /^households\/h1\/people\//.test(k)).map(k => ({ id: k.split('/').pop(), ...docs.get(k) }));
// before any link: Ethan made the household (Google calls him "Ethan Whitfield") and added Sophie under Who's eating
function fresh(extra) {
  return new Map(Object.entries(JSON.parse(JSON.stringify({
    'users/u_ethan': { households: ['h1'], current: 'h1', names: { h1: 'Home' } },
    'households/h1': { name: 'Home', members: ['u_ethan'], memberNames: { u_ethan: 'Ethan Whitfield' }, inviteCode: 'K7RM2Q' }, 'invites/K7RM2Q': { hid: 'h1' },
    'households/h1/people/u_ethan': { name: 'Ethan Whitfield', uid: 'u_ethan', order: 1 }, 'households/h1/people/p_soph': { name: 'Sophie', order: 2, wontEat: ['mushrooms'] },
    ['households/h1/weeks/' + MON]: planned(), ['households/h1/weeks/' + NEXT]: planned(),
    ...(extra || {}) }))));
}

(async () => {
  // ---- 1. the first link and the first join, on real phones: Ethan links Budgie and Caledonite, Sophie joins and links both ----
  if (!only || only === 1) {
    phones.length = 0;
    const docs = fresh(), B = budgie({ transactions: [{ id: 'tx-e0', date: TODAY_, person: 'ethan', amount: 22, budget: 'e-food', split: 'half', note: 'Tesco', source: '' }, { id: 'tx-s0', date: TODAY_, person: 'sophie', amount: 18, budget: 's-food', split: 'half', note: 'Aldi', source: '' }] }), C = caledonite();
    const E = phone('ethan', docs, B, { budgie: false });
    await wait(4000);
    // a shop each, logged on Ethan's phone before anything was linked
    await E.logShop(40, 'u_ethan', true, 1500); await E.logShop(30, 'p_soph', true, 1500);
    ok(shopsOf(docs).length === 2 && !B.calls, 'before linking: two shops logged, nothing sent anywhere');
    await pasteBudgie(E, 'ethan', 4000);
    ok(B.puts.length === 1 && B.transactions.some(t => t.amount === 40 && t.person === 'ethan'), 'Ethan links Budgie: his own shop goes, once (' + B.puts.join() + ')');
    ok(!B.transactions.some(t => t.amount === 30), '...and Sophie’s waits for her phone');
    const imp = id => shopsOf(docs).filter(t => t.budgie && t.budgie.tid === id).length;
    ok(imp('tx-e0') === 1 && imp('tx-s0') === 1, 'both Budgie food payments come in once each (' + imp('tx-e0') + ', ' + imp('tx-s0') + ')');
    ok(shopsOf(docs).find(t => t.budgie && t.budgie.tid === 'tx-s0').paidBy === 'p_soph', '...and Sophie’s says she paid');
    E.w.Store.cal = C.for('ethan@example.com'); await goLinked(E); await E.act('cal-link', null, null, 9000);
    const q1 = Object.keys(C.q).sort();
    ok(q1.length > 0 && q1.every(id => /^pk-\d{4}-\d{2}-\d{2}-hh1-/.test(id)), 'Ethan links Caledonite: reminders queued with this household’s ids (' + q1.length + ')');
    ok(q1.some(id => /-plate-sophie$/.test(id)) && q1.some(id => /-cook-ethan$/.test(id)), '...Sophie is asked about a plate and Ethan reminded to cook');
    // Sophie joins on her phone, signed in with Google as "Sophie Smith"
    const So = phone('sophie', docs, B, { budgie: false });
    await wait(2500);
    So.d.querySelector('#jn-code').value = 'k7rm2q';
    ok(So.d.querySelector('#jn-name').value === 'Sophie Smith', 'Sophie’s join form has her Google name');
    So.d.querySelector('form[data-form="join"]').dispatchEvent(new So.w.Event('submit', { bubbles: true, cancelable: true }));
    await wait(5000);
    const ppl = peopleOf(docs);
    ok(ppl.length === 2 && (docs.get('households/h1/people/p_soph') || {}).uid === 'u_sophie', 'Sophie joining takes the Sophie Ethan added, no second person (' + ppl.map(p => p.name + ':' + (p.uid || '-')).join(', ') + ')');
    ok(So.d.querySelector('.day') && !/Set up your kitchen/.test(So.d.querySelector('#app').textContent), 'Sophie’s phone opens the household’s week (' + So.d.querySelector('#app').textContent.replace(/\s+/g, ' ').slice(0, 200) + ')');
    const writes0 = C.writes;
    await pasteBudgie(So, 'sophie', 5000);
    ok(B.transactions.filter(t => t.amount === 30 && t.person === 'sophie').length === 1, 'Sophie links Budgie: the shop Ethan logged for her goes into hers, once');
    ok(!twice(B).length && imp('tx-e0') === 1 && imp('tx-s0') === 1, '...nothing sent twice, no payment brought in twice (' + twice(B).join() + ')');
    So.w.Store.cal = C.for('sophie@example.com'); await goLinked(So); await So.act('cal-link', null, null, 9000);
    const q2 = Object.keys(C.q).sort();
    ok(JSON.stringify(q2) === JSON.stringify(q1) && C.writes === writes0, 'Sophie links Caledonite: the same reminders, none doubled or rewritten (' + q2.length + ' vs ' + q1.length + ', ' + (C.writes - writes0) + ' writes)');
    // and from now on each phone's own shops go once
    await So.logShop(12, 'p_soph', true, 3000); await E.logShop(9, 'u_ethan', true, 3000);
    ok(B.transactions.filter(t => t.amount === 12 && t.person === 'sophie').length === 1 && B.transactions.filter(t => t.amount === 9 && t.person === 'ethan').length === 1 && !twice(B).length, 'shops logged afterwards go once each, into the payer’s Budgie');
    await E.act('bg-sync', null, null, 2500); await So.act('bg-sync', null, null, 2500);
    ok(!stuck(docs).length, 'nothing left waiting (' + JSON.stringify(stuck(docs)) + ')');
    await E.act('go-cost', null, null, 400); await So.act('go-cost', null, null, 400);
    console.log('   Ethan sees:', E.lines().join(' || ')); console.log('   Sophie sees:', So.lines().join(' || '));
    ok(![E, So].some(p => p.errs.length), 'no page errors ' + [E, So].map(p => p.errs.join(' | ')).join(''));
  }
  // ---- 2. Ethan's dad, also an Ethan, in the household: never taken for Ethan by Budgie, Caledonite or "who paid" ----
  if (!only || only === 2) {
    phones.length = 0;
    const docs = fresh({ 'households/h1': { name: 'Home', members: ['u_ethan', 'u_sophie', 'u_dad'], memberNames: { u_ethan: 'Ethan Whitfield', u_sophie: 'Sophie Smith', u_dad: 'Ethan Whitfield Sr' }, memberEmails: { u_ethan: 'ethan@example.com', u_sophie: 'sophie@example.com', u_dad: 'dad@example.com' }, inviteCode: 'K7RM2Q' },
      'households/h1/people/p_soph': { name: 'Sophie Smith', uid: 'u_sophie', order: 2 }, 'households/h1/people/u_dad': { name: 'Ethan Whitfield Sr', uid: 'u_dad', order: 3 },
      'users/u_sophie': { households: ['h1'], current: 'h1', names: { h1: 'Home' } }, 'users/u_dad': { households: ['h1'], current: 'h1', names: { h1: 'Home' } } });
    const B = budgie(), C = caledonite();
    const E = phone('ethan', docs, B, { cal: C.for('ethan@example.com') }), So = phone('sophie', docs, B), D = phone('dad', docs, B, { budgie: false });
    E.w.localStorage.setItem('peckish.cal', JSON.stringify(['h1']));
    await wait(4000);
    // Sophie's phone has sent a half-each shop, so Ethan's knows her account as his Budgie partner's; Ethan's has sent one too
    await So.logShop(10, 'p_soph', true, 3000); await E.logShop(11, 'u_ethan', true, 3000);
    // Sophie logs one Dad paid for; Dad logs one he paid for himself
    await So.logShop(50, 'u_dad', true, 2500); await D.logShop(25, 'u_dad', true, 2500);
    await E.act('bg-sync', null, null, 3000);
    ok(!B.transactions.some(t => t.amount === 50 || t.amount === 25), 'shops Dad paid for never go into Ethan’s Budgie (' + B.transactions.map(t => t.person + ':' + t.amount).join(', ') + ')');
    await E.act('go-cost', null, null, 400);
    const l25 = E.lines().filter(l => /25\.00/.test(l)).join(''), l50 = E.lines().filter(l => /50\.00/.test(l)).join('');
    ok(!/Add to my Budgie|goes to Budgie/.test(l25 + l50), '...and Ethan isn’t offered Add to my Budgie for them, nor told they go there (' + l25 + ' | ' + l50 + ')');
    // a payment Ethan logs in Budgie says Ethan paid on every phone
    B.transactions.push({ id: 'tx-e9', date: TODAY_, person: 'ethan', amount: 7, budget: 'e-food', split: 'half', note: 'Lidl', source: '' });
    await E.act('bg-sync', null, null, 2500); await So.act('bg-sync', null, null, 2500);
    const b9 = shopsOf(docs).find(t => t.budgie && t.budgie.tid === 'tx-e9');
    ok(b9 && b9.paidBy === 'u_ethan', 'a Budgie payment of Ethan’s says Ethan paid (' + (b9 && b9.paidBy) + ')');
    // Caledonite: Dad isn't Caledonite's Ethan (no reminders or shifts of Ethan's for him)
    await goLinked(E); await E.act('cal-refresh', null, null, 6000);
    const sel = E.d.querySelector('select[data-change="calmap"][data-p="u_dad"]');
    ok(sel && sel.value === '-', 'Caledonite’s Who’s who leaves Dad as nobody (' + (sel && sel.value) + ')');
    const selE = E.d.querySelector('select[data-change="calmap"][data-p="u_ethan"]');
    ok(selE && selE.value === 'ethan', '...and still finds Ethan by his sign-in email (' + (selE && selE.value) + ')');
    ok(![E, So, D].some(p => p.errs.length), 'no page errors ' + [E, So, D].map(p => p.errs.join(' | ')).join(''));
  }
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails ? 1 : 0);
})();
