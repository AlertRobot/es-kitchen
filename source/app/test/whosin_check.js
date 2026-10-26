// Who's in each night (just one of us / nobody in), and shopping somewhere else for a week (its own pack sizes).
const { JSDOM } = require('jsdom'); const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../public/index.html', 'utf8').replace(/<script src="(app|firebase-config)\.js[^"]*"><\/script>/g, '');
const lib = fs.readFileSync(__dirname + '/../public/data/library.json', 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://x.github.io/es-kitchen/', beforeParse(w) { w.fetch = async () => ({ ok: true, json: async () => JSON.parse(lib) }); w.scrollTo = () => {}; } });
const w = dom.window, d = w.document; const s = d.createElement('script'); s.textContent = fs.readFileSync(__dirname + '/app.test.js', 'utf8'); d.body.appendChild(s);
const wait = ms => new Promise(r => setTimeout(r, ms)); const click = sel => { const e = d.querySelector(sel); if (!e) console.log('MISSING', sel); else e.click(); };
const txt = sel => (d.querySelector(sel) || { textContent: 'MISSING' }).textContent.replace(/\s+/g, ' ').trim();
(async () => {
  await wait(150); d.querySelector('[data-form="create"]').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(500);
  click('[data-act="tab"][data-v="settings"]'); await wait(100); click('[data-act="set-page"][data-v="people"]'); await wait(100);
  d.querySelector('#np-name').value = 'Sophie'; d.querySelector('[data-form="add-person"]').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(300);
  click('[data-act="tab"][data-v="week"]'); await wait(200);
  (b => { b.dataset.act = 'whosin'; d.body.appendChild(b); b.click(); })(d.createElement('button')); await wait(200);
  const sophie = [...d.querySelectorAll('#sheet [data-act="away-cycle"]')].find(b => /Sophie/.test(b.textContent) && b.dataset.n === '3').dataset.v;
  const ethan = [...d.querySelectorAll('#sheet [data-act="away-cycle"]')].find(b => /Ethan/.test(b.textContent)).dataset.v;
  click('#sheet [data-act="away-cycle"][data-v="' + sophie + '"][data-n="3"]'); await wait(100); // Thu: Sophie out
  click('#sheet [data-act="away-cycle"][data-v="' + sophie + '"][data-n="5"]'); await wait(100); click('#sheet [data-act="away-cycle"][data-v="' + ethan + '"][data-n="5"]'); await wait(100); // Sat: both out
  console.log('sheet Thu:', txt('#sheet .whorow:nth-of-type(4)'));
  click('#sheet [data-act="sheet-back"]'); await wait(200);
  console.log('plan button:', txt('#app .btn.primary'), '| seg:', txt('[data-act="week-view"][data-v="dinners"]'));
  click('[data-act="fill"]'); await wait(6000);
  const days = [...d.querySelectorAll('.day')].map(x => x.textContent.replace(/\s+/g, ' ').slice(0, 60));
  console.log('Thu:', days[3]); console.log('Sat:', days[5]);
  click('[data-act="open-day"][data-v="3"]'); await wait(300); console.log('Thu recipe serves:', [...d.querySelectorAll('#sheet .tag')].map(t => t.textContent).find(t => /Serves/.test(t)), '| who:', txt('#sheet [data-act="away-toggle"].outd'));
  click('#sheet [data-act="sheet-back"]'); await wait(100);
  click('[data-act="tab"][data-v="shop"]'); await wait(200);
  const before = [...d.querySelectorAll('.item .muted.small')].slice(0, 6).map(x => x.textContent.split('·')[0].trim()).join(' | ');
  click('[data-act="shop-view"][data-v="compare"]'); await wait(200);
  click('[data-act="week-shop"][data-v="aldi"]'); await wait(300); console.log('compare note:', txt('#app .panel .note').slice(0, 90));
  click('[data-act="shop-view"][data-v="list"]'); await wait(200);
  const after = [...d.querySelectorAll('.item .muted.small')].slice(0, 6).map(x => x.textContent.split('·')[0].trim()).join(' | ');
  console.log('packs Tesco:', before); console.log('packs Aldi: ', after, '| prices at:', txt('#app .row.between .muted.small'));
  process.exit(0);
})();
