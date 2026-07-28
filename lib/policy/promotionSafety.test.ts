import { describe, expect, it } from 'vitest'
import { PromotionAccountSchema, PromotionRequestSchema, isInstagramProfileUrl, isPromotionTextSafe, isSafeHttpsUrl, isSafePromotionImageUrl } from './promotionSafety'

describe('PHASE 10D promotion safety', () => {
  it('Instagram profile URL만 소유 확인 대상으로 허용한다', () => {
    expect(isInstagramProfileUrl('https://www.instagram.com/schoollove.i')).toBe(true)
    expect(isInstagramProfileUrl('https://evil.example/instagram.com/user')).toBe(false)
    expect(isInstagramProfileUrl('http://instagram.com/user')).toBe(false)
  })
  it('내부·credential URL과 위험 문구·연락처를 차단한다', () => {
    expect(isSafeHttpsUrl('https://example.com/landing')).toBe(true)
    expect(isSafeHttpsUrl('https://127.0.0.1/admin')).toBe(false)
    expect(isSafeHttpsUrl('https://user:pass@example.com')).toBe(false)
    expect(isPromotionTextSafe('특정 사람 찾아드립니다')).toBe(false)
    expect(isPromotionTextSafe('문의 010-1234-5678')).toBe(false)
    expect(isPromotionTextSafe('성인 졸업생의 작은 브랜드 이야기')).toBe(true)
    expect(isSafePromotionImageUrl('https://images.unsplash.com/photo-1')).toBe(true)
    expect(isSafePromotionImageUrl('https://advertiser.example/image.jpg')).toBe(false)
  })
  it('개인/사업자 필수 필드를 분리한다', () => {
    expect(PromotionAccountSchema.safeParse({ account_type: 'personal', instagram_url: 'https://instagram.com/owner', display_name: '본인 활동' }).success).toBe(true)
    expect(PromotionAccountSchema.safeParse({ account_type: 'business', instagram_url: 'https://instagram.com/shop', display_name: '가게', business_name: '상호' }).success).toBe(false)
  })
  it('school/region 문맥과 권리·성인 확인을 강제한다', () => {
    const base = { account_id: '11111111-1111-4111-8111-111111111111', title: '오늘의 소개', body: '성인 본인의 활동을 소개합니다', image_url: 'https://images.unsplash.com/photo-a', landing_url: 'https://instagram.com/owner', requested_date: '2026-07-30', rights_confirmed: true, adult_and_ownership_confirmed: true }
    expect(PromotionRequestSchema.safeParse({ ...base, requested_placement: 'school_page' }).success).toBe(false)
    expect(PromotionRequestSchema.safeParse({ ...base, requested_placement: 'homepage_today' }).success).toBe(true)
  })
})
