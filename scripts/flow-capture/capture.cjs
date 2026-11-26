// 고객 흐름 캡처(가입 → 최종 단계). 실제 Next 빌드 + 로컬 가짜 Supabase 서버만 사용한다.
// Google·원격 DB·실제 계정에는 접속하지 않는다. 로그인 쿠키·브로커 키는 실행할 때마다 새로 만든 가짜 값이다.
// 결과 PNG는 artifacts/flow-capture/ (git 제외 폴더)에 저장된다.
// 실행: node scripts/flow-capture/capture.cjs [--skip-build]
const { chromium } = require('@playwright/test')
const { execFileSync, spawn } = require('node:child_process')
const { createServer } = require('node:http')
const crypto = require('node:crypto')
const fs = require('node:fs'), path = require('node:path')

const origin = 'http://localhost:3147', api = 'http://127.0.0.1:3146'
const folder = path.resolve('artifacts/flow-capture')
const rand = () => crypto.randomBytes(32).toString('base64url')
const jwk = Buffer.from(JSON.stringify(crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ format: 'jwk' }))).toString('base64url')
const env = {
  ...process.env, NODE_ENV: 'production',
  NEXT_PUBLIC_SUPABASE_URL: api, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-public-fixture', SUPABASE_SERVICE_ROLE_KEY: 'local-server-fixture',
  NEXT_PUBLIC_SITE_URL: origin, NEXT_PUBLIC_SITE_DOMAIN: '', VERCEL_ENV: 'preview',
  UPSTASH_REDIS_REST_URL: api, UPSTASH_REDIS_REST_TOKEN: 'local-limiter-fixture', ADMIN_PASSWORD: 'local-admin-fixture',
  SCHOOLLOVE_SOCIAL_BROKER_EXPOSURE: 'preview',
  SCHOOLLOVE_GOOGLE_CLIENT_ID: 'local-fixture', SCHOOLLOVE_GOOGLE_CLIENT_SECRET: 'local-fixture', SCHOOLLOVE_SUPABASE_GOOGLE_CLIENT_SECRET: 'local-fixture',
  SCHOOLLOVE_SOCIAL_BROKER_UPSTREAM_CONTINUATION_KEY_V1: rand(), SCHOOLLOVE_SOCIAL_BROKER_BROWSER_SESSION_KEY_V1: rand(),
  SCHOOLLOVE_SOCIAL_BROKER_UPSTREAM_PKCE_KEY_V1: rand(), SCHOOLLOVE_SOCIAL_BROKER_DOWNSTREAM_NONCE_KEY_V1: rand(),
  SCHOOLLOVE_SOCIAL_BROKER_SUBJECT_KEY_K01: rand(), SCHOOLLOVE_RECOVERY_EMAIL_HMAC_KEY_V1: rand(),
  SCHOOLLOVE_RECOVERY_EMAIL_ENCRYPTION_KEY_V1: rand(), SCHOOLLOVE_RECOVERY_OTP_MAC_KEY_V1: rand(),
  SCHOOLLOVE_RECOVERY_RESEND_API_KEY: 'local-fixture', SCHOOLLOVE_RECOVERY_EMAIL_FROM: 'local@example.test',
  SCHOOLLOVE_SOCIAL_BROKER_OIDC_SIGNING_PRIVATE_JWK_V1: jwk,
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms))

