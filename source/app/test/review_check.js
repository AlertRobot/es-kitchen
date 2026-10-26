// Review fixes in the app (jsdom + in-memory store). Exits 1 if anything fails.
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
  // ---- 1. a reminder whose time has just come isn't taken back before Caledonite sends it ----
  {
    const NOTIFS = {}, GONE = [];
    const pastId = 'pk-' + MON + '-' + TODAY_IDX + '-cook-ethan';
    const A = boot({ pre: { 'households/h1/config/settings': { remind: { cook: true, defrost: true, plates: true, cookAt: '00:01' } } }, local: { 'peckish.cal': 'true', 'peckish.calNotes': JSON.stringify({ [pastId]: 'sent-earlier' }) },
      cal: { onUser(cb) { setTimeout(() => cb({ email: 'ethan@example.com', uid: 'c1' }), 0); return () => {}; }, async signIn() {}, async signOut() {}, async read() { return JSON.parse(JSON.stringify(CAL)); }, async notify(id, data) { NOTIFS[id] = data; return 'ok'; }, async unnotify(id) { GONE.push(id); } } });
    await A.start(); await A.addSophie(); await wait(3000);
    await A.click('[data-act="fill"]', 6000); await wait(6500);
    ok(!!A.night(TODAY_IDX).r, 'reminders: tonight has a dinner');
    ok(!GONE.includes(pastId), 'reminders: tonight’s cook reminder (its time has passed) is not cancelled before it’s sent');
    ok(Object.keys(NOTIFS).length > 0 || TODAY_IDX === 6, 'reminders: later reminders are still queued');
    ok(!A.errs.length, 'reminders: no page errors ' + A.errs.join(' '));
  }
  // ---- 2. going to another week while "Fill it for me" is working doesn't put the plan on that week ----
  {
    const A = boot(); await A.start();
    await A.click('[data-act="fill"]', 1); await A.click('[data-act="wk"][data-v="1"]', 1);
    await wait(6000);
    const next = iso(day(7));
    ok(!Object.keys(A.weekDoc(next).days || {}).length, 'fill: the week you moved to is left empty');
    ok(/moved to another week/.test(A.d.querySelector('#toast').textContent), 'fill: says why nothing was filled');
    await A.click('[data-act="wk"][data-v="-1"]', 300); await A.click('[data-act="fill"]', 6000);
    ok(Object.keys(A.weekDoc().days || {}).length === 7, 'fill: filling the week you stay on still works');
  }
  // ---- 3. guests stay on the night when its dinner is swapped or changed ----
  {
    const A = boot(); await A.start(); await A.click('[data-act="fill"]', 6000);
    await A.click('[data-act="open-day"][data-v="0"]'); await A.click('#sheet [data-act="guests"][data-v="0"][data-n="2"]'); await A.click('#sheet [data-act="extra"][data-v="0"][data-n="1"]'); await A.click('[data-act="sheet-back"]');
    const was = A.night(0).r;
    await A.click('[data-act="swap-day"][data-v="0"]', 600);
    ok(A.night(0).r && A.night(0).r !== was, 'guests: Monday was swapped');
    ok(A.night(0).guests === 2 && A.night(0).extra === 1, 'guests: swapping keeps the guests and extra portions');
    await A.click('[data-act="open-day"][data-v="0"]'); await A.click('#sheet [data-act="change-day"]', 600); await A.click('#sheet [data-act="choose"]', 400);
    ok(A.night(0).guests === 2, 'guests: choosing another dinner keeps the guests');
    await A.click('[data-act="tab"][data-v="recipes"]'); await A.click('[data-act="open-recipe"]', 300); await A.click('#sheet [data-act="add-to-day"][data-v="0"]', 300); await A.click('[data-act="sheet-back"]');
    ok(A.night(0).guests === 2, 'guests: adding a recipe to that night from Recipes keeps the guests');
  }
  // ---- 4. logged shops are in the backup, and come back on a restore ----
  {
    let last = null;
    const sheet = async (url, opt) => {
      if (!/script\.google\.com/.test(url)) return { ok: true, json: async () => JSON.parse(lib) };
      const b = JSON.parse(opt.body); let r = { ok: true, sheetUrl: 'https://docs.google.com/x' };
      if (b.action === 'backup') last = b;
      if (b.action === 'restore') { const parts = {}; last.tables.Docs.rows.forEach(x => (parts[x[1]] = parts[x[1]] || []).push([x[2], x[4]])); r = { ok: true, docs: Object.keys(parts).map(p => ({ path: p, data: JSON.parse(parts[p].sort((a, b) => a[0] - b[0]).map(y => y[1]).join('')) })), at: '2026-10-26T10:00:00Z', by: 'Ethan' }; }
      return { ok: true, text: async () => JSON.stringify(r) };
    };
    const A = boot({ fetch: sheet }); await A.start(); await A.click('[data-act="fill"]', 6000);
    await A.click('[data-act="tab"][data-v="shop"]'); await A.click('[data-act="shop-view"][data-v="cost"]');
    A.d.querySelector('#ls-amt').value = '52.10'; await A.submit('[data-form="logshop"]', 500);
    const shopKey = [...A.w.__docs.keys()].find(k => k.includes('/shops/'));
    ok(!!shopKey, 'backup: the shop is logged');
    await A.click('[data-act="tab"][data-v="settings"]'); await A.click('[data-act="set-page"][data-v="backup"]');
    A.d.querySelector('#bk-url').value = 'https://script.google.com/macros/s/abc/exec'; A.d.querySelector('#bk-key').value = 'k';
    await A.submit('[data-form="backup-connect"]', 2000);
    ok(last && last.tables.Docs.rows.some(r => String(r[1]).startsWith('shops/')), 'backup: logged shops are in the raw records');
    ok(last && last.tables.Shops && last.tables.Shops.rows.length === 1 && last.tables.Shops.rows[0][4] === 52.1, 'backup: and in their own Shops tab');
    A.w.__docs.delete(shopKey);
    await A.click('[data-act="restore-sheet"]', 600);
    ok(/1 logged shops/.test(A.d.querySelector('#app').textContent), 'restore: says the shop is in the backup');
    await A.click('[data-act="restore-yes"]', 800);
    ok(A.w.__docs.has(shopKey) && A.w.__docs.get(shopKey).amount === 52.1, 'restore: the shop comes back');
  }
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails ? 1 : 0);
})();
