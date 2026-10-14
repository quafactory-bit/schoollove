import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const mocks = vi.hoisted(() => ({auth:vi.fn(),access:vi.fn(),rpc:vi.fn(),adminRpc:vi.fn(),sync:vi.fn()}))
vi.mock('@/lib/user-auth',()=>({getAuthenticatedRequestContext:mocks.auth}))
vi.mock('@/lib/publicAccountLaunch',()=>({hasAccountOnboardingWriteAccess:mocks.access}))
vi.mock('@/lib/onboarding',()=>({syncOnboardingProgressSafely:mocks.sync}))
vi.mock('@/lib/supabase',()=>({getSupabaseAdmin:()=>({rpc:mocks.adminRpc})}))
import { POST } from './route'
const request = (body:unknown) => new NextRequest('http://localhost/api/account/profile',{method:'POST',body:JSON.stringify(body)})
describe('signup attribution profile API',()=>{
  beforeEach(()=>{
    vi.clearAllMocks()
    mocks.auth.mockResolvedValue({user:{id:'verified-session-user'},client:{rpc:mocks.rpc}})
    mocks.access.mockResolvedValue(true)
    mocks.rpc.mockResolvedValue({data:true,error:null})
    mocks.adminRpc.mockResolvedValue({data:{profile:{display_name:'Test'},attribution_recorded:true},error:null})
  })
  it('uses verified identity and sanitized anonymous fields in a single RPC',async()=>{
    const response=await POST(request({display_name:'Test',sl_first_touch:{source:'threads',medium:'post_body',campaign:'devlog',content:'1020-08',landing_path:'/',ts:Date.now()}}))
    expect(response.status).toBe(200)
    expect(mocks.adminRpc).toHaveBeenCalledOnce()
    const payload=mocks.adminRpc.mock.calls[0][1]
    expect(payload.verified_actor).toBe('verified-session-user')
    expect(payload.requested_attribution).toEqual({source:'threads',medium:'post_body',campaign:'devlog',content:'1020-08',landing_path:'/'})
    expect(await response.json()).toEqual({profile:{display_name:'Test'},attribution_recorded:true})
  })
  it('records unknown for bad or absent attribution without blocking valid profile data',async()=>{
    for(const sl_first_touch of [undefined,{source:'private@email.test'},'bad']){
      expect((await POST(request({display_name:'Test',sl_first_touch}))).status).toBe(200)
      expect(mocks.adminRpc.mock.lastCall?.[1].requested_attribution.source).toBe('unknown')
    }
  })
  it('denies forged owner fields and retains authentication/consent boundaries',async()=>{
    expect((await POST(request({display_name:'Test',verified_actor:'attacker'}))).status).toBe(400)
    mocks.auth.mockResolvedValue(null)
    expect((await POST(request({display_name:'Test'}))).status).toBe(401)
    expect(mocks.adminRpc).not.toHaveBeenCalled()
  })
  it('does not claim an attribution insert on update or transaction failure',async()=>{
    mocks.adminRpc.mockResolvedValue({data:{profile:{},attribution_recorded:false},error:null})
    expect((await (await POST(request({display_name:'Test'}))).json()).attribution_recorded).toBe(false)
    mocks.adminRpc.mockResolvedValue({data:null,error:{code:'transaction_failed'}})
    expect((await POST(request({display_name:'Test'}))).status).toBe(500)
  })
})
