// ============================================================================
// Service Worker (sw.js)
//
// Lives in /public/sw.js (root of the served site). Runs in the background,
// independent of any tab. Wakes when a push arrives, shows a notification,
// and routes clicks back into the app.
//
// CRITICAL: This file MUST be in /public/sw.js (NOT /src/) — service workers
// can only control the path they're served from. /public/sw.js is served at
// the site root, which is what we want.
// ============================================================================

self.addEventListener('install', (event) => {
  // Activate immediately on first install, don't wait for existing tabs to close
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Take control of pages right away
  event.waitUntil(self.clients.claim());
});

// ---- Push event: a push has arrived from the server ----
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    // Fallback to text
    payload = { title: 'MatchGPT', body: event.data ? event.data.text() : 'New activity' };
  }

  const title = payload.title || 'MatchGPT';
  const options = {
    body: payload.body || '',
    icon: '/icon-192.png',          // shown in the notification
    badge: '/badge-72.png',          // shown in OS tray on Android
    tag: payload.tag || 'shaadigpt-notification',  // collapse duplicate notifications
    renotify: true,                   // even if collapsed, vibrate again
    data: payload.data || {},
    requireInteraction: false,        // notification dismisses on its own
    actions: payload.actions || [],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ---- Notification click: bring the app to the foreground (or open it) ----
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const deepLink = data.deep_link || '/';

  event.waitUntil(
    (async () => {
      // If a MatchGPT tab is already open, focus it instead of opening a new one
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const appUrl = self.location.origin;

      for (const client of allClients) {
        if (client.url.startsWith(appUrl)) {
          // Send the deep link to the tab and focus it
          client.postMessage({ type: 'push_click', deepLink, data });
          return client.focus();
        }
      }

      // No tab open: open the site, which reads where to go from ?push= (Dashboard).
      // (Paths like /matches don't exist on the site.)
      return self.clients.openWindow(`${appUrl}/?push=${encodeURIComponent(JSON.stringify(data))}`);
    })()
  );
});

// ---- Notification close: just for logging/analytics if needed ----
self.addEventListener('notificationclose', (event) => {
  // Could send analytics here if we wanted to track dismiss rate
});
