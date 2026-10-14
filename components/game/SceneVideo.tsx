'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'

export default function SceneVideo({ scene }: { scene: 'hero' | 'siege' }) {
  const video = useRef<HTMLVideoElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  const [enabled, setEnabled] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [paused, setPaused] = useState(false)
  const [visible, setVisible] = useState(false)
  const [reduced, setReduced] = useState(true)
  const siege = scene === 'siege'
  const poster = siege ? '/images/scenes/siege-poster-v1.jpg' : '/images/scenes/hero-v1.webp'

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(media.matches)
    update(); media.addEventListener('change', update)
    const observer = new IntersectionObserver(entries => setVisible(entries[0]?.isIntersecting ?? false), { threshold: 0.15 })
    if (frame.current) observer.observe(frame.current)
    return () => { observer.disconnect(); media.removeEventListener('change', update) }
  }, [])

  useEffect(() => {
    if (visible && !reduced && !paused && !failed) setEnabled(true)
    const player = video.current
    if (!player) return
    const sync = () => {
      if (visible && !document.hidden && !reduced && !paused && !failed) void player.play().catch(() => setPlaying(false))
      else player.pause()
    }
    sync(); document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [visible, reduced, paused, failed, enabled])

  return <div ref={frame} className={`sl-scene-video sl-scene-video--${scene}`}>
    <Image src={poster} alt="" fill sizes={siege ? '(max-width: 767px) 100vw, 280px' : '(max-width: 767px) 100vw, 650px'} priority={!siege} className="sl-scene-poster" />
    {enabled && !failed ? <video ref={video} className={ready ? 'is-ready' : ''} src={`/videos/scenes/${siege ? 'siege-loop' : 'hero-loop'}-v1.mp4`} poster={poster} muted loop playsInline preload="none" aria-hidden="true" onPlaying={() => { setReady(true); setPlaying(true) }} onPause={() => setPlaying(false)} onError={() => { setFailed(true); setPlaying(false) }} /> : null}
    {!failed && !reduced ? <button type="button" className="schoollove-focus sl-scene-toggle" aria-label={`${siege ? '학교 순위' : '친구 재회'} 영상 ${playing ? '멈추기' : '재생하기'}`} onClick={() => { if (playing) setPaused(true); else { setPaused(false); setEnabled(true); void video.current?.play().catch(() => setPlaying(false)) } }}>{playing ? 'Ⅱ 움직임 멈추기' : '▷ 영상 재생'}</button> : null}
  </div>
}
