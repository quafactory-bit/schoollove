import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeInsta, registerPeople, type PersonInput, type RegisterBase } from './registerPeople'
import type { RegistrationGrowthReward, RegistrationGrowthSnapshot } from '@/types/registration'

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

function snapshot(overrides: Partial<RegistrationGrowthSnapshot> = {}): RegistrationGrowthSnapshot {
  return {
    visibleProfileCount: 1,
    effectiveLevel: 1,
    nextLevel: 2,
    remainingToNext: 140,
    progressPercent: 1,
    isNearLevelUp: false,
    ...overrides,
  }
}

function reward(overrides: Partial<RegistrationGrowthReward> = {}): RegistrationGrowthReward {
  return {
    schoolId: BASE.school_id,
    before: snapshot({ visibleProfileCount: 0 }),
    after: snapshot({ visibleProfileCount: 1 }),
    outcome: 'first_record',
    ...overrides,
  }
}

// PHASE 6A 성공 응답 — 기존 fetchResponse와 달리 실제 .json()을 갖는다.
function fetchResponseWithBody(status: number, body: unknown): Response {
  return { ok: true, status, json: async () => body } as unknown as Response
}

function fetchResponseWithInvalidJson(status: number): Response {
  return {
    ok: true,
    status,
    json: async () => {
      throw new SyntaxError('Unexpected end of JSON input')
    },
  } as unknown as Response
}

let fetchMock: ReturnType<typeof vi.fn>

