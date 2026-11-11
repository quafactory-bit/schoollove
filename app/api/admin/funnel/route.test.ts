import { beforeEach,describe,expect,it,vi } from 'vitest'
import { NextRequest } from 'next/server'
import { buildFunnelFeedback } from '@/lib/part2FunnelReport'
const mocks=vi.hoisted(()=>({admin:vi.fn(),load:vi.fn()}))
vi.mock('@/lib/api/requireAdmin',()=>({requireAdminSession:mocks.admin}))
vi.mock('@/lib/part2FunnelAdmin',()=>({loadFunnelFeedback:mocks.load}))
import { GET } from './route'
describe('admin aggregate report boundary',()=>{
  beforeEach(()=>{vi.resetAllMocks();mocks.admin.mockResolvedValue(true);mocks.load.mockResolvedValue(buildFunnelFeedback([],new Date('2026-11-11T00:00:00Z')))})
  it('blocks anonymous readers and downloads before loading any data',async()=>{
    mocks.admin.mockResolvedValue(false)
    expect((await GET(new NextRequest('https://example.invalid/api/admin/funnel?download=1'))).status).toBe(401)
    expect(mocks.load).not.toHaveBeenCalled()
  })
  it('downloads exact site totals and masked dimensions in 7/14-day JSON under the same admin check',async()=>{
    const r=await GET(new NextRequest('https://example.invalid/api/admin/funnel?download=1'))
    expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toContain('private, no-store')
    expect(r.headers.get('content-disposition')).toContain('funnel_feedback_report.json')
    const body=await r.json();expect(body.windows.map((w:{days:number})=>w.days)).toEqual([7,14]);expect(body.windows[0].stages[0].count).toBe(0);expect(body.windows[0].bySource[0].stages[0].count).toBeNull()
  })
  it('returns unavailable rather than a misleading empty report on a DB failure',async()=>{
    mocks.load.mockRejectedValue(new Error('internal unavailable'))
    expect((await GET(new NextRequest('https://example.invalid/api/admin/funnel'))).status).toBe(503)
  })
})
