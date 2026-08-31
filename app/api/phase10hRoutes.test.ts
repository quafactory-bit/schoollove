import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source=(path:string)=>readFileSync(join(process.cwd(),path),'utf8')

describe('PHASE 10H route boundaries',()=>{
  it('keeps onboarding authenticated, private and no-store',()=>{
    const route=source('app/api/onboarding/route.ts')
    const page=source('app/onboarding/page.tsx')
    expect(route).toContain('getAuthenticatedRequestContext')
    expect(route).toContain("'Cache-Control': 'private, no-store, max-age=0'")
    expect(page).toContain('getAuthenticatedServerContext')
    expect(page).toContain("redirect('/login?next=/onboarding')")
    expect(page).toContain('noarchive:true')
  })

  it('accepts only coarse sources and never raw attribution',()=>{
    const policy=source('lib/policy/onboarding.ts')
    expect(policy).toContain("'organic_social'")
    expect(policy).toContain("'paid_social'")
    expect(policy).not.toMatch(/utm_|referrer|instagram_handle|search_query/i)
  })

  it('keeps aggregate telemetry from failing primary user writes',()=>{
    const helper=source('lib/onboarding.ts')
    expect(helper).toContain('syncOnboardingProgressSafely')
    expect(helper).toContain('catch { return null }')
    expect(helper).not.toMatch(/console\.(log|error)/)
    for(const path of ['app/api/account/profile/route.ts','app/api/account/memberships/route.ts']) {
      const route=source(path)
      expect(route).toContain('if (error) return NextResponse.json')
      expect(route).toContain('syncOnboardingProgressSafely')
      expect(route).not.toContain('recordPublicAccountEvent')
      expect(route).toMatch(/rpc\('(upsert_own_private_profile|add_own_school_membership_with_class_history)'/)
    }
  })

  it('keeps funnel data behind the existing administrator boundary',()=>{
    expect(source('app/api/admin/operations/route.ts')).toContain('requireAdminSession')
    expect(source('lib/beta.ts')).toContain('getLimitedLaunchAdminState')
    expect(source('app/admin/operations/OperationsClient.tsx')).toContain('개인 원문 없이')
  })

  it('pins login to the fixed first-party Google start route',()=>{
    const login=source('app/login/page.tsx')
    const googleStart=source('app/auth/social/start/google/route.ts')
    const socialComplete=source('app/auth/social/complete/SocialCompleteClient.tsx')
    expect(login).toContain('href="/auth/social/start/google"')
    expect(login).not.toMatch(/safeLoginDestination|redirect_to|provider=/)
    expect(googleStart).toContain("destination.searchParams.set('provider', 'custom:schoollove-google')")
    expect(googleStart).toContain("destination.searchParams.set('redirect_to', config.completionRoute)")
    expect(googleStart).toContain('new URL(request.url).origin !== config.issuer')
    expect(googleStart).not.toMatch(/headers\.get|searchParams\.get/)
    expect(socialComplete).toContain("result.redirect !== '/account'")
    expect(socialComplete).toContain("window.location.replace('/account')")
    expect(source('lib/policy/onboarding.ts')).not.toContain('safeLoginDestination')
  })

  it('chains people-search shutdown into greeting creation without blocking safety actions',()=>{
    const boundary=source('lib/api/connectionRoute.ts')
    expect(boundary).toContain("request: ['people_search','connection_request']")
    expect(boundary).toContain("response: ['people_search','connection_request']")
    const safety=source('app/api/connections/[id]/route.ts')
    expect(safety.match(/requireConnectionContext\(request, 'response', \[\]\)/g)?.length).toBe(2)
  })

  it('requires messaging access for reading and writing an existing conversation',()=>{
    const messages=source('app/api/connections/[id]/messages/route.ts')
    expect(messages.match(/requireConnectionContext\(request, 'message'\)/g)?.length).toBe(3)
  })
})
