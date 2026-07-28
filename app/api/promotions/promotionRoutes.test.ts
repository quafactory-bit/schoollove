import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const route = (name: string) => readFileSync(new URL(name, import.meta.url), 'utf8')

describe('PHASE 10D promotion API boundaries', () => {
  it('requires a verified user and adult access for account and request creation', () => {
    for (const source of [route('./accounts/route.ts'), route('./accounts/[id]/verification/route.ts'), route('./requests/route.ts')]) {
      expect(source).toContain('getAuthenticatedRequestContext')
      expect(source).toContain("status: 401")
      expect(source).toContain("has_current_adult_access")
      expect(source).toContain("status: 403")
    }
  })

  it('never accepts an owner id from the applicant body', () => {
    expect(route('./accounts/route.ts')).not.toMatch(/body\.owner_user_id/)
    expect(route('./requests/route.ts')).not.toMatch(/body\.owner_user_id/)
  })

  it('does not put raw IP or user agent in a database call', () => {
    const source = route('./impression/route.ts')
    expect(source).toContain('makeMetricSessionHash')
    expect(source).not.toMatch(/from\(['"]promotion_impressions/)
  })

  it('resolves clicks server-side and rejects non-HTTPS destinations', () => {
    const source = route('./click/[id]/route.ts')
    expect(source).toContain('resolvePromotionClick')
    expect(source).toContain('isSafeHttpsUrl')
    expect(source).toContain('NextResponse.redirect')
  })

  it('proxies approved images with type and size limits', () => {
    const source = route('./image/[kind]/[id]/route.ts')
    expect(source).toContain('resolvePromotionImage')
    expect(source).toContain('isSafePromotionImageUrl')
    expect(source).toContain('5_000_000')
    expect(source).toContain("X-Content-Type-Options")
  })

  it('uses the same image host allowlist for revisions as for new requests', () => {
    const source = route('./requests/[id]/route.ts')
    expect(source).toContain('isSafePromotionImageUrl')
    expect(source).toContain('refine(isSafePromotionImageUrl)')
  })
})
