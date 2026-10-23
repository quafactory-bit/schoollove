const CACHE_PREFIX = 'schoollove-pwa-'
const CACHE_VERSION = `${CACHE_PREFIX}v2`
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

self.addEventListener('push', (event) => {
  let payload = {
    title: '출석부',
    body: '새 소식이 도착했어요.',
    url: '/account',
    tag: 'schoollove-v2',
  }
  if (event.data) {
    try {
      const received = event.data.json()
      if (received && typeof received === 'object') {
        payload = {
          title: typeof received.title === 'string' ? received.title : payload.title,
          body: typeof received.body === 'string' ? received.body : payload.body,
          url: typeof received.url === 'string' ? received.url : payload.url,
          tag: typeof received.tag === 'string' ? received.tag : payload.tag,
        }
      }
    } catch {
      // Keep the generic visible notification when a malformed payload arrives.
    }
  }

  let targetUrl = new URL('/', self.location.origin).href
  try {
    const candidate = new URL(payload.url, self.location.origin)
    if (candidate.origin === self.location.origin) targetUrl = candidate.href
  } catch {
    // Keep the same-origin Home fallback.
  }

  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body,
    // v2-09: 새 동문·요청 알림 2종만. 이름은 서버가 받는 사람이 출석부에서 볼 수 있을 때만 넣는다.
    icon: '/icons/icon-v2-192.png',
    badge: '/icons/icon-v2-192.png',
    tag: payload.tag,
    data: { url: targetUrl },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  let targetUrl = new URL('/', self.location.origin).href
  try {
    const candidate = new URL(event.notification.data?.url || '/', self.location.origin)
    if (candidate.origin === self.location.origin) targetUrl = candidate.href
  } catch {
    // Keep the same-origin Home fallback.
  }

  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = windows.find((client) => {
      try { return new URL(client.url).origin === self.location.origin } catch { return false }
    })
    if (existing) {
      try {
        await existing.navigate(targetUrl)
        await existing.focus()
        return
      } catch {
        // Fall through to a new window when an existing client cannot navigate.
      }
    }
    await clients.openWindow(targetUrl)
  })())
})
