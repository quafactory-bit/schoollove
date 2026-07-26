import type { RegistrationGrowthSnapshot } from '@/types/registration'

export function summarizeCreatedNames(names: string[], success: number): string {
  if (names.length === 0) return `등록된 ${success}명`
  const visible = names.slice(0, 5)
  const remainder = Math.max(success - visible.length, 0)
  return remainder > 0 ? `${visible.join(' · ')} 외 ${remainder}명` : visible.join(' · ')
}

export function formatNextLevelRemainingLabel(
  snapshot: Pick<RegistrationGrowthSnapshot, 'nextLevel' | 'remainingToNext'>
): string {
  return `LV.${snapshot.nextLevel}까지 ${snapshot.remainingToNext}명`
}
