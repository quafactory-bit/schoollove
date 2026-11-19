// Part 2 P2b: in-app (WebView) browser detection for the Google login fallback.
// Google blocks OAuth and One Tap inside embedded WebViews, so these users get the
// normal Google button plus an "open in your browser" guide. Nothing is stored or sent.

export type InAppBrowser = 'instagram' | 'threads' | 'facebook' | 'kakaotalk' | 'naver' | 'line' | 'webview'

const RULES: ReadonlyArray<readonly [InAppBrowser, RegExp]> = [
  ['threads', /Barcelona/i],
  ['instagram', /Instagram/i],
  ['facebook', /FBAN|FBAV|FB_IAB|FBIOS/i],
  ['kakaotalk', /KAKAOTALK/i],
  ['naver', /NAVER\(inapp|NAVER\//i],
  ['line', /\bLine\//],
  ['webview', /; wv\)/],
]

export function detectInAppBrowser(userAgent: string | null | undefined): InAppBrowser | null {
  if (typeof userAgent !== 'string' || !userAgent) return null
  for (const [name, pattern] of RULES) if (pattern.test(userAgent)) return name
  return null
}

export function isAndroid(userAgent: string | null | undefined): boolean {
  return typeof userAgent === 'string' && /Android/i.test(userAgent)
}

/** Android only: an intent URL that asks the OS to open the same https page in Chrome. */
export function androidChromeIntent(href: string): string | null {
  try {
    const url = new URL(href)
    if (url.protocol !== 'https:') return null
    return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url.toString())};end`
  } catch { return null }
}
