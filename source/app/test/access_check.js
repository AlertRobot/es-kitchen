// Invite-only: someone signed in whose email isn't on the allowlist gets a calm screen (not a broken or empty app),
// can check again or sign out; an email account that hasn't confirmed its address is asked to. Exits 1 on a failure.
const { JSDOM } = require('jsdom'); const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../public/index.html', 'utf8').replace(/<script src="(app|firebase-config)\.js[^"]*"><\/script>/g, '');
const lib = fs.readFileSync(__dirname + '/../public/data/library.json', 'utf8');
const bundle = fs.readFileSync(__dirname + '/app.test.js', 'utf8');
const wait = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (c, what) => { console.log((c ? 'ok   ' : 'FAIL ') + what); if (!c) fails++; };
function boot(access) {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://x.github.io/es-kitchen/', beforeParse(w) { w.__access = access; w.fetch = async () => ({ ok: true, json: async () => JSON.parse(lib) }); w.scrollTo = () => {}; } });
  const w = dom.window, d = w.document; const errs = []; w.addEventListener('error', e => errs.push(e.message));
  const s = d.createElement('script'); s.textContent = bundle; d.body.appendChild(s);
  return { w, d, errs, text: () => d.querySelector('#app').textContent.replace(/\s+/g, ' ') };
}
(async () => {
  {
    const A = boot('no'); await wait(400);
    ok(/invite-only/.test(A.text()) && /ethan@example\.com/.test(A.text()), 'not on the list: says Peckish is invite-only, with the email used');
    ok(!A.d.querySelector('[data-form="create"]') && !A.d.querySelector('[data-form="join"]') && !A.d.querySelector('#nav button'), 'not on the list: no household forms and no tabs');
    ok(!!A.d.querySelector('[data-act="sign-out"]'), 'not on the list: sign out is there');
    ok(!A.w.__docs.has('users/u_ethan') && ![...A.w.__docs.keys()].some(k => k.startsWith('households/')), 'not on the list: nothing is read into or written to the database');
    A.w.__access = 'yes'; A.d.querySelector('[data-act="verify-done"]').click(); await wait(400);
    ok(!!A.d.querySelector('[data-form="create"]'), 'added to the list: Check again opens the set-up page');
    A.d.querySelector('[data-act="sign-out"]').click(); await wait(200);
    ok(!!A.d.querySelector('[data-form="auth"]'), 'sign out goes back to the sign-in page');
    ok(!A.errs.length, 'no page errors ' + A.errs.join(' '));
  }
  {
    const A = boot('verify'); await wait(400);
    ok(/Confirm your email/.test(A.text()), 'email not confirmed: asks you to confirm it');
    A.d.querySelector('[data-act="verify-send"]').click(); await wait(200);
    ok(A.w.__verifySent === true && /Sent/.test(A.text()), 'email not confirmed: can send the link again');
  }
  {
    const A = boot('unknown'); await wait(400);
    ok(!!A.d.querySelector('[data-form="create"]'), 'offline with nothing saved: the app still opens (the database does the checking)');
  }
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails ? 1 : 0);
})();
