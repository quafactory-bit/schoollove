'use client'

import { Analytics } from '@vercel/analytics/next'
import { useEffect } from 'react'
import { analyticsUrl, captureFirstTouch } from '@/lib/signupAttribution'

export default function PrivacySafeAnalytics() {
  useEffect(() => {
    try { captureFirstTouch(window.localStorage, window.location.href, document.referrer) } catch { /* Optional statistics. */ }
  }, [])
  return <Analytics beforeSend={event => {
    // Referral proofs and auth fragments must never enter analytics, even before hydration cleanup.
    const url = analyticsUrl(event.url)
    return url ? { ...event, url } : null
  }} />
}
