import { FUNNEL_EVENTS,FUNNEL_SOURCES,FUNNEL_BROWSERS,FUNNEL_LABELS,FUTURE_FUNNEL_EVENTS,type FunnelEvent,type FunnelSource,type FunnelBrowser } from './part2Funnel'
export type FunnelRow={metric_date:string;event_key:FunnelEvent;source_channel:FunnelSource;browser_context:FunnelBrowser;school_id:string|null;event_count:number;schools:{school_name:string;slug:string}|null}
export type FunnelCell={count:number|null;state:'visible'|'masked'|'not_instrumented'}
export function kstDate(now=new Date()):string { return new Date(now.getTime()+9*3600000).toISOString().slice(0,10) }
function dayOffset(date:string,days:number):string {const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
const total=(rows:FunnelRow[])=>rows.reduce((n,r)=>n+r.event_count,0)
const bucket=(r:FunnelRow)=>[r.source_channel,r.browser_context,r.school_id??''].join(':')
function groups(rows:FunnelRow[],key:(r:FunnelRow)=>string):Map<string,number> {
  const result=new Map<string,number>();for(const row of rows){const k=key(row);result.set(k,(result.get(k)??0)+row.event_count)}return result
}
export function buildFunnelFeedback(rows:FunnelRow[],now=new Date()) {
  for(const r of rows) if(!/^\d{4}-\d{2}-\d{2}$/.test(r.metric_date)||!FUNNEL_EVENTS.includes(r.event_key)||!FUNNEL_SOURCES.includes(r.source_channel)||!FUNNEL_BROWSERS.includes(r.browser_context)||!Number.isSafeInteger(r.event_count)||r.event_count<1) throw new Error('FUNNEL_DATA_UNAVAILABLE')
  const end=kstDate(now)
  const selected=rows.filter(r=>r.metric_date>=dayOffset(end,-13)&&r.metric_date<=end)
  const seven=selected.filter(r=>r.metric_date>=dayOffset(end,-6))
  // No raw daily/cross-tab rows leave the server. Suppress an entire event if a
  // positive underlying source/browser/school bucket is small. Also suppress
  // 14-day values when subtraction from 7 days could reveal a small older cell.
  const hidden=(event:FunnelEvent,days:7|14)=>{
    const current=(days===7?seven:selected).filter(r=>r.event_key===event)
    if([...groups(current,bucket).values()].some(n=>n<10))return true
    if(days===14){const old=selected.filter(r=>r.event_key===event&&r.metric_date<dayOffset(end,-6));if(total(old)<10||[...groups(old,bucket).values()].some(n=>n<10))return true}
    return false
  }
  const windows=([7,14] as const).map(days=>{
    const period=days===7?seven:selected
    const cell=(event:FunnelEvent,subset=period):FunnelCell=>{
      if(FUTURE_FUNNEL_EVENTS.includes(event))return {count:null,state:'not_instrumented'}
      const n=total(subset.filter(r=>r.event_key===event))
      return hidden(event,days)||n<10?{count:null,state:'masked'}:{count:n,state:'visible'}
    }
    const stages=FUNNEL_EVENTS.map(event=>({event,label:FUNNEL_LABELS[event],...cell(event)}))
    const bySource=FUNNEL_SOURCES.map(source=>({source,stages:FUNNEL_EVENTS.map(event=>({event,...cell(event,period.filter(r=>r.source_channel===source))}))}))
    const byBrowser=FUNNEL_BROWSERS.map(browser=>({browser,stages:FUNNEL_EVENTS.map(event=>({event,...cell(event,period.filter(r=>r.browser_context===browser))}))}))
    const schools=new Map<string,{name:string;slug:string;selections:number;signups:number}>()
    for(const r of period){if(!r.school_id||!r.schools)continue;const s=schools.get(r.school_id)??{name:r.schools.school_name,slug:r.schools.slug,selections:0,signups:0};if(r.event_key==='school_result_selected')s.selections+=r.event_count;if(r.event_key==='signup_completed')s.signups+=r.event_count;schools.set(r.school_id,s)}
    // Deliberately one band, never distinguish zero from 1..9 signups. Selections
    // are disclosed as a threshold band only, so overlapping windows/top lists
    // cannot be subtracted to reveal hidden school/source/browser counts.
    const lowSignupSchools=[...schools.values()].filter(s=>s.selections>=10&&s.signups<10).sort((a,b)=>b.selections-a.selections||a.slug.localeCompare(b.slug)).slice(0,10).map(s=>({schoolName:s.name,slug:s.slug,selectionBand:'10회 이상',signupBand:'10명 미만',signupCount:null}))
    const definitions=[
      {key:'home_to_search',from:'home_viewed',to:'home_search_submitted',threshold:0.35,candidate:'홈 검색 안내 문구 A/B 후보'},
      {key:'detail_to_login',from:'school_detail_viewed',to:'google_login_started',threshold:0.2,candidate:'학교 상세 로그인 안내 문구 A/B 후보'},
      {key:'signup_to_share',from:'signup_completed',to:'cohort_link_share_clicked',threshold:0.15,candidate:'가입 후 기수 공유 안내 문구 A/B 후보'},
    ] as const
    const recommendations=definitions.map(d=>{
      const from=cell(d.from),to=cell(d.to)
      const ratio=from.count!==null&&to.count!==null?to.count/from.count:null
      return {key:d.key,ratio,threshold:d.threshold,candidate:ratio!==null&&ratio<d.threshold?d.candidate:null,automaticChange:false}
    })
    return {days,start:dayOffset(end,1-days),end,stages,bySource,byBrowser,lowSignupSchools,recommendations}
  })
  return {generatedOn:end,timezone:'Asia/Seoul',privacyThreshold:10,definition:'활동은 횟수, 가입은 첫 학교 등록 완료. 개인별 전환율이 아니며 여러 번 클릭하면 비율이 100%를 넘을 수 있어요.',windows}
}
export type FunnelFeedback=ReturnType<typeof buildFunnelFeedback>
