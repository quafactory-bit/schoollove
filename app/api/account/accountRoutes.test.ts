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
    const insertStart = eligibility.indexOf("rpc('admin_complete_own_adult_eligibility'")
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
    expect(profile).toContain("rpc('upsert_own_private_profile'")
    expect(profile).not.toMatch(/owner_user_id\s*:/)
    expect(memberships).toContain("rpc('add_own_school_membership_with_class_history'")
    expect(memberships).toContain('requested_grade_classes: parsed.data.grade_classes')
    expect(memberships).not.toMatch(/owner_user_id\s*:/)
    expect(memberships).not.toMatch(/profile_id\s*:/)
    expect(memberships).not.toMatch(/school_type\s*:/)
    expect(deletion).toContain("rpc('request_own_account_deletion'")
    expect(deletion).not.toMatch(/user_id\s*:/)
  })

  it('다른 사용자의 row ID만으로 수정·삭제할 수 없다', () => {
    expect(profile).toContain("rpc('delete_own_private_profile'")
    expect(memberships).toContain("rpc('delete_own_school_membership'")
    expect(memberships).toContain('target_membership_id: parsed.data.membership_id')
  })

  it('학교 저장은 strict grade_classes payload만 받고 legacy 단일 반을 받지 않는다', () => {
    expect(memberships).toContain('grade_classes: z.array(GradeClassSchema).max(6)')
    expect(memberships).toContain("message: 'duplicate grade'")
    expect(memberships).toContain('}).strict()')
    expect(memberships).not.toContain('requested_class_number')
    expect(memberships).not.toContain('class_number: z.number().int().min(1).max(100).nullable()')
  })

  it('public soft launch와 controlled beta를 분리된 server access 경로로 평가한다',()=>{
    for(const source of [eligibility,consents,profile,memberships]){
      expect(source).toContain('hasAccountOnboardingWriteAccess')
    }
    expect(eligibility).toContain("'adult_eligibility'")
    expect(consents).toContain("'required_consents'")
    expect(profile).toContain("'private_profile'")
    expect(memberships).toContain("'school_membership'")
    expect(profile).not.toContain('LIMITED_BETA_ACCESS_REQUIRED')
    expect(memberships).toContain('getSafeMembershipError')
  })

  it('성인·동의 제출과 탈퇴 요청은 idempotent하고 개인 원문을 저장하지 않는다',()=>{
    expect(eligibility).toContain("rpc('admin_complete_own_adult_eligibility'")
    expect(consents).toContain("rpc('record_own_required_consents'")
    expect(deletion).toContain("rpc('request_own_account_deletion')")
    expect(deletion).not.toContain('request_reason')
    expect(deletion).toContain("z.object({ confirm: z.literal(true) }).strict()")
  })
})
