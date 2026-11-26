// Phone-size check in a real browser (Playwright + Chromium) with the in-memory store: no screen scrolls sideways,
// and no tab or option label is cut off, at the narrowest common width and on a Galaxy (412px), each with and without
// the larger text setting, and on a Galaxy with Chrome's text zoom at 130%. The household has its real, longer names
// (Ethan Whitfield, Sophie Marchetti, Ethan Whitfield Sr), so no button, tab, chip or tag runs past its edge or its card, and
// no one-line button wraps; and a row of buttons is never left ragged (two on a line and one under them).
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
// The shopping list's "In the cupboard?" check (26 Nov 2026): staples this week's meals use that nobody has said they have
// are listed with what they're for and Got it / Need it. Need it puts one in Cupboard top-ups; Got it (or Got them all)
// clears it, and it isn't asked again. The rows fit at phone widths.
(async () => {
  await new Promise(r => srv.listen(0, r)); const url = 'http://localhost:' + srv.address().port + '/';
  const b = await chromium.launch();
  for (const [w, hgt] of [[317, 704], [412, 915]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: hgt }, isMobile: true, hasTouch: true });
    const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.goto(url); await pg.waitForTimeout(700);
    const ev = (f, a) => pg.evaluate(f, a);
    const act = async (a, v, ms) => { await ev(([a, v]) => { const x = document.createElement('button'); x.dataset.act = a; if (v != null) x.dataset.v = v; document.body.appendChild(x); x.click(); x.remove(); }, [a, v]); await pg.waitForTimeout(ms == null ? 250 : ms); };
    await ev(() => { document.querySelector('#cr-me').value = 'Ethan'; document.querySelector('[data-form="create"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await pg.waitForTimeout(800);
    await act('tab', 'week', 300); await act('fill', null, 6000);
    await act('tab', 'shop', 500);
    const rows = await ev(() => [...document.querySelectorAll('#sec-cupcheck .pantryrow')].map(r => ({ id: r.querySelector('[data-act="pantry"]').dataset.v, text: r.innerText.replace(/\s+/g, ' ') })));
    ok(rows.length > 0, w + 'px: the list asks about cupboard staples the week uses (' + rows.slice(0, 4).map(r => r.text).join(' / ') + ')');
    ok(rows.every(r => / for (Mon|Tue|Wed|Thu|Fri|Sat|Sun)/.test(' ' + r.text)), w + 'px: each says what it\'s for');
    const fit = await ev(() => { const VW = document.documentElement.clientWidth; return [...document.querySelectorAll('#sec-cupcheck button')].every(x => { const r = x.getBoundingClientRect(); return r.right <= VW + 1 && x.scrollWidth <= x.clientWidth + 1; }) && document.documentElement.scrollWidth <= VW + 1; });
    ok(fit, w + 'px: its buttons fit and nothing scrolls sideways');
    const first = rows[0].id;
    await ev(id => document.querySelector('#sec-cupcheck [data-act="pantry"][data-v="' + id + '"][data-s="out"]').click(), first); await pg.waitForTimeout(400);
    const moved = await ev(id => ({ inTop: !!document.querySelector('#sec-topups [data-act="tick"][data-v="' + id + '"]'), stillAsked: !!document.querySelector('#sec-cupcheck [data-v="' + id + '"]') }), first);
    ok(moved.inTop && !moved.stillAsked, w + 'px: Need it moves ' + first + ' into Cupboard top-ups');
    if (rows.length > 1) {
      const second = rows[1].id;
      await ev(id => document.querySelector('#sec-cupcheck [data-act="pantry"][data-v="' + id + '"][data-s="have"]').click(), second); await pg.waitForTimeout(400);
      ok(!(await ev(id => !!document.querySelector('#sec-cupcheck [data-v="' + id + '"]'), second)), w + 'px: Got it stops asking about ' + second);
    }
    const all = await ev(() => { const x = document.querySelector('#sec-cupcheck [data-act="pantry-all"]'); if (x) x.click(); return !!x; }); await pg.waitForTimeout(400);
    if (all) ok(!(await ev(() => !!document.querySelector('#sec-cupcheck'))), w + 'px: Got them all clears the check');
    await act('tab', 'kitchen', 400);
    const kit = await ev(id => { const b = document.querySelector('[data-act="pantry"][data-v="' + id + '"][data-s="have"]'); return b ? b.className : 'missing'; }, rows[0].id);
    ok(kit !== 'missing' && !/\bon\b/.test(kit), w + 'px: the pantry shows the one you need as not got');
    ok(!errs.length, w + 'px: no errors ' + errs.slice(0, 2).join(' | '));
    await ctx.close();
  }
  await b.close(); srv.close(); fs.rmSync(ROOT, { recursive: true, force: true });
  process.exit(fails ? 1 : 0);
})();
