import { createHash } from 'node:crypto'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

export async function checkAdminLoginRateLimit(ip: string) {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    if (process.env.NODE_ENV === 'production') return { allowed: false as const, status: 503 as const }
    return { allowed: true as const }
  }
  const limiter = new Ratelimit({ redis: Redis.fromEnv(), limiter: Ratelimit.slidingWindow(5, '15 m'), prefix: 'schoollove:admin-login' })
  const key = createHash('sha256').update(ip.trim()).digest('hex')
  const result = await limiter.limit(key)
  return result.success
    ? { allowed: true as const }
    : { allowed: false as const, status: 429 as const, retryAfter: Math.max(1, Math.ceil((result.reset-Date.now())/1000)) }
}
