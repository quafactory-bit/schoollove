import { createHash } from 'node:crypto'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { getRequestIp } from './connectionRateLimit'
export async function allowPart2Funnel(request: Request): Promise<boolean> {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return process.env.NODE_ENV !== 'production'
  try {
    const key = createHash('sha256').update(getRequestIp(request)).digest('hex')
    const limiter = new Ratelimit({redis:Redis.fromEnv(),limiter:Ratelimit.slidingWindow(80,'10 m'),prefix:'schoollove:part2-funnel'})
    return (await limiter.limit(key)).success
  } catch { return false }
}
