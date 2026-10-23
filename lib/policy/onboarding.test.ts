import { describe, expect, it } from 'vitest'
import { OnboardingQuerySchema } from './onboarding'
import { buildSignupSteps, signupFormErrors, type SignupForm } from './signup'

describe('limited launch onboarding policy', () => {
  it('allows only coarse non-identifying acquisition sources', () => {
    expect(OnboardingQuerySchema.parse({ source: 'organic_social' })).toEqual({ source: 'organic_social' })
    expect(OnboardingQuerySchema.safeParse({ source: 'instagram:@person' }).success).toBe(false)
  })
})

describe('v2-05 single-screen signup', () => {
  const now = new Date('2026-06-01T03:00:00.000Z')
  const fresh = { adultReady: false, consentsReady: false, profileReady: false, schoolReady: false }
  const form: SignupForm = {
    displayName: ' 김민수 ', birthDate: '1990-03-01', schoolId: '00000000-0000-4000-8000-000000000002',
    schoolType: 'high', graduationYear: '2008', checks: { adult: true, roster: true, terms: true },
  }

  it('accepts a complete form', () => {
    expect(signupFormErrors(form, fresh, now)).toEqual([])
  })

  it.each([
    [{ adult: false, roster: true, terms: true }],
    [{ adult: true, roster: false, terms: true }],
    [{ adult: true, roster: true, terms: false }],
  ])('blocks submit until all three checks are on: %j', checks => {
    expect(signupFormErrors({ ...form, checks }, fresh, now)).toContain('체크 3개를 모두 확인해 주세요.')
  })

  it('rejects graduation years outside the 02 range (current students)', () => {
    expect(signupFormErrors({ ...form, graduationYear: '2026' }, fresh, now)).toContain('졸업연도를 선택해 주세요. 재학 중인 학교는 등록할 수 없어요.')
    expect(signupFormErrors({ ...form, schoolType: 'middle', graduationYear: '2023' }, fresh, now)).toHaveLength(1)
    expect(signupFormErrors({ ...form, schoolType: 'middle', graduationYear: '2022' }, fresh, now)).toEqual([])
  })

  it('requires a name and birth date only for steps that are not done yet', () => {
    expect(signupFormErrors({ ...form, displayName: '김', birthDate: '' }, fresh, now)).toHaveLength(2)
    expect(signupFormErrors({ ...form, displayName: '', birthDate: '' }, { ...fresh, adultReady: true, profileReady: true }, now)).toEqual([])
  })

  it('calls the existing four APIs in order and always turns the roster on', () => {
    const steps = buildSignupSteps(form, fresh, [{ grade_number: 3, class_number: 2 }], { source: 'threads' })
    expect(steps.map(step => step.endpoint)).toEqual(['/api/account/eligibility', '/api/account/consents', '/api/account/profile', '/api/account/memberships'])
    expect(steps[1].payload).toEqual({ terms: true, privacy_collection: true, adult_confirmation: true, private_by_default: true })
    expect(steps[2].payload).toEqual({ display_name: '김민수', sl_first_touch: { source: 'threads' } })
    expect(steps[3].payload).toEqual({ school_id: form.schoolId, graduation_year: 2008, grade_classes: [{ grade_number: 3, class_number: 2 }], show_in_school_roster: true })
  })

  it('skips steps already completed so a failed submit can be retried', () => {
    const steps = buildSignupSteps(form, { adultReady: true, consentsReady: true, profileReady: false, schoolReady: false }, [], null)
    expect(steps.map(step => step.key)).toEqual(['profile', 'membership'])
  })
})
