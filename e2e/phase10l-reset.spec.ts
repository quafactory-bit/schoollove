import { expect, test } from '@playwright/test'

test('legacy public person writes and direct person surfaces remain closed', async ({ page, request }) => {
  const profileWrite = await request.post('/api/profiles', { data: {} })
  expect(profileWrite.status()).toBe(503)
  expect(await profileWrite.json()).toMatchObject({
    code: 'PROFILE_REGISTRATION_TEMPORARILY_DISABLED',
  })

  for (const path of ['/api/traces', '/api/reports']) {
    const response = await request.post(path, { data: {} })
    expect(response.status(), path).toBeGreaterThanOrEqual(400)
    expect(response.status(), path).toBeLessThan(600)
    expect(await response.text(), path).not.toMatch(/nickname|instagram_id|message/i)
  }

  await page.goto('/people/search')
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/i)

  await page.goto('/account')
  await expect(page).toHaveURL(/\/login(?:\?|$)/)
})

test('public sitemap contains no person, profile, year, or class URLs', async ({ request }) => {
  const response = await request.get('/sitemap.xml')
  expect(response.ok()).toBe(true)
  const body = await response.text()
  expect(body).not.toMatch(/\/profiles?(?:\/|<)/i)
  expect(body).not.toMatch(/\/people(?:\/|<)/i)
  expect(body).not.toMatch(/\/school\/[^<]+\/\d{4}(?:\/|<)/i)
})
