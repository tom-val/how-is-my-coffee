// Kill switch for the service worker of the pre-rework web app ("How is my coffee?", a Vite PWA
// that registered /sw.js). Browsers that still run it keep serving the OLD cached app even after
// a deploy. They re-check /sw.js on every visit; this version replaces the old one, deletes its
// caches, unregisters itself and reloads open tabs into the current app. Keep it deployed for a
// few months, then it can go (the new app never registers a service worker).
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) client.navigate(client.url);
    })(),
  );
});
