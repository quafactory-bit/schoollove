import Link from 'next/link'
import { MapPin } from 'lucide-react'
import ShareButton from '@/components/ShareButton'
import {
  getSchoolStateContent,
  buildSchoolStateCtaHref,
  calculatePeopleGrowthStage,
  formatPeopleGrowthRemainingLabel,
  formatPeopleGrowthDescription,
} from '@/lib/policy/schoolHubGrowthView'
import { SCHOOL_TYPE_LABELS, type SchoolType } from '@/types/school'
import type { SchoolGrowthSnapshot } from '@/types/schoolGrowth'
import { formatNumber } from '@/lib/utils'

interface Props {
  schoolName: string
  schoolType: SchoolType
  sido: string
  sigungu: string
  slug: string
  snapshot: SchoolGrowthSnapshot
  // 기존 공유 문구/URL을 그대로 재사용한다(새 카피를 만들지 않음).
  shareText: string
  shareUrl: string
}

// School Hub 상단 — "우리 학교가 실제 사람들의 기여로 성장하는 공간"임을 보여주는 패널.
// docs/decisions/2026-07-16-school-hub-growth-ui.md 참고.
// snapshot은 항상 이미 계산된 값을 그대로 표시하기만 한다 — 여기서 Level을 재계산하거나
// syncSchoolLevel을 호출하지 않는다.
export default function SchoolGrowthPanel({
  schoolName,
  schoolType,
  sido,
  sigungu,
  slug,
  snapshot,
  shareText,
  shareUrl,
}: Props) {
  const content = getSchoolStateContent(snapshot.schoolState)
  const primaryHref = buildSchoolStateCtaHref(content.primaryCta.kind, slug)
  const secondaryHref = content.secondaryCta ? buildSchoolStateCtaHref(content.secondaryCta.kind, slug) : null

  // Phase 2B: 내부 Level(XP curve)과 공개 사람 수 성장 단계를 분리해서 계산한다.
  // description은 State A/C만 정적 카피를 쓰고, State B는 실제 remainingPeople 기반으로
  // 동적으로 만든다("조금만 더 모이면 다음 Level로 올라가요." 고정 문구 제거, 감사 결과 §6 참고).
  const peopleGrowth = calculatePeopleGrowthStage(snapshot.schoolState, snapshot.visibleProfileCount)
  const description =
    snapshot.schoolState === 'B' ? formatPeopleGrowthDescription(peopleGrowth.remainingPeople) : content.description
  const remainingLabel = formatPeopleGrowthRemainingLabel(snapshot.schoolState, peopleGrowth)

  return (
    <div className="card overflow-hidden">
      <div className="p-5 space-y-4">
        {/* A. 학교 정체성 — Level은 현재 상태를 나타내는 배지일 뿐, 아래 성장 진행 영역과는
            별도 트랙이다. */}
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-black text-schoollove-text">{schoolName}</h1>
            <span className="font-retro inline-flex items-center rounded-sm bg-schoollove-surface-subtle px-2.5 py-1 text-xs font-normal text-schoollove-text">
              Lv.{snapshot.effectiveLevel}
            </span>
            {snapshot.isNearLevelUp && (
              <span className="font-retro inline-flex items-center rounded-sm bg-schoollove-neon-lime px-2 py-0.5 text-[11px] font-normal text-schoollove-text">
                레벨업 임박
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-gray-500">
            <MapPin size={12} />
            <span>
              {sido} {sigungu}
            </span>
            <span className="text-gray-300">·</span>
            <span>{SCHOOL_TYPE_LABELS[schoolType]}</span>
            <span className="text-gray-300">·</span>
            <span>{formatNumber(snapshot.visibleProfileCount)}명 등록</span>
          </div>
        </div>

        {/* B. 성장 메시지 */}
        <div>
          <p className="font-bold text-schoollove-text">{content.title}</p>
          {description && <p className="mt-0.5 text-sm text-gray-500">{description}</p>}
        </div>

        {/* C. 사람 수 기반 학교 성장 진행 영역 — XP Level curve와 무관한 별도 계산(Phase 2B).
            Lv.N→Lv.N+1, XP progressPercent, XP remainingToNext는 여기서 표시하지 않는다. */}
        <div className="space-y-2 rounded-xl bg-gray-50 p-3.5">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="font-semibold text-schoollove-text">학교 성장</span>
            {peopleGrowth.isNearGrowth && (
              <span className="font-retro shrink-0 rounded-sm bg-schoollove-neon-mint px-2 py-0.5 text-[11px] font-normal text-schoollove-text">
                성장 임박
              </span>
            )}
          </div>

          <div
            className="h-2 w-full overflow-hidden rounded-full bg-gray-200"
            role="progressbar"
            aria-valuenow={peopleGrowth.progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`학교 성장 진행률 ${peopleGrowth.progressPercent}%`}
          >
            <div
              className="h-full rounded-full bg-schoollove-electric-blue transition-[width]"
              style={{ width: `${peopleGrowth.progressPercent}%` }}
            />
          </div>

          <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
            <span>{formatNumber(snapshot.visibleProfileCount)}명 등록</span>
            <span className="text-right">
              {peopleGrowth.isComplete ? '활발하게 이어지는 학교' : remainingLabel}
            </span>
          </div>
        </div>

        {/* D. 핵심 CTA */}
        <div className="flex flex-wrap gap-2">
          {primaryHref && (
            <Link href={primaryHref} className="btn-primary flex-1 text-center text-sm sm:flex-none">
              {content.primaryCta.label}
            </Link>
          )}
          {content.secondaryCta &&
            (content.secondaryCta.kind === 'share' ? (
              <ShareButton
                text={shareText}
                url={shareUrl}
                label={content.secondaryCta.label}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 transition-colors hover:border-brand-blue hover:text-brand-blue"
              />
            ) : (
              secondaryHref && (
                <Link
                  href={secondaryHref}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 transition-colors hover:border-brand-blue hover:text-brand-blue"
                >
                  {content.secondaryCta.label}
                </Link>
              )
            ))}
        </div>

        {content.helperText && <p className="text-xs text-gray-400">{content.helperText}</p>}
      </div>
    </div>
  )
}
