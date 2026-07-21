import Link from 'next/link'
import { Quote, UserPlus } from 'lucide-react'
import { formatRelativeTime } from '@/lib/policy/homeFeed'
import type { HomeActivityItem as HomeActivityItemType } from '@/types/homeFeed'

interface Props {
  item: HomeActivityItemType
  now: Date
}

function SemanticSentence({ item }: { item: HomeActivityItemType }) {
  const schoolIndex = item.text.indexOf(item.schoolName)
  if (schoolIndex < 0) return <>{item.text}</>

  const before = item.text.slice(0, schoolIndex)
  const after = item.text.slice(schoolIndex + item.schoolName.length)
  const divider = after.indexOf(' · ')
  const action = divider >= 0 ? after.slice(0, divider) : after
  const note = divider >= 0 ? after.slice(divider + 3) : null

  return (
    <>
      <span className={item.type === 'register' ? 'font-medium text-schoollove-system' : undefined}>{before}</span>
      <strong className="font-semibold text-schoollove-school">{item.schoolName}</strong>
      <span className="font-medium text-schoollove-growth">{action}</span>
      {note && <span className="text-schoollove-text"> · “{note}”</span>}
    </>
  )
}

export default function HomeActivityItem({ item, now }: Props) {
  const isRegister = item.type === 'register'
  const Icon = isRegister ? UserPlus : Quote
  const label = isRegister ? 'NEW REGISTRATION' : 'SCHOOL NOTE'

  return (
    <Link
      href={`/school/${item.slug}`}
      aria-label={`${label}, ${item.schoolName}, ${formatRelativeTime(item.createdAt, now)}`}
      className="schoollove-focus group grid min-h-11 grid-cols-[2.5rem_minmax(0,1fr)] gap-3 border-b border-schoollove-border py-5 last:border-b-0"
    >
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-full ${
          isRegister ? 'bg-schoollove-system-soft text-schoollove-system' : 'bg-schoollove-neutral-soft text-schoollove-secondary'
        }`}
        aria-hidden="true"
      >
        <Icon className="h-4 w-4" strokeWidth={1.7} />
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className={`font-status text-[10px] font-semibold tracking-[0.08em] ${isRegister ? 'text-schoollove-system' : 'text-schoollove-secondary'}`}>
            {label}
          </span>
          <time className="font-status text-[11px] text-schoollove-muted" dateTime={item.createdAt}>
            {formatRelativeTime(item.createdAt, now)}
          </time>
        </span>
        <span className="mt-2 block break-keep text-[15px] leading-6 text-schoollove-text group-hover:underline">
          <SemanticSentence item={item} />
        </span>
        <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-status text-[11px] text-schoollove-secondary">
          {item.currentLevel !== null && <span className="font-medium text-schoollove-level">LV.{String(item.currentLevel).padStart(2, '0')}</span>}
          {item.count > 1 && <span className="font-medium text-schoollove-number">등록 {item.count}명</span>}
        </span>
      </span>
    </Link>
  )
}
