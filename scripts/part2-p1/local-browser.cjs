// Offline 375px check for Part 2 P1 screens: real Next build + a local fake Supabase HTTP server.
// Never touches Google/Auth or any remote DB. Screenshots go to artifacts/ (git-ignored).
const { chromium } = require('@playwright/test')
const { execFileSync, spawn } = require('node:child_process')
const { createServer } = require('node:http')
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')

const origin = 'http://localhost:3137', api = 'http://127.0.0.1:3136'
const folder = path.resolve('artifacts/mockups/2026-11-part2')
const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: api, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-public-fixture', SUPABASE_SERVICE_ROLE_KEY: 'local-server-fixture', NEXT_PUBLIC_SITE_URL: origin, NEXT_PUBLIC_SITE_DOMAIN: '', SCHOOLLOVE_SOCIAL_BROKER_EXPOSURE: 'off', VERCEL_ENV: 'preview', UPSTASH_REDIS_REST_URL: api, UPSTASH_REDIS_REST_TOKEN: 'local-limiter-fixture', ADMIN_PASSWORD: 'local-admin-fixture' }
const pause = (ms) => new Promise((r) => setTimeout(r, ms))
const base = { school_type: 'high', sido: '서울', sigungu: '서초구', address: '', school_code: '', created_at: '2026-01-01T00:00:00Z' }
const schools = [
  { id: '00000000-0000-4000-8000-000000000021', school_name: '서울서초고등학교', slug: 'seocho-high', ...base },
  { id: '00000000-0000-4000-8000-000000000022', school_name: '서울반포고등학교', slug: 'banpo-high', ...base },
]
const counts = { [schools[0].id]: [{ graduation_year: 2008, count: 3 }, { graduation_year: 2005, count: 1 }], [schools[1].id]: [] }
const requests = []

