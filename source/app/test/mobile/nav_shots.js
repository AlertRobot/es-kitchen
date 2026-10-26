// Phone-size screenshots of the v5 navigation (menus, section switchers, carousels, themes). Usage: MROOT=... node nav_shots.js <outdir> [dark|light]
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.env.MROOT, OUT = process.argv[2] || '/tmp/navshots', SCHEME = process.argv[3] || 'light';
fs.mkdirSync(OUT, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8767);
(async () => {
  const b = await chromium.launch();
  // Galaxy A33 / S25+ size in CSS pixels
  const ctx = await b.newContext({ viewport: { width: 412, height: 892 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: SCHEME });
  const pg = await ctx.newPage(); pg.on('pageerror', e => console.log('PAGEERR', e.message)); pg.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 200)); });
  await pg.route(/images\.unsplash\.com/, r => r.abort());
  await pg.goto('http://localhost:8767/'); await pg.waitForTimeout(600);
  await pg.evaluate(() => document.querySelector('[data-form="create"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  await pg.waitForTimeout(800);
  let n = 0;
  const shot = async name => { n++; await pg.screenshot({ path: OUT + '/' + String(n).padStart(2, '0') + '-' + name + '.png' }); };
  const wide = async name => { const r = await pg.evaluate(() => { const W = document.documentElement.clientWidth; return [...document.querySelectorAll('#app *, #sheet *')].filter(e => { if (e.closest('.carousel,.jump,.chips:not(.wrapchips),.scrollx')) return false; const b = e.getBoundingClientRect(); return b.width && b.right > W + 1 && getComputedStyle(e).position !== 'fixed'; }).slice(0, 6).map(e => e.tagName + '.' + e.className + ' r=' + Math.round(e.getBoundingClientRect().right)); }); if (r.length) console.log('OVERFLOW', name, r.join(' | ')); };
  const click = async sel => { await pg.click(sel); await pg.waitForTimeout(350); };
  await await click('[data-act="fill"]'); await pg.waitForTimeout(5000);
  await shot('week'); await wide('week');
  await pg.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await pg.waitForTimeout(150); await shot('week-bottom'); await pg.evaluate(() => window.scrollTo(0, 0));
  await click('[data-act="week-view"][data-v="bl"]'); await shot('week-bl'); await wide('week-bl');
  await click('[data-act="week-view"][data-v="dinners"]');
  await click('[data-act="tab"][data-v="recipes"]'); await shot('recipes'); await wide('recipes');
  await pg.evaluate(() => window.scrollTo(0, 900)); await pg.waitForTimeout(150); await shot('recipes-scrolled'); await pg.evaluate(() => window.scrollTo(0, 0));
  await click('[data-act="f-shelf"]'); await shot('recipes-see-all'); await wide('see-all');
  await click('[data-act="more-filters"]'); await shot('recipes-filters'); await click('[data-act="more-filters"]');
  await click('[data-act="f-meal-set"][data-v="breakfast"]'); await shot('recipes-breakfast');
  await click('[data-act="f-meal-set"][data-v=""]');
  await click('[data-act="tab"][data-v="shop"]'); await shot('shop'); await wide('shop');
  const j = await pg.$$('[data-act="jump"]'); if (j[2]) { await j[2].click(); await pg.waitForTimeout(700); await shot('shop-jump'); }
  await click('[data-act="shop-view"][data-v="compare"]'); await shot('shop-compare'); await wide('compare');
  await click('[data-act="shop-view"][data-v="cost"]'); await shot('shop-cost');
  await click('[data-act="tab"][data-v="kitchen"]'); await shot('kitchen-pantry'); await wide('pantry');
  await click('[data-act="kit-view"][data-v="left"]'); await shot('kitchen-left'); await wide('left');
  await click('[data-act="kit-view"][data-v="freezer"]'); await shot('kitchen-freezer');
  await click('[data-act="tab"][data-v="settings"]'); await shot('settings-menu'); await wide('menu');
  for (const k of ['household', 'people', 'planning', 'treats', 'equipment', 'prices', 'look', 'backup', 'account']) {
    await click('[data-act="set-page"][data-v="' + k + '"]'); await shot('set-' + k); await wide('set-' + k);
    await pg.goBack(); await pg.waitForTimeout(350); // the phone's Back button returns to the menu
    const back = await pg.$('[data-act="set-page"][data-v="household"]'); if (!back) { console.log('BACK did not return to menu from', k); await click('[data-act="set-page"][data-v=""]'); }
  }
  for (const t of ['empyrean', 'dreamland', 'starship', 'neon', 'mars']) {
    await pg.evaluate(t => { localStorage.setItem('esk-look', JSON.stringify({ palette: t })); document.documentElement.dataset.palette = t; }, t);
    await click('[data-act="tab"][data-v="week"]'); await shot('theme-' + t + '-week');
    await click('[data-act="tab"][data-v="recipes"]'); await shot('theme-' + t + '-recipes');
  }
  await click('[data-act="tab"][data-v="settings"]'); await click('[data-act="set-page"][data-v="look"]'); await pg.evaluate(() => window.scrollTo(0, 300)); await shot('theme-picker');
  await b.close(); srv.close();
})();
