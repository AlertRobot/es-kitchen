// Planned portions reach the recipe and cook mode; swap notes show while cooking; Back returns to Week.
const { JSDOM } = require('jsdom'); const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../public/index.html', 'utf8').replace(/<script src="(app|firebase-config)\.js[^"]*"><\/script>/g, '');
const lib = fs.readFileSync(__dirname + '/../public/data/library.json', 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://x.github.io/es-kitchen/', beforeParse(w) { w.fetch = async () => ({ ok: true, json: async () => JSON.parse(lib) }); w.scrollTo = () => {}; } });
const w = dom.window, d = w.document; const s = d.createElement('script'); s.textContent = fs.readFileSync(__dirname + '/app.test.js', 'utf8'); d.body.appendChild(s);
const wait = ms => new Promise(r => setTimeout(r, ms)); const click = sel => { const e = d.querySelector(sel); if (!e) console.log('MISSING', sel); else e.click(); };
const txt = sel => (d.querySelector(sel) || { textContent: 'MISSING' }).textContent.replace(/\s+/g, ' ').trim();
(async () => {
  await wait(150); d.querySelector('#cr-wont').value = 'mushrooms'; d.querySelector('[data-form="create"]').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(600);
  click('[data-act="fill"]'); await wait(5000);
  click('[data-act="open-day"][data-v="2"]'); await wait(300); click('#sheet [data-act="extra"][data-n="2"]'); await wait(300);
  click('#sheet [data-act="sheet-back"]'); await wait(100); click('[data-act="open-day"][data-v="2"]'); await wait(300);
  console.log('recipe with +2:', [...d.querySelectorAll('#sheet .tag')].map(t => t.textContent).filter(t => /Serves/.test(t)).join(), '| servings on:', txt('#sheet [data-act="serv"].on'), '|', [...d.querySelectorAll('#sheet .ing .amt, #sheet .ing span:last-child')].slice(0, 4).map(x => x.textContent).join(' / '));
  click('#sheet [data-act="cook"]'); await wait(200); click('[data-act="cook-ings"]'); await wait(100); console.log('cook ingredients:', txt('#cook .cbody').slice(0, 160));
  click('[data-act="cook-close"]'); await wait(100);
  // a recipe with a mushroom swap
  const sw = JSON.parse(lib).recipes.find(r => !r.retired && r.id === 'in_paneer_tikka');
  const b = d.createElement('button'); b.dataset.act = 'open-recipe'; b.dataset.v = sw.id; d.body.appendChild(b); b.click(); await wait(200);
  click('#sheet [data-act="cook"]'); await wait(200); console.log('cook step 1 swap note:', txt('#cook .note.good'));
  click('[data-act="cook-close"]'); await wait(50); w.history.back(); await wait(200); click('[data-act="tab"][data-v="shop"]'); await wait(200); w.history.back(); await wait(300);
  console.log('Back from Shop goes to:', txt('#nav .on'));
  process.exit(0);
})();
