import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE = readFileSync(join(process.cwd(), 'components', 'ProfileCard.tsx'), 'utf-8')
const REPORT_SOURCE = readFileSync(join(process.cwd(), 'components', 'ReportButton.tsx'), 'utf-8')

describe('ProfileCard — People Discovery 공개 카드 계약', () => {
  it('nickname과 졸업연도·학년·반 및 선택 메시지를 유지한다', () => {
    expect(SOURCE).toMatch(/profile\.nickname/)
    expect(SOURCE).toMatch(/profile\.graduation_year/)
    expect(SOURCE).toMatch(/profile\.grade/)
    expect(SOURCE).toMatch(/profile\.class_number/)
    expect(SOURCE).toMatch(/profile\.message/)
  })

  it('Instagram이 있으면 안전한 외부 링크와 접근 가능한 이름을 제공한다', () => {
    expect(SOURCE).toMatch(/https:\/\/instagram\.com\/\$\{profile\.instagram_id\}/)
    expect(SOURCE).toMatch(/target="_blank" rel="noopener noreferrer"/)
    expect(SOURCE).toMatch(/aria-label=\{`인스타그램에서 \$\{profile\.nickname\} 보기`\}/)
  })

  it('Instagram 미등록·수정·삭제·신고 액션을 유지한다', () => {
    expect(SOURCE).toMatch(/\+ 인스타 추가/)
    expect(SOURCE).toMatch(/수정·삭제/)
    expect(SOURCE).toMatch(/<ReportButton profileId=\{profile\.id\} \/>/)
    expect(REPORT_SOURCE).toMatch(/aria-label="프로필 신고"/)
  })

  it('주요 카드 액션은 44px 최소 터치 높이를 갖는다', () => {
    expect(SOURCE.match(/min-h-11/g)?.length).toBeGreaterThanOrEqual(3)
    expect(REPORT_SOURCE).toMatch(/min-h-11 min-w-11/)
  })

  it('독립 공개 Profile 목적지 링크를 만들지 않는다', () => {
    expect(SOURCE).not.toMatch(/href=\{?`?\/profile/)
  })
})
