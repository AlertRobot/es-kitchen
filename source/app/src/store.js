// Firebase data layer. Exposes window.Store with a small API the app uses; tests swap in a mock.
import { initializeApp } from 'firebase/app';
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut, updateProfile, sendEmailVerification,
  setPersistence, indexedDBLocalPersistence, browserLocalPersistence,
} from 'firebase/auth';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, collection, onSnapshot,
  setDoc, deleteDoc, getDoc, getDocs, getDocFromServer, updateDoc, arrayUnion, arrayRemove, deleteField, terminate, clearIndexedDbPersistence,
  query, where, runTransaction, getFirestore,
} from 'firebase/firestore';
const CFG = window.FIREBASE_CONFIG;
const configured = !!(CFG && CFG.apiKey && CFG.projectId && !/REPLACE/.test(CFG.apiKey));
let app, auth, db;
if (configured) {
  app = initializeApp(CFG);
  auth = getAuth(app);
  setPersistence(auth, indexedDBLocalPersistence).catch(() => setPersistence(auth, browserLocalPersistence).catch(() => {}));
  db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
}

let hid = null;
const me = u => ({ uid: u.uid, name: u.displayName || (u.email || '').split('@')[0], email: u.email, verified: !!u.emailVerified });
const CODE_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newCode() { let s = ''; const a = new Uint32Array(6); crypto.getRandomValues(a); for (const x of a) s += CODE_ABC[x % CODE_ABC.length]; return s; }
function newId() { return doc(collection(db, 'households')).id; }
const segs = p => p.split('/').filter(Boolean);
function ref(rel) { const p = ['households', hid, ...segs(rel)].join('/'); return segs(p).length % 2 === 0 ? doc(db, p) : collection(db, p); }
// Firestore rejects undefined values; strip them
function clean(x) { return JSON.parse(JSON.stringify(x)); }
function safe(fn) { try { return fn(); } catch (e) { return Promise.reject(e); } }
function friendly(e) {
  const c = (e && e.code) || '';
  if (c.includes('popup-closed') || c.includes('cancelled-popup')) return 'Sign-in was cancelled.';
  if (c.includes('popup-blocked')) return 'Your browser blocked the sign-in window. Try again, or use email instead.';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found')) return 'That email and password don’t match an account.';
  if (c.includes('email-already-in-use')) return 'There’s already an account with that email. Sign in instead.';
  if (c.includes('weak-password')) return 'Use a password of at least 6 characters.';
  if (c.includes('invalid-email')) return 'That email address doesn’t look right.';
  if (c.includes('network')) return 'No connection. You need internet the first time you sign in.';
  if (c.includes('unauthorized-domain')) return 'This web address isn’t allowed to sign in yet (add it under Authentication → Settings → Authorized domains).';
  return (e && e.message) || 'Something went wrong.';
}

