// =============================================
// AI Launch Tracker — Service Worker (PWA)
// Enables offline support + background sync
// =============================================

const CACHE_NAME = 'ai-launch-tracker-v1';
const STATIC_ASSETS = [
  './',
  'index.html',
  'style.css',
  'manifest.json'
];

// Install — cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('Some assets failed to cache:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch — network-first for API calls, cache-first for static assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API calls: network-first
  if (url.hostname !== self.location.hostname) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache successful API responses
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
        .catch(() => {
          // Fallback to cache
          return caches.match(event.request);
        })
    );
    return;
  }

  // Static assets: cache-first, then network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // Update cache in background
        fetch(event.request).then(response => {
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, response);
          });
        }).catch(() => {});
        return cached;
      }
      return fetch(event.request).then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, clone);
        });
        return response;
      });
    })
  );
});

// Background periodic sync (when supported)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-ai-launches') {
    event.waitUntil(checkForNewLaunches());
  }
});

async function checkForNewLaunches() {
  try {
    // Notify all clients to refresh
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({ type: 'REFRESH_NEWS' });
    });
  } catch (err) {
    console.error('Background sync error:', err);
  }
}
