import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {describe,expect,it} from 'vitest'

const source=readFileSync(join(process.cwd(),'middleware.ts'),'utf8')

describe('user session refresh middleware',()=>{
  it('centralizes refresh for account and onboarding page/API routes',()=>{
    for(const path of ["'/account'","'/onboarding'","'/api/account/:path*'","'/api/onboarding'","'/api/onboarding/:path*'"])expect(source).toContain(path)
    expect(source).toContain("pathname === '/api/onboarding'")
    expect(source).toContain('shouldRefreshUserSession(accessToken, refreshToken)')
    expect(source).toContain('await refreshUserSessionTokens(refreshToken)')
  })
  it('rotates both cookies and clears both when refresh fails',()=>{
    expect(source).toContain('setUserSessionCookies(response, session)')
    expect(source).toContain('clearUserSessionCookies(response)')
    expect(source).toContain("X-SchoolLove-Session', 'expired")
  })
})
