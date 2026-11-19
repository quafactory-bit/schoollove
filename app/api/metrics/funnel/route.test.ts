import { beforeEach,describe,expect,it,vi } from 'vitest'
import { NextRequest } from 'next/server'
const mocks=vi.hoisted(()=>({rpc:vi.fn(),limit:vi.fn()}))
vi.mock('@/lib/supabase',()=>({getSupabaseAdmin:()=>({rpc:(...args:unknown[])=>({abortSignal:()=>mocks.rpc(...args)})})}))
vi.mock('@/lib/security/part2FunnelRateLimit',()=>({allowPart2Funnel:mocks.limit}))
import { POST } from './route'
const request=(body:unknown,origin='https://example.invalid')=>new NextRequest('https://example.invalid/api/metrics/funnel',{method:'POST',headers:{origin,'content-type':'application/json','user-agent':'Instagram Barcelona'},body:JSON.stringify(body)})
describe('anonymous aggregate ingestion',()=>{
  beforeEach(()=>{vi.resetAllMocks();mocks.limit.mockResolvedValue(true);mocks.rpc.mockResolvedValue({data:true,error:null})})
  it('rejects cross-origin traffic before limiting or writing',async()=>{
    expect((await POST(request({event:'landing_view',source:'threads'},'https://evil.invalid'))).status).toBe(403)
    expect(mocks.limit).not.toHaveBeenCalled();expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('fails closed on a limiter rejection',async()=>{
    mocks.limit.mockResolvedValue(false)
    expect((await POST(request({event:'landing_view',source:'threads'}))).status).toBe(429)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it.each([{event:'signup_completed',source:'direct'},{event:'google_login_completed',source:'direct'},{event:'landing_view',source:'direct',name:'discard'},{event:'school_result_selected',source:'direct'},{event:'landing_view',source:'direct',schoolId:'00000000-0000-4000-8000-000000000002'}])('rejects forged trusted milestones/extra data/wrong dimensions',async body=>{
    expect((await POST(request(body))).status).toBe(400);expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('writes classifications only and sets the finite HttpOnly code cookie',async()=>{
    const response=await POST(request({event:'landing_view',source:'threads'}))
    expect(response.status).toBe(204)
    expect(mocks.rpc).toHaveBeenCalledWith('part2_record_funnel_event',{requested_event:'landing_view',requested_source:'threads',requested_browser:'threads',requested_school_id:null})
    const cookie=response.headers.get('set-cookie')!
    expect(cookie).toContain('HttpOnly');expect(cookie).toContain('Max-Age=1800');expect(cookie).toContain('Secure')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
  it('does not misreport missing DB support as a recorded event',async()=>{
    mocks.rpc.mockResolvedValue({data:null,error:{code:'PGRST202'}})
    const response=await POST(request({event:'landing_view',source:'direct'}))
    expect(response.status).toBe(503);expect(response.headers.get('set-cookie')).toBeNull()
  })
})
