import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const rateMock = vi.hoisted(() => ({ counts: new Map<string, number>() }))

vi.mock('@upstash/redis', () => ({ Redis: { fromEnv: vi.fn(() => ({})) } }))
vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class {
    static slidingWindow(count: number, window: string) { return { count, window } }
    private count: number
    private prefix: string
    constructor(input: { limiter: { count: number }; prefix: string }) {
      this.count = input.limiter.count
      this.prefix = input.prefix
    }
    async limit(identity: string) {
      const key = `${this.prefix}:${identity}`
      const used = (rateMock.counts.get(key) ?? 0) + 1
      rateMock.counts.set(key, used)
      return { success: used <= this.count, reset: Date.now() + 60_000 }
    }
  },
}))

import { checkConnectionRateLimit, hashConnectionRateIdentity } from './connectionRateLimit'

describe('PHASE 10C connection rate limit', () => {
  beforeEach(() => {
    rateMock.counts.clear()
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://local.invalid')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'local-test-token')
  })

  afterEach(() => vi.unstubAllEnvs())

  it('IP와 account 원문 대신 서로 다른 SHA-256 key를 사용한다', () => {
    const ip = hashConnectionRateIdentity('ip', '203.0.113.10')
    const account = hashConnectionRateIdentity('account', '11111111-1111-4111-8111-111111111111')
    expect(ip).not.toContain('203.0.113.10')
    expect(account).not.toContain('11111111')
    expect(ip).not.toBe(account)
  })

  it('Production 설정 누락 시 fail-closed하고 IP/account를 모두 제한한다', () => {
    const source = readFileSync(join(process.cwd(), 'lib/security/connectionRateLimit.ts'), 'utf8')
    expect(source).toContain("process.env.NODE_ENV === 'production'")
    expect(source).toContain("status: 503")
    expect(source).toContain("hashConnectionRateIdentity('ip'")
    expect(source).toContain("hashConnectionRateIdentity('account'")
    expect(source).toContain('Promise.all')
    expect(source).toContain("search: { count: 5, window: '1 d' }")
  })

  it('search 5회만 허용하고 같은 window의 6번째 요청은 Retry-After와 함께 429를 반환한다', async () => {
    const input = { ip: '203.0.113.10', userId: '00000000-0000-4000-8000-000000000001', action: 'search' as const }
    for (let index = 0; index < 5; index += 1) {
      await expect(checkConnectionRateLimit(input)).resolves.toEqual({ allowed: true })
    }
    const sixth = await checkConnectionRateLimit(input)
    expect(sixth.allowed).toBe(false)
    expect(sixth).toMatchObject({ status: 429 })
    expect('retryAfter' in sixth ? sixth.retryAfter : 0).toBeGreaterThan(0)
  })

  it('IP와 account를 각각 독립된 5/day 축으로 제한한다', async () => {
    for (let index = 0; index < 5; index += 1) {
      await expect(checkConnectionRateLimit({
        ip: '203.0.113.11',
        userId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        action: 'search',
      })).resolves.toEqual({ allowed: true })
    }
    await expect(checkConnectionRateLimit({
      ip: '203.0.113.11', userId: '00000000-0000-4000-8000-000000000099', action: 'search',
    })).resolves.toMatchObject({ allowed: false, status: 429 })

    rateMock.counts.clear()
    for (let index = 0; index < 5; index += 1) {
      await expect(checkConnectionRateLimit({
        ip: `203.0.113.${20 + index}`,
        userId: '00000000-0000-4000-8000-000000000100',
        action: 'search',
      })).resolves.toEqual({ allowed: true })
    }
    await expect(checkConnectionRateLimit({
      ip: '203.0.113.30', userId: '00000000-0000-4000-8000-000000000100', action: 'search',
    })).resolves.toMatchObject({ allowed: false, status: 429 })
  })

  it('Production에서 Redis 설정이 없으면 외부 호출 없이 503으로 fail-closed한다', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
    await expect(checkConnectionRateLimit({
      ip: '203.0.113.12', userId: '00000000-0000-4000-8000-000000000101', action: 'search',
    })).resolves.toEqual({ allowed: false, status: 503 })
    expect(rateMock.counts.size).toBe(0)
  })
})
