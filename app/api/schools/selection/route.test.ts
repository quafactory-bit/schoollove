import { beforeEach, describe, expect, it, vi } from 'vitest'
const { lookup }=vi.hoisted(()=>({lookup:vi.fn()}))
vi.mock('@/lib/api/schools',()=>({getSchoolBySlug:lookup}))
import { GET } from './route'
beforeEach(()=>vi.clearAllMocks())
describe('public candidate lookup',()=>{
  it('returns public fields only, never owner or growth authority',async()=>{
    lookup.mockResolvedValue({id:'s',slug:'example-school',school_name:'예시학교',school_type:'high',sido:'시',sigungu:'구',owner:'private',xp:100,memberships:['private']})
    const response=await GET(new Request('https://school.test/api/schools/selection?slug=example-school'))
    expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store')
    expect(Object.keys((await response.json()).school).sort()).toEqual(['id','school_name','school_type','sido','sigungu','slug'])
  })
  it('rejects invalid paths before database access',async()=>{expect((await GET(new Request('https://school.test/api/schools/selection?slug=../x'))).status).toBe(400);expect(lookup).not.toHaveBeenCalled()})
  it('keeps missing and failed lookups non-authoritative',async()=>{lookup.mockResolvedValue(null);expect(await (await GET(new Request('https://school.test/?slug=missing'))).json()).toEqual({school:null});lookup.mockRejectedValue(Error('internal'));expect((await GET(new Request('https://school.test/?slug=missing'))).status).toBe(503)})
})
