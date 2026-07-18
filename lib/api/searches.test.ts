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
