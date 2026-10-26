// Second review's fixes in the app (jsdom + in-memory store). Exits 1 if anything fails.
const { JSDOM } = require('jsdom'); const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../public/index.html', 'utf8').replace(/<script src="(app|firebase-config)\.js[^"]*"><\/script>/g, '');
const lib = fs.readFileSync(__dirname + '/../public/data/library.json', 'utf8');
const bundle = fs.readFileSync(__dirname + '/app.test.js', 'utf8');
const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const now = new Date(); const mon = new Date(now); mon.setDate(now.getDate() - ((now.getDay() + 6) % 7)); const day = k => { const x = new Date(mon); x.setDate(mon.getDate() + k); return x; };
const MON = iso(day(0)), TODAY_IDX = (now.getDay() + 6) % 7;
const wait = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (cond, what) => { console.log((cond ? 'ok   ' : 'FAIL ') + what); if (!cond) fails++; };
function boot(opts) {
  opts = opts || {};
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://x.github.io/es-kitchen/', beforeParse(w) {
    if (opts.pre) w.__preDocs = new Map(Object.entries(opts.pre));
    for (const k in (opts.local || {})) w.localStorage.setItem(k, opts.local[k]);
    w.fetch = opts.fetch || (async () => ({ ok: true, json: async () => JSON.parse(lib) }));
    w.scrollTo = () => {};
  } });
  const w = dom.window, d = w.document; const errs = []; w.addEventListener('error', e => errs.push(e.message));
  const s = d.createElement('script'); s.textContent = bundle; d.body.appendChild(s);
  if (opts.cal) w.Store.cal = opts.cal;
  const click = async (sel, ms) => { const el = d.querySelector(sel); if (!el) { console.log('  MISSING', sel); return false; } el.click(); await wait(ms || 250); return true; };
  const submit = async (sel, ms) => { d.querySelector(sel).dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(ms || 400); };
  const weekDoc = start => w.__docs.get('households/h1/weeks/' + (start || MON)) || {};
  const night = (k, start) => ((weekDoc(start).days || {})['d' + k]) || {};
  const start = async () => { await wait(150); await submit('[data-form="create"]', 600); };
  const addSophie = async () => { await click('[data-act="tab"][data-v="settings"]'); await click('[data-act="set-page"][data-v="people"]'); d.querySelector('#np-name').value = 'Sophie'; await submit('[data-form="add-person"]'); await click('[data-act="tab"][data-v="week"]'); };
  return { w, d, errs, click, submit, weekDoc, night, start, addSophie };
}
const CAL = { household: { dinnerTime: '19:00' }, people: [{ id: 'ethan', name: 'Ethan', email: 'ethan@example.com', settings: {} }, { id: 'sophie', name: 'Sophie', email: 'sophie@example.com', settings: { hasShifts: true } }], calendars: [], shifts: [], feeds: [], me: 'ethan' };

