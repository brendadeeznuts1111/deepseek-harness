/* Network-only service worker. Presence makes the origin installable.
 * It does not cache, does not claim offline, and does not rewrite /api. */
self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', event => {
  event.respondWith(fetch(event.request))
})