// PHASE 9 — registerPeople은 사람마다 새 CAPTCHA 토큰을 요청한다(components/CaptchaWidget.tsx의
// requestNextToken과 동일한 계약). 이 파일의 테스트는 CAPTCHA 자체를 검증하지 않으므로
// 항상 동일한 고정 토큰을 반환하는 가장 단순한 getter를 쓴다 — 실제 위젯 동작은
// components/CaptchaWidget.test.ts가, 서버 검증은 lib/security/captcha.test.ts가 다룬다.
const getToken = () => Promise.resolve('test-captcha-token')

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

    const result = await registerPeople([person('홍길동')], BASE, getToken)

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
      captchaToken: 'test-captcha-token',
    })
  })

  it('b. 중복만 발생 → dup=2, 신규(success) 없음, 각 사람마다 1회씩 호출(학교별 반복 호출 없음 확인용 카운트)', async () => {
    fetchMock.mockResolvedValue(fetchResponse(false, 409))

    const result = await registerPeople([person('철수'), person('영희')], BASE, getToken)

    expect(result).toEqual({ success: 0, dup: 2, fail: 0 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('c. 신규와 중복 혼합 → 실제 응답별로 정확히 분류됨', async () => {
    fetchMock
      .mockResolvedValueOnce(fetchResponse(true, 201)) // 신규
      .mockResolvedValueOnce(fetchResponse(false, 409)) // 중복
      .mockResolvedValueOnce(fetchResponse(true, 201)) // 신규

    const result = await registerPeople([person('가'), person('나'), person('다')], BASE, getToken)

    expect(result).toEqual({ success: 2, dup: 1, fail: 0 })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    // 순서 보존 확인: 호출 순서가 입력 순서와 동일 (사람별 body의 nickname으로 확인)
    const bodies = fetchMock.mock.calls.map(([, options]) => JSON.parse(options.body).nickname)
    expect(bodies).toEqual(['가', '나', '다'])
  })

  it('d. 여러 신규 프로필 등록 → 학교당 등록 인원 수만큼 POST가 정확히 그 횟수만큼 호출됨 (신규 성공 1건당 route에서 syncSchoolLevel 1회)', async () => {
    fetchMock.mockResolvedValue(fetchResponse(true, 201))
    const people = [person('a'), person('b'), person('c'), person('d')]

    const result = await registerPeople(people, BASE, getToken)

    expect(result).toEqual({ success: 4, dup: 0, fail: 0 })
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('e. 프로필 insert 실패(500) 및 네트워크 예외 모두 fail로 집계됨', async () => {
    fetchMock
      .mockResolvedValueOnce(fetchResponse(false, 500))
      .mockRejectedValueOnce(new Error('network down'))

    const result = await registerPeople([person('실패1'), person('실패2')], BASE, getToken)

    expect(result).toEqual({ success: 0, dup: 0, fail: 2 })
  })

  it('부분 성공: 신규/중복/실패가 섞여도 success+dup+fail이 실제 시도 인원수와 일치', async () => {
    fetchMock
      .mockResolvedValueOnce(fetchResponse(true, 201))
      .mockResolvedValueOnce(fetchResponse(false, 409))
      .mockResolvedValueOnce(fetchResponse(false, 500))
      .mockRejectedValueOnce(new Error('network down'))

    const people = [person('a'), person('b'), person('c'), person('d')]
    const result = await registerPeople(people, BASE, getToken)

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
    const result = await registerPeople([same, same], BASE, getToken)

    expect(result).toEqual({ success: 1, dup: 1, fail: 0 })
  })

  it('is_self는 인스타그램이 없으면 항상 false로 전송됨 (본인 등록 아님 표시)', async () => {
    fetchMock.mockResolvedValue(fetchResponse(true, 201))

    await registerPeople([person('이름만', { isSelf: true, instagram: '' })], BASE, getToken)

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.is_self).toBe(false)
    expect(body.instagram_id).toBeNull()
  })
})

describe('registerPeople — 한마디 payload', () => {
  it('사람별 한마디를 앞뒤 공백 없이 각각의 등록 payload에 보존한다', async () => {
    fetchMock.mockResolvedValue(fetchResponse(true, 201))

    await registerPeople(
      [person('첫째', { message: '  첫 번째 한마디  ' }), person('둘째', { message: '두 번째 한마디' })],
      BASE,
      getToken
    )

    const messages = fetchMock.mock.calls.map(([, options]) => JSON.parse(options.body).message)
    expect(messages).toEqual(['첫 번째 한마디', '두 번째 한마디'])
  })

  it('공백만 입력한 한마디는 기존 API 계약대로 null로 전송한다', async () => {
    fetchMock.mockResolvedValue(fetchResponse(true, 201))

    await registerPeople([person('공백', { message: '   ' })], BASE, getToken)

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).message).toBeNull()
  })
})

describe('registerPeople — PHASE 9 CAPTCHA 토큰 배급(사람마다 새 토큰 요청)', () => {
  it('사람 수만큼 getCaptchaToken을 호출하고, 각 POST body에 그 시점의 토큰을 담는다', async () => {
    fetchMock.mockResolvedValue(fetchResponse(true, 201))
    const tokens = ['token-1', 'token-2', 'token-3']
    let cursor = 0
    const getSequentialToken = vi.fn(() => Promise.resolve(tokens[cursor++]))

    await registerPeople([person('가'), person('나'), person('다')], BASE, getSequentialToken)

    expect(getSequentialToken).toHaveBeenCalledTimes(3)
    const sentTokens = fetchMock.mock.calls.map(([, options]) => JSON.parse(options.body).captchaToken)
    expect(sentTokens).toEqual(['token-1', 'token-2', 'token-3'])
  })

  it('getCaptchaToken이 실패(reject)하면 그 사람은 fetch를 호출하지 않고 fail로 집계된다', async () => {
    const failingGetToken = vi.fn(() => Promise.reject(new Error('captcha-not-ready')))

    const result = await registerPeople([person('가')], BASE, failingGetToken)

    expect(result).toEqual({ success: 0, dup: 0, fail: 1 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('CAPTCHA 토큰이 실패한 사람 이후에도 나머지 사람은 각자 다시 새 토큰을 요청해 정상 진행된다', async () => {
    fetchMock.mockResolvedValue(fetchResponse(true, 201))
    let call = 0
    const flakyGetToken = vi.fn(() => {
      call++
      return call === 1 ? Promise.reject(new Error('captcha-not-ready')) : Promise.resolve('token-ok')
    })

    const result = await registerPeople([person('가'), person('나')], BASE, flakyGetToken)

    expect(result).toEqual({ success: 1, dup: 0, fail: 1 })
    expect(flakyGetToken).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('registerPeople — PHASE 6A growthReward 집계', () => {
  it('1. 단일 성공 + growthReward 전달 → 응답 body의 growthReward를 그대로 결과에 담는다', async () => {
    const r = reward()
    fetchMock.mockResolvedValue(fetchResponseWithBody(201, { data: { id: 'p1' }, growthReward: r }))

    const result = await registerPeople([person('홍길동')], BASE, getToken)

    expect(result).toEqual({ success: 1, dup: 0, fail: 0, growthReward: r })
  })

  it('2. 성공 응답에 growthReward가 없으면 기존 success/dup/fail 결과만 반환한다', async () => {
    fetchMock.mockResolvedValue(fetchResponseWithBody(201, { data: { id: 'p1' } }))

    const result = await registerPeople([person('홍길동')], BASE, getToken)

    expect(result).toEqual({ success: 1, dup: 0, fail: 0 })
    expect(result.growthReward).toBeUndefined()
  })

  it('3. 성공 응답 body가 JSON이 아니어도 success는 유지되고 growthReward는 생략된다', async () => {
    fetchMock.mockResolvedValue(fetchResponseWithInvalidJson(201))

    const result = await registerPeople([person('홍길동')], BASE, getToken)

    expect(result).toEqual({ success: 1, dup: 0, fail: 0 })
    expect(result.growthReward).toBeUndefined()
  })

  it('4. 여러 명 성공 → 첫 성공 응답의 before + 마지막 성공 응답의 after로 배치 growthReward를 만든다', async () => {
    const first = reward({
      before: snapshot({ visibleProfileCount: 0 }),
      after: snapshot({ visibleProfileCount: 1 }),
      outcome: 'first_record',
    })
    const second = reward({
      before: snapshot({ visibleProfileCount: 1 }),
      after: snapshot({ visibleProfileCount: 2 }),
      outcome: 'progress',
    })
    fetchMock
      .mockResolvedValueOnce(fetchResponseWithBody(201, { data: { id: 'p1' }, growthReward: first }))
      .mockResolvedValueOnce(fetchResponseWithBody(201, { data: { id: 'p2' }, growthReward: second }))

    const result = await registerPeople([person('가'), person('나')], BASE, getToken)

    expect(result.success).toBe(2)
    expect(result.growthReward?.before).toEqual(first.before)
    expect(result.growthReward?.after).toEqual(second.after)
  })

  it('5. 중간에 duplicate가 섞여도 성공한 응답끼리만 growthReward가 집계된다', async () => {
    const first = reward({ before: snapshot({ visibleProfileCount: 0 }), after: snapshot({ visibleProfileCount: 1 }) })
    const third = reward({ before: snapshot({ visibleProfileCount: 1 }), after: snapshot({ visibleProfileCount: 2 }) })
    fetchMock
      .mockResolvedValueOnce(fetchResponseWithBody(201, { data: { id: 'p1' }, growthReward: first }))
      .mockResolvedValueOnce(fetchResponse(false, 409))
      .mockResolvedValueOnce(fetchResponseWithBody(201, { data: { id: 'p3' }, growthReward: third }))

    const result = await registerPeople([person('가'), person('나'), person('다')], BASE, getToken)

    expect(result).toMatchObject({ success: 2, dup: 1, fail: 0 })
    expect(result.growthReward?.before).toEqual(first.before)
    expect(result.growthReward?.after).toEqual(third.after)
  })

  it('6. 중간에 fail이 섞여도 성공한 응답끼리만 growthReward가 집계된다', async () => {
    const first = reward({ before: snapshot({ visibleProfileCount: 0 }), after: snapshot({ visibleProfileCount: 1 }) })
    const third = reward({ before: snapshot({ visibleProfileCount: 1 }), after: snapshot({ visibleProfileCount: 2 }) })
    fetchMock
      .mockResolvedValueOnce(fetchResponseWithBody(201, { data: { id: 'p1' }, growthReward: first }))
      .mockResolvedValueOnce(fetchResponse(false, 500))
      .mockResolvedValueOnce(fetchResponseWithBody(201, { data: { id: 'p3' }, growthReward: third }))

    const result = await registerPeople([person('가'), person('나'), person('다')], BASE, getToken)

    expect(result).toMatchObject({ success: 2, dup: 0, fail: 1 })
    expect(result.growthReward?.before).toEqual(first.before)
    expect(result.growthReward?.after).toEqual(third.after)
  })

  it('7. 모든 요청이 duplicate면 growthReward가 생성되지 않는다', async () => {
    fetchMock.mockResolvedValue(fetchResponse(false, 409))

    const result = await registerPeople([person('가'), person('나')], BASE, getToken)

    expect(result).toEqual({ success: 0, dup: 2, fail: 0 })
    expect(result.growthReward).toBeUndefined()
  })

  it('8. 모든 요청이 fail이면 growthReward가 생성되지 않는다', async () => {
    fetchMock.mockResolvedValue(fetchResponse(false, 500))

    const result = await registerPeople([person('가'), person('나')], BASE, getToken)

    expect(result).toEqual({ success: 0, dup: 0, fail: 2 })
    expect(result.growthReward).toBeUndefined()
  })

  it('9. 서로 다른 schoolId의 growthReward가 섞이면 배치 reward를 안전하게 생략한다(등록 결과 자체는 유지)', async () => {
    const first = reward({ schoolId: 'school-1' })
    const second = reward({ schoolId: 'school-2' })
    fetchMock
      .mockResolvedValueOnce(fetchResponseWithBody(201, { data: { id: 'p1' }, growthReward: first }))
      .mockResolvedValueOnce(fetchResponseWithBody(201, { data: { id: 'p2' }, growthReward: second }))

    const result = await registerPeople([person('가'), person('나')], BASE, getToken)

    expect(result).toMatchObject({ success: 2, dup: 0, fail: 0 })
    expect(result.growthReward).toBeUndefined()
  })

  it('10. 배치 최종 outcome은 첫/마지막 응답의 outcome을 그대로 쓰지 않고 결합된 before/after 기준으로 재계산된다', async () => {
    // 개별 응답은 각각 progress였지만, 배치 전체로 보면 레벨을 넘는 level_up이 되는 경우.
    const first = reward({
      before: snapshot({ visibleProfileCount: 139, effectiveLevel: 1 }),
      after: snapshot({ visibleProfileCount: 140, effectiveLevel: 1 }),
      outcome: 'progress',
    })
    const second = reward({
      before: snapshot({ visibleProfileCount: 140, effectiveLevel: 1 }),
      after: snapshot({ visibleProfileCount: 141, effectiveLevel: 2 }),
      outcome: 'level_up',
    })
    fetchMock
      .mockResolvedValueOnce(fetchResponseWithBody(201, { data: { id: 'p1' }, growthReward: first }))
      .mockResolvedValueOnce(fetchResponseWithBody(201, { data: { id: 'p2' }, growthReward: second }))

    const result = await registerPeople([person('가'), person('나')], BASE, getToken)

    expect(result.growthReward?.before.effectiveLevel).toBe(1)
    expect(result.growthReward?.after.effectiveLevel).toBe(2)
    expect(result.growthReward?.outcome).toBe('level_up')
  })
})

describe('registerPeople — PHASE 6A P1 수정: malformed growthReward 런타임 방어', () => {
  // 독립 감사에서 실제로 registerPeople() 전체를 reject시켰던 malformed 객체와 동일한 형태.
  const malformedSchoolId = { growthReward: { schoolId: 123, before: {}, after: {}, outcome: 'progress' } }

  it('1. schoolId가 문자열이 아니면(malformedSchoolId) reward 없이 success만 집계되고 reject되지 않는다', async () => {
    fetchMock.mockResolvedValue(fetchResponseWithBody(201, malformedSchoolId))

    const result = await registerPeople([person('홍길동')], BASE, getToken)

    expect(result).toEqual({ success: 1, dup: 0, fail: 0 })
    expect(result.growthReward).toBeUndefined()
  })

  it('2. before가 null이면 reward 없이 success만 집계되고 예외가 발생하지 않는다', async () => {
    const body = { growthReward: { schoolId: BASE.school_id, before: null, after: snapshot(), outcome: 'progress' } }
    fetchMock.mockResolvedValue(fetchResponseWithBody(201, body))

    const result = await registerPeople([person('홍길동')], BASE, getToken)

    expect(result).toEqual({ success: 1, dup: 0, fail: 0 })
    expect(result.growthReward).toBeUndefined()
  })

  it('3. after가 문자열이면 reward 없이 success만 집계되고 예외가 발생하지 않는다', async () => {
    const body = { growthReward: { schoolId: BASE.school_id, before: snapshot(), after: 'invalid', outcome: 'progress' } }
    fetchMock.mockResolvedValue(fetchResponseWithBody(201, body))

    const result = await registerPeople([person('홍길동')], BASE, getToken)

    expect(result).toEqual({ success: 1, dup: 0, fail: 0 })
    expect(result.growthReward).toBeUndefined()
  })

  it('4. 숫자 필드(remainingToNext)가 누락되면 reward가 생략된다', async () => {
    const { remainingToNext: _omit, ...brokenSnapshot } = snapshot()
    const body = {
      growthReward: { schoolId: BASE.school_id, before: brokenSnapshot, after: snapshot(), outcome: 'progress' },
    }
    fetchMock.mockResolvedValue(fetchResponseWithBody(201, body))

    const result = await registerPeople([person('홍길동')], BASE, getToken)

    expect(result).toEqual({ success: 1, dup: 0, fail: 0 })
    expect(result.growthReward).toBeUndefined()
  })

  it('5. 숫자 필드가 NaN 또는 Infinity면 reward가 생략된다', async () => {
    const nanBody = {
      growthReward: reward({ before: snapshot({ progressPercent: NaN }) }),
    }
    const infinityBody = {
      growthReward: reward({ after: snapshot({ remainingToNext: Infinity }) }),
    }
    fetchMock
      .mockResolvedValueOnce(fetchResponseWithBody(201, nanBody))
      .mockResolvedValueOnce(fetchResponseWithBody(201, infinityBody))

    const result = await registerPeople([person('가'), person('나')], BASE, getToken)

    expect(result).toEqual({ success: 2, dup: 0, fail: 0 })
    expect(result.growthReward).toBeUndefined()
  })

  it('6. outcome이 알 수 없는 값이면 reward가 생략된다', async () => {
    const body = { growthReward: reward({ outcome: 'unknown' as never }) }
    fetchMock.mockResolvedValue(fetchResponseWithBody(201, body))

    const result = await registerPeople([person('홍길동')], BASE, getToken)

    expect(result).toEqual({ success: 1, dup: 0, fail: 0 })
    expect(result.growthReward).toBeUndefined()
  })

  it('7. malformed reward가 정상 reward 사이에 있어도 성공/집계는 전부 유지되고 정상 reward만으로 배치가 조립된다', async () => {
    const first = reward({ before: snapshot({ visibleProfileCount: 0 }), after: snapshot({ visibleProfileCount: 1 }) })
    const third = reward({ before: snapshot({ visibleProfileCount: 1 }), after: snapshot({ visibleProfileCount: 2 }) })
    fetchMock
      .mockResolvedValueOnce(fetchResponseWithBody(201, { data: { id: 'p1' }, growthReward: first }))
      .mockResolvedValueOnce(fetchResponseWithBody(201, malformedSchoolId))
      .mockResolvedValueOnce(fetchResponseWithBody(201, { data: { id: 'p3' }, growthReward: third }))

    const result = await registerPeople([person('가'), person('나'), person('다')], BASE, getToken)

    expect(result.success).toBe(3)
    expect(result.dup).toBe(0)
    expect(result.fail).toBe(0)
    expect(result.growthReward?.before).toEqual(first.before)
    expect(result.growthReward?.after).toEqual(third.after)
    // before.visibleProfileCount=0, after.visibleProfileCount=2, effectiveLevel 변화 없음
    // → classifyRegistrationGrowthOutcome 규칙상 first_record로 재계산되어야 한다.
    expect(result.growthReward?.outcome).toBe('first_record')
  })

  it('8. malformed reward만 있는 여러 성공 응답은 success를 전부 유지하고 fail을 늘리지 않으며 reward는 생략된다', async () => {
    fetchMock.mockResolvedValue(fetchResponseWithBody(201, malformedSchoolId))

    const result = await registerPeople([person('가'), person('나'), person('다')], BASE, getToken)

    expect(result).toEqual({ success: 3, dup: 0, fail: 0 })
    expect(result.growthReward).toBeUndefined()
  })

  it('9. 정상 reward는 여전히 type guard를 통과해 기존 동작이 유지된다(회귀)', async () => {
    const r = reward()
    fetchMock.mockResolvedValue(fetchResponseWithBody(201, { data: { id: 'p1' }, growthReward: r }))

    const result = await registerPeople([person('홍길동')], BASE, getToken)

    expect(result).toEqual({ success: 1, dup: 0, fail: 0, growthReward: r })
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
