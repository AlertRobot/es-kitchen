// E&S Kitchen service worker: keeps the app, recipe library and photos available offline.
const VERSION = 'mvmothqj';
const SHELL = 'shell-' + VERSION;
const RUNTIME = 'runtime-v1';
const PRECACHE = ['./', 'index.html', 'firebase-config.js', 'app.js?v=' + VERSION, 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'data/library.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('shell-') && k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
function isFirebase(url) { return /googleapis\.com|firebaseio|identitytoolkit|securetoken|firebaseapp\.com|gstatic\.com\/firebasejs|google\.com\/recaptcha|apis\.google\.com|accounts\.google/.test(url.href); }
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
    e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(SHELL).then(c => c.put('data/library.json', copy)); return res; }).catch(() => caches.match('data/library.json')));
    return;
  }
  if (same && req.mode === 'navigate') {
    e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(SHELL).then(c => c.put('index.html', copy)); return res; }).catch(() => caches.match('index.html')));
    return;
  }
  if (same) { e.respondWith(caches.match(req, { ignoreSearch: false }).then(hit => hit || fetch(req).then(res => { const copy = res.clone(); caches.open(SHELL).then(c => c.put(req, copy)); return res; }))); return; }
  // fonts and photos from other sites: cache first, keep them for offline
  if (req.destination === 'image' || req.destination === 'font' || url.hostname.includes('fonts.g')) {
    e.respondWith(caches.open(RUNTIME).then(c => c.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => hit))));
  }
});
