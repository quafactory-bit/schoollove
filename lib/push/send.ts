import 'server-only'

import { Redis } from '@upstash/redis'
import webpush, { type PushSubscription as WebPushSubscription } from 'web-push'
import { getSupabaseAdmin } from '@/lib/supabase'
import {
  NEW_MEMBER_BUNDLE_SECONDS, NEW_MEMBER_DAILY_CAP, buildAcceptedPayload, buildNewMemberPayload, buildRequestPayload,
  chunkPushSubscriptions, isQuietHourKst, newMemberBundleKey, newMemberDailyKey, type PushPayload,
} from '@/lib/push/contracts'

// v2-09a: 즉시 발송 + 새 동문 하루 3건 상한 + 1시간 묶음 + 23:00~07:00 KST 미발송.
// 푸시는 부가 기능이라 실패해도 학교 등록·요청·수락 결과를 바꾸지 않는다(호출부는 after()에서 부른다).
const DELIVERY_LIMIT = 500
const ROSTER_POLICY = 'school-roster-2026-09-28'

type PushSubscriptionRow = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }
type VapidConfig = { subject: string; publicKey: string; privateKey: string }
export type PushDeliverySummary = { attempted: number; delivered: number; expired: number; skipped: number }

const emptySummary = (): PushDeliverySummary => ({ attempted: 0, delivered: 0, expired: 0, skipped: 0 })

function getVapidConfig(): VapidConfig | null {
  const subject = process.env.VAPID_SUBJECT?.trim()
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim()
  if (!subject || !publicKey || !privateKey) return null
  if (!/^mailto:.+@.+\..+$|^https:\/\//.test(subject)) return null
  return { subject, publicKey, privateKey }
}

function getRedis(): Redis | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null
  return Redis.fromEnv()
}

function getStatusCode(error: unknown): number | null {
  if (!error || typeof error !== 'object' || !('statusCode' in error)) return null
  const value = (error as { statusCode?: unknown }).statusCode
  return typeof value === 'number' ? value : null
}

async function sendToUsers(userIds: string[], payload: PushPayload, config: VapidConfig, summary: PushDeliverySummary) {
  if (!userIds.length) return
  const admin = getSupabaseAdmin()
  const subscriptions: PushSubscriptionRow[] = []
  for (const userChunk of chunkPushSubscriptions([...new Set(userIds)], 100)) {
    if (subscriptions.length >= DELIVERY_LIMIT) break
    const { data, error } = await admin.from('push_subscriptions').select('id,user_id,endpoint,p256dh,auth')
      .in('user_id', userChunk).order('created_at', { ascending: true }).limit(DELIVERY_LIMIT - subscriptions.length)
    if (error) return
    subscriptions.push(...((data ?? []) as PushSubscriptionRow[]))
  }
  summary.attempted += subscriptions.length
  for (const batch of chunkPushSubscriptions(subscriptions)) {
    const outcomes = await Promise.allSettled(batch.map(async row => {
      const subscription: WebPushSubscription = { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }
      try {
        await webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 60 * 60, urgency: 'normal', vapidDetails: config })
        return 'delivered'
      } catch (error) {
        const status = getStatusCode(error)
        if (status === 404 || status === 410) {
          await admin.from('push_subscriptions').delete().eq('id', row.id).then(() => undefined, () => undefined)
          return 'expired'
        }
        return 'failed'
      }
    }))
    for (const outcome of outcomes) {
      if (outcome.status !== 'fulfilled') continue
      if (outcome.value === 'delivered') summary.delivered += 1
      if (outcome.value === 'expired') summary.expired += 1
    }
  }
}

// 같은 학교에서 명단 표시를 켠(동의 철회 전) 활성 회원의 학교 이력. 이름 공개 여부와 수신자 판단에만 쓴다.
async function rosterMembers(schoolId: string, graduationYear?: number): Promise<Array<{ owner_user_id: string; graduation_year: number }>> {
  const admin = getSupabaseAdmin()
  let query = admin.from('profile_school_memberships').select('id,owner_user_id,graduation_year').eq('school_id', schoolId)
  if (graduationYear !== undefined) query = query.eq('graduation_year', graduationYear)
  const { data: memberships, error } = await query.limit(DELIVERY_LIMIT * 2)
  if (error || !memberships?.length) return []
  const ids = memberships.map((row: { id: string }) => row.id)
  const { data: consents } = await admin.from('school_roster_consents').select('membership_id,owner_user_id')
    .in('membership_id', ids).is('withdrawn_at', null).eq('policy_version', ROSTER_POLICY)
  const visible = new Set((consents ?? []).map((row: { membership_id: string }) => row.membership_id))
  const owners = [...new Set(memberships.filter((row: { id: string }) => visible.has(row.id)).map((row: { owner_user_id: string }) => row.owner_user_id))]
  if (!owners.length) return []
  const { data: profiles } = await admin.from('private_profiles').select('owner_user_id').in('owner_user_id', owners).eq('status', 'active')
  const active = new Set((profiles ?? []).map((row: { owner_user_id: string }) => row.owner_user_id))
  return memberships
    .filter((row: { id: string; owner_user_id: string }) => visible.has(row.id) && active.has(row.owner_user_id))
    .map((row: { owner_user_id: string; graduation_year: number }) => ({ owner_user_id: row.owner_user_id, graduation_year: row.graduation_year }))
}

