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
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails ? 1 : 0);
})();
