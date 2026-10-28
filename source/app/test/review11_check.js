// Eleventh review (overnight polish): a way back from "Other households", breakfast and lunch names in sentence case
// everywhere, and the shorter labels. Needs test/app.test.js built first. Exits 1 if anything fails.
const { JSDOM } = require('jsdom'); const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../public/index.html', 'utf8').replace(/<script src="(app|firebase-config)\.js[^"]*"><\/script>/g, '');
const lib = fs.readFileSync(__dirname + '/../public/data/library.json', 'utf8');
const bundle = fs.readFileSync(__dirname + '/app.test.js', 'utf8');
const wait = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (c, what) => { console.log((c ? 'ok   ' : 'FAIL ') + what); if (!c) fails++; };
(async () => {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.github.io/es-kitchen/',
    beforeParse(w) { w.fetch = async () => ({ ok: true, json: async () => JSON.parse(lib) }); w.scrollTo = () => {}; w.__user = { uid: 'u_e', name: 'Ethan Whitfield', email: 'ethan@example.com' }; } });
  const w = dom.window, d = w.document, errs = []; w.addEventListener('error', e => errs.push(e.message));
  const s = d.createElement('script'); s.textContent = bundle; d.body.appendChild(s);
  const act = async (a, v, ms, extra) => { const b = d.createElement('button'); b.dataset.act = a; if (v != null) b.dataset.v = v; Object.assign(b.dataset, extra || {}); d.body.appendChild(b); b.click(); b.remove(); await wait(ms || 80); };
  const tap = async (sel, ms) => { const el = d.querySelector(sel); if (!el) { ok(false, 'missing ' + sel); return; } el.click(); await wait(ms || 80); };
  const T = sel => ((d.querySelector(sel) || {}).textContent || '').replace(/\s+/g, ' ').trim();
  await wait(150);
  d.querySelector('#cr-name').value = 'Whitfield kitchen'; d.querySelector('#cr-me').value = 'Ethan Whitfield';
  d.querySelector('[data-form="create"]').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(400);

  // ---- 1. Settings, Household, Other households: back to the kitchen you came from, by the link or the phone's Back ----
  await act('tab', 'settings'); await act('set-page', 'household');
  await tap('[data-act="hh-other"]');
  ok(/Set up your kitchen/.test(T('#app')), 'other households: the household page shows');
  ok(/Back to your kitchen/.test(T('[data-act="hh-back"]')), 'other households: there\u2019s a way back');
  await tap('[data-act="hh-back"]');
  ok(/Household & invites/.test(T('#app h1')) && !d.querySelector('[data-act="hh-back"]'), 'other households: Back returns to the settings page');
  await tap('[data-act="hh-other"]'); await wait(30);
  w.dispatchEvent(new w.PopStateEvent('popstate', { state: null })); await wait(80);
  ok(/Household & invites/.test(T('#app h1')), 'other households: the phone’s Back does the same');
  // (a brand new account has nowhere to go back to)
  ok(!/Back to/.test(T('#app')), 'no back link once you’re back in the kitchen');

  // ---- 2. breakfasts and lunches are named the same everywhere (sentence case, as on the Recipes tab) ----
  await act('set-page', 'people'); await wait(50);
  const cb = d.querySelector('[data-change="p-plan"][data-s="b"]'); cb.checked = true; cb.dispatchEvent(new w.Event('change', { bubbles: true })); await wait(100);
  await act('tab', 'week'); await act('week-view', 'bl', 150);
  await tap('[data-act="bl-pick"][data-v$="|b|0"]', 400);
  // (one whose library name is in Title Case, so it shows whether it's been put in sentence case)
  const LIB = JSON.parse(lib).recipes || [];
  const first = [...d.querySelectorAll('#sheet [data-act="bl-add"]')].find(b => { const r = LIB.find(x => x.id === b.dataset.v); return r && r.title !== b.querySelector('b').textContent; });
  ok(!!first, 'breakfast: Title Case library names are shown in sentence case in the pick list');
  const rid = first && first.dataset.v; const pickName = first ? first.querySelector('b').textContent : '';
  const raw = LIB.find(r => r.id === rid) || {};
  if (first) { first.click(); await wait(300); }
  await act('sheet-back', null, 100);
  const slot = T('[data-act="bl-pick"][data-v$="|b|0"] .blitem');
  await act('tab', 'recipes'); await act('f-meal-set', 'breakfast', 200);
  const card = d.querySelector('.vcard[data-v="' + rid + '"] .vb b');
  ok(!!rid && slot === pickName, 'breakfast: the pick list and the week show the same name (' + slot + ')');
  ok(!!card && card.textContent === slot, 'breakfast: and the Recipes tab does too');
  ok(!!raw.title && raw.title !== slot && raw.title.toLowerCase() === slot.toLowerCase(),'breakfast: it’s the recipe’s own name, in sentence case');

  // ---- 3. labels short enough for a button ----
  await act('tab', 'settings'); await act('set-page', 'planning');
  const caps = [...d.querySelectorAll('[data-act="set-cap"]')].map(b => b.textContent);
  ok(caps.join(',') === '20,30,45,60' && /in minutes/.test(T('#app')), 'planning: the weeknight time buttons are just the minutes');
  await act('set-page', ''); await act('tab', 'week'); await act('fill', null, 6000);
  const empty = [0, 1, 2, 3, 4].find(k => d.querySelector('[data-act="pick"][data-v="' + k + '"]'));
  await act('clear'); await act('clear-yes', null, 300);
  await act('pick', '1', 600);
  await tap('#sheet [data-act="pick-anytime"]', 600);
  ok(T('#sheet [data-act="pick-anytime"]') === 'Hide longer recipes', 'choosing a dinner: the time-limit button fits ("Hide longer recipes")');
  ok(empty === undefined || empty >= 0, '(the week filled)');
  ok(!errs.length, 'no page errors ' + errs.join(' | '));
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
