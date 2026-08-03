import {expect,test} from '@playwright/test'

const supabaseUrl=process.env.PHASE10N_E2E_SUPABASE_URL
const serviceKey=process.env.PHASE10N_E2E_SERVICE_KEY
const anonKey=process.env.PHASE10N_E2E_ANON_KEY
const mailpitUrl=process.env.PHASE10N_E2E_MAILPIT_URL
test.skip(!supabaseUrl||!serviceKey||!anonKey||!mailpitUrl,'requires disposable local Supabase Auth')
test.describe.configure({mode:'serial'})

function headers(admin=false){const key=admin?serviceKey!:anonKey!;return {'content-type':'application/json',apikey:key,Authorization:`Bearer ${key}`}}

async function createLocalUser(email:string){
  const response=await fetch(`${supabaseUrl}/auth/v1/admin/users`,{method:'POST',headers:headers(true),body:JSON.stringify({email,email_confirm:true})})
  expect(response.ok).toBeTruthy()
}

async function hasMessageFor(email:string){
  const response=await fetch(`${mailpitUrl}/api/v1/messages`)
  expect(response.ok).toBeTruthy()
  const body=await response.json() as {messages?:Array<{To?:Array<{Address?:string}>}>}
  return (body.messages??[]).some((item)=>item.To?.some((to)=>to.Address===email))
}

async function messageIdsFor(email:string){
  const response=await fetch(`${mailpitUrl}/api/v1/messages`)
  expect(response.ok).toBeTruthy()
  const body=await response.json() as {messages?:Array<{ID?:string;To?:Array<{Address?:string}>}>}
  return new Set((body.messages??[])
    .filter((item)=>item.To?.some((to)=>to.Address===email))
    .map((item)=>item.ID)
    .filter((id):id is string=>typeof id==='string'))
}

async function setLaunchState(state:string,reason:string){
  const response=await fetch(`${supabaseUrl}/rest/v1/rpc/admin_set_public_account_launch_state`,{method:'POST',headers:headers(true),body:JSON.stringify({requested_state:state,requested_reason:reason,admin_actor:'test:playwright'})})
  expect(response.ok).toBeTruthy()
}

async function completePendingDeletion(){
  const list=await fetch(`${supabaseUrl}/rest/v1/account_deletion_requests?select=id&status=eq.pending&limit=1`,{headers:headers(true)})
  expect(list.ok).toBeTruthy()
  const requests=await list.json() as Array<{id:string}>
  expect(requests).toHaveLength(1)
  const response=await fetch(`${supabaseUrl}/rest/v1/rpc/admin_complete_public_account_deletion`,{method:'POST',headers:headers(true),body:JSON.stringify({target_request_id:requests[0].id,requested_reason:'PLAYWRIGHT_DELETION_COMPLETED',admin_actor:'test:playwright'})})
  expect(response.ok).toBeTruthy()
}

async function readOtp(email:string,excludedIds:Set<string>){
  for(let attempt=0;attempt<40;attempt++){
    const response=await fetch(`${mailpitUrl}/api/v1/messages`)
    if(response.ok){
      const body=await response.json() as {messages?:Array<{ID?:string;To?:Array<{Address?:string}>}>}
      const message=(body.messages??[]).find((item)=>item.ID&&!excludedIds.has(item.ID)&&item.To?.some((to)=>to.Address===email))
      if(message?.ID){
        const detail=await fetch(`${mailpitUrl}/api/v1/message/${message.ID}`).then((result)=>result.json()) as {Text?:string;HTML?:string;Subject?:string}
        const token=`${detail.Subject??''}\n${detail.Text??''}\n${detail.HTML??''}`.match(/\b\d{6}\b/)?.[0]
        if(token)return token
      }
    }
    await new Promise((resolve)=>setTimeout(resolve,250))
  }
  throw new Error('local OTP not found')
}

async function loginWithOtp(page:import('@playwright/test').Page,email:string){
  await page.goto('/login?next=/account')
  await page.getByLabel('이메일').fill(email)
  const priorMessageIds=await messageIdsFor(email)
  await page.getByRole('button',{name:'인증번호 받기'}).click()
  await expect(page.getByText('입력한 이메일로 인증번호를 보냈습니다.')).toBeVisible()
  const token=await readOtp(email,priorMessageIds)
  await page.getByLabel('인증번호 6자리').fill(token)
  await page.getByRole('button',{name:'로그인'}).click()
  await page.waitForURL('**/account')
  await expect(page.getByRole('heading',{name:'내 계정',exact:true})).toBeVisible({timeout:60_000})
}

