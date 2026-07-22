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
    <main className="mx-auto w-full max-w-[1180px] overflow-x-clip px-5 pb-16 sm:px-6 lg:px-8">
      <header className="pt-7 lg:pt-12">
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

        <div className="mt-10 grid gap-7 lg:mt-14 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)] lg:items-end">
          <div>
            <p className="font-retro text-[12px] tracking-[0.14em] text-schoollove-electric-blue sm:text-[13px]">GROWTH ONLINE</p>
            <h1 className="mt-3 max-w-[780px] break-keep text-[36px] font-semibold leading-[1.22] tracking-[-0.02em] text-schoollove-text sm:text-[44px] lg:text-[56px]">
              <span>지금</span>, <span>학교들이</span>
              <br />
              <span>성장하고</span> 있어요.
            </h1>
          </div>
          <div className="border border-schoollove-border bg-schoollove-surface-subtle p-5 lg:p-6" aria-label="홈 성장 상태">
            <p className="font-retro text-[12px] tracking-[0.14em] text-schoollove-neon-mint">GROWTH STATUS</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div>
                <p className="font-retro text-[11px] tracking-[0.08em] text-schoollove-secondary">CURRENT RANK</p>
                <p className="mt-1 text-[12px] text-schoollove-secondary">순위에 오른 학교</p>
                <p className="mt-1 font-retro text-[24px] leading-none text-schoollove-text">{rankingRows.length}곳</p>
              </div>
              <div>
                <p className="font-retro text-[11px] tracking-[0.08em] text-schoollove-secondary">LIVE FEED</p>
                <p className="mt-1 text-[12px] text-schoollove-secondary">최근 성장 소식</p>
                <p className="mt-1 font-retro text-[24px] leading-none text-schoollove-text">{activityItems.length}건</p>
              </div>
            </div>
            <p className="mt-5 text-[13px] leading-5 text-schoollove-secondary">
              실제 공개 등록과 흔적만 모아 학교 성장 상태를 보여줘요.
            </p>
          </div>
        </div>
      </header>

      <CurrentSchoolRanking status={rankingResult.status} rows={rankingRows} />

      <section className="mt-12 border-t border-schoollove-border pt-7 lg:mt-16 lg:pt-9" aria-labelledby="live-feed-title">
        <p className="font-retro text-[12px] font-normal tracking-[0.14em] text-schoollove-neon-orange sm:text-[13px]">LIVE FEED</p>
        <h2 id="live-feed-title" className="mt-2 text-[24px] font-semibold tracking-[-0.01em] text-schoollove-text lg:text-[28px]">성장 소식</h2>
        <div className="mt-5">
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
