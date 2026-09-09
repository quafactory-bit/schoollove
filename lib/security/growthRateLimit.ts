import { createHash } from 'node:crypto'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { getRequestIp } from './connectionRateLimit'

export async function allowGrowthVisit(request: Request): Promise<boolean> {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return process.env.NODE_ENV !== 'production'
  try {
    const key = createHash('sha256').update(getRequestIp(request)).digest('hex')
    const limiter = new Ratelimit({ redis: Redis.fromEnv(), limiter: Ratelimit.slidingWindow(10, '10 m'), prefix: 'schoollove:growth-visit' })
    return (await limiter.limit(key)).success
  } catch { return false }
}
