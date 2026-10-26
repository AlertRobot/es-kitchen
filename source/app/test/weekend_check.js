const { JSDOM } = require('jsdom'); const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../public/index.html', 'utf8').replace(/<script src="(app|firebase-config)\.js[^"]*"><\/script>/g, '');
const lib = fs.readFileSync(__dirname + '/../public/data/library.json', 'utf8');
function boot(pre) { const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://x.github.io/es-kitchen/', beforeParse(w) { w.fetch = async () => ({ ok: true, json: async () => JSON.parse(lib) }); w.scrollTo = () => {}; const RD = w.Date, FAKE = RD.parse('2026-10-31T12:00:00'); class FD extends RD { constructor(...a) { if (a.length) super(...a); else super(FAKE); } static now() { return FAKE; } } w.Date = FD; pre && pre(w); } });
  const w = dom.window; const s = w.document.createElement('script'); s.textContent = fs.readFileSync(__dirname + '/app.test.js', 'utf8'); w.document.body.appendChild(s); return w; }
const wait = ms => new Promise(r => setTimeout(r, ms));
const title = w => w.document.querySelector('.weeknav .title').textContent.replace(/\s+/g, ' ');
(async () => {
  let w = boot(); let d = w.document;
  await wait(150); d.querySelector('[data-form="create"]').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(500);
  console.log('today:', new Date().toDateString(), '| opens on', title(w));
  d.querySelector('[data-act="fill"]').click(); await wait(5000);
  console.log('filled this week:', d.querySelectorAll('.meal .ttl').length, 'nights');
  const saved = new Map(w.__docs);
  w = boot(x => { x.__preDocs = saved; }); await wait(1500); d = w.document;
  const bar = d.querySelector('.tonight.compact');
  console.log('reopen with this week full, next week empty -> opens on', title(w), '| tonight bar:', bar ? bar.textContent.replace(/\s+/g, ' ').slice(0, 90) : 'none');
  d.querySelector('.tonight.compact [data-act="cook"]').click(); await wait(300); console.log('  start cooking opens cook mode:', !w.document.querySelector('#cook').hidden);
  w.document.querySelector('[data-act="cook-close"]').click(); await wait(100);
  d.querySelector('.tonight.compact [data-act="wk-this"]').click(); await wait(500); console.log('  "This week" button ->', title(w), '| tonight card:', !!d.querySelector('.tonight:not(.compact)'));
  // half-planned week, nothing next week: stays on this week
  const half = new Map(saved); for (const [k, v] of half) if (k.includes('/weeks/')) { const x = JSON.parse(JSON.stringify(v)); x.days = Array.isArray(x.days) ? x.days.map((y, i) => i < 3 ? y : {}) : Object.fromEntries(Object.entries(x.days).filter(([d]) => Number(d.slice(1)) < 3)); half.set(k, x); }
  w = boot(x => { x.__preDocs = half; }); await wait(1500); console.log('half-planned this week, nothing next week -> opens on', title(w));
  process.exit(0);
})();
