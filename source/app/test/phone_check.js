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
(async () => {
  await new Promise(r => srv.listen(0, r)); const url = 'http://localhost:' + srv.address().port + '/';
  const b = await chromium.launch();
  // (Chrome's 130% text zoom lays a 412px phone out as if it were 317px wide)
  for (const [w, hgt, large, zoom] of [[360, 740, false], [360, 740, true], [412, 915, false], [412, 915, true], [317, 704, false, true]]) {
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
        // a recipe card's time, calories and price are never cut short
        document.querySelectorAll('.vcard .vb .small').forEach(x => { if (x.offsetParent && x.scrollWidth > x.clientWidth + 1) out.push('card "' + x.textContent.trim() + '" cut off'); });
        // every button, tab, chip and tag on the screen showing (a sheet covers the tab under it): its text stays inside it,
        // it stays inside its row or card, and a one-line label stays on one line (a card button with parts is several)
        const top = ['#cook', '#sheet'].map(s => document.querySelector(s)).find(x => x && !x.hidden) || document.querySelector('#app');
        const lines = el => { const rs = []; const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n; while ((n = tw.nextNode())) { if (!n.textContent.trim()) continue; const r = document.createRange(); r.selectNodeContents(n); for (const q of r.getClientRects()) if (q.width > 0.5) rs.push(q); } rs.sort((a, b) => a.top - b.top); let k = 0, bottom = -1e9; for (const q of rs) { if ((q.top + q.bottom) / 2 > bottom) { k++; bottom = q.bottom; } else bottom = Math.max(bottom, q.bottom); } return k; };
        top.querySelectorAll('button, a.btn, label.btn, .chip, .tag, .seg').forEach(x => {
          if (!x.getClientRects().length) return;
          const s = getComputedStyle(x), say = '"' + (x.textContent.trim().replace(/\s+/g, ' ') || x.getAttribute('aria-label')) + '"';
          if (s.textOverflow !== 'ellipsis' && x.clientWidth && x.scrollWidth > x.clientWidth + 1 && !/auto|scroll/.test(s.overflowX)) out.push(say + ' runs past its edge');
          const p = x.parentElement, ps = getComputedStyle(p), r = x.getBoundingClientRect(), pr = p.getBoundingClientRect();
          if (!/auto|scroll/.test(ps.overflowX) && (r.right > pr.right + 1 || r.left < pr.left - 1)) out.push(say + ' sticks out of its row');
          const card = [...x.querySelectorAll('*')].some(d => !d.closest('svg') && /^(block|grid|flex)$/.test(getComputedStyle(d).display) && d.textContent.trim());
          if (!card && !x.matches('.tag, .seg') && lines(x) > 1) out.push(say + ' wraps onto ' + lines(x) + ' lines');
        });
        // a row of buttons is all on one line, or stacked one a line at the full width: never two with one left over
        top.querySelectorAll('*').forEach(row => {
          const kids = [...row.children].filter(k => k.getClientRects().length);
          if (kids.length < 2 || !kids.every(k => k.classList.contains('btn'))) return;
          const at = kids.map(k => Math.round(k.getBoundingClientRect().top)), ws = kids.map(k => Math.round(k.getBoundingClientRect().width));
          const lineN = new Set(at).size;
          if (lineN > 1 && (lineN < kids.length || Math.max(...ws) - Math.min(...ws) > 1)) out.push('buttons "' + kids.map(k => k.textContent.trim()).join('", "') + '" sit ' + lineN + ' lines for ' + kids.length);
        });
        return out;
      });
      r.forEach(x => bad.push(name + ': ' + x));
    };
    await ev(() => { document.querySelector('#cr-me').value = 'Ethan Whitfield'; document.querySelector('#cr-wont').value = 'mushrooms, onion'; });
    await submit('[data-form="create"]', 800);
    await act('tab', 'settings'); await act('set-page', 'people');
    for (const n of ['Sophie Marchetti', 'Ethan Whitfield Sr']) { await ev(n => { document.querySelector('#np-name').value = n; }, n); await submit('[data-form="add-person"]'); }
    const ids = await ev(() => [...document.querySelectorAll('[data-act="set-person"]')].map(b => b.dataset.v));
    await act('set-person', ids[1]); await ev(id => { document.querySelector('#pa-' + id + '-wontEat').value = 'onion'; }, ids[1]); await submit('[data-form="pref-add"][data-k="wontEat"][data-v="' + ids[1] + '"]');
    await look('settings people'); await act('rm-person', ids[2]); await act('set-person', ids[2]); await act('rm-person', ids[2]); await look('settings people, remove'); await act('set-page', '');
    // (nothing planned yet: the Shop tab still has the shop log)
    await act('tab', 'shop', 600); await look('shop, nothing planned');
    await act('tab', 'week'); await act('fill', null, 7000); await look('week');
    await act('week-view', 'bl', 500); await look('breakfast & lunch'); await act('week-view', 'dinners', 300);
    await act('open-day', '2', 600); await look('a dinner'); await act('sheet-back');
    await act('pick', '0', 700); await look('choosing a dinner'); await act('sheet-back');
    await act('whosin', null, 500); await look('who\u2019s in'); await act('sheet-back');
    await act('wk', '1', 600); await look('next week'); await act('wk-this', null, 500);
    await act('tab', 'recipes', 600); await look('recipes'); await act('f-meal-set', 'lunch', 600); await look('recipes lunches'); await act('f-meal-set', '', 300);
    await act('tab', 'shop', 600); await look('shop'); await act('shop-view', 'cost', 600); await look('shop costs'); await act('shop-view', 'list', 300);
    await act('tab', 'kitchen', 500); await look('kitchen');
    await act('tab', 'settings', 400); for (const p of ['household', 'planning', 'linked', 'look', 'account']) { await act('set-page', p, 400); await look('settings ' + p); await act('set-page', ''); }
    ok(!bad.length, w + 'px' + (zoom ? ' (412px at 130% zoom)' : '') + (large ? ', larger text' : '') + ': every label fits and nothing scrolls sideways' + (bad.length ? ' (' + bad.slice(0, 6).join('; ') + ')' : ''));
    ok(!errs.length, w + 'px: no page errors ' + errs.join(' | '));
    await ctx.close();
  }
  await b.close(); srv.close(); fs.rmSync(ROOT, { recursive: true, force: true });
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
