import type { LevelPolicy } from '@/types/level'

// ─── 레벨 곡선 (v1.0 임시 곡선) ────────────────────────────────────
// docs/design-package-v1.0/03-level-policy.md §3 기준
// threshold(L) = 레벨 L에 도달하기 위해 필요한 최소 누적 XP
// 이 값을 복제하지 말고 항상 이 모듈을 통해서만 계산한다.
// School Growth Snapshot(lib/policy/schoolGrowth.ts)이 저장 Level 기준 진행률을
// 계산할 때 재사용할 수 있도록 export한다 — 공식과 기존 calculateLevelState 동작은
// 전혀 변경하지 않는다(Phase 1A blocker 해소, Phase 1B).
export function threshold(level: number): number {
  if (level === 1) return 0
  return Math.round(50 * Math.pow(level, 1.5))
}

// threshold(level) <= xp < threshold(level + 1)을 만족하는 level을 찾는다.
// xp가 매우 큰 값이어도 O(log level)로 동작하도록 지수 확장 + 이분 탐색을 사용한다.
function findLevel(xp: number): number {
  if (xp <= 0) return 1

  let low = 1
  let high = 2
  while (threshold(high) <= xp) {
    high *= 2
  }

  while (low + 1 < high) {
    const mid = Math.floor((low + high) / 2)
    if (threshold(mid) <= xp) {
      low = mid
    } else {
      high = mid
    }
  }

  return low
}

export const calculateLevelState: LevelPolicy = (cumulativeXp) => {
  // 음수/NaN/Infinity 입력이 음수 레벨을 만들지 않도록 0으로 클램프한다.
  const safeXp = Number.isFinite(cumulativeXp) && cumulativeXp > 0 ? cumulativeXp : 0

  const level = findLevel(safeXp)
  const currentThreshold = threshold(level)
  const nextThreshold = threshold(level + 1)

  const xpIntoLevel = safeXp - currentThreshold
  const xpForNextLevel = nextThreshold - currentThreshold
  const remainingToNext = Math.max(1, Math.ceil(nextThreshold - safeXp))

  return {
    level,
    xpIntoLevel,
    xpForNextLevel,
    remainingToNext,
  }
}
