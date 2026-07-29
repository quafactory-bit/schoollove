'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import { betaFeatureKeys } from '@/lib/policy/operations'

type Program = { id:string; program_key:string; name:string; status:string; emergency_disabled_at:string|null }
type Member = { id:string; program_id:string; status:string; enrolled_at:string; reason_code:string|null }
type Flag = { id:string; program_id:string|null; feature_key:string; enabled:boolean; reason_code:string }
type Launch = {
  currentStages:Array<{stage_key:string;source_channel:string;count:number|null;masked:boolean}>
  dailyEntries:Array<{metric_date:string;stage_key:string;source_channel:string;count:number|null;masked:boolean}>
}
type State = { programs:Program[]; members:Member[]; flags:Flag[]; jobs:unknown[]; exports:unknown[]; events:unknown[]; incidents:unknown[]; launch:Launch }

export default function OperationsClient() {
  const [state,setState] = useState<State|null>(null)
  const [error,setError] = useState('')
  const [notice,setNotice] = useState('')
  const load = useCallback(async () => {
    const response=await fetch('/api/admin/operations',{cache:'no-store'})
    if (!response.ok) throw new Error('운영 상태를 불러올 수 없습니다.')
    setState(await response.json())
  },[])
  useEffect(() => { load().catch((reason) => setError(reason instanceof Error ? reason.message : '운영 상태를 불러올 수 없습니다.')) },[load])

  async function mutate(payload:Record<string,unknown>) {
    setError(''); setNotice('')
    const response=await fetch('/api/admin/operations',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(payload)})
    const body=await response.json().catch(() => ({}))
    if (!response.ok) throw new Error('운영 변경이 거부되었습니다.')
    if (typeof body.token==='string') setNotice(`초대 토큰(이번에만 표시): ${body.token}`)
    else setNotice('운영 상태를 반영했습니다.')
    await load()
  }

  async function issueInvite(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form=new FormData(event.currentTarget)
    try { await mutate({ action:'issue_invite',programId:String(form.get('programId')),email:String(form.get('email')||'')||undefined,domain:String(form.get('domain')||'')||undefined,maxUses:Number(form.get('maxUses')),expiresAt:new Date(String(form.get('expiresAt'))).toISOString() }) }
    catch (reason) { setError(reason instanceof Error ? reason.message : '초대 발급 실패') }
  }

  if (error && !state) return <p role="alert">{error}</p>
  if (!state) return <p>운영 상태를 확인하고 있습니다.</p>
  const activeProgram=state.programs.find((program) => program.status==='active')
  return <div className="space-y-6">
    {notice ? <p role="status" className="break-all rounded-xl border border-green-300 bg-green-50 p-4 text-sm">{notice}</p> : null}
    {error ? <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm">{error}</p> : null}
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold">프로그램·비상 제어</h2>
      {state.programs.map((program) => <div key={program.id} className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm"><span><strong>{program.name}</strong> · {program.status} · {program.emergency_disabled_at ? '비상 중단' : '정상'}</span><div className="flex gap-2"><button className="border px-3 py-2" onClick={() => mutate({action:'emergency',programId:program.id,disabled:true,reason:'ADMIN_EMERGENCY'}).catch((reason)=>setError(String(reason)))}>즉시 중단</button><button className="border px-3 py-2" onClick={() => mutate({action:'emergency',programId:program.id,disabled:false,reason:'ADMIN_RESTORE'}).catch((reason)=>setError(String(reason)))}>복구</button></div></div>)}
    </section>
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold">해시 초대 발급</h2>
      <form onSubmit={issueInvite} className="mt-3 grid gap-3 md:grid-cols-2">
        <select required name="programId" className="border p-3">{state.programs.map((program)=><option key={program.id} value={program.id}>{program.name}</option>)}</select>
        <input name="email" type="email" placeholder="제한 이메일(선택)" className="border p-3" />
        <input name="domain" placeholder="제한 도메인(선택)" className="border p-3" />
        <input required name="maxUses" type="number" min="1" max="1000" defaultValue="1" className="border p-3" />
        <input required name="expiresAt" type="datetime-local" className="border p-3" />
        <button className="bg-gray-950 p-3 font-semibold text-white">초대 발급</button>
      </form>
    </section>
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold">검수 대기 회원</h2>
      {state.members.map((member)=><div key={member.id} className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm"><span>{member.id} · {member.status} · {new Date(member.enrolled_at).toLocaleString('ko-KR')}</span><div className="flex gap-2"><button className="border px-3 py-2" onClick={()=>mutate({action:'review_member',memberId:member.id,status:'active',reason:'ADMIN_APPROVED'}).catch((reason)=>setError(String(reason)))}>승인</button><button className="border px-3 py-2" onClick={()=>mutate({action:'review_member',memberId:member.id,status:'suspended',reason:'ADMIN_SUSPENDED'}).catch((reason)=>setError(String(reason)))}>중단</button></div></div>)}
    </section>
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold">기능 제어</h2>
      <div className="mt-3 grid gap-2 md:grid-cols-2">{betaFeatureKeys.map((feature)=>{ const flag=state.flags.find((item)=>item.feature_key===feature && item.program_id===null); return <button key={feature} className="flex justify-between border p-3 text-left text-sm" onClick={()=>mutate({action:'set_feature',programId:null,userId:null,feature,enabled:!(flag?.enabled??false),reason:'ADMIN_FEATURE_CONTROL'}).catch((reason)=>setError(String(reason)))}><span>{feature}</span><strong>{flag?.enabled ? 'ON':'OFF'}</strong></button> })}</div>
      {!activeProgram ? <p className="mt-3 text-sm text-red-700">활성 프로그램이 없습니다.</p> : null}
    </section>
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold">제한 출시 온보딩 퍼널</h2>
      <p className="mt-2 text-sm text-gray-600">개인 원문 없이 현재 단계와 최근 14일 최초 단계 진입 집계만 표시합니다.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {state.launch.currentStages.map((item)=><div key={`${item.stage_key}:${item.source_channel}`} className="rounded-xl bg-gray-50 p-4">
          <p className="text-xs text-gray-500">{item.source_channel}</p>
          <p className="mt-1 text-sm font-semibold text-gray-800">{item.stage_key}</p>
          <p className="mt-2 text-2xl font-black">{item.masked ? '10명 미만' : item.count}</p>
        </div>)}
      </div>
      <p className="mt-4 text-xs text-gray-500">10명 미만 세그먼트는 정확한 숫자를 표시하지 않습니다. 최근 14일 공개 가능 세그먼트: {state.launch.dailyEntries.filter((item)=>!item.masked).length}개</p>
    </section>
    <div className="grid gap-6 md:grid-cols-2">{(['jobs','exports','events','incidents'] as const).map((key)=><section key={key} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="mb-3 text-lg font-bold">{key}</h2><p className="text-3xl font-black">{state[key].length}</p><pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs text-gray-600">{JSON.stringify(state[key],null,2)}</pre></section>)}</div>
  </div>
}
