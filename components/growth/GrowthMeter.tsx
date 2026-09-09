import type { SchoolGrowth } from '@/lib/schoolGrowthGame'

export default function GrowthMeter({ growth }: { growth: SchoolGrowth }) {
  return <div className="mt-5">
    <div className="flex items-end justify-between gap-4"><p className="text-4xl font-bold tracking-tight">Lv.{growth.level}</p><p className="text-sm">다음 레벨까지 성장 중</p></div>
    <div role="progressbar" aria-label={`${growth.schoolName} 공개 성장 진행률`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={growth.progress} className="mt-4 h-2 overflow-hidden rounded-full bg-schoollove-border"><div className="h-full rounded-full bg-[var(--schoollove-game-accent)] transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${growth.progress}%` }} /></div>
    <p className="mt-3 text-sm leading-6">{growth.progress >= 80 ? '다음 레벨이 가까워졌어요.' : '학교에 다시 모여, 함께 키워요.'}</p>
    <p className="mt-1 text-xs leading-5">개인 참여가 드러나지 않도록 성장은 모아서 반영합니다.</p>
  </div>
}
