import Link from 'next/link'
import { ArrowUpRight, ShieldCheck } from 'lucide-react'
import SearchBar from '@/components/SearchBar'
import { getPublicAccountLaunchState, recordPublicAccountActivity } from '@/lib/publicAccountLaunch'
import { getSchoolGrowth } from '@/lib/schoolGrowthGame'
import MyGrowthSchools from '@/components/growth/MyGrowthSchools'
import { Suspense } from 'react'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const [launch, growth] = await Promise.all([getPublicAccountLaunchState(), getSchoolGrowth()])
  await recordPublicAccountActivity('public_home_view', 'direct')
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' })
  const today = day.format(new Date())
  const todaySchools = growth.schools.filter(school => school.lastLevelUp && day.format(new Date(school.lastLevelUp)) === today)
  return <main className="mx-auto w-full max-w-[1180px] px-5 pb-20 sm:px-8">
    <header className="flex min-h-24 items-center justify-between gap-4 border-b border-schoollove-border">
      <Link href="/" className="schoollove-focus text-lg font-bold tracking-tight">스쿨러브아이<span className="ml-2 text-[var(--schoollove-game-accent)]">↗</span></Link>
      <Link href="/account" className="schoollove-focus inline-flex min-h-11 items-center text-sm">내 계정</Link>
    </header>
    <section className="grid gap-10 py-12 lg:grid-cols-[1.2fr_1fr] lg:gap-16 lg:py-20" aria-labelledby="growth-title">
      <div>
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--schoollove-game-accent)]">OUR SCHOOL, NEXT LEVEL</p>
        <h1 id="growth-title" className="mt-5 break-keep text-[38px] font-bold leading-[1.16] tracking-[-0.045em] sm:text-5xl lg:text-[64px]">우리 학교는 지금<br /><span className="text-[var(--schoollove-game-accent)]">몇 레벨</span>일까?</h1>
        <p className="mt-6 max-w-lg break-keep text-base leading-7 text-schoollove-secondary">학교에 다시 모이는 사람이 늘고,<br className="hidden sm:block" /> 친구가 함께할수록 우리 학교도 성장해요.</p>
      </div>
      <div className="self-center border border-schoollove-border bg-[var(--schoollove-game-surface)] p-6 sm:p-8">
        <h2 className="text-xl font-bold">내 학교부터 찾아볼까요?</h2>
        <p className="mb-6 mt-2 text-sm leading-6">기억 속 학교 이름을 입력해 보세요.</p>
        <SearchBar variant="home" />
        <Link href="/search" className="schoollove-dark-action schoollove-focus mt-4 flex min-h-12 items-center justify-between bg-[var(--schoollove-game-accent)] px-4 font-semibold text-white">내 학교 찾기<ArrowUpRight size={20} aria-hidden="true" /></Link>
        {launch.state === 'open' ? <Link href="/account" className="schoollove-focus mt-4 inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">내 학교 키우기</Link> : <p className="mt-5 text-sm leading-6">계정 시작은 현재 준비 중입니다. 학교 정보는 계속 둘러볼 수 있어요.</p>}
      </div>
    </section>
    <Suspense fallback={null}><MyGrowthSchools /></Suspense>
    {todaySchools.length > 0 && <section className="border-t border-schoollove-border py-8" aria-labelledby="today-growth"><h2 id="today-growth" className="text-xl font-bold">오늘, 한 단계 자란 학교</h2><p className="mt-2 text-sm">오늘 공개 집계에서 확인된 레벨업이에요.</p><ul className="mt-4 flex flex-wrap gap-3">{todaySchools.map(school => <li key={school.schoolId}><Link className="schoollove-focus inline-flex min-h-12 items-center gap-3 border border-schoollove-border px-4 py-3" href={`/school/${encodeURIComponent(school.slug)}`}><span className="break-words">{school.schoolName}</span><strong className="shrink-0">Lv.{school.level}</strong></Link></li>)}</ul></section>}
    <section className="border-t border-schoollove-border py-10" aria-labelledby="weekly-growth">
      <div className="flex flex-wrap items-end justify-between gap-3"><h2 id="weekly-growth" className="text-2xl font-bold tracking-tight">이번 주, 함께 자라는 학교</h2><span className="text-sm text-schoollove-secondary">최근 7일 · 공개 집계 기준</span></div>
      {growth.status === 'unavailable' ? <p role="status" className="mt-6 border border-schoollove-border p-6 text-base">성장 소식을 잠시 불러오지 못했어요. 학교 찾기는 계속 이용할 수 있어요.</p> : growth.schools.length === 0 ? <div className="mt-6 border border-dashed border-schoollove-border p-8 sm:p-12"><p className="text-xl font-semibold">첫 성장 학교를 기다리고 있어요.</p><p className="mt-3 max-w-xl text-base leading-7 text-schoollove-secondary">학교를 등록하고 친구와 함께해 보세요. 개인 참여가 드러나지 않도록 성장은 모아서 공개해요.</p></div> : <ol className="mt-6 divide-y divide-schoollove-border border-y border-schoollove-border">{growth.schools.map(school => <li key={school.schoolId}><Link href={`/school/${encodeURIComponent(school.slug)}`} className="schoollove-focus flex min-h-24 items-center gap-5 py-5"><span className="w-8 shrink-0 text-2xl font-bold text-[var(--schoollove-game-accent)]">{school.rank}</span><span className="min-w-0 flex-1 break-words text-lg font-semibold">{school.schoolName}</span><span className="shrink-0 text-lg font-bold">Lv.{school.level}</span><ArrowUpRight size={18} aria-hidden="true" /></Link></li>)}</ol>}
    </section>
    {growth.status === 'ok' && growth.schools.some(school => school.lastLevelUp) ? <section className="border-t border-schoollove-border py-10" aria-labelledby="growth-moments"><h2 id="growth-moments" className="text-2xl font-bold">학교의 다음 장이 열렸어요</h2><ul className="mt-5 space-y-3">{growth.schools.filter(school => school.lastLevelUp).map(school => <li key={school.schoolId}><Link href={`/school/${encodeURIComponent(school.slug)}`} className="schoollove-focus block border border-schoollove-border p-5 text-base"><strong>{school.schoolName}</strong> · Lv.{school.level} 달성<span className="mt-2 block text-sm">{new Date(school.lastLevelUp!).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })} 공개 집계</span></Link></li>)}</ul></section> : null}
    <section className="grid gap-6 border-t border-schoollove-border py-12 sm:grid-cols-2">
      <h2 className="break-keep text-3xl font-bold leading-snug tracking-tight">같은 교실에 있던 사람,<br />문득 생각나는 날.</h2>
      <div><p className="text-base leading-8 text-schoollove-secondary">복도에서 마주치던 얼굴, 함께 걷던 하교길.<br />우리 학교를 기록하는 일에서 다시 시작해요.</p><p className="mt-4 text-sm leading-6">사람 찾기와 안부는 현재 승인된 제한 베타에서만 이용할 수 있어요. 학교 레벨이 이용 권한을 열지는 않아요.</p></div>
    </section>
    <section className="border-t border-schoollove-border py-8">
      <ShieldCheck className="text-[var(--schoollove-game-accent)]" aria-hidden="true" /><h2 className="mt-4 text-lg font-bold">학교는 함께 키우고, 개인 정보는 조심스럽게.</h2><p className="mt-3 max-w-2xl text-base leading-7 text-schoollove-secondary">개인 명단은 공개하지 않아요. 내 이름과 학교 이력은 비공개로 관리하고, Instagram은 연결 상대에게 직접 허용할 때만 공유해요.</p><div className="mt-5 flex flex-wrap gap-6 text-sm"><Link className="schoollove-focus min-h-11 underline" href="/privacy">개인정보처리방침</Link><Link className="schoollove-focus min-h-11 underline" href="/terms">이용약관</Link><Link className="schoollove-focus min-h-11 underline" href="/contact">문의 및 삭제 요청</Link></div>
    </section>
  </main>
}
