import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE = readFileSync(join(process.cwd(), 'components', 'SchoolSearchResults.tsx'), 'utf8')

describe('public school-only search results', () => {
  it('개인 명단·Instagram·졸업연도·반 정보를 렌더하지 않는다', () => {
    expect(SOURCE).not.toMatch(/instagram|nickname|graduation_year|class_number|동문 \{school\.profile_count\}/i)
  })

  it('학교 이름·지역·유형과 학교 페이지 링크만 표시한다', () => {
    expect(SOURCE).toContain('school.school_name')
    expect(SOURCE).toContain('school.sido')
    expect(SOURCE).toContain('school.sigungu')
    expect(SOURCE).toContain('schoolTypeLabel(school.school_type)')
    expect(SOURCE).toContain('href={`/school/${school.slug}`}')
  })
})
