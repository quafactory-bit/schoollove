'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { IMG, pickAvatar } from '@/lib/images'
import { supabase } from '@/lib/supabase'
import ShareButton from '@/components/ShareButton'

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

// 메인 노출용 이름 마스킹: 첫 글자만 남기고 나머지는 ○ (예: 김지훈 → 김○○)
function maskName(name: string): string {
  const t = name.trim()
  if (t.length <= 1) return t
  return t[0] + '○'.repeat(t.length - 1)
}

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
      {/* ── 히어로 ───────────────────────────────────────────── */}
      <section className="pt-8 text-center sm:pt-12">
        <div className="mx-auto mb-6 w-full max-w-md">
          <Image
            src={IMG.heroMain}
            alt="기억나는 이름을 학교에 남기는 모습"
            width={1536}
            height={1024}
            priority
            sizes="(max-width: 640px) 90vw, 28rem"
            className="h-auto w-full"
          />
        </div>

        <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-neutral-900 sm:text-4xl">
          떠오르는 이름은 있는데,
          <br />
          <span className="text-blue-600">아는 인스타는 없었다.</span>
        </h1>
        <p className="mt-3 text-sm text-neutral-500 sm:text-base">
          인스타를 몰라도 괜찮아요.
          <br />
          기억나는 이름부터 학교에 남겨보세요.
        </p>

        {/* 메인 CTA — 이름 남기기를 1순위로 */}
        <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link
            href="/submit"
            className="rounded-xl bg-blue-600 px-6 py-3.5 text-base font-semibold text-white transition active:scale-95"
          >
            떠오르는 이름 남기기
          </Link>
          <Link
            href="/submit?self=1"
            className="rounded-xl border border-neutral-200 bg-white px-6 py-3.5 text-base font-semibold text-neutral-700 transition hover:border-neutral-300 active:scale-95"
          >
            내 인스타 등록하기
          </Link>
        </div>

        {/* 검색창 — 보조 위치로 */}
        <div className="relative mt-8 text-left">
          <p className="mb-2 text-center text-xs text-neutral-400">또는 학교를 먼저 둘러볼 수도 있어요</p>
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
                placeholder="학교 이름을 입력하세요"
                className="w-full bg-transparent text-base text-neutral-900 outline-none placeholder:text-neutral-400"
                inputMode="search"
                autoComplete="off"
              />
              <button
                type="submit"
                className="shrink-0 rounded-xl bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-600 transition hover:bg-neutral-200 active:scale-95"
              >
                둘러보기
              </button>
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

        {/* 인기 학교 */}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
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
      <section className="mt-12">
        <Image
          src={IMG.bannerHowto}
          alt="학교를 고르고, 떠오른 이름을 남기고, 누군가 다시 떠올리길 기다려요"
          width={2172}
          height={724}
          sizes="(max-width: 640px) 90vw, 42rem"
          className="h-auto w-full"
        />
        <div className="mt-1 grid grid-cols-3 gap-2 text-center text-xs font-medium text-neutral-500">
          <span>① 학교를 고르고</span>
          <span>② 떠오른 이름을 남기고</span>
          <span>③ 학교 사람들이 모이기</span>
        </div>
      </section>

      {/* ── 최근 학교에 남겨진 이름 ─────────────────────────── */}
      <section className="mt-14">
        <h2 className="mb-4 text-lg font-bold text-neutral-900">최근 학교에 남겨진 이름</h2>

        {loading ? (
          <ul className="space-y-2">
            {[0, 1, 2].map((i) => (
              <li key={i} className="h-16 animate-pulse rounded-2xl bg-neutral-100" />
            ))}
          </ul>
        ) : recent.length === 0 ? (
          // 콜드스타트: 등록이 없으면 첫 이름 남기기를 유도
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-6 py-10 text-center">
            <p className="text-sm text-neutral-600">
              아직 남겨진 이름이 없어요.
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
        ) : (
          <ul className="space-y-2">
            {recent.map((p) => (
              <li key={p.id}>
                <Link
                  href={p.school ? `/school/${p.school.slug}` : '#'}
                  className="flex items-center gap-3 rounded-2xl border border-neutral-100 bg-white px-3 py-3 transition hover:bg-neutral-50"
                >
                  <Image
                    src={pickAvatar(p.id)}
                    alt=""
                    width={48}
                    height={48}
                    className="h-11 w-11 shrink-0 rounded-full bg-neutral-100"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-neutral-900">
                      {maskName(p.nickname)}
                      {p.instagram_id ? (
                        <span className="ml-1.5 rounded-full bg-blue-50 px-1.5 py-0.5 align-middle text-[10px] font-medium text-blue-600">
                          인스타 연결됨
                        </span>
                      ) : (
                        <span className="ml-1.5 rounded-full bg-neutral-100 px-1.5 py-0.5 align-middle text-[10px] font-medium text-neutral-500">
                          누군가 기억하고 있어요
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-neutral-500">
                      {p.school?.school_name ?? '학교 미상'}
                      {p.school?.sido ? ` · ${p.school.sido}` : ''}
                      {p.graduation_year ? ` · ${p.graduation_year}년` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 text-neutral-300">›</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
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
