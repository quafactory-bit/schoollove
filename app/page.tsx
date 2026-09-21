import Link from 'next/link'
import { ArrowUpRight, Crown, Search, ShieldCheck, Sparkles, Trophy } from 'lucide-react'
import FantasyHero from '@/components/game/FantasyHero'
import { getPublicAccountLaunchState, recordPublicAccountActivity } from '@/lib/publicAccountLaunch'
import { getSchoolGrowth, type SchoolGrowth } from '@/lib/schoolGrowthGame'
import MyGrowthSchools from '@/components/growth/MyGrowthSchools'
import { Suspense } from 'react'
import GrowthHowItWorks from '@/components/growth/GrowthHowItWorks'
import GameHeader from '@/components/game/GameHeader'
import SceneImage from '@/components/game/SceneImage'
import SceneVideo from '@/components/game/SceneVideo'

export const dynamic = 'force-dynamic'

function GuestSchoolPanel() {
  return <section className="sl-guest-card" aria-labelledby="guest-school-title">
    <h2 id="guest-school-title">우리 학교 레벨</h2>
    <div className="sl-guest-intro"><SceneImage scene="badge" className="sl-scene--tiny" sizes="(max-width: 767px) 100vw, 640px" /><p>학교를 찾으면<br />우리 학교의 레벨을 확인할 수 있어요.</p></div>
    <p>기억 속 학교를 찾아보고,<br />우리 학교의 다음 장을 시작해요.</p>
    <div className="sl-quick-actions"><Link className="schoollove-focus" href="/search"><Search size={18} aria-hidden="true" />학교 찾기</Link><Link className="schoollove-focus" href="#total-ranking"><Trophy size={18} aria-hidden="true" />총 학교 순위</Link></div>
  </section>
}

function TotalRanking({ status, schools }: { status: 'ok' | 'unavailable'; schools: SchoolGrowth[] }) {
  const podium = schools.slice(0, 3)
  const challengers = schools.slice(3, 5)
  return <section className="sl-total-ranking" aria-labelledby="total-ranking">
    <div className="sl-total-ranking-frame">
      <div className="sl-total-ranking-video"><SceneVideo scene="siege" /></div>
      <div className="sl-total-ranking-content">
        <h2 id="total-ranking">총 학교 순위</h2>
        <p className="sl-siege-eyebrow">ALL-TIME SCHOOL RANKING</p>
        <p className="sl-total-ranking-intro">함께 쌓은 경험치로, 우리 학교를 더 높이.</p>
        <div className="sl-total-ranking-meta"><span>처음부터 지금까지 · 공개된 누적 XP</span><span>TOP 5</span></div>
        {status === 'unavailable' ? <p role="status" className="sl-ranking-empty">학교 순위를 잠시 불러오지 못했어요. 학교 찾기는 계속 이용할 수 있어요.</p> : schools.length === 0 ? <div className="sl-ranking-empty"><Trophy size={32} aria-hidden="true" /><h3>아직 공개할 학교 순위가 없어요.</h3><p>내 학교의 최신 레벨과 XP는 내 계정에서 확인해요.</p><Link className="schoollove-focus sl-text-link" href="/search">우리 학교 찾기 <ArrowUpRight size={16} aria-hidden="true" /></Link></div> : <>
          <ol className="sl-total-podium">{podium.map(school => <li key={school.schoolId} className={`sl-total-place sl-total-place--${school.rank}`}><Link className="schoollove-focus" href={`/school/${encodeURIComponent(school.slug)}`} aria-label={`${school.rank}위 ${school.schoolName}, 누적 ${school.totalXp.toLocaleString('ko-KR')} XP`}><span className="sl-total-crown" aria-hidden="true"><Sparkles className="sl-total-sparkle sl-total-sparkle--left" /><Crown /><Sparkles className="sl-total-sparkle sl-total-sparkle--right" /></span><span className="sl-total-place-label">{school.rank === 1 ? '최고의 학교' : school.rank === 2 ? '빛나는 도전' : '당당한 도약'}</span><strong className="sl-total-place-number">{school.rank}</strong><span className="sl-total-school-name">{school.schoolName}</span><strong className="sl-total-xp">{school.totalXp.toLocaleString('ko-KR')} XP</strong><span className="sl-total-xp-label">누적 경험치</span></Link></li>)}</ol>
          {challengers.length > 0 && <ol className="sl-total-challengers" start={4}>{challengers.map(school => <li key={school.schoolId}><Link className="schoollove-focus" href={`/school/${encodeURIComponent(school.slug)}`} aria-label={`${school.rank}위 ${school.schoolName}, 누적 ${school.totalXp.toLocaleString('ko-KR')} XP`}><strong className="sl-total-challenger-number">{school.rank}</strong><span><strong>{school.schoolName}</strong><small>{school.rank === 4 ? '왕관까지 한 걸음 더!' : '다음 주인공은 우리 학교!'}</small></span><strong className="sl-total-challenger-xp">{school.totalXp.toLocaleString('ko-KR')} XP</strong></Link></li>)}</ol>}
          <p className="sl-total-ranking-note"><Sparkles size={15} aria-hidden="true" /> 공개된 누적 XP가 총 학교 순위에 반영돼요.</p>
        </>}
      </div>
    </div>
  </section>
}

