// PHASE 6B — 등록 완료 화면에서 growthRewardCopy.ts가 계산한 카피를 그대로 렌더링만 한다.
// 상태 분기는 여기서 하지 않는다(getGrowthRewardCopy가 이미 끝낸 계산 결과만 받는다).
import type { GrowthRewardCopy, GrowthRewardHeadline } from '@/app/submit/growthRewardCopy'

type Props = { copy: GrowthRewardCopy }

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

export default function RegistrationGrowthRewardCard({ copy }: Props) {
  const headlineText = renderHeadline(copy.headline)

  return (
    <div className="mt-6 w-full rounded-2xl border border-blue-100 bg-blue-50 px-5 py-5 text-center">
      {headlineText && <p className="text-lg font-extrabold text-blue-900">{headlineText}</p>}
      <p className="mt-1 text-sm text-blue-700">{copy.description}</p>

      {copy.progressBar && (
        <div className="mt-3 space-y-1.5">
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-gray-200"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={copy.progressBar.percent}
            aria-label="학교 성장 진행률"
          >
            <div
              className="h-full rounded-full bg-blue-400 transition-[width]"
              style={{ width: `${copy.progressBar.percent}%` }}
            />
          </div>
          <p className="text-xs text-blue-600">{copy.progressBar.remainingLabel}</p>
        </div>
      )}
    </div>
  )
}
