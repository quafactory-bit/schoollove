import type { SchoolGrowth } from '@/lib/schoolGrowthGame'

export default function GrowthMeter({ growth, projection = 'public' }: { growth: Pick<SchoolGrowth, 'schoolName' | 'level' | 'progress'>; projection?: 'public' | 'owner' }) {
  return <div className="mt-5">
    <p className="mb-3 text-xs font-semibold text-[var(--schoollove-game-accent)]">{projection === 'owner' ? '내 학교 · 실시간 성장' : '학교 성장 · 공개 집계'}</p>
    <div className="flex items-end justify-between gap-4"><p className="text-4xl font-bold tracking-tight">Lv.{growth.level}</p><p className="text-sm">다음 목표 <strong>Lv.{growth.level + 1}</strong> · {growth.progress}%</p></div>
    <div role="progressbar" aria-label={`${growth.schoolName} ${projection === 'owner' ? '내 학교 실시간' : '공개'} 성장 진행률`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={growth.progress} className="mt-4 h-2 overflow-hidden rounded-full bg-schoollove-border"><div className="h-full rounded-full bg-[var(--schoollove-game-accent)] transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${growth.progress}%` }} /></div>
    <p className="mt-3 text-sm leading-6">{growth.progress >= 80 ? '다음 레벨이 가까워졌어요.' : '학교에 다시 모여, 함께 키워요.'}</p>
    <p className="mt-1 text-xs leading-5">{projection === 'owner' ? '내 학교의 성장을 바로 확인해요. 공개 화면에는 성장을 모아서 반영합니다.' : '개인 참여가 드러나지 않도록 성장은 모아서 반영합니다.'}</p>
  </div>
}
