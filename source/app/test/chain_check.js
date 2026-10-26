// Frozen food bought two weeks ago is still in the freezer this week (carry-overs chain back up to three weeks).
const { JSDOM } = require('jsdom'); const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../public/index.html', 'utf8').replace(/<script src="(app|firebase-config)\.js[^"]*"><\/script>/g, '');
const lib = fs.readFileSync(__dirname + '/../public/data/library.json', 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://x.github.io/es-kitchen/', beforeParse(w) { w.fetch = async () => ({ ok: true, json: async () => JSON.parse(lib) }); w.scrollTo = () => {}; } });
const w = dom.window, d = w.document; const s = d.createElement('script'); s.textContent = fs.readFileSync(__dirname + '/app.test.js', 'utf8'); d.body.appendChild(s);
const wait = ms => new Promise(r => setTimeout(r, ms));
const click = async sel => { d.querySelector(sel).click(); await wait(400); };
const frozen = () => { const t = [...d.querySelectorAll('#app .panel')].find(p => /Frozen ingredients/.test(p.textContent)); return t ? t.textContent.replace(/\s+/g, ' ').slice(0, 220) : 'none'; };
(async () => {
  await wait(150); d.querySelector('[data-form="create"]').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(500);
  await click('[data-act="wk"][data-v="-1"]'); await click('[data-act="wk"][data-v="-1"]');
  await click('[data-act="fill"]'); await wait(5000);
  await click('[data-act="wk"][data-v="1"]'); await wait(600);
  await click('[data-act="tab"][data-v="kitchen"]'); await click('[data-act="kit-view"][data-v="freezer"]');
  console.log('last week (nothing planned) freezer:', frozen());
  await click('[data-act="tab"][data-v="week"]'); await click('[data-act="fill"]'); await wait(5000);
  await click('[data-act="tab"][data-v="kitchen"]'); await click('[data-act="kit-view"][data-v="freezer"]');
  console.log('last week (planned) freezer:', frozen());
  await click('[data-act="tab"][data-v="week"]'); await click('[data-act="wk"][data-v="1"]'); await wait(800);
  await click('[data-act="tab"][data-v="kitchen"]'); await click('[data-act="kit-view"][data-v="freezer"]');
  console.log('this week freezer:', frozen());
  process.exit(0);
})();
