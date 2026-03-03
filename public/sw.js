const CACHE_VERSION = 'sling402-v2';
const STATIC_CACHE = CACHE_VERSION + '-static';
const DYNAMIC_CACHE = CACHE_VERSION + '-dynamic';
const MAX_DYNAMIC = 50;

const STATIC_ASSETS = [
  '/',
  '/favicon.svg',
  '/logo.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/manifest.json',
  '/app.js'
];

// Install — precache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate — clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== STATIC_CACHE && k !== DYNAMIC_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET
  if (request.method !== 'GET') return;

  // Skip API, RPC, WebSocket — always network
  if (url.pathname.startsWith('/api/') || url.pathname === '/rpc' || url.pathname.startsWith('/ws/')) return;

  // Static assets — cache first, fallback network
  if (STATIC_ASSETS.includes(url.pathname) || request.url.match(/\.(png|svg|ico|woff2?)$/)) {
    event.respondWith(
      caches.match(request).then(cached => {
        const fetchPromise = fetch(request).then(response => {
          if (response.ok) {
            caches.open(STATIC_CACHE).then(cache => cache.put(request, response.clone()));
          }
          return response;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // HTML pages — network first, fallback cache
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            caches.open(DYNAMIC_CACHE).then(cache => cache.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => caches.match(request).then(cached => cached || caches.match('/')))
    );
    return;
  }

  // Everything else — network first with dynamic cache
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok && request.url.match(/\.(js|css|json)$/)) {
          const clone = response.clone();
          caches.open(DYNAMIC_CACHE).then(cache => {
            cache.put(request, clone);
            // Trim dynamic cache
            cache.keys().then(keys => {
              if (keys.length > MAX_DYNAMIC) {
                cache.delete(keys[0]);
              }
            });
          });
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

// Background sync for offline payments (future)
self.addEventListener('sync', event => {
  if (event.tag === 'sync-payments') {
    event.waitUntil(Promise.resolve());
  }
});

// Push notifications (future)
self.addEventListener('push', event => {
  const data = event.data?.json() || { title: 'Sling402', body: 'New X402 payment received' };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-96.png',
      vibrate: [100, 50, 100],
      tag: 'sling402-notification'
    })
  );
});
