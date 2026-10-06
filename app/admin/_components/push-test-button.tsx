'use client'

import { useState } from 'react'
import { ensureBrowserPushSubscription, serializePushSubscription } from '@/lib/push/browser'

export function PushTestButton() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)

  const send = async () => {
    if (busy) return
    setBusy(true)
    setMessage('')
    setError(false)
    try {
      const result = await ensureBrowserPushSubscription()
      if (!result.subscription) {
        const copy = result.status === 'ios-install-required'
          ? 'iPhone·iPad에서는 홈 화면에 설치한 앱에서 테스트해 주세요.'
          : result.status === 'denied'
            ? '브라우저 설정에서 알림 권한을 허용해 주세요.'
            : '이 브라우저에서 푸시 알림을 사용할 수 없습니다.'
        setMessage(copy)
        setError(true)
        return
      }
      const response = await fetch('/api/admin/push/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serializePushSubscription(result.subscription)),
      })
      const body = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(body.error ?? '테스트 알림을 보낼 수 없습니다.')
      setMessage('이 기기로 테스트 알림을 보냈습니다.')
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '테스트 알림을 보낼 수 없습니다.')
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="font-semibold text-gray-950">웹 푸시 점검</h3>
      <p className="mt-2 text-sm text-gray-600">현재 관리자 브라우저의 권한을 요청하고 가짜 학교 등록 없이 테스트 알림을 보냅니다.</p>
      <button type="button" disabled={busy} onClick={() => void send()} className="mt-3 min-h-11 rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy ? '전송 중' : '내 기기로 테스트 알림 보내기'}</button>
      {message ? <p role={error ? 'alert' : 'status'} className={`mt-3 text-sm ${error ? 'text-red-700' : 'text-emerald-700'}`}>{message}</p> : null}
    </div>
  )
}
