// Phone-size screenshots of the app with the in-memory store. Usage: node shots.js <outdir>
const { chromium, devices } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.env.MROOT, OUT = process.argv[2] || '/tmp/shots';
fs.mkdirSync(OUT, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8766);
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], colorScheme: 'dark' });
  const pg = await ctx.newPage(); pg.on('pageerror', e => console.log('PAGEERR', e.message));
  await pg.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
  await pg.goto('http://localhost:8766/'); await pg.waitForTimeout(600);
  await pg.click('[data-form="create"] [type=submit]').catch(async () => { await pg.evaluate(() => document.querySelector('[data-form="create"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))); });
  await pg.waitForTimeout(700);
  const shot = async n => { await pg.screenshot({ path: OUT + '/' + n + '.png' }); console.log('shot', n); };
  const wide = async n => { const r = await pg.evaluate(() => { const W = document.documentElement.clientWidth; return [...document.querySelectorAll('body *')].filter(e => { const b = e.getBoundingClientRect(); return b.width && b.right > W + 1 && getComputedStyle(e).position !== 'fixed'; }).slice(0, 8).map(e => e.tagName + '.' + e.className + ' r=' + Math.round(e.getBoundingClientRect().right)); }); if (r.length) console.log('OVERFLOW', n, r.join(' | ')); };
  await shot('01-week-empty'); await wide('week-empty');
  await pg.click('[data-act="fancy"]'); await pg.waitForTimeout(800); await shot('01b-fancy'); await wide('fancy');
  const cards = await pg.$$('[data-act="fancy-toggle"]'); console.log('fancy cards', cards.length, await pg.evaluate(() => [...document.querySelectorAll('.fbody b')].map(b => b.textContent).join(' | ')));
  for (const k of [0, 2, 5]) { const cs = await pg.$$('.fgrid:last-of-type [data-act="fancy-toggle"]'); if (cs[k]) await cs[k].click(); await pg.waitForTimeout(250); }
  await pg.evaluate(() => document.querySelector('#sheet').scrollTo(0, 0)); await shot('01c-fancy-picked');
  await pg.click('[data-act="fancy-plan"]'); await pg.waitForTimeout(4000); await shot('01d-planned');
  console.log('planned:', await pg.evaluate(() => [...document.querySelectorAll('.meal .ttl')].map(x => x.textContent).join(' | ')));
  await pg.click('[data-act="clear"]'); await pg.waitForTimeout(200); await pg.click('[data-act="clear-yes"]'); await pg.waitForTimeout(400);
  await pg.click('[data-act="fill"]'); await pg.waitForTimeout(5000); await shot('02-week-filled'); await wide('week');
  await pg.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await pg.waitForTimeout(200); await shot('03-week-bottom');
  await pg.evaluate(() => window.scrollTo(0, 0));
  const lock = await pg.$('[data-act="lock"]'); if (lock) { await lock.click(); await pg.waitForTimeout(400); await shot('04-locked'); }
  await pg.click('[data-act="tab"][data-v="recipes"]'); await pg.waitForTimeout(500); await shot('05-recipes'); await wide('recipes');
  await pg.click('[data-act="more-filters"]'); await pg.waitForTimeout(300); await shot('05b-recipes-filters'); await pg.click('[data-act="more-filters"]'); await pg.waitForTimeout(300);
  await pg.evaluate(() => { const b = document.createElement('button'); b.dataset.act = 'open-recipe'; b.dataset.v = 'in_chicken_tikka_masala'; document.body.appendChild(b); b.click(); }); await pg.waitForTimeout(500); await shot('06-recipe-sheet'); await wide('sheet');
  const add = await pg.$$('[data-act="add-to-day"]'); console.log('add buttons', add.length); if (add.length) { await add[add.length - 1].click(); await pg.waitForTimeout(250); await shot('07-toast'); }
  const cook = await pg.$('#sheet [data-act="cook"]'); console.log('cook btn', !!cook); if (cook) { await cook.click(); await pg.waitForTimeout(500); await shot('08-cook'); await wide('cook'); for (let i = 0; i < 3; i++) { await pg.click('[data-act="cook-next"]').catch(() => {}); await pg.waitForTimeout(150); } await shot('08b-cook-step4'); await pg.evaluate(() => { const c = document.querySelector('.cbody'); c.scrollTop = c.scrollHeight; }); await shot('08c-cook-scrolled'); console.log('cbody scroll', await pg.evaluate(() => { const c = document.querySelector('.cbody'); return [c.scrollHeight, c.clientHeight, c.scrollTop]; })); await pg.setViewportSize({ width: 844, height: 340 }); await pg.waitForTimeout(300); await shot('09-cook-landscape'); console.log('landscape scroll', await pg.evaluate(() => { const c = document.querySelector('.cbody'); return [c.scrollHeight, c.clientHeight]; })); await pg.setViewportSize({ width: 390, height: 664 }); await pg.keyboard.press('Escape'); await pg.waitForTimeout(300); }
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);
  await pg.click('[data-act="tab"][data-v="shop"]'); await pg.waitForTimeout(500); await shot('10-shop'); await wide('shop');
  await pg.click('[data-act="tab"][data-v="kitchen"]'); await pg.waitForTimeout(500);
  await pg.evaluate(() => document.querySelectorAll('.pgroup').forEach(d => d.open = true)); await pg.waitForTimeout(200); await shot('11-kitchen'); await wide('kitchen');
  await pg.click('[data-act="tab"][data-v="settings"]'); await pg.waitForTimeout(500); await shot('12-settings'); await wide('settings');
  await pg.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2)); await shot('13-settings-mid');
  await pg.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await shot('14-settings-bottom');
  const look = await pg.$('.swatches'); if (look) { await look.scrollIntoViewIfNeeded(); await pg.evaluate(() => window.scrollBy(0, -120)); await shot('15-look'); }
  await pg.click('[data-act="look"][data-k="palette"][data-v="ocean"]'); await pg.waitForTimeout(200); await pg.click('[data-act="tab"][data-v="week"]'); await pg.waitForTimeout(300); await shot('16-ocean-dark');
  await pg.click('[data-act="tab"][data-v="settings"]'); await pg.waitForTimeout(300); await pg.click('[data-act="look"][data-k="theme"][data-v="light"]'); await pg.click('[data-act="look"][data-k="palette"][data-v="berry"]'); await pg.click('[data-act="tab"][data-v="week"]'); await pg.waitForTimeout(300); await shot('17-berry-light');
  await pg.click('[data-act="tab"][data-v="kitchen"]'); await pg.waitForTimeout(300); await pg.evaluate(() => document.querySelectorAll('.pgroup').forEach(d => d.open = true)); await pg.evaluate(() => { const g = document.querySelector('.pgroup'); g && g.scrollIntoView(); }); await shot('18-kitchen-light');
  await b.close(); srv.close();
})();
