import Link from 'next/link'
import type { RosterRowAction } from '@/lib/policy/roster'

// v2-06: 명단 행 오른쪽 알약 버튼 4상태 — 인스타 요청(초록) / 요청 보냄(회색) / 수락하기(검정, 알림 탭) / 나: 숨기기(글자).
export default function RosterRowButton({ action, busy = false, onRequest, onHide }: {
  action: RosterRowAction
  busy?: boolean
  onRequest?: () => void
  onHide?: () => void
}) {
  if (action === 'me') return <button type="button" onClick={onHide} className="schoollove-focus shrink-0 px-1 text-[13.5px] font-bold text-sl-ink3">숨기기</button>
  if (action === 'sent') return <span className="btn-pill btn-pill-muted shrink-0" aria-disabled="true">요청 보냄</span>
  if (action === 'accept') return <Link href="/notifications" className="btn-pill btn-pill-dark schoollove-focus shrink-0">수락하기</Link>
  return <button type="button" disabled={busy} onClick={onRequest} className="btn-pill schoollove-focus shrink-0 disabled:opacity-50">인스타 요청</button>
}
