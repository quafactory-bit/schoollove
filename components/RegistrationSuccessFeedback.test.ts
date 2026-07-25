import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { summarizeCreatedNames } from '@/app/submit/successFeedback'

const SOURCE = readFileSync(join(__dirname, 'RegistrationSuccessFeedback.tsx'), 'utf-8')

describe('RegistrationSuccessFeedback', () => {
  it('shows one or multiple server-confirmed names without inventing missing names', () => {
    expect(summarizeCreatedNames(['홍길동'], 1)).toBe('홍길동')
    expect(summarizeCreatedNames(['가', '나', '다'], 3)).toBe('가 · 나 · 다')
    expect(summarizeCreatedNames([], 2)).toBe('등록된 2명')
    expect(summarizeCreatedNames(['가', '나', '다', '라', '마'], 7)).toBe(
      '가 · 나 · 다 · 라 · 마 외 2명'
    )
  })

  it('links to the final School/Year/Class context and the existing Home growth feed', () => {
    expect(SOURCE).toContain('buildSchoolPath(context.schoolSlug)')
    expect(SOURCE).toContain('buildYearPath(context.schoolSlug, context.graduationYear)')
    expect(SOURCE).toContain('buildClassPath(')
    expect(SOURCE).toContain('href="/#growth-feed"')
  })

  it('keeps success, duplicate, and failed counts separate', () => {
    expect(SOURCE).toContain('이미 등록된 이름 {dup}명')
    expect(SOURCE).toContain('등록하지 못한 이름 {fail}명')
    expect(SOURCE).toContain('다른 이름 더 남기기')
  })

  it('keeps every next-step action at least 44px high', () => {
    expect(SOURCE.match(/min-h-11/g)?.length).toBeGreaterThanOrEqual(6)
  })

  it('uses the existing explicit white-text exception only for the dark primary action', () => {
    expect(SOURCE.match(/schoollove-dark-action/g)).toHaveLength(1)
  })
})
