// Caledonite shifts -> who's in / who cooks / plates / reminders; Budgie <-> shop log; guests, votes, history.
const { JSDOM } = require('jsdom'); const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../public/index.html', 'utf8').replace(/<script src="(app|firebase-config)\.js[^"]*"><\/script>/g, '');
const lib = fs.readFileSync(__dirname + '/../public/data/library.json', 'utf8');
const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const now = new Date(); const mon = new Date(now); mon.setDate(now.getDate() - ((now.getDay() + 6) % 7)); const day = k => { const x = new Date(mon); x.setDate(mon.getDate() + k); return x; };
const NOTIFS = {}, POSTS = [];
const BUDGIE = { people: [{ id: 'ethan', name: 'Ethan' }, { id: 'sophie', name: 'Sophie' }], budgets: [{ id: 'e-food-b', person: 'ethan', name: 'Food', account: 'e-food', amount: 225 }, { id: 'e-fun', person: 'ethan', name: 'Fun' }],
  transactions: [{ id: 't-abc', date: iso(day(0)), person: 'sophie', amount: 31.4, budget: 's-food', split: 'half', note: 'Aldi big shop', source: 'app' }], splits: [{ id: 'half', shares: 'ethan:1, sophie:1' }], accounts: [] };
const wed = day(2); wed.setHours(7, 0, 0, 0); const wedE = new Date(wed); wedE.setHours(15, 30);
const CAL = { household: { dinnerTime: '19:00' }, people: [{ id: 'ethan', name: 'Ethan', email: 'ethan@example.com', settings: { hasShifts: false } }, { id: 'sophie', name: 'Sophie', email: 'sophie@example.com', settings: { hasShifts: true, travelMins: 30 } }],
  calendars: [{ owner: 'sophie', calKey: 'rota', role: 'rota' }], shifts: [{ person: 'sophie', day: iso(day(1)), type: 'long' }, { person: 'sophie', day: iso(day(3)), type: 'late' }, { person: 'sophie', day: iso(day(5)), type: 'night' }],
  feeds: [{ owner: 'sophie', events: [{ id: 'e1', t: 'Shift', s: wed.getTime(), e: wedE.getTime() }] }], me: 'ethan' };
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://x.github.io/es-kitchen/', beforeParse(w) {
  w.localStorage.setItem('peckish.cal', 'true');
  w.fetch = async (url, opt) => {
    if (/script\.google\.com\/macros\/s\/BUDGIE/.test(url)) { const b = JSON.parse(opt.body); POSTS.push(b); (b.ops || []).forEach(o => { if (o.op === 'put') BUDGIE[o.table].push({ ...o.row }); }); return { ok: true, json: async () => ({ ok: true, person: 'ethan', now: Date.now(), full: !!b.full, rows: b.full ? BUDGIE : { transactions: (b.ops || []).map(o => o.row) } }) }; }
    return { ok: true, json: async () => JSON.parse(lib) };
  };
  w.scrollTo = () => {};
} });
const w = dom.window, d = w.document; const s = d.createElement('script'); s.textContent = fs.readFileSync(__dirname + '/app.test.js', 'utf8');
w.Store && 0;
d.body.appendChild(s);
w.Store.cal = { onUser(cb) { setTimeout(() => cb({ email: 'ethan@example.com', uid: 'c1' }), 0); return () => {}; }, async signIn() {}, async signOut() {}, async read() { return JSON.parse(JSON.stringify(CAL)); }, async notify(id, data) { NOTIFS[id] = data; return 'ok'; }, async unnotify(id) { delete NOTIFS[id]; } };
const wait = ms => new Promise(r => setTimeout(r, ms));
const click = async (sel, ms) => { const el = d.querySelector(sel); if (!el) { console.log('MISSING', sel); return; } el.click(); await wait(ms || 300); };
const submit = async (sel, ms) => { d.querySelector(sel).dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(ms || 400); };
const rows = () => [...d.querySelectorAll('.day')].map(x => x.textContent.replace(/\s+/g, ' ').trim().slice(0, 150));
(async () => {
  await wait(150); await submit('[data-form="create"]', 600);
  await click('[data-act="tab"][data-v="settings"]'); await click('[data-act="set-page"][data-v="people"]');
  d.querySelector('#np-name').value = 'Sophie'; await submit('[data-form="add-person"]');
  await click('[data-act="tab"][data-v="week"]');
  await wait(3500); // links start, shifts arrive
  const wk = [...w.__docs.keys()].find(k => k.endsWith('/weeks/' + iso(day(0))));
  console.log('1 shifts saved on the week:', JSON.stringify((w.__docs.get(wk) || {}).shifts || {}).slice(0, 260));
  await click('[data-act="fill"]', 6000);
  rows().forEach(r => console.log('   ', r));
  // guests and votes
  await click('[data-act="open-day"][data-v="0"]'); await click('[data-act="guests"][data-v="0"][data-n="2"]');
  console.log('2 guests Monday, serves:', (d.querySelector('#sheet .tagrow') || {}).textContent);
  await click('[data-act="vote"][data-v="0"][data-n="-1"]'); await click('[data-act="sheet-back"]');
  console.log('   Monday row:', rows()[0]);
  console.log('   foot:', (d.querySelector('.weekfoot') || {}).textContent);
  await click('[data-act="votes"]'); console.log('   votes sheet rows:', d.querySelectorAll('#sheet .voterow').length); await click('[data-act="sheet-back"]');
  // reminders
  await wait(6500);
  const ids = Object.keys(NOTIFS); console.log('3 reminders:', ids.length, '|', ids.map(i => i.split('-').slice(4).join('-')).join(' '));
  const plate = ids.find(i => i.includes('-plate-')); console.log('   plate ask:', plate && NOTIFS[plate].to, '|', plate && NOTIFS[plate].title, '|', plate && NOTIFS[plate].body);
  const cook = ids.find(i => i.includes('-cook-ethan') && i.includes('-1-')); console.log('   Tue cook reminder:', cook && NOTIFS[cook].title, '|', cook && NOTIFS[cook].body);
  // Budgie: link and log a shop
  await click('[data-act="tab"][data-v="settings"]'); await click('[data-act="set-page"][data-v=""]'); await click('[data-act="set-page"][data-v="linked"]');
  console.log('4 linked page:', d.querySelector('#app').textContent.replace(/\s+/g, ' ').slice(0, 300));
  // paste Peckish's own limited link, made in Budgie (Settings, Linked apps)
  const linkFor = k => 'https://alertrobot.github.io/es-kitchen/#connect=' + Buffer.from(JSON.stringify({ u: 'https://script.google.com/macros/s/BUDGIE/exec', k })).toString('base64url');
  for (const [what, k, u] of [['a full Budgie key', 'a'.repeat(64)], ['plain http', 'app_peckish_' + 'e'.repeat(64), 'http://script.google.com/macros/s/BUDGIE/exec'], ['another host', 'app_peckish_' + 'e'.repeat(64), 'https://evil.example/exec']]) {
    const before = POSTS.length;
    d.querySelector('#bg-url').value = u ? 'https://alertrobot.github.io/es-kitchen/#connect=' + Buffer.from(JSON.stringify({ u, k })).toString('base64url') : linkFor(k);
    await submit('[data-form="bg-link"]', 400);
    console.log('   refuses ' + what + ':', POSTS.length === before && !w.localStorage.getItem('peckish.budgie') ? 'yes' : 'NO');
  }
  d.querySelector('#bg-url').value = linkFor('app_peckish_' + 'e'.repeat(64));
  await submit('[data-form="bg-link"]', 1500);
  console.log('   budgie imported shops:', (w.__docs && [...w.__docs.keys()].filter(k => k.includes('/shops/')).length));
  await click('[data-act="tab"][data-v="shop"]'); await click('[data-act="shop-view"][data-v="cost"]');
  d.querySelector('#ls-amt').value = '48.20'; await submit('[data-form="logshop"]', 1500);
  const put = POSTS.flatMap(b => b.ops || []).find(o => o.row && o.row.source === 'peckish');
  console.log('5 sent to Budgie:', put && JSON.stringify(put.row));
  const shops = [...w.__docs.keys()].filter(k => k.includes('/shops/')).map(k => w.__docs.get(k));
  console.log('   shops:', shops.map(x => x.amount + ' ' + x.source + ' ' + (x.budgie || {}).state).join(' | '));
  console.log('   panel:', (d.querySelector('#app .panel') || {}).textContent.replace(/\s+/g, ' ').slice(0, 260));
  // history
  await click('[data-act="tab"][data-v="settings"]'); await click('[data-act="set-page"][data-v=""]'); await click('[data-act="set-page"][data-v="history"]', 800);
  console.log('6 history:', d.querySelector('#app').textContent.replace(/\s+/g, ' ').slice(0, 400));
  process.exit(0);
})();
