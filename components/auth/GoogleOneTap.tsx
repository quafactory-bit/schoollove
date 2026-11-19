'use client'

import { useEffect } from 'react'
import { detectInAppBrowser } from '@/lib/inAppBrowser'

type GoogleId = Readonly<{
  initialize(options: Record<string, unknown>): void
  prompt(): void
  cancel(): void
}>
declare global { interface Window { google?: { accounts?: { id?: GoogleId } } } }

const START = '/auth/social/start/google'

/**
 * Part 2 P2b: Google One Tap as an account-picker shortcut. The chosen account is
 * only a hint for the ordinary Google login; it never logs anyone in by itself.
 * Any failure (in-app browser, blocked third-party cookies, FedCM off, dismissed)
 * is silent: the normal "Google로 계속하기" button stays the way in.
 */
export default function GoogleOneTap({ clientId }: Readonly<{ clientId: string }>) {
  useEffect(() => {
    let userAgent = ''
    try { userAgent = navigator.userAgent } catch {}
    if (detectInAppBrowser(userAgent)) return
    let cancelled = false
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => {
      if (cancelled) return
      const id = window.google?.accounts?.id
      if (!id) return
      try {
        id.initialize({
          client_id: clientId,
          context: 'signin',
          auto_select: false,
          cancel_on_tap_outside: true,
          itp_support: true,
          use_fedcm_for_prompt: true,
          callback: async (response: { credential?: unknown }) => {
            // Success sets the hint cookie; failure simply means no hint. Either way the
            // person picked an account, so continue with the ordinary Google login.
            try { await fetch('/auth/social/one-tap/google', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ credential: response?.credential }) }) } catch {}
            window.location.assign(START)
          },
        })
        id.prompt()
      } catch {}
    }
    document.head.appendChild(script)
    return () => {
      cancelled = true
      try { window.google?.accounts?.id?.cancel() } catch {}
      script.remove()
    }
  }, [clientId])
  return null
}
