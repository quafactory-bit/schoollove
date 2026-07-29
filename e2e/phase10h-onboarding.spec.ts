import { expect, test } from '@playwright/test'

test('limited launch onboarding fails closed without a session', async ({ page, request }) => {
  const api=await request.get('/api/onboarding?source=direct')
  expect(api.status()).toBe(401)
  expect(api.headers()['cache-control']).toContain('no-store')

  const invalid=await request.get('/api/onboarding?source=instagram%3A%40person')
  expect(invalid.status()).toBe(401)

  await page.goto('/onboarding')
  await expect(page).toHaveURL(/\/login\?next=\/onboarding/)
  const robots=await page.locator('meta[name="robots"]').getAttribute('content')
  expect(robots).toContain('noindex')
  expect(robots).toContain('noarchive')
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
})

test('limited launch admin funnel remains private', async ({ request }) => {
  const response=await request.get('/api/admin/operations')
  expect(response.status()).toBe(401)
})
