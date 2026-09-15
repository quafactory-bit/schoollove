import Image from 'next/image'
import GameMotionControl from './GameMotionControl'

/** Decorative V3 artwork; motion never represents account or school activity. */
export default function FantasyHero() {
  return <GameMotionControl className="sl-fantasy-hero" stage="decorative">
    <div className="sl-fantasy-art" aria-hidden="true">
      <Image src="/images/fantasy-v3/hero.webp" alt="" fill sizes="100vw" priority />
      <span className="sl-fantasy-star sl-fantasy-star--one">✦</span>
      <span className="sl-fantasy-star sl-fantasy-star--two">✦</span>
      <span className="sl-fantasy-star sl-fantasy-star--three">✧</span>
    </div>
  </GameMotionControl>
}
