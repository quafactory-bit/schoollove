import { beforeEach,describe,expect,it,vi } from 'vitest'
const mocks=vi.hoisted(()=>({rpc:vi.fn(),query:vi.fn()}))
vi.mock('@/lib/supabase',()=>({getSupabaseAdmin:()=>({rpc:mocks.rpc})}))
import { loadFunnelFeedback } from './part2FunnelAdmin'
describe('bounded atomic report loading',()=>{
 beforeEach(()=>{vi.resetAllMocks();mocks.rpc.mockReturnValue({abortSignal:mocks.query});mocks.query.mockResolvedValue({data:[],error:null})})
 it('uses a single snapshot, rather than racing offset pages',async()=>{
  const r=await loadFunnelFeedback(new Date('2026-11-11T00:00:00Z'))
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('part2_get_funnel_snapshot');expect(r.windows).toHaveLength(2)
 })
 it('refuses oversized, missing or failed snapshots',async()=>{
  for(const result of [{data:Array(20001).fill({}),error:null},{data:null,error:null},{data:[],error:{code:'unavailable'}}]){
   mocks.query.mockResolvedValue(result);await expect(loadFunnelFeedback()).rejects.toThrow('FUNNEL_DATA_UNAVAILABLE')
  }
 })
})
