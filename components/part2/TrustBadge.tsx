'use client'

import { useEffect, useState } from 'react'
import { incomingFunnelSource } from '@/lib/part2Funnel'

export const TRUST_BADGE_TEXT = '대형 마케팅 업체가 아니라 1인 개인사업자가 순수하게 옛 동창들이 보고 싶어서 직접 만든 무광고 공간입니다. 미인증·탈퇴 데이터는 자동 파기되며, 서로 수락한 동창에게만 인스타가 열립니다.'
const SOCIAL_SEEN_KEY = 'sl_p2_social_visit'

/** True when this visit came from Instagram/Threads (?ref=ig, ?ref=threads or their referrer), remembered for the tab. */
export function useSocialVisit(): boolean {
  const [social, setSocial] = useState(false)
  useEffect(() => {
    try {
      const source = incomingFunnelSource(window.location.href, document.referrer)
      if (source === 'instagram' || source === 'threads') {
        try { window.sessionStorage.setItem(SOCIAL_SEEN_KEY, '1') } catch { /* optional */ }
        setSocial(true)
        return
      }
      setSocial(window.sessionStorage.getItem(SOCIAL_SEEN_KEY) === '1')
    } catch { setSocial(false) }
  }, [])
  return social
}

function Badge({ className = '' }: { className?: string }) {
  return (
    <aside aria-label="만든 사람 안내" className={`rounded-2xl border border-[#16a34a]/30 bg-[#fcfaf5] px-4 py-3 ${className}`}>
      <p className="flex items-center gap-1.5 text-[13px] font-black text-[#14532d]"><span aria-hidden="true" className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#16a34a] text-[12px] text-white">✓</span>무광고 · 1인 개인사업자</p>
      <p className="mt-1.5 break-keep text-[13px] leading-[1.6] text-sl-ink2">{TRUST_BADGE_TEXT}</p>
    </aside>
  )
}

/** Part 2 P2: shown at the top only for Instagram/Threads visitors. */
export function TopTrustBadge() {
  return useSocialVisit() ? <Badge className="mb-3 mt-1" /> : null
}

/** Part 2 P2: always-on placement (home lower section, signup screen). Hidden where the top one already shows. */
export default function TrustBadge({ className = '' }: { className?: string }) {
  return useSocialVisit() ? null : <Badge className={className} />
}
