'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'

const ConnectionNotificationUnreadContext = createContext<number | null>(null)

function shouldLoadConnectionNotificationSummary(pathname: string) {
  return pathname === '/account'
    || pathname.startsWith('/account/')
    || pathname === '/people'
    || pathname.startsWith('/people/')
    || pathname === '/connections'
    || pathname.startsWith('/connections/')
    || pathname === '/notifications'
    || pathname.startsWith('/notifications/')
}

export function ConnectionNotificationProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [unreadCount, setUnreadCount] = useState<number | null>(null)
  const shouldLoad = shouldLoadConnectionNotificationSummary(pathname)

  useEffect(() => {
    if (!shouldLoad) {
      setUnreadCount(null)
      return
    }

    let active = true
    const loadUnreadCount = () => {
      void (async () => {
        try {
          const response = await fetch('/api/connections/notifications/summary', { cache: 'no-store' })
          if (!response.ok) {
            if (active) setUnreadCount(null)
            return
          }
          const payload = await response.json() as { unreadCount?: unknown }
          if (!active) return
          setUnreadCount(typeof payload.unreadCount === 'number' && Number.isInteger(payload.unreadCount) && payload.unreadCount > 0 ? payload.unreadCount : null)
        } catch {
          if (active) setUnreadCount(null)
        }
      })()
    }

    loadUnreadCount()
    window.addEventListener('connection-notifications-changed', loadUnreadCount)
    return () => {
      active = false
      window.removeEventListener('connection-notifications-changed', loadUnreadCount)
    }
  }, [pathname, shouldLoad])

  return <ConnectionNotificationUnreadContext.Provider value={unreadCount}>{children}</ConnectionNotificationUnreadContext.Provider>
}

export function useConnectionNotificationUnreadCount() {
  return useContext(ConnectionNotificationUnreadContext)
}
