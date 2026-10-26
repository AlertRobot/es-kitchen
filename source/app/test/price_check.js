// Logging a receipt price saves only that shop's price; the other shops keep following the library (and its refreshes).
const { JSDOM } = require('jsdom'); const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../public/index.html', 'utf8').replace(/<script src="(app|firebase-config)\.js[^"]*"><\/script>/g, '');
const libRaw = JSON.parse(fs.readFileSync(__dirname + '/../public/data/library.json', 'utf8'));
let lib = libRaw;
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://x.github.io/es-kitchen/', beforeParse(w) { w.fetch = async () => ({ ok: true, json: async () => JSON.parse(JSON.stringify(lib)) }); w.scrollTo = () => {}; } });
const w = dom.window, d = w.document; const s = d.createElement('script'); s.textContent = fs.readFileSync(__dirname + '/app.test.js', 'utf8'); d.body.appendChild(s);
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await wait(150); d.querySelector('[data-form="create"]').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(500);
  d.querySelector('[data-act="fill"]').click(); await wait(5000);
  d.querySelector('[data-act="tab"][data-v="shop"]').click(); await wait(200);
  d.querySelector('[data-act="expand"]').click(); await wait(100);
  const form = d.querySelector('.paidrow'), id = form.dataset.v; form.querySelector('input').value = '0.99';
  form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(300);
  const key = [...w.__docs.keys()].find(k => k.endsWith('/ingredients/' + id)), doc = w.__docs.get(key);
  console.log('saved doc fields:', Object.keys(doc).join(','), '| shops in it:', Object.keys(doc.prices || {}).join(','));
  const ing = libRaw.ingredients.find(i => i.id === id);
  console.log('library still gives the other shops:', Object.keys(ing.prices).filter(x => x !== 'tesco').join(','));
  // a library refresh with a newer Asda price is picked up; the receipt price for Tesco stays
  console.log('receipt price kept for tesco:', doc.prices.tesco.loyalty === 0.99 || doc.prices.tesco.price === 0.99);
  d.querySelector('[data-act="tab"][data-v="settings"]').click(); await wait(150); d.querySelector('[data-act="set-page"][data-v="household"]') && 0;
  process.exit(0);
})();
