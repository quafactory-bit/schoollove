import { getSupabaseAdmin } from '@/lib/supabase'
import { calculateLevelState } from '@/lib/policy/levelPolicy'
import { resolveLevelUpdate } from '@/lib/policy/levelPersistence'
import type { SchoolLevelPersistenceRow } from '@/types/level'

const LEVEL_PROJECTION = 'id, current_level, level_updated_at'
const MAX_RETRIES = 5

// ─── Level 저장 I/O wrapper (FROZEN 03-level-policy.md §8) ────────
// cumulativeXp는 호출자가 전달한다. XP Source는 이 모듈이 결정하지 않는다.
// 저장 판단은 resolveLevelUpdate()가 소유하며, 이 함수는 그 결과를
// 동시성 안전하게 schools 테이블에 반영하는 I/O만 담당한다.
//
// 조건부 UPDATE가 경쟁으로 0건이 되면, 실패한 로컬 판단 결과를 그대로 반환하지 않고
// 현재 row를 다시 읽어 resolveLevelUpdate()로 재판단한 뒤 재시도한다 (bounded retry).
//
// 경쟁 시나리오 예시 (향후 테스트 대상):
//   초기 current_level = null
//   요청 A: target Lv5, 요청 B: target Lv1
//   B가 먼저 current_level IS NULL 조건으로 Lv1 초기화에 성공
//   -> A의 동일 조건 UPDATE는 0건 매치 (conflict)
//   -> A는 refetch(current_level=1)로 resolveLevelUpdate(1, Lv5 state) 재판단
//   -> levelIncreased=true 분기로 전환되어 current_level < 5 조건 UPDATE로 재시도
//   -> 최종 current_level = 5로 수렴한다 (Lv1에 머물지 않는다)
export async function syncSchoolLevel(
  schoolId: string,
  cumulativeXp: number
): Promise<SchoolLevelPersistenceRow | null> {
  const admin = getSupabaseAdmin()
  const newState = calculateLevelState(cumulativeXp) // Level 계산은 최초 1회만 수행한다.

  const { data: row, error: readError } = await admin
    .from('schools')
    .select(LEVEL_PROJECTION)
    .eq('id', schoolId)
    .single()

  if (readError || !row) {
    console.error('syncSchoolLevel read error:', readError)
    return null
  }

  let stored = row as SchoolLevelPersistenceRow

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const decision = resolveLevelUpdate(stored.current_level, newState)

    if (!decision.shouldPersistLevel) {
      return stored
    }

    const result = decision.levelIncreased
      ? await tryIncreaseUpdate(admin, schoolId, decision.level)
      : await tryInitUpdate(admin, schoolId, decision.level)

    if (result.status === 'error') {
      return null
    }

    if (result.status === 'applied') {
      return result.row
    }

    // result.status === 'conflict': 경쟁 요청이 먼저 반영됐다.
    // 최신 상태를 다시 읽어 다음 루프에서 resolveLevelUpdate()로 재판단한다.
    const refetched = await refetchRow(admin, schoolId)
    if (!refetched) return null
    stored = refetched
  }

  // bounded retry 소진 = 동기화 실패. 완료되지 않은 상태를 정상 row처럼 반환하지 않는다.
  console.error('syncSchoolLevel exhausted retries for', schoolId)
  return null
}

type UpdateOutcome =
  | { status: 'applied'; row: SchoolLevelPersistenceRow }
  | { status: 'conflict' }
  | { status: 'error' }

async function tryInitUpdate(
  admin: ReturnType<typeof getSupabaseAdmin>,
  schoolId: string,
  level: number
): Promise<UpdateOutcome> {
  const { data, error } = await admin
    .from('schools')
    .update({ current_level: level })
    .eq('id', schoolId)
    .is('current_level', null)
    .select(LEVEL_PROJECTION)

  if (error) {
    console.error('syncSchoolLevel init update error:', error)
    return { status: 'error' }
  }

  if (data && data.length > 0) {
    return {
      status: 'applied',
      row: data[0] as SchoolLevelPersistenceRow,
    }
  }

  return { status: 'conflict' }
}

async function tryIncreaseUpdate(
  admin: ReturnType<typeof getSupabaseAdmin>,
  schoolId: string,
  level: number
): Promise<UpdateOutcome> {
  const { data, error } = await admin
    .from('schools')
    .update({
      current_level: level,
      level_updated_at: new Date().toISOString(),
    })
    .eq('id', schoolId)
    .lt('current_level', level)
    .select(LEVEL_PROJECTION)

  if (error) {
    console.error('syncSchoolLevel increase update error:', error)
    return { status: 'error' }
  }

  if (data && data.length > 0) {
    return {
      status: 'applied',
      row: data[0] as SchoolLevelPersistenceRow,
    }
  }

  return { status: 'conflict' }
}

async function refetchRow(
  admin: ReturnType<typeof getSupabaseAdmin>,
  schoolId: string
): Promise<SchoolLevelPersistenceRow | null> {
  const { data, error } = await admin
    .from('schools')
    .select(LEVEL_PROJECTION)
    .eq('id', schoolId)
    .single()

  if (error || !data) {
    console.error('syncSchoolLevel refetch error:', error)
    return null
  }

  return data as SchoolLevelPersistenceRow
}

// ─── Level 저장 상태 읽기 전용 조회 (Level Sync Tool v0.1 Phase 1) ──
// current_level/level_updated_at을 저장하거나 판단하지 않고 있는 그대로 조회만 한다.
// row 없음과 조회 오류를 구분하지 않는 단순 계약을 유지한다 (null).
export async function getSchoolLevelSnapshot(
  schoolId: string
): Promise<SchoolLevelPersistenceRow | null> {
  const admin = getSupabaseAdmin()

  const { data, error } = await admin
    .from('schools')
    .select(LEVEL_PROJECTION)
    .eq('id', schoolId)
    .single()

  if (error || !data) {
    console.error('getSchoolLevelSnapshot error:', error)
    return null
  }

  return data as SchoolLevelPersistenceRow
}
