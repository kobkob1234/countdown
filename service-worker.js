self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
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
