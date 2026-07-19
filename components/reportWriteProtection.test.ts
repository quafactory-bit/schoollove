import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// PHASE 7A — ReportButton/EditDeleteModal이 더 이상 브라우저에서 Supabase 테이블에
// 직접 쓰지 않고 새 서버 API(app/api/reports/route.ts)를 거치는지 정적으로 확인한다.
// 이 저장소는 React Testing Library/jsdom을 쓰지 않는 관례(app/submit 계열 테스트와
// 동일)라, supabase/migrations/*.sql에 대한 정적 리뷰 테스트와 같은 방식으로 컴포넌트
// 소스 텍스트 자체를 검사한다 — 실제 DOM 렌더링·클릭 시뮬레이션은 하지 않는다.

function readComponentSource(fileName: string): string {
  return readFileSync(join(process.cwd(), 'components', fileName), 'utf-8')
}

describe('ReportButton.tsx — 쓰기 경로 전환', () => {
  const source = readComponentSource('ReportButton.tsx')

  it('Supabase 클라이언트를 더 이상 import하지 않는다', () => {
    expect(source).not.toMatch(/from ['"]@\/lib\/supabase['"]/)
  })

  it('reports 테이블에 직접 insert하지 않는다', () => {
    expect(source).not.toMatch(/supabase\s*\.\s*from\s*\(\s*['"]reports['"]/)
  })

  it('새 서버 API(/api/reports)를 호출한다', () => {
    expect(source).toMatch(/fetch\(\s*['"]\/api\/reports['"]/)
    expect(source).toMatch(/type:\s*['"]report['"]/)
  })

  it('loading 중 중복 제출을 막는 가드가 존재한다', () => {
    expect(source).toMatch(/if\s*\(!reason \|\| loading\)\s*return/)
    expect(source).toMatch(/disabled=\{loading/)
  })

  it('오류 상태를 표시하는 UI가 존재한다(빈 문자열이 아닐 때만 렌더)', () => {
    expect(source).toMatch(/\{error &&/)
  })
})

describe('EditDeleteModal.tsx — 쓰기 경로 전환', () => {
  const source = readComponentSource('EditDeleteModal.tsx')

  it('Supabase 클라이언트를 더 이상 import하지 않는다', () => {
    expect(source).not.toMatch(/from ['"]@\/lib\/supabase['"]/)
  })

  it('reports 테이블에 직접 insert하지 않는다', () => {
    expect(source).not.toMatch(/supabase\s*\.\s*from\s*\(\s*['"]reports['"]/)
  })

  it('새 서버 API(/api/reports)를 호출하며 edit/delete type을 그대로 보낸다', () => {
    expect(source).toMatch(/fetch\(\s*['"]\/api\/reports['"]/)
    expect(source).toMatch(/type:\s*['"]edit['"]/)
    expect(source).toMatch(/type:\s*['"]delete['"]/)
  })

  it('is_self_claimed 값을 클라이언트가 서버로 직접 전송하지 않는다(서버가 type으로 결정)', () => {
    expect(source).not.toMatch(/is_self_claimed/)
  })

  it('loading 중 중복 제출을 막는 가드가 존재한다', () => {
    expect(source).toMatch(/if\s*\(loading\)\s*return/)
    expect(source).toMatch(/disabled=\{loading/)
  })

  it('본인 확인 체크박스가 없으면 여전히 제출을 막는다(기존 정책 유지)', () => {
    expect(source).toMatch(/if\s*\(!selfClaimed\)\s*return/)
  })

  it('오류 상태를 표시하는 UI가 존재한다', () => {
    expect(source).toMatch(/\{error &&/)
  })
})
