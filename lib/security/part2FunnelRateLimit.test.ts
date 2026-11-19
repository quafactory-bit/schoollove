import { afterEach,describe,expect,it,vi } from 'vitest'
const mocks=vi.hoisted(()=>({limit:vi.fn()}))
vi.mock('@upstash/redis',()=>({Redis:{fromEnv:()=>({})}}))
vi.mock('@upstash/ratelimit',()=>({Ratelimit:class {static slidingWindow(){return {}};limit=mocks.limit}}))
import { allowPart2Funnel } from './part2FunnelRateLimit'
afterEach(()=>vi.unstubAllEnvs())
describe('Part2 limiter',()=>{
 it('fails closed when production limiter configuration is missing',async()=>{
  vi.stubEnv('NODE_ENV','production');vi.stubEnv('UPSTASH_REDIS_REST_URL','');vi.stubEnv('UPSTASH_REDIS_REST_TOKEN','')
  expect(await allowPart2Funnel(new Request('https://example.invalid'))).toBe(false)
 })
 it('uses isolated synthetic configuration and rejects provider failures',async()=>{
  vi.stubEnv('UPSTASH_REDIS_REST_URL','https://example.invalid');vi.stubEnv('UPSTASH_REDIS_REST_TOKEN','synthetic')
  mocks.limit.mockRejectedValue(new Error('unavailable'))
  expect(await allowPart2Funnel(new Request('https://example.invalid'))).toBe(false)
 })
})
