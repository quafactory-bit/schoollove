// Offline integration fixture: real Next routes + local SQL functions, mocked
// Supabase HTTP envelope and rate provider. Never Google/Auth or a remote DB.
const { chromium }=require('@playwright/test')
const {execFileSync,execFile,spawn}=require('node:child_process')
const execFileAsync=require('node:util').promisify(execFile)
const {createServer}=require('node:http')
const {createHmac,randomBytes}=require('node:crypto')
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict')
// NextURL canonicalizes loopback hosts to localhost; use that browser origin.
const origin='http://localhost:3127',api='http://127.0.0.1:3126'
const name='schoollove-p2-browser-'+randomBytes(4).toString('hex')
const school='00000000-0000-4000-8000-000000000011'
const image='public.ecr.aws/supabase/postgres:17.11.0.002'
const command=(args)=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30000,windowsHide:true})
const sql=(query)=>command(['exec',name,'psql','-h','/tmp','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-qAt','-c',query]).trim()
const sqlAsync=async query=>(await execFileAsync('docker',['exec',name,'psql','-h','/tmp','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-qAt','-c',query],{encoding:'utf8',timeout:30000,windowsHide:true})).stdout.trim()
const quote=v=>v===null||v===undefined?'NULL':"'"+String(v).replaceAll("'","''")+"'"
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))
let server,next,browser,container=false
const folder=path.resolve('artifacts/mockups/2026-11-part2')
const localEnvironment={...process.env,NEXT_PUBLIC_SUPABASE_URL:api,NEXT_PUBLIC_SUPABASE_ANON_KEY:'local-public-fixture',SUPABASE_SERVICE_ROLE_KEY:'local-server-fixture',NEXT_PUBLIC_SITE_URL:origin,NEXT_PUBLIC_SITE_DOMAIN:'',SCHOOLLOVE_SOCIAL_BROKER_EXPOSURE:'off',VERCEL_ENV:'preview',UPSTASH_REDIS_REST_URL:api,UPSTASH_REDIS_REST_TOKEN:'local-limiter-fixture',ADMIN_PASSWORD:'local-admin-fixture'}
async function run(){
 try {
  command(['image','inspect',image]);
  command(['run','-d','--network','none','--name',name,'--user','postgres','--entrypoint','/bin/bash',image,'-c',"initdb -D /tmp/part2-data --auth=trust >/tmp/init.log && exec postgres -D /tmp/part2-data -k /tmp -c listen_addresses=''"]);container=true
  let ready=false
  for(let i=0;i<40;i++){try{command(['exec',name,'pg_isready','-h','/tmp','-U','postgres']);ready=true;break}catch{}await pause(250)}
  assert.ok(ready,'local PostgreSQL ready')
  for(const file of ['scripts/part2-funnel/fixture.sql','supabase/migrations/20261111021213_part2_daily_funnel.sql']){
   command(['cp',path.resolve(file),name+':/tmp/input.sql']);command(['exec',name,'psql','-h','/tmp','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-q','-f','/tmp/input.sql'])
  }
  sql("ALTER TABLE public.schools ADD COLUMN school_type text DEFAULT 'high', ADD COLUMN sido text DEFAULT 'Fixture', ADD COLUMN sigungu text DEFAULT 'Region', ADD COLUMN address text DEFAULT '', ADD COLUMN school_code text DEFAULT '', ADD COLUMN created_at timestamptz DEFAULT now();")
  const schools=JSON.parse(sql('SELECT jsonb_agg(to_jsonb(s)) FROM public.schools s'))
  server=createServer(async(req,res)=>{
   const headers={'content-type':'application/json','access-control-allow-origin':origin,'access-control-allow-headers':'authorization,apikey,x-client-info,content-type,prefer','access-control-allow-methods':'GET,POST,OPTIONS'}
   if(req.method==='OPTIONS'){res.writeHead(204,headers);res.end();return}
   let raw='';for await(const chunk of req)raw+=chunk
   const url=new URL(req.url,api),fn=url.pathname.split('/').pop()
   const respond=(value,status=200)=>{res.writeHead(status,headers);res.end(JSON.stringify(value))}
   try{
    if(!url.pathname.startsWith('/rest/v1/')){
     const data=JSON.parse(raw||'[]')
     return respond(Array.isArray(data[0])?data.map(()=>({result:[79,80]})):{result:[79,80]})
    }
    const input=raw?JSON.parse(raw):{}
    if(fn==='part2_record_funnel_event')return respond((await sqlAsync('SET ROLE service_role; SELECT public.part2_record_funnel_event('+[input.requested_event,input.requested_source,input.requested_browser,input.requested_school_id].map(quote).join(',')+');'))==='t')
    if(fn==='part2_get_funnel_snapshot')return respond(JSON.parse(await sqlAsync('SET ROLE service_role; SELECT public.part2_get_funnel_snapshot();')))
    if(fn==='get_public_account_launch_state')return respond([{state:'open',registration_enabled:true,private_profile_enabled:true,school_membership_enabled:true,emergency_stopped:false}])
    if(fn==='record_public_account_activity')return respond(true)
    if(fn==='search_schools_v2'||fn==='search_schools_with_activity')return respond(schools)
    if(fn==='school_year_counts_v2')return respond([])
    if(fn==='schools')return respond(schools.find(s=>url.searchParams.get('slug')==='eq.'+s.slug)??schools[0])
    respond({code:'LOCAL_FIXTURE_UNAVAILABLE'},503)
   }catch{respond({code:'LOCAL_FIXTURE_UNAVAILABLE'},503)}
  })
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(3126,'127.0.0.1',resolve)})
  next=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3127','-H','127.0.0.1'],{env:localEnvironment,stdio:['ignore','pipe','pipe'],windowsHide:true})
  next.stdout.on('data',()=>{});next.stderr.on('data',()=>{})
  let started=false
  for(let i=0;i<50;i++){try{if((await fetch(origin)).status===200){started=true;break}}catch{}await pause(500)}
  assert.ok(started,'compiled Next app ready')
  browser=await chromium.launch({channel:'chrome',headless:true})
  const context=await browser.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true,serviceWorkers:'block',userAgent:'Synthetic Threads local verification'})
  await context.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort())
  const page=await context.newPage(),errors=[],payloads=[],metricStatuses=[]
  page.on('response',response=>{if(new URL(response.url()).pathname==='/api/metrics/funnel')metricStatuses.push(response.status())})
  page.on('pageerror',e=>errors.push(e.name))
  page.on('request',req=>{if(new URL(req.url()).pathname==='/api/metrics/funnel')payloads.push(JSON.parse(req.postData()))})
  await page.goto(origin+'/?ref=threads',{waitUntil:'networkidle'})
  await page.getByRole('combobox',{name:'학교 이름 찾기'}).fill('Fixture')
  const detailRecorded=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/metrics/funnel'&&response.request().postDataJSON()?.event==='school_detail_viewed',{timeout:15000})
  await page.getByRole('option').filter({hasText:'Fixture A'}).click()
  await page.waitForURL('**/school/fixture-a');await page.waitForLoadState('networkidle')
  await page.getByRole('heading',{name:'Fixture A',exact:true}).waitFor()
  assert.equal((await detailRecorded).status(),204,'school detail ingestion')
  const rawCounts=sql("SELECT jsonb_object_agg(event_key,event_count) FROM public.part2_daily_funnel")
  assert.ok(rawCounts,'metrics reached local SQL; API statuses='+metricStatuses.join(','))
  const counts=JSON.parse(rawCounts)
  for(const key of ['landing_view','home_viewed','home_search_submitted','school_search_submitted','school_result_selected','school_detail_viewed'])assert.equal(counts[key],1,key+' SQL count')
  assert.ok(payloads.every(p=>Object.keys(p).every(k=>['event','source','schoolId'].includes(k))))
  assert.equal(sql("SELECT count(*) FROM public.part2_daily_funnel WHERE source_channel<>'threads' OR browser_context<>'threads'"),'0')
  assert.equal((await context.request.get(origin+'/api/admin/funnel?download=1')).status(),401)
  assert.equal((await context.request.post(origin+'/api/metrics/funnel',{headers:{origin},data:{event:'signup_completed',source:'threads'}})).status(),400)
  const expiry=String(Date.now()+3600000)
  const localCookie=expiry+'.'+createHmac('sha256',localEnvironment.ADMIN_PASSWORD).update(expiry).digest('hex')
  await context.addCookies([{name:'sl_admin_session',value:localCookie,url:origin,httpOnly:true,sameSite:'Lax'}])
  const first=await context.request.get(origin+'/api/admin/funnel?download=1');assert.equal(first.status(),200)
  const firstReport=await first.json();assert.equal(firstReport.windows[0].stages.find(s=>s.event==='home_viewed').count,1);assert.ok(firstReport.windows[0].bySource.every(s=>s.stages.every(c=>c.count===null)));assert.ok(first.headers()['content-disposition'].includes('funnel_feedback_report.json'))
  await page.goto(origin+'/admin/operations',{waitUntil:'networkidle'})
  const firstPanel=page.getByRole('heading',{name:'방문에서 출석까지'}).locator('..')
  await firstPanel.getByRole('cell',{name:'1',exact:true}).first().waitFor()
  await firstPanel.getByRole('cell',{name:'0',exact:true}).first().waitFor()
  fs.mkdirSync(folder,{recursive:true});await firstPanel.screenshot({path:path.join(folder,'p0-1b-admin-375.png')})
  sql('UPDATE public.part2_daily_funnel SET event_count=20;')
  await page.goto(origin+'/admin/operations',{waitUntil:'networkidle'})
  const heading=page.getByRole('heading',{name:'방문에서 출석까지'})
  await heading.waitFor();const panel=heading.locator('..')
  await panel.getByRole('cell',{name:'20',exact:true}).first().waitFor()
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'mobile horizontal overflow')
  fs.mkdirSync(folder,{recursive:true});await panel.screenshot({path:path.join(folder,'p0-1-admin-375.png')})
  const download=await context.request.get(origin+'/api/admin/funnel?download=1');const report=await download.json()
  assert.equal(report.windows[0].stages.find(s=>s.event==='home_viewed').count,20)
  assert.equal(report.windows[0].lowSignupSchools[0].signupCount,null)
  assert.equal(report.windows[0].lowSignupSchools[0].signupBand,'10명 미만')
  sql('REVOKE SELECT ON public.part2_daily_funnel FROM service_role;')
  assert.equal((await context.request.get(origin+'/api/admin/funnel')).status(),503)
  assert.equal(errors.length,0,'browser page errors')
  console.log('PART2_BROWSER_PASS ui_to_api_to_local_sql admin_auth masking json_download unavailable_state viewport375 page_errors0 no_remote_calls no_google_signup')
 }finally{
  if(browser)await browser.close()
  if(next){next.kill();await pause(500)}
  if(server)await new Promise(resolve=>server.close(resolve))
  if(container){try{command(['rm','-f',name])}catch{}}
 }
}
run().catch(error=>{console.error('PART2_BROWSER_FAILED '+error.stack);process.exitCode=1})
