'use client'

import { useEffect } from 'react'

export default function PromotionImpression({ placementId }: { placementId: string }) {
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/promotions/impression', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ placement_id: placementId }), signal: controller.signal,
    }).catch(() => undefined)
    return () => controller.abort()
  }, [placementId])
  return null
}
