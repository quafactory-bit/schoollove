import { expect, test } from '@playwright/test'

const restBase = 'http://127.0.0.1:3211/rest/v1'
const anonKey = process.env.PHASE10L_E2E_ANON_KEY || ''
const anonHeaders = { apikey: anonKey, Authorization: `Bearer ${anonKey}` }

test('home, school search, and school hub use the reset database', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('main')).toBeVisible()

  await page.goto('/search')
  const search = page.getByRole('combobox')
  await search.fill('TEST School 1')
  await search.press('Enter')
  await expect(page.getByText('TEST School 1', { exact: true }).first()).toBeVisible()

  await page.goto('/school/phase10l-school-1')
  await expect(page.locator('main')).toContainText('TEST School 1')
  await expect(page.locator('body')).not.toContainText('TEST LEGACY')
})

test('person surfaces are non-public and old profile URLs do not resolve', async ({ page, request }) => {
  await page.goto('/people/search')
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/i)
  await expect(page.locator('body')).not.toContainText('TEST LEGACY')

  const oldProfile = await request.get('/profile/05b80d88-7cae-f903-0ba4-a9b309393d0e')
  expect(oldProfile.status()).toBe(404)

  await page.goto('/account')
  await expect(page).toHaveURL(/\/login(?:\?|$)/)
})

test('school baseline remains 10,006 and public person writes are denied', async ({ request }) => {
  const schools = await request.get(`${restBase}/schools?select=id&limit=1`, {
    headers: { ...anonHeaders, Prefer: 'count=exact', Range: '0-0' },
  })
  expect(schools.ok()).toBe(true)
  expect(schools.headers()['content-range']).toMatch(/\/10006$/)

  for (const table of ['profiles', 'reports', 'traces', 'search_logs']) {
    const response = await request.post(`${restBase}/${table}`, {
      headers: { ...anonHeaders, 'content-type': 'application/json' },
      data: {},
    })
    expect([401, 403], `${table} write status`).toContain(response.status())
  }
})

test('application legacy write routes fail closed before reading payloads', async ({ request }) => {
  const profileWrite = await request.post('/api/profiles', { data: {} })
  expect(profileWrite.status()).toBe(503)
  expect(await profileWrite.json()).toMatchObject({
    code: 'PROFILE_REGISTRATION_TEMPORARILY_DISABLED',
  })

  const expected = new Map([
    ['/api/traces', 'LEGACY_TRACE_WRITE_PERMANENTLY_DISABLED'],
    ['/api/reports', 'LEGACY_REPORT_WRITE_PERMANENTLY_DISABLED'],
  ])
  for (const [path, code] of expected) {
    const response = await request.post(path, { data: {} })
    expect(response.status(), path).toBe(503)
    expect(await response.json(), path).toMatchObject({ code })
  }
})

test('sitemap contains schools but no person, profile, year, or class URLs', async ({ request }) => {
  const response = await request.get('/sitemap.xml')
  expect(response.ok()).toBe(true)
  const body = await response.text()
  expect(body).toContain('/school/phase10l-school-1')
  expect(body).not.toMatch(/\/profiles?(?:\/|<)/i)
  expect(body).not.toMatch(/\/people(?:\/|<)/i)
  expect(body).not.toMatch(/\/school\/[^<]+\/\d{4}(?:\/|<)/i)
})