const userId = '00000000-0000-4000-8000-00000000u001'.replace('u', 'a')
const base = { school_type: 'high', sido: '서울', sigungu: '서초구', address: '', school_code: '', created_at: '2026-01-01T00:00:00Z' }
const school = { id: '00000000-0000-4000-8000-000000000021', school_name: '서울서초고등학교', slug: 'seocho-high', ...base }
const schools = [school, { id: '00000000-0000-4000-8000-000000000022', school_name: '서울반포고등학교', slug: 'banpo-high', ...base }]
const profile = { id: '00000000-0000-4000-8000-0000000000b1', owner_user_id: userId, display_name: '김민수', instagram_handle: 'minsu.kim', profile_photo_url: null, introduction: null, profile_visibility: 'private', status: 'active', created_at: '2026-11-20T00:00:00Z', updated_at: '2026-11-20T00:00:00Z' }
const membership = { id: '00000000-0000-4000-8000-0000000000c1', school_id: school.id, graduation_year: 2008, class_number: null, class_history: [], school: { id: school.id, school_name: school.school_name, school_type: 'high', sido: '서울', sigungu: '서초구', slug: school.slug } }
const roster = ['김민수', '이지은', '박서진', '최우현', '정하늘'].map((display_name) => ({ display_name, graduation_year: 2008, class_history: [] }))
let phase = 'new' // new → registered

const json = (value) => JSON.stringify(value)
function table(name) {
  const done = phase === 'registered'
  switch (name) {
    case 'adult_eligibility_records': return done ? [{ id: 'e1' }] : []
    case 'consent_records': return done ? ['terms', 'privacy_collection', 'adult_confirmation', 'private_by_default'].map((consent_type) => ({ consent_type })) : []
    case 'private_profiles': return done ? [profile] : []
    case 'profile_school_memberships': return done ? [membership] : []
    case 'school_roster_consents': return done ? [{ membership_id: membership.id, withdrawn_at: null }] : []
    case 'schools': return schools
    default: return []
  }
}

