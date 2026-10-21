// CrabMetrics service worker. Version comes from js/version.js (the page loads the same file).
importScripts('js/version.js');
const CACHE = 'crabmetrics-cache-' + self.APP_VERSION;
const SHELL = ['./', './index.html', './manifest.webmanifest', './css/app.css',
  './js/version.js', './js/db.js', './js/calc.js', './js/pad.js', './js/ui.js', './js/history.js', './js/export.js', './js/main.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/logo-160.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))));
  // Not calling skipWaiting(): a new version waits until you tap "Apply update".
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('crabmetrics-cache-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', (e) => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // NOAA, maps etc. go to the network
  e.respondWith((async () => {
    const hit = await caches.match(e.request, { ignoreSearch: true });
    if (hit) return hit;
    try { return await fetch(e.request); }
    catch (err) { const fb = await caches.match('./index.html'); if (fb) return fb; throw err; }
  })());
});
