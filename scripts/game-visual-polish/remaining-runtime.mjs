// Compiled SSR/hydration and payload observation, NOT another LCP comparison batch.
import {chromium,expect} from '@playwright/test'
import {readFile,writeFile} from 'node:fs/promises'
const out='.local/game-visual-polish/remaining',base='http://127.0.0.1:3118'
const home=await fetch(base),html=await home.text()
expect(home.status).toBe(200);expect(html).not.toContain('data-campus-structure')
const assetPath='/_next/static/media/growing-campus-v2.be0d51a2.avif'
expect(html).toContain(assetPath)
const asset=await fetch(base+assetPath),bytes=Buffer.from(await asset.arrayBuffer())
expect(asset.headers.get('cache-control')).toContain('immutable')
expect(bytes.equals(await readFile('public/images/game/growing-campus-v2.avif'))).toBe(true)
const hub=await fetch(base+'/school/example-school'),hubHtml=await hub.text()
expect(hub.status).toBe(200);expect(hubHtml).toContain('data-campus-structure="memory-gate"')
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[]
try {
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'}),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 const cdp=await page.context().newCDPSession(page)
 await cdp.send('Network.enable');await cdp.send('Network.setBlockedURLs',{urls:['https://*']})
 for(const [name,path] of [['home','/'],['hub','/school/example-school']]) {
  await page.goto(base+path,{waitUntil:'networkidle'})
  await page.evaluate(async()=>Promise.all([...document.images].map(i=>i.decode())))
  expect(await page.locator('.sl-memory-gate').count()).toBe(name==='hub'?1:0)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false)
  const resources=await page.evaluate(()=>performance.getEntriesByType('resource').map(x=>x.toJSON()))
  const scriptBytes=resources.filter(x=>x.initiatorType==='script').reduce((n,x)=>n+x.decodedBodySize,0)
  await page.screenshot({path:`${out}/compiled-${name}-390.png`,fullPage:true})
  if(name==='hub') {
   await page.emulateMedia({reducedMotion:'no-preference'})
   const scene=page.locator('.sl-hub-world .sl-world');await scene.scrollIntoViewIfNeeded()
   const toggle=scene.getByRole('button')
   await expect(toggle).toBeEnabled();await toggle.click()
   await expect(scene).toHaveAttribute('data-motion','running')
   await toggle.click();await expect(scene).toHaveAttribute('data-motion','paused')
   await expect(scene.locator('.sl-world-structure')).toHaveCSS('animation-play-state','paused')
  }
  results.push({name,status:200,scriptDecodedBytes:scriptBytes,resources,overflow:false})
 }
 expect(errors).toEqual([])
 const prior=JSON.parse(await readFile('.local/game-visual-polish/perf-finish-after/cold-1.json','utf8'))
 const priorScriptBytes=prior.resources.filter(x=>x.initiatorType==='script').reduce((n,x)=>n+x.decodedBodySize,0)
 await writeFile(`${out}/compiled-check.json`,JSON.stringify({buildId:(await readFile('.next/BUILD_ID','utf8')).trim(),kind:'unthrottled SSR/hydration/payload smoke, no LCP claim',immutableAssetPreserved:true,ssrGate:true,errors,priorScriptDecodedBytes:priorScriptBytes,homeScriptByteDelta:results[0].scriptDecodedBytes-priorScriptBytes,results},null,2))
 console.log(JSON.stringify({ssrGate:true,hydrationErrors:errors.length,immutableAssetPreserved:true,priorScriptBytes,homeScriptBytes:results[0].scriptDecodedBytes,delta:results[0].scriptDecodedBytes-priorScriptBytes}))
}finally{await browser.close()}
