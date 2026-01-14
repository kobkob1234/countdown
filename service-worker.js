const CACHE_NAME = 'countdown-push-v7';
const NOTIFY_DEDUPE_CACHE = 'countdown-notify-dedupe-v1';
const NOTIFY_DEDUPE_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const PENDING_SUB_DB = 'countdown-pending-sub';
const PENDING_SUB_STORE = 'subscriptions';
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

// ============================================
// IndexedDB helpers for pending subscription sync
// ============================================
function openPendingSubDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PENDING_SUB_DB, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(PENDING_SUB_STORE)) {
        db.createObjectStore(PENDING_SUB_STORE, { keyPath: 'id' });
      }
    };
  });
}

async function savePendingSubscription(subscription) {
  try {
    const db = await openPendingSubDB();
    const tx = db.transaction(PENDING_SUB_STORE, 'readwrite');
    const store = tx.objectStore(PENDING_SUB_STORE);
    store.put({ id: 'pending', sub: subscription.toJSON(), ts: Date.now() });
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    console.log('[SW] Saved pending subscription to IndexedDB');
  } catch (e) {
    console.warn('[SW] Failed to save pending subscription:', e);
  }
}

async function clearPendingSubscription() {
  try {
    const db = await openPendingSubDB();
    const tx = db.transaction(PENDING_SUB_STORE, 'readwrite');
    const store = tx.objectStore(PENDING_SUB_STORE);
    store.delete('pending');
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (e) {
    // Best effort
  }
}

// ============================================
// Dedupe helpers
// ============================================
function buildDedupeRequest(key) {
  const safeKey = encodeURIComponent(String(key || ''));
  const base = new URL('./', self.location.href);
  return new Request(new URL(`__notify_dedupe__/${safeKey}`, base));
}

async function wasDedupeKeySeen(key, nowMs = Date.now()) {
  if (!key || !self.caches) return false;
  const cache = await caches.open(NOTIFY_DEDUPE_CACHE);
  const req = buildDedupeRequest(key);
  const res = await cache.match(req);
  if (!res) return false;
  const ts = Number(await res.text()) || 0;
  if (!ts || (nowMs - ts) > NOTIFY_DEDUPE_TTL_MS) {
    await cache.delete(req);
    return false;
  }
  return true;
}

async function markDedupeKeySeen(key, nowMs = Date.now()) {
  if (!key || !self.caches) return;
  const cache = await caches.open(NOTIFY_DEDUPE_CACHE);
  const req = buildDedupeRequest(key);
  await cache.put(req, new Response(String(nowMs), { headers: { 'content-type': 'text/plain' } }));
}

// Fix #9: Batch cleanup of expired dedupe entries
async function cleanupExpiredDedupeEntries() {
  if (!self.caches) return;
  try {
    const cache = await caches.open(NOTIFY_DEDUPE_CACHE);
    const keys = await cache.keys();
    const nowMs = Date.now();
    let cleaned = 0;
    for (const req of keys) {
      const res = await cache.match(req);
      if (res) {
        const ts = Number(await res.text()) || 0;
        if (!ts || (nowMs - ts) > NOTIFY_DEDUPE_TTL_MS) {
          await cache.delete(req);
          cleaned++;
        }
      }
    }
    if (cleaned > 0) {
      console.log(`[SW] Cleaned ${cleaned} expired dedupe entries`);
    }
  } catch (e) {
    console.warn('[SW] Dedupe cleanup failed:', e);
  }
}

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
        const keepCaches = new Set([CACHE_NAME, NOTIFY_DEDUPE_CACHE]);
        return Promise.all(
          keys.filter((key) => !keepCaches.has(key)).map((key) => caches.delete(key))
        );
      }),
      // Fix #9: Cleanup expired dedupe entries on activate
      cleanupExpiredDedupeEntries(),
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
  event.waitUntil((async () => {
    let data = {};
    try {
      data = event.data ? event.data.json() : {};
    } catch (e) {
      data = { title: 'Reminder', body: event.data ? event.data.text() : '' };
    }

    const dedupeKey = data?.dedupeKey || data?.data?.dedupeKey || '';
    if (dedupeKey) {
      try {
        if (await wasDedupeKeySeen(dedupeKey)) return;
        await markDedupeKeySeen(dedupeKey);
      } catch (e) {
        // Best-effort dedupe; continue on failure.
      }
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

    await self.registration.showNotification(title, options);
  })());
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
      let newSubscription = event.newSubscription;

      // If browser already created a new subscription, use it
      if (newSubscription) {
        console.log('[SW] New subscription available from browser');
      } else if (oldSubscription) {
        // Need to resubscribe with the same application server key
        const applicationServerKey = oldSubscription.options?.applicationServerKey;
        if (applicationServerKey) {
          try {
            newSubscription = await self.registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: applicationServerKey
            });
            console.log('[SW] Resubscribed successfully');
          } catch (e) {
            console.error('[SW] Resubscribe failed:', e);
          }
        }
      }

      // Notify all open windows to sync the subscription with Firebase
      const allClients = await self.clients.matchAll({ type: 'window' });
      let notifiedClient = false;

      for (const client of allClients) {
        try {
          client.postMessage({
            type: 'pushsubscriptionchange',
            reason: 'subscription_expired_or_changed'
          });
          notifiedClient = true;
        } catch (e) {
          // Best-effort
        }
      }

      // Fix #5: If no windows are open, save subscription to IndexedDB for later sync
      if (!notifiedClient && newSubscription) {
        console.log('[SW] No windows open, saving subscription to IndexedDB for later sync');
        await savePendingSubscription(newSubscription);
      }
    } catch (err) {
      console.error('[SW] Failed to handle subscription change:', err);
    }
  })());
});
