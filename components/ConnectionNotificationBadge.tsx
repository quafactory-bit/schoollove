'use client'

import { useConnectionNotificationUnreadCount } from '@/components/ConnectionNotificationProvider'

export default function ConnectionNotificationBadge({ className = '' }: { className?: string }) {
  const unreadCount = useConnectionNotificationUnreadCount()
  if (!unreadCount) return null

  const label = unreadCount > 9 ? '9+' : String(unreadCount)
  return <span aria-label={`읽지 않은 연결 알림 ${label}개`} className={`inline-flex min-w-4 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white ${className}`}>{label}</span>
}
