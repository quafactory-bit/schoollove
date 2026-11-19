'use client'

import { useEffect } from 'react'
import { registerServiceWorkerSafely } from '@/lib/browserSafety'

// Crawlers and some WebViews expose `serviceWorker` as undefined or throw on register().
// registerServiceWorkerSafely never throws and skips crawlers.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    const register = () => { registerServiceWorkerSafely('/sw.js') }
    try {
      if (document.readyState === 'complete') {
        register()
        return
      }
      window.addEventListener('load', register, { once: true })
      return () => window.removeEventListener('load', register)
    } catch {
      return
    }
  }, [])

  return null
}
