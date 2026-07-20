import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Class Hub도 React Server Component라 렌더 테스트를 할 수 없다(JSX 트랜스폼 미설치).
// 소스 텍스트로 PHASE 8 SEO 계약을 확인한다.
const SOURCE = readFileSync(join(__dirname, 'page.tsx'), 'utf-8')

describe('app/school/[slug]/[year]/[class]/page.tsx — PHASE 8 SEO 계약', () => {
  it('noindex 판단은 공통 정책 함수(isClassPageIndexable)만 쓰고 로컬 임계값 상수를 두지 않는다', () => {
    expect(SOURCE).toMatch(/getClassProfileCount/)
    expect(SOURCE).toMatch(/isClassPageIndexable\(count\)/)
    expect(SOURCE).not.toMatch(/const INDEX_THRESHOLD/)
  })

  it('페이지를 찾을 수 없을 때는 별도로 index:false, follow:false를 반환한다(무변경)', () => {
    expect(SOURCE).toMatch(/robots: \{ index: false, follow: false \}/)
  })
})
