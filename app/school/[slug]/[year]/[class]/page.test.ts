import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE = readFileSync(join(__dirname, 'page.tsx'), 'utf8')

describe('Class route emergency privacy boundary', () => {
  it('개인 행·Instagram·반 인원을 조회하거나 렌더하지 않는다', () => {
    expect(SOURCE).not.toMatch(/getProfilesByClass|getClassProfileCount|ProfileCard|instagram|nickname|formatNumber/)
    expect(SOURCE).toContain('<PrivacyTransitionNotice')
  })

  it('noindex/nofollow/noarchive 공통 정책을 사용한다', () => {
    expect(SOURCE).toContain("robots: getPublicRouteRobots('class')")
  })
})
