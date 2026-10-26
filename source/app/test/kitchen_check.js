const { JSDOM } = require('jsdom'); const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../public/index.html', 'utf8').replace(/<script src="(app|firebase-config)\.js[^"]*"><\/script>/g, '');
const lib = fs.readFileSync(__dirname + '/../public/data/library.json', 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://x.github.io/es-kitchen/', beforeParse(w) { w.fetch = async () => ({ ok: true, json: async () => JSON.parse(lib) }); w.scrollTo = () => {}; w.console.error = (...a) => console.log('PAGE ERROR', ...a); } });
const w = dom.window, d = w.document; w.addEventListener('error', e => console.log('UNCAUGHT', e.message));
const s = d.createElement('script'); s.textContent = fs.readFileSync(__dirname + '/app.test.js', 'utf8'); d.body.appendChild(s);
const wait = ms => new Promise(r => setTimeout(r, ms));
const click = q => { const el = d.querySelector(q); if (!el) { console.log('MISSING', q); return; } el.click(); };
(async () => {
  await wait(150); d.querySelector('[data-form="create"]').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(400);
  console.log('1 BL slots on week (no plan set):', d.querySelectorAll('.blslot').length, '| people chips', d.querySelectorAll('[data-act="bl-person"]').length);
  click('[data-act="tab"][data-v="kitchen"]'); await wait(200);
  console.log('2 pantry groups:', [...d.querySelectorAll('.pgroup summary')].map(x => x.textContent.replace(/\s+/g, ' ').trim()).join(' | '));
  console.log('  weetabix staple:', [...d.querySelectorAll('.pgroup span')].some(x => /Weetabix/.test(x.textContent)));
  const inp = d.querySelector('#pantryq'); inp.value = 'tuna'; inp.dispatchEvent(new w.Event('input', { bubbles: true })); await wait(100);
  console.log('3 search tuna -> add rows:', d.querySelectorAll('[data-act="make-staple"]').length);
  click('[data-act="make-staple"]'); d.activeElement.blur(); await wait(300);
  console.log('  after add, open groups:', [...d.querySelectorAll('.pgroup[open] summary')].map(x => x.textContent.replace(/\s+/g, ' ').trim()).join(' | '));
  click('[data-act="tab"][data-v="week"]'); await wait(100); click('[data-act="fill"]'); await wait(6000);
  const uses = d.querySelectorAll('[data-act="use-up"]'); console.log('4 waste use-up buttons:', uses.length);
  if (uses.length) { uses[0].click(); await wait(200); console.log('  recipes search:', d.querySelector('#rq').value, '| results', d.querySelectorAll('.vcard').length); }
  process.exit(0);
})();
