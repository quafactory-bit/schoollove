import {createHmac} from 'node:crypto'
import {expect,test} from '@playwright/test'

const supabaseUrl=process.env.PHASE10N_E2E_SUPABASE_URL
const serviceKey=process.env.PHASE10N_E2E_SERVICE_KEY
const anonKey=process.env.PHASE10N_E2E_ANON_KEY
const proxyControlToken=process.env.PHASE10N_E2E_PROXY_CONTROL_TOKEN
test.skip(!supabaseUrl||!serviceKey||!anonKey||!proxyControlToken,'requires disposable local Supabase Auth')
test.describe.configure({mode:'serial'})

function headers(admin=false){const key=admin?serviceKey!:anonKey!;return {'content-type':'application/json',apikey:key,Authorization:`Bearer ${key}`}}

async function createControlledBetaFixture(userId:string,suffix:string){
  const draftId=crypto.randomUUID(),programId=crypto.randomUUID(),snapshotId=crypto.randomUUID()
  const schoolId='a8811f19-e7ae-93a0-1140-ec8ef0e990d7'
  const insert=async(table:string,body:unknown)=>{
    const response=await fetch(`${supabaseUrl}/rest/v1/${table}`,{method:'POST',headers:{...headers(true),Prefer:'return=minimal'},body:JSON.stringify(body)})
    expect(response.ok,`${table}: ${await response.text()}`).toBeTruthy()
  }
  await insert('beta_setup_drafts',{id:draftId,draft_key:`phase10n_e2e_${suffix}`,name:'PHASE10N E2E',starts_at:new Date(Date.now()-60_000).toISOString(),ends_at:new Date(Date.now()+86_400_000).toISOString(),max_users:20,target_scope:'one_school',enabled_features:['account_registration','private_profile'],invite_policy:{maxUsesPerInvite:1,expiresInDays:7},approval_waitlist_enabled:true,stop_conditions:{PRIVACY_EXPOSURE:true,RLS_FAILURE:true,HEALTH_FAILURE:true},status:'activated',created_by:'test:playwright'})
  await insert('beta_programs',{id:programId,program_key:`phase10n_e2e_${suffix}`,name:'PHASE10N E2E',status:'active',requires_admin_approval:true,starts_at:new Date(Date.now()-60_000).toISOString(),ends_at:new Date(Date.now()+86_400_000).toISOString()})
  await insert('beta_program_setup_snapshots',{id:snapshotId,program_id:programId,source_draft_id:draftId,max_users:20,target_scope:'one_school',enabled_features:['account_registration','private_profile'],invite_policy:{maxUsesPerInvite:1,expiresInDays:7},approval_waitlist_enabled:true,stop_conditions:{PRIVACY_EXPOSURE:true,RLS_FAILURE:true,HEALTH_FAILURE:true},created_by:'test:playwright'})
  await insert('beta_program_schools',{program_id:programId,school_id:schoolId,source_snapshot_id:snapshotId,created_by:'test:playwright'})
  await insert('beta_feature_flags',[
    'account_registration','private_profile','people_search','connection_request','messaging','instagram_permission','promotion_application','promotion_operations',
  ].map((feature_key)=>({program_id:programId,feature_key,enabled:['account_registration','private_profile'].includes(feature_key),reason_code:'E2E_SNAPSHOT_CONTRACT',updated_by:'test:playwright'})))
  await insert('beta_members',{program_id:programId,user_id:userId,status:'active',reviewed_at:new Date().toISOString(),reviewed_by:'test:playwright',reason_code:'E2E_APPROVED'})
}

async function setLaunchState(state:string,reason:string){
  const response=await fetch(`${supabaseUrl}/rest/v1/rpc/admin_set_public_account_launch_state`,{method:'POST',headers:headers(true),body:JSON.stringify({requested_state:state,requested_reason:reason,admin_actor:'test:playwright'})})
  expect(response.ok).toBeTruthy()
}

