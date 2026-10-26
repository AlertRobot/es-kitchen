const { chromium, devices } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.env.MROOT, OUT = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8767);
(async () => {
  const b = await chromium.launch(); const pg = await (await b.newContext({ ...devices['Galaxy S9+'], colorScheme: 'dark' })).newPage();
  pg.on('pageerror', e => console.log('PAGEERR', e.message)); await pg.route(/fonts\.|unsplash/, r => r.abort());
  await pg.goto('http://localhost:8767/'); await pg.waitForTimeout(600);
  await pg.evaluate(() => document.querySelector('[data-form="create"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))); await pg.waitForTimeout(700);
  const W = await pg.evaluate(() => document.documentElement.clientWidth);
  const over = async n => { const r = await pg.evaluate(W => [...document.querySelectorAll('.chip')].filter(e => { const b = e.getBoundingClientRect(); return b.width && b.right > W + 1; }).map(e => e.textContent), W); console.log(n, 'chips off screen:', r.length ? r.join(', ') : 'none'); };
  // Recipes tab
  await pg.click('[data-act="tab"][data-v="recipes"]'); await pg.waitForTimeout(400); await over('recipes');
  await pg.click('[data-act="more-filters"]'); await pg.waitForTimeout(300); await over('recipes+filters');
  await pg.screenshot({ path: OUT + '/r1.png' });
  await pg.evaluate(() => window.scrollTo(0, 150)); await pg.waitForTimeout(100);
  const y0 = await pg.evaluate(() => scrollY); await pg.click('[data-act="f-cuisine"][data-v="Indian"]'); await pg.waitForTimeout(300);
  const y1 = await pg.evaluate(() => scrollY); console.log('recipes filter tap: scrollY', y0, '->', y1, '| results', await pg.evaluate(() => document.querySelectorAll('.rcard').length));
  await pg.click('[data-act="f-protein"][data-v="chicken"]'); await pg.waitForTimeout(300); console.log('  second tap scrollY', await pg.evaluate(() => scrollY));
  await pg.click('[data-act="clear-filters"]'); await pg.waitForTimeout(300); console.log('  clear scrollY', await pg.evaluate(() => scrollY));
  await pg.screenshot({ path: OUT + '/r2.png' });
  // Pick sheet for Wednesday, browse filters
  await pg.click('[data-act="tab"][data-v="week"]'); await pg.waitForTimeout(400);
  await pg.click('[data-act="pick"][data-v="2"]'); await pg.waitForTimeout(800); await over('pick');
  await pg.evaluate(() => { const s = document.querySelector('#sheet'); const m = s.querySelector('[data-act="more-filters"]'); m.scrollIntoView(); s.scrollBy(0, -100); });
  const s0 = await pg.evaluate(() => document.querySelector('#sheet').scrollTop); await pg.click('#sheet [data-act="more-filters"]'); await pg.waitForTimeout(400);
  const s1 = await pg.evaluate(() => document.querySelector('#sheet').scrollTop); await over('pick+filters');
  await pg.click('#sheet [data-act="p-cuisine"][data-v="British"]'); await pg.waitForTimeout(400);
  const s2 = await pg.evaluate(() => document.querySelector('#sheet').scrollTop); console.log('pick sheet scrollTop', s0, '-> open filters', s1, '-> tap British', s2);
  await pg.screenshot({ path: OUT + '/p1.png' });
  // fancy
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(200); await pg.click('[data-act="fancy"]'); await pg.waitForTimeout(800); await over('fancy');
  await pg.evaluate(() => document.querySelector('#sheet').scrollTo(0, 60)); await pg.click('[data-act="fancy-filter"][data-v="treat"]'); await pg.waitForTimeout(500);
  console.log('fancy filter scrollTop', await pg.evaluate(() => document.querySelector('#sheet').scrollTop)); await pg.screenshot({ path: OUT + '/f1.png' });
  await b.close(); srv.close();
})();
