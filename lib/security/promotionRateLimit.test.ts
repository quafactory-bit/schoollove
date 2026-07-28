import { describe, expect, it } from 'vitest'
import { getPromotionRequestIp } from './promotionRateLimit'

describe('PHASE 10D promotion rate-limit identity', () => {
  it('uses proxy headers without exposing them to callers', () => {
    expect(getPromotionRequestIp(new Request('https://example.com', { headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' } }))).toBe('203.0.113.7')
    expect(getPromotionRequestIp(new Request('https://example.com'))).toBe('unknown')
  })
})
