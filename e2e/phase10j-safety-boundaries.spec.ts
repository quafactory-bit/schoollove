import { createHmac } from 'node:crypto'
import { expect,test,type BrowserContext } from '@playwright/test'

async function installSyntheticAdminSession(context:BrowserContext){
  const expiry=Date.now()+60*60*1000
  const signature=createHmac('sha256','phase10j-local-admin-password').update(String(expiry)).digest('hex')
  await context.addCookies([{name:'sl_admin_session',value:`${expiry}.${signature}`,domain:'127.0.0.1',path:'/',httpOnly:true,sameSite:'Strict',secure:false}])
}

test('controlled beta safety routes remain administrator-only',async({page,request},testInfo)=>{
  test.skip(testInfo.project.name!=='chromium','API boundary is project-independent; responsive workflow runs in every project.')
  expect((await request.get('/api/admin/beta?schoolQuery=test')).status()).toBe(401)
  expect((await request.patch('/api/admin/beta',{data:{action:'start_program'}})).status()).toBe(401)
  await page.goto('/admin/beta/setup')
  await expect(page).toHaveURL(/\/admin\/login/)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
})

test('authenticated invalid activation input is rejected before database access',async({context},testInfo)=>{
  test.skip(testInfo.project.name!=='chromium','API boundary is project-independent; responsive workflow runs in every project.')
  await installSyntheticAdminSession(context)
  const response=await context.request.patch('/api/admin/beta',{data:{action:'start_program',programId:'not-a-uuid',reason:'unsafe'}})
  expect(response.status()).toBe(400)
  expect(await response.json()).toEqual({error:'INVALID_BETA_OPERATION'})
  const validShape=await context.request.patch('/api/admin/beta',{data:{action:'start_program',programId:'50000000-0000-4000-8000-000000000099',reason:'OPERATOR_APPROVED_START'}})
  expect(validShape.status()).toBe(409)
  expect(await validShape.json()).toEqual({error:'PROGRAM_START_FAILED'})
})

test('synthetic preflight explains every safety boundary without mutations',async({page,context})=>{
  await installSyntheticAdminSession(context)
  await page.goto('/admin/beta/setup?synthetic=1')
  await expect(page.getByTestId('synthetic-preview')).toBeVisible()
  const boundaries=page.getByTestId('synthetic-safety-boundaries')
  await expect(boundaries).toContainText('학교 선택 → Draft 검증 → paused 생성')
  await expect(boundaries).toContainText('snapshot + 한 학교 allowlist')
  await expect(boundaries).toContainText('프로그램 flag 8/8 · 허용 2개')
  await expect(boundaries).toContainText('active readiness → 승인된 시작')
  await expect(boundaries).toContainText('긴급 중단 → 별도 재활성화')
  await expect(boundaries).toContainText('active 계약만 초대 가능')
  await expect(page.locator('form')).toHaveCount(0)
  await expect(page.getByRole('button')).toHaveCount(0)
  await expect(page.getByText('생성된 실제 profile 0 · payment 0 · public launch 0')).toBeVisible()
  const robots=await page.locator('meta[name="robots"]').getAttribute('content')
  expect(robots).toContain('noindex')
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
})

test('public signup and profile creation stay closed',async({request},testInfo)=>{
  test.skip(testInfo.project.name!=='chromium','API boundary is project-independent; responsive workflow runs in every project.')
  expect((await request.post('/api/profiles',{data:{}})).status()).toBe(503)
  expect((await request.get('/api/admin/beta')).status()).toBe(401)
})

