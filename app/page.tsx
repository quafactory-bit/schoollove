'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { IMG } from '@/lib/images'
import { supabase } from '@/lib/supabase'
import ShareButton from '@/components/ShareButton'
import { Search, PenLine, Heart } from 'lucide-react'

// 메인에서 보여줄 "최근 등록" 한 줄의 모양
type RecentRow = {
  id: string
  nickname: string
  instagram_id: string | null
  graduation_year: number | null
  school: { school_name: string; slug: string; sido: string | null } | null
}

// 검색창에 영감 주는 인기 학교 (클릭하면 그 단어로 검색)
const POPULAR = ['대치고등학교', '서울대학교', '한양대학교', '부산고등학교', '서초고등학교']

// 검색창 자동완성에 뜨는 학교 한 줄
type SchoolHit = {
  id: string
  school_name: string
  slug: string
  sido: string | null
  sigungu: string | null
}

// 히어로 "할 수 있는 것" 리스트 (아이콘 + 문구)
const FEATURES = [
  {
    text: '우리 학교 동창들 찾아보기',
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
    ),
  },
  {
    text: '같은 반이었던 사람들 모아보기',
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    text: '그때 그 친구의 지금 인스타 보기',
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <path d="M17.5 6.5h.01" />
      </svg>
    ),
  },
  {
    text: '“나 여기 있어” 한 줄 남기기',
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      </svg>
    ),
  },
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
    <main className="mx-auto w-full max-w-2xl px-5 pb-24">
      {/* ── 히어로 (왼쪽 정렬: 환영 → 정체 → 할 수 있는 것 → 감성 → 검색 → CTA) ── */}
      <section className="mx-auto max-w-md pt-10 text-left sm:pt-14">
        <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-neutral-900 sm:text-3xl">
          Welcome to 스쿨러브
        </h1>
        <p className="mt-2.5 text-[15px] leading-relaxed text-neutral-500">
          스쿨러브아이는 학교와 이름으로
          <br className="sm:hidden" /> 동창을 찾는 온라인 디렉토리예요.
        </p>

        {/* 여기서 할 수 있는 것 — 아이콘으로 줄 시작점 맞추기 */}
        <p className="mt-8 text-xs font-medium text-neutral-400">스쿨러브아이에서 할 수 있는 것</p>
        <ul className="mt-3 space-y-2.5">
          {FEATURES.map((f) => (
            <li key={f.text} className="flex items-center gap-2.5 text-[15px] text-neutral-800">
              <span className="shrink-0 text-neutral-400">{f.icon}</span>
              <span>{f.text}</span>
            </li>
          ))}
        </ul>

        {/* 감성 한 줄 — 행동 직전에 마음 건드리기 */}
        <p className="mt-8 text-[15px] font-medium text-rose-500">
          그 시절 누군가가, 지금 당신을 기억하고 있을지도 몰라요.
        </p>

        {/* 검색창 — 첫 화면의 주인공 */}
        <div className="relative mt-3">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              runSearch(q)
            }}
          >
            <div className="flex items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
              <svg className="h-5 w-5 shrink-0 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                    className="block w-full px-4 py-2.5 text-left hover:bg-neutral-50"
                  >
                    <span className="text-sm font-medium text-neutral-900">{s.school_name}</span>
                    <span className="ml-2 text-xs text-neutral-400">
                      {s.sido ?? ''} {s.sigungu ?? ''}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* 메인 CTA — 같은 크기 2열 */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link
            href="/submit"
            className="rounded-xl bg-blue-600 px-2 py-3.5 text-center text-sm font-semibold text-white transition active:scale-95"
          >
            떠오르는 이름 남기기
          </Link>
          <Link
            href="/submit?self=1"
            className="rounded-xl border border-neutral-200 bg-white px-2 py-3.5 text-center text-sm font-semibold text-neutral-700 transition hover:border-neutral-300 active:scale-95"
          >
            내 인스타 등록하기
          </Link>
        </div>

        {/* 인기 학교 */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {POPULAR.map((name) => (
            <button
              key={name}
              onClick={() => runSearch(name)}
              className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs text-neutral-600 transition hover:border-neutral-300 hover:bg-neutral-100"
            >
              {name}
            </button>
          ))}
        </div>
      </section>

      {/* ── 사용법 (학교 선택 → 이름 남기기 → 사람들이 모이기) ── */}
      <section className="mt-14">
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: <Search className="h-6 w-6" />, step: '①', text: '학교를 고르고' },
            { icon: <PenLine className="h-6 w-6" />, step: '②', text: '떠오른 이름을 남기고' },
            { icon: <Heart className="h-6 w-6" />, step: '③', text: '학교 사람들이 모이기' },
          ].map((s) => (
            <div
              key={s.step}
              className="flex flex-col items-center gap-2 rounded-2xl border border-neutral-100 bg-white px-2 py-5 text-center"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-500">
                {s.icon}
              </span>
              <span className="text-xs font-medium text-neutral-500">
                {s.step} {s.text}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ── 방금 학교에 이름이 남겨졌어요 (학교 단위, 최근순 중복 제거) ── */}
      <section className="mt-14">
        <h2 className="mb-1 text-lg font-bold text-neutral-900">방금 학교에 이름이 남겨졌어요</h2>
        <p className="mb-4 text-sm text-neutral-500">
          누군가의 기억 속 이름들이 학교별로 하나씩 모이고 있어요.
        </p>

        {loading ? (
          <ul className="space-y-2">
            {[0, 1, 2].map((i) => (
              <li key={i} className="h-14 animate-pulse rounded-2xl bg-neutral-100" />
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
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-6 py-10 text-center">
                <p className="text-sm text-neutral-600">
                  아직 이름이 남겨진 학교가 없어요.
                  <br />
                  기억나는 이름을 가장 먼저 남겨보세요.
                </p>
                <Link
                  href="/submit"
                  className="mt-5 inline-block rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition active:scale-95"
                >
                  떠오르는 이름 남기기
                </Link>
              </div>
            )
          }

          return (
            <>
              <ul className="space-y-2">
                {schools.map((p, idx) => {
                  // 라벨/문구 규칙: 맨 위=방금 / 인스타 연결됨 / 그 외=이름 남겨짐
                  const isTop = idx === 0
                  const connected = !!p.instagram_id
                  let label: string
                  let labelClass: string
                  let line: string

                  if (isTop) {
                    label = '방금'
                    labelClass = 'bg-blue-600 text-white'
                    line = `${p.school?.school_name}에 이름이 남겨졌어요`
                  } else if (connected) {
                    label = '인스타 연결됨'
                    labelClass = 'bg-blue-50 text-blue-600'
                    line = `${p.school?.school_name}에 남겨진 이름이 연결됐어요`
                  } else {
                    label = '이름 남겨짐'
                    labelClass = 'bg-neutral-100 text-neutral-500'
                    line = `${p.school?.school_name}에 누군가의 이름이 남겨졌어요`
                  }

                  return (
                    <li key={p.id}>
                      <Link
                        href={p.school ? `/school/${p.school.slug}` : '#'}
                        className="flex items-center gap-3 rounded-2xl border border-neutral-100 bg-white px-4 py-3 transition hover:bg-neutral-50"
                      >
                        <div className="min-w-0 flex-1">
                          <span
                            className={`mr-1.5 rounded-full px-1.5 py-0.5 align-middle text-[10px] font-medium ${labelClass}`}
                          >
                            {label}
                          </span>
                          <span className="text-sm font-medium text-neutral-800">{line}</span>
                          {p.graduation_year && (
                            <span className="ml-1 text-xs text-neutral-400"> · {p.graduation_year}년</span>
                          )}
                        </div>
                        <span className="shrink-0 text-neutral-300">›</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>

              {/* 구경 → 남기기로 잇기 */}
              <div className="mt-5 rounded-2xl border border-dashed border-neutral-200 px-6 py-6 text-center">
                <p className="text-sm font-medium text-neutral-700">내 학교가 안 보이나요?</p>
                <p className="mt-1 text-sm text-neutral-500">지금 떠오르는 이름을 먼저 남겨보세요.</p>
                <Link
                  href="/submit"
                  className="mt-4 inline-block rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition active:scale-95"
                >
                  떠오르는 이름 남기기
                </Link>
              </div>
            </>
          )
        })()}
      </section>

      {/* ── 하단 감성 배너 + 이름 남기기 CTA ─────────────────── */}
      <section className="mt-16">
        <div className="block overflow-hidden rounded-3xl border border-neutral-100">
          <Link href="/submit">
            <Image
              src={IMG.bannerBottom}
              alt="문득 떠오른 이름이 있다면 지금 학교에 남겨보세요"
              width={1536}
              height={1024}
              sizes="(max-width: 640px) 90vw, 42rem"
              className="h-auto w-full"
            />
          </Link>
          <div className="px-6 py-5 text-center">
            <p className="text-base font-bold text-neutral-900">문득 떠오른 이름이 있다면,</p>
            <p className="mt-1 text-sm text-neutral-500">지금 학교에 남겨보세요.</p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Link
                href="/submit"
                className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition active:scale-95"
              >
                떠오르는 이름 남기기
              </Link>
              <Link
                href="/submit?self=1"
                className="rounded-xl border border-neutral-200 bg-white px-5 py-2.5 text-sm font-semibold text-neutral-700 transition hover:border-neutral-300 active:scale-95"
              >
                내 인스타 등록하기
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── 서비스 공유 ───────────────────────────────────────── */}
      <section className="mt-6 text-center">
        <ShareButton
          text="기억나는 이름부터 학교에 남겨보는 곳 - 스쿨러브아이"
          url="https://www.schoollove.kr"
          label="친구에게 스쿨러브아이 공유하기"
          className="text-sm font-medium text-neutral-500 underline underline-offset-4 hover:text-blue-600"
        />
      </section>
    </main>
  )
}
