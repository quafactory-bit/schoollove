import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const client = readFileSync('app/onboarding/OnboardingClient.tsx', 'utf8')
const account = readFileSync('app/account/page.tsx', 'utf8')
const accountClient = readFileSync('app/account/AccountClient.tsx', 'utf8')

describe('v2-05 single-screen signup contract', () => {
  it('collects everything on one screen and submits through the existing APIs only', () => {
    expect(client).toContain('buildSignupSteps(form, progress')
    expect(client).toContain('signupFormErrors(form, progress)')
    expect(client).toContain('등록하고 출석부 보기')
    expect(client).toContain('출석부에 보일 이름')
    expect(client).toContain('반 입력 (선택)')
    expect(client).not.toMatch(/supabase|rpc\(/)
  })

  it('shows the three checks, the collection notice and the 02 graduation-year range', () => {
    expect(client).toContain('만 19세 이상 본인이에요')
    expect(client).toContain('이름·졸업연도가 같은 학교 회원에게 보여요. 언제든 숨길 수 있어요.')
    expect(client).toContain('<CollectionNotice />')
    expect(client).toContain('graduationYearRange(school.school_type)')
    expect(client).toContain('graduationYearRangeNotice(school.school_type)')
  })

  it('keeps the date-of-birth adult check (not stored) and never auto-fills the Google name', () => {
    expect(client).toContain('type="date"')
    expect(client).toContain('저장하지 않아요')
    expect(client).not.toMatch(/user_metadata|full_name|given_name/)
  })

  it('sends unfinished public-account users from /account to /onboarding, but not during deletion', () => {
    expect(account).toContain("if (launch.state === 'open' && !state.deletionStatus && signupIncomplete) redirect('/onboarding')")
  })

  it('removes the welcome guide from the account screen (moved to v1)', () => {
    expect(accountClient).not.toContain('AccountWelcomeGuide')
    expect(existsSync('components/account/AccountWelcomeGuide.tsx')).toBe(false)
    expect(existsSync('components/v1/account/AccountWelcomeGuide.tsx')).toBe(true)
  })
})
