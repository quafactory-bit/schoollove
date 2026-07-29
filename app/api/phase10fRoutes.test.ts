import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source=(path:string)=>readFileSync(join(process.cwd(),path),'utf8')

describe('PHASE 10F route boundaries',()=>{
  it('gates private profile, connection, and promotion feature writes',()=>{
    expect(source('app/api/account/profile/route.ts')).toContain("'private_profile'")
    expect(source('app/api/account/memberships/route.ts')).toContain("'private_profile'")
    expect(source('lib/api/connectionRoute.ts')).toContain("search: ['people_search']")
    expect(source('lib/api/connectionRoute.ts')).toContain("request: ['people_search','connection_request']")
    expect(source('lib/api/connectionRoute.ts')).toContain("message: ['messaging']")
    for(const path of [
      'app/api/promotions/accounts/route.ts','app/api/promotions/accounts/[id]/verification/route.ts',
      'app/api/promotions/requests/route.ts','app/api/promotions/requests/[id]/route.ts',
    ]) expect(source(path)).toContain("'promotion_application'")
    for(const path of ['app/api/promotion-operations/route.ts','app/api/promotion-operations/reports.csv/route.ts'])
      expect(source(path)).toContain("'promotion_operations'")
  })

  it('keeps cron and operational health behind separate secrets',()=>{
    const cron=source('app/api/cron/operations/route.ts')
    expect(cron).toContain('process.env.CRON_SECRET')
    expect(cron).toContain('timingSafeEqual')
    expect(cron).not.toContain('console.log')
    expect(source('app/api/health/operations/route.ts')).toContain('requireAdminSession')
    expect(source('app/api/admin/operations/route.ts')).toContain('requireAdminSession')
  })

  it('exports only the owner scope and excludes counterpart identifiers',()=>{
    const exportSource=source('lib/dataExport.ts')
    expect(exportSource).toContain(".eq('owner_user_id',userId)")
    expect(exportSource).toContain(".eq('sender_user_id',userId)")
    expect(exportSource).not.toMatch(/receiver_user_id|user_low_id\s*,|user_high_id\s*,|instagram_handle.*connection/i)
    expect(exportSource).toContain('adult_verified_at')
    expect(exportSource).toContain('consented_at')
    expect(exportSource).toContain('promotion_commercial_orders')
    expect(exportSource).toContain('promotion_performance_reports')
    expect(source('app/api/account/export/route.ts')).toContain("'cache-control':'private, no-store'")
    expect(source('app/api/account/export/[id]/route.ts')).toContain("'cache-control':'private, no-store'")
  })

  it('uses a strict same-site administrator session cookie',()=>{
    expect(source('app/api/admin/auth/route.ts')).toContain("sameSite: 'strict'")
  })

  it('checks KST future graduation years before database access',()=>{
    const memberships=source('app/api/account/memberships/route.ts')
    expect(memberships.indexOf('isFutureGraduationYear')).toBeLessThan(memberships.indexOf("from('private_profiles')"))
  })
})
