import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'app/people/search/PeopleSearchClient.tsx'), 'utf8')

describe('same-class exact discovery UI', () => {
  it('keeps legacy exact fields available and makes class fields opt-in K12-only', () => {
    expect(source).toContain('sameClassAvailable')
    expect(source).toContain("schoolType === 'elementary' || schoolType === 'middle' || schoolType === 'high'")
    expect(source).toContain('같은 반까지 기억나요')
    expect(source).toContain('내 계정에 등록한 같은 학교·졸업연도·학년·반 정보와 정확히 일치할 때만 확인할 수 있습니다.')
  })

  it('sends no class payload without explicit mode and defaults a successful same-class greeting relation', () => {
    expect(source).toContain("search_mode: 'same_class'")
    expect(source).toContain("setRelationship(sameClassMode ? 'same_class' : 'same_school')")
    expect(source).not.toContain('receiver_user_id')
    expect(source).not.toContain('searchParams')
  })
})
