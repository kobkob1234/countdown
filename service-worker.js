const CACHE_NAME = 'countdown-push-v7';
const CACHE_URLS = [
  './',
  './icon-192.png',
  './icon-512.png',
  './css/styles.css',
  './js/context.js',
  './js/events.js',
  './js/tasks.js',
  './js/calendar.js',
  './js/pomodoro.js',
  './js/ui.js',
  './js/state.js',
  './js/utils.js',
  './js/firebase-config.js',
  './js/auth.js',
  './js/notifications.js',
  './js/sync.js',
  './js/app.js',
  './js/controllers/mobile.js'
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

    // Try to find an existing window and navigate it
    for (const client of allClients) {
      try {
        // First check if we can navigate this client
        if ('navigate' in client) {
          await client.focus();
          await client.navigate(targetUrl);
          // Send message for in-page handling
          try {
            client.postMessage({ type: 'notificationclick', action, url: targetUrl });
          } catch (e) {
            // Best-effort, ignore errors
          }
          return; // Success - exit
        } else if ('focus' in client) {
          // Client exists but can't navigate - focus it and open new window
          await client.focus();
          // Fall through to openWindow below
          break;
        }
      } catch (e) {
        // Focus or navigation failed, try next client or fall through to openWindow
        console.warn('[SW] Client focus/navigate failed:', e);
      }
    }

    // No suitable client found or all navigation attempts failed - open new window
    await self.clients.openWindow(targetUrl);
  })());
});

// Handle push subscription changes (expiry, browser key rotation, etc.)
// This is critical for Android where subscriptions can expire silently
self.addEventListener('pushsubscriptionchange', (event) => {
  console.log('[SW] Push subscription changed, attempting to resubscribe...');

  event.waitUntil((async () => {
    try {
      // Get the old subscription's application server key if available
      const oldSubscription = event.oldSubscription;
      const newSubscription = event.newSubscription;

      if (newSubscription) {
        // Browser already created a new subscription, just notify the page
        console.log('[SW] New subscription available, notifying page...');
      } else if (oldSubscription) {
        // Need to resubscribe with the same application server key
        const applicationServerKey = oldSubscription.options?.applicationServerKey;
        if (applicationServerKey) {
          const newSub = await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationServerKey
          });
          console.log('[SW] Resubscribed successfully');
        }
      }

      // Notify all open windows to sync the subscription with Firebase
      const allClients = await self.clients.matchAll({ type: 'window' });
      for (const client of allClients) {
        try {
          client.postMessage({
            type: 'pushsubscriptionchange',
            reason: 'subscription_expired_or_changed'
          });
        } catch (e) {
          // Best-effort
        }
      }
    } catch (err) {
      console.error('[SW] Failed to handle subscription change:', err);
    }
  })());
});