window.Store = !configured ? { kind: 'unconfigured', onUser(cb) { setTimeout(() => cb(null), 0); return () => {}; } } : {
  kind: 'firebase',
  // ----- auth -----
  onUser(cb) { getRedirectResult(auth).catch(() => {}); return onAuthStateChanged(auth, u => cb(u ? me(u) : null)); },
  // Peckish is invite-only: is this person's email on the allowlist (allowed/{email})? 'yes', 'no', 'verify' (an email
  // account that hasn't confirmed its address yet) or 'unknown' (offline, nothing saved: the database still checks).
  async access(u) {
    if (!u || !u.email) return 'no';
    if (u.verified === false) return 'verify';
    const r = doc(db, 'allowed', String(u.email).toLowerCase());
    // on a weak signal (in the shop) don't hold the app up: after a few seconds use the answer saved on this phone
    let t = 0; const late = new Promise((res, rej) => { t = setTimeout(() => rej({ code: 'timeout' }), 4000); });
    try { const s = await Promise.race([getDocFromServer(r), late]); clearTimeout(t); return s.exists() ? 'yes' : 'no'; }
    catch (e) {
      clearTimeout(t);
      if (e && e.code === 'permission-denied') return 'no';
      try { return (await getDoc(r)).exists() ? 'yes' : 'unknown'; } catch (x) { return 'unknown'; }
    }
  },
  async sendVerify() { if (auth.currentUser) await sendEmailVerification(auth.currentUser); },
  // after confirming the email: fetch the account again (and a fresh sign-in token, which the database checks)
  async recheck() { const u = auth.currentUser; if (!u) return null; await u.reload(); await u.getIdToken(true); return me(auth.currentUser); },
  async signInGoogle() {
    const p = new GoogleAuthProvider();
    try { await signInWithPopup(auth, p); }
    catch (e) {
      if (e && e.code && e.code.includes('popup-blocked')) { await signInWithRedirect(auth, p); return; }
      throw new Error(friendly(e));
    }
  },
  async signInEmail(email, pw) { try { await signInWithEmailAndPassword(auth, email, pw); } catch (e) { throw new Error(friendly(e)); } },
  async signUpEmail(name, email, pw) {
    try { const c = await createUserWithEmailAndPassword(auth, email, pw); if (name) await updateProfile(c.user, { displayName: name }); await sendEmailVerification(c.user).catch(() => {}); }
    catch (e) { throw new Error(friendly(e)); }
  },
  async resetPassword(email) { try { await sendPasswordResetEmail(auth, email); } catch (e) { throw new Error(friendly(e)); } },
  signOut() { return signOut(auth); },

  // ----- households -----
  // An error here must NOT look like "no household": report it so the app can retry instead of showing the join screen.
  watchUser(uid, cb, err) { return onSnapshot(doc(db, 'users', uid), { includeMetadataChanges: true }, s => cb(s.exists() ? s.data() : null, { fromCache: s.metadata.fromCache }), e => { console.warn('user doc error', e); err && err(e); }); },
  async getUser(uid) {
    const r = doc(db, 'users', uid);
    try { const s = await getDocFromServer(r); window.__meDiag = { src: 'server', found: s.exists(), at: new Date().toLocaleTimeString() }; return s.exists() ? s.data() : null; }
    catch (e) { window.__meDiag = { src: 'cache', err: e.code || e.message, at: new Date().toLocaleTimeString() }; const s = await getDoc(r); return s.exists() ? s.data() : null; }
  },
  // Clears this phone's saved copy of the data (not the data itself) and reloads, for when the local copy is stuck.
  async resetLocal() { try { await terminate(db); await clearIndexedDbPersistence(db); } catch (e) { console.warn(e); } location.reload(); },
  watchHousehold(id, cb, err) { return onSnapshot(doc(db, 'households', id), s => cb(s.exists() ? { id, ...s.data() } : null), e => err && err(e)); },
  setHousehold(id) { hid = id; },
  async createHousehold(user, name, me) {
    const id = newId(), code = newCode();
    await setDoc(doc(db, 'households', id), { name, members: [user.uid], memberNames: { [user.uid]: me.name }, inviteCode: code, created: new Date().toISOString() });
    await setDoc(doc(db, 'invites', code), { hid: id });
    await setDoc(doc(db, 'households', id, 'people', user.uid), clean({ name: me.name, uid: user.uid, order: 1, wontEat: me.wontEat || [], dislikes: [], likes: [] }));
    await setDoc(doc(db, 'users', user.uid), { households: arrayUnion(id), current: id, names: { [id]: name } }, { merge: true });
    return id;
  },
  async joinHousehold(user, code, myName) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!code) throw new Error('Enter the invite code you were sent (letters and numbers).');
    const inv = await getDoc(doc(db, 'invites', code));
    if (!inv.exists()) throw new Error('That invite code wasn’t found. Check it and try again.');
    const id = inv.data().hid;
    try {
      // the code is saved with who used it, so the next person to join still has to know the code (the database checks)
      await updateDoc(doc(db, 'households', id), { members: arrayUnion(user.uid), joinCode: code + '.' + user.uid, ['memberNames.' + user.uid]: myName });
    } catch (e) { throw new Error('Couldn’t join with that code. Ask for a fresh one.'); }
    const h = await getDoc(doc(db, 'households', id));
    // If someone already added this person under "Who's eating" (same name, no account yet), link that record
    // instead of making a second one, so dinners aren't planned for an extra person.
    const ps = await getDocs(collection(db, 'households', id, 'people')).catch(() => null);
    const docs = ps ? ps.docs : [];
    if (!docs.some(d => d.id === user.uid || (d.data() || {}).uid === user.uid)) {
      const nm = String(myName || '').trim().toLowerCase();
      const same = docs.find(d => !(d.data() || {}).uid && String((d.data() || {}).name || '').trim().toLowerCase() === nm);
      if (same) await setDoc(same.ref, { uid: user.uid }, { merge: true });
      else await setDoc(doc(db, 'households', id, 'people', user.uid), { name: myName, uid: user.uid, order: docs.length + 1, wontEat: [], dislikes: [], likes: [] });
    }
    await setDoc(doc(db, 'users', user.uid), { households: arrayUnion(id), current: id, names: { [id]: (h.data() || {}).name || 'Household' } }, { merge: true });
    return id;
  },
  // (the app moves its reads and writes over when the account says which household is current, all at once, so
  // anything still finishing in the old household never lands in the new one)
  async switchHousehold(user, id) { await setDoc(doc(db, 'users', user.uid), { current: id }, { merge: true }); },
  async newInviteCode(h) {
    const code = newCode();
    await setDoc(doc(db, 'invites', code), { hid: h.id });
    await updateDoc(doc(db, 'households', h.id), { inviteCode: code });
    if (h.inviteCode) await deleteDoc(doc(db, 'invites', h.inviteCode)).catch(() => {});
    return code;
  },
  async renameHousehold(user, h, name) {
    await updateDoc(doc(db, 'households', h.id), { name });
    await setDoc(doc(db, 'users', user.uid), { names: { [h.id]: name } }, { merge: true });
  },
  async leaveHousehold(user, h) {
    // your name and sign-in email go with you (they were only kept so the household could see whose account is whose)
    await updateDoc(doc(db, 'households', h.id), { members: arrayRemove(user.uid), ['memberNames.' + user.uid]: deleteField(), ['memberEmails.' + user.uid]: deleteField() });
    await setDoc(doc(db, 'users', user.uid), { households: arrayRemove(h.id), current: null }, { merge: true });
  },

  // ----- shared across every household (recipe and step photos) -----
  subG(col, cb, err) { return onSnapshot(collection(db, col), s => cb(s.docs.map(d => ({ ...d.data(), id: d.id }))), e => err && err(e)); },
  getG(path) { return getDoc(doc(db, path)).then(s => (s.exists() ? s.data() : null)).catch(() => null); },
  setG(path, data) { return safe(() => setDoc(doc(db, path), clean(data))); },
  delG(path) { return deleteDoc(doc(db, path)); },
  uid() { return auth.currentUser ? auth.currentUser.uid : null; },

  // ----- household data (paths relative to the current household) -----
  sub(rel, cb, err) {
    const r = ref(rel);
    if (r.type === 'document') return onSnapshot(r, { includeMetadataChanges: false }, s => cb(s.exists() ? s.data() : null, { pending: s.metadata.hasPendingWrites, cache: s.metadata.fromCache }), e => err && err(e));
    return onSnapshot(r, s => cb(s.docs.map(d => ({ ...d.data(), id: d.id })), { pending: s.metadata.hasPendingWrites, cache: s.metadata.fromCache }), e => err && err(e));
  },
  get(rel) { return getDoc(ref(rel)).then(s => (s.exists() ? s.data() : null)).catch(() => null); },
  // a record the database won't take (it checks before sending) comes back as a failed save, not an error on the page
  set(rel, data) { return safe(() => setDoc(ref(rel), clean(data))); },
  merge(rel, data) { return safe(() => setDoc(ref(rel), clean(data), { merge: true })); },
  del(rel) { return deleteDoc(ref(rel)); },
  // change only the named fields ("checked.milk"), so two phones editing the same document don't overwrite each other
  DEL: { __delete: true },
  patch(rel, flat) {
    const data = {}, fields = [];
    for (const k of Object.keys(flat)) {
      const parts = k.split('.'); let o = data;
      for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]] = o[parts[i]] || {};
      const v = flat[k]; o[parts[parts.length - 1]] = v && v.__delete ? deleteField() : (v === undefined ? deleteField() : clean(v));
      fields.push(k);
    }
    return safe(() => setDoc(ref(rel), data, { mergeFields: fields }));
  },
  // the same, for a record that must still be there: one someone has deleted meanwhile isn't brought back (not-found)
  update(rel, flat) {
    const data = {};
    for (const k of Object.keys(flat)) { const v = flat[k]; data[k] = v && v.__delete ? deleteField() : (v === undefined ? deleteField() : clean(v)); }
    return safe(() => updateDoc(ref(rel), data));
  },
  // every document in a household collection, read once (used by Backup)
  async list(rel) { const s = await getDocs(ref(rel)); return s.docs.map(d => ({ id: d.id, data: d.data() })); },
  // keep each member's sign-in email on the household, so a backup can say whose account is whose
  async touchMember(h, u) { if (!u || !u.email || (h.memberEmails && h.memberEmails[u.uid] === u.email)) return; await updateDoc(doc(db, 'households', h.id), { ['memberEmails.' + u.uid]: u.email }).catch(() => {}); },
};