async function openLaunch(){
  const commitSha='a'.repeat(40),migrationSha256='B'.repeat(64)
  const verified_checks={migration_version:'20260803120000',operator_decision:'affirmative',blocker_codes:[],preview:true,health:true,rls_grants:true,auth_smtp:true,deletion_operator:true,runtime_logs:true,isolated_db:true,permissions:true}
  const readiness=await fetch(`${supabaseUrl}/rest/v1/rpc/admin_record_public_account_readiness`,{method:'POST',headers:headers(true),body:JSON.stringify({requested_reason:'PLAYWRIGHT_FRESH_READINESS',admin_actor:'test:playwright',verified_commit_sha:commitSha,verified_migration_sha256:migrationSha256,blocker_count:0,verified_checks})})
  const readinessBody=await readiness.text()
  expect(readiness.ok,readinessBody).toBeTruthy()
  const readinessId=JSON.parse(readinessBody) as string
  const opened=await fetch(`${supabaseUrl}/rest/v1/rpc/admin_open_public_account_launch`,{method:'POST',headers:headers(true),body:JSON.stringify({readiness_id:readinessId,requested_reason:'PLAYWRIGHT_OPEN_APPROVED',admin_actor:'test:playwright',expected_commit_sha:commitSha,expected_migration_sha256:migrationSha256})})
  expect(opened.ok,await opened.text()).toBeTruthy()
}

async function setAuthProviderFailure(enabled:boolean){
  const response=await fetch(`${supabaseUrl}/phase10n-auth-failure`,{method:'POST',headers:{'content-type':'application/json','x-phase10n-control':proxyControlToken!},body:JSON.stringify({enabled})})
  expect(response.ok).toBeTruthy()
}

async function installSyntheticAdminSession(page:import('@playwright/test').Page){
  const expiry=Date.now()+60*60*1000
  const signature=createHmac('sha256','phase10n-local-admin-only').update(String(expiry)).digest('hex')
  await page.context().addCookies([{name:'sl_admin_session',value:`${expiry}.${signature}`,domain:'127.0.0.1',path:'/',httpOnly:true,sameSite:'Strict',secure:false}])
}

async function aggregateCount(eventKey:string){
  const response=await fetch(`${supabaseUrl}/rest/v1/public_account_daily_funnel?select=event_count&event_key=eq.${eventKey}`,{headers:headers(true)})
  expect(response.ok).toBeTruthy()
  const rows=await response.json() as Array<{event_count:number}>
  return rows.reduce((sum,row)=>sum+row.event_count,0)
}

async function loginWithSyntheticGoogle(page:import('@playwright/test').Page,fixtureKey:string){
  await page.goto('/login')
  await expect(page.getByRole('link',{name:'Google로 계속하기'})).toHaveCount(1)
  await expect(page.getByText(/이메일 OTP|인증번호 받기|6자리 인증번호/)).toHaveCount(0)
  const response=await page.request.post(`${supabaseUrl}/phase10r-google-session`,{
    headers:{'x-phase10n-control':proxyControlToken!},
    data:{fixtureKey},
  })
  const responseBody=await response.text()
  expect(response.ok(),responseBody).toBeTruthy()
  const fixture=JSON.parse(responseBody) as {userId:string;provider:string;identityCount:number}
  expect(fixture.provider).toBe('custom:schoollove-google')
  expect(fixture.identityCount).toBe(1)
  await page.goto('/account')
  await expect(page.getByRole('heading',{name:'내 계정',exact:true})).toBeVisible({timeout:60_000})
  await expect(page.getByText('Google 계정으로 로그인됨')).toBeVisible()
  return fixture
}

