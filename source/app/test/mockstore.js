// In-memory stand-in for the Firebase store, used only by the smoke test.
const docs = window.__preDocs || new Map(); const subs = new Set(); let hid = null; let userCb = null;
// (window.__user signs in as someone else; window.__onWrite hears every write, so two phones can share one store)
const user = window.__user || { uid: 'u_ethan', name: 'Ethan', email: 'ethan@example.com' };
function notify() { setTimeout(() => subs.forEach(f => f()), 0); if (window.__onWrite) window.__onWrite(); }
window.__notify = () => setTimeout(() => subs.forEach(f => f()), 0);
function full(rel) { return 'households/' + hid + '/' + rel; }
function isDoc(p) { return p.split('/').length % 2 === 0; }
function col_(p) { return col(p); }
function col(p) { const n = p.split('/').length + 1; return [...docs.keys()].filter(k => k.startsWith(p + '/') && k.split('/').length === n).map(k => ({ ...docs.get(k), id: k.split('/').pop() })); }
window.__docs = docs;
// like Firestore's own check before it sends anything: no list directly inside a list
function noNested(v, inList) { if (Array.isArray(v)) { if (inList) throw Object.assign(new Error('Function setDoc() called with invalid data. Nested arrays are not supported'), { code: 'invalid-argument' }); v.forEach(x => noNested(x, true)); } else if (v && typeof v === 'object') Object.values(v).forEach(x => noNested(x, false)); }
const checked = f => function (rel, data) { noNested(data, false); return f.apply(this, arguments); };
// like firestore.rules for logged shops (households/{hid}/shops/{id}): who logged one is the account writing it and never
// changes, okBy is only ever the writer's own account, and a shop waiting to go to Budgie can't be changed or made to wait again
const state = d => ((d && d.budgie) || {}).state || '';
const same = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
function shopRule(rel, before, after) {
  if (!/^shops\/[^/]+$/.test(rel)) return;
  const me = user.uid, no = () => { throw Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }); };
  if (!(same(after.okBy, before && before.okBy) || after.okBy === me)) no();
  if (!before) { if (!(after.byUid === me || state(after) !== 'queued')) no(); return; }
  if (!same(after.byUid, before.byUid)) no();
  if (state(after) === 'queued' && (state(before) !== 'queued' || ['amount', 'date', 'paidBy', 'split', 'shop', 'source', 'budgie', 'removed'].some(k => !same(after[k], before[k])))) no();
}
window.__shopRule = shopRule;
window.Store = {
  kind: 'mock',
  onUser(cb) { userCb = cb; setTimeout(() => cb(window.__signedOut ? null : user), 0); return () => {}; },
  async signInGoogle() { window.__signedOut = false; userCb(user); },
  async signInEmail() { userCb(user); }, async signUpEmail() { userCb(user); }, async resetPassword() {},
  async signOut() { window.__signedOut = true; userCb(null); },
  async access() { window.__accessChecks = (window.__accessChecks || 0) + 1; return window.__access || 'yes'; }, async sendVerify() { window.__verifySent = true; }, async recheck() { return user; },
  watchUser(uid, cb, err) { if (window.__failWatch > 0) { window.__failWatch--; setTimeout(() => err && err({ code: 'permission-denied' }), 0); return () => {}; } const f = () => cb(docs.get('users/' + uid) || null); subs.add(f); setTimeout(f, 0); return () => subs.delete(f); },
  watchHousehold(id, cb) { const f = () => { const d = docs.get('households/' + id); cb(d ? { id, ...d } : null); }; subs.add(f); setTimeout(f, 0); return () => subs.delete(f); },
  setHousehold(id) { hid = id; },
  async createHousehold(u, name, me) { const id = 'h1'; docs.set('households/' + id, { name, members: [u.uid], memberNames: { [u.uid]: me.name }, inviteCode: 'K7RM2Q' }); hid = id; docs.set(full('people/' + u.uid), { name: me.name, order: 1, wontEat: me.wontEat || [], dislikes: [], likes: [] }); docs.set('users/' + u.uid, { households: [id], current: id, names: { [id]: name } }); notify(); return id; },
  async getUser(uid) { return docs.get('users/' + uid) || null; }, async resetLocal() {},
  async joinHousehold() { throw new Error('nope'); },
  async switchHousehold(u, id) { hid = id; },
  async newInviteCode() { return 'NEWCOD'; }, async renameHousehold() {}, async leaveHousehold() {},
  sub(rel, cb) { if (window.__offlineWeeks && rel.startsWith('weeks/')) { const p = full(rel); const f = () => cb(docs.get(p) || null, { cache: true, pending: docs.has(p) }); subs.add(f); setTimeout(f, 0); return () => subs.delete(f); } if (window.__noCache && rel.startsWith('weeks/')) { setTimeout(() => cb(null, { cache: true }), 0); return () => {}; } const p = full(rel); const f = isDoc(p) ? () => cb(docs.get(p) || null, {}) : () => cb(col(p), {}); if (window.__slowWeeks && rel.startsWith('weeks/')) { let on = true; setTimeout(() => { if (on) { subs.add(f); f(); } }, window.__slowWeeks); return () => { on = false; subs.delete(f); }; } subs.add(f); setTimeout(f, 0); return () => subs.delete(f); },
  subG(col, cb) { const f = () => cb(col_(col)); subs.add(f); setTimeout(f, 0); return () => subs.delete(f); },
  async getG(p) { return docs.get(p) || null; }, async setG(p, d) { docs.set(p, JSON.parse(JSON.stringify(d))); notify(); }, async delG(p) { docs.delete(p); notify(); }, uid() { return user.uid; },
  async get(rel) { return docs.get(full(rel)) || null; },
  set: checked(async function (rel, data) { shopRule(rel, docs.get(full(rel)), JSON.parse(JSON.stringify(data))); docs.set(full(rel), JSON.parse(JSON.stringify(data))); window.__writes = (window.__writes || 0) + 1; notify(); }),
  merge: checked(async function (rel, data) { const nx = { ...(docs.get(full(rel)) || {}), ...data }; shopRule(rel, docs.get(full(rel)), JSON.parse(JSON.stringify(nx))); docs.set(full(rel), nx); notify(); }),
  async del(rel) { docs.delete(full(rel)); notify(); },
  DEL: { __delete: true },
  patch: checked(async function (rel, flat) { const p = full(rel); const d = JSON.parse(JSON.stringify(docs.get(p) || {})); for (const k of Object.keys(flat)) { const parts = k.split('.'); let o = d; for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]] = (o[parts[i]] && typeof o[parts[i]] === 'object') ? o[parts[i]] : {}; const v = flat[k]; if (v && v.__delete) delete o[parts[parts.length - 1]]; else o[parts[parts.length - 1]] = JSON.parse(JSON.stringify(v)); } shopRule(rel, docs.get(p), d); docs.set(p, d); window.__writes = (window.__writes || 0) + 1; window.__patches = (window.__patches || 0) + 1; notify(); }),
  async list(rel) { return col(full(rel)).map(d => { const x = { ...d }; delete x.id; return { id: d.id, data: x }; }); },
  async touchMember(h, u) { const d = docs.get('households/' + h.id); if (d) { d.memberEmails = { ...(d.memberEmails || {}), [u.uid]: u.email }; } },
};
