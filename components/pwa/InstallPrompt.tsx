'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

const PAGE_VIEW_KEY = 'schoollove:pwa-page-views'
const DISMISSED_AT_KEY = 'schoollove:pwa-dismissed-at'
const DISMISS_DURATION_MS = 14 * 24 * 60 * 60 * 1000

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as NavigatorWithStandalone).standalone === true
}

function isIosSafari() {
  const userAgent = navigator.userAgent
  const ios = /iPad|iPhone|iPod/.test(userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const safari = /Safari/.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(userAgent)
  return ios && safari
}

function isAndroidChrome() {
  const userAgent = navigator.userAgent
  return /Android/.test(userAgent) && /Chrome/.test(userAgent) && !/EdgA|OPR/.test(userAgent)
}

function readDismissedAt() {
  try {
    const value = Number(window.localStorage.getItem(DISMISSED_AT_KEY))
    return Number.isFinite(value) ? value : 0
  } catch {
    return null
  }
}

function writeDismissedAt() {
  try {
    window.localStorage.setItem(DISMISSED_AT_KEY, String(Date.now()))
    return true
  } catch {
    return false
  }
}

export default function InstallPrompt() {
  const pathname = usePathname()
  const [pageViews, setPageViews] = useState<number | null>(null)
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [iosGuide, setIosGuide] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (pathname.startsWith('/admin')) {
      setPageViews(null)
      return
    }

    try {
      const stored = Number(window.localStorage.getItem(PAGE_VIEW_KEY))
      const next = (Number.isFinite(stored) && stored > 0 ? stored : 0) + 1
      window.localStorage.setItem(PAGE_VIEW_KEY, String(next))
      setPageViews(next)
    } catch {
      setPageViews(null)
    }
  }, [pathname])

  useEffect(() => {
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault()
      if (isAndroidChrome()) setInstallEvent(event as BeforeInstallPromptEvent)
    }
    const handleInstalled = () => {
      setInstallEvent(null)
      setVisible(false)
    }

    window.addEventListener('beforeinstallprompt', handleInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  useEffect(() => {
    if (pathname.startsWith('/admin') || pageViews === null || pageViews < 2 || isStandalone()) {
      setVisible(false)
      return
    }

    const dismissedAt = readDismissedAt()
    if (dismissedAt === null || Date.now() - dismissedAt < DISMISS_DURATION_MS) {
      setVisible(false)
      return
    }

    const ios = isIosSafari()
    setIosGuide(ios)
    setVisible(ios || installEvent !== null)
  }, [installEvent, pageViews, pathname])

  if (!visible || pathname.startsWith('/admin')) return null

  const dismiss = () => {
    writeDismissedAt()
    setVisible(false)
  }

  const install = async () => {
    if (!installEvent) return
    await installEvent.prompt()
    await installEvent.userChoice
    writeDismissedAt()
    setInstallEvent(null)
    setVisible(false)
  }

  return (
    <aside
      aria-label="홈 화면 설치 안내"
      className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-md rounded-2xl border border-gray-200 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-lg lg:bottom-[calc(1rem+env(safe-area-inset-bottom))]"
    >
      <p className="text-sm font-semibold leading-6 text-gray-950">
        스쿨러브아이를 홈 화면에 추가하고 동창 소식을 바로 받아보세요
      </p>
      {iosGuide ? (
        <p className="mt-2 text-sm leading-6 text-gray-600">공유 버튼 → &apos;홈 화면에 추가&apos;를 눌러주세요</p>
      ) : null}
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={dismiss}
          className="min-h-11 rounded-xl border border-gray-300 px-4 text-sm font-semibold text-gray-700"
        >
          닫기
        </button>
        {!iosGuide ? (
          <button
            type="button"
            onClick={() => void install()}
            className="min-h-11 rounded-xl bg-[#0a0a0a] px-4 text-sm font-semibold text-white"
          >
            홈 화면에 추가
          </button>
        ) : null}
      </div>
    </aside>
  )
}
