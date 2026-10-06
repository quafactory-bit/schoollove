'use client'

import { useEffect, useState } from 'react'
import { enableCurrentDevicePush, getBrowserPushStatus, type BrowserPushStatus } from '@/lib/push/browser'

const DISMISSED_AT_KEY = 'schoollove:push-prompt-dismissed-at'
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000

function isDismissed(): boolean {
  try {
    const dismissedAt = Number(window.localStorage.getItem(DISMISSED_AT_KEY))
    return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < DISMISS_DURATION_MS
  } catch {
    return true
  }
}

function rememberDismissal(): void {
  try {
    window.localStorage.setItem(DISMISSED_AT_KEY, String(Date.now()))
  } catch {
    // If persistence is unavailable, keep the choice for this render only.
  }
}

export default function SchoolmatePushPrompt({ onDismiss }: { onDismiss: () => void }) {
  const [status, setStatus] = useState<BrowserPushStatus | 'loading'>('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    if (isDismissed()) {
      onDismiss()
      return () => { active = false }
    }
    void getBrowserPushStatus().then((next) => {
      if (!active) return
      if (next === 'enabled' || next === 'unsupported' || next === 'not-configured') onDismiss()
      else setStatus(next)
    }).catch(onDismiss)
    return () => { active = false }
  }, [onDismiss])

  const dismiss = () => {
    rememberDismissal()
    onDismiss()
  }

  const enable = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const next = await enableCurrentDevicePush()
      setStatus(next)
      if (next === 'enabled') onDismiss()
      if (next === 'denied') {
        rememberDismissal()
        onDismiss()
      }
    } catch {
      setError('알림을 켜지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  if (status === 'loading') return null
  const needsInstall = status === 'ios-install-required'
  const denied = status === 'denied'

  return (
    <aside className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-4" aria-label="동창 알림 안내">
      <p className="font-semibold text-gray-950">동창이 들어오면 알려드릴까요?</p>
      <p className="mt-2 text-sm leading-6 text-gray-600">
        {needsInstall
          ? "iPhone·iPad에서는 공유 버튼 → '홈 화면에 추가'로 설치한 뒤 알림을 켤 수 있어요."
          : denied
            ? '브라우저 설정에서 알림 권한을 허용한 뒤 내 계정에서 다시 켜 주세요.'
            : '같은 학교·졸업연도에 새 동창이 등록되면 개인정보 없이 알려드려요.'}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {!needsInstall && !denied ? <button type="button" disabled={busy} onClick={() => void enable()} className="schoollove-focus min-h-11 rounded-xl bg-[#0a0a0a] px-4 text-sm font-semibold text-white disabled:opacity-40">{busy ? '설정 중' : '알림 받기'}</button> : null}
        <button type="button" onClick={dismiss} className="schoollove-focus min-h-11 rounded-xl border border-gray-300 px-4 text-sm font-semibold text-gray-700">나중에</button>
      </div>
      {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
    </aside>
  )
}