let server, next, browser
async function run() {
  try {
    server = createServer(async (req, res) => {
      const headers = { 'content-type': 'application/json', 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization,apikey,x-client-info,content-type,prefer,accept-profile,content-profile', 'access-control-allow-methods': 'GET,POST,OPTIONS' }
      if (req.method === 'OPTIONS') { res.writeHead(204, headers); res.end(); return }
      let raw = ''; for await (const chunk of req) raw += chunk
      const url = new URL(req.url, api), fn = url.pathname.split('/').pop()
      const respond = (value, status = 200) => { res.writeHead(status, headers); res.end(JSON.stringify(value)) }
      const input = raw && url.pathname.startsWith('/rest/v1/') ? JSON.parse(raw) : {}
      requests.push(fn)
      if (!url.pathname.startsWith('/rest/v1/')) return respond({ result: [79, 80] })
      if (fn === 'get_public_account_launch_state') return respond([{ state: 'open', registration_enabled: true, private_profile_enabled: true, school_membership_enabled: true, emergency_stopped: false }])
      if (fn === 'record_public_account_activity' || fn === 'part2_record_funnel_event') return respond(true)
      if (fn === 'search_schools_v2' || fn === 'search_schools_with_activity') return respond(schools)
      if (fn === 'school_year_counts_v2') return respond(counts[input.p_school_id] ?? [])
      if (fn === 'part2_year_masked_preview') return respond(input.p_year === 2008 ? [{ masked_name: '김O수' }, { masked_name: '이O' }, { masked_name: '박O진' }] : [{ masked_name: '최O' }])
      if (fn === 'part2_school_roster_flags') return respond(input.p_school_ids.map((id) => ({ school_id: id, has_roster: (counts[id] ?? []).length > 0 })))
      if (fn === 'part2_home_attendance') return respond({ visible: true, recent_total: 6, ticker: [{ school_name: '서울서초고등학교', slug: 'seocho-high', graduation_year: 2008, count: 2 }, { school_name: '서울서초고등학교', slug: 'seocho-high', graduation_year: 2005, count: 1 }], top: [{ school_name: '서울서초고등학교', slug: 'seocho-high', count: 4 }] })
      if (fn === 'part2_popular_schools') return respond(schools.map(({ school_name, slug }) => ({ school_name, slug })))
      if (fn === 'schools') return respond(schools.find((s) => url.searchParams.get('slug') === 'eq.' + s.slug) ?? schools[0])
      respond({ code: 'LOCAL_FIXTURE_UNAVAILABLE' }, 503)
    })
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(3136, '127.0.0.1', resolve) })
    if (!process.argv.includes('--skip-build')) execFileSync(process.execPath, ['node_modules/next/dist/bin/next', 'build'], { env, stdio: 'ignore', windowsHide: true, timeout: 600000 })
    next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', '3137', '-H', '127.0.0.1'], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    next.stdout.on('data', () => {}); next.stderr.on('data', () => {})
    let started = false
    for (let i = 0; i < 60; i++) { try { if ((await fetch(origin)).status === 200) { started = true; break } } catch {} await pause(500) }
    assert.ok(started, 'next start ready')

    browser = await chromium.launch({ channel: 'chrome', headless: true })
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
    await context.route(/^https?:\/\/(?!localhost:3137|127\.0\.0\.1:3136)/, (route) => route.abort())
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    fs.mkdirSync(folder, { recursive: true })
    const shot = async (name) => {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, name + ' horizontal overflow')
      await page.screenshot({ path: path.join(folder, name), fullPage: true })
    }

    await page.goto(origin + '/?ref=threads'); await page.waitForLoadState('networkidle')
    assert.ok(await page.getByText('최근 7일 출석 6명').isVisible())
    assert.equal(await page.getByText('학교 찾기 화면으로 가기').count(), 0)
    await shot('p1-home-375.png')

    // P2: Threads visitor sees the trust badge once, at the top.
    assert.equal(await page.getByText('무광고 · 1인 개인사업자').count(), 1)
    const badgeY = await page.getByText('무광고 · 1인 개인사업자').boundingBox()
    const titleY = await page.locator('#home-title').boundingBox()
    assert.ok(badgeY.y < titleY.y, 'trust badge above the title for social visits')

    await page.goto(origin + '/search'); await page.waitForLoadState('networkidle')
    assert.ok(await page.getByText('지금 동창들이 많이 찾는 학교').isVisible())
    await shot('p1-search-idle-375.png')
    await page.getByRole('combobox').first().fill('서초고').catch(async () => { await page.locator('input').first().fill('서초고') })
    await page.keyboard.press('Enter'); await page.waitForLoadState('networkidle')
    await page.getByText('출석부 열림 · 기수 보기 →').first().waitFor({ timeout: 10000 })
    assert.ok(await page.getByText('1대 반장 모집 중').first().isVisible())
    await shot('p1-search-results-375.png')

    await page.goto(origin + '/school/seocho-high'); await page.waitForLoadState('networkidle')
    assert.ok(await page.getByText('내 졸업연도 고르기').isVisible())
    assert.equal(await page.getByText('아직 등록한 사람이 없어요').count(), 0)
    await shot('p1-school-375.png')

    await page.goto(origin + '/school/seocho-high/2008'); await page.waitForLoadState('networkidle')
    assert.ok(await page.getByText('김O수', { exact: true }).isVisible())
    assert.equal(await page.content().then((html) => html.includes('김민수')), false)
    await shot('p1-year-masked-375.png')

    await page.goto(origin + '/school/seocho-high/1999'); await page.waitForLoadState('networkidle')
    const before = requests.length
    await page.getByLabel('찾는 친구 초성').fill('김민수'); await page.getByRole('button', { name: '칠판에 적기' }).click()
    assert.ok(await page.getByText('이름 전체 대신 초성을 섞어 주세요.', { exact: false }).isVisible())
    await page.getByLabel('찾는 친구 초성').fill('김ㅇ수'); await page.getByLabel(/한마디/).fill('반가워! 잘 지내?')
    await page.getByRole('button', { name: '칠판에 적기' }).click()
    await page.getByText('칠판에 적어 뒀어요 ✓').waitFor()
    const stored = await page.evaluate(() => localStorage.getItem('sl_p2_chalkboard'))
    assert.match(stored, /김ㅇ수/)
    await pause(500)
    // The initials themselves never reach the (fake) Supabase server.
    assert.equal(requests.slice(before).some((r) => /ㅇ/.test(r)), false)
    await shot('p1-year-chalkboard-375.png')

    assert.deepEqual(errors, [], 'page errors')
    console.log('P1_BROWSER_PASS')
  } finally {
    await browser?.close().catch(() => {})
    next?.kill()
    server?.close()
  }
}
run().catch((error) => { console.error(error); process.exitCode = 1 })
