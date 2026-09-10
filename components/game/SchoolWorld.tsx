import Image from 'next/image'
import GameMotionControl from './GameMotionControl'
import SchoolMemoryGate from './SchoolMemoryGate'
import growingCampusAvif from '../../public/images/game/growing-campus-v2.avif'

// Next emits a content-hashed immutable URL. Vite's local fixture emits a URL string.
const growingCampusAvifSrc = typeof growingCampusAvif === 'string' ? growingCampusAvif : growingCampusAvif.src

export const SCHOOL_WORLD_STAGES = [
  { id: 'MEMORY_SEED', label: '추억이 싹트는 학교', asset: 'memory-seed' },
  { id: 'FIRST_REUNION', label: '다시 모이는 학교', asset: 'first-reunion-v1' },
  { id: 'GROWING_CAMPUS', label: '함께 자라는 교정', asset: 'growing-campus' },
  { id: 'LIVELY_SCHOOL', label: '활기로 물드는 학교', asset: 'lively-school-v1' },
  // Same accepted raster plus an independent structural layer; no failed image input.
  { id: 'BRIGHT_MEMORY', label: '빛나는 우리 학교', asset: 'lively-school-v1' },
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
  // The measured Home LCP asset has a pre-encoded AVIF; other scenes stay responsive WebP.
  // A typed source preserves WebP fallback without changing the CDN/Next configuration.
  const avifHero = mode === 'hero' && stage.asset === 'growing-campus'
  const campusImage = <Image className="sl-world-image" src={`/images/game/${stage.asset}.webp`} alt="" width={1000} height={667} quality={60} sizes={imageSizes ?? SCHOOL_WORLD_SIZES[mode]} priority={priority && !avifHero} loading={priority && avifHero ? 'eager' : undefined} fetchPriority={priority ? 'high' : undefined} />
  const picture = <div className="sl-world-canvas" aria-hidden="true">
    {avifHero && priority ? <link rel="preload" as="image" type="image/avif" href={growingCampusAvifSrc} fetchPriority="high" /> : null}
    <div className="sl-world-aura" />
    <span className="sl-world-orbit sl-world-orbit--one">✦</span>
    <span className="sl-world-orbit sl-world-orbit--two">✧</span>
    <span className="sl-world-orbit sl-world-orbit--three">✦</span>
    {stage.id === 'BRIGHT_MEMORY' ? <div className="sl-world-structure">{campusImage}<SchoolMemoryGate /></div>
      : avifHero ? <picture><source srcSet={growingCampusAvifSrc} type="image/avif" />{campusImage}</picture> : campusImage}
    {mode !== 'compact' ? <Image className="sl-world-friends" src="/images/game/school-friends-v1.webp" alt="" width={480} height={400} sizes="(max-width: 767px) 24vw, 173px" fetchPriority="low" /> : null}
  </div>
  if (mode === 'compact') return <div className={className} data-world-stage={stageId}>{picture}</div>
  return <GameMotionControl className={className} stage={stageId}>{picture}</GameMotionControl>
}
