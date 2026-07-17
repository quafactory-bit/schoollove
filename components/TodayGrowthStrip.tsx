import Link from 'next/link'
import { formatTodayGrowthStripText } from '@/lib/policy/homeFeed'

interface Props {
  schoolName: string
  slug: string
  newVisibleProfiles: number
}

// 오늘 가장 빠르게 성장한 학교 — 얇은 한 줄 스트립. 실제 오늘 등록이 있을 때만 렌더링된다
// (0건이면 app/page.tsx가 아예 이 컴포넌트를 렌더링하지 않는다). 순위 상승/하락 화살표는 없다.
export default function TodayGrowthStrip({ schoolName, slug, newVisibleProfiles }: Props) {
  return (
    <Link
      href={`/school/${slug}`}
      className="flex items-center gap-1.5 rounded-full bg-indigo-50 px-4 py-2 text-[12.5px] font-semibold text-indigo-700 transition hover:bg-indigo-100"
    >
      <span aria-hidden>🔥</span>
      <span className="truncate">{formatTodayGrowthStripText(schoolName, newVisibleProfiles)}</span>
    </Link>
  )
}
