import HomeActivityItem from '@/components/HomeActivityItem'
import type { HomeActivityItem as HomeActivityItemType } from '@/types/homeFeed'

interface Props {
  items: HomeActivityItemType[]
  now: Date
}

// 연속된 글 형태의 최근 활동 피드 조각. app/page.tsx가 전체 피드를 여러 구간으로 나눠
// (순위 섹션·CTA 사이에) 이 컴포넌트를 여러 번 렌더링한다.
export default function HomeActivityFeed({ items, now }: Props) {
  if (items.length === 0) return null

  return (
    <div>
      {items.map((item) => (
        <HomeActivityItem key={item.id} item={item} now={now} />
      ))}
    </div>
  )
}
