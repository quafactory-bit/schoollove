'use client'

import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { enableCurrentDevicePush, getBrowserPushStatus } from '@/lib/push/browser'

// v2-09a: 가입·설치 안내 다음 출석부에서 딱 한 번 알림을 권한다. 켜든 나중에든 다시 묻지 않고,
// 이후에는 계정 설정의 알림 스위치로만 켠다. 브라우저 권한 요청은 사용자가 버튼을 눌렀을 때만.
export const PUSH_PROMPTED_KEY = 'sl_push_prompted_v2'

function markPrompted() {
  try { window.localStorage.setItem(PUSH_PROMPTED_KEY, '1') } catch { /* 로컬 기록은 선택 사항 */ }
}

export default function PushOptInCard() {
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    let prompted = true
    try { prompted = window.localStorage.getItem(PUSH_PROMPTED_KEY) === '1' } catch { /* 기록을 못 읽으면 묻지 않는다 */ }
    if (prompted) return
    void getBrowserPushStatus().then(status => { if (active && status === 'disabled') setVisible(true) }).catch(() => undefined)
    return () => { active = false }
  }, [])

  if (!visible) return null

  async function enable() {
    setBusy(true)
    markPrompted()
    try {
      const status = await enableCurrentDevicePush()
      if (status === 'enabled') { setVisible(false); return }
      setNotice(status === 'denied' ? '알림이 차단돼 있어요. 나중에 설정에서 켤 수 있어요.' : '지금은 알림을 켤 수 없어요.')
    } catch {
      setNotice('알림을 켜지 못했어요. 나중에 설정에서 켤 수 있어요.')
    } finally { setBusy(false) }
  }

  return (
    <section aria-label="알림 받기" className="mt-3 rounded-2xl border border-sl-line px-3.5 py-3">
      <p className="flex items-start gap-2.5 text-[14px] font-bold leading-[1.45] text-sl-ink">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-sl-brand-soft text-sl-brand"><Bell className="h-4 w-4" aria-hidden="true" /></span>
        <span>새 동문이 들어오거나 인스타 요청이 오면 알려드릴까요?<small className="mt-0.5 block text-[12px] font-semibold text-sl-ink3">이 두 가지만 보내요. 밤 11시~아침 7시에는 보내지 않아요.</small></span>
      </p>
      {notice ? <p role="status" className="mt-2 text-xs text-sl-ink2">{notice}</p> : null}
      <div className="mt-2.5 flex gap-2">
        <button type="button" disabled={busy} onClick={() => void enable()} className="btn-pill schoollove-focus disabled:opacity-50">알림 켜기</button>
        <button type="button" onClick={() => { markPrompted(); setVisible(false) }} className="btn-pill btn-pill-muted schoollove-focus">나중에</button>
      </div>
    </section>
  )
}
