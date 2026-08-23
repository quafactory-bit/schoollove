'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { safeLoginDestination } from '@/lib/policy/onboarding'

type LaunchState = 'closed' | 'internal_test' | 'ready' | 'open' | 'emergency_stopped'

const launchMessages: Record<LaunchState,string> = {
  closed:'성인 계정 소프트런치를 준비하고 있습니다. 신규 계정은 아직 만들 수 없으며 기존 테스트 계정만 로그인할 수 있습니다.',
  internal_test:'내부 안전 검증 중입니다. 일반 신규 계정 생성은 아직 열리지 않았습니다.',
  ready:'공개 전 최종 준비 상태입니다. 별도 승인 전에는 신규 계정을 만들 수 없습니다.',
  open:'만 19세 이상 이용자는 이메일 인증으로 본인용 비공개 계정을 시작할 수 있습니다.',
  emergency_stopped:'안전 점검을 위해 계정 기능을 일시 중단했습니다.',
}

export default function LoginPage() {
  const [email,setEmail] = useState('')
  const [token,setToken] = useState('')
  const [step,setStep] = useState<'email'|'otp'>('email')
  const [status,setStatus] = useState('')
  const [isError,setIsError] = useState(false)
  const [busy,setBusy] = useState(false)
  const [cooldown,setCooldown] = useState(0)
  const [launchState,setLaunchState] = useState<LaunchState>('closed')

  useEffect(() => {
    fetch('/api/auth/launch-state',{cache:'no-store'})
      .then(async (response) => response.ok ? response.json() : null)
      .then((body) => {
        if (body && ['closed','internal_test','ready','open','emergency_stopped'].includes(body.state)) {
          setLaunchState(body.state)
        }
      }).catch(() => undefined)
  },[])

  useEffect(() => {
    if (cooldown <= 0) return
    const timer=window.setTimeout(()=>setCooldown((value)=>Math.max(0,value-1)),1000)
    return ()=>window.clearTimeout(timer)
  },[cooldown])

  async function sendOtp() {
    if (busy || cooldown > 0) return
    setBusy(true); setStatus(''); setIsError(false)
    try {
      const response=await fetch('/api/auth/request-otp',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email}),
      })
      const result=await response.json().catch(()=>({})) as {message?:string;error?:string}
      setStatus(result.message??result.error??'요청을 완료할 수 없습니다.')
      setIsError(!response.ok)
      if (response.ok) { setStep('otp'); setCooldown(30) }
    } catch {
      setStatus('네트워크 연결을 확인한 뒤 다시 시도해 주세요.'); setIsError(true)
    } finally { setBusy(false) }
  }

  async function requestOtp(event:React.FormEvent) {
    event.preventDefault()
    await sendOtp()
  }

  function rejectInvalidTokenPaste(event:React.ClipboardEvent<HTMLInputElement>) {
    const pasted=event.clipboardData.getData('text')
    if (/^\d{6}$/.test(pasted)) return
    event.preventDefault()
    setToken('')
    setStatus('인증번호는 숫자 6자리만 입력해 주세요.')
    setIsError(true)
  }

  async function verifyOtp(event:React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setStatus(''); setIsError(false)
    try {
      const response=await fetch('/api/auth/verify-otp',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,token}),
      })
      const result=await response.json().catch(()=>({})) as {error?:string}
      if (!response.ok) {
        setStatus(result.error??'인증을 완료할 수 없습니다.'); setIsError(true); return
      }
      window.location.assign(safeLoginDestination(new URL(window.location.href).searchParams.get('next')))
    } catch {
      setStatus('네트워크 연결을 확인한 뒤 다시 시도해 주세요.'); setIsError(true)
    } finally { setBusy(false) }
  }

  return <main className="mx-auto min-h-[calc(100vh-4rem)] max-w-md px-5 py-10 sm:py-14">
    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600">Adult-only private account</p>
    <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-950">이메일로 로그인</h1>
    <p className="mt-3 text-sm leading-6 text-gray-600">개인 기능은 만 19세 이상 본인만 사용할 수 있습니다. 이메일 인증 뒤 성인 자기진술과 필수 동의가 필요합니다.</p>
    <p className="mt-5 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm leading-6 text-gray-700" role="status">
      {launchMessages[launchState]}
    </p>

    {step==='email' ? <form onSubmit={requestOtp} className="mt-8 space-y-4">
      <label className="block text-sm font-medium text-gray-800" htmlFor="email">이메일</label>
      <input id="email" type="email" inputMode="email" autoComplete="email" required maxLength={254}
        value={email} onChange={(event)=>setEmail(event.target.value)}
        className="schoollove-focus min-h-12 w-full rounded-xl border border-gray-300 px-4 py-3" />
      <button disabled={busy} className="schoollove-dark-action schoollove-focus min-h-12 w-full rounded-xl bg-gray-950 px-4 py-3 font-semibold text-white disabled:opacity-50">
        {busy?'보내는 중…':'인증번호 받기'}
      </button>
    </form> : <form onSubmit={verifyOtp} className="mt-8 space-y-4">
      <p className="break-all rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700">입력한 이메일로 보낸 6자리 번호를 확인해 주세요.</p>
      <label className="block text-sm font-medium text-gray-800" htmlFor="token">인증번호 6자리</label>
      <input id="token" inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" maxLength={6}
        value={token} onChange={(event)=>setToken(event.target.value.replace(/\D/g,''))} onPaste={rejectInvalidTokenPaste}
        className="schoollove-focus min-h-14 w-full rounded-xl border border-gray-300 px-4 py-3 text-center text-2xl tracking-[0.35em]" />
      <button disabled={busy||token.length!==6} className="schoollove-dark-action schoollove-focus min-h-12 w-full rounded-xl bg-gray-950 px-4 py-3 font-semibold text-white disabled:opacity-50">
        {busy?'확인 중…':'로그인'}
      </button>
      <button type="button" disabled={busy||cooldown>0} onClick={()=>void sendOtp()}
        className="schoollove-focus min-h-11 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-700 disabled:text-gray-400">
        {cooldown>0?`재전송까지 ${cooldown}초`:'인증번호 다시 받기'}
      </button>
      <button type="button" onClick={()=>{setStep('email');setToken('');setStatus('');setIsError(false)}}
        className="schoollove-focus min-h-11 w-full py-2 text-sm text-gray-500">이메일 변경</button>
    </form>}

    {status ? <p role={isError?'alert':'status'} aria-live="polite" className={`mt-4 text-sm ${isError?'text-red-700':'text-gray-700'}`}>{status}</p> : null}
    <p className="mt-8 text-xs leading-5 text-gray-500">자기진술 방식은 신분증 기반 본인확인이 아닙니다. <Link href="/privacy" className="underline">개인정보처리방침</Link>과 <Link href="/terms" className="underline">이용약관</Link>을 확인해 주세요.</p>
  </main>
}
