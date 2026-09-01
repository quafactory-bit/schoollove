import {beforeEach,describe,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({auth:vi.fn(),rpc:vi.fn(),sync:vi.fn(),record:vi.fn()}))
vi.mock('@/lib/user-auth',()=>({getAuthenticatedRequestContext:mocks.auth}))
vi.mock('@/lib/supabase',()=>({getSupabaseAdmin:()=>({rpc:mocks.rpc})}))
vi.mock('@/lib/onboarding',()=>({syncOnboardingProgressSafely:mocks.sync,recordLimitedLaunchEvent:mocks.record}))
import {POST} from './route'
const userId='00000000-0000-4000-8000-000000000001'
const request=new Request('http://localhost/api/beta/onboarding/finalize',{method:'POST'})
describe('beta onboarding finalize route',()=>{
  beforeEach(()=>{vi.clearAllMocks();mocks.auth.mockResolvedValue({user:{id:userId},client:{}});mocks.rpc.mockResolvedValue({data:'PENDING_REVIEW',error:null})})
  it('requires auth',async()=>{mocks.auth.mockResolvedValue(null);expect((await POST(request as never)).status).toBe(401);expect(mocks.rpc).not.toHaveBeenCalled()})
  it('finalizes only the current authenticated user claim',async()=>{const response=await POST(request as never);expect(response.status).toBe(200);expect(mocks.rpc).toHaveBeenCalledWith('finalize_beta_onboarding_claim',{actor_user_id:userId});expect(await response.json()).toEqual({status:'PENDING_REVIEW'})})
  it('maps incomplete onboarding to a coarse prerequisite result',async()=>{mocks.rpc.mockResolvedValue({data:'ONBOARDING_REQUIRED',error:null});const response=await POST(request as never);expect(response.status).toBe(409);expect(await response.json()).toEqual({error:'ONBOARDING_REQUIRED'})})
  it('does not report or reflect database details',async()=>{mocks.rpc.mockResolvedValue({data:null,error:{message:'sensitive school and program detail'}});const response=await POST(request as never);expect(response.status).toBe(409);expect(await response.json()).toEqual({error:'BETA_ONBOARDING_UNAVAILABLE'})})
})
