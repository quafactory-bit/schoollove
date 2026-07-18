// app/submit/page.tsx의 등록 루프(사람별 POST /api/profiles 순차 호출)를 분리한 모듈.
// UI 테스트 인프라가 없어 배치(신규/중복/부분성공/전체실패) 동작을 검증하려면
// 이 루프를 컴포넌트에서 분리해야 한다. 동작은 기존 handleSubmit 루프와 동일하며
// 위치만 옮겼다 — fetch 호출 순서, 카운트 규칙, 에러 처리 모두 무수정.
import type {
  RegistrationGrowthOutcome,
  RegistrationGrowthReward,
  RegistrationGrowthSnapshot,
} from '@/types/registration'
import { classifyRegistrationGrowthOutcome } from '@/lib/policy/registrationGrowthReward'

export type PersonInput = {
  nickname: string
  instagram: string
  isSelf: boolean
  message: string
}

export type RegisterBase = {
  school_id: string
  graduation_year: number
  grade: number | null
  class_number: number | null
  department: string | null
  student_year: number | null
}

export type RegisterResult = {
  success: number
  dup: number
  fail: number
  growthReward?: RegistrationGrowthReward
}

export function normalizeInsta(raw: string): string {
  let s = raw.trim()
  if (!s) return ''
  s = s.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
  s = s.replace(/[/?].*$/, '')
  s = s.replace(/^@/, '')
  return s.trim()
}

// people을 순서대로 하나씩 POST /api/profiles로 등록한다.
// 학교당 신규 성공(success) 1건마다 route.ts 내부에서 syncSchoolLevel이 1회 호출되고,
// 중복(dup, 409)과 실패(fail)는 route.ts에서 Level Sync를 호출하지 않는다.
//
// PHASE 6A — 성공 응답의 optional growthReward를 읽어 배치 전체의 성장 보상을 집계한다.
// 서버는 사람 1명(요청 1건) 단위로만 growthReward를 반환하므로, 여러 명을 등록하는 배치의
// "before → after"는 첫 성공 응답의 before와 마지막 성공 응답의 after를 이어붙여 만든다.
// 최종 outcome은 첫/마지막 응답의 outcome을 그대로 쓰지 않고, 이어붙인 before/after를
// 기준으로 classifyRegistrationGrowthOutcome()을 다시 호출해 재계산한다(동일 정책 함수 재사용,
// 새 판정 규칙을 만들지 않음).
export async function registerPeople(
  people: PersonInput[],
  base: RegisterBase
): Promise<RegisterResult> {
  let success = 0
  let dup = 0
  let fail = 0
  let firstReward: RegistrationGrowthReward | undefined
  let lastReward: RegistrationGrowthReward | undefined

  for (const p of people) {
    const insta = normalizeInsta(p.instagram) || null
    try {
      const res = await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...base,
          nickname: p.nickname.trim(),
          instagram_id: insta,
          is_self: insta ? p.isSelf : false,
          message: p.message.trim() || null, // 이 친구에게 한마디
        }),
      })
      if (res.ok) {
        success++
        const reward = await readGrowthReward(res)
        if (reward) {
          if (!firstReward) firstReward = reward
          lastReward = reward
        }
      } else if (res.status === 409) dup++
      else fail++
    } catch {
      fail++
    }
  }

  return { success, dup, fail, growthReward: buildBatchGrowthReward(firstReward, lastReward) }
}

// 성공 응답 body를 안전하게 읽어 growthReward만 추린다. body가 비어 있거나 JSON이 아니거나,
// growthReward의 shape이 기대와 다르면 예외를 던지지 않고 undefined를 반환한다 — 서버 JSON을
// 타입 캐스팅만으로 신뢰하지 않고, 이미 success로 집계된 카운트에도 영향을 주지 않기 위함이다.
async function readGrowthReward(res: Response): Promise<RegistrationGrowthReward | undefined> {
  try {
    const json: unknown = await res.json()
    if (typeof json !== 'object' || json === null || !('growthReward' in json)) return undefined

    const reward = (json as { growthReward?: unknown }).growthReward
    return isRegistrationGrowthReward(reward) ? reward : undefined
  } catch {
    return undefined
  }
}

const VALID_OUTCOMES: readonly RegistrationGrowthOutcome[] = [
  'first_record',
  'level_up',
  'progress',
  'no_change',
]

function isFiniteInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value)
}

// calculateSchoolGrowthSnapshot()(lib/policy/schoolGrowth.ts)이 실제로 반환하는 값은 항상
// 정수(count/level/threshold는 정수, progressPercent는 Math.round 결과)이므로 정수 여부까지
// 확인한다 — 새 정책을 만드는 것이 아니라 기존 정책이 이미 보장하는 값의 shape만 확인하는 것.
function isRegistrationGrowthSnapshot(value: unknown): value is RegistrationGrowthSnapshot {
  if (typeof value !== 'object' || value === null) return false
  const s = value as Record<string, unknown>

  return (
    isFiniteInteger(s.visibleProfileCount) &&
    s.visibleProfileCount >= 0 &&
    isFiniteInteger(s.effectiveLevel) &&
    s.effectiveLevel >= 1 &&
    isFiniteInteger(s.nextLevel) &&
    s.nextLevel >= 1 &&
    isFiniteInteger(s.remainingToNext) &&
    s.remainingToNext >= 0 &&
    isFiniteInteger(s.progressPercent) &&
    s.progressPercent >= 0 &&
    s.progressPercent <= 100 &&
    typeof s.isNearLevelUp === 'boolean'
  )
}

function isRegistrationGrowthReward(value: unknown): value is RegistrationGrowthReward {
  if (typeof value !== 'object' || value === null) return false
  const r = value as Record<string, unknown>

  return (
    typeof r.schoolId === 'string' &&
    r.schoolId.length > 0 &&
    isRegistrationGrowthSnapshot(r.before) &&
    isRegistrationGrowthSnapshot(r.after) &&
    typeof r.outcome === 'string' &&
    (VALID_OUTCOMES as readonly string[]).includes(r.outcome)
  )
}

// 첫 성공 응답의 before + 마지막 성공 응답의 after로 배치 전체 growthReward를 조립한다.
// 둘 중 하나라도 없으면(모든 성공 응답에 growthReward가 없었던 경우 등) 배치 reward를 생략한다.
// 서로 다른 schoolId가 섞이면(정상 UI 경로로는 발생하지 않음) 안전하게 생략한다 —
// 이런 불일치가 등록 자체(success/dup/fail)를 실패시키지 않는다.
function buildBatchGrowthReward(
  first: RegistrationGrowthReward | undefined,
  last: RegistrationGrowthReward | undefined
): RegistrationGrowthReward | undefined {
  if (!first || !last) return undefined
  if (first.schoolId !== last.schoolId) return undefined

  return {
    schoolId: first.schoolId,
    before: first.before,
    after: last.after,
    outcome: classifyRegistrationGrowthOutcome(first.before, last.after),
  }
}
