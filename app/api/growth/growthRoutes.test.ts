import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
const mock = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), adminRpc: vi.fn(), rate: vi.fn(), growth: vi.fn() }))
vi.mock('@/lib/user-auth', () => ({ getAuthenticatedRequestContext: mock.auth }))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => ({ rpc: mock.adminRpc }) }))
vi.mock('@/lib/security/growthRateLimit', () => ({ allowGrowthVisit: mock.rate }))
vi.mock('@/lib/schoolGrowthGame', () => ({ getSchoolGrowth: mock.growth }))
import { POST as create } from './referral/route'
import { POST as visit } from './visit/route'
import { GET as own } from '../account/growth/route'
const schoolId = 'ee000001-0000-4000-8000-000000000001'
function request(path: string, body: unknown, origin = 'https://www.schoollove.kr') {
  return new NextRequest(`https://www.schoollove.kr${path}`, { method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body) })
}
beforeEach(() => { vi.resetAllMocks(); mock.rate.mockResolvedValue(true); mock.auth.mockResolvedValue({ user:{id:'owner'},client:{rpc:mock.rpc} }) })
describe('growth route boundaries', () => {
  it('rejects cross-origin creation before auth or DB', async () => {
    expect((await create(request('/api/growth/referral',{schoolId},'https://evil.invalid'))).status).toBe(403)
    expect(mock.auth).not.toHaveBeenCalled()
  })
  it('requires an existing authenticated owner', async () => {
    mock.auth.mockResolvedValue(null)
    expect((await create(request('/api/growth/referral',{schoolId}))).status).toBe(401)
    expect(mock.rpc).not.toHaveBeenCalled()
  })
  it('uses the owner-scoped official RPC without caller-provided user ID', async () => {
    mock.rpc.mockResolvedValue({ data:{token:'a'.repeat(64),expiresIn:604800},error:null })
    const response=await create(request('/api/growth/referral',{schoolId}))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(mock.rpc).toHaveBeenCalledWith('create_school_growth_referral',{requested_school_id:schoolId})
    expect((await create(request('/api/growth/referral',{schoolId,userId:'other'}))).status).toBe(400)
  })
  it('does not leak DB errors or internal identities', async () => {
    mock.rpc.mockResolvedValue({error:{message:'PRIVATE INTERNAL'}})
    const response=await create(request('/api/growth/referral',{schoolId}))
    expect(response.status).toBe(403)
    expect(await response.text()).not.toContain('PRIVATE')
  })
  it('fails closed on rate limiting before writing a visit', async () => {
    mock.rate.mockResolvedValue(false)
    expect((await visit(request('/api/growth/visit',{token:'a'.repeat(64)}))).status).toBe(429)
    expect(mock.adminRpc).not.toHaveBeenCalled()
  })
  it('stores only an HttpOnly proof cookie and never reflects tokens or school identity', async () => {
    mock.adminRpc.mockResolvedValue({error:null,data:{proof:'b'.repeat(64),schoolId}})
    const response=await visit(request('/api/growth/visit',{token:'a'.repeat(64)}))
    expect(await response.json()).toEqual({accepted:true})
    expect(response.cookies.get('sl_growth_visit')?.value).toBe('b'.repeat(64))
    expect(response.headers.get('set-cookie')).toContain('HttpOnly')
    expect(response.headers.get('set-cookie')).toContain('SameSite=lax')
  })
  it('does not set a cookie for an expired or invalid link', async () => {
    mock.adminRpc.mockResolvedValue({error:null,data:null})
    const response=await visit(request('/api/growth/visit',{token:'a'.repeat(64)}))
    expect(await response.json()).toEqual({accepted:false})
    expect(response.cookies.get('sl_growth_visit')).toBeUndefined()
  })
  it('owner feedback is private, not a school/user enumeration endpoint', async () => {
    mock.rpc.mockResolvedValue({error:null,data:null})
    expect((await own(new NextRequest(`https://www.schoollove.kr/api/account/growth?school=${schoolId}`))).status).toBe(404)
    const growth = {schoolId,schoolName:'Fixture',slug:'fixture',level:1,progress:70,nearLevelUp:false,lastLevelUp:null,ownContributionXp:100}
    mock.rpc.mockReturnValue({abortSignal:vi.fn().mockResolvedValue({error:null,data:{...growth,otherUser:'PRIVATE'}})})
    const response=await own(new NextRequest(`https://www.schoollove.kr/api/account/growth?school=${schoolId}`))
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toEqual({contribution:{contributed:true,xp:100},growth})
    expect(mock.growth).not.toHaveBeenCalled()
    expect(mock.rpc).toHaveBeenLastCalledWith('get_own_school_growth_live',{requested_school_id:schoolId})
  })
})
