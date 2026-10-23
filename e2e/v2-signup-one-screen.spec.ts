import { expect, test } from '@playwright/test'

// v2-05: 가입 한 화면 시나리오. /onboarding은 서버에서 로그인 세션을 확인하므로, 미리 로그인한
// Playwright storage state 파일 경로를 V2_SIGNUP_STORAGE_STATE로 줄 때만 실행한다(없으면 건너뜀).
// 쓰기 API 4개는 모두 가로채서 응답을 흉내 내므로 실제 계정·DB에는 아무것도 저장하지 않는다.
const storageState = process.env.V2_SIGNUP_STORAGE_STATE
test.skip(!storageState, 'V2_SIGNUP_STORAGE_STATE(로그인된 storage state)가 없어서 건너뜀')
test.use({ storageState: storageState || undefined })

test('one screen: name, school, graduation year, three checks → four existing APIs in order → /account', async ({ page }) => {
  const writes: Array<{ path: string; body: unknown }> = []
  const school = { id: '00000000-0000-4000-8000-0000000000a1', slug: 'demo-seocho-high', school_name: '서초고등학교', school_type: 'high', sido: '서울', sigungu: '서초구' }

  await page.route('**/api/onboarding**', route => route.fulfill({ json: { state: { stage: 'adult_required', adultReady: false, consentsReady: false, profileReady: false, schoolReady: false, complete: false } } }))
  await page.route('**/rest/v1/rpc/search_schools_v2', route => route.fulfill({ json: [{ ...school, address: '', school_code: '', created_at: '' }] }))
  for (const path of ['eligibility', 'consents', 'profile', 'memberships']) {
    await page.route(`**/api/account/${path}`, async route => {
      writes.push({ path, body: route.request().postDataJSON() })
      await route.fulfill({ status: path === 'memberships' ? 201 : 200, json: {} })
    })
  }
  await page.route('**/account', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<p>account</p>' }))

  await page.goto('/onboarding')
  await page.getByRole('button', { name: '등록하고 출석부 보기' }).click()
  await expect(page.getByText('체크 3개를 모두 확인해 주세요.')).toBeVisible()
  expect(writes).toHaveLength(0)

  await page.getByLabel('출석부에 보일 이름').fill('김민수')
  await page.getByRole('combobox', { name: '학교' }).fill('서초')
  await page.getByRole('option', { name: /서초고등학교/ }).click()
  await page.getByLabel('졸업연도').selectOption('2008')
  await page.getByLabel('생년월일').fill('1990-03-01')
  for (const name of [/만 19세 이상 본인이에요/, /같은 학교 회원에게 보여요/, /이용약관/]) await page.getByRole('checkbox', { name }).check()
  await page.getByRole('button', { name: '등록하고 출석부 보기' }).click()

  await page.waitForURL('**/account')
  expect(writes.map(write => write.path)).toEqual(['eligibility', 'consents', 'profile', 'memberships'])
  expect(writes[3].body).toMatchObject({ school_id: school.id, graduation_year: 2008, show_in_school_roster: true })
})