// ---------- Caledonite, your calendar app (its own Firebase project): read shifts, queue phone reminders ----------
// Signing in here uses your Google account with Caledonite's project; its rules let in just the two of you.
const CAL_CFG = { apiKey: 'AIzaSyDN_valkNmZFdG6TjWElHgFS38yAKsLsVk', authDomain: 'caledonite.firebaseapp.com', projectId: 'caledonite', storageBucket: 'caledonite.firebasestorage.app', messagingSenderId: '455880056208', appId: '1:455880056208:web:19bd85346512d5a407e715' };
const CAL_HH = 'households/main';
let calApp = null, calAuth = null, calDb = null;
function calInit() {
  if (calApp) return;
  calApp = initializeApp(CAL_CFG, 'caledonite'); calAuth = getAuth(calApp);
  setPersistence(calAuth, indexedDBLocalPersistence).catch(() => setPersistence(calAuth, browserLocalPersistence).catch(() => {}));
  calDb = getFirestore(calApp);
}
window.Store.cal = {
  onUser(cb) { calInit(); return onAuthStateChanged(calAuth, u => cb(u ? { uid: u.uid, email: (u.email || '').toLowerCase(), name: u.displayName || '' } : null)); },
  async signIn() {
    calInit(); const p = new GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' });
    try { await signInWithPopup(calAuth, p); }
    catch (e) { if (e && e.code && /popup-blocked|operation-not-supported/.test(e.code)) { await signInWithRedirect(calAuth, p); return; } throw new Error(friendly(e)); }
  },
  async signOut() { if (calAuth) await signOut(calAuth); },
  // everything needed to work out shifts for the given months (YYYY-MM) and days from fromDay
  async read(months, fromDay) {
    calInit();
    const hhSnap = await getDoc(doc(calDb, CAL_HH));
    if (!hhSnap.exists()) throw new Error('Caledonite isn\u2019t set up on that account.');
    const [people, cals, shifts] = await Promise.all([
      getDocs(collection(calDb, CAL_HH + '/people')), getDocs(collection(calDb, CAL_HH + '/calendars')),
      getDocs(query(collection(calDb, CAL_HH + '/shifts'), where('day', '>=', fromDay))),
    ]);
    const P = people.docs.map(d => ({ id: d.id, ...d.data() })), C = cals.docs.map(d => ({ id: d.id, ...d.data() })), me = (calAuth.currentUser && calAuth.currentUser.email || '').toLowerCase();
    const mine = P.find(p => (p.email || '').toLowerCase() === me);
    const feeds = [];
    for (const c of C.filter(c => c.role === 'rota')) for (const m of months) {
      const own = mine && c.owner === mine.id, id = c.owner + '__' + c.calKey + '__' + m;
      try { const f = await getDoc(doc(calDb, CAL_HH + '/' + (own ? 'privateFeeds' : 'sharedFeeds') + '/' + id)); if (f.exists()) feeds.push({ owner: c.owner, ...f.data() }); } catch (e) { /* not shared with you */ }
    }
    return { household: hhSnap.data(), people: P, calendars: C, shifts: shifts.docs.map(d => d.data()), feeds, me: mine ? mine.id : null };
  },
  // a reminder on the person's phone (sent by Caledonite's sync within about 10 minutes of sendAfter).
  // Never re-sends one that's gone; updates or removes one that's still waiting.
  async notify(id, data) {
    calInit(); const ref2 = doc(calDb, CAL_HH + '/notify/' + id);
    return runTransaction(calDb, async tx => {
      const cur = await tx.get(ref2); if (cur.exists() && cur.data().sent) return 'sent';
      // already waiting just like this: nothing to write (the app checks its reminders are still there now and then)
      // (one wanted straight away keeps the time it has: Caledonite may be holding it back for quiet hours or a retry)
      const asap = k => k === 'sendAfter' && typeof data[k] === 'number' && data[k] <= Date.now() + 60000 && typeof cur.data()[k] === 'number';
      if (cur.exists() && Object.keys(data).every(k => asap(k) || JSON.stringify(cur.data()[k]) === JSON.stringify(data[k]))) return 'same';
      tx.set(ref2, { ...data, sent: false, created: (cur.exists() && cur.data().created) || Date.now() }); return 'ok';
    });
  },
  async unnotify(id) {
    calInit(); const ref2 = doc(calDb, CAL_HH + '/notify/' + id);
    return runTransaction(calDb, async tx => { const cur = await tx.get(ref2); if (cur.exists() && !cur.data().sent) tx.delete(ref2); });
  },
};

