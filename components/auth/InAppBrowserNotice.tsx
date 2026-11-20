'use client'

import { useEffect, useState } from 'react'
import { androidChromeIntent, detectInAppBrowser, isAndroid, type InAppBrowser } from '@/lib/inAppBrowser'

const NAMES: Record<InAppBrowser, string> = { instagram: '인스타그램', threads: '스레드', facebook: '페이스북', kakaotalk: '카카오톡', naver: '네이버', line: '라인', webview: '앱' }

/** Part 2 P2b: shown only inside in-app browsers, where Google login is often blocked. */
export default function InAppBrowserNotice() {
  const [app, setApp] = useState<InAppBrowser | null>(null)
  const [intent, setIntent] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    try {
      const userAgent = navigator.userAgent
      const detected = detectInAppBrowser(userAgent)
      setApp(detected)
      if (detected && isAndroid(userAgent)) setIntent(androidChromeIntent(window.location.href))
    } catch { setApp(null) }
  }, [])
  if (!app) return null
  return <section role="note" aria-label="외부 브라우저 안내" className="mt-5 rounded-[14px] border border-[#d97706]/40 bg-[#fffbeb] px-4 py-3 text-[14px] leading-[1.6] text-sl-ink">
    <p className="font-extrabold">{NAMES[app]} 안에서는 Google 로그인이 막힐 수 있어요</p>
    <p className="mt-1 text-sl-ink2">오른쪽 위 <b>⋯</b> 메뉴에서 <b>&lsquo;외부 브라우저로 열기&rsquo;</b>(또는 &lsquo;Safari로 열기&rsquo;)를 누른 뒤 다시 로그인해 주세요.</p>
    <div className="mt-3 flex flex-wrap gap-2">
      {intent ? <a href={intent} className="schoollove-focus inline-flex min-h-11 items-center rounded-xl bg-schoollove-text px-4 text-sm font-bold text-white">Chrome으로 열기</a> : null}
      <button type="button" className="schoollove-focus min-h-11 rounded-xl border border-sl-ink3/40 px-4 text-sm font-bold" onClick={async () => {
        try { await navigator.clipboard.writeText(window.location.href); setCopied(true) } catch { setCopied(false) }
      }}>{copied ? '주소를 복사했어요' : '주소 복사'}</button>
    </div>
  </section>
}
