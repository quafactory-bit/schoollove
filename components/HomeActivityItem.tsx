import Link from 'next/link'
import { formatRelativeTime } from '@/lib/policy/homeFeed'
import type { HomeActivityItem as HomeActivityItemType } from '@/types/homeFeed'

interface Props {
  item: HomeActivityItemType
  now: Date
}

// 최근 활동 한 줄 — 카드가 아니라 글에 가까운 형태. 얇은 구분선과 여백만 사용한다.
// 개인 이름/인스타 ID는 item.text 자체에 포함되지 않는다(lib/policy/homeFeed.ts가 보장).
export default function HomeActivityItem({ item, now }: Props) {
  return (
    <Link
      href={`/school/${item.slug}`}
      className="block border-b border-neutral-100 py-4 transition hover:bg-neutral-50"
    >
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12.5px] text-neutral-400">
        <span className="font-semibold text-neutral-600">{item.schoolName}</span>
        {item.currentLevel !== null && (
          <span className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10.5px] font-bold text-indigo-600">
            Lv.{item.currentLevel}
          </span>
        )}
        <span aria-hidden>·</span>
        <span>{formatRelativeTime(item.createdAt, now)}</span>
      </div>
      <p className="mt-1.5 text-[15px] leading-relaxed text-neutral-800">{item.text}</p>
    </Link>
  )
}
