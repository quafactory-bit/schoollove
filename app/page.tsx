'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import ShareButton from '@/components/ShareButton'
import { Search, PenLine, Heart } from 'lucide-react'
import WorldcupBanner from '@/components/WorldcupBanner'

// 메인에서 보여줄 "최근 등록" 한 줄의 모양
type RecentRow = {
  id: string
  nickname: string
  instagram_id: string | null
  graduation_year: number | null
  school: { school_name: string; slug: string; sido: string | null } | null
}

// 검색창 자동완성에 뜨는 학교 한 줄
type SchoolHit = {
  id: string
  school_name: string
  slug: string
  sido: string | null
  sigungu: string | null
}

// 검색창에 영감 주는 인기 학교 (클릭하면 그 단어로 검색)
const POPULAR = ['대치고등학교', '서울대학교', '한양대학교', '부산고등학교', '서초고등학교']

// 추억 슬라이더 사진 (public/images/memory-01.jpg ~ memory-10.jpg)
const MEMORIES = [
  { src: '/images/memory-01.jpg', cap: '중학교 체육시간' },
  { src: '/images/memory-02.jpg', cap: '축제 장기자랑' },
  { src: '/images/memory-03.jpg', cap: '운동장에서 수다' },
  { src: '/images/memory-04.jpg', cap: '복도에서' },
  { src: '/images/memory-05.jpg', cap: '교복 입은 그 친구' },
  { src: '/images/memory-06.jpg', cap: '도서관에서' },
  { src: '/images/memory-07.jpg', cap: '그 시절 점심시간' },
  { src: '/images/memory-08.jpg', cap: '수학여행 단체사진' },
  { src: '/images/memory-09.jpg', cap: '벚꽃 핀 등굣길' },
  { src: '/images/memory-10.jpg', cap: '졸업식 날' },
]

