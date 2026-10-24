import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Array<Record<string, unknown>>>,
  sent: [] as Array<{ endpoint: string; payload: { title: string; body: string; url: string } }>,
  redis: new Map<string, number>(),
}))

vi.mock('server-only', () => ({}))
vi.mock('web-push', () => ({ default: { sendNotification: vi.fn(async (subscription: { endpoint: string }, body: string) => { state.sent.push({ endpoint: subscription.endpoint, payload: JSON.parse(body) }) }) } }))
vi.mock('@upstash/redis', () => ({
  Redis: { fromEnv: () => ({
    set: async (key: string) => { if (state.redis.has(key)) return null; state.redis.set(key, 1); return 'OK' },
    incr: async (key: string) => { const next = (state.redis.get(key) ?? 0) + 1; state.redis.set(key, next); return next },
    expire: async () => 1,
  }) },
}))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => ({ from: (table: string) => query(table) }) }))

// 아주 작은 가짜 쿼리 빌더: eq/in/is/neq 필터와 maybeSingle·then만 지원한다.
function query(table: string) {
  let rows = [...(state.tables[table] ?? [])]
  const chain = {
    select: () => chain,
    eq: (column: string, value: unknown) => { rows = rows.filter(row => row[column] === value); return chain },
    in: (column: string, values: unknown[]) => { rows = rows.filter(row => values.includes(row[column])); return chain },
    is: (column: string, value: unknown) => { rows = rows.filter(row => (row[column] ?? null) === value); return chain },
    order: () => chain,
    limit: () => chain,
    delete: () => chain,
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    then: (resolve: (value: { data: unknown; error: null }) => unknown, reject?: (error: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve, reject),
  }
  return chain
}

import { notifyConnectionRequest, notifyNewRosterMember, notifyRequestAccepted } from './send'

const SCHOOL = 's1'
const daytime = new Date('2026-10-23T03:00:00Z') // 12:00 KST
const night = new Date('2026-10-23T15:00:00Z') // 00:00 KST
const POLICY = 'school-roster-2026-09-28'

function member(id: string, user: string, year: number, visible = true) {
  state.tables.profile_school_memberships.push({ id, owner_user_id: user, school_id: SCHOOL, graduation_year: year })
  if (visible) state.tables.school_roster_consents.push({ membership_id: id, owner_user_id: user, withdrawn_at: null, policy_version: POLICY })
  state.tables.private_profiles.push({ owner_user_id: user, display_name: `이름${user}`, status: 'active' })
  state.tables.push_subscriptions.push({ id: `sub-${user}`, user_id: user, endpoint: `https://push.example/${user}`, p256dh: 'k', auth: 'a' })
}

beforeEach(() => {
  vi.stubEnv('VAPID_SUBJECT', 'mailto:ops@example.com')
  vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'public')
  vi.stubEnv('VAPID_PRIVATE_KEY', 'private')
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example')
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token')
  state.sent = []
  state.redis = new Map()
  state.tables = { profile_school_memberships: [], school_roster_consents: [], private_profiles: [], push_subscriptions: [], schools: [{ id: SCHOOL, school_name: '서초고등학교' }], connection_requests: [] }
})

describe('v2-09a new member push', () => {
  it('notifies same school·year roster members with the total (no name), not the actor or hidden members', async () => {
    member('m1', 'actor', 2005); member('m2', 'friend', 2005); member('m3', 'hidden', 2005, false); member('m4', 'other-year', 2006)
    const summary = await notifyNewRosterMember({ actorUserId: 'actor', schoolId: SCHOOL, graduationYear: 2005 }, daytime)
    expect(summary.delivered).toBe(1)
    expect(state.sent).toEqual([{ endpoint: 'https://push.example/friend', payload: expect.objectContaining({ title: '서초고 2005년에 새 동문이 들어왔어요', body: '출석부에 새 이름이 올라왔어요. 이제 2명이에요.', url: '/account' }) }])
  })

  it('sends nothing when the actor is not on the roster, at night, or without VAPID keys', async () => {
    member('m1', 'actor', 2005, false); member('m2', 'friend', 2005)
    expect((await notifyNewRosterMember({ actorUserId: 'actor', schoolId: SCHOOL, graduationYear: 2005 }, daytime)).attempted).toBe(0)
    state.tables.school_roster_consents.push({ membership_id: 'm1', owner_user_id: 'actor', withdrawn_at: null, policy_version: POLICY })
    expect((await notifyNewRosterMember({ actorUserId: 'actor', schoolId: SCHOOL, graduationYear: 2005 }, night)).attempted).toBe(0)
    vi.stubEnv('VAPID_PRIVATE_KEY', '')
    expect((await notifyNewRosterMember({ actorUserId: 'actor', schoolId: SCHOOL, graduationYear: 2005 }, daytime)).attempted).toBe(0)
    expect(state.sent).toEqual([])
  })

  it('bundles within an hour and caps at 3 per recipient per KST day', async () => {
    member('m0', 'friend', 2005)
    for (let index = 1; index <= 5; index += 1) member(`a${index}`, `actor${index}`, 2005)
    await notifyNewRosterMember({ actorUserId: 'actor1', schoolId: SCHOOL, graduationYear: 2005 }, daytime)
    await notifyNewRosterMember({ actorUserId: 'actor2', schoolId: SCHOOL, graduationYear: 2005 }, daytime)
    expect(state.sent.filter(item => item.endpoint.endsWith('/friend'))).toHaveLength(1) // 1시간 묶음
    for (let index = 3; index <= 5; index += 1) {
      for (const key of [...state.redis.keys()]) if (key.includes(':1h:')) state.redis.delete(key) // 1시간 지남
      await notifyNewRosterMember({ actorUserId: `actor${index}`, schoolId: SCHOOL, graduationYear: 2005 }, daytime)
    }
    expect(state.sent.filter(item => item.endpoint.endsWith('/friend'))).toHaveLength(3) // 하루 상한
  })
})

describe('v2-09a request / accepted push', () => {
  beforeEach(() => {
    member('ms', 'sender', 2005); member('mr', 'receiver', 2006)
    state.tables.connection_requests.push({ id: 'r1', sender_user_id: 'sender', receiver_user_id: 'receiver', target_school_membership_id: 'mr' })
  })

  it('request → receiver, fixed copy without names', async () => {
    await notifyConnectionRequest('r1', daytime)
    expect(state.sent).toEqual([{ endpoint: 'https://push.example/receiver', payload: expect.objectContaining({ title: '같은 학교 동문이 인스타 주소를 요청했어요', url: '/notifications' }) }])
    expect(JSON.stringify(state.sent)).not.toContain('이름')
  })

  it('accepted → sender, fixed copy without names', async () => {
    await notifyRequestAccepted('r1', daytime)
    expect(state.sent).toEqual([{ endpoint: 'https://push.example/sender', payload: expect.objectContaining({ title: '요청이 수락됐어요' }) }])
    expect(JSON.stringify(state.sent)).not.toContain('이름')
  })

  it('no request push during quiet hours', async () => {
    await notifyConnectionRequest('r1', night)
    expect(state.sent).toEqual([])
  })
})
