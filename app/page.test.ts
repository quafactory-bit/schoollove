import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// app/page.tsx는 React Server Component(.tsx)라 vitest의 esbuild 기본 설정(tsconfig jsx:"preserve")으로는
// import 시점에 JSX를 파싱할 수 없다(React 테스트 도구/새 의존성을 추가하지 않기로 한 제약과 결합되어
// 별도 JSX 트랜스폼 플러그인을 설치하지 않는다). 대신 Next.js route segment config는 정적으로 export되는
// 리터럴이므로, 소스 텍스트에서 재검증 계약(`export const revalidate = 60`)이 실제로 존재하는지 확인한다.
const PAGE_SOURCE = readFileSync(join(__dirname, 'page.tsx'), 'utf-8')

describe('app/page.tsx — 홈 재검증 계약 (Phase 4B, docs/decisions/2026-07-17-home-feed-freshness.md)', () => {
  it('1. revalidate가 60초로 명시적으로 export되어 있다(빌드 시점 데이터로 영구 고정되지 않음)', () => {
    expect(PAGE_SOURCE).toMatch(/export const revalidate = 60/)
  })

  it('force-dynamic을 사용하지 않는다(짧은 ISR 재검증 + 성공 쓰기 후 즉시 재검증으로 충분하다는 정책 결정)', () => {
    expect(PAGE_SOURCE).not.toMatch(/export const dynamic = ['"]force-dynamic['"]/)
  })
})

describe('app/page.tsx — 레트로 RPG 타이포그래피 색상 계약', () => {
  it('desktop home container is widened beyond the old narrow mobile feed column', () => {
    expect(PAGE_SOURCE).toContain('max-w-[1180px]')
    expect(PAGE_SOURCE).not.toContain('max-w-[600px]')
  })

  it('hero 큰 제목은 검정 본문 계열이고 형광 포인트를 직접 적용하지 않는다', () => {
    const headline = PAGE_SOURCE.match(/<h1[\s\S]*?<\/h1>/)?.[0] ?? ''

    expect(headline).toContain('text-schoollove-text')
    expect(headline).toContain('lg:text-[56px]')
    expect(headline).not.toMatch(/text-schoollove-(neon|electric|level|growth|system|warning)/)
    expect(headline).not.toContain('font-retro')
  })

  it('작은 상태 라벨에만 게임 UI 폰트와 포인트색을 사용한다', () => {
    expect(PAGE_SOURCE).toContain('font-retro text-[12px]')
    expect(PAGE_SOURCE).toContain('GROWTH ONLINE')
    expect(PAGE_SOURCE).toContain('text-schoollove-electric-blue')
    expect(PAGE_SOURCE).toContain('GROWTH STATUS')
    expect(PAGE_SOURCE).toContain('순위에 오른 학교')
    expect(PAGE_SOURCE).toContain('{rankingRows.length}곳')
    expect(PAGE_SOURCE).toContain('최근 성장 소식')
    expect(PAGE_SOURCE).toContain('{activityItems.length}건')
  })
})
