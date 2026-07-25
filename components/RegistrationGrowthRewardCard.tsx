// PHASE 6B — 등록 완료 화면에서 growthRewardCopy.ts가 계산한 카피를 그대로 렌더링만 한다.
// 상태 분기는 여기서 하지 않는다(getGrowthRewardCopy가 이미 끝낸 계산 결과만 받는다).
import type { GrowthRewardCopy, GrowthRewardHeadline } from '@/app/submit/growthRewardCopy'
import type { RegistrationGrowthReward } from '@/types/registration'

type Props = {
  copy: GrowthRewardCopy
  reward?: RegistrationGrowthReward
  totalAtSchool?: number | null
}

function renderHeadline(headline: GrowthRewardHeadline): string | null {
  switch (headline.kind) {
    case 'level':
      return `Lv.${headline.before} → Lv.${headline.after}`
    case 'count':
      return `${headline.before}명 → ${headline.after}명`
    case 'near':
      return `다음 레벨까지 ${headline.remaining}명`
    case 'none':
      return null
  }
}

export default function RegistrationGrowthRewardCard({ copy, reward, totalAtSchool }: Props) {
  const headlineText = renderHeadline(copy.headline)
  const snapshot = reward?.after
  const visibleProfileCount = snapshot?.visibleProfileCount ?? totalAtSchool

  return (
    <div className="mt-6 w-full border border-schoollove-border bg-schoollove-surface-subtle px-5 py-5 text-center">
      {headlineText && <p className="font-retro text-lg font-normal text-schoollove-text">{headlineText}</p>}
      <p className="mt-1 text-sm text-schoollove-secondary">{copy.description}</p>

      {(visibleProfileCount != null || snapshot) && (
        <dl className="mt-4 grid grid-cols-3 divide-x divide-schoollove-border border-y border-schoollove-border py-3">
          <div className="px-2">
            <dt className="text-xs text-schoollove-text">현재 등록</dt>
            <dd className="mt-1 text-base text-schoollove-text">{visibleProfileCount}명</dd>
          </div>
          <div className="px-2">
            <dt className="text-xs text-schoollove-text">현재 레벨</dt>
            <dd className="mt-1 text-base text-schoollove-text">LV.{snapshot?.effectiveLevel ?? '-'}</dd>
          </div>
          <div className="px-2">
            <dt className="text-xs text-schoollove-text">다음 성장</dt>
            <dd className="mt-1 text-base text-schoollove-text">
              {snapshot ? `${snapshot.remainingToNext}명` : '-'}
            </dd>
          </div>
        </dl>
      )}

      {(snapshot || copy.progressBar) && (
        <div className="mt-3 space-y-1.5">
          <div
            className="h-2 w-full overflow-hidden bg-schoollove-progress-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={snapshot?.progressPercent ?? copy.progressBar?.percent ?? 0}
            aria-label="학교 성장 진행률"
          >
            <div
              className="h-full bg-schoollove-electric-blue transition-[width]"
              style={{ width: `${snapshot?.progressPercent ?? copy.progressBar?.percent ?? 0}%` }}
            />
          </div>
          <p className="font-retro text-xs text-schoollove-text">
            {snapshot
              ? `다음 성장까지 ${snapshot.remainingToNext}명`
              : copy.progressBar?.remainingLabel}
          </p>
        </div>
      )}
    </div>
  )
}
