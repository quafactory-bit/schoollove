'use client'

import { useEffect, useRef, useState } from 'react'
import { GROWTH_TOKEN_PATTERN } from '@/lib/growthReferral'

export default function GrowthReferralLanding() {
  const started = useRef(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    if (started.current) return
    started.current = true
    const token = new URLSearchParams(window.location.hash.slice(1)).get('grow')
    if (!token) return
    window.history.replaceState(null, '', window.location.pathname)
    if (!GROWTH_TOKEN_PATTERN.test(token)) return
    fetch('/api/growth/visit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
      .then(async response => { const result = await response.json(); setMessage(result.accepted ? '친구와 함께 학교를 키워요. 가입 후 본인의 학교인지 확인해 등록해 주세요.' : '공유 링크가 만료되었거나 사용할 수 없어요. 학교 정보는 계속 볼 수 있어요.') })
      .catch(() => setMessage('공유 정보를 확인하지 못했어요. 학교 정보는 계속 볼 수 있어요.'))
  }, [])
  return message ? <p role="status" className="border border-schoollove-border bg-[var(--schoollove-game-surface)] p-5 text-base leading-7">{message}</p> : null
}
