// Eighth review: Ethan's and Sophie's phones (and Mum's) side by side on one shared store, with a stand-in Budgie that
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

(async () => {
  // ---- 1. Ethan and Sophie each log shops the other paid for, half each on and off; Mum logs one; Add to my Budgie ----
  if (!only || only === 1) {
    phones.length = 0;
    const docs = household(), B = budgie();
    const E = phone('ethan', docs, B), So = phone('sophie', docs, B), M = phone('mum', docs, B);
    await wait(4000);
    // Ethan pays and logs his own (half each): it goes from his phone
    await E.logShop(40, 'u_ethan', true);
    const e1 = shopsIn(docs).find(t => t.amount === 40);
    ok(e1 && e1.budgie.state === 'sent' && B.transactions.some(t => t.id === e1.budgie.tid && t.person === 'ethan' && t.split === 'half'), 'Ethan’s own shop goes into his Budgie, half each');
    // Sophie logs one Ethan paid, before her phone has ever sent one of its own: Ethan's phone can't yet tell it's her
    await So.logShop(22, 'u_ethan', true, 3000);
    const s1 = shopsIn(docs).find(t => t.amount === 22);
    // Sophie pays and logs her own (half each): it goes from her phone, and so Ethan's phone now knows her account
    await So.logShop(31, 'u_sophie', true, 3000);
    const s2 = shopsIn(docs).find(t => t.amount === 31);
    ok(s2 && s2.budgie.state === 'sent' && B.transactions.some(t => t.id === s2.budgie.tid && t.person === 'sophie'), 'Sophie’s own shop goes into her Budgie');
    await E.act('bg-sync', null, null, 3000);
    const s1b = shopsIn(docs).find(t => t.amount === 22);
    ok(s1b && s1b.budgie.state === 'sent' && B.transactions.some(t => t.id === s1b.budgie.tid && t.person === 'ethan'), 'a shop Sophie logged for Ethan goes into his Budgie by itself once her phone has sent one (' + (s1b && s1b.budgie.state) + ')');
    // Ethan logs one Sophie paid, not split: her phone sends it, not split
    await E.logShop(9.5, 'u_sophie', false, 1500); await So.act('bg-sync', null, null, 3000);
    const e2 = shopsIn(docs).find(t => t.amount === 9.5);
    ok(e2 && e2.budgie.state === 'sent' && B.transactions.some(t => t.id === e2.budgie.tid && t.person === 'sophie' && !t.split), 'a shop Ethan logged for Sophie (not split) goes into hers, not split');
    // Mum logs one Ethan paid: it waits for him; Add to my Budgie sends it once
    await M.logShop(15, 'u_ethan', true, 1500); await E.act('bg-sync', null, null, 3000);
    const m1 = shopsIn(docs).find(t => t.amount === 15);
    ok(m1 && m1.budgie.state === 'queued' && !B.transactions.some(t => t.amount === 15), 'a shop Mum logged as paid by Ethan waits');
    await E.act('go-cost', null, null, 300);
    ok(!!E.d.querySelector('[data-act="bg-mine"][data-v="' + m1.id + '"]'), '...and offers Ethan Add to my Budgie');
    ok(So.lines().some(l => /15/.test(l) && /once Ethan adds it/.test(l)), '...and Sophie’s phone says it goes once Ethan adds it (' + So.lines().filter(l => /15/.test(l)).join('') + ')');
    await E.act('bg-mine', m1.id, null, 3000);
    const m1b = shopsIn(docs).find(t => t.amount === 15);
    ok(m1b && m1b.budgie.state === 'sent' && B.transactions.filter(t => t.amount === 15).length === 1, 'once Ethan adds it, it goes, once');
    await E.act('bg-sync', null, null, 2500); await So.act('bg-sync', null, null, 2500);
    ok(!stuck(docs).length, 'nothing left waiting (' + stuck(docs).map(t => t.amount).join(',') + ')');
    ok(!twice(B).length, 'nothing sent twice (' + twice(B).join(',') + ')');
    ok(![E, So, M].some(p => p.errs.length), 'no page errors ' + [E, So, M].map(p => p.errs.join(' | ')).join(''));
  }
  // ---- 2. a restore after shops have moved on: nothing goes twice, nothing is left waiting, nothing removed comes back ----
  if (!only || only === 2) {
    phones.length = 0;
    const docs = household({ 'households/h1/config/backup': { url: 'https://script.google.com/macros/s/BK/exec', key: 'k', auto: false } }), B = budgie();
    let snap = [];
    const fetch = async (u, o) => {
      if (/macros\/s\/BK/.test(u)) { const b = JSON.parse(o.body); return { ok: true, text: async () => JSON.stringify(b.action === 'restore' ? { ok: true, at: '2026-10-26T10:00:00Z', by: 'Ethan', docs: snap } : { ok: true }) }; }
      return B.fetch(u, o);
    };
    const E = phone('ethan', docs, B, { fetch }), So = phone('sophie', docs, B, { fetch });
    await wait(4000);
    await So.logShop(31, 'u_sophie', true, 3000);
    await E.logShop(40, 'u_ethan', true, 3000);
    await E.logShop(50, 'u_ethan', true, 300);   // still waiting when the backup is taken
    await So.logShop(22, 'u_ethan', true, 300);
    snap = shopsIn(docs).map(t => { const { id, ...data } = t; return { path: 'shops/' + id, data: JSON.parse(JSON.stringify(data)) }; });
    await wait(3000); await E.act('bg-sync', null, null, 3000);
    // then Ethan removes £40 and £50, and Sophie's £31 is removed in Budgie
    const id = a => (shopsIn(docs).find(t => t.amount === a) || {}).id;
    await E.act('go-cost', null, null, 300); await E.act('rm-shop-yes', id(40), null, 2500); await E.act('rm-shop-yes', id(50), null, 2500);
    B.transactions.find(t => t.amount === 31).deleted = true; await So.act('bg-sync', null, null, 3000);
    ok(!id(40) && !id(50) && !id(31), 'before the restore: the removed shops are gone');
    await E.act('tab', 'settings', null, 300); await E.act('set-page', 'backup', null, 300);
    await E.act('restore-sheet', null, null, 800); await E.act('restore-yes', null, null, 2000);
    await E.act('bg-sync', null, null, 3500); await So.act('bg-sync', null, null, 3500); await E.act('bg-sync', null, null, 3500);
    const live = B.transactions.filter(t => !t.deleted);
    ok(live.length === 1 && live[0].amount === 22, 'after the restore Budgie has just the £22 shop (' + live.map(t => t.amount).join(',') + ')');
    ok(!stuck(docs).length, 'nothing left waiting (' + stuck(docs).map(t => t.amount).join(',') + ')');
    ok(shopsIn(docs).filter(t => !t.removed).map(t => t.amount).sort().join(',') === '22', 'Peckish settles back to what’s in Budgie (' + shopsIn(docs).map(t => t.amount + (t.removed ? 'x' : '')).join(',') + ')');
    const dup = B.puts.filter((x, i, a) => a.indexOf(x) !== i && !(B.transactions.find(t => t.id === x) || {}).deleted);
    ok(!dup.length, 'nothing sent twice (' + dup.join(',') + ')');
    ok(![E, So].some(p => p.errs.length), 'no page errors ' + [E, So].map(p => p.errs.join(' | ')).join(''));
  }
  // ---- 3. removing a shop on either phone, and Budgie changing (amount, date, split) or removing one ----
  if (!only || only === 3) {
    phones.length = 0;
    const docs = household(), B = budgie();
    let slow = 0; const fetch = async (u, o) => { if (slow && /script\.google/.test(u)) await wait(slow); return B.fetch(u, o); };
    const E = phone('ethan', docs, B, { fetch }), So = phone('sophie', docs, B, { fetch });
    await wait(4000);
    await E.logShop(40, 'u_ethan', true); await So.logShop(31, 'u_sophie', true, 3000);
    await So.logShop(22, 'u_ethan', true, 1000); await E.act('bg-sync', null, null, 3000);
    const id = a => (shopsIn(docs).find(t => t.amount === a) || {}).id, tidOf = a => ((shopsIn(docs).find(t => t.amount === a) || {}).budgie || {}).tid;
    // Sophie removes one Ethan paid that's in his Budgie: it comes off there (from his phone) and then here
    const t40 = tidOf(40);
    await So.act('go-cost', null, null, 300); await So.act('rm-shop-yes', id(40), null, 1500); await E.act('bg-sync', null, null, 3000);
    ok(!id(40) && (B.transactions.find(t => t.id === t40) || {}).deleted === true, 'Sophie removing a shop Ethan paid takes it off his Budgie and Peckish');
    // Ethan changes one in Budgie: both phones follow
    B.transactions.find(t => t.id === tidOf(22)).amount = 25; await E.act('bg-sync', null, null, 3000);
    ok(!!id(25) && !id(22), 'a new amount in Budgie comes back to the shop');
    // Ethan turns "split" off in Budgie: the shop no longer says half each
    B.transactions.find(t => t.id === tidOf(25)).split = ''; await E.act('bg-sync', null, null, 3000);
    ok((shopsIn(docs).find(t => t.amount === 25) || {}).split === '', 'split turned off in Budgie comes back too (' + (shopsIn(docs).find(t => t.amount === 25) || {}).split + ')');
    // Ethan removes it in Budgie: it goes from Peckish
    B.transactions.find(t => t.id === tidOf(25)).deleted = true; await E.act('bg-sync', null, null, 3000);
    ok(!id(25), 'one removed in Budgie goes from Peckish');
    // a shop logged for next week (from next week's list) stays next week's when the bank puts in the exact amount
    await E.act('wk', '1', null, 600); await E.logShop(60, 'u_ethan', true, 3000); await E.act('wk', '-1', null, 600);
    B.transactions.find(t => t.id === tidOf(60)).amount = 61.2; await E.act('bg-sync', null, null, 3000);
    ok(id(61.2) && (shopsIn(docs).find(t => t.amount === 61.2) || {}).week === NEXT, 'a new amount from Budgie leaves the shop in the week it was shopped for (' + (shopsIn(docs).find(t => t.amount === 61.2) || {}).week + ')');
    ok(!twice(B).length, 'nothing sent twice (' + twice(B).join(',') + ')');
    ok(![E, So].some(p => p.errs.length), 'no page errors ' + [E, So].map(p => p.errs.join(' | ')).join(''));
  }
  // ---- 4. a shop taken off while the payer's phone is sending it comes back off Budgie, and isn't written back ----
  if (!only || only === 4) {
    phones.length = 0;
    const docs = household(), B = budgie();
    let slow = 0; const fetch = async (u, o) => { if (slow && /script\.google/.test(u)) await wait(slow); return B.fetch(u, o); };
    const E = phone('ethan', docs, B, { fetch }), So = phone('sophie', docs, B, { fetch });
    await wait(4000);
    await E.logShop(40, 'u_ethan', true); await So.logShop(31, 'u_sophie', true, 3000);
    await So.logShop(22, 'u_ethan', true, 1000); await E.act('bg-sync', null, null, 3000);
    const id = a => (shopsIn(docs).find(t => t.amount === a) || {}).id, tidOf = a => ((shopsIn(docs).find(t => t.amount === a) || {}).budgie || {}).tid;
    // Sophie logs one for Ethan and takes it off straight away, while Ethan's phone is sending it
    slow = 1500;
    await So.logShop(17, 'u_ethan', true, 1400);
    const t17 = shopsIn(docs).find(t => t.amount === 17);
    await So.act('go-cost', null, null, 50); await So.act('rm-shop-yes', t17 && t17.id, null, 200);
    await wait(6000); slow = 0; await E.act('bg-sync', null, null, 3000);
    ok(!B.transactions.some(t => t.amount === 17 && !t.deleted), 'a shop taken off while it was being sent doesn’t stay in Budgie (' + JSON.stringify(B.transactions.filter(t => t.amount === 17)) + ')');
    ok(!shopsIn(docs).some(t => t.amount === 17 || (t.budgie && !t.date)), '...or come back in Peckish');
    ok(!twice(B).length, 'nothing sent twice (' + twice(B).join(',') + ')');
    ok(![E, So].some(p => p.errs.length), 'no page errors ' + [E, So].map(p => p.errs.join(' | ')).join(''));
  }
  // ---- 5. a shop logged while the payer's phone is in the middle of a sync still goes straight after ----
  if (!only || only === 5) {
    phones.length = 0;
    const docs = household(), B = budgie();
    let slow = 0; const fetch = async (u, o) => { if (slow && /script\.google/.test(u)) await wait(slow); return B.fetch(u, o); };
    const E = phone('ethan', docs, B, { fetch }), So = phone('sophie', docs, B, { fetch });
    await wait(4000);
    await E.logShop(40, 'u_ethan', true); await So.logShop(31, 'u_sophie', true, 3000);
    await So.logShop(22, 'u_ethan', true, 1000); await E.act('bg-sync', null, null, 3000);
    const id = a => (shopsIn(docs).find(t => t.amount === a) || {}).id, tidOf = a => ((shopsIn(docs).find(t => t.amount === a) || {}).budgie || {}).tid;
    // a sync with nothing to send is running when Sophie logs one for Ethan: it still goes straight after
    slow = 2000; E.act('bg-sync', null, null, 10); await wait(2300);
    await So.logShop(12, 'u_ethan', true, 300); await wait(6000); slow = 0;
    ok(((shopsIn(docs).find(t => t.amount === 12) || {}).budgie || {}).state === 'sent', 'a shop logged while the payer’s phone was mid-sync still goes (' + ((shopsIn(docs).find(t => t.amount === 12) || {}).budgie || {}).state + ')');
    ok(!twice(B).length, 'nothing sent twice (' + twice(B).join(',') + ')');
    ok(![E, So].some(p => p.errs.length), 'no page errors ' + [E, So].map(p => p.errs.join(' | ')).join(''));
  }
  // ---- 6. with nothing planned this week a shop can still be logged (and so taken off or added to Budgie) ----
  if (!only || only === 6) {
    phones.length = 0;
    const docs = household(), B = budgie();
    docs.delete('households/h1/weeks/' + MON); docs.delete('households/h1/weeks/' + NEXT);
    const E = phone('ethan', docs, B);
    await wait(4000); await E.act('tab', 'shop', null, 400);
    ok(!!E.d.querySelector('form[data-form="logshop"]') && /Nothing to buy yet/.test(E.d.body.textContent), 'nothing planned: the Shop tab still lets you log a shop');
    if (E.d.querySelector('form[data-form="logshop"]')) await E.logShop(27, 'u_ethan', true, 3000);
    ok(B.transactions.some(t => t.amount === 27 && t.person === 'ethan'), '...and the shop logged goes to Budgie');
    ok(!E.errs.length, 'no page errors ' + E.errs.join(' | '));
  }
  // ---- 7. Mum saying "it's mine" for a shop Ethan paid doesn't take away his Add to my Budgie ----
  if (!only || only === 7) {
    phones.length = 0;
    const docs = household(), B = budgie();
    docs.set('households/h1/shops/s_x', { date: TODAY_, amount: 6, shop: 'tesco', paidBy: 'p_gone', split: 'half', week: MON, source: 'peckish', by: 'Mum', byUid: 'u_mum', budgie: { state: 'queued', person: 'sophie' } });
    docs.set('households/h1/shops/s_m', { date: TODAY_, amount: 18, shop: 'tesco', paidBy: 'u_ethan', split: 'half', week: MON, source: 'peckish', by: 'Mum', byUid: 'u_mum', okBy: 'u_mum', budgie: { state: 'queued', person: 'ethan' } });
    const E = phone('ethan', docs, B);
    await wait(4000); await E.act('go-cost', null, null, 400);
    ok(!!E.d.querySelector('[data-act="bg-mine"][data-v="s_m"]'), 'a shop Mum marked as Ethan’s still offers him Add to my Budgie (' + E.lines().join(' | ').slice(0, 120) + ')');
    ok(E.lines().some(l => /£6\.00/.test(l) && /goes to Budgie once whoever paid adds it/.test(l)), 'a waiting shop whose payer isn’t in the household any more reads properly (' + E.lines().filter(l => /£6/.test(l)).join('') + ')');
    await E.act('bg-mine', 's_m', null, 3000);
    ok(B.transactions.some(t => t.amount === 18) && (docs.get('households/h1/shops/s_m') || {}).okBy === 'u_ethan', '...and Add to my Budgie sends Mum’s once he says so');
    ok(!E.errs.length, 'no page errors ' + E.errs.join(' | '));
  }
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails ? 1 : 0);
})();
