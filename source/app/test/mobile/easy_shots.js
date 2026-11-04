// Phone-size screenshots of the Easy additions (in-memory store). Usage: MROOT=<served dir> node easy_shots.js <outdir>
const { chromium, devices } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.env.MROOT, OUT = process.argv[2] || '/tmp/shots';
fs.mkdirSync(OUT, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8767);
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], colorScheme: 'light' });
  const pg = await ctx.newPage(); pg.on('pageerror', e => console.log('PAGEERR', e.message));
  await pg.goto('http://localhost:8767/'); await pg.waitForTimeout(800);
  await pg.evaluate(() => document.querySelector('[data-form="create"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  await pg.waitForTimeout(800);
  const shot = async n => { await pg.screenshot({ path: OUT + '/' + n + '.png' }); };
  const wide = async n => { const r = await pg.evaluate(() => { const W = document.documentElement.clientWidth; return [...document.querySelectorAll('body *')].filter(e => { const b = e.getBoundingClientRect(); return b.width && b.right > W + 1 && getComputedStyle(e).position !== 'fixed' && !e.closest('.carousel'); }).slice(0, 8).map(e => e.tagName + '.' + e.className + ' r=' + Math.round(e.getBoundingClientRect().right)); }); if (r.length) console.log('OVERFLOW', n, r.join(' | ')); };
  // settings: easy nights Wed-Sun
  await pg.click('[data-act="tab"][data-v="settings"]'); await pg.waitForTimeout(300);
  await pg.click('[data-act="set-page"][data-v="treats"]'); await pg.waitForTimeout(300);
  for (const d of [2, 3, 4, 5, 6]) { await pg.click('[data-act="easy-day"][data-v="' + d + '"]'); await pg.waitForTimeout(150); }
  await shot('01-settings-easy'); await wide('settings');
  await pg.click('[data-act="tab"][data-v="week"]'); await pg.waitForTimeout(300);
  await pg.click('[data-act="fill"]'); await pg.waitForTimeout(6000); await shot('02-week-filled'); await wide('week'); await pg.evaluate(() => document.querySelector('.days').scrollIntoView()); await pg.waitForTimeout(200); await shot('02b-days');
  console.log('planned:', await pg.evaluate(() => [...document.querySelectorAll('.meal .ttl')].map(x => x.textContent).join(' | ')));
  await pg.click('[data-act="tab"][data-v="recipes"]'); await pg.waitForTimeout(500); await shot('03-recipes'); await wide('recipes');
  console.log('shelves:', await pg.evaluate(() => [...document.querySelectorAll('.shelf h2')].map(x => x.textContent).join(' | ')));
  const ez = await pg.$('[data-act="open-recipe"][data-v="ez_chicken_fajitas_kit"]');
  if (ez) { await ez.click(); await pg.waitForTimeout(500); await shot('04-recipe-fajita-kit'); await wide('recipe'); }
  await pg.goBack().catch(() => {}); await pg.waitForTimeout(300);
  await pg.evaluate(() => { const b = document.querySelector('[data-act="sheet-close"],[data-act="close"]'); if (b) b.click(); });
  await pg.click('[data-act="tab"][data-v="recipes"]'); await pg.waitForTimeout(300);
  await pg.click('[data-act="more-filters"]'); await pg.waitForTimeout(300); await shot('05-filters'); await wide('filters');
  await b.close(); srv.close();
})();
