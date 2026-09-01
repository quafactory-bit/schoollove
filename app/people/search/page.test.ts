import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SOURCE = readFileSync(join(__dirname, 'page.tsx'), 'utf8')

describe('/people/search remains dormant and fail-closed', () => {
  it('인증, people_search beta authority, public account active를 모두 요구한다', () => {
    expect(SOURCE).toContain('getAuthenticatedServerContext()')
    expect(SOURCE).toContain("if (!auth) redirect('/login?next=/people/search')")
    expect(SOURCE).toContain("hasBetaFeatureAccess(auth.client,auth.user.id,'people_search')")
    expect(SOURCE).toContain('hasPublicAccountAccessActive(auth.client,auth.user.id)')
    expect(SOURCE).toContain("redirect('/account')")
  })
})
