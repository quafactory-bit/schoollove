// Level Sync Tool v0.1 Phase 5 — cumulativeXp 입력 검증과 미리보기 비교 라벨.
// Level 계산/저장 판단 로직은 여기 없다 — lib/policy/levelPolicy.ts(calculateLevelState),
// lib/policy/levelPersistence.ts(resolveLevelUpdate)를 그대로 재사용한다.

export type CumulativeXpValidation =
  | { value: number; error: null }
  | { value: null; error: string | null }

// docs/decisions/2026-07-10-level-sync-xp-safe-integer.md와 동일한 기준
// (0 이상의 safe integer)을 UI 입력 검증에도 적용한다.
export function validateCumulativeXp(raw: string): CumulativeXpValidation {
  const trimmed = raw.trim()
  if (trimmed === '') {
    return { value: null, error: null }
  }

  if (!/^\d+$/.test(trimmed)) {
    return { value: null, error: '0 이상의 정수만 입력할 수 있습니다.' }
  }

  const parsed = Number(trimmed)
  if (!Number.isSafeInteger(parsed)) {
    return { value: null, error: '입력값이 안전한 정수 범위를 벗어났습니다.' }
  }

  return { value: parsed, error: null }
}

export type LevelComparison = 'uninitialized' | 'increase' | 'same' | 'lower'

// resolveLevelUpdate의 persistence 판단을 재구현하지 않는다 — 이건 화면에 어떤 문구를
// 보여줄지 결정하기 위한 표시용 분류일 뿐이며, 실제 저장 여부/Level Up 여부는
// 항상 resolveLevelUpdate()의 반환값(shouldPersistLevel/levelIncreased)을 그대로 사용한다.
export function compareStoredAndCalculatedLevel(
  storedLevel: number | null,
  calculatedLevel: number
): LevelComparison {
  if (storedLevel === null) return 'uninitialized'
  if (calculatedLevel > storedLevel) return 'increase'
  if (calculatedLevel === storedLevel) return 'same'
  return 'lower'
}
