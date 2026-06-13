// sw.js — offline service worker for My Business Cards.
// Strategy: precache the entire app shell; cache-first for everything in scope.
// Bump VERSION whenever any file changes to invalidate old caches.

var VERSION = 'vcards-v1';

var ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './card.js',
  './shaders.js',
  './qrcode.js',
  './logo-data.js',
  './logo-wavecraft.js',
  './manifest.webmanifest',
  './fonts/space-grotesk-var-latin.woff2',
  './fonts/ibm-plex-mono-400-latin.woff2',
  './fonts/ibm-plex-mono-500-latin.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(VERSION).then(function (cache) {
      return cache.addAll(ASSETS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== VERSION) return caches.delete(key);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(function (cached) {
      if (cached) return cached;
      return fetch(event.request).then(function (res) {
        // runtime-cache same-origin responses so updates self-heal
        if (res.ok && new URL(event.request.url).origin === location.origin) {
          var copy = res.clone();
          caches.open(VERSION).then(function (cache) { cache.put(event.request, copy); });
        }
        return res;
      }).catch(function () {
        // offline navigation fallback
        if (event.request.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      });
    })
  );
});
