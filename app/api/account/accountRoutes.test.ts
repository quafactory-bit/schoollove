import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const route = (name: string) => readFileSync(join(process.cwd(), `app/api/account/${name}/route.ts`), 'utf8')
const eligibility = route('eligibility')
const consents = route('consents')
const profile = route('profile')
const memberships = route('memberships')
const deletion = route('deletion-request')

describe('PHASE 10B account API boundaries', () => {
  it.each([
    ['eligibility', eligibility], ['consents', consents], ['profile', profile],
    ['memberships', memberships], ['deletion', deletion],
  ])('%s route는 body보다 먼저 session user를 검증한다', (_name, source) => {
    expect(source.indexOf('getAuthenticatedRequestContext(request)')).toBeLessThan(source.indexOf('request.json()'))
    expect(source).toContain("status: 401")
  })

  it('원본 생년월일을 DB payload나 로그에 저장하지 않는다', () => {
    expect(eligibility).toContain('dateOfBirth is used only in memory')
    const insertStart = eligibility.indexOf("from('adult_eligibility_records').insert")
    expect(eligibility.slice(insertStart)).not.toContain('dateOfBirth')
    expect(eligibility).not.toContain('console.log')
    expect(eligibility).toContain('getSupabaseAdmin()')
    expect(eligibility).not.toContain("auth.client.from('adult_eligibility_records').insert")
  })

  it('필수 동의 없이는 profile write를 거부한다', () => {
    expect(profile).toContain("rpc('has_current_adult_access'")
    expect(profile).toContain("status: 403")
  })

  it('위조 user_id를 신뢰하지 않고 검증된 session ID를 사용한다', () => {
    expect(profile).toContain('Any user_id supplied in the request body is ignored')
    expect(profile).toContain('owner_user_id: auth.user.id')
    expect(memberships).toContain('owner_user_id: auth.user.id')
    expect(deletion).toContain('user_id: auth.user.id')
  })

  it('다른 사용자의 row ID만으로 수정·삭제할 수 없다', () => {
    expect(profile).toMatch(/\.delete\(\)[\s\S]*\.eq\('owner_user_id', auth\.user\.id\)/)
    expect(memberships).toMatch(/\.eq\('id', parsed\.data\.membership_id\)[\s\S]*\.eq\('owner_user_id', auth\.user\.id\)/)
  })
})
