// Test stand-in for firebase/firestore: an in-memory database (globalThis.__fsdb, path -> data) with the calls store.js makes
const db = () => (globalThis.__fsdb = globalThis.__fsdb || new Map());
const isDoc = p => p.split('/').filter(Boolean).length % 2 === 0;
const snap = (p) => { const d = db().get(p); return { exists: () => d !== undefined, data: () => (d === undefined ? undefined : JSON.parse(JSON.stringify(d))), id: p.split('/').pop(), ref: { path: p }, metadata: { fromCache: false, hasPendingWrites: false } }; };
export const DELETE = { __del: true };
export function initializeFirestore() { return {}; }
export function getFirestore() { return {}; }
export const persistentLocalCache = () => ({}), persistentMultipleTabManager = () => ({});
export function doc(_db, ...parts) { const p = parts.join('/'); if (!p || !isDoc(p) || p.split('/').some(s => !s)) throw new Error('Invalid document reference ' + p); return { path: p, type: 'document' }; }
export function collection(_db, ...parts) { const p = parts.join('/'); return { path: p, type: 'collection' }; }
export async function getDoc(r) { return snap(r.path); }
export const getDocFromServer = getDoc;
export async function setDoc(r, data, opts) { const cur = db().get(r.path); db().set(r.path, opts && (opts.merge || opts.mergeFields) ? { ...(cur || {}), ...data } : data); }
export async function updateDoc(r, data) { if (!db().has(r.path)) throw Object.assign(new Error('No document to update'), { code: 'not-found' }); db().set(r.path, { ...db().get(r.path), ...data }); }
export async function deleteDoc(r) { db().delete(r.path); }
export async function getDocs(q) { const p = q.path, n = p.split('/').length + 1; return { docs: [...db().keys()].filter(k => k.startsWith(p + '/') && k.split('/').length === n).map(snap) }; }
export function onSnapshot() { return () => {}; }
export const arrayUnion = (...x) => x, arrayRemove = (...x) => x, deleteField = () => DELETE, terminate = async () => {}, clearIndexedDbPersistence = async () => {}, query = (c) => c, where = () => ({});
export async function runTransaction(_db, fn) {
  globalThis.__txWrites = globalThis.__txWrites || [];
  const tx = { get: async r => snap(r.path), set: (r, d) => { globalThis.__txWrites.push(r.path); db().set(r.path, JSON.parse(JSON.stringify(d))); }, delete: r => { globalThis.__txWrites.push('-' + r.path); db().delete(r.path); } };
  return fn(tx);
}
