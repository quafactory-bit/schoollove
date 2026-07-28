import { createHash } from 'node:crypto'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

export type PromotionRateAction = 'account' | 'verification' | 'request' | 'report'
type Result = { allowed: true } | { allowed: false; status: 429 | 503; retryAfter?: number }

const rules: Record<PromotionRateAction, { count: number; window: `${number} ${'m' | 'h' | 'd'}` }> = {
  account: { count: 5, window: '1 d' }, verification: { count: 5, window: '1 h' },
  request: { count: 10, window: '1 d' }, report: { count: 10, window: '1 d' },
}

const hash = (kind: string, value: string) => `${kind}:${createHash('sha256').update(value.trim().toLowerCase()).digest('hex')}`

export async function checkPromotionRateLimit(input: { ip: string; userId: string; action: PromotionRateAction }): Promise<Result> {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    if (process.env.NODE_ENV === 'production') return { allowed: false, status: 503 }
    return { allowed: true }
  }
  const rule = rules[input.action]
  const limiter = new Ratelimit({ redis: Redis.fromEnv(), limiter: Ratelimit.slidingWindow(rule.count, rule.window), prefix: `schoollove:promotions:${input.action}` })
  const [ipResult, accountResult] = await Promise.all([limiter.limit(hash('ip', input.ip)), limiter.limit(hash('account', input.userId))])
  if (ipResult.success && accountResult.success) return { allowed: true }
  return { allowed: false, status: 429, retryAfter: Math.max(1, Math.ceil((Math.max(ipResult.reset, accountResult.reset) - Date.now()) / 1000)) }
}

export const getPromotionRequestIp = (request: Request) => request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip')?.trim() || 'unknown'
