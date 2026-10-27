// The account record fails to load on start-up (as after clearing site data): the app must not fall back to "join a household".
const { JSDOM } = require('jsdom'); const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../public/index.html', 'utf8').replace(/<script src="(app|firebase-config)\.js[^"]*"><\/script>/g, '');
const lib = fs.readFileSync(__dirname + '/../public/data/library.json', 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://x.github.io/es-kitchen/', beforeParse(w) { w.fetch = async () => ({ ok: true, json: async () => JSON.parse(lib) }); w.scrollTo = () => {}; w.__failWatch = 0; } });
const w = dom.window, d = w.document; w.addEventListener('error', e => console.log('UNCAUGHT', e.message));
const s = d.createElement('script'); s.textContent = fs.readFileSync(__dirname + '/app.test.js', 'utf8'); d.body.appendChild(s);
const wait = ms => new Promise(r => setTimeout(r, ms));
const screen = () => /Set up your kitchen/.test(d.querySelector('#app').textContent) ? 'JOIN SCREEN' : /Opening your kitchen/.test(d.querySelector('#app').textContent) ? 'loading' + (/Still trying/.test(d.querySelector('#app').textContent) ? ' (retrying)' : '') : /Sign in with Google/.test(d.querySelector('#app').textContent) ? 'SIGN-IN' : 'KITCHEN';
(async () => {
  await wait(150); d.querySelector('[data-form="create"]').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(500);
  console.log('after creating household:', screen());
  // sign out, then sign back in with the first two account loads failing
  w.document.querySelector('[data-act="tab"][data-v="settings"]').click(); await wait(100);
  w.__failWatch = 2; await w.Store.signOut(); await wait(100); await w.Store.signInGoogle(); await wait(60);
  console.log('just after sign-in (load failed):', screen());
  await wait(4000); console.log('a few seconds later:', screen());
  // a permanent failure: the direct read still finds the household
  w.__failWatch = 99; await w.Store.signOut(); await wait(100); await w.Store.signInGoogle(); await wait(400);
  console.log('listener never works, direct read ok:', screen());
  process.exit(0);
})();
