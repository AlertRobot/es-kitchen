// Two phones offline: each changes a different night and adds a different extra. Nothing may be lost when both save.
const { JSDOM } = require('jsdom'); const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../public/index.html', 'utf8').replace(/<script src="(app|firebase-config)\.js[^"]*"><\/script>/g, '');
const lib = fs.readFileSync(__dirname + '/../public/data/library.json', 'utf8');
function boot(pre) { const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://x.github.io/es-kitchen/', beforeParse(w) { w.fetch = async () => ({ ok: true, json: async () => JSON.parse(lib) }); w.scrollTo = () => {}; pre && pre(w); } });
  const w = dom.window; const s = w.document.createElement('script'); s.textContent = fs.readFileSync(__dirname + '/app.test.js', 'utf8'); w.document.body.appendChild(s); return w; }
const wait = ms => new Promise(r => setTimeout(r, ms));
const addExtra = async (w, name) => { w.document.querySelector('[data-act="tab"][data-v="shop"]').click(); await wait(200); w.document.querySelector('#extra-name').value = name; w.document.querySelector('[data-form="extra"]').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(200); w.document.querySelector('[data-act="tab"][data-v="week"]').click(); await wait(200); };
(async () => {
  const a = boot(); await wait(150); a.document.querySelector('[data-form="create"]').dispatchEvent(new a.Event('submit', { bubbles: true, cancelable: true })); await wait(500);
  a.document.querySelector('[data-act="fill"]').click(); await wait(5000);
  const shared = a.__docs, wk = [...shared.keys()].find(k => k.includes('/weeks/'));
  // turn the saved week back into the old array format, to check the first edit converts it safely
  const old = shared.get(wk); const arr = Array.from({ length: 7 }, (_, k) => old.days['d' + k] || {}); shared.set(wk, { ...old, days: arr, extras: [{ name: 'milk for tea', done: false }] }); await a.Store.merge('config/ping', { t: 1 }); await wait(300);
  await addExtra(a, 'bin bags');
  const afterA = JSON.parse(JSON.stringify(shared.get(wk)));
  console.log('old array format converted on first save:', !Array.isArray(afterA.days), '| milk kept:', JSON.stringify(afterA.extras).includes('milk for tea'));
  const b = boot(x => { x.__preDocs = shared; }); await wait(1500);
  const before = JSON.parse(JSON.stringify(afterA.days));
  // from here neither phone sees the other: A swaps Tuesday, B swaps Friday and adds "foil"
  a.document.querySelector('[data-act="swap-day"][data-v="1"]').click(); await wait(300);
  b.document.querySelector('[data-act="swap-day"][data-v="4"]').click(); await wait(300); await addExtra(b, 'foil');
  const end = shared.get(wk), day = k => (Array.isArray(end.days) ? end.days[k] : end.days['d' + k]) || {};
  const tue = day(1).r, fri = day(4).r, bd = k => (before['d' + k] || {});
  console.log('Tuesday changed by A kept:', tue !== bd(1).r, '| Friday changed by B kept:', fri !== bd(4).r);
  const ex = Object.values(end.extras || {}).map(x => x.name);
  console.log('extras:', ex.join(', '), '| all three kept:', ['milk for tea', 'bin bags', 'foil'].every(n => ex.includes(n)));
  console.log('other nights untouched:', [0, 2, 3, 5, 6].every(k => day(k).r === bd(k).r));
  // phone A now sees the merged doc and renders the extras in order
  a.document.querySelector('[data-act="tab"][data-v="shop"]').click(); await wait(400);
  console.log('A list shows extras:', [...a.document.querySelectorAll('[data-act="tick-extra"]')].length);
  process.exit(0);
})();