export default function HomePage() {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [recent, setRecent] = useState<RecentRow[]>([])
  const [loading, setLoading] = useState(true)

  // 검색창 자동완성
  const [hits, setHits] = useState<SchoolHit[]>([])
  const [hitOpen, setHitOpen] = useState(false)
  const [hitLoading, setHitLoading] = useState(false)

  // 추억 슬라이더
  const [slide, setSlide] = useState(0)
  const touchX = useRef(0)

  // 최근 등록된 프로필 8개 (학교 정보 join). 숨김 처리된 건 제외.
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, nickname, instagram_id, graduation_year, school:schools(school_name, slug, sido)')
        .eq('is_hidden', false)
        .order('created_at', { ascending: false })
        .limit(8)
      if (alive) {
        setRecent((data as unknown as RecentRow[]) ?? [])
        setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // 슬라이더 자동 전환 (3초)
  useEffect(() => {
    const t = setInterval(() => setSlide((s) => (s + 1) % MEMORIES.length), 3000)
    return () => clearInterval(t)
  }, [])

  // 검색 실행 → 검색 결과 페이지로 이동
  function runSearch(term: string) {
    const t = term.trim()
    if (!t) return
    router.push(`/search?q=${encodeURIComponent(t)}`)
  }

  // 입력 시 학교 자동완성 (300ms debounce, 지역+학교명 매칭 RPC)
  useEffect(() => {
    const t = q.trim()
    if (t.length < 1) {
      setHits([])
      return
    }
    const timer = setTimeout(async () => {
      setHitLoading(true)
      const { data } = await supabase.rpc('search_schools_v2', { q: t, lim: 6 })
      setHits((data as SchoolHit[]) ?? [])
      setHitLoading(false)
      setHitOpen(true)
    }, 300)
    return () => clearTimeout(timer)
  }, [q])

  function goSchool(slug: string) {
    router.push(`/school/${slug}`)
  }

  return (
    <main className="mx-auto w-full max-w-[600px] px-5 pb-24">
      {/* ── 2026 월드컵 응원 띠배너 (시즌 한정 · 종료 후 제거) ── */}
      <div className="-mx-5 overflow-hidden sm:mx-0 sm:mt-4 sm:rounded-2xl">
        <WorldcupBanner />
      </div>

      {/* ── 히어로 ── */}
      <section className="pt-7 text-left">
        <span className="inline-flex items-center rounded-full border border-neutral-200 px-3 py-1.5 text-[12.5px] font-semibold text-neutral-500">
          Instagram으로 다시 찾는 학교 친구
        </span>

        <h1 className="mt-5 text-[31px] font-extrabold leading-[1.18] tracking-[-0.04em] text-neutral-900">
          시끄러운 SNS가 아니라,
          <br />
          필요한 순간 열어보는
          <br />
          작은 명부.
        </h1>

        <p className="mt-4 text-[15px] leading-relaxed text-neutral-500">
          스쿨러브아이는 학교와 이름으로 동창을 찾는 온라인 디렉토리예요. 긴 가입 절차 없이 이름과
          학교만 남겨두면, 보고 싶었던 친구가 조용히 찾아올 수 있어요.
        </p>

        {/* 검색창 — 핵심 유틸리티 */}
        <div className="relative mt-6">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              runSearch(q)
            }}
          >
            <div className="flex items-center gap-2.5 rounded-2xl border border-neutral-200 bg-white px-5 py-4 transition focus-within:border-neutral-900 focus-within:ring-2 focus-within:ring-neutral-100">
              <svg className="h-6 w-6 shrink-0 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" strokeLinecap="round" />
              </svg>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onFocus={() => hits.length && setHitOpen(true)}
                onBlur={() => setTimeout(() => setHitOpen(false), 150)}
                placeholder="학교 이름을 검색하세요"
                className="w-full bg-transparent text-base text-neutral-900 outline-none placeholder:text-neutral-400"
                inputMode="search"
                autoComplete="off"
              />
            </div>
          </form>

          {/* 자동완성 드롭다운 */}
          {hitOpen && q.trim() && (
            <div className="absolute z-20 mt-1 max-h-80 w-full overflow-auto rounded-2xl border border-neutral-200 bg-white shadow-lg">
              {hitLoading ? (
                <p className="px-4 py-3 text-sm text-neutral-400">불러오는 중…</p>
              ) : hits.length === 0 ? (
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => runSearch(q)}
                  className="block w-full px-4 py-3 text-left text-sm text-neutral-500 hover:bg-neutral-50"
                >
                  ‘{q.trim()}’ 전체 결과 보기
                </button>
              ) : (
                hits.map((s) => (
                  <button
                    key={s.id}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => goSchool(s.slug)}
                    className="block w-full px-4 py-3 text-left hover:bg-neutral-50"
                  >
                    <span className="text-[15px] font-medium text-neutral-900">{s.school_name}</span>
                    <span className="ml-2 text-xs text-neutral-400">
                      {s.sido ?? ''} {s.sigungu ?? ''}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* 메인 CTA */}
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <Link
            href="/submit"
            className="rounded-2xl bg-neutral-900 px-2 py-[17px] text-center text-[15px] font-bold text-white transition hover:bg-neutral-800 active:scale-95"
          >
            친구 등록하기
          </Link>
          <Link
            href="/submit?self=1"
            className="rounded-2xl border border-neutral-200 bg-white px-2 py-[17px] text-center text-[15px] font-bold text-neutral-800 transition hover:bg-neutral-50 active:scale-95"
          >
            내 인스타 연결하기
          </Link>
        </div>

        {/* 인기 학교 */}
        <div className="mt-4 flex flex-wrap gap-2">
          {POPULAR.map((name) => (
            <button
              key={name}
              onClick={() => runSearch(name)}
              className="rounded-full border border-neutral-200 bg-white px-3.5 py-2 text-[13px] font-medium text-neutral-600 transition hover:bg-neutral-50"
            >
              {name}
            </button>
          ))}
        </div>

        {/* 통계 — 얇은 구분선 인라인 */}
        <div className="mt-6 flex border-y border-neutral-100">
          <div className="flex-1 py-4 text-center">
            <div className="text-[18px] font-extrabold tracking-tight text-neutral-900">10,005</div>
            <div className="mt-0.5 text-[11.5px] text-neutral-400">등록된 학교</div>
          </div>
          <div className="flex-1 border-l border-neutral-100 py-4 text-center">
            <div className="text-[18px] font-extrabold tracking-tight text-neutral-900">초·중·고·대</div>
            <div className="mt-0.5 text-[11.5px] text-neutral-400">전국 전 학교</div>
          </div>
          <div className="flex-1 border-l border-neutral-100 py-4 text-center">
            <div className="text-[18px] font-extrabold tracking-tight text-neutral-900">무료</div>
            <div className="mt-0.5 text-[11.5px] text-neutral-400">가입 없이 이름만</div>
          </div>
        </div>
      </section>

      {/* ── 추억 슬라이더 (흑백 UI 위 컬러 포인트) ── */}
      <section className="mt-10">
        <p className="text-[11px] font-bold tracking-[0.16em] text-neutral-400">THE MOMENTS</p>
        <h2 className="mt-2 text-[21px] font-extrabold tracking-tight text-neutral-900">그 시절, 그 장면</h2>

        <div className="mt-4 overflow-hidden">
          <div
            className="flex transition-transform duration-500 ease-out"
            style={{ transform: `translateX(-${slide * 100}%)` }}
            onTouchStart={(e) => {
              touchX.current = e.touches[0].clientX
            }}
            onTouchEnd={(e) => {
              const dx = e.changedTouches[0].clientX - touchX.current
              if (Math.abs(dx) > 40) {
                setSlide((s) => (s + (dx < 0 ? 1 : -1) + MEMORIES.length) % MEMORIES.length)
              }
            }}
          >
            {MEMORIES.map((m, i) => (
              <div key={m.src} className="w-full shrink-0">
                <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl border border-neutral-100 bg-neutral-100">
                  <Image
                    src={m.src}
                    alt={m.cap}
                    fill
                    sizes="(max-width: 600px) 100vw, 600px"
                    className="object-cover"
                    priority={i === 0}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 캡션 + 인덱스 */}
        <div className="mt-3.5 flex items-center justify-between">
          <span className="text-[14px] font-bold tracking-tight text-neutral-900">{MEMORIES[slide].cap}</span>
          <span className="text-[12px] tabular-nums text-neutral-400">{slide + 1} / {MEMORIES.length}</span>
        </div>

        {/* 점 인디케이터 */}
        <div className="mt-3.5 flex justify-center gap-1.5">
          {MEMORIES.map((m, i) => (
            <button
              key={m.src}
              onClick={() => setSlide(i)}
              aria-label={`${i + 1}번째 사진`}
              className={`h-1.5 rounded-full transition-all ${i === slide ? 'w-4 bg-neutral-900' : 'w-1.5 bg-neutral-200'}`}
            />
          ))}
        </div>

        <p className="mt-3 text-center text-[11.5px] text-neutral-400">
          * 슬라이더 이미지는 분위기 연출을 위한 예시이며, 실제 등록자와 무관합니다.
        </p>
      </section>

      {/* ── 한 줄 남기기 (컴포저형 CTA → 등록 흐름) ── */}
      <section className="mt-12">
        <p className="text-[11px] font-bold tracking-[0.16em] text-neutral-400">&ldquo;나 여기 있어&rdquo;</p>
        <h2 className="mt-2 text-[21px] font-extrabold tracking-tight text-neutral-900">한 줄 남기기</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-neutral-500">
          긴 가입 없이, 학교와 이름 한 줄만. 그때 그 친구가 이 한 줄을 보고 당신을 떠올릴지도 몰라요.
        </p>

        <Link
          href="/submit?self=1"
          className="mt-4 flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3 transition hover:bg-neutral-50"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
            <PenLine className="h-[18px] w-[18px]" />
          </span>
          <span className="flex-1 truncate text-[15px] text-neutral-400">어느 학교, 누구로 기억되고 싶나요?</span>
          <span className="shrink-0 rounded-xl bg-neutral-900 px-4 py-2 text-[14px] font-bold text-white">남기기</span>
        </Link>
      </section>

      {/* ── 방금 학교에 누군가 연결됐어요 (실데이터 · 학교 중복 제거) ── */}
      <section className="mt-12">
        <p className="text-[11px] font-bold tracking-[0.16em] text-neutral-400">QUIET NETWORK · LIVE</p>
        <h2 className="mt-2 text-[24px] font-extrabold leading-tight tracking-[-0.035em] text-neutral-900">
          그때 이름으로,
          <br />
          지금 다시 연결.
        </h2>
        <p className="mt-2.5 text-[15px] text-neutral-500">
          흩어져 있던 사람들이 학교별로 하나씩 다시 연결되고 있어요.
        </p>

        {loading ? (
          <ul className="mt-5 space-y-2.5">
            {[0, 1, 2].map((i) => (
              <li key={i} className="h-16 animate-pulse rounded-2xl bg-neutral-100" />
            ))}
          </ul>
        ) : (() => {
          // recent(프로필 최근순)에서 학교 기준으로 중복 제거 → 최근 학교 5개
          const seen = new Set<string>()
          const schools: RecentRow[] = []
          for (const p of recent) {
            const slug = p.school?.slug
            if (!slug || seen.has(slug)) continue
            seen.add(slug)
            schools.push(p)
            if (schools.length >= 5) break
          }

          if (schools.length === 0) {
            // 콜드스타트: 아직 학교가 없으면 첫 등록 유도
            return (
              <div className="mt-5 rounded-2xl border border-neutral-200 bg-neutral-50 px-6 py-10 text-center">
                <p className="text-[15px] leading-relaxed text-neutral-600">
                  아직 이 명부의 첫 페이지예요.
                  <br />
                  당신이 첫 이름을 남기면, 누군가 곧 찾아올 거예요.
                </p>
                <Link
                  href="/submit"
                  className="mt-5 inline-block rounded-2xl bg-neutral-900 px-6 py-3.5 text-[15px] font-bold text-white transition active:scale-95"
                >
                  친구 등록하기
                </Link>
              </div>
            )
          }

          return (
            <>
              <ul className="mt-5">
                {schools.map((p, idx) => {
                  const isTop = idx === 0
                  const isLast = idx === schools.length - 1
                  const label = isTop ? '방금' : '연결됨'
                  const labelClass = isTop ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-500'
                  const initial = p.school?.school_name?.[0] ?? '학'

                  return (
                    <li key={p.id}>
                      <Link
                        href={p.school ? `/school/${p.school.slug}` : '#'}
                        className="flex gap-3 border-b border-neutral-100 py-4 transition hover:bg-neutral-50"
                      >
                        {/* 세로 연결선 레일 */}
                        <div className="flex shrink-0 flex-col items-center">
                          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-[15px] font-bold text-neutral-700">
                            {initial}
                          </span>
                          {!isLast && <span className="mt-1.5 w-0.5 flex-1 rounded bg-neutral-200" />}
                        </div>

                        <div className="min-w-0 flex-1 pt-1.5">
                          <span className={`mr-1.5 rounded-full px-2 py-0.5 align-middle text-[11px] font-semibold ${labelClass}`}>
                            {label}
                          </span>
                          <span className="text-[15px] font-medium text-neutral-800">
                            {p.school?.school_name}에 누군가 연결됐어요
                          </span>
                          {p.graduation_year && (
                            <span className="ml-1 text-[13px] text-neutral-400"> · {p.graduation_year}년</span>
                          )}
                        </div>
                        <span className="shrink-0 self-center text-neutral-300">›</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>

              {/* 구경 → 남기기로 잇기 */}
              <div className="mt-6 rounded-2xl border border-dashed border-neutral-200 px-6 py-7 text-center">
                <p className="text-[15px] font-medium text-neutral-700">내 학교가 안 보이나요?</p>
                <p className="mt-1 text-[15px] text-neutral-500">지금 떠오르는 이름을 먼저 남겨보세요.</p>
                <Link
                  href="/submit"
                  className="mt-4 inline-block rounded-2xl bg-neutral-900 px-6 py-3.5 text-[15px] font-bold text-white transition active:scale-95"
                >
                  친구 등록하기
                </Link>
              </div>
            </>
          )
        })()}
      </section>

      {/* ── 사용법 (학교 선택 → 이름 남기기 → 함께 모이기) ── */}
      <section className="mt-12">
        <p className="text-[11px] font-bold tracking-[0.16em] text-neutral-400">HOW IT WORKS</p>
        <div className="mt-3">
          {[
            { icon: <Search className="h-6 w-6" />, step: '01', title: '학교를 찾고', desc: '다녔던 학교 이름을 검색해요.' },
            { icon: <PenLine className="h-6 w-6" />, step: '02', title: '이름을 남기고', desc: '공개 가능한 계정만 가볍게 연결해요.' },
            { icon: <Heart className="h-6 w-6" />, step: '03', title: '친구가 찾아오면', desc: '그 시절의 이름으로 다시 이어져요.' },
          ].map((s, i, arr) => (
            <div
              key={s.step}
              className={`flex items-start gap-3.5 py-4 ${i < arr.length - 1 ? 'border-b border-neutral-100' : ''}`}
            >
              <span className="w-[22px] shrink-0 pt-0.5 text-[13px] font-bold text-neutral-400">{s.step}</span>
              <span className="shrink-0 text-neutral-900">{s.icon}</span>
              <div>
                <h3 className="text-[16px] font-bold tracking-tight text-neutral-900">{s.title}</h3>
                <p className="mt-0.5 text-[14px] text-neutral-500">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 하단 검정 CTA 카드 ── */}
      <section className="mt-12">
        <div className="relative rounded-3xl bg-neutral-900 px-6 py-8 text-white">
          <h2 className="max-w-[10em] text-[24px] font-extrabold leading-snug tracking-[-0.035em]">
            문득 떠오른 이름이 있다면, 지금 학교에 남겨두세요.
          </h2>
          <p className="mt-3.5 text-[14px] leading-relaxed text-white/60">
            학교, 이름, 인스타그램. 세 가지만 있으면 충분해요. 다시 연결되는 순간은 친구가 발견했을 때
            시작돼요.
          </p>
          <Link
            href="/submit"
            className="mt-5 inline-block rounded-2xl bg-white px-6 py-3.5 text-[14.5px] font-bold text-neutral-900 transition active:scale-95"
          >
            무료로 등록하기
          </Link>
        </div>
      </section>

      {/* ── 서비스 공유 ── */}
      <section className="mt-8 text-center">
        <ShareButton
          text="기억나는 이름부터 학교에 남겨보는 곳 - 스쿨러브아이"
          url="https://www.schoollove.kr"
          label="친구에게 스쿨러브아이 공유하기"
          className="text-sm font-medium text-neutral-500 underline underline-offset-4 hover:text-neutral-900"
        />
      </section>
    </main>
  )
}
