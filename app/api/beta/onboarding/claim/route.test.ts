import {beforeEach,describe,expect,it,vi} from 'vitest'

const mocks=vi.hoisted(()=>({auth:vi.fn(),rpc:vi.fn(),hash:vi.fn((value:string)=>`hash:${value}`),sync:vi.fn(),record:vi.fn()}))
vi.mock('@/lib/user-auth',()=>({getAuthenticatedRequestContext:mocks.auth}))
vi.mock('@/lib/supabase',()=>({getSupabaseAdmin:()=>({rpc:mocks.rpc})}))
vi.mock('@/lib/beta',()=>({hashBetaIdentity:mocks.hash}))
vi.mock('@/lib/onboarding',()=>({syncOnboardingProgressSafely:mocks.sync,recordLimitedLaunchEvent:mocks.record}))
import {POST} from './route'

const userId='00000000-0000-4000-8000-000000000001'
const token='a'.repeat(32)
const request=(body:unknown)=>new Request('http://localhost/api/beta/onboarding/claim',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})

describe('beta onboarding claim route',()=>{
  beforeEach(()=>{vi.clearAllMocks();mocks.auth.mockResolvedValue({user:{id:userId,email:'owner@example.com'},client:{}});mocks.rpc.mockResolvedValue({data:'ONBOARDING_CLAIMED',error:null})})
  it('requires auth and never hashes an unauthenticated token',async()=>{mocks.auth.mockResolvedValue(null);const response=await POST(request({token}) as never);expect(response.status).toBe(401);expect(mocks.hash).not.toHaveBeenCalled()})
  it('rejects malformed input before hashing',async()=>{const response=await POST(request({token:'short'}) as never);expect(response.status).toBe(400);expect(mocks.rpc).not.toHaveBeenCalled()})
  it('hashes token and optional identity only in memory before claim',async()=>{const response=await POST(request({token}) as never);expect(response.status).toBe(200);expect(mocks.rpc).toHaveBeenCalledWith('claim_beta_invite_for_onboarding',{actor_user_id:userId,requested_token_hash:`hash:${token}`,actor_email_hash:'hash:owner@example.com',actor_domain_hash:'hash:example.com'});expect(await response.json()).toEqual({status:'ONBOARDING_CLAIMED',mode:'onboarding'})})
  it('does not redeem when People Discovery claim succeeds',async()=>{await POST(request({token}) as never);expect(mocks.rpc).toHaveBeenCalledTimes(1);expect(mocks.sync).not.toHaveBeenCalled();expect(mocks.record).not.toHaveBeenCalled()})
  it('falls back to the unchanged legacy redeem contract only for internal LEGACY_CONTRACT',async()=>{mocks.rpc.mockResolvedValueOnce({data:'LEGACY_CONTRACT',error:null}).mockResolvedValueOnce({data:'PENDING_REVIEW',error:null});const response=await POST(request({token}) as never);expect(response.status).toBe(200);expect(mocks.rpc.mock.calls.map(call=>call[0])).toEqual(['claim_beta_invite_for_onboarding','redeem_beta_invite']);expect(await response.json()).toEqual({status:'PENDING_REVIEW',mode:'legacy'})})
  it('returns one generic external failure for all unavailable claims',async()=>{mocks.rpc.mockResolvedValue({data:'UNAVAILABLE',error:null});const response=await POST(request({token}) as never);expect(response.status).toBe(409);expect(await response.json()).toEqual({error:'INVITE_UNAVAILABLE'})})
  it('supports an email-less authenticated principal without hashing empty identity',async()=>{mocks.auth.mockResolvedValue({user:{id:userId,email:null},client:{}});await POST(request({token}) as never);expect(mocks.hash).toHaveBeenCalledTimes(1);expect(mocks.rpc).toHaveBeenCalledWith('claim_beta_invite_for_onboarding',expect.objectContaining({actor_email_hash:null,actor_domain_hash:null}))})
})
