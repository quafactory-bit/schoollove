'use client'

import { useEffect, useState } from 'react'
import type { SchoolGrowth } from '@/lib/schoolGrowthGame'
import GrowthMeter from './GrowthMeter'
import GrowthShareButton from './GrowthShareButton'

export default function OwnerGrowthFeedback({ schoolId }: { schoolId: string }) {
  const [data, setData] = useState<{ contribution: { contributed: boolean; xp: number }; growth: SchoolGrowth | null } | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/account/growth?school=${encodeURIComponent(schoolId)}`, { signal: controller.signal })
      .then(async response => { if (response.ok) setData(await response.json()) }).catch(() => undefined)
    return () => controller.abort()
  }, [schoolId])
  if (!data) return null
  return <div className="mt-5 border-t border-schoollove-border pt-4">
    {data.contribution.contributed ? <p role="status" className="text-base font-semibold text-[var(--schoollove-game-accent)]">우리 학교가 성장했어요! 내 첫 참여 +{data.contribution.xp} XP</p> : <p className="text-sm">이미 등록한 학교예요. 친구와 함께 다음 성장을 만들어 보세요.</p>}
    {data.growth && <><GrowthMeter growth={data.growth} /><div className="mt-4"><GrowthShareButton schoolId={schoolId} schoolName={data.growth.schoolName} slug={data.growth.slug} level={data.growth.level} /></div></>}
  </div>
}
