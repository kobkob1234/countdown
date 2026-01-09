const CACHE_NAME = 'countdown-push-v3';
const CACHE_URLS = [
  './',
  './icon-192.png',
  './icon-512.png',
  './css/styles.css',
  './js/state.js',
  './js/utils.js',
  './js/firebase-config.js',
  './js/auth.js',
  './js/notifications.js',
  './js/sync.js',
  './js/app.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  // Pre-cache essential files
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CACHE_URLS).catch((err) => {
        console.warn('[SW] Cache addAll failed:', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Clean up old caches
      caches.keys().then((keys) => {
        return Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        );
      }),
      // Register periodic sync if available (helps keep SW alive on Android)
      (async () => {
        if ('periodicSync' in self.registration) {
          try {
            await self.registration.periodicSync.register('push-keepalive', {
              minInterval: 12 * 60 * 60 * 1000 // 12 hours
            });
            console.log('[SW] Periodic sync registered');
          } catch (e) {
            console.log('[SW] Periodic sync not available:', e.message);
          }
        }
      })()
    ])
  );
});

// Fetch handler - required to keep service worker alive on Android
self.addEventListener('fetch', (event) => {
  // Only cache same-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Network-first strategy for HTML, cache-first for assets
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('./'))
    );
  } else if (event.request.destination === 'image') {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
  }
});

// Periodic sync handler (Android background keepalive)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'push-keepalive') {
    console.log('[SW] Periodic sync triggered - service worker active');
  }
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Reminder', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Task Reminder';
  const options = {
    body: data.body || '',
    icon: data.icon || './icon-192.png',
    // badge: data.badge || './icon-192.png', // Removed to fix Android white square issue
    vibrate: data.vibrate || [200, 100, 200, 100, 200],
    tag: data.tag || 'reminder',
    renotify: data.renotify ?? true,
    requireInteraction: data.requireInteraction ?? true,
    data: {
      url: data.url || '/',
      completeUrl: data.completeUrl || null,
      raw: data.data || null
    },
    actions: Array.isArray(data.actions) && data.actions.length
      ? data.actions
      : [
        { action: 'view', title: 'View' },
        { action: 'complete', title: 'Done' }
      ]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  const url = event.notification?.data?.url || '/';
  const completeUrl = event.notification?.data?.completeUrl || null;
  const action = event.action || 'view';
  event.notification.close();

  event.waitUntil((async () => {
    const targetUrl = (action === 'complete' && completeUrl) ? completeUrl : url;

    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of allClients) {
      try {
        if ('focus' in client) {
          await client.focus();
          // Try to navigate - if this fails, we'll fall through to openWindow
          try {
            if ('navigate' in client) {
              await client.navigate(targetUrl);
              // Best-effort in-page handling without full reload (if app listens)
              try { client.postMessage({ type: 'notificationclick', action, url: targetUrl }); } catch (e) { }
              return;
            }
          } catch (navError) {
            console.warn('[SW] Navigation failed, opening new window:', navError);
            // Fall through to openWindow below
            break;
          }
          return;
        }
      } catch (e) {
        // Focus failed, try next client
      }
    }
    await self.clients.openWindow(targetUrl);
  })());
});
