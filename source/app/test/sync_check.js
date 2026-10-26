// Two phones, both offline in the shop: each ticks a different item. Neither tick may be lost.
const { JSDOM } = require('jsdom'); const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../public/index.html', 'utf8').replace(/<script src="(app|firebase-config)\.js[^"]*"><\/script>/g, '');
const lib = fs.readFileSync(__dirname + '/../public/data/library.json', 'utf8');
function boot(pre) { const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://x.github.io/es-kitchen/', beforeParse(w) { w.fetch = async () => ({ ok: true, json: async () => JSON.parse(lib) }); w.scrollTo = () => {}; pre && pre(w); } });
  const w = dom.window; const s = w.document.createElement('script'); s.textContent = fs.readFileSync(__dirname + '/app.test.js', 'utf8'); w.document.body.appendChild(s); return w; }
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  let a = boot(); await wait(150); a.document.querySelector('[data-form="create"]').dispatchEvent(new a.Event('submit', { bubbles: true, cancelable: true })); await wait(500);
  a.document.querySelector('[data-act="fill"]').click(); await wait(5000);
  const shared = a.__docs;
  const b = boot(x => { x.__preDocs = shared; }); await wait(1500);
  // both on the Shop tab; b's view is now a snapshot (no live sync between the two test windows = offline)
  for (const w of [a, b]) { w.document.querySelector('[data-act="tab"][data-v="shop"]').click(); } await wait(300);
  const ticks = w => [...w.document.querySelectorAll('[data-act="tick"]')].map(x => x.dataset.v);
  const ta = ticks(a), tb = ticks(b); console.log('items on both lists:', ta.length, tb.length);
  a.document.querySelector('[data-act="tick"][data-v="' + ta[0] + '"]').click(); await wait(100);
  b.document.querySelector('[data-act="tick"][data-v="' + tb[1] + '"]').click(); await wait(100);
  const wk = [...shared.keys()].find(k => k.includes('/weeks/'));
  const checked = shared.get(wk).checked || {};
  console.log('ticked on phone A:', ta[0], '| phone B:', tb[1], '| saved:', Object.keys(checked).filter(k => checked[k]).join(', '), '| both kept:', !!(checked[ta[0]] && checked[tb[1]]));
  const dd = shared.get(wk).days; console.log('days still planned:', Object.values(dd).filter(d => d && d.r).length, '| field-level writes:', a.__patches, b.__patches);
  process.exit(0);
})();
