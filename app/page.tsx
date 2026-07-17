import Link from 'next/link'
import { Search } from 'lucide-react'
import { getTodayFastestGrowingSchool, getWeeklySchoolGrowthRankingWithStatus } from '@/lib/api/schools'
import { getRecentRegisterActivity, getRecentTraceActivity, HOME_ACTIVITY_FEED_LIMIT } from '@/lib/api/homeFeed'
import { buildHomeActivityFeed, buildWeeklyRankingViewRow, getFeedCtaVisibility } from '@/lib/policy/homeFeed'
import HomeActivityFeed from '@/components/HomeActivityFeed'
import WeeklyGrowthRanking from '@/components/WeeklyGrowthRanking'
import TodayGrowthStrip from '@/components/TodayGrowthStrip'
import HomeFeedCta from '@/components/HomeFeedCta'

// Home Growth Feed v2 (Phase 3A) — docs/decisions/2026-07-17-home-growth-feed-v2.md
// 홈은 검색 랜딩페이지가 아니라 실제 학교 활동이 이어지는 성장 피드다.

// Home Feed Freshness (Phase 4B) — docs/decisions/2026-07-17-home-feed-freshness.md
// 홈은 실제 활동 피드이므로 빌드 시점 데이터로 영구 고정되지 않는다. 60초 ISR로 짧은 주기 재검증을
// 보장하고, profile/trace 등록 성공 직후에는 각 API route(app/api/profiles/route.ts,
// app/api/traces/route.ts)가 revalidateHomeFeed()로 이 경로를 즉시 재검증한다.
export const revalidate = 60

// 첫 화면 구간(part1)에 보여줄 활동 수 — 순위 섹션 앞에 어느 정도 활동을 먼저 보여주기 위함.
const FEED_PART1_SIZE = 6
// 순위 섹션과 검색 CTA 사이(part2)에 보여줄 활동 수.
const FEED_PART2_SIZE = 4

export default async function HomePage() {
  const now = new Date()

  // 각 조회는 lib/api 레이어에서 이미 실패를 안전하게 처리한다(예외를 던지지 않음) —
  // 한 섹션의 실패가 다른 섹션까지 무너뜨리지 않는다.
  const [todayGrowth, weeklyRankingResult, registerActivity, traceActivity] = await Promise.all([
    getTodayFastestGrowingSchool(),
    getWeeklySchoolGrowthRankingWithStatus(),
    getRecentRegisterActivity(),
    getRecentTraceActivity(),
  ])

  const activityItems = buildHomeActivityFeed(registerActivity, traceActivity, HOME_ACTIVITY_FEED_LIMIT)
  const weeklyRows = weeklyRankingResult.status === 'ok' ? weeklyRankingResult.rows.map(buildWeeklyRankingViewRow) : []
  const ctaVisibility = getFeedCtaVisibility(activityItems.length)

  const feedPart1 = activityItems.slice(0, FEED_PART1_SIZE)
  const feedPart2 = activityItems.slice(FEED_PART1_SIZE, FEED_PART1_SIZE + FEED_PART2_SIZE)
  const feedPart3 = activityItems.slice(FEED_PART1_SIZE + FEED_PART2_SIZE)

  return (
    <main className="mx-auto w-full max-w-[720px] px-5 pb-10">
      {/* 상단 앱 헤더 — 큰 Hero 없이 로고 + 작은 검색 진입만 */}
      <div className="flex items-center pt-6">
        <Link href="/" className="text-[17px] font-black tracking-tight text-neutral-900">
          스쿨러브아이
        </Link>
      </div>

      <form method="get" action="/search" className="mt-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            name="q"
            type="text"
            placeholder="학교 이름을 검색하세요"
            className="w-full rounded-full border border-neutral-200 bg-white py-2.5 pl-10 pr-4 text-[14px] outline-none transition focus:border-neutral-900"
            autoComplete="off"
          />
        </div>
      </form>

      {/* 오늘 가장 빠르게 성장한 학교 — 실제 데이터가 있을 때만, 얇은 한 줄 */}
      {todayGrowth && (
        <div className="mt-5">
          <TodayGrowthStrip
            schoolName={todayGrowth.schoolName}
            slug={todayGrowth.slug}
            newVisibleProfiles={todayGrowth.newVisibleProfiles}
          />
        </div>
      )}

      {/* 최근 활동 피드 (1) */}
      <div className="mt-6">
        <HomeActivityFeed items={feedPart1} now={now} />
      </div>

      {/* 이번 주 학교 성장 순위 TOP 5 */}
      <WeeklyGrowthRanking status={weeklyRankingResult.status} rows={weeklyRows} />

      {/* 최근 활동 피드 (2) */}
      <div>
        <HomeActivityFeed items={feedPart2} now={now} />
      </div>

      {/* 피드 안의 학교 검색 CTA — 활동을 충분히 보여준 뒤에만 노출 */}
      {ctaVisibility.showSearchCta && (
        <HomeFeedCta title="우리 학교는 지금 얼마나 자랐을까?" buttonLabel="학교 찾아보기" href="/search" />
      )}

      {/* 최근 활동 피드 (3) — 추가 활동 */}
      <div>
        <HomeActivityFeed items={feedPart3} now={now} />
      </div>

      {/* 등록 CTA — 활동이 충분히 있을 때만 후반에 배치, 첫 CTA와 같은 문구를 반복하지 않음 */}
      {ctaVisibility.showSubmitCta && (
        <HomeFeedCta
          title="내 이름 하나가 학교의 다음 성장을 만듭니다."
          buttonLabel="내 이름 남기기"
          href="/submit"
        />
      )}

      {activityItems.length === 0 && (
        <p className="mt-10 text-center text-[14px] leading-relaxed text-neutral-400">
          아직 이 피드에 활동이 없어요.
          <br />
          첫 이름을 남기면 이 자리에 나타나요.
        </p>
      )}
    </main>
  )
}
