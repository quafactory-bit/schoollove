import { beforeEach,describe,expect,it,vi } from 'vitest'
const mocks=vi.hoisted(()=>({complete:vi.fn(),metric:vi.fn(),config:vi.fn()}))
vi.mock('@/lib/part2FunnelServer',()=>({scheduleServerFunnel:mocks.metric}))
vi.mock('@/lib/auth/social-broker/preview-config',()=>({loadUserLoginBrokerConfig:mocks.config}))
vi.mock('@/lib/auth/social-broker/preview-recovery-http',()=>({completeSocialSession:mocks.complete}))
vi.mock('@/lib/auth/social-broker/http',()=>({darkOidcRouteNotFound:()=>new Response(null,{status:404})}))
import { GET as start } from './start/google/route'
import { POST as complete } from './complete/session/route'
describe('trusted login-stage counters outside the broker',()=>{
 beforeEach(()=>{vi.resetAllMocks();mocks.config.mockReturnValue({issuer:'https://example.invalid',supabaseAuthority:'https://auth.invalid',completionRoute:'https://example.invalid/auth/social/complete'})})
 it('counts a valid fixed-provider start but not an origin/config rejection',async()=>{
  expect((await start(new Request('https://example.invalid/auth/social/start/google'))).status).toBe(302)
  expect(mocks.metric).toHaveBeenCalledWith(expect.any(Request),'google_login_started')
  mocks.metric.mockClear();expect((await start(new Request('https://evil.invalid/auth/social/start/google'))).status).toBe(404)
  expect(mocks.metric).not.toHaveBeenCalled()
 })
 it('counts only successful session completion and preserves the core response',async()=>{
  const response=new Response('{}',{status:200,headers:{'set-cookie':'synthetic-core-cookie=fixture'}})
  mocks.complete.mockResolvedValue(response)
  expect(await complete(new Request('https://example.invalid/auth/social/complete/session',{method:'POST'}))).toBe(response)
  expect(mocks.metric).toHaveBeenCalledWith(expect.any(Request),'google_login_completed')
  mocks.metric.mockClear();mocks.complete.mockResolvedValue(new Response('{}',{status:403}))
  expect((await complete(new Request('https://example.invalid/auth/social/complete/session',{method:'POST'}))).status).toBe(403)
  expect(mocks.metric).not.toHaveBeenCalled()
 })
})
