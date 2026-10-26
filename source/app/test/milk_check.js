// regression: milk set to "not always" and no dinner needs it -> not on the list
const { JSDOM } = require('jsdom'); const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../public/index.html', 'utf8').replace(/<script src="(app|firebase-config)\.js[^"]*"><\/script>/g, '');
const lib = fs.readFileSync(__dirname + '/../public/data/library.json', 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://x.github.io/es-kitchen/', beforeParse(w) { w.fetch = async () => ({ ok: true, json: async () => JSON.parse(lib) }); w.scrollTo = () => {}; } });
const w = dom.window, d = w.document; const s = d.createElement('script'); s.textContent = fs.readFileSync(__dirname + '/app.test.js', 'utf8'); d.body.appendChild(s);
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await wait(150); d.querySelector('[data-form="create"]').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(300);
  w.__docs.set('households/h1/config/pantry', { status: { milk: 'low' }, always: { milk: false } });
  // a week whose only dinner doesn't use milk
  const L = JSON.parse(lib); const r = L.recipes.find(x => !x.ingredients.some(l => l.i === 'milk'));
  const start = Object.keys(w.__docs).length; const mon = (() => { const t = new Date(); const wd = (t.getDay() + 6) % 7; t.setDate(t.getDate() - wd); return t.toISOString().slice(0, 10); })();
  await w.Store.set('weeks/' + mon, { days: [{ r: r.id }, {}, {}, {}, {}, {}, {}], carryIn: [] });
  await w.Store.set('config/pantry', { status: { milk: 'low' }, always: { milk: false } }); await wait(300);
  d.querySelector('[data-act="tab"][data-v="shop"]').click(); await wait(300);
  const names = [...d.querySelectorAll('.iname')].map(x => x.textContent);
  console.log('milk on list (always off):', names.some(n => /milk/i.test(n)));
  await w.Store.set('config/pantry', { status: { milk: 'low' }, always: { milk: true } }); await wait(300);
  console.log('milk on list (always on):', [...d.querySelectorAll('.iname')].some(x => /milk/i.test(x.textContent)));
  process.exit(0);
})();
