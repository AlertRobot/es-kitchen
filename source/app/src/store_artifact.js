// Store adapter for the claude.ai artifact preview: one shared household kept in the artifact's database.
// No sign-in or invites here — those are in the installed app (Firebase).
const HID = 'main';
let dbp = null;
function db() { if (!dbp) dbp = (window.claude && typeof window.claude.use === 'function') ? window.claude.use('db') : Promise.resolve(null); return dbp; }
const segs = p => p.split('/').filter(Boolean);
function full(rel) { return ['households', HID, ...segs(rel)].join('/'); }
const user = { uid: 'preview', name: 'Ethan', email: 'Preview on claude.ai' };
const household = { id: HID, name: 'Ethan & Sophie', members: ['preview'], memberNames: { preview: 'Ethan', sophie: 'Sophie' }, inviteCode: '' };
function clean(x) { return JSON.parse(JSON.stringify(x)); }
const queues = {};

window.Store = {
  kind: 'artifact',
  maxDocBytes: 200000,
  onUser(cb) { setTimeout(() => cb(user), 0); return () => {}; },
  async signInGoogle() {}, async signInEmail() {}, async signUpEmail() {}, async resetPassword() {}, async signOut() {},
  watchUser(uid, cb) { setTimeout(() => cb({ households: [HID], current: HID, names: { [HID]: household.name } }), 0); return () => {}; },
  async getUser() { return { households: [HID], current: HID, names: { [HID]: household.name } }; }, async resetLocal() { location.reload(); },
  watchHousehold(id, cb) { setTimeout(() => cb(household), 0); return () => {}; },
  setHousehold() {},
  async createHousehold() { return HID; }, async joinHousehold() { return HID; }, async switchHousehold() {},
  async newInviteCode() { return ''; }, async renameHousehold() {}, async leaveHousehold() {},
  sub(rel, cb, err) {
    let off = null, dead = false;
    db().then(d => {
      if (dead) return;
      if (!d) { err && err({ code: 'unavailable' }); cb(segs(full(rel)).length % 2 === 0 ? null : [], {}); return; }
      const p = full(rel);
      if (segs(p).length % 2 === 0) off = d.doc(p).onSnapshot(s => cb(s.exists ? clean(s.data()) : null, {}), e => err && err(e));
      else off = d.collection(p).limit(1000).onSnapshot(s => cb(s.docs.map(x => ({ ...clean(x.data()), id: x.id })), {}), e => err && err(e));
    });
    return () => { dead = true; if (off) off(); };
  },
  subG(col, cb, err) {
    let off = null, dead = false;
    db().then(d => { if (dead) return; if (!d) { cb([]); return; } off = d.collection(col).limit(1000).onSnapshot(s => cb(s.docs.map(x => ({ ...clean(x.data()), id: x.id }))), e => err && err(e)); });
    return () => { dead = true; if (off) off(); };
  },
  async getG(path) { const d = await db(); if (!d) return null; const s = await d.doc(path).get(); return s.exists ? clean(s.data()) : null; },
  async setG(path, data) { const d = await db(); if (!d) throw { code: 'unavailable' }; await d.doc(path).set(clean(data)); },
  async delG(path) { const d = await db(); if (d) await d.doc(path).delete(); },
  uid() { return 'preview'; },
  async get(rel) { const d = await db(); if (!d) return null; const s = await d.doc(full(rel)).get(); return s.exists ? clean(s.data()) : null; },
  set(rel, data) {
    const p = full(rel);
    queues[p] = (queues[p] || Promise.resolve()).then(async () => { const d = await db(); if (!d) throw { code: 'unavailable' }; await d.doc(p).set(clean(data)); });
    return queues[p];
  },
  merge(rel, data) { return this.set(rel, data); },
  async del(rel) { const d = await db(); if (d) await d.doc(full(rel)).delete(); },
};
