// Import a recipe from a link: the script's answer is matched to the app's ingredients and fills the form.
const { JSDOM } = require('jsdom'); const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../public/index.html', 'utf8').replace(/<script src="(app|firebase-config)\.js[^"]*"><\/script>/g, '');
const lib = fs.readFileSync(__dirname + '/../public/data/library.json', 'utf8');
const R = { title: 'Easy chicken curry & rice', servings: 4, time: 70, cuisine: 'Indian', ingredients: ['2 tbsp sunflower oil', '1 onion, finely chopped', '3 garlic cloves, crushed', '500g boneless, skinless chicken thighs', '400g can chopped tomatoes', '1 tsp garam masala', '150ml natural yogurt', 'fresh coriander, to serve', '250g basmati rice', '1 tbsp mango chutney', 'a pinch of saffron'], steps: ['Heat the oil and fry the onion for 10 mins.', 'Add the garlic and chicken.', 'Tip in the tomatoes; simmer 30 mins. Stir in yogurt.'], source: 'https://www.bbcgoodfood.com/recipes/x' };
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://x.github.io/es-kitchen/', beforeParse(w) {
  w.fetch = async (url, opt) => { if (/script\.google\.com/.test(url)) return { ok: true, text: async () => JSON.stringify({ ok: true, recipe: R }) }; return { ok: true, json: async () => JSON.parse(lib) }; }; w.scrollTo = () => {}; } });
const w = dom.window, d = w.document; const s = d.createElement('script'); s.textContent = fs.readFileSync(__dirname + '/app.test.js', 'utf8'); d.body.appendChild(s);
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await wait(150); d.querySelector('[data-form="create"]').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(600);
  await w.Store.merge('config/backup', { url: 'https://script.google.com/macros/s/abc/exec', key: 'k' }); await wait(200);
  d.querySelector('[data-act="tab"][data-v="recipes"]').click(); await wait(300);
  d.querySelector('[data-act="add-recipe"], [data-act="new-recipe"], [data-act="form-new"]') ? d.querySelector('[data-act="add-recipe"], [data-act="new-recipe"], [data-act="form-new"]').click() : console.log('no add button', [...d.querySelectorAll('#app [data-act]')].slice(0, 6).map(x => x.dataset.act).join(','));
  await wait(300);
  d.querySelector('#imp-url').value = R.source; d.querySelector('[data-form="import-url"]').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(800);
  console.log('title:', d.querySelector('#rf-title').value, '| time', d.querySelector('#rf-time').value, '| cuisine', d.querySelector('#rf-cuisine').value);
  for (let k = 0; d.querySelector('#rf-i-' + k); k++) { const sel = d.querySelector('#rf-i-' + k); console.log('  ', R.ingredients[k], '->', sel.value ? sel.options[sel.selectedIndex].text : '(pick)', d.querySelector('#rf-q-' + k).value); }
  console.log('steps:', [0, 1, 2].map(k => d.querySelector('#rf-st-' + k).value.slice(0, 30)).join(' | '));
  console.log('note:', (d.querySelector('.importbox') || {}).textContent.slice(-200));
  process.exit(0);
})();
