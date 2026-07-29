import { expect, test } from '@playwright/test'

test('public safety boundary and private-route indexing remain closed', async ({ page, request }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/스쿨러브아이/)

  const registration = await request.post('/api/profiles', { data: { anything:'ignored-before-parse' } })
  expect(registration.status()).toBe(503)
  expect(await registration.json()).toMatchObject({ code:'PROFILE_REGISTRATION_TEMPORARILY_DISABLED' })

  for (const path of ['/api/admin/operations','/api/health/operations','/api/cron/operations']) {
    const response = await request.get(path)
    expect(response.status(),path).toBe(401)
  }

  await page.goto('/people/search')
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content',/noindex/i)
})

test('account page does not disclose a private profile without a session', async ({ page }) => {
  await page.goto('/account')
  await expect(page).toHaveURL(/\/login(?:\?|$)/)
})
