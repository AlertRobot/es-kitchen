// Backup to a (pretend) Google Sheet, wipe the week, restore it from the sheet; plus the backup file.
const { JSDOM } = require('jsdom'); const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../public/index.html', 'utf8').replace(/<script src="(app|firebase-config)\.js[^"]*"><\/script>/g, '');
const lib = fs.readFileSync(__dirname + '/../public/data/library.json', 'utf8');
const SHEET = { tabs: {}, posts: [] };
function sheetServer(body) {
  SHEET.posts.push(body.action);
  if (body.key !== 'k123') return { ok: false, error: 'Wrong backup key.' };
  if (body.action === 'ping') return { ok: true, sheetUrl: 'https://docs.google.com/spreadsheets/d/x', sheetName: 'E&S Kitchen backup' };
  if (body.action === 'backup') { for (const n in body.tables) { const t = body.tables[n]; const owner = t.rows.length && t.rows[0][0] === 'library' ? 'library' : body.hid; const keep = (SHEET.tabs[n] ? SHEET.tabs[n].rows : []).filter(r => r[0] !== owner); SHEET.tabs[n] = { cols: t.cols, rows: keep.concat(t.rows.map(r => r.map(c => c == null ? '' : typeof c === 'object' ? JSON.stringify(c) : String(c)))) }; } return { ok: true, sheetUrl: 'https://docs.google.com/spreadsheets/d/x' }; }
  if (body.action === 'restore') { const parts = {}; (SHEET.tabs.Docs.rows || []).filter(r => r[0] === body.hid).forEach(r => (parts[r[1]] = parts[r[1]] || []).push([Number(r[2]), r[4]])); return { ok: true, docs: Object.keys(parts).map(p => ({ path: p, data: JSON.parse(parts[p].sort((a, b) => a[0] - b[0]).map(x => x[1]).join('')) })), at: '2026-10-26T10:00:00Z', by: 'Ethan' }; }
  return { ok: false, error: 'Unknown action' };
}
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://x.github.io/es-kitchen/', beforeParse(w) {
  w.fetch = async (url, opt) => { if (/script\.google\.com/.test(url)) { const r = sheetServer(JSON.parse(opt.body)); return { ok: true, text: async () => JSON.stringify(r) }; } return { ok: true, json: async () => JSON.parse(lib) }; };
  w.scrollTo = () => {}; w.URL.createObjectURL = b => { w.__blob = b; return 'blob:x'; }; w.URL.revokeObjectURL = () => {};
} });
const w = dom.window, d = w.document;
const s = d.createElement('script'); s.textContent = fs.readFileSync(__dirname + '/app.test.js', 'utf8'); d.body.appendChild(s);
const wait = ms => new Promise(r => setTimeout(r, ms));
const click = sel => { const el = d.querySelector(sel); if (!el) { console.log('MISSING', sel); return; } el.click(); };
const txt = sel => (d.querySelector(sel) || { textContent: 'MISSING ' + sel }).textContent.replace(/\s+/g, ' ').trim();
const dinners = () => [...d.querySelectorAll('.meal .ttl')].map(x => x.textContent).join(' | ');
(async () => {
  await wait(150); d.querySelector('[data-form="create"]').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(600);
  click('[data-act="fill"]'); await wait(5000);
  const before = dinners(); console.log('1 planned:', before.slice(0, 120));
  click('[data-act="tab"][data-v="settings"]'); await wait(150); click('[data-act="set-page"][data-v="backup"]'); await wait(150);
  // wrong key first
  d.querySelector('#bk-url').value = 'https://script.google.com/macros/s/abc/exec'; d.querySelector('#bk-key').value = 'nope';
  d.querySelector('[data-form="backup-connect"]').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(400);
  console.log('2 wrong key ->', txt('#toast'));
  d.querySelector('#bk-key').value = 'k123';
  d.querySelector('[data-form="backup-connect"]').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(1500);
  console.log('3 connected, posts:', SHEET.posts.join(','), '| status:', txt('.backupstat'));
  console.log('  tabs:', Object.keys(SHEET.tabs).map(n => n + ' ' + SHEET.tabs[n].rows.length).join(', '));
  const wk = SHEET.tabs.Weeks.rows.filter(r => r[5]).slice(0, 3).map(r => r[2] + ': ' + r[5]).join(' | '); console.log('  Weeks rows:', wk);
  console.log('  Accounts:', JSON.stringify(SHEET.tabs.Accounts.rows[0]));
  console.log('  Recipes sample:', SHEET.tabs.Recipes.rows[0].slice(1, 12).join(' / ').slice(0, 160));
  console.log('  Shopping rows:', SHEET.tabs.Shopping.rows.length, '| first:', SHEET.tabs.Shopping.rows[0] && SHEET.tabs.Shopping.rows[0].slice(2, 8).join(' / '));
  const big = Math.max(...Object.values(SHEET.tabs).flatMap(t => t.rows.flatMap(r => r.map(c => String(c).length)))); console.log('  biggest cell', big, 'chars (limit 50,000)');
  // second backup should not duplicate household rows
  const n1 = SHEET.tabs.Weeks.rows.length; click('[data-act="backup-now"]'); await wait(1500); console.log('4 after 2nd backup Weeks rows', n1, '->', SHEET.tabs.Weeks.rows.length);
  // wipe the week, then restore from the sheet
  click('[data-act="tab"][data-v="week"]'); await wait(200); click('[data-act="clear"]'); await wait(100); click('[data-act="clear-yes"]'); await wait(400);
  console.log('5 after clearing:', dinners() || '(empty)');
  click('[data-act="tab"][data-v="settings"]'); await wait(150); console.log('  settings reopens on:', txt('#app h1'));
  click('[data-act="restore-sheet"]'); await wait(800); console.log('6 restore prompt:', txt('#app .panel h2'), '|', txt('#app .panel p.small').slice(0, 140));
  click('[data-act="restore-yes"]'); await wait(1500);
  click('[data-act="tab"][data-v="week"]'); await wait(400); const after = dinners(); console.log('7 restored week matches:', after === before, '|', after.slice(0, 80));
  // backup file round trip
  click('[data-act="tab"][data-v="settings"]'); await wait(150);
  click('[data-act="backup-file"]'); await wait(800); const file = w.__blob ? JSON.parse(await new Promise(r => { const fr = new w.FileReader(); fr.onload = () => r(fr.result); fr.readAsText(w.__blob); })) : null;
  console.log('8 file:', file ? file.app + ' · ' + file.docs.length + ' records · ' + file.docs.map(x => x.path.split('/')[0]).filter((x, i, a) => a.indexOf(x) === i).join(',') : 'none', '| toast', txt('#toast'));
  console.log('  includes backup key?', JSON.stringify(file).includes('k123'));
  process.exit(0);
})();
