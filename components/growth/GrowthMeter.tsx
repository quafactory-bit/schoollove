import type { SchoolGrowth } from '@/lib/schoolGrowthGame'
import { getSchoolWorldStage } from '@/components/game/SchoolWorld'

export default function GrowthMeter({ growth, projection = 'public' }: { growth: Pick<SchoolGrowth, 'schoolName' | 'level' | 'progress'>; projection?: 'public' | 'owner' }) {
  return <div className="sl-growth-meter mt-5">
    <p className="sl-stage-label">{getSchoolWorldStage(growth.level).label}</p>
    <p className="mb-3 text-xs font-semibold text-[var(--schoollove-game-accent)]">{projection === 'owner' ? '내 학교 · 현재 레벨' : '학교 레벨 · 공개 집계'}</p>
    <div className="flex items-end justify-between gap-4"><p className="text-4xl font-bold tracking-tight">Lv.{growth.level}</p><p className="text-sm">다음 목표 <strong>Lv.{growth.level + 1}</strong> · {growth.progress}%</p></div>
    <div role="progressbar" aria-label={`${growth.schoolName} ${projection === 'owner' ? '내 학교 실시간' : '공개'} 다음 레벨까지의 진행률`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={growth.progress} className="mt-4 h-2 overflow-hidden rounded-full bg-schoollove-border"><div className="h-full rounded-full bg-[var(--schoollove-game-accent)] transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${growth.progress}%` }} /></div>
    <p className="mt-3 text-sm leading-6">{growth.progress >= 80 ? '다음 레벨이 가까워졌어요.' : '친구와 함께 XP를 모아 학교 레벨을 올려보세요.'}</p>
    <p className="mt-1 text-xs leading-5">{projection === 'owner' ? '내 학교의 레벨과 XP를 바로 확인해요. 공개 화면에는 XP 변화를 모아서 반영합니다.' : '개인 참여가 드러나지 않도록 XP 변화는 모아서 반영합니다.'}</p>
  </div>
}
