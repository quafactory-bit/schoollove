// Read-only: load public pages like crawlers do and record client-side errors.
// Usage: PATHS="home,/search" ONLY=noSwLoaded node scripts/crawler-check.cjs "$PWD" https://www.schoollove.kr  (read-only)
const { chromium } = require(require.resolve('@playwright/test', { paths: [process.argv[2]] }))
const base = process.argv[3] || 'https://www.schoollove.kr'
const paths = (process.env.PATHS || process.argv[4] || '/,/search,/school/seoul-songpa-garaggodeunghaggyo,/school/seoul-songpa-garaggodeunghaggyo/2005,/privacy').split(',').map((p) => p === 'home' ? '/' : p)
const GOOGLEBOT = 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
const scenarios = {
  googlebot: { ua: GOOGLEBOT, init: null },
  // Many crawlers/renderers: no Notification, no serviceWorker, storage throws.
  locked: { ua: GOOGLEBOT, init: () => {
    for (const k of ['localStorage', 'sessionStorage']) Object.defineProperty(window, k, { get() { throw new DOMException('denied', 'SecurityError') } })
    try { delete window.Notification } catch {}
    Object.defineProperty(window, 'Notification', { value: undefined, configurable: true })
    try { Object.defineProperty(navigator, 'serviceWorker', { value: undefined, configurable: true }) } catch {}
    Object.defineProperty(window, 'matchMedia', { value: undefined, configurable: true })
    Object.defineProperty(window, 'PushManager', { value: undefined, configurable: true })
  } },
  // Googlebot-like: service workers unavailable and the document already 'complete' when hydration effects run.
  noSwLoaded: { ua: GOOGLEBOT, init: () => {
    Object.defineProperty(navigator, 'serviceWorker', { value: undefined, configurable: true })
    Object.defineProperty(document, 'readyState', { get: () => 'complete', configurable: true })
  } },
  // Crawlers often refuse cross-origin XHR (Supabase) during rendering.
  noApi: { ua: GOOGLEBOT, init: null, route: { match: /supabase\.co/, handler: (r) => r.abort() } },
  // Cached HTML from a previous deploy asks for chunks that no longer exist.
  staleChunk: { ua: GOOGLEBOT, init: null, route: { match: /\/_next\/static\/chunks\/app\/.*page-.*\.js/, handler: (r) => r.fulfill({ status: 404, body: 'not found' }) } },
}
if (process.env.ONLY) for (const k of Object.keys(scenarios)) if (!process.env.ONLY.split(',').includes(k)) delete scenarios[k]
;(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  for (const [name, sc] of Object.entries(scenarios)) {
    const context = await browser.newContext({ userAgent: sc.ua, viewport: { width: 412, height: 732 } })
    if (sc.init) await context.addInitScript(sc.init)
    if (sc.route) await context.route(sc.route.match, sc.route.handler)
    for (const p of paths) {
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)))
      page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)) })
      let status = 0
      try { status = (await page.goto(base + p, { waitUntil: 'networkidle', timeout: 45000 }))?.status() ?? 0 } catch (e) { errors.push('nav: ' + e.message.slice(0, 120)) }
      await page.waitForTimeout(1500)
      const appError = await page.evaluate(() => document.body?.innerText.includes('Application error') || document.body?.innerText.includes('client-side exception')).catch(() => null)
      console.log(JSON.stringify({ scenario: name, path: p, status, appError, errors: [...new Set(errors)].slice(0, 6) }))
      await page.close()
    }
    await context.close()
  }
  await browser.close()
})().catch((e) => { console.error(e); process.exitCode = 1 })
