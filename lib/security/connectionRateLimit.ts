import { createHash } from 'node:crypto'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

export type ConnectionRateAction =
  | 'search'
  | 'request'
  | 'reminder'
  | 'response'
  | 'message'
  | 'instagram'
  | 'report'

type RateResult = { allowed: true } | { allowed: false; status: 429 | 503; retryAfter?: number }

export function hashConnectionRateIdentity(kind: 'ip' | 'account', value: string): string {
  return `${kind}:${createHash('sha256').update(value.trim().toLowerCase()).digest('hex')}`
}

const limits: Record<ConnectionRateAction, { count: number; window: `${number} ${'s' | 'm' | 'h' | 'd'}` }> = {
  search: { count: 5, window: '1 d' },
  request: { count: 5, window: '1 d' },
  reminder: { count: 3, window: '1 d' },
  response: { count: 20, window: '10 m' },
  message: { count: 30, window: '1 m' },
  instagram: { count: 10, window: '10 m' },
  report: { count: 5, window: '1 d' },
}

export async function checkConnectionRateLimit(input: {
  ip: string
  userId: string
  action: ConnectionRateAction
}): Promise<RateResult> {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    if (process.env.NODE_ENV === 'production') {
      console.error('Connection rate limit configuration is missing in production.')
      return { allowed: false, status: 503 }
    }
    return { allowed: true }
  }

  const rule = limits[input.action]
  const limiter = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(rule.count, rule.window),
    prefix: `schoollove:connections:${input.action}`,
  })
  const [ipResult, accountResult] = await Promise.all([
    limiter.limit(hashConnectionRateIdentity('ip', input.ip)),
    limiter.limit(hashConnectionRateIdentity('account', input.userId)),
  ])
  if (ipResult.success && accountResult.success) return { allowed: true }

  const reset = Math.max(ipResult.reset, accountResult.reset)
  return { allowed: false, status: 429, retryAfter: Math.max(1, Math.ceil((reset - Date.now()) / 1000)) }
}

export function getRequestIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')?.trim()
    || 'unknown'
}
