const { JSDOM } = require('jsdom'); const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../public/index.html', 'utf8').replace(/<script src="(app|firebase-config)\.js[^"]*"><\/script>/g, '');
const lib = fs.readFileSync(__dirname + '/../public/data/library.json', 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://x.github.io/es-kitchen/', beforeParse(w) { w.fetch = async () => ({ ok: true, json: async () => JSON.parse(lib) }); w.scrollTo = () => {}; w.console.error = (...a) => console.log('PAGE ERROR', ...a); } });
const w = dom.window, d = w.document; w.addEventListener('error', e => console.log('UNCAUGHT', e.message));
const s = d.createElement('script'); s.textContent = fs.readFileSync(__dirname + '/app.test.js', 'utf8'); d.body.appendChild(s);
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await wait(150); d.querySelector('[data-form="create"]').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(400);
  d.querySelector('[data-act="tab"][data-v="recipes"]').click(); await wait(200);
  const b = d.createElement('button'); b.dataset.act = 'open-recipe'; b.dataset.v = 'lu_chicken_tikka_rice_box'; d.body.appendChild(b); b.click(); await wait(200);
  console.log('credit:', (d.querySelector('.credit') || {}).textContent);
  console.log('links in sheet:', [...d.querySelectorAll('.sheet a, [role=dialog] a')].map(a => a.href).filter(x => /^http/.test(x)).length);
  d.querySelector('[data-act="edit-recipe"]').click(); await wait(200);
  d.querySelector('[data-form="recipe"]').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(300);
  b.click(); await wait(200);
  console.log('after edit: lunch add rows', [...d.querySelectorAll('.label')].filter(x => /lunch/i.test(x.textContent)).length, '| steps', d.querySelectorAll('.steps li').length, '| credit kept', !!d.querySelector('.credit'));
  process.exit(0);
})();
