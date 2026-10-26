const { JSDOM } = require('jsdom'); const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../public/index.html', 'utf8').replace(/<script src="(app|firebase-config)\.js[^"]*"><\/script>/g, '');
const lib = fs.readFileSync(__dirname + '/../public/data/library.json', 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://x.github.io/es-kitchen/', beforeParse(w) { w.fetch = async () => ({ ok: true, json: async () => JSON.parse(lib) }); w.scrollTo = () => {}; } });
const w = dom.window, d = w.document; const s = d.createElement('script'); s.textContent = fs.readFileSync(__dirname + '/app.test.js', 'utf8'); d.body.appendChild(s);
const wait = ms => new Promise(r => setTimeout(r, ms)); const click = q => d.querySelector(q).click();
const carryNote = () => [...d.querySelectorAll('#app .note')].some(n => /Carried over/.test(n.textContent));
(async () => {
  await wait(150); d.querySelector('[data-form="create"]').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(300);
  // stale doc like the one in the preview: carry list saved, no dinners, not edited by hand
  const mon = (() => { const t = new Date(); t.setDate(t.getDate() - (t.getDay() + 6) % 7); return t.toISOString().slice(0, 10); })();
  await w.Store.set('weeks/' + mon, { days: [{}, {}, {}, {}, {}, {}, {}], carryIn: [{ i: 'potatoes', q: 1500, exp: null }, { i: 'carrots', q: 900 }] }); await wait(200);
  click('[data-act="wk"][data-v="1"]'); await wait(300);
  console.log('empty last week -> carry note on next week:', carryNote());
  click('[data-act="wk"][data-v="-1"]'); await wait(300);
  console.log('this week (stale saved list ignored) carry note:', carryNote());
  click('[data-act="fill"]'); await wait(4000);
  click('[data-act="wk"][data-v="1"]'); await wait(300);
  console.log('after planning this week -> next week carry note:', carryNote());
  click('[data-act="wk"][data-v="-1"]'); await wait(300); 
  click('[data-act="clear"]'); await wait(50); click('[data-act="clear-yes"]'); await wait(300);
  click('[data-act="wk"][data-v="1"]'); await wait(300);
  console.log('after clearing this week -> next week carry note:', carryNote());
  process.exit(0);
})();
