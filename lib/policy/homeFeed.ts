import { truncate } from '@/lib/utils'
import { classifySchoolState } from '@/lib/policy/schoolGrowth'
import { calculatePeopleGrowthStage, formatPeopleGrowthRemainingLabel } from '@/lib/policy/schoolHubGrowthView'
import type { GrowthRankingRow } from '@/types/ranking'
import type {
  HomeActivityItem,
  RecentRegisterActivity,
  RecentTraceActivity,
  WeeklyRankingViewRow,
} from '@/types/homeFeed'

// docs/decisions/2026-07-17-home-growth-feed-v2.md — Home Growth Feed v2(Phase 3A) 순수 로직.
// DB/Supabase에 접근하지 않는다. lib/api 레이어가 조회한 원시 행을 받아 문구·정렬·병합만 한다.

// ─── 활동 문구 ────────────────────────────────────────────────
// 개인 이름/인스타 ID는 입력으로도 받지 않는다(호출자가 애초에 조회하지 않음).
export function formatRegisterActivityText(schoolName: string, graduationYear: number | null): string {
  if (graduationYear) return `누군가 ${schoolName} ${graduationYear}년 졸업에 이름을 남겼어요.`
  return `누군가 ${schoolName}에 이름을 남겼어요.`
}

// traces.message는 최대 40자 자유 텍스트라 그대로 노출하지 않고 더 짧게 잘라 표시한다.
const TRACE_MESSAGE_DISPLAY_LIMIT = 20

export function formatTraceActivityText(schoolName: string, message: string): string {
  return `누군가 ${schoolName}에 흔적을 남겼어요 · ${truncate(message, TRACE_MESSAGE_DISPLAY_LIMIT)}`
}

export function formatTodayGrowthStripText(schoolName: string, newVisibleProfiles: number): string {
  return `오늘 가장 빠르게 성장 중 · ${schoolName} +${newVisibleProfiles}명`
}

// ─── 상대 시간 ────────────────────────────────────────────────
const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

export function formatRelativeTime(createdAt: string, now: Date = new Date()): string {
  const diff = now.getTime() - new Date(createdAt).getTime()
  if (diff < MINUTE_MS) return '방금 전'
  if (diff < HOUR_MS) return `${Math.floor(diff / MINUTE_MS)}분 전`
  if (diff < DAY_MS) return `${Math.floor(diff / HOUR_MS)}시간 전`
  if (diff < 7 * DAY_MS) return `${Math.floor(diff / DAY_MS)}일 전`

  const d = new Date(createdAt)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

// ─── 활동 피드 병합 ────────────────────────────────────────────
// register/trace 두 원천을 하나의 피드로 합치고 created_at 내림차순으로 정렬한 뒤 limit만큼 자른다.
// school이 없는(join 실패) 행은 링크를 만들 수 없어 제외한다.
export function buildHomeActivityFeed(
  registerRows: RecentRegisterActivity[],
  traceRows: RecentTraceActivity[],
  limit: number
): HomeActivityItem[] {
  const registerItems: HomeActivityItem[] = registerRows
    .filter((row): row is RecentRegisterActivity & { school: NonNullable<RecentRegisterActivity['school']> } =>
      row.school !== null
    )
    .map((row) => ({
      id: `register:${row.id}`,
      type: 'register',
      createdAt: row.createdAt,
      text: formatRegisterActivityText(row.school.schoolName, row.graduationYear),
      schoolName: row.school.schoolName,
      slug: row.school.slug,
      currentLevel: row.school.currentLevel,
    }))

  const traceItems: HomeActivityItem[] = traceRows
    .filter((row): row is RecentTraceActivity & { school: NonNullable<RecentTraceActivity['school']> } =>
      row.school !== null
    )
    .map((row) => ({
      id: `trace:${row.id}`,
      type: 'trace',
      createdAt: row.createdAt,
      text: formatTraceActivityText(row.school.schoolName, row.message),
      schoolName: row.school.schoolName,
      slug: row.school.slug,
      currentLevel: row.school.currentLevel,
    }))

  return [...registerItems, ...traceItems]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit)
}

// ─── 주간 순위 뷰 ─────────────────────────────────────────────
// GrowthRankingRow(신규 수/누적 인원/Level)에 School Hub의 사람 수 성장 helper 결과를 합친다.
// Level curve(remainingToNext/progressPercent)는 여기서도 재사용하지 않는다.
export function buildWeeklyRankingViewRow(row: GrowthRankingRow): WeeklyRankingViewRow {
  const schoolState = classifySchoolState(row.visibleProfileCount)
  const peopleGrowth = calculatePeopleGrowthStage(schoolState, row.visibleProfileCount)
  const remainingLabel = formatPeopleGrowthRemainingLabel(schoolState, peopleGrowth)

  return {
    rank: row.rank,
    schoolId: row.schoolId,
    schoolName: row.schoolName,
    slug: row.slug,
    newVisibleProfiles: row.newVisibleProfiles,
    visibleProfileCount: row.visibleProfileCount,
    currentLevel: row.currentLevel,
    remainingLabel,
    progressPercent: peopleGrowth.progressPercent,
    isNearGrowth: peopleGrowth.isNearGrowth,
    isComplete: peopleGrowth.isComplete,
  }
}

// ─── 피드 내 CTA 배치 ─────────────────────────────────────────
// "최근 활동을 최소 4개 이상 보여준 뒤 CTA를 배치한다"(첫 CTA) /
// "CTA 2는 활동이 충분히 있을 때만 후반에 배치한다"(두 번째 CTA, 첫 CTA 기준의 2배를 충분함의 기준으로 삼음).
export const FEED_CTA_FIRST_MIN_ITEMS = 4
export const FEED_CTA_SECOND_MIN_ITEMS = 8

export type FeedCtaVisibility = {
  showSearchCta: boolean
  showSubmitCta: boolean
}

export function getFeedCtaVisibility(itemCount: number): FeedCtaVisibility {
  return {
    showSearchCta: itemCount >= FEED_CTA_FIRST_MIN_ITEMS,
    showSubmitCta: itemCount >= FEED_CTA_SECOND_MIN_ITEMS,
  }
}
