import HomeActivityItem from '@/components/HomeActivityItem'
import type { HomeActivityItem as HomeActivityItemType } from '@/types/homeFeed'

interface Props {
  items: HomeActivityItemType[]
  now: Date
}

export const HOME_ACTIVITY_INITIAL_VISIBLE_COUNT = 8

// 연속된 글 형태의 최근 활동 피드 조각. app/page.tsx가 전체 피드를 여러 구간으로 나눠
// (순위 섹션·CTA 사이에) 이 컴포넌트를 여러 번 렌더링한다.
export default function HomeActivityFeed({ items, now }: Props) {
  if (items.length === 0) return null

  const visibleItems = items.slice(0, HOME_ACTIVITY_INITIAL_VISIBLE_COUNT)
  const hiddenItems = items.slice(HOME_ACTIVITY_INITIAL_VISIBLE_COUNT)

  return (
    <div className="overflow-hidden border border-schoollove-border bg-schoollove-surface">
      {visibleItems.map((item) => (
        <HomeActivityItem key={item.id} item={item} now={now} />
      ))}
      {hiddenItems.length > 0 && (
        <details className="group border-t border-schoollove-border">
          <summary className="schoollove-focus flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 text-[14px] text-schoollove-text transition-colors hover:bg-schoollove-surface-subtle marker:hidden sm:px-5 lg:px-6">
            <span className="group-open:text-schoollove-electric-blue">성장 소식 더 보기</span>
            <span className="text-[12px] text-schoollove-electric-blue transition-transform group-open:rotate-45">
              +{hiddenItems.length}
            </span>
          </summary>
          <div>
            {hiddenItems.map((item) => (
              <HomeActivityItem key={item.id} item={item} now={now} />
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
