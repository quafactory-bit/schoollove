import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  redisSet: vi.fn(),
  sendNotification: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({ from: mocks.from }),
}))
vi.mock('@upstash/redis', () => ({
  Redis: { fromEnv: () => ({ set: mocks.redisSet }) },
}))
vi.mock('web-push', () => ({
  default: { sendNotification: mocks.sendNotification },
}))

import { sendSchoolmateRegistrationPush } from './send'

const schoolResult = { data: { school_name: '테스트고등학교', slug: 'test-school' }, error: null }
const membershipResult = {
  data: [{ owner_user_id: 'user-2' }, { owner_user_id: 'user-3' }],
  error: null,
}
const subscriptions = [
  { id: 'sub-1', user_id: 'user-2', endpoint: 'https://push.test/1', p256dh: 'key-1', auth: 'auth-1' },
  { id: 'sub-2', user_id: 'user-3', endpoint: 'https://push.test/2', p256dh: 'key-2', auth: 'auth-2' },
]

function query(final: Record<string, unknown>) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    neq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    in: vi.fn(() => builder),
    limit: vi.fn(async () => final),
    maybeSingle: vi.fn(async () => final),
  }
  return builder
}

function arrangeRecipients(deleteResult = { error: null }) {
  const school = query(schoolResult)
  const memberships = query(membershipResult)
  const subscriptionQuery = query({ data: subscriptions, error: null })
  const deleteEq = vi.fn(async () => deleteResult)
  const deleteQuery = { eq: deleteEq }
  mocks.from.mockImplementation((table: string) => {
    if (table === 'schools') return school
    if (table === 'profile_school_memberships') return memberships
    if (table === 'push_subscriptions') {
      return {
        select: () => subscriptionQuery,
        delete: () => deleteQuery,
      }
    }
    throw new Error(`unexpected table ${table}`)
  })
  return { school, memberships, subscriptionQuery, deleteEq }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'public-key')
  vi.stubEnv('VAPID_PRIVATE_KEY', 'private-key')
  vi.stubEnv('VAPID_SUBJECT', 'mailto:schoollove.contact@gmail.com')
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test')
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'redis-token')
  mocks.redisSet.mockResolvedValue('OK')
  mocks.sendNotification.mockResolvedValue({ statusCode: 201 })
})

describe('schoolmate push delivery', () => {
  it('같은 학교·졸업연도의 다른 사용자 구독에 개인정보 없는 payload를 보낸다', async () => {
    const { memberships } = arrangeRecipients()
    const summary = await sendSchoolmateRegistrationPush({
      actorUserId: 'actor-user', schoolId: 'school-1', graduationYear: 2014,
    })

    expect(memberships.neq).toHaveBeenCalledWith('owner_user_id', 'actor-user')
    expect(mocks.sendNotification).toHaveBeenCalledTimes(2)
    expect(mocks.sendNotification.mock.calls[0][1]).toBe(JSON.stringify({
      title: '스쿨러브아이',
      body: '테스트고등학교 2014년 졸업 동창이 새로 들어왔어요. 누군지 확인해보세요',
      url: '/school/test-school/2014?utm_source=push',
    }))
    expect(summary).toEqual({ attempted: 2, delivered: 2, expired: 0, rateLimited: 0 })
  })

  it('24시간 Redis 키가 이미 있으면 해당 구독을 보내지 않는다', async () => {
    arrangeRecipients()
    mocks.redisSet.mockResolvedValue(null)
    const summary = await sendSchoolmateRegistrationPush({
      actorUserId: 'actor-user', schoolId: 'school-1', graduationYear: 2014,
    })

    expect(mocks.sendNotification).not.toHaveBeenCalled()
    expect(summary).toEqual({ attempted: 2, delivered: 0, expired: 0, rateLimited: 2 })
  })

  it('푸시 서비스 410 응답은 만료 구독을 삭제하고 다음 구독을 계속 처리한다', async () => {
    const { deleteEq } = arrangeRecipients()
    mocks.sendNotification
      .mockRejectedValueOnce({ statusCode: 410 })
      .mockResolvedValueOnce({ statusCode: 201 })
    const summary = await sendSchoolmateRegistrationPush({
      actorUserId: 'actor-user', schoolId: 'school-1', graduationYear: 2014,
    })

    expect(deleteEq).toHaveBeenCalledWith('id', 'sub-1')
    expect(summary).toEqual({ attempted: 2, delivered: 1, expired: 1, rateLimited: 0 })
  })

  it('VAPID 설정이 없으면 DB나 외부 푸시 서비스를 호출하지 않는다', async () => {
    vi.stubEnv('VAPID_PRIVATE_KEY', '')
    const summary = await sendSchoolmateRegistrationPush({
      actorUserId: 'actor-user', schoolId: 'school-1', graduationYear: 2014,
    })

    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.sendNotification).not.toHaveBeenCalled()
    expect(summary.attempted).toBe(0)
  })
})
