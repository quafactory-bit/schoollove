import { supabase, supabaseServer } from '@/lib/supabase'
import type { School } from '@/types/school'
import type { SchoolGrowthSnapshot } from '@/types/schoolGrowth'
import type { GrowthRankingInput, GrowthRankingRow } from '@/types/ranking'
import { calculateSchoolGrowthSnapshot } from '@/lib/policy/schoolGrowth'
import { calculateLevelState } from '@/lib/policy/levelPolicy'
import { getRecentWeekStart, getSeoulTodayStartUtc } from '@/lib/policy/growthPeriod'
import { topGrowthRanking } from '@/lib/policy/schoolRanking'
import { getSchoolProfileCount } from '@/lib/api/profiles'

// ─── 학교 검색 (자동완성) ─────────────────────────────────────────
export async function searchSchools(query: string, limit = 10): Promise<School[]> {
  if (!query || query.trim().length < 1) return []

  const { data, error } = await supabase
    .from('schools')
    .select('*')
    .ilike('school_name', `%${query.trim()}%`)
    .order('school_name')
    .limit(limit)

  if (error) {
    console.error('searchSchools error:', error)
    return []
  }
  return data || []
}

// ─── slug로 학교 단건 조회 (SSR) ──────────────────────────────────
export async function getSchoolBySlug(slug: string): Promise<School | null> {
  const { data, error } = await supabaseServer
    .from('schools')
    .select('*')
    .eq('slug', slug)
    .single()

  if (error) {
    console.error('getSchoolBySlug error:', error)
    return null
  }
  return data
}

// ─── 인기 학교 (프로필 수 기준) ───────────────────────────────────
export async function getPopularSchools(limit = 8): Promise<School[]> {
  // profiles 테이블과 JOIN하여 count 기준 정렬
  const { data, error } = await supabase
    .from('schools')
    .select(`
      *,
      profile_count:profiles(count)
    `)
    .limit(limit)

  if (error) {
    console.error('getPopularSchools error:', error)
    // fallback: 최근 학교 반환
    const { data: fallback } = await supabase
      .from('schools')
      .select('*')
      .limit(limit)
    return fallback || []
  }

  // count 정렬
  const sorted = (data || [])
    .map((s: School & { profile_count: { count: number }[] }) => ({
      ...s,
      profile_count: s.profile_count?.[0]?.count || 0,
    }))
    .sort((a, b) => (b.profile_count as number) - (a.profile_count as number))

  return sorted
}

// ─── 전체 학교 slug 목록 (sitemap용) ──────────────────────────────
export async function getAllSchoolSlugs(): Promise<string[]> {
  const { data, error } = await supabaseServer
    .from('schools')
    .select('slug')

  if (error) return []
  return (data || []).map((s: { slug: string }) => s.slug)
}

// ─── 학교 ID로 단건 조회 ──────────────────────────────────────────
export async function getSchoolById(id: string): Promise<School | null> {
  const { data, error } = await supabase
    .from('schools')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return null
  return data
}

// ─── School Growth Snapshot 조회 (읽기 전용) ──────────────────────
// School Hub/Home Growth Feed가 공통으로 쓸 성장 스냅샷을 조회·계산한다.
// DB를 수정하지 않고 syncSchoolLevel도 호출하지 않는다 — current_level/level_updated_at을
// 있는 그대로 읽고, visible profile count(getSchoolProfileCount, is_hidden=false 재사용)와 함께
// calculateSchoolGrowthSnapshot()에 넘겨 계산만 수행한다.
export async function getSchoolGrowthSnapshot(schoolId: string): Promise<SchoolGrowthSnapshot | null> {
  const { data, error } = await supabaseServer
    .from('schools')
    .select('id, school_name, slug, current_level, level_updated_at')
    .eq('id', schoolId)
    .single()

  if (error || !data) {
    console.error('getSchoolGrowthSnapshot error:', error)
    return null
  }

  const visibleProfileCount = await getSchoolProfileCount(schoolId)

  return calculateSchoolGrowthSnapshot({
    schoolId: data.id,
    schoolName: data.school_name,
    slug: data.slug,
    visibleProfileCount,
    storedCurrentLevel: data.current_level,
    levelUpdatedAt: data.level_updated_at,
  })
}

// ─── 주간/오늘 성장 순위 (읽기 전용, RPC 기반) ─────────────────────
// supabase/migrations/20260715120000_school_growth_ranking_rpc.sql의
// school_growth_ranking_v1을 재사용한다 — 전체 profiles 다운로드나 학교별 N+1 count 없음.
const GROWTH_RANKING_RPC = 'school_growth_ranking_v1'
const WEEKLY_RANKING_LIMIT = 5
const TODAY_RANKING_LIMIT = 1

