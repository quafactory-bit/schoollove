import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = readFileSync(join(process.cwd(), 'app/admin/profiles/page.tsx'), 'utf-8')

describe('admin profiles page search boundary', () => {
  it('검색은 인증된 관리자 API를 사용하고 cross-table PostgREST OR를 만들지 않는다', () => {
    expect(source).toMatch(/fetch\(`\/api\/admin\/profiles\?q=\$\{encodeURIComponent\(query\.trim\(\)\)\}`\)/)
    expect(source).not.toMatch(/schools\.school_name\.ilike/)
    expect(source).not.toMatch(/\.or\(/)
  })

  it('조회 오류를 정상 0건과 구분하는 오류 상태를 표시한다', () => {
    expect(source).toMatch(/setSearchError\('검색 중 오류가 발생했습니다\. 잠시 후 다시 시도해주세요\.'/)
    expect(source).toMatch(/role="alert"/)
  })
})
