import { describe, expect, it } from 'vitest'
import { PromotionAdminOperationSchema, PromotionOwnerOperationSchema, PromotionProductSchema } from './promotionOperations'

const product = {
  product_code: 'home_7d', name: '홈 7일', description: '홈에서 일주일 동안 노출하는 상품', placement_type: 'homepage_today',
  duration_days: 7, image_width: 1080, image_height: 1080, title_limit: 80, body_limit: 300,
  base_price_krw: 50000, vat_display_mode: 'included', allows_school_targeting: false, allows_region_targeting: false,
  sale_status: 'active', price_policy_version: '2026.07.1',
}

describe('PHASE 10E operation validation', () => {
  it('accepts administrator catalog pricing but not mismatched targeting', () => {
    expect(PromotionProductSchema.safeParse(product).success).toBe(true)
    expect(PromotionProductSchema.safeParse({ ...product, allows_school_targeting: true }).success).toBe(false)
    expect(PromotionAdminOperationSchema.safeParse({ action: 'upsert_product', product }).success).toBe(true)
  })

  it('requires a replay-resistant key for owner mutations', () => {
    expect(PromotionOwnerOperationSchema.safeParse({ action: 'quote_response', quote_id: crypto.randomUUID(), response: 'accept', idempotency_key: 'web-123' }).success).toBe(false)
    expect(PromotionOwnerOperationSchema.safeParse({ action: 'quote_response', quote_id: crypto.randomUUID(), response: 'accept', idempotency_key: 'web-1234567890123456' }).success).toBe(true)
  })

  it('does not accept owner identity, financial account, card, or provider secret fields', () => {
    const parsed = PromotionOwnerOperationSchema.safeParse({ action: 'payment_notice', order_id: crypto.randomUUID(), declared_amount_krw: 50000, idempotency_key: 'web-1234567890123456', owner_user_id: crypto.randomUUID(), account_number: 'secret' })
    expect(parsed.success).toBe(false)
  })
})
