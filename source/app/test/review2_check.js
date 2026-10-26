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
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails ? 1 : 0);
})();
