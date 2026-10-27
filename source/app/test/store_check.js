// The Firebase data layer (src/store.js) against an in-memory stand-in for Firebase (test/stubs). Exits 1 if anything fails.
const esbuild = require('esbuild'), path = require('path');
let fails = 0; const ok = (c, what) => { console.log((c ? 'ok   ' : 'FAIL ') + what); if (!c) fails++; };
(async () => {
  const S = path.join(__dirname, 'stubs');
  const out = esbuild.buildSync({ entryPoints: [path.join(__dirname, '../src/store.js')], bundle: true, write: false, format: 'iife', platform: 'neutral',
    alias: { 'firebase/app': path.join(S, 'firebase_app.js'), 'firebase/auth': path.join(S, 'firebase_auth.js'), 'firebase/firestore': path.join(S, 'firebase_firestore.js') } });
  globalThis.window = globalThis; window.FIREBASE_CONFIG = { apiKey: 'test', projectId: 'test' };
  new Function(out.outputFiles[0].text)();
  globalThis.__fsdb = new Map(); globalThis.__txWrites = [];
  const Store = window.Store, db = globalThis.__fsdb, writes = () => globalThis.__txWrites.length;
  ok(Store && Store.kind === 'firebase' && Store.cal, 'store: loads against the stand-in');

  // ---- Caledonite reminders: one still waiting isn't rewritten when nothing about it has changed ----
  const N = 'households/main/notify/pk-x', base = { to: 'ethan', kind: 'reminders', title: 'Save you a plate on Monday?', body: 'You’re working until 21:00.', link: '../es-kitchen/' };
  ok(await Store.cal.notify('pk-x', { ...base, sendAfter: Date.now() }) === 'ok' && db.has(N), 'reminders: a new one is queued');
  // Caledonite holds it back for quiet hours by moving its time on
  db.set(N, { ...db.get(N), sendAfter: Date.now() + 8 * 3600e3 });
  let w0 = writes();
  const r = await Store.cal.notify('pk-x', { ...base, sendAfter: Date.now() + 5 });
  ok(r === 'same' && writes() === w0, 'reminders: one that’s due straight away isn’t rewritten (and brought forward) when Caledonite is holding it back (' + r + ')');
  w0 = writes();
  await Store.cal.notify('pk-x', { ...base, title: 'Save you a plate on Tuesday?', sendAfter: Date.now() });
  ok(writes() === w0 + 1 && db.get(N).title === 'Save you a plate on Tuesday?', 'reminders: a change to it is still written');
  const F = 'households/main/notify/pk-y', later = Date.now() + 3600e3;
  await Store.cal.notify('pk-y', { ...base, sendAfter: later }); w0 = writes();
  ok(await Store.cal.notify('pk-y', { ...base, sendAfter: later }) === 'same' && writes() === w0, 'reminders: one for later, unchanged, isn’t rewritten');
  await Store.cal.notify('pk-y', { ...base, sendAfter: later + 1800e3 });
  ok(db.get(F).sendAfter === later + 1800e3, 'reminders: one for later moves when its time changes');
  db.set(F, { ...db.get(F), sent: true }); w0 = writes();
  ok(await Store.cal.notify('pk-y', { ...base, title: 'x', sendAfter: later }) === 'sent' && writes() === w0, 'reminders: one already sent is never written again');
  // ---- joining: a code that's only punctuation gets a plain answer, not a database error ----
  let msg = ''; try { await Store.joinHousehold({ uid: 'u_x' }, ' - . ', 'Sam'); } catch (e) { msg = e.message; }
  ok(/invite code/i.test(msg) && !/reference|segments/i.test(msg), 'join: an empty code says to enter the code (' + msg + ')');
  // ---- joining: Sophie, added under Who's eating as "Sophie", joins as "Sophie Smith" (her Google name): her record is linked,
  // not a second Sophie that dinners get planned for ----
  db.set('invites/JN7Q2R', { hid: 'h9' });
  db.set('households/h9', { name: 'Home', members: ['u_e'], memberNames: { u_e: 'Ethan Dunning' }, inviteCode: 'JN7Q2R' });
  db.set('households/h9/people/u_e', { name: 'Ethan Dunning', uid: 'u_e', order: 1 });
  db.set('households/h9/people/p_s', { name: 'Sophie', order: 2, wontEat: ['mushrooms'] });
  await Store.joinHousehold({ uid: 'u_s' }, 'jn7q2r', 'Sophie Smith');
  const ppl = [...db.keys()].filter(k => k.startsWith('households/h9/people/'));
  ok(ppl.length === 2 && (db.get('households/h9/people/p_s') || {}).uid === 'u_s', 'join: a full name links the person added by first name (' + ppl.join(', ') + ')');
  // (two people it could be: neither is guessed)
  db.set('households/h9/people/p_s2', { name: 'Sam', order: 3 }); db.set('households/h9/people/p_s3', { name: 'Sam Jones', order: 4 });
  await Store.joinHousehold({ uid: 'u_sam' }, 'JN7Q2R', 'Sam Smith');
  ok(!(db.get('households/h9/people/p_s2') || {}).uid && !(db.get('households/h9/people/p_s3') || {}).uid && db.has('households/h9/people/u_sam'), 'join: with two it could be, neither is claimed');
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
