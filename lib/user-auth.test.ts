import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'lib/user-auth.ts'), 'utf8')

describe('user auth server boundary', () => {
  it('access/refresh token은 httpOnly, SameSite=Lax cookie로만 저장한다', () => {
    expect(source).toMatch(/USER_ACCESS_COOKIE[\s\S]*httpOnly: true[\s\S]*sameSite: 'lax'/)
    expect(source).toMatch(/USER_REFRESH_COOKIE[\s\S]*httpOnly: true[\s\S]*sameSite: 'lax'/)
  })

  it('서버가 getUser로 access token을 검증한다', () => {
    expect(source).toContain('client.auth.getUser(accessToken)')
    expect(source).not.toContain('getSession()')
  })

  it('logout은 access/refresh session을 복원한 뒤 provider global sign-out을 요청한다', () => {
    expect(source).toMatch(/revokeUserSession[\s\S]*auth\.setSession\([\s\S]*access_token[\s\S]*refresh_token/)
    expect(source).toContain("auth.signOut({ scope: 'global' })")
  })

  it('service-role client를 사용하지 않는다', () => {
    expect(source).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|getSupabaseAdmin/)
  })
})
