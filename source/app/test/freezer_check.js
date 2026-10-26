// No microwave -> microwave recipes hidden; freezer space gauge and "full" behaviour.
const { JSDOM } = require('jsdom'); const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../public/index.html', 'utf8').replace(/<script src="(app|firebase-config)\.js[^"]*"><\/script>/g, '');
const lib = fs.readFileSync(__dirname + '/../public/data/library.json', 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://x.github.io/es-kitchen/', beforeParse(w) { w.fetch = async () => ({ ok: true, json: async () => JSON.parse(lib) }); w.scrollTo = () => {}; } });
const w = dom.window, d = w.document; const s = d.createElement('script'); s.textContent = fs.readFileSync(__dirname + '/app.test.js', 'utf8'); d.body.appendChild(s);
const wait = ms => new Promise(r => setTimeout(r, ms)); const click = sel => { const e = d.querySelector(sel); if (!e) console.log('MISSING', sel); else e.click(); };
const txt = sel => (d.querySelector(sel) || { textContent: 'MISSING' }).textContent.replace(/\s+/g, ' ').trim();
(async () => {
  await wait(150); d.querySelector('[data-form="create"]').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(500);
  click('[data-act="tab"][data-v="settings"]'); click('[data-act="set-page"][data-v="equipment"]'); await wait(100); click('[data-act="eq"][data-v="microwave"]'); await wait(200);
  click('[data-act="tab"][data-v="recipes"]'); await wait(100); click('[data-act="f-meal-set"][data-v="lunch"]'); await wait(200);
  const titles = [...d.querySelectorAll('.vcard b')].map(x => x.textContent);
  console.log('lunches shown:', titles.length, '| microwave jacket shown:', titles.some(t => /Microwave Jacket|jacket potato with beans/i.test(t)), '|', txt('#app p.center').slice(0, 90));
  click('[data-act="tab"][data-v="week"]'); await wait(100); click('[data-act="fill"]'); await wait(6000);
  click('[data-act="tab"][data-v="kitchen"]'); click('[data-act="kit-view"][data-v="freezer"]'); await wait(200);
  console.log('freezer before setting:', txt('#app .panel').slice(0, 120));
  click('[data-act="freezer-space"][data-v="8"]'); await wait(300); console.log('freezer 8:', txt('#app .panel').slice(0, 200));
  for (let k = 0; k < 6; k++) { d.querySelector('[data-act="freezer-space"][aria-label="Less room"]').click(); await wait(150); }
  console.log('freezer 2:', txt('#app .panel').slice(0, 300));
  click('[data-act="tab"][data-v="week"]'); await wait(200); console.log('full notes:', [...d.querySelectorAll('.daynote.warn')].map(x => x.textContent).slice(0, 2).join(' | '));
  process.exit(0);
})();
