import {chromium} from '@playwright/test'
import {mkdir,writeFile} from 'node:fs/promises'
import path from 'node:path'
export const school={id:'11111111-1111-4111-8111-111111111111',school_name:'예시푸른고등학교',slug:'example-school',school_type:'high',sido:'예시시',sigungu:'예시구'}
export async function setup(page){
 const calls=[]; const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.hostname!=='127.0.0.1'){await route.abort();return}
  if(!url.pathname.startsWith('/api/')&&!url.pathname.startsWith('/mock/')){await route.continue();return}
  calls.push({path:url.pathname,method:req.method(),query:url.searchParams.get('q')})
  let body={};const status=200
  if(url.pathname.startsWith('/mock/'))body=[school]
  else if(url.pathname==='/api/schools/selection')body={school:url.searchParams.get('slug')===school.slug?school:null}
  else if(url.pathname==='/api/account/growth'){const level=Number(new URL(page.url()).searchParams.get('level'))||1;body={contribution:{xp:0,contributed:false},growth:{schoolId:school.id,schoolName:school.school_name,slug:school.slug,level,progress:level>1?65:0,ownContributionXp:0}}}
  else if(url.pathname==='/api/growth/referral')body={token:'a'.repeat(64),expiresIn:604800}
  else if(url.pathname==='/api/onboarding')body={state:{stage:'school_required',adultReady:true,consentsReady:true,profileReady:true,schoolReady:false}}
  else if(url.pathname.includes('notifications'))body={items:[],unreadCount:0,notifications:[]}
  else if(url.pathname==='/api/connections')body={connections:[]}
  else if(url.pathname==='/api/connections/requests')body={received:[{id:'55555555-5555-4555-8555-555555555555',senderName:'예시 사용자',status:'pending',relationshipType:'same_class',school:{schoolName:school.school_name,graduationYear:2018},message:'로컬 예시 안부'}],sent:[]}
  else if(url.pathname==='/api/account/memberships'&&req.method()==='POST'){
    const input=req.postDataJSON();await page.evaluate(({school,input})=>{window.__ux.state={...window.__ux.state,memberships:[{id:'44444444-4444-4444-8444-444444444444',school_id:school.id,school,graduation_year:input.graduation_year,class_number:null,class_history:[]}]};window.__ux.mode='member'},{school,input})
  }
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)})
 });return {calls,errors}
}
export async function capture(phase){
 const browser=await chromium.launch({headless:true,channel:'chrome'});const out=path.resolve('.local/growth-ux',phase);await mkdir(out,{recursive:true});const result=[]
 for(const [w,h] of [[360,800],[390,844],[412,915],[1280,900]]){
  const page=await browser.newPage({viewport:{width:w,height:h}});const {errors}=await setup(page)
  for(const [name,url] of [['home','/?mode=guest'],['search','/search'],['school','/school/example-school'],['login','/login'],['onboarding','/onboarding'],['account-new','/account?mode=new'],['account-ready','/account?mode=member'],['connections','/connections']]){
   await page.goto('http://127.0.0.1:3117'+url);await page.waitForSelector('#root h1, #root input, #root main');await page.waitForTimeout(600)
   if(name==='search'){await page.getByRole('combobox').fill('예시');await page.getByRole('combobox').press('Enter');await page.waitForTimeout(400)}
   const metrics=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,main:!!document.querySelector('main')}))
   await page.screenshot({path:path.join(out,`${name}-${w}.png`),fullPage:true});result.push({name,url,viewport:`${w}x${h}`,phase,kind:'local actual React + network mock',...metrics})
  }
  if(errors.length)throw Error(errors.join('\n'));await page.close()
 }
 await writeFile(path.join(out,'manifest.json'),JSON.stringify(result,null,2));await browser.close();console.log(JSON.stringify({phase,captures:result.length,overflow:result.filter(r=>r.overflow)}))
}
if(process.argv[2])await capture(process.argv[2])
