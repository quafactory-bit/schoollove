import { truncate } from '@/lib/utils'
import { classifySchoolState } from '@/lib/policy/schoolGrowth'
import { calculatePeopleGrowthStage, formatPeopleGrowthRemainingLabel } from '@/lib/policy/schoolHubGrowthView'
import type { GrowthRankingRow } from '@/types/ranking'
import type {
  HomeActivityItem,
  CurrentRankingViewRow,
  RecentRegisterActivity,
  RecentTraceActivity,
  WeeklyRankingViewRow,
} from '@/types/homeFeed'

// docs/decisions/2026-07-17-home-growth-feed-v2.md — Home Growth Feed v2(Phase 3A) 순수 로직.
// DB/Supabase에 접근하지 않는다. lib/api 레이어가 조회한 원시 행을 받아 문구·정렬·병합만 한다.

// ─── 활동 문구 ────────────────────────────────────────────────
// 개인 이름/인스타 ID는 입력으로도 받지 않는다(호출자가 애초에 조회하지 않음).
// count는 같은 학교·졸업연도·날짜로 묶인 실제 등록 건수다(docs/decisions/2026-07-17-home-activity-grouping.md).
// count=1(기본값)이면 기존 단수 문구를 그대로 유지한다.
export function formatRegisterActivityText(
  schoolName: string,
  graduationYear: number | null,
  count = 1
): string {
  if (count > 1) {
    if (graduationYear) return `${schoolName} ${graduationYear}년 졸업에 이름 ${count}개가 새로 남겨졌어요.`
    return `${schoolName}에 이름 ${count}개가 새로 남겨졌어요.`
  }
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

// ─── 등록 활동 묶기 ────────────────────────────────────────────
// docs/decisions/2026-07-17-home-activity-grouping.md(Phase 4A) — 같은 학교(slug) + 같은 졸업연도
// + 같은 날짜(createdAt의 UTC 날짜 부분, "YYYY-MM-DD")의 등록만 하나의 활동으로 묶는다.
// slug는 schools.slug에 UNIQUE 제약이 있어 학교를 구분하는 키로 그대로 쓸 수 있다(별도 schoolId
// select 불필요). graduationYear/날짜가 하나라도 다르면 절대 합치지 않는다. 대표 시간은 묶음 안
// 가장 최신 createdAt이며, count는 묶음 안 실제 원본 등록 건수를 그대로 보존한다(가짜로 늘리거나
// 줄이지 않음).
type RegisterRowWithSchool = RecentRegisterActivity & { school: NonNullable<RecentRegisterActivity['school']> }

function registerActivityDateKey(createdAt: string): string {
  return createdAt.slice(0, 10)
}

function groupRegisterActivity(rows: RegisterRowWithSchool[]): HomeActivityItem[] {
  type Bucket = {
    slug: string
    schoolName: string
    currentLevel: number | null
    graduationYear: number | null
    dateKey: string
    latestCreatedAt: string
    count: number
  }

  const buckets = new Map<string, Bucket>()

  for (const row of rows) {
    const dateKey = registerActivityDateKey(row.createdAt)
    const key = `${row.school.slug}::${row.graduationYear ?? 'none'}::${dateKey}`
    const existing = buckets.get(key)
    if (existing) {
      existing.count += 1
      if (new Date(row.createdAt).getTime() > new Date(existing.latestCreatedAt).getTime()) {
        existing.latestCreatedAt = row.createdAt
      }
      continue
    }
    buckets.set(key, {
      slug: row.school.slug,
      schoolName: row.school.schoolName,
      currentLevel: row.school.currentLevel,
      graduationYear: row.graduationYear,
      dateKey,
      latestCreatedAt: row.createdAt,
      count: 1,
    })
  }

  return Array.from(buckets.entries()).map(([key, bucket]) => ({
    id: `register:${key}`,
    type: 'register',
    createdAt: bucket.latestCreatedAt,
    text: formatRegisterActivityText(bucket.schoolName, bucket.graduationYear, bucket.count),
    schoolName: bucket.schoolName,
    slug: bucket.slug,
    currentLevel: bucket.currentLevel,
    count: bucket.count,
  }))
}

// ─── 활동 피드 병합 ────────────────────────────────────────────
// register(같은 학교·졸업연도·날짜끼리 묶은 뒤)와 trace(묶지 않고 개별 유지) 두 원천을 하나의
// 피드로 합치고 created_at(등록 묶음은 대표 시간) 내림차순으로 정렬한 뒤 limit만큼 자른다.
// school이 없는(join 실패) 행은 링크를 만들 수 없어 제외한다.
export function buildHomeActivityFeed(
  registerRows: RecentRegisterActivity[],
  traceRows: RecentTraceActivity[],
  limit: number
): HomeActivityItem[] {
  const registerRowsWithSchool = registerRows.filter(
    (row): row is RegisterRowWithSchool => row.school !== null
  )
  const registerItems = groupRegisterActivity(registerRowsWithSchool)

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
      count: 1,
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

export function buildCurrentRankingViewRow(row: GrowthRankingRow): CurrentRankingViewRow {
  return buildWeeklyRankingViewRow(row)
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
