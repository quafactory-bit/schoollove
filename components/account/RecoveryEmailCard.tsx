'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Stage = 'loading' | 'hidden' | 'registered' | 'email' | 'otp' | 'done'

const ERRORS: Record<string, string> = {
  EMAIL_INVALID: '이메일 주소를 다시 확인해 주세요.',
  LIMITED: '잠시 후 다시 시도해 주세요. (1분에 1번, 하루 3번까지)',
  SEND_FAILED: '인증번호를 보내지 못했어요. 잠시 후 다시 시도해 주세요.',
  OTP_REJECTED: '인증번호가 맞지 않아요.',
  LOCKED: '5번 틀려서 이 인증번호는 막혔어요. 처음부터 다시 받아 주세요.',
  EXPIRED: '10분이 지나 인증번호가 만료됐어요. 다시 받아 주세요.',
  EMAIL_UNAVAILABLE: '이 이메일은 쓸 수 없어요. 다른 이메일로 등록해 주세요.',
  ALREADY_REGISTERED: '이미 복구 이메일이 등록돼 있어요.',
}

/** Part 2 P2b: optional, later registration of the 8-digit custom recovery email. */
export default function RecoveryEmailCard() {
  const [stage, setStage] = useState<Stage>('loading')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [challenge, setChallenge] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    fetch('/api/account/recovery-email', { cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then((body: { registered?: boolean | null; available?: boolean } | null) => {
        if (!alive) return
        if (body?.registered === true) setStage('registered')
        else if (body?.available === true) setStage('email')
        else setStage('hidden')
      })
      .catch(() => { if (alive) setStage('hidden') })
    return () => { alive = false }
  }, [])

  async function post(payload: Record<string, string>) {
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/account/recovery-email', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      const body = await response.json().catch(() => ({})) as { state?: string; challenge?: string; error?: string }
      return { ok: response.ok, body }
    } finally { setBusy(false) }
  }

  if (stage === 'loading' || stage === 'hidden') return null
  return <section className="mt-5 rounded-2xl border border-gray-200 bg-white p-5" aria-labelledby="recovery-email-title">
    <h2 id="recovery-email-title" className="text-lg font-bold text-gray-950">복구 이메일 <span className="text-sm font-normal text-gray-500">(선택)</span></h2>
    {stage === 'registered' || stage === 'done'
      ? <p className="mt-2 text-sm leading-6 text-gray-700" role="status">{stage === 'done' ? '복구 이메일을 등록했어요.' : '복구 이메일이 등록돼 있어요.'} 주소는 화면에 다시 보여 주지 않아요.</p>
      : <>
        <p className="mt-2 text-sm leading-6 text-gray-700">로그인 ID가 아니라, 나중에 계정 소유를 확인하고 같은 사람이 계정을 여러 개 만드는 것을 막는 데만 써요. 등록하지 않아도 출석부는 그대로 쓸 수 있어요.</p>
        <p className="mt-1 text-xs leading-5 text-gray-500">인증번호 메일은 미국의 Resend로 보내요. 자세한 보관 기간은 <Link href="/privacy#authentication" className="underline">개인정보처리방침</Link>에 있어요.</p>
        {stage === 'email'
          ? <form className="mt-4 flex flex-col gap-2" onSubmit={async event => {
              event.preventDefault()
              const { ok, body } = await post({ action: 'send', email })
              if (ok && body.state === 'sent' && body.challenge) { setChallenge(body.challenge); setStage('otp') }
              else setMessage(ERRORS[body.error ?? ''] ?? '지금은 등록할 수 없어요. 잠시 후 다시 시도해 주세요.')
            }}>
              <label className="text-sm font-semibold text-gray-900">이메일
                <input value={email} onChange={event => setEmail(event.target.value)} type="email" autoComplete="email" maxLength={254} required className="mt-1 block min-h-12 w-full rounded-xl border border-gray-300 px-3 text-base" />
              </label>
              <button type="submit" disabled={busy} className="schoollove-dark-action schoollove-focus min-h-12 rounded-xl bg-schoollove-text px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">8자리 인증번호 받기</button>
            </form>
          : <form className="mt-4 flex flex-col gap-2" onSubmit={async event => {
              event.preventDefault()
              const { ok, body } = await post({ action: 'verify', challenge, otp })
              if (ok && body.state === 'registered') { setStage('done'); setOtp(''); setEmail('') }
              else {
                setMessage(ERRORS[body.error ?? ''] ?? '확인하지 못했어요. 다시 시도해 주세요.')
                if (body.error === 'LOCKED' || body.error === 'EXPIRED' || body.error === 'EMAIL_UNAVAILABLE') { setStage('email'); setOtp('') }
              }
            }}>
              <label className="text-sm font-semibold text-gray-900">메일로 받은 8자리 인증번호 (10분 안에)
                <input value={otp} onChange={event => setOtp(event.target.value.replace(/[^0-9]/g, '').slice(0, 8))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" minLength={8} maxLength={8} required className="mt-1 block min-h-12 w-full rounded-xl border border-gray-300 px-3 text-base tracking-[0.3em]" />
              </label>
              <button type="submit" disabled={busy} className="schoollove-dark-action schoollove-focus min-h-12 rounded-xl bg-schoollove-text px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">확인</button>
              <button type="button" disabled={busy} onClick={() => { setStage('email'); setOtp(''); setMessage('') }} className="schoollove-focus min-h-11 text-sm text-gray-600 underline">이메일 다시 입력</button>
            </form>}
      </>}
    {message ? <p className="mt-3 text-sm text-red-700" role="alert">{message}</p> : null}
  </section>
}
