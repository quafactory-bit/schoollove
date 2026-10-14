// Local real-component capture and media lifecycle checks. External traffic is blocked.
import {chromium,expect} from '@playwright/test'
import {mkdir,writeFile} from 'node:fs/promises'
import {setup} from './browser.mjs'
const out='.local/growth-ux/fantasy-applied';await mkdir(out,{recursive:true})
const browser=await chromium.launch({channel:'chrome',headless:true});const results=[]
try {
 for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});const evidence=await setup(page)
  await page.route('**/api/connections/fixture**',async route=>{const p=new URL(route.request().url()).pathname;await route.fulfill({json:p.endsWith('/instagram')?{instagramHandle:'synthetic_friend',myInstagramConfigured:true,myInstagramVisible:false}:{connection:{id:'fixture',status:'active',displayName:'예시 친구'},capabilities:{messaging:false,instagramPermission:true}}})})
  async function capture(name){
   await page.waitForLoadState('networkidle');await page.locator('main').waitFor();
   await page.evaluate(async()=>{await Promise.all([...document.images].filter(i=>i.loading!=='lazy'||i.getBoundingClientRect().top<innerHeight).map(i=>i.decode().catch(()=>{})))})
   expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),name+' overflow').toBe(false)
   expect(await page.locator('img').evaluateAll(imgs=>imgs.filter(i=>i.getBoundingClientRect().top<innerHeight&&i.complete&&!i.naturalWidth).length),name+' broken image').toBe(0)
   await page.screenshot({path:`${out}/${name}-${width}.png`,fullPage:!name.startsWith('guide-')&&name!=='share'});results.push({name,width,overflow:false})
  }
  for(const [name,url] of [['home','/?mode=guest'],['search','/search'],['login','/login'],['onboarding','/onboarding'],['account','/account?mode=member'],['connections','/connections'],['detail','/connections/fixture'],...[1,2,4,7,10].map(l=>['school-'+l,'/school/example-school?level='+l])]){
   await page.goto('http://127.0.0.1:3117'+url);await capture(name)
  }
  await page.goto('http://127.0.0.1:3117/school/example-school?mode=member');await page.getByRole('button',{name:'친구 불러서 학교 키우기',exact:true}).click();await capture('share')
  await page.goto('http://127.0.0.1:3117/account?mode=new');await page.getByRole('dialog').waitFor()
  for(let step=1;step<=4;step++){await capture('guide-'+step);if(step<4)await page.getByRole('dialog').getByRole('button',{name:'다음',exact:true}).click()}
  expect(evidence.errors).toEqual([]);await page.close()
 }
 const page=await browser.newPage({viewport:{width:1280,height:900}});await setup(page)
 await page.goto('http://127.0.0.1:3117/');const hero=page.locator('.sl-fantasy-hero')
 await expect(hero).toHaveAttribute('data-motion','running')
 await hero.getByRole('button').click();await expect(hero).toHaveAttribute('data-motion','paused')
 await hero.getByRole('button').click();await expect(hero).toHaveAttribute('data-motion','running')
 await page.locator('.sl-siege-banner').scrollIntoViewIfNeeded();const siege=page.locator('.sl-scene-video--siege video')
 await expect.poll(()=>siege.evaluate(v=>!v.paused)).toBe(true);await expect(hero).toHaveAttribute('data-motion','paused')
 await page.getByRole('button',{name:'학교 순위 영상 멈추기',exact:true}).click();await expect.poll(()=>siege.evaluate(v=>v.paused)).toBe(true)
 await page.getByRole('button',{name:'학교 순위 영상 재생하기',exact:true}).click();await expect.poll(()=>siege.evaluate(v=>!v.paused)).toBe(true)
 await page.emulateMedia({reducedMotion:'reduce'});await expect.poll(()=>siege.evaluate(v=>v.paused)).toBe(true)
 await page.goto('http://127.0.0.1:3117/');await page.waitForLoadState('networkidle');await expect(page.locator('video')).toHaveCount(0)
 await expect(hero).toHaveAttribute('data-motion','paused')
 await page.emulateMedia({reducedMotion:'no-preference'});await page.route('**/videos/scenes/siege-loop-v1.mp4',r=>r.abort());await page.reload()
 await page.locator('.sl-siege-banner').scrollIntoViewIfNeeded()
 await expect(page.locator('.sl-scene-video--siege .sl-scene-poster')).toBeVisible();await expect.poll(()=>page.locator('.sl-scene-video--siege video').count()).toBe(0)
 results.push({mediaChecks:'hero pause/resume, siege play/pause/resume, offscreen, reduced motion, error poster',passed:true})
 await page.close()
} finally {await browser.close()}
await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify({screens:results.length-1,media:results.at(-1)}))
