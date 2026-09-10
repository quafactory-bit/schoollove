import {chromium,expect} from '@playwright/test'
import {mkdir,writeFile} from 'node:fs/promises'
import {setup} from '../growth-ux/browser.mjs'
const folder=process.argv[2]||'.local/game-visual-polish/edges';await mkdir(folder,{recursive:true})
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[]
try {
 const long='아주 긴 이름을 가진 예시푸른추억국제문화예술고등학교'
 for(const [width,height,kind] of [[360,800,'narrow'],[720,450,'200-percent-reflow-equivalent']]) {
  const p=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'}),e=await setup(p)
  await p.route('**/api/account/growth?*',async route=>{
   const schoolId=new URL(route.request().url()).searchParams.get('school')
   e.calls.push({path:'/api/account/growth',method:route.request().method()})
   await route.fulfill({json:{contribution:{xp:0,contributed:false},growth:{schoolId,schoolName:long,slug:schoolId.endsWith('112')?'example-school-two':'example-school',level:7,progress:65,ownContributionXp:0}}})
  })
  // Local fixture data only: no application/server changes or real memberships.
  await p.route('**/scripts/growth-ux/data.jsx',async route=>{
   const response=await route.fetch()
   let body=(await response.text()).replaceAll('예시푸른고등학교',long)
   body+='\nif(fixture.mode==="member"){const first=fixture.state.memberships[0],id="11111111-1111-4111-8111-111111111112";fixture.state.memberships.push({...first,id:"44444444-4444-4444-8444-444444444445",school_id:id,school:{...first.school,id,slug:"example-school-two"}});}\n'
   await route.fulfill({response,body})
  })
  await p.goto('http://127.0.0.1:3117/account?mode=member&level=7')
  await expect(p.locator('.sl-owner-dashboard')).toHaveCount(2)
  expect(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false)
  await p.screenshot({path:`${folder}/${kind}-long-multiple.png`,fullPage:true})
  expect(e.calls.every(c=>c.method==='GET')).toBe(true);expect(e.errors).toEqual([])
  results.push({kind,width,height,longSchoolName:true,multipleCards:2,overflow:false,zoomNote:kind==='narrow'?null:'720 CSS px in place of 1440px at 200%; reflow-equivalent viewport, not a physical-browser zoom test'})
  await p.close()
 }
 const p=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'}),e=await setup(p)
 // Vite serves a JS URL module for static asset imports. Fail actual images,
 // not that application module; Next's compiled URL is tested separately.
 const failedImages=[]
 await p.route('**/images/game/**',r=>{
  if(r.request().resourceType()==='image'){failedImages.push(new URL(r.request().url()).pathname);return r.abort()}
  return r.fallback()
 })
 await p.goto('http://127.0.0.1:3117/')
 await expect(p.getByRole('button',{name:'내 학교 찾기'})).toBeEnabled()
 await expect(p.getByRole('combobox')).toBeVisible()
 await expect.poll(()=>failedImages.length).toBeGreaterThan(0)
 await expect.poll(()=>p.locator('.sl-world-image').evaluateAll(images=>images.length>0&&images.every(i=>i.complete&&i.naturalWidth===0))).toBe(true)
 expect(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false)
 await p.screenshot({path:`${folder}/image-failure.png`})
 expect(e.errors).toEqual([]);expect(e.calls.every(c=>c.method==='GET')).toBe(true)
 results.push({kind:'decorative image failure',searchUsable:true,overflow:false,explicitWrites:0,failedImages})
 await p.close()
} finally {await browser.close();await writeFile(`${folder}/results.json`,JSON.stringify(results,null,2))}
console.log(JSON.stringify(results))
