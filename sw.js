// 511 Perf Calc — Service Worker
// Bump CACHE_VERSION on every push to trigger background cache refresh
const CACHE_VERSION = 'v1.6.11';
const CACHE_NAME = '511-perf-calc-' + CACHE_VERSION;

const ASSETS = [
  './',
  './index.html',
  './app.js',
  './compute.js',
  './config.js',
  './styles.css',
  './manifest.json',
  './images/SPLASH_PG_SSN.png',
  './images/Annex_B.png',
  './images/DA_Conversion.png',
  './images/HLDF_AI_OFF.png',
  './images/HLDF_AI_ON.png',
  './images/HOGE_AI_OFF.png',
  './images/HOGE_AI_ON.png',
  './images/MAX_MASS_TO_HOV_30MIN_AI_OFF.png',
  './images/MAX_MASS_TO_HOV_30MIN_AI_ON.png',
  './images/MAX_MASS_TO_HOV_AI_OFF.png',
  './images/MAX_MASS_TO_HOV_AI_ON.png',
  './images/PWR_ASSURANCE_1and3_1000PA.png',
  './images/PWR_ASSURANCE_1and3_2k4kPA.png',
  './images/PWR_ASSURANCE_2_1000PA.png',
  './images/PWR_ASSURANCE_2_2k4kPA.png',
  './images/SR_AI_OFF.png',
  './images/SR_AI_ON.png',
  './images/TV_AI_OFF.png',
  './images/TV_AI_ON.png',
];

// Install: cache all assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: delete old caches, claim clients immediately
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith('511-perf-calc-') && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch: cache-first, fall back to network
// version.json always goes direct to network so update checks are never served stale
self.addEventListener('fetch', event => {
  // Only handle GET requests for our own origin over http/https
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  // version.json — always network, never cache
  if (event.request.url.endsWith('version.json') || event.request.url.includes('version.json?')) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) return cached;
        // Not in cache — fetch from network and cache for next time
        return fetch(event.request).then(response => {
          if (!response || response.status !== 200 || response.type === 'opaque') {
            return response;
          }
          const toCache = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, toCache));
          return response;
        });
      })
  );
});