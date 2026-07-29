import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (name: string) => fs.readFileSync(path.join(process.cwd(), name), 'utf8')

describe('PHASE 10G route boundaries', () => {
  it('keeps owner payments authenticated, beta-gated, adult-only and no-store', () => {
    const route = source('app/api/payments/route.ts')
    expect(route).toContain('getAuthenticatedRequestContext')
    expect(route).toContain('hasBetaFeatureAccess')
    expect(route).toContain('has_current_adult_access')
    expect(route).toContain('no-store')
  })

  it('verifies the raw webhook body before parsing or processing', () => {
    const route = source('app/api/payments/webhooks/portone/route.ts')
    const service = source('lib/paymentOperations.ts')
    expect(route).toContain('await request.text()')
    expect(route).not.toContain('request.json()')
    expect(service.indexOf('verifyWebhookSignature')).toBeLessThan(service.indexOf('parseWebhook'))
    expect(service).toContain('register_payment_webhook_event')
    expect(service).toContain('confirm_verified_payment')
  })

  it('protects admin payment operations and private SEO', () => {
    expect(source('app/api/admin/payments/route.ts')).toContain('requireAdminSession')
    const paymentPage = source('app/promote/operations/payment/page.tsx')
    expect(paymentPage).toContain('getAuthenticatedServerContext()')
    expect(paymentPage).toContain("redirect('/login?next=/promote/operations/payment')")
    expect(paymentPage).toContain('adultEligible')
    expect(paymentPage).toContain('consentsComplete')
    const pages = source('app/admin/payments/page.tsx') + paymentPage
    expect(pages.match(/index: false/g)?.length).toBe(2)
    expect(pages.match(/noarchive: true/g)?.length).toBe(2)
  })

  it('does not expose secrets or store raw financial identity', () => {
    const service = source('lib/paymentOperations.ts')
    const migration = source('supabase/migrations/20260729130000_payment_provider_sandbox.sql')
    expect(service).not.toMatch(/console\.(log|error)|process\.env\.[A-Z_]+\s*\}/)
    expect(migration).not.toMatch(/card_number|account_number|buyer_email|buyer_phone|raw_payload/i)
  })
})
