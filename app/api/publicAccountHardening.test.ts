import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {describe,expect,it} from 'vitest'

const source=(path:string)=>readFileSync(join(process.cwd(),path),'utf8')

describe('PHASE 10N-B application hardening',()=>{
  it('allows generic admin state changes only for closed, internal test, and emergency stop',()=>{
    const route=source('app/api/admin/public-account/route.ts')
    expect(route).toContain("z.enum(['closed','internal_test','emergency_stopped'])")
    expect(route).toContain("action:z.literal('record_readiness')")
    expect(route).toContain("action:z.literal('open')")
    expect(route).toContain("rpc('admin_open_public_account_launch'")
  })

  it('executes deletion as database preparation, Auth deletion, then finalization',()=>{
    const route=source('app/api/admin/public-account/route.ts')
    const prepare=route.indexOf("rpc('admin_prepare_public_account_deletion'")
    const begin=route.indexOf("rpc('admin_begin_public_account_auth_deletion'")
    const authDelete=route.indexOf('auth.admin.deleteUser')
    const finalize=route.indexOf("rpc('admin_finalize_public_account_auth_deletion'")
    expect(prepare).toBeGreaterThan(0)
    expect(prepare).toBeLessThan(begin)
    expect(begin).toBeLessThan(authDelete)
    expect(authDelete).toBeLessThan(finalize)
    expect(route).toContain("rpc('admin_mark_public_account_auth_deletion_failed'")
  })

  it('keeps Supabase email OTP routes dark under Google-only login policy',()=>{
    const request=source('app/api/auth/request-otp/route.ts')
    const verify=source('app/api/auth/verify-otp/route.ts')
    expect(request).toContain('status: 404')
    expect(verify).toContain('status: 404')
    expect(request + verify).not.toMatch(/signInWithOtp|verifyOtp/)
  })

  it('records school-search activity only when the actual results RPC runs',()=>{
    const page=source('app/search/page.tsx')
    const search=source('lib/api/search.ts')
    expect(page).not.toContain('school_search_started')
    expect(search).toContain("recordActivity ? 'search_schools_with_activity' : 'search_schools_v2'")
    expect(search).toContain('fetchSchoolsBySearchRpc(query, 20, true)')
    expect(search).toContain('fetchSchoolsBySearchRpc(query, AUTOCOMPLETE_RESULT_LIMIT)')
  })

  it('labels activity and milestone separately and enables open only from ready UI state',()=>{
    const consoleSource=source('app/admin/operations/PublicAccountConsole.tsx')
    expect(consoleSource).toContain("event_kind:'activity'|'milestone'")
    expect(consoleSource).toContain('activity는 요청 횟수, milestone은 계정별 최초 완료')
    expect(consoleSource).toContain("state.control.state!=='ready'")
  })

  it('requires the common emergency and deletion gate before public or beta account writes',()=>{
    const access=source('lib/publicAccountLaunch.ts')
    expect(access).toContain("client.rpc('public_account_access_active'")
    expect(access.indexOf("client.rpc('public_account_access_active'")).toBeLessThan(access.indexOf('hasPublicAccountFeatureAccess(client,feature)'))
    for(const name of ['eligibility','consents','profile','memberships']){
      expect(source(`app/api/account/${name}/route.ts`)).toContain('hasAccountOnboardingWriteAccess')
    }
  })

  it('describes actual deletion without unsupported legal-retention or tombstone claims',()=>{
    const account=source('app/account/AccountClient.tsx')
    expect(account).toContain('Auth identity 실제 삭제')
    expect(account).toContain('차단된 재시도 대기 상태')
    expect(account).not.toContain('법적 증빙 정책')
    expect(account).not.toContain('장기 차단 tombstone')
  })
})
