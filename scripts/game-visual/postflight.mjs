// Deployed public smoke: fresh session, public school metadata only, no auth/write.
import {chromium,expect} from '@playwright/test'
import {mkdir,writeFile} from 'node:fs/promises'
const base=process.argv[2], phase=process.argv[3]||'feature'
if(!base||!/^https:\/\//.test(base))throw Error('Explicit HTTPS deployment URL required')
const folder=`.local/game-visual/${phase}`;await mkdir(folder,{recursive:true})
const browser=await chromium.launch({channel:'chrome',headless:true})
const results=[]
try{
 for(const [width,height]of [[390,844],[1280,900],[1440,900]]){
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'})
  const errors=[],blocked=[];page.on('pageerror',e=>errors.push(e.message))
  await page.route('**/*',r=>{if(!['GET','HEAD'].includes(r.request().method())){blocked.push(new URL(r.request().url()).pathname);return r.abort()}return r.continue()})
  await page.addInitScript(()=>{
   window.__visualPerf={lcp:0,cls:0}
   new PerformanceObserver(list=>{for(const e of list.getEntries())window.__visualPerf.lcp=e.startTime}).observe({type:'largest-contentful-paint',buffered:true})
   new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput)window.__visualPerf.cls+=e.value}).observe({type:'layout-shift',buffered:true})
  })
  const response=await page.goto(base,{waitUntil:'networkidle'})
  expect(response.status()).toBe(200)
  await expect(page.locator('.sl-hero-world img')).toBeVisible()
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})))})
  await page.screenshot({path:`${folder}/home-${width}.png`,fullPage:true})
  const home=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,perf:window.__visualPerf,images:[...document.images].map(i=>({url:new URL(i.currentSrc).pathname,width:i.naturalWidth,loaded:i.complete&&i.naturalWidth>0}))}))
  expect(home.overflow).toBe(false);expect(home.images.every(i=>i.loaded)).toBe(true)
  await page.getByRole('combobox').fill('진명여자고등학교')
  await page.getByRole('button',{name:'내 학교 찾기'}).click()
  await expect(page.locator('.sl-search-result').first()).toBeVisible()
  await page.screenshot({path:`${folder}/search-${width}.png`,fullPage:true})
  await page.locator('.sl-search-result').first().click()
  await expect(page.locator('.sl-hub-world img')).toBeVisible()
  await page.evaluate(async()=>{await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})))})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.screenshot({path:`${folder}/school-${width}.png`,fullPage:true})
  const school={url:page.url(),heading:await page.locator('h1').textContent(),stage:await page.locator('.sl-hub-world [data-world-stage]').getAttribute('data-world-stage')}
  await page.goto(base+'/login',{waitUntil:'networkidle'})
  await expect(page.getByRole('link',{name:'Google로 계속하기'})).toBeVisible()
  expect(await page.getByRole('link',{name:/Kakao|Naver|카카오|네이버/}).count()).toBe(0)
  await page.screenshot({path:`${folder}/login-${width}.png`,fullPage:true})
  await page.goto(base+'/account',{waitUntil:'networkidle'})
  expect(new URL(page.url()).pathname).toBe('/login')
  expect(errors).toEqual([])
  results.push({viewport:[width,height],home,school,googleOnly:true,privateGuestRedirect:true,browserErrors:errors,blockedClientNonReadRequests:blocked})
  await page.close();console.log(`DEPLOYED_VIEWPORT_PASS ${width}`)
 }
}finally{await browser.close();await writeFile(`${folder}/postflight.json`,JSON.stringify(results,null,2))}
console.log(JSON.stringify(results))
