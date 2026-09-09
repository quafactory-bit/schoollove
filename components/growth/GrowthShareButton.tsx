'use client'

import { useState } from 'react'
import { buildGrowthShareUrl } from '@/lib/growthReferral'

export default function GrowthShareButton({ schoolId, schoolName, slug }: { schoolId: string; schoolName: string; slug: string }) {
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  async function share() {
    if (busy) return
    setBusy(true)
    try {
      let url = link
      if (!url) {
        const response = await fetch('/api/growth/referral', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ schoolId }) })
        const data = await response.json()
        if (!response.ok) throw new Error('SHARE_UNAVAILABLE')
        url = buildGrowthShareUrl(window.location.origin, slug, data.token)
        setLink(url)
      }
      const text = `${schoolName}. 우리 학교 같이 키워보자!`
      if (navigator.share) await navigator.share({ title: schoolName, text, url })
      else { await navigator.clipboard.writeText(url); setMessage('링크를 복사했어요. 7일 동안 사용할 수 있어요.') }
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) setMessage('공유하지 못했어요. 버튼을 다시 눌러 주세요.')
    } finally { setBusy(false) }
  }
  return <div><button type="button" disabled={busy} onClick={share} className="schoollove-dark-action schoollove-focus inline-flex min-h-12 items-center bg-[var(--schoollove-game-accent)] px-5 py-3 text-base font-semibold text-white disabled:opacity-60">{busy ? '공유 링크 준비 중…' : '친구 불러서 학교 키우기'}</button><p role="status" className="mt-2 text-sm leading-6">{message}</p></div>
}
