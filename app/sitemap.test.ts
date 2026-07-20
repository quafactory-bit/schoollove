import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type MockResult = { data?: unknown; error?: unknown }

function createMockSupabase(result: MockResult) {
  const calls: { method: string; args: unknown[] }[] = []
  const from = vi.fn((_table: string) => {
    const chain: Record<string, (...args: unknown[]) => unknown> = {}
    for (const method of ['select', 'eq']) {
      chain[method] = (...args: unknown[]) => {
        calls.push({ method, args })
        return chain
      }
    }
    chain.then = (...args: unknown[]) => {
      const resolve = args[0] as (v: MockResult) => unknown
      return resolve({ data: result.data ?? null, error: result.error ?? null })
    }
    return chain
  })
  return { supabaseServer: { from }, calls, from }
}

// PHASE 8 COMPLETION PATCH — 같은 import된 sitemap() 함수 참조를 여러 번 호출하면서 매번
// 다른 DB 응답을 돌려주는 mock. lib/api/profiles.test.ts의 script 패턴과 동일 — 호출할
// 때마다 script 배열의 다음 항목을 소비한다. 이 mock 하나로 "동일 프로세스 연속 호출에서
// 이전 결과를 재사용하지 않는다"를 증명한다(모듈을 매번 다시 import하는 게 아니라 이미
// import된 동일 함수를 반복 호출).
function createScriptedMockSupabase(script: MockResult[]) {
  let cursor = 0
  const from = vi.fn((_table: string) => {
    const result = script[cursor] ?? { data: [], error: null }
    cursor++
    const chain: Record<string, (...args: unknown[]) => unknown> = {}
    for (const method of ['select', 'eq']) {
      chain[method] = () => chain
    }
    chain.then = (...args: unknown[]) => {
      const resolve = args[0] as (v: MockResult) => unknown
      return resolve({ data: result.data ?? null, error: result.error ?? null })
    }
    return chain
  })
  return { supabaseServer: { from } }
}

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    graduation_year: 2020,
    grade: 1,
    class_number: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    school: { slug: 'daechi-high' },
    ...overrides,
  }
}

afterEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

describe('app/sitemap.ts — profiles 쿼리는 hidden 프로필을 제외한다', () => {
  it('is_hidden=false 필터를 사용한다', async () => {
    const { supabaseServer, calls } = createMockSupabase({ data: [] })
    vi.doMock('@/lib/supabase', () => ({ supabaseServer }))
    const sitemap = (await import('./sitemap')).default

    await sitemap()

    const eqCall = calls.find((c) => c.method === 'eq')
    expect(eqCall?.args).toEqual(['is_hidden', false])
  })

  it('닉네임/Instagram ID 등 개인 식별자 컬럼을 select하지 않는다', async () => {
    const { supabaseServer, calls } = createMockSupabase({ data: [] })
    vi.doMock('@/lib/supabase', () => ({ supabaseServer }))
    const sitemap = (await import('./sitemap')).default

    await sitemap()

    const selectCall = calls.find((c) => c.method === 'select')
    const selectArg = String(selectCall?.args[0])
    expect(selectArg).not.toMatch(/\bnickname\b/)
    expect(selectArg).not.toMatch(/\binstagram_id\b/)
  })
})

