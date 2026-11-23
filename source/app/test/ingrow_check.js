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
// Ingredient rows (recipe page and cook mode) at phone widths: the ingredient's name always keeps room for its words,
// however long the amount beside it ("1, half in chunky petals, half finely chopped"), so no name breaks letter by letter.
(async () => {
  await new Promise(r => srv.listen(0, r)); const url = 'http://localhost:' + srv.address().port + '/';
  const b = await chromium.launch();
  const ids = JSON.parse(fs.readFileSync(APP + '/public/data/library.json', 'utf8')).recipes.map(r => r.id);
  for (const [w, hgt, large] of [[317, 704, false], [360, 740, true], [412, 915, false]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: hgt }, isMobile: true, hasTouch: true });
    if (large) await ctx.addInitScript(() => { try { localStorage.setItem('esk-look', JSON.stringify({ size: 'large' })); } catch (e) {} });
    const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.goto(url); await pg.waitForTimeout(700);
    const ev = (f, a) => pg.evaluate(f, a);
    await ev(() => { document.querySelector('#cr-me').value = 'Ethan'; document.querySelector('#cr-wont').value = ''; document.querySelector('[data-form="create"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await pg.waitForTimeout(800);
    const bad = [];
    for (const id of ids) {
      for (const where of ['recipe', 'cook']) {
        const r = await ev(async ([id, where]) => {
          const go = (a, v) => { const x = document.createElement('button'); x.dataset.act = a; if (v != null) x.dataset.v = v; document.body.appendChild(x); x.click(); x.remove(); };
          const sleep = ms => new Promise(r => setTimeout(r, ms));
          if (where === 'recipe') go('open-recipe', id); else { go('cook', id); await sleep(60); if (!document.querySelector('#cook .ings')) go('cook-ings'); }
          await sleep(80);
          const box = document.querySelector(where === 'cook' ? '#cook' : '#sheet');
          const out = [];
          box.querySelectorAll('.ing').forEach(row => {
            const name = row.firstElementChild; if (!name) return;
            // no word split across lines (a hyphenated one can break at its hyphen)
            const words = name.textContent.trim().split(/\s+/);
            const rg = document.createRange(); const tn = [...name.childNodes].find(n => n.nodeType === 3);
            if (!tn) return; rg.selectNodeContents(tn);
            const lines = new Set([...rg.getClientRects()].filter(q => q.width > 0.5).map(q => Math.round(q.top))).size;
            const nameW = name.getBoundingClientRect().width, rowW = row.getBoundingClientRect().width;
            if (lines > tn.textContent.trim().split(/[\s-]+/).length || nameW < rowW * 0.3) out.push(tn.textContent.trim() + ' (' + Math.round(nameW) + 'px of ' + Math.round(rowW) + ', ' + lines + ' lines) beside "' + row.lastElementChild.textContent.trim().slice(0, 50) + '"');
          });
          if (where === 'cook') go('cook-close'); else go('sheet-back');
          await sleep(60);
          return out;
        }, [id, where]);
        r.forEach(x => bad.push(where + ' ' + id + ': ' + x));
      }
    }
    ok(!bad.length, w + 'px' + (large ? ' large text' : '') + ': every ingredient name has room beside its amount, on the recipe page and when cooking' + (bad.length ? '\n     ' + bad.slice(0, 12).join('\n     ') + (bad.length > 12 ? '\n     ...and ' + (bad.length - 12) + ' more' : '') : ''));
    ok(!errs.length, w + 'px: no errors ' + errs.slice(0, 2).join(' | '));
    await ctx.close();
  }
  await b.close(); srv.close(); fs.rmSync(ROOT, { recursive: true, force: true });
  process.exit(fails ? 1 : 0);
})();
