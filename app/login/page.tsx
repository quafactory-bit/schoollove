'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { safeLoginDestination } from '@/lib/policy/onboarding'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [token, setToken] = useState('')
  const [step, setStep] = useState<'email' | 'otp'>('email')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  async function requestOtp(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setStatus('')
    const response = await fetch('/api/auth/request-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const result = await response.json() as { message?: string; error?: string }
    setBusy(false)
    setStatus(result.message ?? result.error ?? '요청을 완료할 수 없습니다.')
    if (response.ok) setStep('otp')
  }

  async function verifyOtp(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setStatus('')
    const response = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, token }),
    })
    const result = await response.json() as { error?: string }
    setBusy(false)
    if (!response.ok) {
      setStatus(result.error ?? '인증을 완료할 수 없습니다.')
      return
    }
    router.push(safeLoginDestination(new URL(window.location.href).searchParams.get('next')))
    router.refresh()
  }

  return (
    <main className="mx-auto min-h-[calc(100vh-4rem)] max-w-md px-5 py-12">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600">Adult-only private access</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-950">이메일로 로그인</h1>
      <p className="mt-3 text-sm leading-6 text-gray-600">
        개인 기능은 만 19세 이상 본인만 사용할 수 있습니다. 이메일 인증 뒤에도 성인 확인과 필수 동의가 필요합니다.
      </p>

      {step === 'email' ? (
        <form onSubmit={requestOtp} className="mt-8 space-y-4">
          <label className="block text-sm font-medium text-gray-800" htmlFor="email">이메일</label>
          <input id="email" type="email" autoComplete="email" required maxLength={254} value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-gray-900" />
          <button disabled={busy} className="w-full rounded-xl bg-gray-950 px-4 py-3 font-semibold text-white disabled:opacity-50">
            {busy ? '보내는 중...' : '인증번호 받기'}
          </button>
        </form>
      ) : (
        <form onSubmit={verifyOtp} className="mt-8 space-y-4">
          <p className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700">{email}로 보낸 6자리 번호를 입력해 주세요.</p>
          <label className="block text-sm font-medium text-gray-800" htmlFor="token">인증번호</label>
          <input id="token" inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" maxLength={6}
            value={token} onChange={(event) => setToken(event.target.value.replace(/\D/g, ''))}
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-center text-2xl tracking-[0.35em] outline-none focus:border-gray-900" />
          <button disabled={busy} className="w-full rounded-xl bg-gray-950 px-4 py-3 font-semibold text-white disabled:opacity-50">
            {busy ? '확인 중...' : '로그인'}
          </button>
          <button type="button" onClick={() => { setStep('email'); setToken(''); setStatus('') }} className="w-full py-2 text-sm text-gray-500">
            이메일 다시 입력
          </button>
        </form>
      )}

      {status && <p role="status" className="mt-4 text-sm text-gray-700">{status}</p>}
      <p className="mt-8 text-xs leading-5 text-gray-500">
        자기진술 방식의 성인 확인은 휴대전화·신분증 기반의 강한 본인확인이 아닙니다. 자세한 내용은{' '}
        <Link href="/privacy" className="underline">개인정보처리방침</Link>에서 확인하세요.
      </p>
    </main>
  )
}
