import { describe,it,expect } from 'vitest'
import { classifyFunnelBrowser,incomingFunnelSource,parseFunnelCookie } from './part2Funnel'
import { buildFunnelFeedback,kstDate,type FunnelRow } from './part2FunnelReport'
const school='00000000-0000-4000-8000-000000000002'
const row=(event:FunnelRow['event_key'],n:number,extra:Partial<FunnelRow>={}):FunnelRow=>({metric_date:'2026-11-11',event_key:event,source_channel:'threads',browser_context:'threads',school_id:null,event_count:n,schools:null,...extra})
const now=new Date('2026-11-11T02:00:00Z')
describe('Part2 minimal referral/browser classification',()=>{
  it.each([['Instagram 300','instagram'],['Instagram Barcelona','threads'],['Threads/1','threads'],['[FBAN/FBIOS;]','facebook'],['Mozilla Android; wv)','unknown'],['Safari/605','external'],['','unknown']])('classifies %s without retaining UA',(ua,expected)=>expect(classifyFunnelBrowser(ua)).toBe(expected))
  it.each([['?ref=ig','instagram'],['?ref=threads','threads'],['?ref=share','share'],['?utm_source=instagram','instagram'],['?ref=ig&ref=threads','other'],['?ref=사람이름','other'],['?ref=ig&email=discarded','instagram']])('allowlists %s',(q,s)=>expect(incomingFunnelSource('https://example.invalid/'+q)).toBe(s))
  it('uses domains only and resists lookalike hosts',()=>{
    expect(incomingFunnelSource('https://example.invalid','https://l.instagram.com/path?ignored=1')).toBe('instagram')
    expect(incomingFunnelSource('https://example.invalid','https://instagram.com.evil.invalid/path')).toBe('other')
    expect(incomingFunnelSource('https://example.invalid','https://www.example.invalid/a')).toBe('direct')
  })
  it('accepts only the fixed context codes',()=>{
    expect(parseFunnelCookie('1.threads.instagram')).toEqual({source:'threads',browser:'instagram'})
    expect(parseFunnelCookie('1.threads.instagram.extra')).toBeNull()
    expect(parseFunnelCookie('1.arbitrary.external')).toBeNull()
  })
})
describe('Part2 admin disclosure and report semantics',()=>{
  it('uses KST date boundaries',()=>expect(kstDate(new Date('2026-11-10T15:01:00Z'))).toBe('2026-11-11'))
  it('shows site-wide zero while keeping future features unmeasured',()=>{
    const w=buildFunnelFeedback([],now).windows[0]
    expect(w.stages.find(s=>s.event==='signup_completed')).toMatchObject({count:0,state:'visible'})
    expect(w.stages.find(s=>s.event==='chalkboard_initials_started')).toMatchObject({count:null,state:'not_instrumented'})
  })
  it('shows the approved site-wide total while keeping source/browser cells masked',()=>{
    const w=buildFunnelFeedback([row('google_login_started',11),row('google_login_started',8,{source_channel:'instagram'})],now).windows[0]
    expect(w.stages.find(s=>s.event==='google_login_started')?.count).toBe(19)
    expect(w.bySource.every(s=>s.stages.find(x=>x.event==='google_login_started')?.count===null)).toBe(true)
    expect(w.byBrowser.every(s=>s.stages.find(x=>x.event==='google_login_started')?.count===null)).toBe(true)
  })
  it('keeps dimensional masking for overlapping windows and shows exact site totals',()=>{
    const r=buildFunnelFeedback([row('landing_view',20),row('landing_view',3,{metric_date:'2026-11-01'})],now)
    expect(r.windows[0].stages[0].count).toBe(20)
    expect(r.windows[1].stages[0].count).toBe(23)
    expect(r.windows[1].bySource.find(s=>s.source==='threads')?.stages[0].count).toBeNull()
  })
  it('reports sufficiently sized counts in both windows',()=>{
    const r=buildFunnelFeedback([row('landing_view',20),row('landing_view',10,{metric_date:'2026-11-01'})],now)
    expect(r.windows.map(w=>w.stages[0].count)).toEqual([20,30])
  })
  it('keeps zero and 1..9 school signups in the same band, without school exact selection counts',()=>{
    const extra={school_id:school,schools:{school_name:'예시고등학교',slug:'example-school'}}
    const a=buildFunnelFeedback([row('school_result_selected',31,extra)],now).windows[0].lowSignupSchools
    const b=buildFunnelFeedback([row('school_result_selected',31,extra),row('signup_completed',9,extra)],now).windows[0].lowSignupSchools
    expect(a).toEqual(b)
    expect(a).toEqual([{schoolName:'예시고등학교',slug:'example-school',selectionBand:'10회 이상',signupBand:'10명 미만',signupCount:null}])
  })
  it('recommends manual text experiments only when both operands are disclosed',()=>{
    const r=buildFunnelFeedback([row('home_viewed',100),row('home_search_submitted',30)],now).windows[0]
    expect(r.recommendations[0]).toMatchObject({ratio:0.3,candidate:'홈 검색 안내 문구 A/B 후보',automaticChange:false})
    expect(r.recommendations[1]).toMatchObject({ratio:null,candidate:null,automaticChange:false})
  })
  it('shows site totals below ten without unmasking school counts',()=>{
    const extra={school_id:school,schools:{school_name:'예시고등학교',slug:'example-school'}}
    const w=buildFunnelFeedback([row('signup_completed',3,extra),row('school_result_selected',10,extra)],now).windows[0]
    expect(w.stages.find(s=>s.event==='signup_completed')).toMatchObject({count:3,state:'visible'})
    expect(w.lowSignupSchools[0]).toMatchObject({signupCount:null,signupBand:'10명 미만'})
  })
  it('rejects corrupt/unsafe counts instead of silently treating them as no signups',()=>{
    expect(()=>buildFunnelFeedback([row('signup_completed',Number.MAX_SAFE_INTEGER+1)],now)).toThrow('FUNNEL_DATA_UNAVAILABLE')
  })
})
