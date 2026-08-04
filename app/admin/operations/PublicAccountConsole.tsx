'use client'

import { useCallback,useEffect,useState } from 'react'

type State={
  control:{state:string;account_registration_enabled:boolean;private_profile_enabled:boolean;school_membership_enabled:boolean;emergency_stopped_at:string|null;last_reason_code:string;updated_at:string}
  funnel:Array<{metric_date:string;event_key:string;event_kind:'activity'|'milestone';source_channel:string;event_count:number|null;masked:boolean}>
  deletions:Array<{id:string;status:string;created_at:string;resolved_at:string|null}>
  audit:Array<{id:string;action:string;from_state:string|null;to_state:string|null;reason_code:string;created_at:string}>
}

export default function PublicAccountConsole(){
  const [state,setState]=useState<State|null>(null)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [reason,setReason]=useState('')
  const [commitSha,setCommitSha]=useState('')
  const [migrationSha256,setMigrationSha256]=useState('')
  const [readinessChecks,setReadinessChecks]=useState({health:false,rlsGrants:false,authSmtp:false,deletionOperator:false,runtimeLogs:false,preview:false,isolatedDb:false,permissions:false})
  const allReadinessChecks=Object.values(readinessChecks).every(Boolean)
  const load=useCallback(async()=>{const response=await fetch('/api/admin/public-account',{cache:'no-store'});if(!response.ok)throw new Error('공개 계정 운영 상태를 불러올 수 없습니다.');setState(await response.json())},[])
  useEffect(()=>{load().catch((cause)=>setError(cause instanceof Error?cause.message:'상태 조회 실패'))},[load])
  async function mutate(payload:Record<string,unknown>){setError('');setNotice('');const response=await fetch('/api/admin/public-account',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});if(!response.ok)throw new Error('안전 상태 전환이 거부되었습니다.');setNotice('감사 기록과 함께 반영했습니다.');setReason('');await load()}
  if(!state)return <section className="rounded-2xl border border-gray-200 bg-white p-5"><h2 className="text-lg font-bold">공개 계정 소프트런치</h2><p role={error?'alert':'status'} className="mt-2 text-sm">{error||'상태를 확인하고 있습니다.'}</p></section>
  return <section className="space-y-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
    <div><h2 className="text-lg font-bold">공개 계정 소프트런치·긴급 중단</h2><p className="mt-2 text-sm text-gray-600">controlled beta와 분리된 경계입니다. Production open은 별도 승인과 runbook 실행 전 금지됩니다.</p></div>
    {notice?<p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>:null}{error?<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>:null}
    <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5"><div><dt>상태</dt><dd className="font-bold">{state.control.state}</dd></div><div><dt>신규 계정</dt><dd>{state.control.account_registration_enabled?'enabled':'blocked'}</dd></div><div><dt>비공개 프로필</dt><dd>{state.control.private_profile_enabled?'enabled':'blocked'}</dd></div><div><dt>학교 이력</dt><dd>{state.control.school_membership_enabled?'enabled':'blocked'}</dd></div><div><dt>긴급 중단</dt><dd>{state.control.emergency_stopped_at?'active':'inactive'}</dd></div></dl>
    <label className="block text-sm font-medium">사유 코드<input value={reason} onChange={(event)=>setReason(event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g,''))} maxLength={60} placeholder="PREVIEW_READINESS_VERIFIED" className="mt-1 min-h-11 w-full border px-3"/></label>
    <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">검증 commit SHA<input value={commitSha} onChange={(event)=>setCommitSha(event.target.value.trim().toLowerCase())} maxLength={40} className="mt-1 min-h-11 w-full border px-3"/></label><label className="text-sm">migration SHA-256<input value={migrationSha256} onChange={(event)=>setMigrationSha256(event.target.value.trim().toUpperCase())} maxLength={64} className="mt-1 min-h-11 w-full border px-3"/></label></div>
    <fieldset className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4"><legend className="mb-2 font-semibold">readiness 증빙 확인</legend>{(Object.keys(readinessChecks) as Array<keyof typeof readinessChecks>).map((key)=><label key={key} className="flex min-h-11 items-center gap-2 border px-3"><input type="checkbox" checked={readinessChecks[key]} onChange={(event)=>setReadinessChecks((current)=>({...current,[key]:event.target.checked}))}/>{key}</label>)}</fieldset>
    <div className="flex flex-wrap gap-2">{(['closed','internal_test'] as const).map((next)=><button key={next} disabled={!reason} onClick={()=>void mutate({action:'set_state',state:next,reason}).catch((cause)=>setError(String(cause)))} className="min-h-11 border px-3 disabled:opacity-40">{next}</button>)}<button disabled={!reason||!allReadinessChecks||commitSha.length!==40||migrationSha256.length!==64} onClick={()=>void mutate({action:'record_readiness',reason,commitSha,migrationSha256,checks:{...readinessChecks,operatorDecision:'affirmative',blockerCodes:[]}}).catch((cause)=>setError(String(cause)))} className="min-h-11 border px-3 disabled:opacity-40">readiness 기록</button><button disabled={!reason||state.control.state!=='ready'||commitSha.length!==40||migrationSha256.length!==64||!state.audit.find((item)=>item.action==='readiness_recorded')} onClick={()=>{const readinessId=state.audit.find((item)=>item.action==='readiness_recorded')?.id;if(readinessId&&window.confirm('별도 승인과 Production runbook이 확인되었습니까?'))void mutate({action:'open',reason,readinessId,commitSha,migrationSha256}).catch((cause)=>setError(String(cause)))}} className="min-h-11 border px-3 disabled:opacity-40">open</button><button onClick={()=>void mutate({action:'set_state',state:'emergency_stopped',reason:reason||'ADMIN_EMERGENCY_STOP'}).catch((cause)=>setError(String(cause)))} className="min-h-11 bg-red-800 px-3 text-white">즉시 전체 중단</button></div>
    <div><h3 className="font-bold">공개 계정 집계</h3><p className="text-xs text-gray-500">activity는 요청 횟수, milestone은 계정별 최초 완료입니다. 10 미만은 정확한 수치를 숨깁니다.</p><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{state.funnel.map((item)=><div key={`${item.metric_date}:${item.event_key}:${item.source_channel}`} className="rounded-lg bg-gray-50 p-3 text-xs"><p>{item.metric_date} · {item.event_kind} · {item.source_channel}</p><p className="font-semibold">{item.event_key}</p><p>{item.masked?'10 미만':item.event_count}</p></div>)}</div></div>
    <div><h3 className="font-bold">탈퇴 처리 대기</h3>{state.deletions.length===0?<p className="mt-2 text-sm text-gray-500">대기 요청 없음</p>:state.deletions.map((item)=><div key={item.id} className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-xs"><span>{item.id} · {item.status} · {new Date(item.created_at).toLocaleString('ko-KR')}</span><button className="min-h-11 border px-3" onClick={()=>{if(window.confirm('공개 계정 데이터 삭제 후 Auth identity 실제 삭제를 진행할까요? 실패 시 blocked 상태로 남고 재시도가 필요합니다.'))void mutate({action:'complete_deletion',requestId:item.id,reason:reason||'USER_DELETION_REQUEST_COMPLETED'}).catch((cause)=>setError(String(cause)))}}>2단계 실제 삭제 실행</button></div>)}</div>
    <div><h3 className="font-bold">최근 안전 감사</h3><ul className="mt-2 space-y-1 text-xs text-gray-600">{state.audit.map((item)=><li key={item.id}>{item.created_at} · {item.action} · {item.from_state??'-'} → {item.to_state??'-'} · {item.reason_code}</li>)}</ul></div>
  </section>
}
