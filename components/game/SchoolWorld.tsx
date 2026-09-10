import Image from 'next/image'

export const SCHOOL_WORLD_STAGES = [
  { id: 'MEMORY_SEED', label: '추억이 싹트는 학교', asset: 'memory-seed' },
  { id: 'FIRST_REUNION', label: '다시 모이는 학교', asset: 'memory-seed' },
  { id: 'GROWING_CAMPUS', label: '함께 자라는 교정', asset: 'growing-campus' },
  { id: 'LIVELY_SCHOOL', label: '활기로 물드는 학교', asset: 'growing-campus' },
  { id: 'BRIGHT_MEMORY', label: '빛나는 우리 학교', asset: 'growing-campus' },
] as const

/** Presentation only. Never use a visual stage as a feature-access predicate. */
export function getSchoolWorldStage(level: number) {
  const safe = Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1
  return SCHOOL_WORLD_STAGES[safe >= 10 ? 4 : safe >= 7 ? 3 : safe >= 4 ? 2 : safe >= 2 ? 1 : 0]
}

type Props = { level?: number; mode?: 'hero' | 'compact' | 'dashboard' | 'share'; priority?: boolean }

export default function SchoolWorld({ level, mode = 'hero', priority = false }: Props) {
  // Undefined means symbolic illustration: it must not imply a school's actual level.
  const stage = level === undefined ? SCHOOL_WORLD_STAGES[2] : getSchoolWorldStage(level)
  return <div className={`sl-world sl-world--${mode} sl-world--${stage.id.toLowerCase()}`} data-world-stage={level === undefined ? 'decorative' : stage.id} aria-hidden="true">
    <div className="sl-world-aura" />
    <span className="sl-world-orbit sl-world-orbit--one">✦</span>
    <span className="sl-world-orbit sl-world-orbit--two">✧</span>
    <span className="sl-world-orbit sl-world-orbit--three">✦</span>
    <Image className="sl-world-image" src={`/images/game/${stage.asset}.webp`} alt="" width={1536} height={1024} sizes={mode === 'compact' ? '80px' : '(max-width: 767px) 100vw, 720px'} priority={priority} />
  </div>
}
