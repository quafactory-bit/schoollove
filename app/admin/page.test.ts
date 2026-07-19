import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// app/admin/page.tsx는 React Server Component라 app/page.test.ts와 동일한 이유로
// 직접 import해 렌더링 테스트를 할 수 없다(JSX 트랜스폼 미설치, 새 테스트 의존성을
// 추가하지 않기로 한 제약). 대신 소스 텍스트에서 실제 데이터 조회·컴포넌트 연결
// 계약이 존재하는지 정적으로 확인한다.
const PAGE_SOURCE = readFileSync(join(__dirname, 'page.tsx'), 'utf-8')

describe('app/admin/page.tsx — PHASE 7A COMPLETION PATCH: 수정 요청 노출', () => {
  it('1. type=edit 요청을 조회한다', () => {
    expect(PAGE_SOURCE).toMatch(/getRecentRequests\(\s*['"]edit['"]\s*,\s*20\s*\)/)
  })

  it('2. EditRequestsList를 import하고 렌더한다', () => {
    expect(PAGE_SOURCE).toMatch(/import \{ EditRequestsList \} from '\.\/_components\/edit-requests-list'/)
    expect(PAGE_SOURCE).toMatch(/<EditRequestsList requests=\{editRequests\} \/>/)
  })

  it('3. report/delete 요청 조회는 회귀 없이 그대로 유지된다', () => {
    expect(PAGE_SOURCE).toMatch(/getRecentRequests\(\s*['"]report['"]\s*,\s*20\s*\)/)
    expect(PAGE_SOURCE).toMatch(/getRecentRequests\(\s*['"]delete['"]\s*,\s*20\s*\)/)
    expect(PAGE_SOURCE).toMatch(/<ReportsList reports=\{reports\}/)
    expect(PAGE_SOURCE).toMatch(/<DeleteRequestsList requests=\{deleteRequests\} \/>/)
  })
})
