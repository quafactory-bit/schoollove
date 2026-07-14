import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeInsta, registerPeople, type PersonInput, type RegisterBase } from './registerPeople'

const BASE: RegisterBase = {
  school_id: 'school-1',
  graduation_year: 2015,
  grade: 3,
  class_number: 2,
  department: null,
  student_year: null,
}

function person(nickname: string, overrides: Partial<PersonInput> = {}): PersonInput {
  return { nickname, instagram: '', isSelf: false, message: '', ...overrides }
}

function fetchResponse(ok: boolean, status: number): Response {
  return { ok, status } as Response
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('registerPeople', () => {
  it('a. 신규 1명 등록 성공 → success=1, POST /api/profiles 1회 호출', async () => {
    fetchMock.mockResolvedValue(fetchResponse(true, 201))

    const result = await registerPeople([person('홍길동')], BASE)

    expect(result).toEqual({ success: 1, dup: 0, fail: 0 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/profiles')
    expect(options.method).toBe('POST')
    const body = JSON.parse(options.body)
    expect(body).toEqual({
      ...BASE,
      nickname: '홍길동',
      instagram_id: null,
      is_self: false,
      message: null,
    })
  })

  it('b. 중복만 발생 → dup=2, 신규(success) 없음, 각 사람마다 1회씩 호출(학교별 반복 호출 없음 확인용 카운트)', async () => {
    fetchMock.mockResolvedValue(fetchResponse(false, 409))

    const result = await registerPeople([person('철수'), person('영희')], BASE)

    expect(result).toEqual({ success: 0, dup: 2, fail: 0 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('c. 신규와 중복 혼합 → 실제 응답별로 정확히 분류됨', async () => {
    fetchMock
      .mockResolvedValueOnce(fetchResponse(true, 201)) // 신규
      .mockResolvedValueOnce(fetchResponse(false, 409)) // 중복
      .mockResolvedValueOnce(fetchResponse(true, 201)) // 신규

    const result = await registerPeople([person('가'), person('나'), person('다')], BASE)

    expect(result).toEqual({ success: 2, dup: 1, fail: 0 })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    // 순서 보존 확인: 호출 순서가 입력 순서와 동일 (사람별 body의 nickname으로 확인)
    const bodies = fetchMock.mock.calls.map(([, options]) => JSON.parse(options.body).nickname)
    expect(bodies).toEqual(['가', '나', '다'])
  })

  it('d. 여러 신규 프로필 등록 → 학교당 등록 인원 수만큼 POST가 정확히 그 횟수만큼 호출됨 (신규 성공 1건당 route에서 syncSchoolLevel 1회)', async () => {
    fetchMock.mockResolvedValue(fetchResponse(true, 201))
    const people = [person('a'), person('b'), person('c'), person('d')]

    const result = await registerPeople(people, BASE)

    expect(result).toEqual({ success: 4, dup: 0, fail: 0 })
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('e. 프로필 insert 실패(500) 및 네트워크 예외 모두 fail로 집계됨', async () => {
    fetchMock
      .mockResolvedValueOnce(fetchResponse(false, 500))
      .mockRejectedValueOnce(new Error('network down'))

    const result = await registerPeople([person('실패1'), person('실패2')], BASE)

    expect(result).toEqual({ success: 0, dup: 0, fail: 2 })
  })

  it('부분 성공: 신규/중복/실패가 섞여도 success+dup+fail이 실제 시도 인원수와 일치', async () => {
    fetchMock
      .mockResolvedValueOnce(fetchResponse(true, 201))
      .mockResolvedValueOnce(fetchResponse(false, 409))
      .mockResolvedValueOnce(fetchResponse(false, 500))
      .mockRejectedValueOnce(new Error('network down'))

    const people = [person('a'), person('b'), person('c'), person('d')]
    const result = await registerPeople(people, BASE)

    expect(result).toEqual({ success: 1, dup: 1, fail: 2 })
    expect(result.success + result.dup + result.fail).toBe(people.length)
  })

  it('g. 재시도/중복 방지: 동일 인물이 두 번 제출되면 두 번째는 중복(409)으로 처리되어 success로 잘못 집계되지 않음', async () => {
    // 첫 시도(신규 성공) → route 내부에서 syncSchoolLevel 1회 호출
    // 재시도(동일 school_id+graduation_year+grade+class_number+nickname) → DB unique constraint(23505) → 409 → route는 syncSchoolLevel을 호출하지 않음
    fetchMock
      .mockResolvedValueOnce(fetchResponse(true, 201))
      .mockResolvedValueOnce(fetchResponse(false, 409))

    const same = person('동일인')
    const result = await registerPeople([same, same], BASE)

    expect(result).toEqual({ success: 1, dup: 1, fail: 0 })
  })

  it('is_self는 인스타그램이 없으면 항상 false로 전송됨 (본인 등록 아님 표시)', async () => {
    fetchMock.mockResolvedValue(fetchResponse(true, 201))

    await registerPeople([person('이름만', { isSelf: true, instagram: '' })], BASE)

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.is_self).toBe(false)
    expect(body.instagram_id).toBeNull()
  })
})

describe('normalizeInsta', () => {
  it('URL, @ 접두사, 쿼리스트링을 제거하고 순수 아이디만 남김', () => {
    expect(normalizeInsta('https://instagram.com/gildong?hl=ko')).toBe('gildong')
    expect(normalizeInsta('@gildong')).toBe('gildong')
    expect(normalizeInsta('  gildong  ')).toBe('gildong')
  })

  it('빈 입력은 빈 문자열', () => {
    expect(normalizeInsta('')).toBe('')
    expect(normalizeInsta('   ')).toBe('')
  })
})