export async function notifyNewRosterMember(input: { actorUserId: string; schoolId: string; graduationYear: number }, now = new Date()): Promise<PushDeliverySummary> {
  const summary = emptySummary()
  try {
    const config = getVapidConfig()
    const redis = getRedis()
    if (!config || !redis || isQuietHourKst(now)) return summary
    const members = await rosterMembers(input.schoolId, input.graduationYear)
    // 보낸 사람이 명단 표시를 켠 경우에만 알린다(출석부에 실제로 보이는 등록만).
    if (!members.some(row => row.owner_user_id === input.actorUserId)) return summary
    const recipients = [...new Set(members.map(row => row.owner_user_id))].filter(userId => userId !== input.actorUserId)
    if (!recipients.length) return summary
    const { data: school } = await getSupabaseAdmin().from('schools').select('school_name').eq('id', input.schoolId).maybeSingle()
    const schoolName = (school as { school_name?: string } | null)?.school_name
    if (!schoolName) return summary
    const payload = buildNewMemberPayload({ schoolName, graduationYear: input.graduationYear, total: new Set(members.map(row => row.owner_user_id)).size })

    const allowed: string[] = []
    for (const userId of recipients) {
      const bundled = await redis.set(newMemberBundleKey(userId, input.schoolId, input.graduationYear), 1, { nx: true, ex: NEW_MEMBER_BUNDLE_SECONDS })
      if (bundled !== 'OK') { summary.skipped += 1; continue }
      const dailyKey = newMemberDailyKey(userId, now)
      const count = await redis.incr(dailyKey)
      if (count === 1) await redis.expire(dailyKey, 2 * 24 * 60 * 60)
      if (count > NEW_MEMBER_DAILY_CAP) { summary.skipped += 1; continue }
      allowed.push(userId)
    }
    await sendToUsers(allowed, payload, config, summary)
  } catch {
    // Push is best-effort and never affects the registration result.
  }
  return summary
}

type RequestRow = { sender_user_id: string; receiver_user_id: string; target_school_membership_id: string | null }

async function requestRow(requestId: string): Promise<RequestRow | null> {
  const { data } = await getSupabaseAdmin().from('connection_requests').select('sender_user_id,receiver_user_id,target_school_membership_id').eq('id', requestId).maybeSingle()
  return data as RequestRow | null
}

export async function notifyConnectionRequest(requestId: string, now = new Date()): Promise<PushDeliverySummary> {
  const summary = emptySummary()
  try {
    const config = getVapidConfig()
    if (!config || isQuietHourKst(now)) return summary
    const row = await requestRow(requestId)
    if (!row) return summary
    await sendToUsers([row.receiver_user_id], buildRequestPayload(), config, summary)
  } catch {
    // Push is best-effort and never affects the request result.
  }
  return summary
}

export async function notifyRequestAccepted(requestId: string, now = new Date()): Promise<PushDeliverySummary> {
  const summary = emptySummary()
  try {
    const config = getVapidConfig()
    if (!config || isQuietHourKst(now)) return summary
    const row = await requestRow(requestId)
    if (!row) return summary
    await sendToUsers([row.sender_user_id], buildAcceptedPayload(), config, summary)
  } catch {
    // Push is best-effort and never affects the accept result.
  }
  return summary
}

export async function sendAdminTestPush(subscription: WebPushSubscription): Promise<void> {
  const config = getVapidConfig()
  if (!config) throw new Error('PUSH_NOT_CONFIGURED')
  const payload: PushPayload = { title: '스쿨러브아이', body: '테스트 알림이 정상적으로 도착했어요.', url: '/admin', tag: 'schoollove-admin-test' }
  await webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 5 * 60, urgency: 'normal', vapidDetails: config })
}
