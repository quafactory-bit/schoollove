import Link from 'next/link'
import { getCurrentSchoolRankingWithStatus } from '@/lib/api/schools'
import { getRecentRegisterActivity, getRecentTraceActivity, HOME_ACTIVITY_FEED_LIMIT } from '@/lib/api/homeFeed'
import { buildCurrentRankingViewRow, buildHomeActivityFeed, getFeedCtaVisibility } from '@/lib/policy/homeFeed'
import CurrentSchoolRanking from '@/components/CurrentSchoolRanking'
import HomeActivityFeed from '@/components/HomeActivityFeed'
import HomeFeedCta from '@/components/HomeFeedCta'

export const revalidate = 60

export default async function HomePage() {
  const now = new Date()
  const [rankingResult, registerActivity, traceActivity] = await Promise.all([
    getCurrentSchoolRankingWithStatus(),
    getRecentRegisterActivity(),
    getRecentTraceActivity(),
  ])

  const activityItems = buildHomeActivityFeed(registerActivity, traceActivity, HOME_ACTIVITY_FEED_LIMIT)
  const rankingRows = rankingResult.status === 'ok' ? rankingResult.rows.map(buildCurrentRankingViewRow) : []
  const ctaVisibility = getFeedCtaVisibility(activityItems.length)

  return (
    <main className="mx-auto w-full max-w-[600px] overflow-x-clip px-5 pb-12 sm:px-6">
      <header className="pt-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link href="/" className="schoollove-focus inline-flex min-h-11 items-center text-[18px] font-semibold tracking-tight text-schoollove-text">
              스쿨러브아이
            </Link>
            <p className="mt-1 text-[13px] text-schoollove-secondary">학교와 사람을 다시 발견하는 곳</p>
          </div>
          <Link
            href="/search"
            className="schoollove-focus inline-flex min-h-11 items-center text-[13px] font-medium text-schoollove-secondary"
          >
            학교 찾기
          </Link>
        </div>

        <h1 className="mt-10 break-keep text-[32px] font-semibold leading-[1.32] tracking-[-0.035em] text-schoollove-text sm:text-[36px]">
          <span className="text-schoollove-system">지금</span>, <span className="text-schoollove-school">학교들이</span>
          <br />
          <span className="text-schoollove-growth">성장하고</span> 있어요.
        </h1>
      </header>

      <CurrentSchoolRanking status={rankingResult.status} rows={rankingRows} />

      <section className="mt-10 border-t border-schoollove-border pt-6" aria-labelledby="live-feed-title">
        <p className="font-status text-[11px] font-medium tracking-[0.12em] text-schoollove-secondary">LIVE FEED</p>
        <h2 id="live-feed-title" className="mt-2 text-[20px] font-semibold tracking-tight text-schoollove-text">성장 소식</h2>
        <div className="mt-3">
          <HomeActivityFeed items={activityItems} now={now} />
        </div>
        {activityItems.length === 0 && (
          <div className="border-t border-schoollove-border py-8 text-center">
            <p className="text-[14px] font-medium text-schoollove-text">아직 새로운 소식이 없어요.</p>
            <p className="mt-1 text-[13px] text-schoollove-secondary">학교를 찾아 첫 흔적을 남겨보세요.</p>
          </div>
        )}
      </section>

      {ctaVisibility.showSearchCta && (
        <HomeFeedCta title="우리 학교는 지금 얼마나 이어지고 있을까요?" buttonLabel="학교 찾아보기" href="/search" />
      )}
      {ctaVisibility.showSubmitCta && (
        <HomeFeedCta title="내 이름 하나가 학교의 다음 성장을 만듭니다." buttonLabel="내 이름 남기기" href="/submit" />
      )}
    </main>
  )
}