test.describe('PHASE 10R Google-only disposable account flow',()=>{
  let suffix='';let primaryFixture=''
  test.beforeAll(async({},testInfo)=>{
    suffix=testInfo.project.name.replace(/[^a-z0-9]/gi,'-').toLowerCase()
    primaryFixture=`phase10r-${suffix}`
    await setLaunchState('internal_test','LOCAL_AUTH_TEST_PROJECT_RESET')
  })

  test('public Home and account guide are responsive and state-safe',async({page})=>{
    const searchBefore=await aggregateCount('school_search_started')
    await page.goto('/')
    await expect(page.getByRole('heading',{name:/학교는 찾고/})).toBeVisible()
    await expect(page.getByRole('heading',{name:'내부 안전 검증 중'})).toBeVisible()
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy()
    await page.goto('/search')
    expect(await aggregateCount('school_search_started')).toBe(searchBefore)
    const searched=await fetch(`${supabaseUrl}/rest/v1/rpc/search_schools_with_activity`,{method:'POST',headers:headers(),body:JSON.stringify({q:'TEST School',lim:20})})
    expect(searched.ok).toBeTruthy()
    expect(await aggregateCount('school_search_started')).toBe(searchBefore+1)
    await page.goto('/submit')
    await expect(page.getByRole('heading',{name:'본인 정보만 비공개로 관리합니다'})).toBeVisible()
    await expect(page.getByText('신규 계정 생성은 아직 열리지 않았습니다.')).toBeVisible()
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy()
  })

  test('unauthenticated account redirects and removed Email Auth surfaces stay dark',async({page})=>{
    await page.goto('/account')
    await expect(page).toHaveURL(/\/login\?next=/)
    await page.goto('/login')
    await expect(page.getByRole('link',{name:'Google로 계속하기'})).toHaveCount(1)
    await expect(page.getByText(/이메일 OTP|인증번호 받기|6자리 인증번호/)).toHaveCount(0)
    for(const endpoint of ['/api/auth/request-otp','/api/auth/verify-otp']){
      expect((await page.request.post(endpoint,{data:{}})).status()).toBe(404)
    }
    await page.context().addCookies([
      {name:'sl_user_access',value:'header.eyJleHAiOjF9.signature',url:process.env.PLAYWRIGHT_BASE_URL!,httpOnly:true,sameSite:'Lax'},
      {name:'sl_user_refresh',value:'invalid-refresh-token',url:process.env.PLAYWRIGHT_BASE_URL!,httpOnly:true,sameSite:'Lax'},
    ])
    await page.goto('/account')
    await expect(page).toHaveURL(/\/login\?next=/)
    const cleared=await page.context().cookies()
    expect(cleared.some((cookie)=>cookie.name==='sl_user_access'||cookie.name==='sl_user_refresh')).toBeFalsy()
  })

  test('genuine Google-bound session, refresh, onboarding, relogin, emergency and deletion lifecycle',async({page})=>{
    test.setTimeout(300_000)
    const firstLogin=await loginWithSyntheticGoogle(page,primaryFixture)
    const userId=firstLogin.userId
    const accessToken=(await page.context().cookies()).find((cookie)=>cookie.name==='sl_user_access')?.value
    expect(accessToken).toBeTruthy()
    const userHeaders={'content-type':'application/json',apikey:anonKey!,Authorization:`Bearer ${accessToken}`}
    for(const [path,method,body] of [
      ['consent_records','POST',{user_id:'00000000-0000-4000-8000-000000000001',consent_type:'marketing',consented:true,policy_version:'old'}],
      ['account_deletion_requests','POST',{user_id:'00000000-0000-4000-8000-000000000001',reason:'개인 자유문',status:'done'}],
      ['private_profiles','POST',{owner_user_id:'00000000-0000-4000-8000-000000000001',display_name:'DIRECT',profile_photo_url:'https://example.com/x.png',profile_visibility:'public',status:'hidden'}],
      ['profile_school_memberships','POST',{owner_user_id:'00000000-0000-4000-8000-000000000001',profile_id:'00000000-0000-4000-8000-000000000002',school_id:'00000000-0000-4000-8000-000000000003',graduation_year:2020}],
    ] as const){
      const response=await fetch(`${supabaseUrl}/rest/v1/${path}`,{method,headers:userHeaders,body:JSON.stringify(body)})
      expect([401,403]).toContain(response.status)
    }
    const adultBefore=await aggregateCount('adult_eligibility_completed')
    const consentBefore=await aggregateCount('required_consents_completed')
    const profileBefore=await aggregateCount('private_profile_created')
    const schoolBefore=await aggregateCount('first_school_membership_created')
    const onboardingBefore=await aggregateCount('onboarding_completed')
    const beforeRefresh=await page.context().cookies()
    const refreshBefore=beforeRefresh.find((cookie)=>cookie.name==='sl_user_refresh')?.value
    expect(refreshBefore).toBeTruthy()
    await page.context().addCookies([{
      name:'sl_user_access',value:'header.eyJleHAiOjF9.signature',
      url:process.env.PLAYWRIGHT_BASE_URL!,httpOnly:true,sameSite:'Lax',
    }])
    await page.reload()
    await expect(page.getByRole('heading',{name:'내 계정',exact:true})).toBeVisible()
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy()
    const afterRefresh=await page.context().cookies()
    expect(afterRefresh.find((cookie)=>cookie.name==='sl_user_access')?.value).not.toBe('header.eyJleHAiOjF9.signature')
    expect(afterRefresh.find((cookie)=>cookie.name==='sl_user_refresh')?.value).not.toBe(refreshBefore)

    await page.getByLabel('생년월일').fill('1990-02-28')
    await page.getByRole('button',{name:'만 19세 이상 확인'}).click()
    await expect(page.getByText('현재 정책 기준 성인 확인 완료')).toBeVisible({timeout:20_000})
    expect(await page.evaluate(()=>fetch('/api/account/eligibility',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({dateOfBirth:'1990-02-28'})}).then((response)=>response.status))).toBe(200)
    expect(await aggregateCount('adult_eligibility_completed')).toBe(adultBefore+1)
    for(const checkbox of await page.locator('section').filter({hasText:'필수 동의'}).getByRole('checkbox').all())await checkbox.check()
    await page.getByRole('button',{name:'필수 동의 4개 기록'}).click()
    await expect(page.getByText('현재 정책 버전의 필수 동의 완료')).toBeVisible({timeout:20_000})
    expect(await page.evaluate(()=>fetch('/api/account/consents',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({terms:true,privacy_collection:true,adult_confirmation:true,private_by_default:true})}).then((response)=>response.status))).toBe(200)
    expect(await aggregateCount('required_consents_completed')).toBe(consentBefore+1)
    await page.getByLabel('내 이름').fill(`TEST ${suffix}`)
    await page.getByLabel('Instagram 아이디 (선택·비공개)').fill('test.private')
    await page.getByLabel('소개 (선택·비공개)').fill('TEST private introduction')
    const profileCreateResponse=page.waitForResponse((response)=>response.url().includes('/api/account/profile')&&response.request().method()==='POST',{timeout:60_000})
    await page.getByRole('button',{name:'내 프로필 저장'}).click()
    expect((await profileCreateResponse).status()).toBe(200)
    await expect(page.getByRole('button',{name:'내 프로필 수정 저장'})).toBeVisible({timeout:60_000})
    expect(await aggregateCount('private_profile_created')).toBe(profileBefore+1)
    await page.getByLabel('학교 검색').fill('TEST School 1')
    await expect(page.getByRole('option').first()).toBeVisible()
    await page.getByLabel('학교 검색').press('ArrowDown')
    await page.getByLabel('학교 검색').press('Enter')
    await page.getByLabel('졸업연도').fill('2020')
    await page.getByLabel('반 (선택)').fill('3')
    await page.getByRole('button',{name:'학교 이력 추가'}).click()
    await expect(page.getByRole('heading',{name:/내 학교 이력.*1\/3/})).toBeVisible({timeout:20_000})
    await expect(page.getByText('비공개 계정 준비 완료')).toBeVisible()
    const mySchools=page.locator('section').filter({has:page.getByRole('heading',{name:'내 학교',exact:true})})
    await expect(mySchools).toContainText('TEST School 1')
    await expect(mySchools).toContainText('2020년 졸업')
    await expect(mySchools).toContainText('3반')
    const schoolLink=mySchools.getByRole('link',{name:'학교 페이지 보기'})
    const schoolHref=await schoolLink.getAttribute('href')
    expect(schoolHref).toMatch(/^\/school\/[A-Za-z0-9_-]+$/)
    expect(schoolHref).not.toContain('/2020')
    expect(schoolHref).not.toContain('/3')
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy()
    await page.goto(schoolHref!)
    await expect(page).toHaveURL(new RegExp(`${schoolHref!}$`))
    await expect(page.getByRole('heading',{name:'TEST School 1',exact:true})).toBeVisible()
    await expect(page.getByRole('heading',{name:'개인 명단은 현재 공개하지 않습니다'})).toBeVisible()
    await expect(page.getByText(`TEST ${suffix}`,{exact:true})).toHaveCount(0)
    await expect(page.getByText('test.private',{exact:true})).toHaveCount(0)
    await expect(page.getByText('2020년 졸업',{exact:true})).toHaveCount(0)
    await expect(page.getByText('3반',{exact:true})).toHaveCount(0)
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy()
    await page.goBack()
    await expect(page).toHaveURL(/\/account$/)
    const restoredMySchools=page.locator('section').filter({has:page.getByRole('heading',{name:'내 학교',exact:true})})
    await expect(restoredMySchools).toContainText('TEST School 1')
    await expect(restoredMySchools).toContainText('2020년 졸업')
    await expect(restoredMySchools).toContainText('3반')
    expect(await aggregateCount('first_school_membership_created')).toBe(schoolBefore+1)
    expect(await aggregateCount('onboarding_completed')).toBe(onboardingBefore+1)
    const refreshedAccess=(await page.context().cookies()).find((cookie)=>cookie.name==='sl_user_access')?.value
    for(const [path,body] of [
      ['private_profiles?owner_user_id=not.is.null',{profile_photo_url:'https://example.com/direct.png',profile_visibility:'public',status:'hidden'}],
      ['profile_school_memberships?id=not.is.null',{graduation_year:2200}],
    ] as const){
      const response=await fetch(`${supabaseUrl}/rest/v1/${path}`,{method:'PATCH',headers:{'content-type':'application/json',apikey:anonKey!,Authorization:`Bearer ${refreshedAccess}`},body:JSON.stringify(body)})
      expect([401,403]).toContain(response.status)
    }

    await page.getByRole('button',{name:'로그아웃'}).click()
    const secondLogin=await loginWithSyntheticGoogle(page,primaryFixture)
    expect(secondLogin.userId).toBe(userId)
    expect(secondLogin.identityCount).toBe(1)
    await page.goto('/onboarding')
    await expect(page.getByText('비공개 계정 시작 준비를 모두 마쳤습니다.')).toBeVisible({timeout:20_000})
    await page.goto('/people/search')
    await expect(page).toHaveURL(/\/account$/)
    await page.getByLabel('소개 (선택·비공개)').fill('TEST restored and updated')
    const profileUpdateResponse=page.waitForResponse((response)=>response.url().includes('/api/account/profile')&&response.request().method()==='POST')
    await page.getByRole('button',{name:'내 프로필 수정 저장'}).click()
    expect((await profileUpdateResponse).status()).toBe(200)
    await expect(page.getByText('안전하게 저장했습니다.')).toBeVisible({timeout:20_000})
    expect(await aggregateCount('private_profile_created')).toBe(profileBefore+1)
    await page.reload()
    await expect(page.getByLabel('소개 (선택·비공개)')).toHaveValue('TEST restored and updated')
    const currentMembership=await fetch(`${supabaseUrl}/rest/v1/profile_school_memberships?select=school_id&owner_user_id=eq.${userId}&limit=1`,{headers:headers(true)})
    expect(currentMembership.ok).toBeTruthy()
    const membershipRows=await currentMembership.json() as Array<{school_id:string}>
    expect(membershipRows).toHaveLength(1)
    const duplicateSchool=await page.evaluate((schoolId)=>fetch('/api/account/memberships',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({school_id:schoolId,graduation_year:2020,class_number:null})}).then((response)=>response.status),membershipRows[0].school_id)
    expect(duplicateSchool).toBe(409)
    await page.locator('section').filter({hasText:'내 학교 이력'}).getByRole('button',{name:'삭제'}).click()
    await expect(page.getByRole('heading',{name:/내 학교 이력.*0\/3/})).toBeVisible({timeout:20_000})
    await expect(page.getByRole('heading',{name:'내 학교',exact:true})).toHaveCount(0)
    await expect(page.getByText('학교 이력을 한 곳 등록하면 비공개 계정에서 내 학교를 확인할 수 있습니다.')).toBeVisible()
    await page.getByLabel('학교 검색').fill('TEST School 1')
    await expect(page.getByRole('option').first()).toBeVisible()
    await page.getByRole('option').first().click()
    await page.getByLabel('졸업연도').fill('2020')
    await page.getByRole('button',{name:'학교 이력 추가'}).click()
    await expect(page.getByRole('heading',{name:/내 학교 이력.*1\/3/})).toBeVisible({timeout:20_000})
    const profileDeleted=await page.evaluate(()=>fetch('/api/account/profile',{method:'DELETE'}).then((response)=>response.status))
    expect(profileDeleted).toBe(200)
    await page.reload()
    await expect(page.getByRole('heading',{name:'내 학교',exact:true})).toHaveCount(0)
    await expect(page.getByText('학교 이력을 한 곳 등록하면 비공개 계정에서 내 학교를 확인할 수 있습니다.')).toBeVisible()
    const profileRestored=await page.evaluate((displayName)=>fetch('/api/account/profile',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({display_name:displayName,instagram_handle:'test.private',introduction:'TEST restored and updated'})}).then((response)=>response.status),`TEST ${suffix}`)
    expect(profileRestored).toBe(200)
    await page.reload()
    expect(await aggregateCount('private_profile_created')).toBe(profileBefore+1)
    const futureSchool=await page.evaluate(()=>fetch('/api/account/memberships',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({school_id:'a8811f19-e7ae-93a0-1140-ec8ef0e990d8',graduation_year:2200,class_number:null})}).then((response)=>response.status))
    expect(futureSchool).toBe(400)
    await page.getByLabel('학교 검색').fill('TEST School 1')
    await expect(page.getByRole('option').first()).toBeVisible()
    await page.getByRole('option').first().click()
    await page.getByLabel('졸업연도').fill('2020')
    await page.getByRole('button',{name:'학교 이력 추가'}).click()
    await expect(page.getByRole('heading',{name:/내 학교 이력.*1\/3/})).toBeVisible({timeout:20_000})
    expect(await aggregateCount('first_school_membership_created')).toBe(schoolBefore+1)
    expect(await aggregateCount('onboarding_completed')).toBe(onboardingBefore+1)

    await setLaunchState('emergency_stopped','PLAYWRIGHT_EMERGENCY_STOP')
    const stopped=await page.evaluate(()=>fetch('/api/account/profile',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({display_name:'TEST BLOCKED',instagram_handle:null,introduction:null})}).then((response)=>response.status))
    expect(stopped).toBe(403)
    await setLaunchState('closed','POST_EMERGENCY_READINESS_REVIEWED')
    await setLaunchState('internal_test','LOCAL_AUTH_TEST_RESTORED')

    page.once('dialog',(dialog)=>dialog.accept())
    const deletionBefore=await aggregateCount('account_deletion_requested')
    const currentAccess=(await page.context().cookies()).find((cookie)=>cookie.name==='sl_user_access')?.value
    const deletionResponse=page.waitForResponse((response)=>response.url().includes('/api/account/deletion-request')&&response.request().method()==='POST')
    await page.getByRole('button',{name:'계정 탈퇴 요청'}).click()
    expect((await deletionResponse).status()).toBe(201)
    await expect(page).toHaveURL(/\/login\?next=/,{timeout:20_000})
    const pendingResponse=await fetch(`${supabaseUrl}/rest/v1/account_deletion_requests?select=id,status&user_id=eq.${userId}`,{headers:headers(true)})
    expect(pendingResponse.ok).toBeTruthy()
    const pendingRows=await pendingResponse.json() as Array<{id:string;status:string}>
    expect(pendingRows).toHaveLength(1)
    expect(pendingRows[0].status).toBe('pending')
    const repeated=await fetch(`${supabaseUrl}/rest/v1/rpc/request_own_account_deletion`,{method:'POST',headers:{'content-type':'application/json',apikey:anonKey!,Authorization:`Bearer ${currentAccess}`},body:'{}'})
    expect(repeated.ok).toBeTruthy()
    expect(await aggregateCount('account_deletion_requested')).toBe(deletionBefore+1)
    const blocked=await page.evaluate(()=>fetch('/api/account/profile',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({display_name:'TEST BLOCKED',instagram_handle:null,introduction:null})}).then((response)=>response.status))
    expect(blocked).toBe(401)
    await installSyntheticAdminSession(page)
    await setAuthProviderFailure(true)
    const failed=await page.evaluate((requestId)=>fetch('/api/admin/public-account',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({action:'complete_deletion',requestId,reason:'PLAYWRIGHT_DELETION_COMPLETED'})}).then(async(response)=>({status:response.status,body:await response.json()})),pendingRows[0].id)
    expect(failed).toEqual({status:503,body:{error:'AUTH_IDENTITY_DELETE_FAILED_RETRY_REQUIRED'}})
    const failedSafe=await fetch(`${supabaseUrl}/rest/v1/account_deletion_requests?select=status&user_id=eq.${userId}`,{headers:headers(true)})
    expect(await failedSafe.json()).toEqual([{status:'failed_safe'}])
    await setAuthProviderFailure(false)
    const retried=await page.evaluate((requestId)=>fetch('/api/admin/public-account',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({action:'complete_deletion',requestId,reason:'PLAYWRIGHT_DELETION_COMPLETED'})}).then(async(response)=>({status:response.status,body:await response.json()})),pendingRows[0].id)
    expect(retried).toEqual({status:200,body:{ok:true}})
    const completed=await fetch(`${supabaseUrl}/rest/v1/account_deletion_requests?select=status,user_id&id=eq.${pendingRows[0].id}`,{headers:headers(true)})
    expect(await completed.json()).toEqual([{status:'done',user_id:null}])
    const deletedIdentity=await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`,{headers:headers(true)})
    expect(deletedIdentity.status).toBe(404)
    await page.reload()
    await expect(page).toHaveURL(/\/login\?next=/)
  })

  test('dormant people and connection routes do not become public account features',async({page})=>{
    await page.goto('/account')
    await page.evaluate(()=>fetch('/api/auth/logout',{method:'POST'}))
    await page.goto('/people/search')
    await expect(page).toHaveURL(/\/login\?next=/)
    await page.goto('/connections')
    await expect(page).toHaveURL(/\/login\?next=/)
    const betaLogin=await loginWithSyntheticGoogle(page,`phase10r-beta-${suffix}`)
    const betaUserId=betaLogin.userId
    await createControlledBetaFixture(betaUserId,suffix)
    await setLaunchState('closed','PLAYWRIGHT_BETA_UI_CLOSED')
    await page.reload()
    await expect(page.getByRole('button',{name:'만 19세 이상 확인'})).toBeEnabled()
    await expect(page.getByRole('heading',{name:/내 학교 이력.*0\/1/})).toBeVisible()
    await page.goto('/people/search')
    await expect(page).toHaveURL(/\/account$/)
    await openLaunch()
    await page.reload()
    await expect(page.getByRole('heading',{name:/내 학교 이력.*0\/1/})).toBeVisible()
    await setLaunchState('emergency_stopped','PLAYWRIGHT_BETA_EMERGENCY')
    await page.reload()
    await expect(page.getByRole('button',{name:'만 19세 이상 확인'})).toBeDisabled()
    const emergencyWrite=await page.evaluate(()=>fetch('/api/account/eligibility',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({dateOfBirth:'1990-02-28'})}).then((response)=>response.status))
    expect(emergencyWrite).toBe(403)
    await setLaunchState('closed','PLAYWRIGHT_BETA_EMERGENCY_REVIEWED')
    const removed=await fetch(`${supabaseUrl}/auth/v1/admin/users/${betaUserId}`,{method:'DELETE',headers:headers(true)})
    expect(removed.ok).toBeTruthy()
  })

  test('public pages expose no account identity and legacy write APIs stay fixed 503',async({page})=>{
    await page.goto('/')
    await expect(page.getByText('Google 계정으로 로그인됨')).toHaveCount(0)
    await expect(page.getByText(`TEST ${suffix}`)).toHaveCount(0)
    for(const endpoint of ['/api/profiles','/api/reports','/api/traces']){
      const status=await page.evaluate((url)=>fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).then((response)=>response.status),endpoint)
      expect(status).toBe(503)
    }
  })
})
