import Image from 'next/image'
import GameMotionControl from './GameMotionControl'

export const SCHOOL_WORLD_STAGES = [
  { id: 'MEMORY_SEED', label: '추억이 싹트는 학교', asset: 'school1' },
  { id: 'FIRST_REUNION', label: '다시 모이는 학교', asset: 'school2' },
  { id: 'GROWING_CAMPUS', label: '함께 레벨을 올리는 학교', asset: 'school3' },
  { id: 'LIVELY_SCHOOL', label: '활기로 물드는 학교', asset: 'school4' },

  { id: 'BRIGHT_MEMORY', label: '빛나는 우리 학교', asset: 'school5' },
] as const

/** Presentation only. Never use a visual stage as a feature-access predicate. */
export function getSchoolWorldStage(level: number) {
  const safe = Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1
  return SCHOOL_WORLD_STAGES[safe >= 10 ? 4 : safe >= 7 ? 3 : safe >= 4 ? 2 : safe >= 2 ? 1 : 0]
}

export const SCHOOL_WORLD_SIZES = {
  hero: '(max-width: 767px) 100vw, (max-width: 1199px) 55vw, 720px',
  compact: '76px',
  dashboard: '(max-width: 767px) calc(100vw - 80px), 480px',
  share: '350px',
} as const

type Props = { level?: number; mode?: keyof typeof SCHOOL_WORLD_SIZES; priority?: boolean; imageSizes?: string }

export default function SchoolWorld({ level, mode = 'hero', priority = false, imageSizes }: Props) {
  // Undefined means symbolic illustration: it must not imply a school's actual level.
  const stage = level === undefined ? SCHOOL_WORLD_STAGES[2] : getSchoolWorldStage(level)
  const className = `sl-world sl-world--${mode} sl-world--${stage.id.toLowerCase()}`
  const stageId = level === undefined ? 'decorative' : stage.id
  const picture = <div className="sl-world-canvas sl-world-canvas--scene" aria-hidden="true"><Image className="sl-world-image" src={`/images/fantasy-v3/${stage.asset}.webp`} alt="" width={1000} height={667} sizes={imageSizes ?? SCHOOL_WORLD_SIZES[mode]} priority={priority} /></div>
  if (mode === 'compact') return <div className={className} data-world-stage={stageId}>{picture}</div>
  return <GameMotionControl className={className} stage={stageId}>{picture}</GameMotionControl>
}
