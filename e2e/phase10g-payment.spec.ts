import { expect, test } from '@playwright/test'

test('payment APIs and private pages fail closed without a session or provider credentials', async ({ page, request }) => {
  const owner = await request.get('/api/payments')
  expect(owner.status()).toBe(401)
  expect(owner.headers()['cache-control']).toContain('no-store')

  const admin = await request.get('/api/admin/payments')
  expect(admin.status()).toBe(401)

  const webhook = await request.post('/api/payments/webhooks/portone', {
    headers: { 'content-type': 'application/json', 'webhook-id': 'msg_test_123456', 'webhook-timestamp': `${Math.floor(Date.now()/1000)}`, 'webhook-signature': 'v1,invalid' },
    data: { type: 'Transaction.Paid', timestamp: new Date().toISOString(), data: { paymentId: 'slp_test_123456' } },
  })
  expect([401,503]).toContain(webhook.status())

  await page.goto('/promote/operations/payment?paymentId=slp_test_123456')
  await expect(page).toHaveURL(/\/login/)
  const robots = await page.locator('meta[name="robots"]').getAttribute('content')
  expect(robots).toContain('noindex')
  expect(robots).toContain('noarchive')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