test('test-only administrator flow shows school, paused, readiness, stop and reactivation gates',async({page,context})=>{
  await installSyntheticAdminSession(context)
  const school={id:'50000000-0000-4000-8000-000000000001',school_name:'TEST 안전고등학교',school_type:'high',sido:'TEST',sigungu:'TEST'}
  const program:any={id:'50000000-0000-4000-8000-000000000002',program_key:'controlled_beta_01',name:'성인 제한 베타',status:'paused',starts_at:'2026-07-30T04:00:00.000Z',ends_at:'2026-08-13T04:00:00.000Z',emergency_disabled_at:null,snapshot_backed:true,selected_school:school,school_allowlist_count:1,program_feature_flags_complete:false,activation_blockers:['PROGRAM_FEATURE_SET_INCOMPLETE','FRESH_READINESS_REQUIRED'],activation_ready:false,invite_eligible:false,reactivation_required:false,reactivation_ready:false}
  const state:any={programs:[],drafts:[],snapshots:[],programSchools:[],programFlags:[],schoolOptions:[],members:[],memberSummary:{},feedback:[],tasks:[],campaigns:[],aggregates:[],readiness:[],advertisers:{requests:[],orders:[]},incidents:[],privacy:{minimumAggregate:10}}
  const operations:any={programs:state.programs,members:[],flags:[],jobs:[],exports:[],events:[],incidents:[],launch:{currentStages:[],dailyEntries:[]}}
  await page.route('**/api/admin/beta**',async route=>{
    const request=route.request();const url=new URL(request.url())
    if(request.method()==='GET')return route.fulfill({json:{...state,schoolOptions:url.searchParams.has('schoolQuery')?[school]:[]}})
    const body=request.postDataJSON()
    if(body.action==='save_setup')state.drafts=[{id:'50000000-0000-4000-8000-000000000003',draft_key:body.setup.draftKey,name:body.setup.name,status:'validated',target_school_id:school.id,max_users:20,target_scope:body.setup.targetScope,operator_memo:''}]
    if(body.action==='activate_setup'){state.programs=[program];operations.programs=state.programs;state.snapshots=[{id:'50000000-0000-4000-8000-000000000004',program_id:program.id,target_school_id:school.id}];state.programSchools=[{program_id:program.id,school_id:school.id,school}]}
    if(body.action==='configure_features'){program.program_feature_flags_complete=true;program.activation_blockers=['FRESH_READINESS_REQUIRED']}
    if(body.action==='record_readiness'){state.readiness=[{id:'50000000-0000-4000-8000-000000000005',program_id:program.id,status:'limited_beta',blocker_codes:[],operator_decision:true,created_at:new Date().toISOString()}];program.activation_blockers=program.emergency_disabled_at?['REACTIVATION_REQUIRED']:[];program.activation_ready=!program.emergency_disabled_at;program.reactivation_ready=Boolean(program.emergency_disabled_at)}
    if(body.action==='start_program'||body.action==='reactivate_program'){program.status='active';program.emergency_disabled_at=null;program.activation_ready=false;program.invite_eligible=true;program.reactivation_required=false;program.reactivation_ready=false;program.activation_blockers=[]}
    return route.fulfill({json:{applied:true}})
  })
  await page.route('**/api/admin/operations',async route=>{
    if(route.request().method()==='GET')return route.fulfill({json:operations})
    const body=route.request().postDataJSON()
    if(body.action==='emergency'){program.status='paused';program.emergency_disabled_at=new Date().toISOString();program.invite_eligible=false;program.reactivation_required=true;program.reactivation_ready=false;program.activation_blockers=['FRESH_READINESS_REQUIRED','REACTIVATION_REQUIRED']}
    return route.fulfill({json:{applied:true}})
  })

  await page.goto('/admin/beta/setup')
  await page.getByLabel('학교 검색').fill('TEST 안전고')
  await page.getByRole('button',{name:'학교 검색'}).click()
  await page.getByText('TEST 안전고등학교').click()
  await page.locator('[name="startsAt"]').fill('2026-07-30T13:00')
  await page.locator('[name="endsAt"]').fill('2026-08-13T13:00')
  await page.locator('[name="status"]').selectOption('validated')
  await page.getByRole('button',{name:'검토 내용 저장'}).click()
  await page.getByRole('button',{name:'paused 프로그램으로 생성'}).click()
  await expect(page.getByTestId('controlled-program-contract')).toContainText('TEST 안전고등학교')
  await expect(page.getByTestId('controlled-program-contract')).toContainText('PROGRAM_FEATURE_SET_INCOMPLETE')
  await page.getByRole('button',{name:'프로그램 flag 8개 설정'}).click()
  await page.goto('/admin/beta/readiness')
  await page.getByRole('button',{name:'limited_beta 검토 기록'}).click()
  await page.goto('/admin/beta/setup')
  await page.getByRole('button',{name:'실제 Production active 전환'}).click()
  await expect(page.getByTestId('controlled-program-contract')).toContainText('active')

  await page.goto('/admin/operations')
  await expect(page.getByRole('option',{name:/TEST 안전고등학교/})).toHaveCount(1)
  await page.getByRole('button',{name:'즉시 중단'}).click()
  await page.goto('/admin/beta/setup')
  await expect(page.getByRole('button',{name:'별도 승인 재활성화'})).toHaveCount(0)
  await page.goto('/admin/beta/readiness')
  await page.getByRole('button',{name:'limited_beta 검토 기록'}).click()
  await page.goto('/admin/beta/setup')
  await page.getByRole('button',{name:'별도 승인 재활성화'}).click()
  await expect(page.getByTestId('controlled-program-contract')).toContainText('active')
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
})