let server, next, browser
const shots = []
async function run() {
  try {
    server = createServer(async (req, res) => {
      const headers = { 'content-type': 'application/json', 'access-control-allow-origin': origin, 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS' }
      if (req.method === 'OPTIONS') { res.writeHead(204, headers); res.end(); return }
      let raw = ''; for await (const chunk of req) raw += chunk
      const url = new URL(req.url, api), fn = url.pathname.split('/').pop()
      const respond = (value, status = 200) => { res.writeHead(status, headers); res.end(json(value)) }
      if (url.pathname === '/auth/v1/user') return respond({ id: userId, aud: 'authenticated', role: 'authenticated', email: 'local@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-11-20T00:00:00Z' })
      if (!url.pathname.startsWith('/rest/v1/')) return respond({ result: [79, 80] })
      const input = raw ? JSON.parse(raw) : {}
      if (url.pathname.startsWith('/rest/v1/rpc/')) {
        if (fn === 'get_public_account_launch_state') return respond([{ state: 'open', registration_enabled: true, private_profile_enabled: true, school_membership_enabled: true, emergency_stopped: false }])
        if (fn === 'search_schools_v2' || fn === 'search_schools_with_activity') return respond(schools)
        if (fn === 'school_year_counts_v2') return respond(input.p_school_id === school.id ? [{ graduation_year: 2008, count: 5 }, { graduation_year: 2005, count: 1 }] : [])
        if (fn === 'part2_year_masked_preview_v2') return respond(input.p_year !== 2008 ? [] : [{ masked_name: '이O은', tags: ['직장인'], note: '다들 보고 싶다!' }, { masked_name: '박O진', tags: [], note: null }, { masked_name: '최O현', tags: ['육아 중'], note: null }, { masked_name: '정O늘', tags: [], note: null }])
        if (fn === 'part2_school_roster_flags') return respond((input.p_school_ids ?? []).map((id) => ({ school_id: id, has_roster: id === school.id })))
        if (fn === 'part2_home_attendance') return respond({ visible: true, recent_total: 6, ticker: [{ school_name: school.school_name, slug: school.slug, graduation_year: 2008, count: 2 }, { school_name: school.school_name, slug: school.slug, graduation_year: 2005, count: 1 }], top: [{ school_name: school.school_name, slug: school.slug, count: 6 }] })
        if (fn === 'part2_popular_schools') return respond(schools.map(({ school_name, slug }) => ({ school_name, slug })))
        if (fn === 'part2_get_public_summons') return respond([{ school_name: school.school_name, school_slug: school.slug, graduation_year: 2008, target_name: '홍길동' }])
        if (fn === 'get_school_member_roster') return respond(roster)
        if (fn === 'public_account_access_active' || fn === 'public_account_feature_enabled' || fn === 'has_current_adult_access') return respond(true)
        if (fn === 'has_beta_feature_access' || fn === 'has_beta_onboarding_access') return respond(false)
        if (fn.startsWith('record_') || fn.startsWith('part2_record')) return respond(true)
        return respond({ code: 'LOCAL_FIXTURE_UNAVAILABLE' }, 503)
      }
      let rows = table(fn)
      const slug = url.searchParams.get('slug'); if (fn === 'schools' && slug) rows = rows.filter((s) => 'eq.' + s.slug === slug)
      const sid = url.searchParams.get('id'); if (fn === 'schools' && sid?.startsWith('eq.')) rows = rows.filter((s) => 'eq.' + s.id === sid)
      if ((req.headers.accept ?? '').includes('vnd.pgrst.object')) return rows.length ? respond(rows[0]) : respond({ code: 'PGRST116' }, 406)
      respond(rows)
    })
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(3146, '127.0.0.1', resolve) })
    // 가짜 서버 단계 전환은 스크립트 안에서 변수로 직접 바꾼다.

    if (!process.argv.includes('--skip-build')) execFileSync(process.execPath, ['node_modules/next/dist/bin/next', 'build'], { env, stdio: 'inherit', windowsHide: true, timeout: 900000 })
    next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', '3147', '-H', '127.0.0.1'], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    const serverLog = []; next.stdout.on('data', (d) => serverLog.push(String(d))); next.stderr.on('data', (d) => serverLog.push(String(d)))
    let started = false
    for (let i = 0; i < 80; i++) { try { if ((await fetch(origin)).status === 200) { started = true; break } } catch {} await pause(500) }
    if (!started) throw new Error('next start not ready\n' + serverLog.join(''))

    browser = await chromium.launch({ channel: 'chrome', headless: true })
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    })
    await context.route(/^https?:\/\/(?!localhost:3147|127\.0\.0\.1:3146)/, (route) => route.abort())
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    fs.mkdirSync(folder, { recursive: true })
    const shot = async (name, title, full = true) => {
      await pause(400)
      await page.screenshot({ path: path.join(folder, name + '.png'), fullPage: full })
      shots.push({ file: name + '.png', title, url: page.url().replace(origin, '') })
      console.log('SHOT', name, page.url().replace(origin, ''))
    }
    const go = async (p) => { await page.goto(origin + p); await page.waitForLoadState('networkidle').catch(() => {}) }

    // ── 1. 로그인 전: 발견 ─────────────────────────
    await go('/?ref=threads'); await shot('01-home', '홈 (SNS에서 유입)')
    await go('/search'); await shot('02-search', '학교 찾기')
    await page.locator('input').first().fill('서초고'); await page.keyboard.press('Enter'); await page.waitForLoadState('networkidle').catch(() => {})
    await pause(1200); await shot('03-search-results', '학교 검색 결과')
    await go('/school/seocho-high'); await shot('04-school', '학교 페이지 (졸업연도 고르기)')
    await go('/school/seocho-high/2008'); await shot('05-year-preview', '기수 페이지 (가린 이름 미리보기)')
    // 가입자가 없는 졸업연도: 칠판에 초성·한마디 적기(브라우저에만 저장)
    await go('/school/seocho-high/1999'); await shot('05c-year-empty', '기수 페이지 (아직 가입자 없음)')
    await page.getByLabel('찾는 친구 초성').fill('김ㅇ수'); await page.getByLabel(/한마디/).fill('반가워! 잘 지내?')
    await shot('05d-chalkboard-filled', '칠판에 적기 (입력)')
    await page.getByRole('button', { name: '칠판에 적기' }).click()
    await page.getByText('칠판에 적어 뒀어요 ✓').waitFor({ timeout: 10000 })
    await shot('05e-chalkboard-done', '칠판에 적기 (완료)')
    await go('/summons/0123456789ab'); await shot('05b-summons', '[곁가지] 지명 소환장 링크로 들어온 경우')
    await go('/login?next=/onboarding'); await shot('06-login', 'Google 로그인')

    // ── 2. 로그인 후: 가입 ─────────────────────────
    const fakeJwt = ['e30', Buffer.from(json({ sub: userId, exp: Math.floor(Date.now() / 1000) + 86400 })).toString('base64url'), 'sig'].join('.')
    await context.addCookies([{ name: 'sl_user_access', value: fakeJwt, url: origin }, { name: 'sl_user_refresh', value: 'local-fixture', url: origin }])
    await context.route('**/api/onboarding**', (r) => r.fulfill({ json: { state: { stage: 'adult_required', adultReady: false, consentsReady: false, profileReady: false, schoolReady: false, complete: false } } }))
    for (const p of ['eligibility', 'consents', 'profile', 'memberships']) {
      await context.route(`**/api/account/${p}`, (r) => r.request().method() === 'POST' ? r.fulfill({ status: p === 'memberships' ? 201 : 200, json: {} }) : r.fallback())
    }
    await go('/onboarding'); await shot('07-signup-empty', '가입 한 화면 (빈 상태)')
    await page.getByLabel('출석부에 보일 이름').fill('김민수')
    await page.getByPlaceholder('instagram_id').fill('@minsu.kim')
    await page.getByRole('combobox', { name: '학교' }).fill('서초')
    await page.getByRole('option', { name: /서울서초고등학교/ }).first().click()
    await page.locator('select').first().selectOption('2008')
    await page.getByLabel('생년월일').fill('1990-03-01')
    for (const name of [/만 19세 이상 본인이에요/, /같은 학교 회원에게 보여요/, /이용약관/]) await page.getByRole('checkbox', { name }).check()
    await shot('08-signup-filled', '가입 한 화면 (입력 완료)')
    phase = 'registered'
    await page.getByRole('button', { name: '등록하고 출석부 보기' }).click()
    await page.waitForURL('**/onboarding/installed', { timeout: 20000 }); await page.waitForLoadState('networkidle').catch(() => {})
    await shot('09-install', '홈 화면에 추가 안내')

    // ── 3. 가입 후: 출석부와 인스타 교환 ─────────────
    await context.route('**/api/connections/notifications/summary', (r) => r.fulfill({ json: { unreadCount: 1 } }))
    await context.route('**/api/part2/chalkboard**', (r) => r.fulfill({ json: { board: { locked: false, members: 5, needed: 3, entries: [{ display_name: '이지은', tags: ['직장인'], note: '다들 보고 싶다!' }, { display_name: '최우현', tags: ['육아 중'], note: null }] } } }))
    await context.route('**/api/account/status-tags', (r) => r.fulfill({ json: { status: { tags: ['직장인'], note: null, show_on_school_page: false } } }))
    await context.route('**/api/summons/own', (r) => r.fulfill({ json: { summons: [] } }))
    await context.route('**/api/connections/search', (r) => r.fulfill({ json: { state: 'match_available', matchToken: 'local-fixture' } }))
    await go('/account'); await shot('10-roster', '내 출석부 (로그인 후 첫 화면)')
    const requestButton = page.getByRole('button', { name: /인스타/ }).first()
    await context.route('**/api/connections/requests', (r) => r.request().method() === 'POST' ? r.fulfill({ status: 201, json: {} }) : r.fallback())
    if (await requestButton.count()) { await requestButton.click(); await pause(600); await shot('11-request-sent', '인스타 요청 보냄', false) }
    else console.log('NO_REQUEST_BUTTON')
    // 설정(톱니바퀴): 프로필·인스타 아이디 입력·학교 이력·알림·탈퇴
    await page.evaluate(() => document.querySelectorAll('#account-settings, #account-settings details').forEach((d) => { d.open = true }))
    await pause(400)
    await page.locator('#account-settings').screenshot({ path: path.join(folder, '10b-settings.png') })
    shots.push({ file: '10b-settings.png', title: '설정 (프로필·인스타 아이디·학교·알림·탈퇴)', url: '/account#account-settings' }); console.log('SHOT 10b-settings')

    await context.unroute('**/api/connections/requests')
    const now = new Date().toISOString()
    await context.route('**/api/connections/requests', (r) => r.fulfill({ json: { received: [{ id: 'r1', senderName: '이지은', relationshipType: 'same_school', message: '출석부에서 봤어! 인스타 주소 교환할래?', status: 'pending', sentAt: now, school: { schoolName: school.school_name, graduationYear: 2008 } }], sent: [{ id: 'r2', senderName: '박서진', relationshipType: 'same_school', status: 'pending', sentAt: now }] } }))
    await context.route(/\/api\/connections$/, (r) => r.fulfill({ json: { connections: [] } }))
    await context.route('**/api/connections/notifications', (r) => r.fulfill({ json: { notifications: [{ id: 'n1', type: 'request_received', createdAt: now, read: false }] } }))
    await go('/notifications'); await shot('12-notifications', '알림 (받은 요청 수락하기)')

    await context.unroute(/\/api\/connections$/); await context.unroute('**/api/connections/requests'); await context.unroute('**/api/connections/notifications')
    await context.route('**/api/connections/requests', (r) => r.fulfill({ json: { received: [], sent: [] } }))
    await context.route(/\/api\/connections$/, (r) => r.fulfill({ json: { connections: [{ id: 'c1', displayName: '이지은', status: 'active', connectedAt: now }] } }))
    await context.route('**/api/connections/notifications', (r) => r.fulfill({ json: { notifications: [{ id: 'n2', type: 'request_accepted', createdAt: now, read: false }] } }))
    await go('/notifications'); await shot('13-connected', '서로 수락됨 (연결 목록)')

    await context.route('**/api/connections/c1', (r) => r.fulfill({ json: { connection: { id: 'c1', status: 'active', displayName: '이지은' }, capabilities: { messaging: false, instagramPermission: true } } }))
    await context.route('**/api/connections/c1/messages', (r) => r.fulfill({ json: { conversation: { messages: [] } } }))
    // 연결 직후: 아직 서로 인스타를 공개하지 않은 상태
    await context.route('**/api/connections/c1/instagram', (r) => r.fulfill({ json: { instagramHandle: null, myInstagramConfigured: true, myInstagramVisible: false } }))
    await go('/connections/c1'); await shot('13b-share-mine', '연결 직후: 내 인스타 공개하기')
    await context.unroute('**/api/connections/c1/instagram')
    await context.route('**/api/connections/c1/instagram', (r) => r.fulfill({ json: { instagramHandle: null, myInstagramConfigured: false, myInstagramVisible: false } }))
    await go('/connections/c1'); await shot('13c-no-instagram', '인스타 아이디를 아직 등록 안 한 경우')
    await context.unroute('**/api/connections/c1/instagram')
    await context.route('**/api/connections/c1/instagram', (r) => r.fulfill({ json: { instagramHandle: 'jieun.lee', myInstagramConfigured: true, myInstagramVisible: true } }))
    await go('/connections/c1'); await shot('14-instagram', '최종: 상대 인스타 주소 공개')

    fs.writeFileSync(path.join(folder, 'shots.json'), json(shots, null, 2))
    if (errors.length) console.log('PAGE_ERRORS', errors)
    console.log('FLOW_CAPTURE_DONE', shots.length)
  } finally {
    await browser?.close().catch(() => {})
    next?.kill()
    server?.close()
  }
}
run().catch((error) => { console.error(error); process.exitCode = 1 })
