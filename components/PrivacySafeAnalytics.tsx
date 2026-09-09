'use client'

import { Analytics } from '@vercel/analytics/next'

export default function PrivacySafeAnalytics() {
  return <Analytics beforeSend={event => {
    // Referral proofs and auth fragments must never enter analytics, even before hydration cleanup.
    const url = new URL(event.url)
    url.hash = ''
    url.search = ''
    if (url.pathname.startsWith('/auth/') || url.pathname.startsWith('/api/growth/')) return null
    return { ...event, url: url.toString() }
  }} />
}
