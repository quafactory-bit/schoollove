import { afterEach, describe, expect, it, vi } from 'vitest'
import { getServiceWorkerContainer, isCrawlerUserAgent, isPushSupportedSafely, registerServiceWorkerSafely } from './browserSafety'

const GOOGLEBOT = 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
const CHROME = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'

afterEach(() => vi.unstubAllGlobals())

describe('crawler and WebView safety for browser-only APIs', () => {
  it('recognises search and link-preview crawlers but not normal or in-app browsers', () => {
    for (const ua of [GOOGLEBOT, 'Mozilla/5.0 (compatible; Yeti/1.1; +https://naver.me/spd)', 'facebookexternalhit/1.1', 'kakaotalk-scrap/1.0', 'Mozilla/5.0 (compatible; bingbot/2.0)']) expect(isCrawlerUserAgent(ua)).toBe(true)
    for (const ua of [CHROME, `${CHROME} Instagram 300.0`, `${CHROME} Barcelona 300.0`, '', null, undefined]) expect(isCrawlerUserAgent(ua)).toBe(false)
  })

  it('never throws when serviceWorker is missing, undefined, or its getter throws', () => {
    vi.stubGlobal('navigator', { userAgent: CHROME })
    expect(registerServiceWorkerSafely()).toBe(false)
    vi.stubGlobal('navigator', { userAgent: CHROME, serviceWorker: undefined })
    expect(registerServiceWorkerSafely()).toBe(false)
    const throwing = { userAgent: CHROME }
    Object.defineProperty(throwing, 'serviceWorker', { get() { throw new DOMException('denied', 'SecurityError') } })
    vi.stubGlobal('navigator', throwing)
    expect(getServiceWorkerContainer()).toBeNull()
    expect(registerServiceWorkerSafely()).toBe(false)
  })

  it('swallows synchronous and asynchronous register() failures', async () => {
    vi.stubGlobal('navigator', { userAgent: CHROME, serviceWorker: { register: () => { throw new DOMException('insecure', 'SecurityError') } } })
    expect(registerServiceWorkerSafely()).toBe(false)
    const rejected = Promise.reject(new Error('blocked'))
    vi.stubGlobal('navigator', { userAgent: CHROME, serviceWorker: { register: () => rejected } })
    expect(registerServiceWorkerSafely()).toBe(true)
    await expect(rejected.catch(() => 'handled')).resolves.toBe('handled')
  })

  it('skips service worker registration for Googlebot', () => {
    const register = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { userAgent: GOOGLEBOT, serviceWorker: { register } })
    expect(registerServiceWorkerSafely()).toBe(false)
    expect(register).not.toHaveBeenCalled()
  })

  it('reports push unsupported instead of throwing when Notification/PushManager are missing or broken', () => {
    vi.stubGlobal('navigator', { userAgent: CHROME, serviceWorker: { register: vi.fn() } })
    vi.stubGlobal('window', {})
    expect(isPushSupportedSafely()).toBe(false)
    vi.stubGlobal('window', { PushManager: function PushManager() {}, Notification: undefined })
    expect(isPushSupportedSafely()).toBe(false)
    const broken = { PushManager: function PushManager() {} }
    Object.defineProperty(broken, 'Notification', { get() { throw new Error('no') } })
    vi.stubGlobal('window', broken)
    expect(isPushSupportedSafely()).toBe(false)
    vi.stubGlobal('window', { PushManager: function PushManager() {}, Notification: { permission: 'default' } })
    expect(isPushSupportedSafely()).toBe(true)
  })
})
