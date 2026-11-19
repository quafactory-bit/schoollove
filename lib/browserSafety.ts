// Browser-only APIs can be missing, undefined-but-present, or throw on access in crawlers
// (Googlebot, link-preview bots), in-app WebViews and private modes. Nothing here throws.

const CRAWLER_UA = /bot|crawl|spider|slurp|facebookexternalhit|facebot|kakaotalk-scrap|yeti|daum|bingpreview|headlesschrome|lighthouse|embedly|preview/i

/** True for search/link-preview crawlers. They never need a service worker or push. */
export function isCrawlerUserAgent(userAgent: string | undefined | null): boolean {
  return typeof userAgent === 'string' && CRAWLER_UA.test(userAgent)
}

function readUserAgent(): string {
  try { return typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string' ? navigator.userAgent : '' } catch { return '' }
}

/** navigator.serviceWorker only when it is a real container with register(); otherwise null. */
export function getServiceWorkerContainer(): ServiceWorkerContainer | null {
  try {
    if (typeof navigator === 'undefined') return null
    const container = (navigator as Navigator & { serviceWorker?: ServiceWorkerContainer | null }).serviceWorker
    return container && typeof container.register === 'function' ? container : null
  } catch {
    return null
  }
}

/** Registers /sw.js without ever throwing (sync or async). Skips crawlers. Returns whether it tried. */
export function registerServiceWorkerSafely(url = '/sw.js'): boolean {
  if (isCrawlerUserAgent(readUserAgent())) return false
  const container = getServiceWorkerContainer()
  if (!container) return false
  try {
    const pending = container.register(url, { scope: '/', updateViaCache: 'none' })
    if (pending && typeof pending.catch === 'function') pending.catch(() => undefined)
    return true
  } catch {
    return false
  }
}

/** Web push needs a working service worker, PushManager and Notification. */
export function isPushSupportedSafely(): boolean {
  try {
    if (typeof window === 'undefined' || isCrawlerUserAgent(readUserAgent())) return false
    const w = window as Window & { PushManager?: unknown; Notification?: { permission?: unknown } }
    return getServiceWorkerContainer() !== null && Boolean(w.PushManager) && Boolean(w.Notification) && typeof w.Notification?.permission === 'string'
  } catch {
    return false
  }
}
