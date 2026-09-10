// Read-only screenshots of the unchanged PR112 production build, synthetic RPCs.
import {chromium, expect} from '@playwright/test'
import {mkdir, writeFile, readFile} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
const label=process.argv[2]||'before'
if(!['before','after','finish-before','finish-after'].includes(label))throw Error('Explicit capture phase required')
const folder=`.local/game-visual-polish/${label}-production`
await mkdir(folder,{recursive:true})
const browser=await chromium.launch({channel:'chrome',headless:true})
const results=[]
const buildId=(await readFile('.next/BUILD_ID','utf8')).trim()
const sourceBase=execFileSync('git',['rev-parse','HEAD']).toString().trim()
try {
  for (const [width,height] of [[390,844],[1440,900]]) {
    const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1})
    const page=await context.newPage()
    const cdp=await context.newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.setBlockedURLs',{urls:['https://*']})
    const response=await page.goto('http://127.0.0.1:3118',{waitUntil:'networkidle'})
    expect(response.status()).toBe(200)
    await expect(page.locator('.sl-hero-world .sl-world-image')).toBeVisible()
    await page.screenshot({path:`${folder}/home-${width}.png`,fullPage:true})
    results.push({width,height,dpr:1,status:response.status(),fixture:'synthetic guest; local-only RPC; no remote requests',sourceBase,label,buildId,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)})
    await context.close()
  }
} finally {await browser.close()}
await writeFile(`${folder}/screenshots.json`,JSON.stringify(results,null,2))
console.log(JSON.stringify(results))
