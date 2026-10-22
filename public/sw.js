const CACHE_PREFIX = 'schoollove-pwa-'
const CACHE_VERSION = `${CACHE_PREFIX}v1`
const OFFLINE_URL = '/offline.html'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' })))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_VERSION)
          .map((key) => caches.delete(key)),
      )),
      'navigationPreload' in self.registration
        ? self.registration.navigationPreload.enable()
        : Promise.resolve(),
    ]).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.mode !== 'navigate') return

  const requestUrl = new URL(request.url)
  if (requestUrl.origin !== self.location.origin) return

  event.respondWith((async () => {
    try {
      const preloadResponse = await event.preloadResponse
      if (preloadResponse) return preloadResponse
      return await fetch(request)
    } catch {
      const offlineResponse = await caches.match(OFFLINE_URL)
      return offlineResponse || Response.error()
    }
  })())
})
