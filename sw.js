// MockIQ Service Worker — Offline PWA Support
const CACHE_NAME = 'mockiq-v1';

// Files to cache for offline use
const PRECACHE = [
  './',
  './index.html',
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&family=Syne:wght@600;700;800&display=swap',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
];

// Install — cache all core files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('MockIQ SW: caching app shell');
      // Cache individually so one failure doesn't block the rest
      return Promise.allSettled(PRECACHE.map(url => cache.add(url)));
    }).then(() => self.skipWaiting())
  );
});

// Activate — delete old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch — network first, fall back to cache
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip Firebase, non-GET, and chrome-extension requests
  if (event.request.method !== 'GET') return;
  if (url.hostname.includes('firebase') || url.hostname.includes('google-analytics')) return;
  if (url.protocol === 'chrome-extension:') return;

  // For history.json and questionbank.json — network first, no cache
  // (these should always be fresh from GitHub)
  if (url.pathname.endsWith('history.json') || url.pathname.endsWith('questionbank.json')) {
    event.respondWith(
      fetch(event.request).catch(() => new Response('[]', { headers: {'Content-Type': 'application/json'} }))
    );
    return;
  }

  // For everything else — network first, cache fallback
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cache successful responses
        if (response && response.status === 200 && response.type !== 'opaque') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Offline fallback — serve from cache
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          // For navigation requests, serve index.html
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});
