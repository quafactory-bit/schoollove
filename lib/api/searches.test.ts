import { afterEach, describe, expect, it, vi } from 'vitest'

// lib/api/search.test.ts와 동일한 mock 패턴을 재사용한다.
function createMockSupabase(rpcResult: { data?: unknown; error?: unknown }) {
  const rpc = vi.fn().mockResolvedValue(rpcResult)
  const from = vi.fn()
  return { supabase: { rpc, from }, rpc, from }
}

afterEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

describe('getSchoolSearchCount — search_logs 원문 대신 집계 RPC 사용', () => {
  it('schoolSearchTokens 결과가 비어 있으면 RPC를 호출하지 않고 0을 반환한다', async () => {
    const { supabase, rpc } = createMockSupabase({ data: 0, error: null })
    vi.doMock('@/lib/supabase', () => ({ supabase }))
    const { getSchoolSearchCount } = await import('./searches')

    const result = await getSchoolSearchCount('')

    expect(result).toBe(0)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('get_school_search_count RPC를 정확히 한 번, search_tokens 인자로 호출한다', async () => {
    const { supabase, rpc } = createMockSupabase({ data: 33, error: null })
    vi.doMock('@/lib/supabase', () => ({ supabase }))
    const { getSchoolSearchCount, schoolSearchTokens } = await import('./searches')

    const result = await getSchoolSearchCount('인천초은중학교')

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('get_school_search_count', {
      search_tokens: schoolSearchTokens('인천초은중학교'),
    })
    expect(result).toBe(33)
  })

  it('search_logs 테이블을 직접 조회하지 않는다', async () => {
    const { supabase, from } = createMockSupabase({ data: 5, error: null })
    vi.doMock('@/lib/supabase', () => ({ supabase }))
    const { getSchoolSearchCount } = await import('./searches')

    await getSchoolSearchCount('대치고등학교')

    expect(from).not.toHaveBeenCalled()
  })

  it('RPC가 숫자를 반환하면 그대로 반환한다', async () => {
    const { supabase } = createMockSupabase({ data: 7, error: null })
    vi.doMock('@/lib/supabase', () => ({ supabase }))
    const { getSchoolSearchCount } = await import('./searches')

    await expect(getSchoolSearchCount('대치고등학교')).resolves.toBe(7)
  })

  it('RPC 오류가 있으면 0을 반환한다', async () => {
    const { supabase } = createMockSupabase({ data: null, error: { message: 'db error' } })
    vi.doMock('@/lib/supabase', () => ({ supabase }))
    const { getSchoolSearchCount } = await import('./searches')

    await expect(getSchoolSearchCount('대치고등학교')).resolves.toBe(0)
  })

  it.each([
    ['null', null],
    ['문자열', '33'],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['undefined', undefined],
  ])('data가 %s이면 0을 반환한다', async (_label, data) => {
    const { supabase } = createMockSupabase({ data, error: null })
    vi.doMock('@/lib/supabase', () => ({ supabase }))
    const { getSchoolSearchCount } = await import('./searches')

    await expect(getSchoolSearchCount('대치고등학교')).resolves.toBe(0)
  })

  it('두 번째 인자(_sido)가 있어도 시그니처 호환이 깨지지 않는다', async () => {
    const { supabase, rpc } = createMockSupabase({ data: 1, error: null })
    vi.doMock('@/lib/supabase', () => ({ supabase }))
    const { getSchoolSearchCount } = await import('./searches')

    await expect(getSchoolSearchCount('대치고등학교', '서울')).resolves.toBe(1)
    expect(rpc).toHaveBeenCalledTimes(1)
  })
})

describe('schoolSearchTokens — 기존 토큰 생성 동작 회귀 없음', () => {
  it('학교명 전체와 접미사 축약형을 포함한다', async () => {
    const { schoolSearchTokens } = await import('./searches')

    const tokens = schoolSearchTokens('인천초은중학교')

    expect(tokens).toContain('인천초은중학교')
    expect(tokens).toContain('인천초은중')
  })

  it('1글자 토큰은 제외한다', async () => {
    const { schoolSearchTokens } = await import('./searches')

    const tokens = schoolSearchTokens('인천초은중학교')

    expect(tokens.every((t) => t.length >= 2)).toBe(true)
  })
})

// 2026-07-18 와일드카드 리터럴 처리 보정(migration B) 관련 회귀 —
// TS는 %, _, \ 를 미리 이스케이프하지 않고 원문 그대로 RPC에 전달한다.
// 이스케이프는 SQL(get_school_search_count) 쪽 책임이며, TS가 별도로
// 이스케이프하면 이중 이스케이프가 되어 오히려 매칭이 깨진다.
describe('get_school_search_count — 와일드카드 문자 전달(이스케이프는 SQL 책임)', () => {
  it('학교명에 %가 포함돼도 원문 그대로 search_tokens에 전달한다', async () => {
    const { supabase, rpc } = createMockSupabase({ data: 0, error: null })
    vi.doMock('@/lib/supabase', () => ({ supabase }))
    const { getSchoolSearchCount } = await import('./searches')

    await getSchoolSearchCount('학교%이름')

    const [, { search_tokens }] = rpc.mock.calls[0]
    expect(search_tokens).toContain('학교%이름')
  })

  it('학교명에 _가 포함돼도 원문 그대로 search_tokens에 전달한다', async () => {
    const { supabase, rpc } = createMockSupabase({ data: 0, error: null })
    vi.doMock('@/lib/supabase', () => ({ supabase }))
    const { getSchoolSearchCount } = await import('./searches')

    await getSchoolSearchCount('학교_이름')

    const [, { search_tokens }] = rpc.mock.calls[0]
    expect(search_tokens).toContain('학교_이름')
  })

  it('학교명에 \\가 포함돼도 원문 그대로 search_tokens에 전달한다(TS가 이중 이스케이프하지 않음)', async () => {
    const { supabase, rpc } = createMockSupabase({ data: 0, error: null })
    vi.doMock('@/lib/supabase', () => ({ supabase }))
    const { getSchoolSearchCount } = await import('./searches')

    await getSchoolSearchCount('학교\\이름')

    const [, { search_tokens }] = rpc.mock.calls[0]
    expect(search_tokens).toContain('학교\\이름')
  })

  it('정상 schoolSearchTokens 경로는 RPC에 최대 5개 토큰만 전달한다', async () => {
    const { supabase, rpc } = createMockSupabase({ data: 0, error: null })
    vi.doMock('@/lib/supabase', () => ({ supabase }))
    const { getSchoolSearchCount } = await import('./searches')

    await getSchoolSearchCount('인천초은중학교')

    const [, { search_tokens }] = rpc.mock.calls[0]
    expect(search_tokens.length).toBeLessThanOrEqual(5)
  })
})
