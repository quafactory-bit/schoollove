// Part 2 P2b: One Tap + in-app browser fallback check against a deployed site.
// Read-only: loads pages only, never clicks Google or submits anything.
// Usage: node scripts/part2-p2b/onetap-browser.cjs https://www.schoollove.kr [expectOneTap=0|1]
const { chromium } = require('@playwright/test')

const BASE = process.argv[2] || 'https://www.schoollove.kr'
const EXPECT_ONE_TAP = process.argv[3] === '1'
const AGENTS = {
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  instagram_ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0.0',
  threads_android: 'Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.0.0 Mobile Safari/537.36 Barcelona 350.0.0.0',
}

async function check(browser, name, ua, path) {
  const context = await browser.newContext({ userAgent: ua, viewport: name === 'desktop' ? { width: 1280, height: 900 } : { width: 375, height: 812 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(String(e.message).slice(0, 120)))
  const response = await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(2500)
  const result = await page.evaluate(() => ({
    url: location.href,
    gsiScript: !!document.querySelector('script[src*="accounts.google.com/gsi/client"]'),
    googleButton: !!document.querySelector('a[href="/auth/social/start/google"]'),
    inAppNotice: !!document.querySelector('[aria-label="외부 브라우저 안내"]'),
    noticeText: document.querySelector('[aria-label="외부 브라우저 안내"] p')?.textContent ?? null,
    chromeIntent: document.querySelector('[aria-label="외부 브라우저 안내"] a[href^="intent://"]')?.getAttribute('href') ?? null,
    appError: /Application error/i.test(document.body.innerText),
  }))
  await context.close()
  return { name, status: response?.status(), ...result, pageErrors: errors }
}

;(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const out = []
  try {
    out.push(await check(browser, 'desktop', AGENTS.desktop, '/login?ref=ig'))
    out.push(await check(browser, 'instagram_ios', AGENTS.instagram_ios, '/login?ref=ig'))
    out.push(await check(browser, 'threads_android', AGENTS.threads_android, '/login?ref=threads'))
  } finally { await browser.close() }
  console.log(JSON.stringify(out, null, 1))
  const [desktop, ig, threads] = out
  const failures = []
  for (const r of out) {
    if (r.status !== 200 || r.appError || !r.googleButton) failures.push(`${r.name}: status/appError/button`)
    if (!r.url.includes('ref=')) failures.push(`${r.name}: ref dropped`)
  }
  if (desktop.inAppNotice) failures.push('desktop: notice shown')
  if (desktop.gsiScript !== EXPECT_ONE_TAP) failures.push(`desktop: gsiScript=${desktop.gsiScript} expected ${EXPECT_ONE_TAP}`)
  for (const r of [ig, threads]) {
    if (!r.inAppNotice) failures.push(`${r.name}: no in-app notice`)
    if (r.gsiScript) failures.push(`${r.name}: One Tap script loaded inside in-app browser`)
  }
  if (!threads.chromeIntent || !threads.chromeIntent.includes('ref%3Dthreads')) failures.push('threads: Chrome intent missing or dropped ref')
  if (ig.chromeIntent) failures.push('instagram_ios: Android intent shown on iOS')
  console.log(failures.length ? `ONETAP_BROWSER_FAIL ${failures.join(' | ')}` : `ONETAP_BROWSER_PASS expectOneTap=${EXPECT_ONE_TAP}`)
  process.exit(failures.length ? 1 : 0)
})()
