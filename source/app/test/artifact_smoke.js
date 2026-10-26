const { JSDOM } = require('jsdom'); const fs = require('fs');
const html = fs.readFileSync('/home/claude/mealplan/es-kitchen.html', 'utf8');
const lib = fs.readFileSync('/home/claude/mealplan/artifact_data/data/library.json', 'utf8');
const store = new Map(); const subs = new Set();
const snapDoc = p => { const d = store.get(p); return { id: p.split('/').pop(), exists: !!d, data: () => d }; };
const notify = () => setTimeout(() => subs.forEach(f => f()), 0);
const db = { doc: p => ({ get: async () => snapDoc(p), set: async d => { store.set(p, JSON.parse(JSON.stringify(d))); notify(); }, delete: async () => { store.delete(p); notify(); }, onSnapshot: n => { const f = () => n(snapDoc(p)); subs.add(f); setTimeout(f, 0); return () => subs.delete(f); } }),
  collection: c => { const q = { limit: () => q, onSnapshot: n => { const f = () => { const docs = [...store.keys()].filter(k => k.startsWith(c + '/') && k.split('/').length === c.split('/').length + 1).map(snapDoc); n({ docs }); }; subs.add(f); setTimeout(f, 0); return () => subs.delete(f); } }; return q; } };
store.set('households/main/people/ethan', { name: 'Ethan', order: 1, wontEat: ['mushrooms'], dislikes: [], likes: [] });
const dom = new JSDOM('<!doctype html><html><head></head><body>' + html + '</body></html>', { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://claude.ai/artifact/x',
  beforeParse(w) { w.claude = { use: async n => n === 'db' ? db : null }; w.fetch = async () => ({ ok: true, json: async () => JSON.parse(lib) }); w.scrollTo = () => {}; w.console.error = (...a) => console.log('PAGE ERROR', ...a); } });
const w = dom.window, d = w.document; w.addEventListener('error', e => console.log('UNCAUGHT', e.message));
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await wait(400);
  console.log('WEEK:', d.querySelector('#app').textContent.replace(/\s+/g, ' ').slice(0, 140));
  d.querySelector('[data-act="fill"]').click(); await wait(4000);
  console.log('FILLED:', [...d.querySelectorAll('.meal .ttl')].map(x => x.textContent).length, 'dinners; writes', [...store.keys()].filter(k => k.includes('weeks')).length);
  d.querySelector('[data-act="tab"][data-v="settings"]').click(); await wait(200);
  console.log('SETTINGS:', d.querySelector('#app section').textContent.replace(/\s+/g, ' ').slice(0, 160));
  process.exit(0);
})();