(async () => {
  // ---- 1. offline in the shop, with only the phone's plain copy of the week: ticking an item keeps the plan ----
  {
    const A = boot(); await A.start(); await A.click('[data-act="fill"]', 6000);
    const saved = new Map(A.w.__docs), copies = {}; Object.keys(A.w.localStorage).filter(k => k.startsWith('esk-wk:')).forEach(k => copies[k] = A.w.localStorage.getItem(k));
    [...saved.keys()].filter(k => k.includes('/weeks/')).forEach(k => saved.delete(k));
    const B = boot({ pre: Object.fromEntries(saved), local: copies });
    B.w.__offlineWeeks = true; await wait(1200);
    const before = B.d.querySelectorAll('.meal .ttl').length;
    ok(before === 7, 'offline copy: the week shows from the phone\u2019s copy (' + before + ' dinners)');
    await B.click('[data-act="tab"][data-v="shop"]'); const items = B.d.querySelectorAll('[data-act="tick"]').length;
    await B.click('[data-act="tick"]', 400);
    ok(B.d.querySelectorAll('[data-act="tick"]').length === items && B.d.querySelectorAll('.item.done').length === 1, 'offline copy: after a tick the list is all still there, with the tick (' + B.d.querySelectorAll('[data-act="tick"]').length + '/' + items + ')');
    await B.click('[data-act="tab"][data-v="week"]');
    ok(B.d.querySelectorAll('.meal .ttl').length === 7, 'offline copy: and so is the week\u2019s plan');
    const part = B.w.__docs.get('households/h1/weeks/' + MON) || {};
    ok(!part.days, 'offline copy: only the tick is written, so the other phone\u2019s plan isn\u2019t overwritten');
  }
  // ---- 2. Caledonite refusing Peckish's reminders shows in Linked apps ----
  {
    const refuse = async () => { throw Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }); };
    const A = boot({ pre: { 'households/h1/config/settings': { remind: { cook: true, defrost: true, plates: true, cookAt: '23:58' } } }, local: { 'peckish.cal': 'true' },
      cal: { onUser(cb) { setTimeout(() => cb({ email: 'ethan@example.com', uid: 'c1' }), 0); return () => {}; }, async signIn() {}, async signOut() {}, async read() { return JSON.parse(JSON.stringify(CAL)); }, notify: refuse, unnotify: refuse } });
    A.w.console.warn = () => {}; await A.start(); await A.addSophie(); await wait(3000);
    await A.click('[data-act="fill"]', 6000); await wait(6500);
    await A.click('[data-act="tab"][data-v="settings"]'); await A.click('[data-act="set-page"][data-v=""]'); await A.click('[data-act="set-page"][data-v="linked"]');
    ok(/isn.t taking reminders from Peckish/.test(A.d.querySelector('#app').textContent), 'reminders: a refusal from Caledonite is shown, not swallowed');
  }
  // ---- 3. Budgie: a shop sent from Peckish follows Budgie, and a shop logged by mistake can be taken off ----
  {
    const B = { people: [{ id: 'ethan', name: 'Ethan' }, { id: 'sophie', name: 'Sophie' }], budgets: [{ id: 'e-food', person: 'ethan', name: 'Food' }], transactions: [], splits: [], accounts: [] };
    const OPS = [];
    const budgie = async (url, opt) => {
      if (!/script\.google\.com/.test(url)) return { ok: true, json: async () => JSON.parse(lib) };
      const b = JSON.parse(opt.body);
      (b.ops || []).forEach(o => { OPS.push(o); if (o.op === 'delete') { const t = B.transactions.find(x => x.id === o.id); if (t) t.deleted = true; } else { const i = B.transactions.findIndex(x => x.id === o.row.id); if (i >= 0) B.transactions[i] = { ...B.transactions[i], ...o.row }; else B.transactions.push({ ...o.row }); } });
      const rows = JSON.parse(JSON.stringify(B)); rows.transactions = rows.transactions.filter(t => !t.deleted);
      return { ok: true, json: async () => ({ ok: true, person: 'ethan', keyType: 'app', now: Date.now(), full: true, rows }) };
    };
    const A = boot({ fetch: budgie }); await A.start();
    await A.click('[data-act="tab"][data-v="settings"]'); await A.click('[data-act="set-page"][data-v="linked"]');
    A.d.querySelector('#bg-url').value = 'https://alertrobot.github.io/es-kitchen/#connect=' + Buffer.from(JSON.stringify({ u: 'https://script.google.com/macros/s/BUDGIE/exec', k: 'app_peckish_' + 'e'.repeat(64) })).toString('base64url');
    await A.submit('[data-form="bg-link"]', 1500);
    await A.click('[data-act="tab"][data-v="week"]'); await A.click('[data-act="fill"]', 6000);
    await A.click('[data-act="tab"][data-v="shop"]'); await A.click('[data-act="shop-view"][data-v="cost"]');
    A.d.querySelector('#ls-amt').value = '52.10'; await A.submit('[data-form="logshop"]', 1500);
    const shops = () => [...A.w.__docs.keys()].filter(k => k.includes('/shops/')).map(k => ({ k, ...A.w.__docs.get(k) }));
    const s1 = shops()[0];
    const sync = async () => { const b = A.d.createElement('button'); b.dataset.act = 'bg-sync'; A.d.body.appendChild(b); b.click(); b.remove(); await wait(1200); };
    ok(s1 && s1.budgie && s1.budgie.state === 'sent' && B.transactions.some(t => t.id === s1.budgie.tid), 'budgie: the shop went to Budgie');
    B.transactions.find(t => t.id === s1.budgie.tid).amount = 49.85; await sync();
    ok(A.w.__docs.get(s1.k).amount === 49.85, 'budgie: a new amount in Budgie (fixed there, or the bank\u2019s) comes back to Peckish');
    ok(!shops().some(x => x.source === 'budgie'), 'budgie: and it isn\u2019t brought in a second time as a Budgie shop');
    B.transactions.find(t => t.id === s1.budgie.tid).deleted = true; await sync();
    ok(!A.w.__docs.has(s1.k), 'budgie: a shop taken off in Budgie goes from Peckish too');
    await A.click('[data-act="tab"][data-v="week"]'); await A.click('[data-act="tab"][data-v="shop"]');
    A.d.querySelector('#ls-amt').value = '482.00'; await A.submit('[data-form="logshop"]', 1500);
    const s2 = shops()[0]; ok(s2 && s2.budgie.state === 'sent', 'remove: a mistyped shop was logged and sent');
    await A.click('[data-act="rm-shop"][data-v="' + s2.k.split('/').pop() + '"]', 200);
    await A.click('[data-act="rm-shop-yes"]', 1500);
    ok(!A.w.__docs.has(s2.k) && OPS.some(o => o.op === 'delete' && o.id === s2.budgie.tid), 'remove: it goes from Peckish and comes off in Budgie');
    ok(!/482/.test(A.d.querySelector('#app').textContent), 'remove: and it\u2019s off Shops this month');
    ok(!A.errs.length, 'budgie: no page errors ' + A.errs.join(' '));
  }
  // ---- 4. step photos from another household say so and can be hidden; none can be a link to another website ----
  {
    const GIF = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
    const pre = { 'stepPhotos/in_chicken_tikka_masala__0': { img: GIF, by: 'Stranger', uid: 'u_x', hid: 'h_other' }, 'stepPhotos/in_chicken_tikka_masala__1': { img: GIF, by: 'Ethan', uid: 'u_ethan', hid: 'h1' },
      'stepPhotos/in_chicken_tikka_masala__2': { img: 'https://tracker.example/pixel.gif', by: 'Stranger', uid: 'u_x', hid: 'h_other' }, 'dishThumbs/it_tuna_puttanesca': { thumb: 'https://tracker.example/t.gif', by: 'Stranger', uid: 'u_x', hid: 'h_other' } };
    const A = boot({ pre }); await A.start();
    const open = async id => { const b = A.d.createElement('button'); b.dataset.act = 'open-recipe'; b.dataset.v = id; A.d.body.appendChild(b); b.click(); b.remove(); await wait(400); };
    await open('in_chicken_tikka_masala');
    const steps = () => [...A.d.querySelectorAll('#sheet ol.steps > li')];
    ok(/someone else using Peckish/.test(steps()[0].textContent) && !!steps()[0].querySelector('[data-act="hide-photo"]'), 'step photos: another household\u2019s says so and can be hidden');
    ok(!steps()[0].querySelector('[data-stepphoto]'), 'step photos: no "replace" for one the database won\u2019t let you replace');
    ok(!!steps()[1].querySelector('figure') && !steps()[1].querySelector('[data-act="hide-photo"]') && !!steps()[1].querySelector('[data-stepphoto]'), 'step photos: your own can be replaced, not hidden');
    ok(!A.d.querySelector('#sheet img[src*="tracker.example"]'), 'photos: a picture that\u2019s really a link to another website isn\u2019t shown');
    await A.click('#sheet ol.steps > li [data-act="hide-photo"]', 400);
    ok(!steps()[0].querySelector('figure') && !!steps()[0].querySelector('[data-act="unhide-photo"]'), 'step photos: hidden, with a way back');
    ok(((A.w.__docs.get('households/h1/config/photoPrefs') || {}).hidden || {}).in_chicken_tikka_masala__0 === true, 'step photos: hidden for both phones');
    await A.click('[data-act="sheet-back"]'); await A.click('[data-act="tab"][data-v="recipes"]', 400);
    ok(!A.d.querySelector('#app img[src*="tracker.example"]'), 'photos: nor on the recipe cards');
  }
  // ---- 5. odd record ids (from a crafted backup, or typed in the console) can't add markup to the page ----
  {
    const bad = 'x"><b id="pwn">';
    const sheet = async (url, opt) => {
      if (!/script\.google\.com/.test(url)) return { ok: true, json: async () => JSON.parse(lib) };
      const b = JSON.parse(opt.body); let r = { ok: true, sheetUrl: 'https://docs.google.com/x' };
      if (b.action === 'restore') r = { ok: true, docs: [{ path: 'ingredients/' + bad.replace('x', 'y'), data: { name: 'Odd beans', unit: 'g', packs: [400], aisle: 'Tins & jars', prices: {}, custom: true } }, { path: 'ratings/it_tuna_puttanesca', data: { u_ethan: { stars: 5 } } }], at: '2026-10-26T10:00:00Z', by: 'Ethan' };
      return { ok: true, text: async () => JSON.stringify(r) };
    };
    const A = boot({ fetch: sheet, pre: { ['households/h1/ingredients/' + bad]: { name: 'Odd peas', unit: 'g', packs: [400], aisle: 'Tins & jars', prices: {}, custom: true, staple: false } } }); await A.start();
    await A.click('[data-act="tab"][data-v="settings"]'); await A.click('[data-act="set-page"][data-v="prices"]');
    const q = A.d.querySelector('#pq'); q.value = 'odd'; q.dispatchEvent(new A.w.Event('input', { bubbles: true })); await wait(200);
    await A.click('[data-act="expand"]', 300); A.d.activeElement && A.d.activeElement.blur && A.d.activeElement.blur(); await wait(100);
    const pricesOk = !A.d.querySelector('#pwn') && !!A.d.querySelector('.pricetable');
    await A.click('[data-act="tab"][data-v="kitchen"]'); await A.click('[data-act="kit-view"][data-v="left"]');
    ok(pricesOk && !A.d.querySelector('#pwn'), 'ids: an odd ingredient id shows as text, not markup');
    await A.click('[data-act="tab"][data-v="settings"]'); await A.click('[data-act="set-page"][data-v=""]'); await A.click('[data-act="set-page"][data-v="backup"]');
    A.d.querySelector('#bk-url').value = 'https://script.google.com/macros/s/abc/exec'; A.d.querySelector('#bk-key').value = 'k';
    await A.submit('[data-form="backup-connect"]', 1500);
    await A.click('[data-act="restore-sheet"]', 600); await A.click('[data-act="restore-yes"]', 800);
    ok(!A.w.__docs.has('households/h1/ingredients/' + bad.replace('x', 'y')), 'restore: a record with an odd id is left out');
    ok(A.w.__docs.has('households/h1/ratings/it_tuna_puttanesca'), 'restore: the rest comes back');
  }
  // ---- 6. a stock photo that can't load (offline, not saved yet) doesn't leave a broken box on the recipe ----
  {
    const A = boot(); await A.start();
    const r = JSON.parse(lib).recipes.find(x => x.photo && x.photo.url);
    const b = A.d.createElement('button'); b.dataset.act = 'open-recipe'; b.dataset.v = r.id; A.d.body.appendChild(b); b.click(); b.remove(); await wait(400);
    const img = A.d.querySelector('#sheet .hero img'); img.dispatchEvent(new A.w.Event('error'));
    ok(A.d.querySelector('#sheet .hero').hidden === true, 'photos: a stock photo that fails to load is put away');
  }
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails ? 1 : 0);
})();
