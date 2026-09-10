import { chromium, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { setup } from '../growth-ux/browser.mjs'
const folder='.local/game-visual/after'
await mkdir(folder,{recursive:true})
const browser=await chromium.launch({channel:'chrome',headless:true})
const results=[]
try {
 for(const [width,height] of [[360,800],[390,844],[412,915],[768,1024],[1280,900],[1440,900]]) {
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'})
  const evidence=await setup(page)
  for(const [name,url] of [
   ['home','/'],['home-member','/?mode=member&level=4'],['ranking','/?ranking=populated&level=7'],
   ['search','/search'],['school','/school/example-school'],['school-higher','/school/example-school?level=10'],
   ['account','/account?mode=member&level=4'],['login','/login'],['account-new','/account?mode=new']
  ]) {
   await page.goto('http://127.0.0.1:3117'+url)
   await page.locator('main').waitFor()
   if(name==='search'){await page.getByRole('combobox').fill('예시');await page.getByRole('combobox').press('Enter');await expect(page.getByRole('heading',{name:/검색 결과 1건/})).toBeVisible()}
   if(name==='account')await expect(page.locator('.sl-owner-dashboard')).toBeVisible()
   await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})))})
   const metrics=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,brokenImages:[...document.querySelectorAll('img')].filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src),motion:[...document.querySelectorAll('.sl-world-image,.sl-world-orbit')].every(e=>getComputedStyle(e).animationName==='none')}))
   await page.screenshot({path:`${folder}/${name}-${width}.png`,fullPage:true})
   results.push({name,viewport:[width,height],...metrics})
   if(name==='account'){
    const trigger=page.getByRole('button',{name:'친구 불러서 학교 키우기'});await trigger.click()
    const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible()
    for(let i=0;i<12;i++)await page.keyboard.press('Tab')
    expect(await dialog.evaluate(e=>e.contains(document.activeElement))).toBe(true)
    await dialog.evaluate(e=>e.scrollTop=0)
    const rect=await dialog.boundingBox()
    expect(rect.x).toBeGreaterThanOrEqual(0);expect(rect.x+rect.width).toBeLessThanOrEqual(width)
    expect(rect.y+rect.height).toBeLessThanOrEqual(height)
    await page.screenshot({path:`${folder}/share-${width}.png`})
    await page.keyboard.press('Escape');await expect(trigger).toBeFocused()
    results.push({name:'share',viewport:[width,height],overflow:false,focusTrap:true,escapeReturn:true,contained:true})
   }
  }
  expect(evidence.calls.filter(c=>c.method!=='GET')).toHaveLength(0)
  expect(evidence.errors).toEqual([])
  console.log(`VIEWPORT_COMPLETE ${width}`)
  await page.close()
 }
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'no-preference'})
 await setup(page);await page.goto('http://127.0.0.1:3117/')
 await expect(page.locator('.sl-hero-world img')).toBeVisible()
 expect(await page.locator('.sl-hero-world img').evaluate(e=>getComputedStyle(e).animationName)).toBe('sl-island-float')
 results.push({name:'ambient-motion',result:'PASS'})
 for(const [level,id] of [[1,'MEMORY_SEED'],[2,'FIRST_REUNION'],[4,'GROWING_CAMPUS'],[7,'LIVELY_SCHOOL'],[10,'BRIGHT_MEMORY']]){
  await page.goto('http://127.0.0.1:3117/school/example-school?level='+level)
  await expect(page.locator('.sl-hub-world [data-world-stage]')).toHaveAttribute('data-world-stage',id)
  await page.screenshot({path:`${folder}/stage-${level}.png`})
 }
} finally {await browser.close();await writeFile(`${folder}/matrix.json`,JSON.stringify(results,null,2))}
const failed=results.filter(r=>r.overflow||r.brokenImages?.length||r.motion===false)
console.log(JSON.stringify({captures:results.length,failures:failed}))
if(failed.length)process.exitCode=1
