import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getAccessTokenExpiry, shouldRefreshUserSession } from './user-auth'

const source = readFileSync(join(process.cwd(), 'lib/user-auth.ts'), 'utf8')

describe('user auth server boundary', () => {
  it('access/refresh token은 httpOnly, SameSite=Lax cookie로만 저장한다', () => {
    expect(source).toMatch(/USER_ACCESS_COOKIE[\s\S]*httpOnly: true[\s\S]*sameSite: 'lax'/)
    expect(source).toMatch(/USER_REFRESH_COOKIE[\s\S]*httpOnly: true[\s\S]*sameSite: 'lax'/)
  })

  it('서버가 getUser로 access token을 검증한다', () => {
    expect(source).toContain('client.auth.getUser(accessToken)')
    expect(source).toMatch(/account_deletion_requests[\s\S]*\.neq\('status', 'rejected'\)/)
    expect(source).not.toContain('getSession()')
  })

  it('logout은 access/refresh session을 복원한 뒤 provider global sign-out을 요청한다', () => {
    expect(source).toMatch(/revokeUserSession[\s\S]*auth\.setSession\([\s\S]*access_token[\s\S]*refresh_token/)
    expect(source).toContain("auth.signOut({ scope: 'global' })")
  })

  it('service-role client를 사용하지 않는다', () => {
    expect(source).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|getSupabaseAdmin/)
  })

  it('만료·60초 이내 access token만 refresh 대상으로 판정한다', () => {
    const jwt=(exp:number)=>`header.${Buffer.from(JSON.stringify({exp})).toString('base64url')}.signature`
    expect(getAccessTokenExpiry(jwt(2_000))).toBe(2_000)
    expect(shouldRefreshUserSession(jwt(2_000),'refresh',1_000)).toBe(false)
    expect(shouldRefreshUserSession(jwt(1_050),'refresh',1_000)).toBe(true)
    expect(shouldRefreshUserSession(undefined,'refresh',1_000)).toBe(true)
    expect(shouldRefreshUserSession(jwt(900),undefined,1_000)).toBe(false)
  })

  it('refresh 성공은 회전된 두 token을 cookie helper로 교체하고 실패는 두 cookie를 지운다',()=>{
    expect(source).toContain('auth.refreshSession({ refresh_token: refreshToken })')
    expect(source).toMatch(/setUserSessionCookies[\s\S]*session\.access_token[\s\S]*session\.refresh_token/)
    expect(source).toMatch(/clearUserSessionCookies[\s\S]*maxAge: 0[\s\S]*maxAge: 0/)
  })
})
