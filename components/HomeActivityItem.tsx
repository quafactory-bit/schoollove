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
      <span className="text-schoollove-text">{before}</span>
      <strong className="font-semibold text-schoollove-school">{item.schoolName}</strong>
      <span className="font-medium text-schoollove-text">{action}</span>
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
      className="schoollove-focus group grid min-h-11 grid-cols-[2.75rem_minmax(0,1fr)] gap-4 border-b border-schoollove-border py-5 last:border-b-0 lg:grid-cols-[3.25rem_minmax(0,1fr)] lg:py-6"
    >
      <span
        className={`flex h-11 w-11 items-center justify-center rounded-full ${
          isRegister ? 'bg-schoollove-system-soft text-schoollove-neon-orange' : 'bg-schoollove-neutral-soft text-schoollove-electric-blue'
        }`}
        aria-hidden="true"
      >
        <Icon className="h-5 w-5" strokeWidth={1.7} />
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className={`font-retro text-[11px] font-normal tracking-[0.1em] lg:text-[12px] ${isRegister ? 'text-schoollove-neon-orange' : 'text-schoollove-electric-blue'}`}>
            {label}
          </span>
          <time className="font-retro text-[11px] text-schoollove-muted lg:text-[12px]" dateTime={item.createdAt}>
            {formatRelativeTime(item.createdAt, now)}
          </time>
        </span>
        <span className="mt-2 block break-keep text-[16px] leading-7 text-schoollove-text group-hover:underline lg:text-[17px]">
          <SemanticSentence item={item} />
        </span>
        <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-retro text-[12px] text-schoollove-secondary">
          {item.currentLevel !== null && <span className="font-normal text-schoollove-level">LV.{String(item.currentLevel).padStart(2, '0')}</span>}
          {item.count > 1 && <span className="font-normal text-schoollove-number">등록 {item.count}명</span>}
        </span>
      </span>
    </Link>
  )
}
