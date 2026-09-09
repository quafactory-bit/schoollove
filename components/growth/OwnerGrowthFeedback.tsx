'use client'

import { useEffect, useState } from 'react'
import type { OwnerGrowthResponse } from '@/lib/ownerSchoolGrowth'
import GrowthMeter from './GrowthMeter'
import GrowthShareButton from './GrowthShareButton'

export default function OwnerGrowthFeedback({ schoolId }: { schoolId: string }) {
  const [data, setData] = useState<OwnerGrowthResponse | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/account/growth?school=${encodeURIComponent(schoolId)}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        const next: OwnerGrowthResponse | null = response.ok ? await response.json() : null
        if (!controller.signal.aborted) setData(next)
      }).catch(() => { if (!controller.signal.aborted) setData(null) })
    return () => controller.abort()
  }, [schoolId])
  if (!data || data.growth.schoolId !== schoolId) return null
  return <div className="mt-5 border-t border-schoollove-border pt-4">
    {data.contribution.contributed ? <p role="status" className="text-base font-semibold text-[var(--schoollove-game-accent)]">우리 학교가 성장했어요! 내 첫 참여 +{data.contribution.xp} XP</p> : <p className="text-sm">이미 등록한 학교예요. 친구와 함께 다음 성장을 만들어 보세요.</p>}
    <GrowthMeter growth={data.growth} projection="owner" /><div className="mt-4"><GrowthShareButton schoolId={schoolId} schoolName={data.growth.schoolName} slug={data.growth.slug} /></div>
  </div>
}
