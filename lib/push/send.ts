import 'server-only'

import { Redis } from '@upstash/redis'
import webpush, { type PushSubscription as WebPushSubscription } from 'web-push'
import { getSupabaseAdmin } from '@/lib/supabase'
import {
  buildPushRateLimitKey,
  buildSchoolmatePushPayload,
  chunkPushSubscriptions,
  type PushPayload,
} from '@/lib/push/contracts'

const DELIVERY_LIMIT = 500
const RATE_LIMIT_SECONDS = 24 * 60 * 60

type PushSubscriptionRow = {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
}

type VapidConfig = {
  subject: string
  publicKey: string
  privateKey: string
}

export type SchoolmatePushInput = {
  actorUserId: string
  schoolId: string
  graduationYear: number
}

export type PushDeliverySummary = {
  attempted: number
  delivered: number
  expired: number
  rateLimited: number
}

function getVapidConfig(): VapidConfig | null {
  const subject = process.env.VAPID_SUBJECT?.trim()
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim()
  if (!subject || !publicKey || !privateKey) return null
  if (!/^mailto:.+@.+\..+$|^https:\/\//.test(subject)) return null
  return { subject, publicKey, privateKey }
}

function getRateLimitRedis(): Redis | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null
  return Redis.fromEnv()
}

function toWebPushSubscription(row: PushSubscriptionRow): WebPushSubscription {
  return {
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth },
  }
}

function getStatusCode(error: unknown): number | null {
  if (!error || typeof error !== 'object' || !('statusCode' in error)) return null
  const value = (error as { statusCode?: unknown }).statusCode
  return typeof value === 'number' ? value : null
}

async function sendOne(
  row: PushSubscriptionRow,
  payload: PushPayload,
  config: VapidConfig,
  redis: Redis,
): Promise<'delivered' | 'expired' | 'rate-limited' | 'failed'> {
  const allowed = await redis.set(buildPushRateLimitKey(row.endpoint), 1, {
    nx: true,
    ex: RATE_LIMIT_SECONDS,
  })
  if (allowed !== 'OK') return 'rate-limited'

  try {
    await webpush.sendNotification(toWebPushSubscription(row), JSON.stringify(payload), {
      TTL: 60 * 60,
      urgency: 'normal',
      vapidDetails: config,
    })
    return 'delivered'
  } catch (error) {
    const statusCode = getStatusCode(error)
    if (statusCode === 404 || statusCode === 410) {
      try {
        await getSupabaseAdmin().from('push_subscriptions').delete().eq('id', row.id)
      } catch {
        // Delivery cleanup must never escape into the membership response path.
      }
      return 'expired'
    }
    return 'failed'
  }
}

async function loadRecipients(input: SchoolmatePushInput): Promise<{
  schoolName: string
  schoolSlug: string
  subscriptions: PushSubscriptionRow[]
} | null> {
  const admin = getSupabaseAdmin()
  const { data: school, error: schoolError } = await admin
    .from('schools')
    .select('school_name,slug')
    .eq('id', input.schoolId)
    .maybeSingle()
  if (schoolError || !school?.school_name || !school.slug) return null

  const { data: memberships, error: membershipError } = await admin
    .from('profile_school_memberships')
    .select('owner_user_id')
    .eq('school_id', input.schoolId)
    .eq('graduation_year', input.graduationYear)
    .neq('owner_user_id', input.actorUserId)
    .order('created_at', { ascending: true })
    .limit(DELIVERY_LIMIT)
  if (membershipError || !memberships?.length) return null

  const userIds = [...new Set(memberships.flatMap((row) =>
    typeof row.owner_user_id === 'string' ? [row.owner_user_id] : [],
  ))]
  const subscriptions: PushSubscriptionRow[] = []
  for (const userChunk of chunkPushSubscriptions(userIds, 100)) {
    if (subscriptions.length >= DELIVERY_LIMIT) break
    const { data, error } = await admin
      .from('push_subscriptions')
      .select('id,user_id,endpoint,p256dh,auth')
      .in('user_id', userChunk)
      .order('created_at', { ascending: true })
      .limit(DELIVERY_LIMIT - subscriptions.length)
    if (error) return null
    subscriptions.push(...((data ?? []) as PushSubscriptionRow[]))
  }

  return {
    schoolName: school.school_name,
    schoolSlug: school.slug,
    subscriptions: subscriptions.slice(0, DELIVERY_LIMIT),
  }
}

export async function sendSchoolmateRegistrationPush(
  input: SchoolmatePushInput,
): Promise<PushDeliverySummary> {
  const summary: PushDeliverySummary = { attempted: 0, delivered: 0, expired: 0, rateLimited: 0 }
  try {
    const config = getVapidConfig()
    const redis = getRateLimitRedis()
    if (!config || !redis) return summary

    const recipients = await loadRecipients(input)
    if (!recipients?.subscriptions.length) return summary
    const payload = buildSchoolmatePushPayload(
      recipients.schoolName,
      recipients.schoolSlug,
      input.graduationYear,
    )

    summary.attempted = recipients.subscriptions.length
    for (const batch of chunkPushSubscriptions(recipients.subscriptions)) {
      const outcomes = await Promise.allSettled(
        batch.map((subscription) => sendOne(subscription, payload, config, redis)),
      )
      for (const outcome of outcomes) {
        if (outcome.status !== 'fulfilled') continue
        if (outcome.value === 'delivered') summary.delivered += 1
        if (outcome.value === 'expired') summary.expired += 1
        if (outcome.value === 'rate-limited') summary.rateLimited += 1
      }
    }
  } catch {
    // Push is deliberately best-effort and must not affect registration success.
  }
  return summary
}

export async function sendAdminTestPush(subscription: WebPushSubscription): Promise<void> {
  const config = getVapidConfig()
  if (!config) throw new Error('PUSH_NOT_CONFIGURED')
  const payload: PushPayload = {
    title: '스쿨러브아이',
    body: '테스트 알림이 정상적으로 도착했어요.',
    url: '/admin',
  }
  await webpush.sendNotification(subscription, JSON.stringify(payload), {
    TTL: 5 * 60,
    urgency: 'normal',
    vapidDetails: config,
  })
}
