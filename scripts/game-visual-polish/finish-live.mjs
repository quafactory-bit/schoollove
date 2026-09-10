// One deployment-scoped official review URL arrives only via stdin, never a file/argv.
// No storageState, cookie export, HAR, trace, raw URL/error logging, or live writes.
import {chromium,expect} from '@playwright/test'
import {mkdir,writeFile} from 'node:fs/promises'
import {createInterface} from 'node:readline'
const base=process.argv[2], deployment=process.argv[3]
if(!/^https:\/\/schoollove-[a-z0-9]+-quafactory-s-projects\.vercel\.app$/.test(base)||!deployment?.startsWith('dpl_'))throw Error('Exact feature deployment required')
const folder='.local/game-visual-polish/finish/live'
await mkdir(folder,{recursive:true})
console.log('AWAITING_OFFICIAL_REVIEW_URL_STDIN')
const input=createInterface({input:process.stdin,terminal:false})
const entry=await new Promise(resolve=>input.once('line',line=>{input.close();resolve(line.trim())}))
if(new URL(entry).origin!==base||!new URL(entry).searchParams.has('_vercel_share'))throw Error('Review URL must match exact deployment')
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[]
let current='access'
try {
 const context=await browser.newContext({reducedMotion:'reduce'})
 const page=await context.newPage(),errors=[],blocked=[]
 page.on('pageerror',()=>errors.push('PAGE_ERROR_REDACTED'))
 await page.route('**/*',async route=>{
  const request=route.request()
  if(!['GET','HEAD'].includes(request.method())){blocked.push(new URL(request.url()).pathname);return route.abort()}
  return route.continue()
 })
 // Let the official redirect set its normal browser cookie. Never inspect/export it.
 await page.goto(entry,{waitUntil:'networkidle'})
 if(new URL(page.url()).origin!==base)throw Error('Review access did not reach target')
 await page.goto(base,{waitUntil:'networkidle'})
 await expect(page.locator('.sl-hero-world .sl-world-image')).toBeVisible()
 for(const [width,height] of [[390,844],[1280,900],[1440,900]]) {
  await page.setViewportSize({width,height})
  for(const [name,path,selector] of [
   ['home','/','.sl-hero-world .sl-world-image'],
   ['school','/school/seoul-yangcheon-jinmyeongyeojagodeunghaggyo','.sl-hub-world .sl-world-image'],
   ['login','/login','main']
  ]) {
   current=`${name}-${width}`
   const response=await page.goto(base+path,{waitUntil:'networkidle'})
   expect(response.status()).toBe(200)
   expect(new URL(page.url()).origin).toBe(base)
   expect(new URL(page.url()).search).toBe('')
   await expect(page.locator(selector)).toBeVisible()
   await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})))})
   const visual=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,images:[...document.images].map(i=>({path:new URL(i.currentSrc).pathname,loaded:i.complete&&i.naturalWidth>0,width:i.naturalWidth})),animations:[...document.querySelectorAll('.sl-world-image,.sl-world-orbit')].map(e=>getComputedStyle(e).animationName)}))
   expect(visual.overflow).toBe(false);expect(visual.images.every(i=>i.loaded)).toBe(true)
   if(name==='home')expect(visual.images.some(i=>i.path==='/_next/static/media/growing-campus-v2.be0d51a2.avif')).toBe(true)
   if(name!=='login')expect(visual.animations.every(x=>x==='none')).toBe(true)
   if(name==='login') {
    expect(await page.getByRole('link',{name:/Kakao|Naver|카카오|네이버/}).count()).toBe(0)
    const google=await page.getByRole('link',{name:'Google로 계속하기'}).count()
    if(!google)await expect(page.getByRole('status')).toHaveText('로그인은 아직 열리지 않았습니다.')
   }
   await page.screenshot({path:`${folder}/${current}.png`,fullPage:true})
   results.push({name,path,viewport:[width,height],status:response.status(),...visual})
   console.log(`LIVE_READ_ONLY_PASS ${current}`)
  }
 }
 expect(errors).toEqual([])
 await writeFile(`${folder}/postflight.json`,JSON.stringify({base,deployment,results,errors,blockedClientNonReadRequests:blocked,access:'One official 23-hour deployment review link; URL/cookie not persisted',scope:'guest Home, public Hub, login entry; no search, account session, referral or external share'},null,2))
} catch {
 await writeFile(`${folder}/failure.json`,JSON.stringify({base,deployment,current,completed:results,error:'Live check failed; raw error omitted to avoid review URL leakage'},null,2))
 console.error(`LIVE_CHECK_FAILED ${current}`);process.exitCode=1
} finally {await browser.close()}
