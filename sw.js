// Peckish service worker: keeps the app, recipe library and photos available offline.
const VERSION = 'mvqxgi76';
const SHELL = 'shell-' + VERSION;
const RUNTIME = 'runtime-v1';
const PRECACHE = ['./', 'index.html', 'firebase-config.js', 'app.js?v=' + VERSION, 'fill-worker.js?v=' + VERSION, 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/maskable-512.png', 'data/library.json',
  'fonts/atkinson-hyperlegible-latin-400-italic.woff2', 'fonts/atkinson-hyperlegible-latin-400-normal.woff2', 'fonts/atkinson-hyperlegible-latin-700-normal.woff2', 'fonts/audiowide-latin-400-normal.woff2', 'fonts/bricolage-grotesque-latin-600-normal.woff2', 'fonts/bricolage-grotesque-latin-800-normal.woff2', 'fonts/cinzel-latin-700-normal.woff2', 'fonts/exo-2-latin-700-normal.woff2', 'fonts/ibm-plex-mono-latin-500-normal.woff2', 'fonts/medievalsharp-latin-400-normal.woff2', 'fonts/orbitron-latin-700-normal.woff2'];

self.addEventListener('install', e => {
  // cache: 'reload' skips the browser's own HTTP cache, so a fresh deploy never saves the previous version's files
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(PRECACHE.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('shell-') && k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
function isFirebase(url) { return /googleapis\.com|firebaseio|identitytoolkit|securetoken|firebaseapp\.com|gstatic\.com\/firebasejs|google\.com\/recaptcha|apis\.google\.com|accounts\.google/.test(url.href); }
// Network first, but on a weak signal (one bar in the supermarket) use the saved copy after a few seconds
// instead of hanging; the network copy still updates the cache when it arrives.
function fresh(req, key, ms) {
  // an error page (404, 500) counts as no signal: use the saved copy rather than show a broken app
  const net = fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' })).then(res => { if (!res.ok) throw new Error('HTTP ' + res.status); const copy = res.clone(); caches.open(SHELL).then(c => c.put(key, copy)); return res; });
  const saved = caches.match(key);
  return new Promise(resolve => {
    let done = false; const finish = r => { if (!done && r) { done = true; resolve(r); } };
    net.then(finish).catch(() => saved.then(hit => finish(hit || fetch(req))));
    setTimeout(() => saved.then(hit => finish(hit)), ms);
  });
}
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (isFirebase(url)) return; // Firestore keeps its own offline copy
  const same = url.origin === self.location.origin;
  // the install settings must always be fresh, or Chrome can mistake this app for another one on the same site
  if (same && url.pathname.endsWith('/manifest.webmanifest')) { e.respondWith(fetch(req, { cache: 'no-store' }).then(res => { const copy = res.clone(); caches.open(SHELL).then(c => c.put(req, copy)); return res; }).catch(() => caches.match(req))); return; }
  if (same && url.pathname.endsWith('/firebase-config.js')) { e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(SHELL).then(c => c.put(req, copy)); return res; }).catch(() => caches.match(req))); return; }
  if (same && url.pathname.endsWith('/data/library.json')) {
    // network first so price refreshes arrive; fall back to the saved copy offline
    e.respondWith(fresh(req, 'data/library.json', 4000));
    return;
  }
  if (same && req.mode === 'navigate') {
    e.respondWith(fresh(req, 'index.html', 3000));
    return;
  }
  if (same) { e.respondWith(caches.match(req, { ignoreSearch: false }).then(hit => hit || fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(SHELL).then(c => c.put(req, copy)); } return res; }))); return; }
  // fonts and photos from other sites: cache first, keep them for offline
  if (req.destination === 'image' || req.destination === 'font' || url.hostname.includes('fonts.g')) {
    e.respondWith(caches.open(RUNTIME).then(c => c.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()).then(() => trim(c)); return res; }).catch(() => hit))));
  }
});
// keep the photo cache to a sensible size on the phone: drop the oldest once there are more than 500
let trimming = false;
function trim(c) { if (trimming) return; trimming = true; c.keys().then(keys => Promise.all(keys.slice(0, Math.max(0, keys.length - 500)).map(k => c.delete(k)))).finally(() => { trimming = false; }); }
