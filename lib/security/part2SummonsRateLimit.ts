import { createHash } from 'node:crypto'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { getRequestIp } from './connectionRateLimit'

/**
 * Public summons takedown/report: 10 per IP per 10 minutes.
 * Report fails closed without a working limiter. Takedown is a privacy request, so it is never
 * blocked by a limiter outage (it only hides the card; it cannot reveal anything).
 */
export async function allowPart2SummonsAction(request: Request, action: 'takedown' | 'report'): Promise<boolean> {
  const failOpen = action === 'takedown'
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return failOpen || process.env.NODE_ENV !== 'production'
  try {
    const key = createHash('sha256').update(getRequestIp(request)).digest('hex')
    const limiter = new Ratelimit({ redis: Redis.fromEnv(), limiter: Ratelimit.slidingWindow(10, '10 m'), prefix: `schoollove:part2-summons-${action}` })
    return (await limiter.limit(key)).success
  } catch {
    return failOpen
  }
}
