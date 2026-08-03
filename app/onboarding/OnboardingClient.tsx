'use client'

import Link from 'next/link'
import { useCallback,useEffect,useState } from 'react'
import type { OnboardingState } from '@/lib/onboarding'

const steps = [
  ['adultReady','만 19세 이상 자기진술'],
  ['consentsReady','필수 동의 4개'],
  ['profileReady','본인용 비공개 프로필'],
  ['schoolReady','본인의 과거 학교 이력'],
] as const

const stageMessage:Record<OnboardingState['stage'],string> = {
  access_paused:'현재 계정 설정을 변경할 수 없습니다. 공개 준비 상태 또는 탈퇴 처리 상태를 확인해 주세요.',
  adult_required:'먼저 만 19세 이상임을 자기진술로 확인해 주세요.',
  consent_required:'현재 정책의 필수 동의 4개를 완료해 주세요.',
  profile_required:'본인만 볼 수 있는 비공개 프로필을 만들어 주세요.',
  school_required:'본인이 다닌 과거 학교 이력을 한 곳 이상 추가해 주세요.',
  ready:'비공개 계정 시작 준비를 모두 마쳤습니다.',
}

export default function OnboardingClient() {
  const [state,setState]=useState<OnboardingState|null>(null)
  const [notice,setNotice]=useState('')
  const [busy,setBusy]=useState(false)
  const load=useCallback(async()=>{
    setBusy(true)
    try {
      const response=await fetch('/api/onboarding?source=direct',{cache:'no-store'})
      const body=await response.json().catch(()=>({})) as {state?:OnboardingState;error?:string}
      if(!response.ok||!body.state) throw new Error(body.error??'ONBOARDING_STATE_UNAVAILABLE')
      setState(body.state);setNotice('')
    } catch { setNotice('시작 상태를 불러오지 못했습니다. 로그인 상태와 네트워크를 확인해 주세요.') }
    finally { setBusy(false) }
  },[])
  useEffect(()=>{void load()},[load])

  return <main className="mx-auto min-h-screen max-w-2xl px-5 py-10">
    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600">Adult-only private account</p>
    <h1 className="mt-2 text-3xl font-black tracking-tight text-gray-950">비공개 계정 시작하기</h1>
    <p className="mt-3 text-sm leading-6 text-gray-600">본인 정보만 등록할 수 있고 모든 프로필은 비공개입니다. 공개 사람 명단·사람 검색·메시지·Instagram 공개는 제공하지 않습니다.</p>

    {!state ? <p className="mt-8 rounded-2xl bg-gray-50 p-5 text-sm" role="status">{busy?'안전한 시작 상태를 확인하고 있습니다.':'상태를 확인하지 못했습니다.'}</p> : <>
      <section className="mt-8 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-gray-950">현재 단계</p>
        <p className="mt-2 text-lg font-bold text-gray-950">{stageMessage[state.stage]}</p>
        <ol className="mt-5 space-y-3">
          {steps.map(([key,label],index)=>{const complete=state[key]===true;return <li key={key} className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3 text-sm">
            <span aria-hidden className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-bold ${complete?'bg-emerald-600 text-white':'border border-gray-300 bg-white text-gray-500'}`}>{complete?'✓':index+1}</span>
            <span className={complete?'font-semibold text-gray-950':'text-gray-600'}>{label}</span>
          </li>})}
        </ol>
      </section>
      {state.stage!=='access_paused'&&state.stage!=='ready' ? <Link href="/account" className="schoollove-focus mt-5 block min-h-12 rounded-xl bg-gray-950 px-4 py-3 text-center text-sm font-semibold text-white">내 계정에서 다음 단계 완료하기</Link> : null}
      {state.stage==='ready' ? <Link href="/account" className="schoollove-focus mt-5 block min-h-12 rounded-xl bg-gray-950 px-4 py-3 text-center text-sm font-semibold text-white">내 계정 요약 보기</Link> : null}
    </>}
    {notice ? <div className="mt-5 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700" role="alert"><p>{notice}</p><button type="button" onClick={()=>void load()} className="schoollove-focus mt-3 min-h-11 underline">다시 시도</button></div> : null}
    <p className="mt-8 text-xs leading-5 text-gray-500">로그아웃 후 다시 로그인해도 완료 상태는 실제 비공개 DB 기록을 기준으로 복원됩니다.</p>
  </main>
}
