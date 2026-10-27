// Fifth review's fixes (jsdom + in-memory store). Exits 1 if anything fails. `node test/review5_check.js 3` runs only test 3.
const { JSDOM } = require('jsdom'); const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../public/index.html', 'utf8').replace(/<script src="(app|firebase-config)\.js[^"]*"><\/script>/g, '');
const lib = fs.readFileSync(__dirname + '/../public/data/library.json', 'utf8');
const bundle = fs.readFileSync(__dirname + '/app.test.js', 'utf8');
const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const now = new Date(); const mon = new Date(now); mon.setDate(now.getDate() - ((now.getDay() + 6) % 7)); const day = k => { const x = new Date(mon); x.setDate(mon.getDate() + k); return x; };
const MON = iso(day(0));
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
const calMock = (CAL, NOTIFS, opts) => ({ onUser(cb) { setTimeout(() => cb({ email: 'ethan@example.com', uid: 'c1' }), 0); return () => {}; }, async signIn() {}, async signOut() {},
  async read() { if (opts && opts.slow) await wait(opts.slow); return JSON.parse(JSON.stringify(CAL)); },
  async notify(id, data) { NOTIFS[id] = data; return 'ok'; }, async unnotify(id) { delete NOTIFS[id]; } });

(async () => {
  // ---- 1. joining: the invite code a household was joined with can't be reused by someone who doesn't know it ----
  if (!only || only === 1) {
    const rules = fs.readFileSync(__dirname + '/../firestore.rules', 'utf8').replace(/\/\/.*$/gm, ''), store = fs.readFileSync(__dirname + '/../src/store.js', 'utf8');
    const join = (/match \/households\/\{hid\} \{[\s\S]*?allow update: if ([\s\S]*?);\n/.exec(rules) || [])[1] || '';
    ok(/request\.resource\.data\.joinCode == resource\.data\.inviteCode \+ '\.' \+ request\.auth\.uid/.test(join), 'join rule: the code saved by a joiner names who joined, so it can’t be left there for the next person');
    // the older form (just the code) only counts when it's being written now, never when it was already there
    const legacy = /request\.resource\.data\.joinCode == resource\.data\.inviteCode\s*&&\s*resource\.data\.get\('joinCode', ''\) != resource\.data\.inviteCode/.test(join);
    ok(legacy && !/\|\| \(request\.resource\.data\.joinCode == resource\.data\.inviteCode\s*\n?\s*&& request\.resource\.data\.members/.test(join), 'join rule: an already-saved plain code never lets anyone else in');
    ok(/joinCode: code \+ '\.' \+ user\.uid/.test(store), 'joining saves the code with who used it');
    ok(fs.readFileSync(__dirname + '/../../../firestore.rules', 'utf8') === fs.readFileSync(__dirname + '/../firestore.rules', 'utf8'), 'join rule: both copies of the rules are the same');
  }
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails ? 1 : 0);
})();
