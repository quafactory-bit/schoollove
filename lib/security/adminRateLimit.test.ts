import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkAdminLoginRateLimit } from './adminRateLimit'

afterEach(() => { vi.unstubAllEnvs() })

describe('admin login rate limit', () => {
  it('fails closed in production without Upstash', async () => {
    vi.stubEnv('NODE_ENV','production')
    vi.stubEnv('UPSTASH_REDIS_REST_URL','')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN','')
    await expect(checkAdminLoginRateLimit('127.0.0.1')).resolves.toEqual({allowed:false,status:503})
  })

  it('allows isolated local testing without remote Redis', async () => {
    vi.stubEnv('NODE_ENV','test')
    vi.stubEnv('UPSTASH_REDIS_REST_URL','')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN','')
    await expect(checkAdminLoginRateLimit('127.0.0.1')).resolves.toEqual({allowed:true})
  })
})
