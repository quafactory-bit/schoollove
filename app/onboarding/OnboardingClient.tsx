'use client'

import Link from 'next/link'
import { FormEvent, useCallback, useEffect, useState } from 'react'
import type { OnboardingState } from '@/lib/onboarding'

const steps = [
  ['adultReady','만 19세 이상 확인'],
  ['consentsReady','필수 동의'],
  ['memberStatus','제한 베타 초대와 운영자 승인'],
  ['profileReady','기본 비공개 본인 프로필'],
  ['schoolReady','과거 학교 이력'],
  ['discoveryReady','안전한 사람 찾기 준비'],
] as const

function isComplete(state: OnboardingState, key: typeof steps[number][0]) {
  if (key==='memberStatus') return state.memberStatus==='active'
  return state[key]===true
}

const stageMessage: Record<OnboardingState['stage'],string> = {
  adult_required:'먼저 만 19세 이상 확인이 필요합니다.',
  consent_required:'필수 동의를 완료해주세요.',
  invite_required:'운영자가 전달한 제한 베타 초대 토큰을 입력해주세요.',
  approval_pending:'초대가 확인되었습니다. 운영자 승인 대기 중입니다.',
  access_paused:'현재 제한 베타 접근이 일시 중단되었습니다.',
  profile_required:'본인만 볼 수 있는 비공개 프로필을 만들어주세요.',
  school_required:'졸업연도가 지난 본인 학교 이력을 추가해주세요.',
  ready:'안전한 사람 찾기를 시작할 준비가 끝났습니다.',
}

export default function OnboardingClient() {
  const [state,setState] = useState<OnboardingState|null>(null)
  const [token,setToken] = useState('')
  const [notice,setNotice] = useState('')
  const [busy,setBusy] = useState(false)
  const load = useCallback(async () => {
    const response=await fetch('/api/onboarding?source=direct',{cache:'no-store'})
    const body=await response.json().catch(()=>({})) as { state?:OnboardingState; error?:string }
    if (!response.ok || !body.state) throw new Error(body.error??'ONBOARDING_STATE_UNAVAILABLE')
    setState(body.state)
  },[])
  useEffect(()=>{load().catch(()=>setNotice('온보딩 상태를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.'))},[load])

  async function redeem(event:FormEvent) {
    event.preventDefault(); setBusy(true); setNotice('')
    const response=await fetch('/api/beta/redeem',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token})})
    const body=await response.json().catch(()=>({})) as { status?:string; error?:string }
    setBusy(false)
    if (!response.ok) { setNotice(body.error??'초대를 확인하지 못했습니다.'); return }
    setToken('')
    setNotice(body.status==='PENDING_REVIEW'?'초대가 확인되었습니다. 운영자 승인을 기다려주세요.':'초대 상태가 갱신되었습니다.')
    await load().catch(()=>undefined)
  }

  return <main className="mx-auto min-h-screen max-w-2xl px-5 py-10">
    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600">Adult-only limited beta</p>
    <h1 className="mt-2 text-3xl font-black tracking-tight text-gray-950">제한 베타 시작하기</h1>
    <p className="mt-3 text-sm leading-6 text-gray-600">개인 정보는 기본 비공개이며, 승인된 성인 사용자만 단계별로 시작할 수 있습니다. 본인 프로필과 본인이 졸업한 학교 정보만 입력하고 타인의 정보는 등록하지 마세요.</p>

    {!state ? <p className="mt-8 rounded-2xl bg-gray-50 p-5 text-sm">안전한 시작 상태를 확인하고 있습니다.</p> : <>
      <section className="mt-8 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-gray-950">현재 단계</p>
        <p className="mt-2 text-lg font-bold text-gray-950">{stageMessage[state.stage]}</p>
        <ol className="mt-5 space-y-3">
          {steps.map(([key,label],index)=><li key={key} className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3 text-sm">
            <span aria-hidden className={`flex h-7 w-7 items-center justify-center rounded-full font-bold ${isComplete(state,key)?'bg-emerald-600 text-white':'border border-gray-300 bg-white text-gray-500'}`}>{isComplete(state,key)?'✓':index+1}</span>
            <span className={isComplete(state,key)?'font-semibold text-gray-950':'text-gray-600'}>{label}</span>
          </li>)}
        </ol>
      </section>

      {(state.stage==='adult_required'||state.stage==='consent_required'||state.stage==='profile_required'||state.stage==='school_required') &&
        <Link href="/account" className="mt-5 block rounded-xl bg-gray-950 px-4 py-3 text-center text-sm font-semibold text-white">내 계정에서 다음 단계 완료하기</Link>}
      {state.stage==='invite_required' && <form onSubmit={redeem} className="mt-5 rounded-2xl border border-gray-200 bg-white p-5">
        <label htmlFor="invite-token" className="block text-sm font-semibold text-gray-900">제한 베타 초대 토큰</label>
        <p className="mt-2 text-xs leading-5 text-gray-500">운영자가 직접 전달한 토큰만 사용하세요. 토큰 원문은 서버에 저장되지 않습니다.</p>
        <input id="invite-token" required minLength={24} maxLength={256} value={token} onChange={(event)=>setToken(event.target.value.trim())}
          autoComplete="off" className="mt-3 w-full rounded-xl border border-gray-300 px-4 py-3" />
        <button disabled={busy} className="mt-3 w-full rounded-xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy?'확인 중...':'초대 확인하기'}</button>
      </form>}
      {state.stage==='ready' && <Link href="/people/search" className="mt-5 block rounded-xl bg-gray-950 px-4 py-3 text-center text-sm font-semibold text-white">정확한 이름으로 사람 찾기</Link>}
    </>}
    {notice && <p role="status" className="mt-5 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">{notice}</p>}
    <p className="mt-8 text-xs leading-5 text-gray-500">공개 사람 명단, 부분 이름 검색, 승인 전 Instagram 공개는 제공하지 않습니다.</p>
  </main>
}
