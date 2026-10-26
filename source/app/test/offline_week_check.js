// Saturday: next week is planned, this week isn't. The app should open on next week, and an offline start with no database copy uses the phone's backup.
const { JSDOM } = require('jsdom'); const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../public/index.html', 'utf8').replace(/<script src="(app|firebase-config)\.js[^"]*"><\/script>/g, '');
const lib = fs.readFileSync(__dirname + '/../public/data/library.json', 'utf8');
function boot(pre) {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://x.github.io/es-kitchen/', beforeParse(w) { w.fetch = async () => ({ ok: true, json: async () => JSON.parse(lib) }); w.scrollTo = () => {}; pre && pre(w); } });
  const w = dom.window; const s = w.document.createElement('script'); s.textContent = fs.readFileSync(__dirname + '/app.test.js', 'utf8'); w.document.body.appendChild(s); return w;
}
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  let w = boot(); const d = w.document;
  await wait(150); d.querySelector('[data-form="create"]').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(500);
  console.log('opens on:', d.querySelector('.weeknav .title').textContent.replace(/\s+/g, ' '));
  d.querySelector('[data-act="wk"][data-v="1"]').click(); await wait(300); d.querySelector('[data-act="fill"]').click(); await wait(5000);
  const planned = [...d.querySelectorAll('.meal .ttl')].length; console.log('planned next week:', planned, 'dinners');
  const docs = w.__docs; const ls = Object.keys(w.localStorage).filter(k => k.startsWith('esk-wk:')); console.log('backup copies on phone:', ls.length);
  // restart the app (same data), as on Saturday evening
  const saved = new Map(docs); const lsCopy = {}; ls.forEach(k => lsCopy[k] = w.localStorage.getItem(k));
  w = boot(w2 => { w2.__preDocs = saved; }); await wait(1200);
  console.log('reopened online, opens on:', w.document.querySelector('.weeknav .title').textContent.replace(/\s+/g, ' '), '| dinners', w.document.querySelectorAll('.meal .ttl').length);
  w.document.querySelector('[data-act="tab"][data-v="shop"]').click(); await wait(300); console.log('  shop list items:', w.document.querySelectorAll('.item').length);
  // offline, and the database has no copy of the weeks: the phone's backup is used
  w = boot(w2 => { w2.__preDocs = saved; w2.__noCache = true; Object.defineProperty(w2.navigator, 'onLine', { value: false, configurable: true }); Object.keys(lsCopy).forEach(k => w2.localStorage.setItem(k, lsCopy[k])); }); await wait(1200);
  console.log('offline, no database copy, opens on:', w.document.querySelector('.weeknav .title').textContent.replace(/\s+/g, ' '), '| dinners', w.document.querySelectorAll('.meal .ttl').length);
  w.document.querySelector('[data-act="tab"][data-v="shop"]').click(); await wait(300); console.log('  shop list items:', w.document.querySelectorAll('.item').length);
  process.exit(0);
})();
