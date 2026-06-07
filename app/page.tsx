'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { IMG, pickAvatar } from '@/lib/images'
import { supabase } from '@/lib/supabase'

// 메인에서 보여줄 "최근 등록" 한 줄의 모양
type RecentRow = {
  id: string
  nickname: string
  instagram_id: string | null
  graduation_year: number | null
  school: { school_name: string; slug: string; sido: string | null } | null
}

// 검색창에 영감 주는 인기 검색어 (클릭하면 그 단어로 검색)
const POPULAR = ['대치고등학교', '서울대학교', '한양대학교', '부산고등학교', '서초고등학교']

export default function HomePage() {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [recent, setRecent] = useState<RecentRow[]>([])
  const [loading, setLoading] = useState(true)

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

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pb-24">
      {/* ── 히어로 ───────────────────────────────────────────── */}
      <section className="pt-8 text-center sm:pt-12">
        <div className="mx-auto mb-6 w-full max-w-md">
          <Image
            src={IMG.heroMain}
            alt="동창들과 다시 연결되는 모습"
            width={1536}
            height={1024}
            priority
            sizes="(max-width: 640px) 90vw, 28rem"
            className="h-auto w-full"
          />
        </div>

        <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-neutral-900 sm:text-4xl">
          우리 학교, 우리 사람들
          <br />
          <span className="text-blue-600">스쿨러브아이</span>에서 찾아보세요
        </h1>
        <p className="mt-3 text-sm text-neutral-500 sm:text-base">
          전국 초·중·고·대학 동창들의 공개 인스타그램을 한 곳에서
        </p>

        {/* 검색창 */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            runSearch(q)
          }}
          className="mt-7"
        >
          <div className="flex items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
            <svg className="h-5 w-5 shrink-0 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" strokeLinecap="round" />
            </svg>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="학교 이름을 검색하세요"
              className="w-full bg-transparent text-base text-neutral-900 outline-none placeholder:text-neutral-400"
              inputMode="search"
              autoComplete="off"
            />
            <button
              type="submit"
              className="shrink-0 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition active:scale-95"
            >
              검색
            </button>
          </div>
        </form>

        {/* 인기 검색어 */}
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

      {/* ── 사용법 (검색 → 등록 → 연결) ──────────────────────── */}
      <section className="mt-12">
        <Image
          src={IMG.bannerHowto}
          alt="학교 검색하고, 친구를 등록하고, 다시 연결되세요"
          width={2172}
          height={724}
          sizes="(max-width: 640px) 90vw, 42rem"
          className="h-auto w-full"
        />
        <div className="mt-1 grid grid-cols-3 gap-2 text-center text-xs font-medium text-neutral-500">
          <span>① 학교 검색</span>
          <span>② 친구 등록</span>
          <span>③ 다시 연결</span>
        </div>
      </section>

      {/* ── 최근 등록 ───────────────────────────────────────── */}
      <section className="mt-14">
        <h2 className="mb-4 text-lg font-bold text-neutral-900">최근 등록</h2>

        {loading ? (
          <ul className="space-y-2">
            {[0, 1, 2].map((i) => (
              <li key={i} className="h-16 animate-pulse rounded-2xl bg-neutral-100" />
            ))}
          </ul>
        ) : recent.length === 0 ? (
          // 콜드스타트: 등록이 없으면 첫 등록을 유도
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-6 py-10 text-center">
            <p className="text-sm text-neutral-600">
              아직 등록된 동창이 없어요.
              <br />
              기억나는 이름을 가장 먼저 남겨보세요.
            </p>
            <Link
              href="/submit"
              className="mt-5 inline-block rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition active:scale-95"
            >
              첫 등록 남기기
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
                      {p.nickname}
                      {p.instagram_id && (
                        <span className="ml-1.5 font-normal text-neutral-400">@{p.instagram_id}</span>
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

      {/* ── 하단 감성 배너 + 등록 CTA ─────────────────────────── */}
      <section className="mt-16">
        <Link href="/submit" className="block overflow-hidden rounded-3xl border border-neutral-100">
          <Image
            src={IMG.bannerBottom}
            alt="그때 그 친구, 지금은 어떻게 지낼까"
            width={1536}
            height={1024}
            sizes="(max-width: 640px) 90vw, 42rem"
            className="h-auto w-full"
          />
          <div className="px-6 py-5 text-center">
            <p className="text-base font-bold text-neutral-900">그때 그 친구, 지금은 어떻게 지낼까?</p>
            <p className="mt-1 text-sm text-neutral-500">기억나는 이름 하나만 있어도 시작할 수 있어요.</p>
            <span className="mt-4 inline-block rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white">
              등록하러 가기
            </span>
          </div>
        </Link>
      </section>
    </main>
  )
}