type RawGrowthRankingRow = {
  school_id: unknown
  school_name: unknown
  slug: unknown
  new_visible_profiles: unknown
  most_recent_registration_at: unknown
  current_level: unknown
  visible_profile_count: unknown
}

// count/bigint는 supabase-js를 거치며 문자열로 올 수 있어 안전하게 정수로 변환한다.
// 변환 불가능하거나 음수면 null(잘못된 값으로 조용히 왜곡하지 않는다).
function toSafeNonNegativeInt(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return null
  return Math.trunc(n)
}

function mapGrowthRankingRow(row: RawGrowthRankingRow): GrowthRankingInput | null {
  if (
    typeof row.school_id !== 'string' ||
    typeof row.school_name !== 'string' ||
    typeof row.slug !== 'string'
  ) {
    console.error(`${GROWTH_RANKING_RPC}: 필수 문자열 필드가 없는 행을 건너뜀`)
    return null
  }

  const newVisibleProfiles = toSafeNonNegativeInt(row.new_visible_profiles)
  const visibleProfileCount = toSafeNonNegativeInt(row.visible_profile_count)
  if (newVisibleProfiles === null || visibleProfileCount === null) {
    console.error(`${GROWTH_RANKING_RPC}: count 값을 안전한 정수로 변환할 수 없는 행을 건너뜀`, {
      schoolId: row.school_id,
    })
    return null
  }

  const currentLevel =
    row.current_level === null || row.current_level === undefined
      ? null
      : toSafeNonNegativeInt(row.current_level)

  const mostRecentRegistrationAt =
    typeof row.most_recent_registration_at === 'string' ? row.most_recent_registration_at : null

  // remainingToNext는 School Growth Snapshot과 동일하게 "전체 누적 공개 인원" 기준으로
  // 계산한다(기간 내 신규 수가 아님). Level 공식을 복제하지 않고 calculateLevelState를 재사용한다.
  const remainingToNext = calculateLevelState(visibleProfileCount).remainingToNext

  return {
    schoolId: row.school_id,
    schoolName: row.school_name,
    slug: row.slug,
    newVisibleProfiles,
    mostRecentRegistrationAt,
    currentLevel,
    remainingToNext,
  }
}

async function fetchGrowthRanking(since: Date, limit: number): Promise<GrowthRankingRow[]> {
  const { data, error } = await supabaseServer.rpc(GROWTH_RANKING_RPC, {
    p_since: since.toISOString(),
    p_limit: limit,
  })

  if (error) {
    // RPC 오류 시 원문 메시지만 남기고 전체 응답이나 비밀정보는 로그에 남기지 않는다.
    console.error(`${GROWTH_RANKING_RPC} error:`, error.message)
    return []
  }
  if (!Array.isArray(data)) {
    console.error(`${GROWTH_RANKING_RPC}: 예상하지 못한 응답 형식`)
    return []
  }

  const rows: GrowthRankingInput[] = []
  for (const raw of data as RawGrowthRankingRow[]) {
    const mapped = mapGrowthRankingRow(raw)
    if (mapped) rows.push(mapped)
  }

  // SQL이 이미 정렬·LIMIT을 보장하지만, rank 부여와 정렬 규칙 일관성을 위해
  // lib/policy/schoolRanking.ts의 순수 함수를 그대로 재사용한다(재정렬은 멱등적으로 동일 결과).
  return topGrowthRanking(rows, limit)
}

// "이번 주 학교 성장 순위" — 최근 7일 신규 공개 프로필 수 기준 TOP 5.
// 실제 대상이 없으면 빈 배열을 반환한다(가짜 학교로 채우지 않음). Home UI에는 아직 연결하지 않는다.
export async function getWeeklySchoolGrowthRanking(now: Date = new Date()): Promise<GrowthRankingRow[]> {
  const since = getRecentWeekStart(now)
  return fetchGrowthRanking(since, WEEKLY_RANKING_LIMIT)
}

// "오늘 가장 빠르게 성장한 학교" — Asia/Seoul 기준 오늘 00:00부터 현재까지 TOP 1.
// 실제 등록이 없으면 null을 반환한다(가짜 기본 학교를 반환하지 않음). Home UI에는 아직 연결하지 않는다.
export async function getTodayFastestGrowingSchool(now: Date = new Date()): Promise<GrowthRankingRow | null> {
  const since = getSeoulTodayStartUtc(now)
  const rows = await fetchGrowthRanking(since, TODAY_RANKING_LIMIT)
  return rows[0] ?? null
}
