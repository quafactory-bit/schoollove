'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

type Props = { children: ReactNode; className: string; stage: string }

/** Local decoration state only: no storage, analytics, API, or growth feedback. */
export default function GameMotionControl({ children, className, stage }: Props) {
  const scene = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const [paused, setPaused] = useState(false)
  const [reduced, setReduced] = useState(false)
  const [visible, setVisible] = useState(false)
  const [documentVisible, setDocumentVisible] = useState(false)

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updatePreference = () => {
      setReduced(preference.matches)
      // Do not auto-restart after the OS switches back to no-preference.
      if (preference.matches) setPaused(true)
    }
    const updateVisibility = () => setDocumentVisible(!document.hidden)
    updatePreference()
    updateVisibility()
    preference.addEventListener('change', updatePreference)
    document.addEventListener('visibilitychange', updateVisibility)
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(
      entries => setVisible(entries.some(entry => entry.isIntersecting)),
      { threshold: 0 },
    )
    if (observer && scene.current) observer.observe(scene.current)
    else setVisible(true)
    setReady(true)
    return () => {
      preference.removeEventListener('change', updatePreference)
      document.removeEventListener('visibilitychange', updateVisibility)
      observer?.disconnect()
    }
  }, [])

  const running = ready && !paused && !reduced && visible && documentVisible
  return <div ref={scene} className={className} data-world-stage={stage} data-motion={running ? 'running' : 'paused'}>
    {children}
    <button type="button" className="sl-motion-toggle schoollove-focus"
      disabled={!ready || reduced} aria-pressed={paused || reduced}
      title={reduced ? '시스템의 움직임 줄이기 설정을 따르고 있어요.' : undefined}
      onClick={() => setPaused(value => !value)}>
      {paused || reduced ? '움직임 켜기' : '움직임 멈추기'}
    </button>
  </div>
}
