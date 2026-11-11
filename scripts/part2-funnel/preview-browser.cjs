// Approved Preview-only anonymous funnel check. No Auth, secrets or account writes.
const {chromium}=require('@playwright/test')
const assert=require('node:assert/strict')
const origin='https://preview.schoollove.kr'
const projectHost='hukokfyphyrpfouazxhq.supabase.co'
async function run(){
 const home=await fetch(origin,{redirect:'manual'})
 if(home.status!==200){console.log('PREVIEW_BROWSER_BLOCKED initial_status='+home.status);process.exitCode=2;return}
 const html=await home.text(),scripts=[...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m=>m[1])
 const hosts=new Set()
 for(const script of new Set(scripts)){
  const url=new URL(script,origin);assert.equal(url.origin,origin)
  const body=await(await fetch(url)).text()
  for(const m of body.matchAll(/https:\/\/([a-z0-9]+\.supabase\.co)/g))hosts.add(m[1])
 }
 assert.ok(hosts.has(projectHost),'compiled public database is Preview')
 assert.deepEqual([...hosts],[projectHost],'no other Supabase project in public bundle')
 console.log('PREVIEW_COMPILED_DB_REF=hukokfyphyrpfouazxhq')
 const browser=await chromium.launch({channel:'chrome',headless:true})
 try{
  const context=await browser.newContext({viewport:{width:375,height:812},serviceWorkers:'block'})
  await context.route('**/*',route=>{
   const url=new URL(route.request().url())
   if((url.origin===origin&&!/^\/(auth|oauth)(\/|$)/.test(url.pathname))||url.hostname===projectHost)return route.continue()
   return route.abort()
  })
  const page=await context.newPage(),events=[],errors=[]
  page.on('pageerror',e=>errors.push(e.name))
  page.on('response',r=>{if(new URL(r.url()).pathname==='/api/metrics/funnel')events.push({event:r.request().postDataJSON()?.event,status:r.status()})})
  await page.goto(origin+'/?ref=threads',{waitUntil:'networkidle'})
  const input=page.getByRole('combobox',{name:'학교 이름 찾기'})
  await input.fill('진명여자고등학교')
  await page.getByRole('button',{name:'내 학교 찾기',exact:true}).click()
  await page.waitForURL('**/search')
  const option=page.getByRole('link').filter({hasText:'진명여자고등학교'}).first()
  await option.waitFor({timeout:15000})
  const detail=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/metrics/funnel'&&r.request().postDataJSON()?.event==='school_detail_viewed',{timeout:20000})
  await option.click();await page.waitForURL('**/school/**');assert.equal((await detail).status(),204)
  for(const key of ['landing_view','home_viewed','school_search_submitted','school_detail_viewed'])assert.ok(events.some(e=>e.event===key&&e.status===204),key+' accepted')
  assert.equal((await context.request.get(origin+'/api/admin/funnel?download=1')).status(),401)
  assert.equal(errors.length,0)
  console.log('PREVIEW_BROWSER_PASS '+JSON.stringify({events,adminAnonymous:401,pageErrors:0,noGoogleSignup:true}))
 }finally{await browser.close()}
}
run().catch(e=>{console.error('PREVIEW_BROWSER_FAILED '+e.name+': '+e.message);process.exitCode=1})
