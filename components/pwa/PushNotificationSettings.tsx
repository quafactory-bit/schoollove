'use client'

import { useEffect, useState } from 'react'
import {
  disableCurrentDevicePush,
  enableCurrentDevicePush,
  getBrowserPushStatus,
  syncCurrentDevicePush,
  type BrowserPushStatus,
} from '@/lib/push/browser'

const statusCopy: Record<BrowserPushStatus, string> = {
  enabled: '이 기기에서 동창 알림을 받고 있어요.',
  disabled: '이 기기의 동창 알림이 꺼져 있어요.',
  denied: '브라우저 설정에서 알림 권한을 허용해 주세요.',
  unsupported: '이 브라우저에서는 웹 푸시를 지원하지 않아요.',
  'ios-install-required': 'iPhone·iPad에서는 먼저 홈 화면에 추가한 뒤 설치된 앱에서 켜 주세요.',
  'not-configured': '동창 알림을 준비 중입니다.',
}

export default function PushNotificationSettings() {
  const [status, setStatus] = useState<BrowserPushStatus>('disabled')
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void syncCurrentDevicePush()
      .then((next) => { if (active) setStatus(next) })
      .catch(async () => {
        if (!active) return
        setStatus(await getBrowserPushStatus())
        setError('알림 상태를 동기화하지 못했습니다.')
      })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [])

  const toggle = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      setStatus(status === 'enabled'
        ? await disableCurrentDevicePush()
        : await enableCurrentDevicePush())
    } catch {
      setError('알림 설정을 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  const canToggle = status === 'enabled' || status === 'disabled'
  return (
    <section className="mt-5 rounded-2xl border border-gray-200 bg-white p-5" aria-labelledby="push-settings-title">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 id="push-settings-title" className="text-lg font-bold text-gray-950">동창 알림</h2>
          <p className="mt-2 text-sm leading-6 text-gray-600">같은 학교·졸업연도에 새 동창이 등록되면 알려드려요. 이름이나 인스타그램주소는 알림에 넣지 않아요.</p>
          <p className="mt-1 text-xs leading-5 text-gray-500">{statusCopy[status]}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={status === 'enabled'}
          disabled={busy || !canToggle}
          onClick={() => void toggle()}
          className="schoollove-focus min-h-11 rounded-xl border border-gray-900 px-4 py-2 text-sm font-semibold text-gray-900 disabled:opacity-40"
        >
          {busy ? '확인 중' : status === 'enabled' ? '끄기' : '켜기'}
        </button>
      </div>
      {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
    </section>
  )
}
