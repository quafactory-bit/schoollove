'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Bell, ShieldCheck, Share, UserPlus } from 'lucide-react'
import { BrandIcon } from '@/components/BrandMark'
import { INSTALL_SCREEN_SHOWN_KEY, detectInstallPlatform, shouldShowInstallScreen, type InstallPlatform } from '@/lib/policy/installGuide'

type DeferredPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
type InstallWindow = Window & { __slInstallPrompt?: DeferredPrompt | null }
type StandaloneNavigator = Navigator & { standalone?: boolean }

const BENEFITS = [
  { icon: UserPlus, text: '같은 기수에 새 동문이 들어오면 알려드려요' },
  { icon: Bell, text: '인스타 요청이 오거나 상대가 수락하면 알려드려요' },
  { icon: ShieldCheck, text: '그 외 알림이나 광고는 보내지 않아요' },
]

export default function InstallScreen({ again = false }: { again?: boolean }) {
  const [platform, setPlatform] = useState<InstallPlatform | null>(null)
  const [prompt, setPrompt] = useState<DeferredPrompt | null>(null)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as StandaloneNavigator).standalone === true
    const detected = detectInstallPlatform({ userAgent: navigator.userAgent, platform: navigator.platform, maxTouchPoints: navigator.maxTouchPoints, standalone })
    let shown = false
    try {
      shown = window.localStorage.getItem(INSTALL_SCREEN_SHOWN_KEY) === '1'
      window.localStorage.setItem(INSTALL_SCREEN_SHOWN_KEY, '1')
    } catch { /* 로컬 기록은 선택 사항 */ }
    if (!shouldShowInstallScreen(detected, shown, again)) { window.location.replace('/account'); return }
    setPlatform(detected)
    const captured = (window as InstallWindow).__slInstallPrompt ?? null
    if (captured) setPrompt(captured)
    const onPrompt = (event: Event) => { event.preventDefault(); setPrompt(event as DeferredPrompt) }
    const onInstalled = () => window.location.replace('/account')
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [again])

  async function install() {
    if (!prompt) { setNotice('브라우저 메뉴(⋮)에서 "홈 화면에 추가"를 눌러 주세요.'); return }
    await prompt.prompt()
    const choice = await prompt.userChoice.catch(() => null)
    ;(window as InstallWindow).__slInstallPrompt = null
    setPrompt(null)
    if (choice?.outcome === 'accepted') window.location.replace('/account')
  }

  return <main className="mx-auto min-h-screen max-w-content bg-white px-4 pb-8 pt-3">
    <div className="flex h-12 items-center justify-between">
      <span className="text-[17px] font-extrabold text-sl-ink">등록 완료</span>
      <Link href="/account" className="schoollove-focus text-[13px] font-bold text-sl-ink3">나중에</Link>
    </div>
    <div className="rounded-[20px] bg-sl-bg2 px-4 pb-3 pt-4 text-center">
      <span className="inline-flex rounded-[18px] shadow-[0_10px_24px_rgba(15,123,95,0.3)]"><BrandIcon size={72} /></span>
      <p className="mt-2 text-[13px] font-extrabold text-sl-ink">출석부</p>
    </div>
    <h1 className="mt-5 break-keep text-[24px] font-black leading-[1.25] tracking-[-0.5px] text-sl-ink">홈 화면에 추가하면 같은 기수가 들어올 때 알려드려요</h1>
    <ul className="mt-3">
      {BENEFITS.map(({ icon: Icon, text }) => <li key={text} className="flex items-start gap-3 border-b border-sl-line py-3 text-[15px] font-semibold leading-[1.4] text-sl-ink last:border-b-0">
        <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-sl-brand-soft text-sl-brand"><Icon className="h-[18px] w-[18px]" aria-hidden="true" /></span>{text}
      </li>)}
    </ul>
    {platform === 'ios'
      ? <p className="mt-3 flex items-center gap-2 rounded-xl bg-sl-bg2 px-3 py-2.5 text-[12.5px] font-semibold leading-[1.5] text-sl-ink2"><Share className="h-4 w-4 shrink-0" aria-hidden="true" />사파리 아래 공유 버튼 → 홈 화면에 추가를 눌러 주세요</p>
      : <button type="button" onClick={() => void install()} className="btn-primary schoollove-focus mt-4 w-full">홈 화면에 추가</button>}
    {notice ? <p role="status" className="mt-2 text-center text-xs text-sl-ink2">{notice}</p> : null}
    <Link href="/account" className="schoollove-focus mt-3 block py-2 text-center text-sm font-bold text-sl-ink2 underline">나중에 하고 출석부 보기</Link>
  </main>
}
