import { expect, test, type Page } from '@playwright/test'

const supabaseUrl = process.env.PHASE10N_E2E_SUPABASE_URL
const serviceKey = process.env.PHASE10N_E2E_SERVICE_KEY
const anonKey = process.env.PHASE10N_E2E_ANON_KEY
const proxyControlToken = process.env.PHASE10N_E2E_PROXY_CONTROL_TOKEN
const schoolId = 'a8811f19-e7ae-93a0-1140-ec8ef0e990d7'
test.skip(!supabaseUrl || !serviceKey || !anonKey || !proxyControlToken, 'requires disposable local Supabase Auth')
test.describe.configure({ mode: 'serial' })

type Fixture = { key: string; userId: string; name: string; year: number }
const fixtures: Fixture[] = []

function headers(admin = false) {
  const key = admin ? serviceKey! : anonKey!
  return { 'content-type': 'application/json', apikey: key, Authorization: `Bearer ${key}` }
}

async function insert(table: string, body: unknown) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: 'POST', headers: { ...headers(true), Prefer: 'return=minimal' }, body: JSON.stringify(body),
  })
  expect(response.ok, `${table}: ${await response.text()}`).toBeTruthy()
}

async function setLaunchState(state: string, reason: string) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/admin_set_public_account_launch_state`, {
    method: 'POST', headers: headers(true),
    body: JSON.stringify({ requested_state: state, requested_reason: reason, admin_actor: 'test:phase10v-playwright' }),
  })
  expect(response.ok, await response.text()).toBeTruthy()
}

async function createGoogleFixture(key: string, name: string, year: number) {
  const response = await fetch(`${supabaseUrl}/phase10r-google-session`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-phase10n-control': proxyControlToken! },
    body: JSON.stringify({ fixtureKey: key }),
  })
  const body = await response.text()
  expect(response.ok, body).toBeTruthy()
  const fixture = JSON.parse(body) as { userId: string; provider: string; identityCount: number }
  expect(fixture).toMatchObject({ provider: 'custom:schoollove-google', identityCount: 1 })
  fixtures.push({ key, userId: fixture.userId, name, year })
}

async function createControlledBeta(suffix: string) {
  const draftId = crypto.randomUUID(), programId = crypto.randomUUID(), snapshotId = crypto.randomUUID()
  const features = ['account_registration', 'private_profile', 'people_search', 'connection_request']
  await insert('beta_setup_drafts', {
    id: draftId, draft_key: `phase10n_e2e_10v_${suffix}`, name: 'PHASE10V E2E',
    starts_at: new Date(Date.now() - 60_000).toISOString(), ends_at: new Date(Date.now() + 86_400_000).toISOString(),
    max_users: 20, target_scope: 'one_school', enabled_features: features,
    invite_policy: { maxUsesPerInvite: 1, expiresInDays: 7 }, approval_waitlist_enabled: true,
    stop_conditions: { PRIVACY_EXPOSURE: true, RLS_FAILURE: true, HEALTH_FAILURE: true },
    status: 'activated', created_by: 'test:phase10v-playwright',
  })
  await insert('beta_programs', {
    id: programId, program_key: `phase10n_e2e_10v_${suffix}`, name: 'PHASE10V E2E', status: 'active',
    requires_admin_approval: true, starts_at: new Date(Date.now() - 60_000).toISOString(),
    ends_at: new Date(Date.now() + 86_400_000).toISOString(),
  })
  await insert('beta_program_setup_snapshots', {
    id: snapshotId, program_id: programId, source_draft_id: draftId, max_users: 20,
    target_scope: 'one_school', enabled_features: features,
    invite_policy: { maxUsesPerInvite: 1, expiresInDays: 7 }, approval_waitlist_enabled: true,
    stop_conditions: { PRIVACY_EXPOSURE: true, RLS_FAILURE: true, HEALTH_FAILURE: true },
    created_by: 'test:phase10v-playwright',
  })
  await insert('beta_program_schools', { program_id: programId, school_id: schoolId, source_snapshot_id: snapshotId, created_by: 'test:phase10v-playwright' })
  await insert('beta_feature_flags', [
    'account_registration', 'private_profile', 'people_search', 'connection_request',
    'messaging', 'instagram_permission', 'promotion_application', 'promotion_operations',
  ].map((feature_key) => ({
    program_id: programId, feature_key, enabled: features.includes(feature_key),
    reason_code: 'PHASE10V_E2E_CONTRACT', updated_by: 'test:phase10v-playwright',
  })))
  await insert('beta_members', fixtures.map((fixture) => ({
    program_id: programId, user_id: fixture.userId, status: 'active', target_school_id: schoolId,
    reviewed_at: new Date().toISOString(), reviewed_by: 'test:phase10v-playwright', reason_code: 'PHASE10V_E2E_APPROVED',
  })))
}

async function login(page: Page, fixture: Fixture) {
  const response = await page.request.post(`${supabaseUrl}/phase10r-google-session`, {
    headers: { 'x-phase10n-control': proxyControlToken! }, data: { fixtureKey: fixture.key },
  })
  expect(response.ok(), await response.text()).toBeTruthy()
  await page.goto('/account')
  await expect(page.getByRole('heading', { name: '내 계정', exact: true })).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText('Google 계정으로 로그인됨')).toBeVisible()
}

async function post(page: Page, path: string, data: unknown, expected: number) {
  const response = await page.request.post(path, { data })
  expect(response.status(), `${path}: ${await response.text()}`).toBe(expected)
  return response
}

async function completeAccount(page: Page, fixture: Fixture) {
  await login(page, fixture)
  await post(page, '/api/account/eligibility', { dateOfBirth: '1990-02-28' }, 200)
  await post(page, '/api/account/consents', {
    terms: true, privacy_collection: true, adult_confirmation: true, private_by_default: true,
  }, 200)
  await post(page, '/api/account/profile', {
    display_name: fixture.name, instagram_handle: `private.${fixture.userId.slice(-4)}`, introduction: '비공개 소개',
  }, 200)
  await post(page, '/api/account/memberships', {
    school_id: schoolId, graduation_year: fixture.year, class_number: null,
  }, 201)
}

async function searchAndGreet(page: Page, actor: Fixture, receiver: Fixture, greeting: string, throughUi = false) {
  await login(page, actor)
  if (throughUi) {
    await page.goto('/people/search')
    await page.getByLabel('학교').fill('TEST School 1')
    await expect(page.getByRole('button', { name: /TEST School 1/ }).first()).toBeVisible()
    await page.getByRole('button', { name: /TEST School 1/ }).first().click()
    await page.getByLabel('졸업연도').fill(String(receiver.year))
    await page.getByLabel('정확한 이름').fill(receiver.name)
    const searched = page.waitForResponse((response) => response.url().includes('/api/connections/search') && response.request().method() === 'POST')
    await page.getByRole('button', { name: '정확히 일치하는지 확인' }).click()
    const searchResponse = await searched
    expect(searchResponse.status()).toBe(200)
    expect(await searchResponse.json()).toMatchObject({ state: 'match_available' })
    await expect(page.getByRole('heading', { name: '안부 보내기' })).toBeVisible()
    await page.getByLabel('최초 안부').fill(greeting)
    await page.getByRole('button', { name: '안부 미리보기' }).click()
    const created = page.waitForResponse((response) => response.url().includes('/api/connections/requests') && response.request().method() === 'POST')
    await page.getByRole('button', { name: '이 안부를 한 번 보내기' }).click()
    expect((await created).status()).toBe(201)
    return
  }
  const found = await post(page, '/api/connections/search', {
    school_id: schoolId, graduation_year: receiver.year, exact_name: receiver.name,
  }, 200)
  const match = await found.json() as { state: string; matchToken?: string }
  expect(match.state).toBe('match_available')
  expect(match.matchToken).toBeTruthy()
  await post(page, '/api/connections/requests', {
    match_token: match.matchToken, relationship_type: 'same_school', message: greeting,
  }, 201)
}

test.describe('PHASE 10V genuine Google-bound people discovery', () => {
  let suffix = ''

  test.beforeAll(async ({}, testInfo) => {
    suffix = testInfo.project.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()
    for (let index = 1; index <= 8; index += 1) {
      const role = index % 2 === 1 ? '보내는' : '받는'
      await createGoogleFixture(`phase10v-${suffix}-${index}`, `${role}${suffix}${index}`, 2000 + index)
    }
    await createControlledBeta(suffix)
    await setLaunchState('internal_test', 'PHASE10V_E2E_ACTIVE')
  })

  test.afterAll(async () => {
    await setLaunchState('closed', 'PHASE10V_E2E_CLEANUP')
    for (const fixture of fixtures) {
      await fetch(`${supabaseUrl}/auth/v1/admin/users/${fixture.userId}`, { method: 'DELETE', headers: headers(true) })
    }
  })

  test('exact UI search sends one private greeting and emergency still permits receiver decline', async ({ page }) => {
    test.setTimeout(300_000)
    for (const fixture of fixtures) await completeAccount(page, fixture)
    const actor = fixtures[0], receiver = fixtures[1]
    const greeting = '나 완이야. 오랜만이야.'
    await searchAndGreet(page, actor, receiver, greeting, true)

    await login(page, receiver)
    await page.goto('/connections')
    const received = page.locator('#received article').first()
    await expect(received).toContainText(greeting, { timeout: 30_000 })
    await expect(received).not.toContainText(actor.name)
    await expect(received).not.toContainText(`private.${actor.userId.slice(-4)}`)
    await expect(page.getByText(/Instagram/)).toHaveCount(0)

    await setLaunchState('emergency_stopped', 'PHASE10V_E2E_EMERGENCY_DECLINE')
    await received.getByRole('button', { name: '거절' }).click()
    await expect(page.getByRole('status')).toContainText('안부를 처리했습니다.', { timeout: 30_000 })
    await setLaunchState('closed', 'PHASE10V_E2E_EMERGENCY_REVIEWED')
    await setLaunchState('internal_test', 'PHASE10V_E2E_RESTORED')
  })

  test('accepts exactly one independent connection and emergency blocks expansion but preserves block/report', async ({ page }) => {
    test.setTimeout(300_000)
    await searchAndGreet(page, fixtures[2], fixtures[3], '동창 맞지? 반가워.')
    await login(page, fixtures[3])
    await page.goto('/connections')
    await page.locator('#received article').first().getByRole('button', { name: '수락하고 답장' }).click()
    await expect(page.getByRole('status')).toContainText('안부를 처리했습니다.', { timeout: 30_000 })

    const connections = await fetch(`${supabaseUrl}/rest/v1/connections?select=id&status=eq.active`, { headers: headers(true) })
    const connectionRows = await connections.json() as Array<{ id: string }>
    expect(connectionRows).toHaveLength(1)
    const connectionId = connectionRows[0].id
    expect((await page.request.get(`/api/connections/${connectionId}/instagram`)).status()).toBe(403)
    expect((await page.request.get(`/api/connections/${connectionId}/messages`)).status()).toBe(403)

    await searchAndGreet(page, fixtures[4], fixtures[5], '안전 확인용 안부야.')
    await searchAndGreet(page, fixtures[6], fixtures[7], '신고 확인용 안부야.')
    await setLaunchState('emergency_stopped', 'PHASE10V_E2E_EMERGENCY_EXPANSION_STOP')

    await login(page, fixtures[4])
    await page.goto('/people/search')
    await expect(page).toHaveURL(/\/account$/, { timeout: 30_000 })

    await login(page, fixtures[5])
    await page.goto('/connections')
    const blockedRequest = page.locator('#received article').first()
    await blockedRequest.getByRole('button', { name: '수락하고 답장' }).click()
    await expect(page.getByRole('status')).toContainText('안부를 처리할 수 없습니다.', { timeout: 30_000 })
    await blockedRequest.getByRole('button', { name: '차단' }).click()
    await expect(page.getByRole('status')).toContainText('안부를 처리했습니다.', { timeout: 30_000 })

    await login(page, fixtures[7])
    await page.goto('/connections')
    await page.locator('#received article').first().getByRole('button', { name: '신고' }).click()
    await expect(page.getByRole('status')).toContainText('안부를 처리했습니다.', { timeout: 30_000 })

    const finalConnections = await fetch(`${supabaseUrl}/rest/v1/connections?select=id&status=eq.active`, { headers: headers(true) })
    expect(await finalConnections.json()).toEqual([{ id: connectionId }])
    await setLaunchState('closed', 'PHASE10V_E2E_EMERGENCY_REVIEWED')
    await setLaunchState('internal_test', 'PHASE10V_E2E_FINAL_RESTORE')
  })
})
