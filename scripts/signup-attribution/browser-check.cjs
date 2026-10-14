// Local compiled app only. Block service workers so routing covers every request. This does not create Auth users or contact remote services.
const { chromium } = require('@playwright/test')
const assert = require('node:assert/strict')
;(async () => {
  const browser = await chromium.launch({channel:'chrome',headless:true})
  try {
    const context = await browser.newContext({serviceWorkers:'block'})
    await context.route('**/*', route => {
      const url = new URL(route.request().url())
      return url.hostname === '127.0.0.1' ? route.continue() : route.abort()
    })
    const page = await context.newPage()
    page.setDefaultNavigationTimeout(60000)
    const origin = 'http://127.0.0.1:3106'
    await page.goto(origin + '/?utm_source=threads&utm_medium=post_body&utm_campaign=devlog&utm_content=1020-08&email=private#token', {waitUntil:'networkidle'})
    await page.waitForFunction(() => localStorage.getItem('sl_first_touch'))
    const first = await page.evaluate(() => JSON.parse(localStorage.getItem('sl_first_touch')))
    assert.equal(first.source,'threads')
    assert.deepEqual(Object.keys(first).sort(),['source','medium','campaign','content','ts'].sort())
    await page.evaluate(() => {
      const row=JSON.parse(localStorage.getItem('sl_first_touch'))
      localStorage.setItem('sl_first_touch',JSON.stringify({...row,landing_path:'/school/[redacted]'}))
    })
    await page.goto(origin + '/privacy?utm_source=instagram', {waitUntil:'networkidle'})
    await page.waitForFunction(() => !('landing_path' in JSON.parse(localStorage.getItem('sl_first_touch'))))
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('sl_first_touch'))),first)
    await page.evaluate(() => {
      const row=JSON.parse(localStorage.getItem('sl_first_touch'))
      row.ts=Date.now()-7*86400000
      localStorage.setItem('sl_first_touch',JSON.stringify(row))
    })
    await page.reload({waitUntil:'networkidle'})
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('sl_first_touch')).source==='instagram')
    const blocked = await browser.newContext({serviceWorkers:'block'})
    await blocked.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort())
    await blocked.addInitScript(() => Object.defineProperty(window,'localStorage',{get(){throw new Error('storage blocked')}}))
    const blockedPage=await blocked.newPage()
    const errors=[]; blockedPage.on('pageerror',error=>errors.push(error.message))
    await blockedPage.goto(origin+'/privacy', {waitUntil:'networkidle'})
    await blockedPage.waitForSelector('h1')
    assert.deepEqual(errors,[])
    console.log('BROWSER_PASS codes_only legacy_path_removed first_wins seven_day_refresh blocked_storage')
  } finally { await browser.close() }
})().catch(error=>{console.error(error.message);process.exitCode=1})
