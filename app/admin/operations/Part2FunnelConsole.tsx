'use client'
import { useEffect,useState } from 'react'
import type { FunnelFeedback } from '@/lib/part2FunnelReport'
import { FUNNEL_BROWSERS,FUNNEL_SOURCES } from '@/lib/part2Funnel'
export default function Part2FunnelConsole(){
  const [report,setReport]=useState<FunnelFeedback|null>(null)
  const [error,setError]=useState('')
  const [days,setDays]=useState<7|14>(7)
  const [source,setSource]=useState('all'),[browser,setBrowser]=useState('all')
  useEffect(()=>{
    const controller=new AbortController()
    fetch('/api/admin/funnel',{cache:'no-store',signal:controller.signal}).then(async response=>{if(!response.ok)throw new Error('unavailable');setReport(await response.json())}).catch(()=>{if(!controller.signal.aborted)setError('측정 자료를 불러오지 못했어요. 새 집계 적용 여부를 확인해 주세요.')})
    return()=>controller.abort()
  },[])
  const window=report?.windows.find(w=>w.days===days)
  const subset=source!=='all'?window?.bySource.find(s=>s.source===source)?.stages:browser!=='all'?window?.byBrowser.find(b=>b.browser===browser)?.stages:null
  return <section aria-labelledby="part2-funnel-heading" className="rounded-2xl border border-[#14532d]/20 bg-[#fcfaf5] p-4 text-[#14532d] sm:p-6">
    <h2 id="part2-funnel-heading" className="text-xl font-black">방문에서 출석까지</h2>
    <p className="mt-2 text-sm">채널별·앱 브라우저별로 어디에서 멈추는지 확인해요. 10 미만은 가리고, 아직 측정을 연결하지 않은 단계는 따로 표시해요.</p>
    {error?<p role="alert" className="mt-4 text-sm text-red-800">{error}</p>:!report?<p role="status" className="mt-4">측정 자료 확인 중…</p>:null}
    {window&&<>
      <div className="mt-4 flex flex-wrap gap-3">
        <label className="text-sm">기간<select aria-label="기간" value={days} onChange={e=>setDays(Number(e.target.value) as 7|14)} className="ml-2 min-h-11 rounded border bg-white px-2"><option value={7}>최근 7일</option><option value={14}>최근 14일</option></select></label>
        <label className="text-sm">유입<select aria-label="유입" value={source} onChange={e=>{setSource(e.target.value);setBrowser('all')}} className="ml-2 min-h-11 rounded border bg-white px-2"><option value="all">전체</option>{FUNNEL_SOURCES.map(s=><option key={s}>{s}</option>)}</select></label>
        <label className="text-sm">브라우저<select aria-label="브라우저" value={browser} onChange={e=>{setBrowser(e.target.value);setSource('all')}} className="ml-2 min-h-11 rounded border bg-white px-2"><option value="all">전체</option>{FUNNEL_BROWSERS.map(b=><option key={b}>{b}</option>)}</select></label>
      </div>
      <p className="mt-2 text-xs">{window.start} ~ {window.end} · 한국시간 · {report?.definition}</p>
      <table className="mt-4 w-full border-collapse text-left text-sm"><caption className="sr-only">유입에서 공유까지 단계별 집계</caption><thead><tr className="border-b border-[#14532d]/20"><th scope="col" className="py-3">단계</th><th scope="col">집계</th></tr></thead><tbody>{window.stages.map(stage=>{const cell=subset?.find(s=>s.event===stage.event)??stage;return <tr key={stage.event} className="border-b border-[#14532d]/10"><th scope="row" className="py-3 pr-2 font-medium">{stage.label}</th><td>{cell.state==='not_instrumented'?'아직 미계측':cell.state==='masked'?'10 미만 또는 보호 가림':cell.count}</td></tr>})}</tbody></table>
      <a href="/api/admin/funnel?download=1" className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-[#14532d] px-4 text-sm font-bold text-white">7일·14일 보고서 내려받기</a>
      <h3 className="mt-6 font-bold">학교 선택이 많고 가입은 10명 미만인 학교</h3>
      <p className="mt-1 text-xs">학교 선택 10회 이상만 대상으로 해요. 0명과 1~9명은 구분하지 않아요.</p>
      {window.lowSignupSchools.length?<ul className="mt-3 space-y-2 text-sm">{window.lowSignupSchools.map(s=><li key={s.slug}>{s.schoolName} · 선택 {s.selectionBand} · 가입 {s.signupBand}</li>)}</ul>:<p className="mt-3 text-sm">표시 기준을 충족하는 학교가 없어요.</p>}
      <h3 className="mt-6 font-bold">다음 문구 실험 후보</h3>
      {window.recommendations.some(r=>r.candidate)?<ul className="mt-2 text-sm">{window.recommendations.filter(r=>r.candidate).map(r=><li key={r.key}>{r.candidate}</li>)}</ul>:<p className="mt-2 text-sm">측정이 충분하고 기준에 해당할 때만 제안해요. 문구를 자동으로 바꾸지 않아요.</p>}
    </>}
  </section>
}
