/* True Access service worker — offline app shell for installability. */
const CACHE_NAME = 'true-access-v3';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './voice-trigger.js',
  './descriptions.js',
  './official-ad-db.json',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './vendor/chromaprint/index.js',
  './vendor/chromaprint/chromaprint.js',
  './vendor/chromaprint/chromaprint.wasm'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
