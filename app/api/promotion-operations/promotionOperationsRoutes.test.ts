import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('PHASE 10E API and private page boundaries', () => {
  it('uses session identity, adult access, rate limiting, and never trusts owner ids', () => {
    const route = source('app/api/promotion-operations/route.ts')
    expect(route).toContain('getAuthenticatedRequestContext')
    expect(route).toContain('has_current_adult_access')
    expect(route).toContain('checkPromotionRateLimit')
    expect(route).not.toMatch(/body\.owner_user_id/)
  })

  it('requires administrator session inside both admin export and mutation routes', () => {
    for (const path of ['app/api/admin/promotion-operations/route.ts', 'app/api/admin/promotion-operations/calendar.csv/route.ts']) {
      const route = source(path)
      expect(route).toContain('verifySessionToken')
      expect(route).toContain("status: 401")
    }
  })

  it('authorizes owner report export and applies private noarchive metadata', () => {
    expect(source('app/api/promotion-operations/reports.csv/route.ts')).toContain('getAuthenticatedRequestContext')
    for (const path of ['app/promote/operations/page.tsx', 'app/admin/promotion-operations/page.tsx']) {
      expect(source(path)).toContain('robots: { index: false, follow: false, nocache: true, noarchive: true }')
    }
  })

  it('keeps operational routes out of the public sitemap', () => {
    const sitemap = source('app/sitemap.ts')
    expect(sitemap).not.toMatch(/promote\/operations|promotion-operations/)
  })
})
