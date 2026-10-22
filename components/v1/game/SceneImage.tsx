import Image from 'next/image'

export type SceneName = 'hero' | 'search' | 'login' | 'share' | 'badge' | 'signup' | 'connections'

export default function SceneImage({ scene, className = '', priority = false, sizes = '(max-width: 767px) 100vw, 640px' }: { scene: SceneName; className?: string; priority?: boolean; sizes?: string }) {
  return <div className={`sl-scene sl-scene--${scene} ${className}`} aria-hidden="true"><Image src={`/images/fantasy-v3/${scene}.webp`} alt="" width={1536} height={1024} sizes={sizes} priority={priority} /></div>
}