describe('app/sitemap.ts — indexable/noindex 필터링(PHASE 8 핵심 계약)', () => {
  it('프로필 3명 미만인 학교는 sitemap에서 제외된다', async () => {
    const rows = [makeRow(), makeRow()]
    const { supabaseServer } = createMockSupabase({ data: rows })
    vi.doMock('@/lib/supabase', () => ({ supabaseServer }))
    const sitemap = (await import('./sitemap')).default

    const result = await sitemap()

    expect(result.some((e) => e.url.endsWith('/school/daechi-high'))).toBe(false)
  })

  it('프로필 3명 이상인 학교는 sitemap에 포함된다', async () => {
    const rows = [makeRow(), makeRow(), makeRow()]
    const { supabaseServer } = createMockSupabase({ data: rows })
    vi.doMock('@/lib/supabase', () => ({ supabaseServer }))
    const sitemap = (await import('./sitemap')).default

    const result = await sitemap()

    expect(result.some((e) => e.url.endsWith('/school/daechi-high'))).toBe(true)
  })

  it('학교는 indexable하지만 특정 연도가 3명 미만이면 그 연도는 제외된다', async () => {
    const rows = [
      makeRow({ graduation_year: 2020 }),
      makeRow({ graduation_year: 2020 }),
      makeRow({ graduation_year: 2020 }),
      makeRow({ graduation_year: 2021 }),
    ]
    const { supabaseServer } = createMockSupabase({ data: rows })
    vi.doMock('@/lib/supabase', () => ({ supabaseServer }))
    const sitemap = (await import('./sitemap')).default

    const result = await sitemap()

    expect(result.some((e) => e.url.endsWith('/school/daechi-high/2020'))).toBe(true)
    expect(result.some((e) => e.url.endsWith('/school/daechi-high/2021'))).toBe(false)
  })

  it('반이 3명 미만이면 제외되고 3명 이상이면 포함된다', async () => {
    const rows = [
      makeRow({ grade: 1, class_number: 1 }),
      makeRow({ grade: 1, class_number: 1 }),
      makeRow({ grade: 1, class_number: 1 }),
      makeRow({ grade: 1, class_number: 2 }),
      makeRow({ grade: 1, class_number: 2 }),
    ]
    const { supabaseServer } = createMockSupabase({ data: rows })
    vi.doMock('@/lib/supabase', () => ({ supabaseServer }))
    const sitemap = (await import('./sitemap')).default

    const result = await sitemap()

    expect(result.some((e) => e.url.endsWith('/school/daechi-high/2020/1-1'))).toBe(true)
    expect(result.some((e) => e.url.endsWith('/school/daechi-high/2020/1-2'))).toBe(false)
  })

  it('metadata(isSchoolPageIndexable 등)와 동일한 공통 정책 함수를 쓴다(임계값 소스가 하나)', async () => {
    const seoIndexing = await import('@/lib/policy/seoIndexing')
    expect(seoIndexing.SEO_INDEX_THRESHOLD).toBe(3)
    const rows = [makeRow(), makeRow()] // 2명 = SEO_INDEX_THRESHOLD - 1
    const { supabaseServer } = createMockSupabase({ data: rows })
    vi.doMock('@/lib/supabase', () => ({ supabaseServer }))
    const sitemap = (await import('./sitemap')).default

    const result = await sitemap()
    expect(result.some((e) => e.url.includes('daechi-high'))).toBe(false)
  })
})

describe('app/sitemap.ts — 중복/누락 URL 방지', () => {
  it('같은 학교가 여러 프로필 행으로 나타나도 school URL은 한 번만 포함된다', async () => {
    const rows = [makeRow(), makeRow(), makeRow(), makeRow(), makeRow()]
    const { supabaseServer } = createMockSupabase({ data: rows })
    vi.doMock('@/lib/supabase', () => ({ supabaseServer }))
    const sitemap = (await import('./sitemap')).default

    const result = await sitemap()
    const schoolUrls = result.filter((e) => e.url.endsWith('/school/daechi-high'))
    expect(schoolUrls.length).toBe(1)
  })
})

describe('app/sitemap.ts — DB 오류·빈 결과에도 500으로 깨지지 않는다', () => {
  it('DB 오류 시 정적 페이지만 담아 반환한다(예외를 던지지 않음)', async () => {
    const { supabaseServer } = createMockSupabase({ data: null, error: { message: 'db down' } })
    vi.doMock('@/lib/supabase', () => ({ supabaseServer }))
    const sitemap = (await import('./sitemap')).default

    const result = await sitemap()
    expect(result.length).toBeGreaterThan(0)
    expect(result.every((e) => !e.url.includes('/school/'))).toBe(true)
  })

  it('빈 DB 결과에도 정적 페이지는 반환된다', async () => {
    const { supabaseServer } = createMockSupabase({ data: [] })
    vi.doMock('@/lib/supabase', () => ({ supabaseServer }))
    const sitemap = (await import('./sitemap')).default

    const result = await sitemap()
    expect(result.some((e) => e.url === 'https://schoollove.kr' || e.url.endsWith('.kr'))).toBe(true)
  })
})

