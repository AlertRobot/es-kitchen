// Phone-size check in a real browser (Playwright + Chromium) with the in-memory store: no screen scrolls sideways,
// and no tab or option label is cut off, at the narrowest common width and on a Galaxy with the larger text setting.
// Needs test/app.test.js built first. Exits 1 if anything fails.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const APP = path.join(__dirname, '..');
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'peckish-phone-'));
fs.writeFileSync(ROOT + '/index.html', fs.readFileSync(APP + '/public/index.html', 'utf8').replace('<script src="firebase-config.js"></script>', '').replace('app.js?v=__VERSION__', 'app.test.js'));
fs.copyFileSync(APP + '/test/app.test.js', ROOT + '/app.test.js');
for (const d of ['data', 'fonts', 'icons']) fs.cpSync(APP + '/public/' + d, ROOT + '/' + d, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
let fails = 0; const ok = (c, what) => { console.log((c ? 'ok   ' : 'FAIL ') + what); if (!c) fails++; };
(async () => {
  await new Promise(r => srv.listen(0, r)); const url = 'http://localhost:' + srv.address().port + '/';
  const b = await chromium.launch();
  for (const [w, hgt, large] of [[360, 740, false], [412, 915, true]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: hgt }, isMobile: true, hasTouch: true });
    if (large) await ctx.addInitScript(() => { try { localStorage.setItem('esk-look', JSON.stringify({ size: 'large' })); } catch (e) {} });
    const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.goto(url); await pg.waitForTimeout(700);
    const ev = (f, a) => pg.evaluate(f, a);
    const act = async (a, v, ms) => { await ev(([a, v]) => { const x = document.createElement('button'); x.dataset.act = a; if (v != null) x.dataset.v = v; document.body.appendChild(x); x.click(); x.remove(); }, [a, v]); await pg.waitForTimeout(ms || 350); };
    const submit = async (sel, ms) => { await ev(s => document.querySelector(s).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })), sel); await pg.waitForTimeout(ms || 500); };
    const bad = [];
    const look = async name => {
      const r = await ev(() => {
        const out = [], VW = document.documentElement.clientWidth;
        if (document.documentElement.scrollWidth > VW + 1) out.push('scrolls sideways');
        document.querySelectorAll('.seg button').forEach(x => { if (x.offsetParent && x.scrollWidth > x.clientWidth + 1) out.push('"' + x.textContent.trim() + '" cut off'); });
        return out;
      });
      r.forEach(x => bad.push(name + ': ' + x));
    };
    await submit('[data-form="create"]', 800);
    await act('tab', 'settings'); await act('set-page', 'people'); await ev(() => { document.querySelector('#np-name').value = 'Sophie'; }); await submit('[data-form="add-person"]');
    await act('tab', 'week'); await act('fill', null, 7000); await look('week');
    await act('tab', 'recipes', 600); await look('recipes');
    await act('tab', 'shop', 600); await look('shop');
    await act('tab', 'kitchen', 500); await look('kitchen');
    await act('tab', 'settings', 400); for (const p of ['planning', 'linked', 'look']) { await act('set-page', p, 400); await look('settings ' + p); await act('set-page', ''); }
    ok(!bad.length, w + 'px' + (large ? ', larger text' : '') + ': every label fits and nothing scrolls sideways' + (bad.length ? ' (' + bad.slice(0, 6).join('; ') + ')' : ''));
    ok(!errs.length, w + 'px: no page errors ' + errs.join(' | '));
    await ctx.close();
  }
  await b.close(); srv.close(); fs.rmSync(ROOT, { recursive: true, force: true });
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
