// PHASE 7B — Year Hub(같은 졸업연도 사람 발견) 순수 정책 함수.
// docs/design-package-v1.0/06-people-discovery.md Part A 기준.
// DB에 접근하지 않는다. lib/api/profiles.ts가 조회한 원시 행을 받아 검색·집계·상태
// 판단만 한다. 화면 컴포넌트(app/school/[slug]/[year]/page.tsx, components/YearPeopleSearch.tsx)에
// 집계·정렬 로직을 직접 두지 않기 위해 분리했다.
import { classifySchoolState } from './schoolGrowth'
import { formatRelativeTime } from './homeFeed'

// 이 모듈이 실제로 쓰는 최소 필드만 요구한다 — 전체 Profile 타입에 결합하지 않아
// 테스트에서 최소 fixture만으로 검증할 수 있고, types/profile.ts의 Profile[]도
// 구조적으로 그대로 만족한다(추가 필드가 있어도 무방).
export type YearHubProfile = {
  id: string
  nickname: string
  grade: number | null
  class_number: number | null
  created_at: string
}

// ─── 이름 검색 ────────────────────────────────────────────────
// FROZEN 06-people-discovery.md A3: "검색 대상은 nickname. 부분 일치."
// Instagram ID는 A3/13-api.md 어디에도 Year Hub 검색 대상으로 명시되지 않아 포함하지
// 않는다(FROZEN이 명시한 범위만 구현 — 임의 확장하지 않음).
//
// 공백 제거 + 대소문자 무관 비교를 위해 query와 nickname 양쪽에 동일한 정규화를
// 적용한 뒤 부분 일치(includes)로 비교한다. 한글은 대소문자 개념이 없어 toLowerCase()가
// 그대로 통과하고(부작용 없음), 영문/숫자가 섞인 닉네임에서만 실제로 의미가 있다.
export function normalizeYearSearchQuery(raw: string): string {
  return raw.trim().replace(/\s+/g, '').toLowerCase()
}

export function filterProfilesByNickname<T extends YearHubProfile>(profiles: T[], rawQuery: string): T[] {
  const normalized = normalizeYearSearchQuery(rawQuery)
  if (!normalized) return profiles
  return profiles.filter((p) => normalizeYearSearchQuery(p.nickname).includes(normalized))
}

// ─── 반별 집계 ────────────────────────────────────────────────
export type ClassAggregate = {
  grade: number
  classNumber: number
  count: number
  mostRecentCreatedAt: string
}

// grade/class_number가 없는(대학교 등 학과/학번 체계) 프로필은 반 집계에서 제외한다 —
// 기존 getClassesBySchoolYear()도 동일하게 반 개념이 있는 학교만 대상으로 했다.
export function aggregateClassCounts<T extends YearHubProfile>(profiles: T[]): ClassAggregate[] {
  const map = new Map<string, ClassAggregate>()

  for (const p of profiles) {
    if (p.grade === null || p.class_number === null) continue
    const key = `${p.grade}-${p.class_number}`
    const existing = map.get(key)
    if (existing) {
      existing.count += 1
      if (new Date(p.created_at).getTime() > new Date(existing.mostRecentCreatedAt).getTime()) {
        existing.mostRecentCreatedAt = p.created_at
      }
    } else {
      map.set(key, {
        grade: p.grade,
        classNumber: p.class_number,
        count: 1,
        mostRecentCreatedAt: p.created_at,
      })
    }
  }

  // 표시 순서: 학년 오름차순 → 반 번호 오름차순(결정적 정렬, 등록 순서에 의존하지 않음).
  return Array.from(map.values()).sort((a, b) => a.grade - b.grade || a.classNumber - b.classNumber)
}

// 가장 활발한 반 — 동률 처리 우선순위: 인원 수 → 최근 등록 → 반 번호(학년 우선, 반 번호 차순).
export function pickMostActiveClass(classes: ClassAggregate[]): ClassAggregate | null {
  if (classes.length === 0) return null
  return [...classes].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count
    const recentDiff = new Date(b.mostRecentCreatedAt).getTime() - new Date(a.mostRecentCreatedAt).getTime()
    if (recentDiff !== 0) return recentDiff
    return a.grade - b.grade || a.classNumber - b.classNumber
  })[0]
}

// ─── 최근 등록 ────────────────────────────────────────────────
export function pickMostRecentRegistration<T extends YearHubProfile>(profiles: T[]): T | null {
  if (profiles.length === 0) return null
  return [...profiles].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )[0]
}

// ─── 기수 상태 ────────────────────────────────────────────────
export type YearState = 'empty' | 'growing' | 'active'

// FROZEN 06-people-discovery.md A5는 "빈 기수 / 성장 기수 / 활발 기수" 3단계를 요구하지만
// 정확한 인원 경계값은 명시하지 않는다. 새 임의 숫자를 만드는 대신, 이미 FROZEN
// 03-level-policy.md/05-school-hub.md에서 확정된 School State(A/B/C, lib/policy/schoolGrowth.ts
// ::classifySchoolState) 경계(0명 / 1~10명 / 11명 이상)를 그대로 재사용한다 — 같은 "사람 수
// 기준 성장 단계" 개념을 School 레벨에서 Year 레벨로 그대로 적용하는 것이므로 정책적으로도
// 일관적이다.
export function classifyYearState(visibleProfileCount: number): YearState {
  const schoolState = classifySchoolState(visibleProfileCount)
  if (schoolState === 'A') return 'empty'
  if (schoolState === 'B') return 'growing'
  return 'active'
}

export { formatRelativeTime }