describe('app/sitemap.ts — Search/Admin/Submit URL을 포함하지 않는다', () => {
  it('/search, /submit, /admin URL이 sitemap에 없다', async () => {
    const { supabaseServer } = createMockSupabase({ data: [] })
    vi.doMock('@/lib/supabase', () => ({ supabaseServer }))
    const sitemap = (await import('./sitemap')).default

    const result = await sitemap()
    expect(result.some((e) => e.url.endsWith('/search'))).toBe(false)
    expect(result.some((e) => e.url.endsWith('/submit'))).toBe(false)
    expect(result.some((e) => e.url.includes('/admin'))).toBe(false)
  })
})

describe('app/sitemap.ts — PHASE 8 COMPLETION PATCH: 빌드 시점 정적 상태로 고정되지 않는다', () => {
  it("route segment config로 dynamic = 'force-dynamic'을 명시한다", () => {
    const source = readFileSync(join(process.cwd(), 'app', 'sitemap.ts'), 'utf-8')
    expect(source).toMatch(/export const dynamic = 'force-dynamic'/)
  })
})

describe('app/sitemap.ts — PHASE 8 COMPLETION PATCH: 동일 프로세스 연속 호출에서도 이전 결과를 재사용하지 않는다', () => {
  it('2명(제외) → 3명(포함) → 2명(제외)으로 그룹 count가 바뀌면 같은 sitemap() 함수 호출마다 즉시 반영된다', async () => {
    const rowFor = (count: number) => Array.from({ length: count }, () => makeRow())
    const { supabaseServer } = createScriptedMockSupabase([
      { data: rowFor(2) },
      { data: rowFor(3) },
      { data: rowFor(2) },
    ])
    vi.doMock('@/lib/supabase', () => ({ supabaseServer }))
    const sitemap = (await import('./sitemap')).default

    const first = await sitemap()
    expect(first.some((e) => e.url.endsWith('/school/daechi-high'))).toBe(false)

    const second = await sitemap()
    expect(second.some((e) => e.url.endsWith('/school/daechi-high'))).toBe(true)

    const third = await sitemap()
    expect(third.some((e) => e.url.endsWith('/school/daechi-high'))).toBe(false)
  })

  it('3명(포함) → 2명(제외)으로 하락해도 같은 함수 호출로 즉시 제외된다(등록 취소·hidden·삭제 시나리오)', async () => {
    const rowFor = (count: number) => Array.from({ length: count }, () => makeRow())
    const { supabaseServer } = createScriptedMockSupabase([
      { data: rowFor(3) },
      { data: rowFor(2) },
    ])
    vi.doMock('@/lib/supabase', () => ({ supabaseServer }))
    const sitemap = (await import('./sitemap')).default

    const first = await sitemap()
    expect(first.some((e) => e.url.endsWith('/school/daechi-high'))).toBe(true)

    const second = await sitemap()
    expect(second.some((e) => e.url.endsWith('/school/daechi-high'))).toBe(false)
  })

  it('연속 호출 중에도 hidden 프로필(쿼리 자체가 is_hidden=false로 필터링됨)은 항상 반영된다', async () => {
    // hidden 처리는 DB 쿼리 필터(is_hidden=false)가 매 호출마다 다시 적용되는 것으로
    // 보장된다 — 이 mock은 매 호출마다 "그 시점에 공개 상태인 행"만 돌려주는 것으로
    // hidden 전환을 흉내낸다(실제로는 쿼리 자체의 eq 필터가 매번 재실행됨을 의미).
    const rowFor = (count: number) => Array.from({ length: count }, () => makeRow())
    const { supabaseServer } = createScriptedMockSupabase([
      { data: rowFor(3) }, // 3명 공개
      { data: rowFor(2) }, // 1명이 hidden 처리되어 공개 2명만 남음
    ])
    vi.doMock('@/lib/supabase', () => ({ supabaseServer }))
    const sitemap = (await import('./sitemap')).default

    const before = await sitemap()
    expect(before.some((e) => e.url.endsWith('/school/daechi-high'))).toBe(true)

    const afterHidden = await sitemap()
    expect(afterHidden.some((e) => e.url.endsWith('/school/daechi-high'))).toBe(false)
  })

  it('성공 호출 다음에 DB 오류가 나도 직전 성공 결과를 이어서 반환하지 않고 홈페이지만 반환한다', async () => {
    const rowFor = (count: number) => Array.from({ length: count }, () => makeRow())
    const { supabaseServer } = createScriptedMockSupabase([
      { data: rowFor(3) },
      { data: null, error: { message: 'db down' } },
    ])
    vi.doMock('@/lib/supabase', () => ({ supabaseServer }))
    const sitemap = (await import('./sitemap')).default

    const success = await sitemap()
    expect(success.some((e) => e.url.endsWith('/school/daechi-high'))).toBe(true)

    const afterError = await sitemap()
    expect(afterError.some((e) => e.url.includes('/school/'))).toBe(false)
    expect(afterError.length).toBeGreaterThan(0)
  })

  it('DB 오류 메시지 원문이 응답 어디에도 포함되지 않는다', async () => {
    const { supabaseServer } = createMockSupabase({ data: null, error: { message: 'super-secret-db-internal-detail' } })
    vi.doMock('@/lib/supabase', () => ({ supabaseServer }))
    const sitemap = (await import('./sitemap')).default

    const result = await sitemap()
    expect(JSON.stringify(result)).not.toContain('super-secret-db-internal-detail')
  })

  it('그룹의 lastModified는 매 호출의 최신 created_at을 그대로 반영한다(과거 값에 고정되지 않음)', async () => {
    const { supabaseServer } = createScriptedMockSupabase([
      { data: [makeRow({ created_at: '2026-01-01T00:00:00.000Z' }), makeRow({ created_at: '2026-01-01T00:00:00.000Z' }), makeRow({ created_at: '2026-01-01T00:00:00.000Z' })] },
      { data: [makeRow({ created_at: '2026-06-01T00:00:00.000Z' }), makeRow({ created_at: '2026-06-01T00:00:00.000Z' }), makeRow({ created_at: '2026-06-15T00:00:00.000Z' })] },
    ])
    vi.doMock('@/lib/supabase', () => ({ supabaseServer }))
    const sitemap = (await import('./sitemap')).default

    const first = await sitemap()
    const firstSchool = first.find((e) => e.url.endsWith('/school/daechi-high'))
    expect(new Date(firstSchool!.lastModified!).toISOString()).toBe('2026-01-01T00:00:00.000Z')

    const second = await sitemap()
    const secondSchool = second.find((e) => e.url.endsWith('/school/daechi-high'))
    expect(new Date(secondSchool!.lastModified!).toISOString()).toBe('2026-06-15T00:00:00.000Z')
  })
})

describe('app/sitemap.ts — URL 구조가 canonical과 동일하다', () => {
  it('/school/{slug}, /school/{slug}/{year}, /school/{slug}/{year}/{grade}-{class} 형태만 생성한다', async () => {
    const rows = [makeRow(), makeRow(), makeRow()]
    const { supabaseServer } = createMockSupabase({ data: rows })
    vi.doMock('@/lib/supabase', () => ({ supabaseServer }))
    const sitemap = (await import('./sitemap')).default

    const result = await sitemap()
    const schoolUrls = result.filter((e) => e.url.includes('/school/'))
    for (const entry of schoolUrls) {
      expect(entry.url).toMatch(/\/school\/[^/]+(\/\d+(\/\d+-\d+)?)?$/)
    }
  })
})
