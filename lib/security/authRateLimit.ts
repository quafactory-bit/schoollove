import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

export type AuthRateLimitResult =
  | { allowed: true }
  | { allowed: false; status: 429 | 503; retryAfter?: number }

export async function checkAuthRateLimit(
  ip: string,
  action: 'request' | 'verify' = 'request'
): Promise<AuthRateLimitResult> {
  const configured = Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  )

  if (!configured) {
    if (process.env.NODE_ENV === 'production') {
      console.error('Auth rate limit configuration is missing in production.')
      return { allowed: false, status: 503 }
    }
    return { allowed: true }
  }

  const limiter = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(action === 'verify' ? 10 : 5, '10 m'),
    prefix: `schoollove:auth-email-otp:${action}`,
  })
  const result = await limiter.limit(ip)
  if (result.success) return { allowed: true }

  return {
    allowed: false,
    status: 429,
    retryAfter: Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)),
  }
}
