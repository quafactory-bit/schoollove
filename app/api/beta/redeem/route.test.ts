import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks=vi.hoisted(()=>({
  auth:vi.fn(),
  rpc:vi.fn(),
  hash:vi.fn((value:string)=>`hash:${value}`),
  sync:vi.fn(),
  record:vi.fn(),
}))

vi.mock('@/lib/user-auth',()=>({getAuthenticatedRequestContext:mocks.auth}))
vi.mock('@/lib/supabase',()=>({getSupabaseAdmin:()=>({rpc:mocks.rpc})}))
vi.mock('@/lib/beta',()=>({hashBetaIdentity:mocks.hash}))
vi.mock('@/lib/onboarding',()=>({syncOnboardingProgressSafely:mocks.sync,recordLimitedLaunchEvent:mocks.record}))

import { POST } from './route'

const userId='00000000-0000-4000-8000-000000000001'
const token='a'.repeat(32)
const request=(body:unknown)=>new Request('http://localhost/api/beta/redeem',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})

describe('beta invite redeem route',()=>{
  beforeEach(()=>{
    vi.clearAllMocks()
    mocks.auth.mockResolvedValue({user:{id:userId,email:'test@example.com'},client:{}})
    mocks.rpc.mockResolvedValue({data:'PENDING_REVIEW',error:null})
  })

  it('requires an authenticated session before parsing or redeeming',async()=>{
    mocks.auth.mockResolvedValue(null)
    const response=await POST(request({token}) as never)
    expect(response.status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('rejects an invalid token without calling the RPC',async()=>{
    const response=await POST(request({token:'short'}) as never)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({error:'INVALID_INVITE'})
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('hashes the submitted token and uses the existing authenticated redeem RPC contract',async()=>{
    const response=await POST(request({token}) as never)
    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('redeem_beta_invite',{
      actor_user_id:userId,
      requested_token_hash:`hash:${token}`,
      actor_email_hash:'hash:test@example.com',
      actor_domain_hash:'hash:example.com',
    })
    expect(await response.json()).toEqual({status:'PENDING_REVIEW'})
    expect(mocks.sync).toHaveBeenCalledWith(expect.objectContaining({rpc:mocks.rpc}),userId,'direct')
    expect(mocks.record).toHaveBeenCalledWith('invite_redeemed')
  })

  it('redeems an unrestricted invite without hashing absent authenticated email data',async()=>{
    mocks.auth.mockResolvedValue({user:{id:userId,email:null},client:{}})
    const response=await POST(request({token}) as never)
    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('redeem_beta_invite',{
      actor_user_id:userId,
      requested_token_hash:`hash:${token}`,
      actor_email_hash:null,
      actor_domain_hash:null,
    })
    expect(mocks.hash).toHaveBeenCalledTimes(1)
    expect(mocks.hash).toHaveBeenCalledWith(token)
  })

  it('never hashes empty authenticated email or domain values',async()=>{
    mocks.auth.mockResolvedValue({user:{id:userId,email:''},client:{}})
    await POST(request({token}) as never)
    expect(mocks.rpc).toHaveBeenCalledWith('redeem_beta_invite',expect.objectContaining({
      actor_email_hash:null,
      actor_domain_hash:null,
    }))
    expect(mocks.hash).toHaveBeenCalledTimes(1)
  })

  it('returns only the existing coarse error when the RPC rejects',async()=>{
    mocks.rpc.mockResolvedValue({data:null,error:{message:'sensitive provider detail'}})
    const response=await POST(request({token}) as never)
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({error:'INVITE_REDEEM_FAILED'})
  })
})
