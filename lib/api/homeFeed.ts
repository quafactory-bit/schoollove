import { supabaseServer } from '@/lib/supabase'
import type { HomeActivitySchoolRef, RecentRegisterActivity, RecentTraceActivity } from '@/types/homeFeed'

// Home Growth Feed v2(Phase 3A) — 최근 공개 활동 조회 전용 I/O 레이어.
// docs/decisions/2026-07-17-home-growth-feed-v2.md 참고.
// nickname/instagram_id는 select 자체에 포함하지 않는다(개인 식별 필드를 애초에 조회하지 않음).
// 전체 테이블을 내려받지 않고 항상 limit으로 제한 조회하며, 학교 정보는 join으로 한 번에 가져와
// 학교별 추가 조회(N+1)를 만들지 않는다.
export const HOME_ACTIVITY_FETCH_LIMIT = 16

type RawSchoolRef = { school_name: unknown; slug: unknown; current_level: unknown } | null

function mapSchoolRef(raw: RawSchoolRef): HomeActivitySchoolRef | null {
  if (!raw || typeof raw.school_name !== 'string' || typeof raw.slug !== 'string') return null
  return {
    schoolName: raw.school_name,
    slug: raw.slug,
    currentLevel: typeof raw.current_level === 'number' ? raw.current_level : null,
  }
}

type RawRegisterRow = {
  id: unknown
  created_at: unknown
  graduation_year: unknown
  school: RawSchoolRef
}

// 최근 공개(is_hidden=false) 프로필 등록 활동. school은 join으로 한 번에 가져온다(N+1 없음).
export async function getRecentRegisterActivity(
  limit = HOME_ACTIVITY_FETCH_LIMIT
): Promise<RecentRegisterActivity[]> {
  const { data, error } = await supabaseServer
    .from('profiles')
    .select('id, created_at, graduation_year, school:schools(school_name, slug, current_level)')
    .eq('is_hidden', false)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('getRecentRegisterActivity error:', error.message)
    return []
  }

  const rows = (data as unknown as RawRegisterRow[]) ?? []
  const result: RecentRegisterActivity[] = []
  for (const row of rows) {
    if (typeof row.id !== 'string' || typeof row.created_at !== 'string') continue
    result.push({
      id: row.id,
      createdAt: row.created_at,
      graduationYear: typeof row.graduation_year === 'number' ? row.graduation_year : null,
      school: mapSchoolRef(row.school),
    })
  }
  return result
}

type RawTraceRow = {
  id: unknown
  created_at: unknown
  message: unknown
  school: RawSchoolRef
}

// 최근 공개(is_hidden=false) 흔적. School Hub(SchoolWarmth)가 이미 동일 필드(message,
// created_at, school_id, is_hidden)를 모든 방문자에게 그대로 노출하고 있어(기존 공개 기능),
// 같은 필드 그대로 Home 피드에 재사용한다 — 새로운 개인정보 노출을 만들지 않는다.
export async function getRecentTraceActivity(limit = HOME_ACTIVITY_FETCH_LIMIT): Promise<RecentTraceActivity[]> {
  const { data, error } = await supabaseServer
    .from('traces')
    .select('id, created_at, message, school:schools(school_name, slug, current_level)')
    .eq('is_hidden', false)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('getRecentTraceActivity error:', error.message)
    return []
  }

  const rows = (data as unknown as RawTraceRow[]) ?? []
  const result: RecentTraceActivity[] = []
  for (const row of rows) {
    if (typeof row.id !== 'string' || typeof row.created_at !== 'string' || typeof row.message !== 'string') continue
    result.push({
      id: row.id,
      createdAt: row.created_at,
      message: row.message,
      school: mapSchoolRef(row.school),
    })
  }
  return result
}