test.describe('PHASE 10N-A real local auth account flow',()=>{
  let suffix='';let email='';let closedEmail=''
  test.beforeAll(({},testInfo)=>{
    suffix=testInfo.project.name.replace(/[^a-z0-9]/gi,'-').toLowerCase()
    email=`phase10n-${suffix}@example.invalid`
    closedEmail=`phase10n-closed-${suffix}@example.invalid`
  })

  test('public Home and account guide are responsive and state-safe',async({page})=>{
    await page.goto('/')
    await expect(page.getByRole('heading',{name:/학교는 찾고/})).toBeVisible()
    await expect(page.getByRole('heading',{name:'내부 안전 검증 중'})).toBeVisible()
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy()
    await page.goto('/submit')
    await expect(page.getByRole('heading',{name:'본인 정보만 비공개로 관리합니다'})).toBeVisible()
    await expect(page.getByText('신규 계정 생성은 아직 열리지 않았습니다.')).toBeVisible()
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy()
  })

  test('registration closed keeps a generic response and creates no auth user',async({page})=>{
    await page.goto('/login')
    await page.getByLabel('이메일').fill(closedEmail)
    await page.getByRole('button',{name:'인증번호 받기'}).click()
    await expect(page.getByText('입력한 이메일로 인증번호를 보냈습니다.')).toBeVisible({timeout:15_000})
    await page.waitForTimeout(500)
    expect(await hasMessageFor(closedEmail)).toBeFalsy()
  })

  test('real OTP, refresh rotation, adult consent, profile, school, relogin, emergency and deletion lifecycle',async({page})=>{
    await createLocalUser(email)
    await loginWithOtp(page,email)
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
    for(const checkbox of await page.locator('section').filter({hasText:'필수 동의'}).getByRole('checkbox').all())await checkbox.check()
    await page.getByRole('button',{name:'필수 동의 4개 기록'}).click()
    await expect(page.getByText('현재 정책 버전의 필수 동의 완료')).toBeVisible({timeout:20_000})
    await page.getByLabel('내 이름').fill(`TEST ${suffix}`)
    await page.getByLabel('Instagram 아이디 (선택·비공개)').fill('test.private')
    await page.getByLabel('소개 (선택·비공개)').fill('TEST private introduction')
    await page.getByRole('button',{name:'내 프로필 저장'}).click()
    await expect(page.getByRole('button',{name:'내 프로필 수정 저장'})).toBeVisible({timeout:20_000})
    await page.getByLabel('학교 검색').fill('TEST School 1')
    await expect(page.getByRole('option').first()).toBeVisible()
    await page.getByLabel('학교 검색').press('ArrowDown')
    await page.getByLabel('학교 검색').press('Enter')
    await page.getByLabel('졸업연도').fill('2020')
    await page.getByRole('button',{name:'학교 이력 추가'}).click()
    await expect(page.getByRole('heading',{name:/내 학교 이력.*1\/3/})).toBeVisible({timeout:20_000})

    await page.getByRole('button',{name:'로그아웃'}).click()
    await loginWithOtp(page,email)
    await page.goto('/onboarding')
    await expect(page.getByText('비공개 계정 시작 준비를 모두 마쳤습니다.')).toBeVisible({timeout:20_000})
    await page.goto('/people/search')
    await expect(page).toHaveURL(/\/account$/)
    await page.getByLabel('소개 (선택·비공개)').fill('TEST restored and updated')
    await page.getByRole('button',{name:'내 프로필 수정 저장'}).click()
    await page.reload()
    await expect(page.getByLabel('소개 (선택·비공개)')).toHaveValue('TEST restored and updated')
    await page.locator('section').filter({hasText:'내 학교 이력'}).getByRole('button',{name:'삭제'}).click()
    await expect(page.getByRole('heading',{name:/내 학교 이력.*0\/3/})).toBeVisible({timeout:20_000})
    await page.getByLabel('학교 검색').fill('TEST School 1')
    await expect(page.getByRole('option').first()).toBeVisible()
    await page.getByRole('option').first().click()
    await page.getByLabel('졸업연도').fill('2020')
    await page.getByRole('button',{name:'학교 이력 추가'}).click()
    await expect(page.getByRole('heading',{name:/내 학교 이력.*1\/3/})).toBeVisible({timeout:20_000})

    await setLaunchState('emergency_stopped','PLAYWRIGHT_EMERGENCY_STOP')
    const stopped=await page.evaluate(()=>fetch('/api/account/profile',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({display_name:'TEST BLOCKED',instagram_handle:null,introduction:null})}).then((response)=>response.status))
    expect(stopped).toBe(403)
    await setLaunchState('closed','POST_EMERGENCY_READINESS_REVIEWED')
    await setLaunchState('internal_test','LOCAL_AUTH_TEST_RESTORED')

    page.once('dialog',(dialog)=>dialog.accept())
    await page.getByRole('button',{name:'계정 탈퇴 요청'}).click()
    await expect(page.getByRole('button',{name:'탈퇴 요청 접수됨'})).toBeVisible({timeout:20_000})
    const blocked=await page.evaluate(()=>fetch('/api/account/profile',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({display_name:'TEST BLOCKED',instagram_handle:null,introduction:null})}).then((response)=>response.status))
    expect(blocked).toBe(403)
    await completePendingDeletion()
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
  })

  test('public pages expose no account identity and legacy write APIs stay fixed 503',async({page})=>{
    await page.goto('/')
    await expect(page.getByText(email)).toHaveCount(0)
    await expect(page.getByText(`TEST ${suffix}`)).toHaveCount(0)
    for(const endpoint of ['/api/profiles','/api/reports','/api/traces']){
      const status=await page.evaluate((url)=>fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).then((response)=>response.status),endpoint)
      expect(status).toBe(503)
    }
  })
})
