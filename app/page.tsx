import Link from 'next/link'
import { ArrowUpRight, Heart, Search, ShieldCheck, Trophy } from 'lucide-react'
import SearchBar from '@/components/SearchBar'
import { getPublicAccountLaunchState, recordPublicAccountActivity } from '@/lib/publicAccountLaunch'
import { getSchoolGrowth } from '@/lib/schoolGrowthGame'
import MyGrowthSchools from '@/components/growth/MyGrowthSchools'
import { Suspense } from 'react'
import GrowthHowItWorks from '@/components/growth/GrowthHowItWorks'
import SchoolWorld from '@/components/game/SchoolWorld'
import GameHeader from '@/components/game/GameHeader'

export const dynamic = 'force-dynamic'

function GuestSchoolPanel() {
  return <section className="sl-guest-card" aria-labelledby="guest-school-title">
    <h2 id="guest-school-title">우리 학교 성장 현황</h2>
    <div className="sl-guest-intro"><SchoolWorld mode="compact" /><p>학교를 찾으면<br />우리 학교 성장판이 열려요.</p></div>
    <p>기억 속 학교를 찾아보고,<br />우리 학교의 다음 장을 시작해요.</p>
    <div className="sl-quick-actions"><Link className="schoollove-focus" href="/search"><Search size={18} aria-hidden="true" />학교 찾기</Link><Link className="schoollove-focus" href="#weekly-growth"><Trophy size={18} aria-hidden="true" />성장 순위</Link></div>
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
            <h1 id="growth-title">함께 키워가는<br /><span>우리 학교</span></h1>
            <p>다시 모이는 사람이 늘고,<br />친구가 함께할수록 우리 학교도 성장해요.</p>
            <div className="sl-hero-search"><SearchBar variant="home" /></div>
            {launch.state === 'open' ? <Link href="/account" className="schoollove-focus sl-text-link">내 학교 키우기 <ArrowUpRight size={16} aria-hidden="true" /></Link> : <p className="mt-4 text-sm leading-6">계정 시작은 현재 준비 중입니다. 학교 정보는 계속 둘러볼 수 있어요.</p>}
          </div>
          <div className="sl-hero-world"><SchoolWorld priority /><span className="sl-hero-bubble" aria-hidden="true">우리 학교, 더 높이! ♡</span></div>
        </section>
        <aside className="sl-home-side">
          <Suspense fallback={<GuestSchoolPanel />}><MyGrowthSchools compact fallback={<GuestSchoolPanel />} /></Suspense>
          <section className="sl-share-teaser"><Heart className="sl-teaser-heart" fill="currentColor" size={28} aria-hidden="true" /><h2>친구와 함께<br />더 높이 올라가요.</h2><p>같은 추억을 가진 친구에게<br />우리 학교를 전해 보세요.</p><Link href="/account" className="schoollove-focus sl-text-link">내 학교에서 공유하기 <ArrowUpRight size={16} aria-hidden="true" /></Link></section>
        </aside>
      </div>
    </div>
    <div className="sl-home-content">
      <section className="sl-section" aria-labelledby="weekly-growth">
        <div className="sl-section-heading"><h2 id="weekly-growth">이번 주, 함께 자라는 학교</h2><span>최근 7일 · 학교의 성장을 모아 전해요</span></div>
        {growth.status === 'unavailable' ? <p role="status" className="sl-ranking-empty">성장 소식을 잠시 불러오지 못했어요. 학교 찾기는 계속 이용할 수 있어요.</p> : growth.schools.length === 0 ? <div className="sl-ranking-empty"><Trophy size={32} aria-hidden="true" /><h3>첫 성장 학교를 기다리고 있어요.</h3><p>첫 성장 순위가 만들어지는 중이에요. 우리 학교가 첫 주인공이 될 수도 있어요.<br />개인 참여가 드러나지 않도록 성장은 모아서 공개해요.</p><Link className="schoollove-focus sl-text-link" href="/search">우리 학교 찾기 <ArrowUpRight size={16} aria-hidden="true" /></Link></div> : <ol className="sl-rank-list">{growth.schools.map(school => <li key={school.schoolId}><Link className="schoollove-focus" href={`/school/${encodeURIComponent(school.slug)}`}><span className="sl-rank-number">{school.rank}</span><SchoolWorld level={school.level} mode="compact" /><span className="sl-rank-name">{school.schoolName}</span><span className="sl-level-pill">Lv.{school.level}</span><ArrowUpRight size={18} aria-hidden="true" /></Link></li>)}</ol>}
      </section>
      <GrowthHowItWorks />
      {todaySchools.length > 0 && <section className="sl-section" aria-labelledby="today-growth"><h2 id="today-growth">오늘, 한 단계 자란 학교</h2><p className="mt-2 text-sm">오늘 모아 전하는 학교의 성장 소식이에요.</p><ul className="mt-4 flex flex-wrap gap-3">{todaySchools.map(school => <li key={school.schoolId}><Link className="schoollove-focus inline-flex min-h-12 items-center gap-3 rounded-2xl border border-schoollove-border px-4 py-3" href={`/school/${encodeURIComponent(school.slug)}`}><span className="break-words">{school.schoolName}</span><strong className="sl-level-pill">Lv.{school.level}</strong></Link></li>)}</ul></section>}
      {growth.status === 'ok' && growth.schools.some(school => school.lastLevelUp) ? <section className="sl-section" aria-labelledby="growth-moments"><h2 id="growth-moments">학교의 다음 장이 열렸어요</h2><ul className="mt-5 space-y-3">{growth.schools.filter(school => school.lastLevelUp).map(school => <li key={school.schoolId}><Link href={`/school/${encodeURIComponent(school.slug)}`} className="schoollove-focus block rounded-2xl border border-schoollove-border p-5 text-base"><strong>{school.schoolName}</strong> · Lv.{school.level} 달성<span className="mt-2 block text-sm">{new Date(school.lastLevelUp!).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })} 공개 집계</span></Link></li>)}</ul></section> : null}
      <section className="sl-memory"><h2>같은 교실에 있던 사람,<br />문득 생각나는 날.</h2><div><p>복도에서 마주치던 얼굴, 함께 걷던 하교길.<br />우리 학교를 기록하는 일에서 다시 시작해요.</p><p className="mt-4 !text-sm">사람 찾기와 안부는 현재 승인된 제한 베타에서만 이용할 수 있어요. 학교 레벨이 이용 권한을 열지는 않아요.</p></div></section>
      <section className="sl-privacy"><ShieldCheck aria-hidden="true" /><h2>학교는 함께 키우고, 개인 정보는 조심스럽게.</h2><p>개인 명단은 공개하지 않아요. 내 이름과 학교 이력은 비공개로 관리하고, Instagram은 연결 상대에게 직접 허용할 때만 공유해요.</p><div className="mt-5 flex flex-wrap gap-6 text-sm"><Link className="schoollove-focus min-h-11 underline" href="/privacy">개인정보처리방침</Link><Link className="schoollove-focus min-h-11 underline" href="/terms">이용약관</Link><Link className="schoollove-focus min-h-11 underline" href="/contact">문의 및 삭제 요청</Link></div></section>
    </div>
  </main>
}