export default async function HomePage() {
  const [launch, growth] = await Promise.all([getPublicAccountLaunchState(), getSchoolGrowth()])
  await recordPublicAccountActivity('public_home_view', 'direct')
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' })
  const today = day.format(new Date())
  const todaySchools = growth.schools.filter(school => school.lastLevelUp && day.format(new Date(school.lastLevelUp)) === today)
  return <main className="growth-journey sl-game sl-home">
    <div className="sl-home-stage">
      <GameHeader />
      <div className="sl-home-layout">
        <section className="sl-hero-main" aria-labelledby="growth-title">
          <div className="sl-hero-copy">
            <p className="sl-eyebrow">AFTER SCHOOL · OUR SCHOOL WORLD</p>
            <h1 id="growth-title">그때 그 친구의<br /><span>인스타그램주소,</span><br />궁금하지 않나요?</h1>
            <p>학교와 이름으로 친구를 찾아보세요.<br />연결 후 상대가 허용한 인스타그램주소를 확인해요.</p>
            <p className="sl-hero-guidance">안부를 보내고, 서로 수락하면 연결돼요.</p>
            <div className="sl-hero-actions"><Link href="/search" className="schoollove-dark-action schoollove-focus"><Search size={18} aria-hidden="true" />내 학교 찾기</Link></div>
            {launch.state === 'open' ? <Link href="/account" className="schoollove-focus sl-text-link">내 학교로 들어가기 <ArrowUpRight size={16} aria-hidden="true" /></Link> : <p className="mt-4 text-sm leading-6">계정 시작은 현재 준비 중입니다. 학교 정보는 계속 둘러볼 수 있어요.</p>}
          </div>
          <FantasyHero />
        </section>
        <div className="sl-home-content sl-home-content--ranking-middle">
          <TotalRanking status={growth.status} schools={growth.schools} />
        </div>
        <aside className="sl-home-side">
          <Suspense fallback={<GuestSchoolPanel />}><MyGrowthSchools compact fallback={<GuestSchoolPanel />} /></Suspense>
          <section className="sl-share-teaser"><SceneImage scene="share" className="sl-scene--teaser" sizes="(max-width: 767px) 100vw, 640px" /><h2>친구와 함께<br />더 높이 올라가요.</h2><p>같은 추억을 가진 친구에게<br />우리 학교를 전해 보세요.</p><Link href="/account" className="schoollove-focus sl-text-link">내 학교에서 공유하기 <ArrowUpRight size={16} aria-hidden="true" /></Link></section>
        </aside>
      </div>
    </div>
    <div className="sl-home-content">
      <GrowthHowItWorks />
      {todaySchools.length > 0 && <section className="sl-section" aria-labelledby="today-growth"><h2 id="today-growth">오늘 레벨이 오른 학교</h2><p className="mt-2 text-sm">공개 집계에서 오늘 레벨이 오른 학교예요.</p><ul className="mt-4 flex flex-wrap gap-3">{todaySchools.map(school => <li key={school.schoolId}><Link className="schoollove-focus inline-flex min-h-12 items-center gap-3 rounded-2xl border border-schoollove-border px-4 py-3" href={`/school/${encodeURIComponent(school.slug)}`}><span className="break-words">{school.schoolName}</span><strong className="sl-level-pill">Lv.{school.level}</strong></Link></li>)}</ul></section>}
      {growth.status === 'ok' && growth.schools.some(school => school.lastLevelUp) ? <section className="sl-section" aria-labelledby="growth-moments"><h2 id="growth-moments">학교의 다음 장이 열렸어요</h2><ul className="mt-5 space-y-3">{growth.schools.filter(school => school.lastLevelUp).map(school => <li key={school.schoolId}><Link href={`/school/${encodeURIComponent(school.slug)}`} className="schoollove-focus block rounded-2xl border border-schoollove-border p-5 text-base"><strong>{school.schoolName}</strong> · Lv.{school.level} 달성<span className="mt-2 block text-sm">{new Date(school.lastLevelUp!).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })} 공개 집계</span></Link></li>)}</ul></section> : null}
      <section className="sl-memory"><h2>같은 교실에 있던 사람,<br />문득 생각나는 날.</h2><div><p>학교와 이름으로 친구를 찾아보세요.<br />연결 후 상대가 허용한 인스타그램주소를 확인할 수 있어요.</p><p className="mt-4 !text-sm">사람 찾기 이용 여부는 내 계정의 초대 안내에서 확인해 주세요. 학교 레벨이 이용 권한을 열지는 않아요.</p></div></section>
      <section className="sl-privacy"><ShieldCheck aria-hidden="true" /><h2>학교는 함께 키우고, 개인 정보는 조심스럽게.</h2><p>개인 명단은 공개하지 않아요. 내 이름과 학교 이력은 비공개로 관리하고, 인스타그램주소는 연결 상대에게 직접 허용할 때만 공유해요.</p><div className="mt-5 flex flex-wrap gap-6 text-sm"><Link className="schoollove-focus min-h-11 underline" href="/privacy">개인정보처리방침</Link><Link className="schoollove-focus min-h-11 underline" href="/terms">이용약관</Link><Link className="schoollove-focus min-h-11 underline" href="/contact">문의 및 삭제 요청</Link></div></section>
    </div>
  </main>
}
