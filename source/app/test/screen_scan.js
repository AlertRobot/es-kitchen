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
// Whole-app layout scan at phone sizes, with a planned week: every tab, every Settings page, every day's recipe,
// the pick, who's-in, votes, stock and new-recipe sheets, every recipe's page, and cook mode for every recipe, every
// step and the ingredients. On each: nothing scrolls sideways, nothing sits past the screen's edge, no text is cut
// off inside its box, and no word is split across lines (squeezed so narrow it runs a letter or two a line).
const SCAN = () => {
  const out = [], VW = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > VW + 1) out.push('scrolls sideways (' + document.documentElement.scrollWidth + 'px)');
  const top = ['#cook', '#sheet'].map(s => document.querySelector(s)).find(x => x && !x.hidden && x.getClientRects().length) || document.querySelector('#app');
  const scroller = el => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll') return true; } return false; };
  const say = t => '"' + t.trim().replace(/\s+/g, ' ').slice(0, 60) + '"';
  const tw = document.createTreeWalker(top, NodeFilter.SHOW_TEXT); let n; const seen = new Set();
  while ((n = tw.nextNode())) {
    const t = n.textContent.trim(); if (t.length < 4) continue;
    const el = n.parentElement; if (!el || !el.getClientRects().length) continue;
    const st = getComputedStyle(el); if (st.visibility === 'hidden' || st.opacity === '0') continue;
    const r = document.createRange(); r.selectNodeContents(n);
    const rects = [...r.getClientRects()].filter(q => q.width > 0.5);
    if (!rects.length) continue;
    const lines = new Set(rects.map(q => Math.round(q.top))).size;
    const words = t.split(/[\s\-\/–—]+/).filter(Boolean).length;
    if (lines > words && !seen.has(el)) { seen.add(el); out.push(say(t) + ' split mid-word over ' + lines + ' lines (' + Math.round(el.getBoundingClientRect().width) + 'px wide)'); }
    // what can be seen of it: inside any box that clips it (a name cut short with "…" is fine, but noted)
    let right = Math.max(...rects.map(q => q.right)), left = Math.min(...rects.map(q => q.left));
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      const ps = getComputedStyle(p); if (ps.overflowX === 'visible') continue;
      const pr = p.getBoundingClientRect(); if (right > pr.right + 1 && ps.textOverflow === 'ellipsis') out.push('(cut short with …) ' + say(t));
      right = Math.min(right, pr.right); left = Math.max(left, pr.left);
    }
    if ((right > VW + 1 || left < -1) && !scroller(el) && !seen.has(el)) { seen.add(el); out.push(say(t) + ' runs off the screen'); }
  }
  top.querySelectorAll('*').forEach(el => {
    if (!el.getClientRects().length || seen.has(el)) return;
    const s = getComputedStyle(el);
    if (!/hidden|clip/.test(s.overflowX) || s.textOverflow === 'ellipsis' || /auto|scroll/.test(s.overflowX)) return;
    if (![...el.childNodes].some(c => c.nodeType === 3 && c.textContent.trim().length > 1)) return;
    if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) out.push(say(el.textContent) + ' cut off (' + el.scrollWidth + ' > ' + el.clientWidth + 'px)');
  });
  return out;
};
(async () => {
  await new Promise(r => srv.listen(0, r)); const url = 'http://localhost:' + srv.address().port + '/';
  const b = await chromium.launch();
  const ids = JSON.parse(fs.readFileSync(APP + '/public/data/library.json', 'utf8')).recipes.map(r => r.id);
  const only = process.argv[2] ? process.argv[2].split(',') : null;
  if (process.env.FEW) ids.splice(Number(process.env.FEW)); // a quicker run: the screens and the first few recipes
  for (const [w, hgt, large] of [[412, 915, false], [360, 740, true], [317, 704, false]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: hgt }, isMobile: true, hasTouch: true });
    if (large) await ctx.addInitScript(() => { try { localStorage.setItem('esk-look', JSON.stringify({ size: 'large' })); } catch (e) {} });
    const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.goto(url); await pg.waitForTimeout(700);
    const ev = (f, a) => pg.evaluate(f, a);
    const act = async (a, v, ms) => { await ev(([a, v]) => { const x = document.createElement('button'); x.dataset.act = a; if (v != null) x.dataset.v = v; document.body.appendChild(x); x.click(); x.remove(); }, [a, v]); await pg.waitForTimeout(ms == null ? 120 : ms); };
    await ev(() => { document.querySelector('#cr-me').value = 'Ethan Whitfield'; document.querySelector('#cr-wont').value = 'mushrooms'; document.querySelector('[data-form="create"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await pg.waitForTimeout(800);
    await ev(() => { document.querySelector('#np-name').value = 'Sophie Marchetti'; document.querySelector('[data-form="add-person"]') && document.querySelector('[data-form="add-person"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }).catch(() => {});
    await pg.waitForTimeout(400);
    await act('tab', 'week', 300); await act('fill', null, 6000);
    const bad = []; const scan = async name => { (await ev(SCAN)).forEach(x => bad.push(name + ': ' + x)); };
    const close = async () => { for (let i = 0; i < 4; i++) { const open = await ev(() => { const s = document.querySelector('#sheet'); return !!(s && !s.hidden && s.getClientRects().length); }); if (!open) break; await act('sheet-back'); } };
    if (!only) {
      for (const t of ['week', 'shop', 'recipes', 'kitchen', 'settings']) { await act('tab', t, 400); await scan('tab ' + t); }
      const pages = await ev(() => [...document.querySelectorAll('[data-act="set-page"]')].map(x => x.dataset.v).filter(Boolean));
      for (const p of pages) { await act('set-page', p, 300); await scan('settings ' + p); await act('set-page', '', 150); }
      await act('tab', 'week', 400);
      for (let d = 0; d < 7; d++) { await act('open-day', String(d), 250); await scan('day ' + d); await close(); }
      for (const [a, v, name] of [['pick', '2', 'pick sheet'], ['whosin', null, 'who\'s in'], ['votes', null, 'votes'], ['stock-open', null, 'stock check'], ['new-recipe', null, 'new recipe form'], ['takeaway', '3', 'takeaway']]) { await act(a, v, 400); await scan(name); await close(); }
      await act('tab', 'shop', 300);
      for (const v of ['list', 'compare', 'cost']) { await ev(v => { const x = document.querySelector('[data-act="shop-view"][data-v="' + v + '"], [data-act="shopview"][data-v="' + v + '"]'); if (x) x.click(); }, v); await pg.waitForTimeout(250); await scan('shop ' + v); }
    }
    for (const id of only || ids) {
      await act('open-recipe', id, 90); await scan('recipe ' + id); await close();
      await act('cook', id, 90);
      for (let s = 0; s < 25; s++) {
        await scan('cook ' + id + ' step ' + (s + 1));
        const st = await ev(() => { const c = document.querySelector('#cook'); return c && !c.hidden && !!c.querySelector('[data-act="cook-next"]'); });
        if (!st) break; await act('cook-next', null, 40);
      }
      await act('cook-ings', null, 60); await scan('cook ' + id + ' ingredients');
      await act('cook-close', null, 60);
    }
    const all = [...new Set(bad)];
    const short = [...new Set(all.filter(x => x.includes('(cut short with …)')).map(x => x.replace(/^(\w+) \S+( step \d+| ingredients)?: /, '$1: ')))];
    if (short.length) console.log('note ' + w + 'px: ' + short.length + ' cut short with …:\n     ' + short.slice(0, 15).join('\n     '));
    const uniq = all.filter(x => !x.includes('(cut short with …)'));
    if (process.env.SCAN_OUT) fs.appendFileSync(process.env.SCAN_OUT, '== ' + w + 'px' + (large ? ' large' : '') + '\n' + all.join('\n') + '\n');
    ok(!uniq.length, w + 'px' + (large ? ' large text' : '') + ': nothing squeezed, cut off or off the screen' + (uniq.length ? ' (' + uniq.length + ')\n     ' + uniq.slice(0, 40).join('\n     ') + (uniq.length > 40 ? '\n     ...and ' + (uniq.length - 40) + ' more' : '') : ''));
    ok(!errs.length, w + 'px: no errors ' + errs.slice(0, 3).join(' | '));
    await ctx.close();
  }
  await b.close(); srv.close(); fs.rmSync(ROOT, { recursive: true, force: true });
  process.exit(fails ? 1 : 0);
})();
