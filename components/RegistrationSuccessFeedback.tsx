'use client'

import Image from 'next/image'
import Link from 'next/link'
import type { GrowthRewardCopy } from '@/app/submit/growthRewardCopy'
import { IMG } from '@/lib/images'
import { buildClassPath, buildSchoolPath, buildYearPath } from '@/lib/seo'
import type { RegistrationGrowthReward } from '@/types/registration'
import { summarizeCreatedNames } from '@/app/submit/successFeedback'
import RegistrationGrowthRewardCard from './RegistrationGrowthRewardCard'

export type RegistrationSuccessContext = {
  schoolName: string
  schoolSlug: string
  graduationYear: number
  grade: number | null
  classNumber: number | null
  department: string | null
  studentYear: number | null
}

type Props = {
  context: RegistrationSuccessContext
  success: number
  dup: number
  fail: number
  createdNames: string[]
  totalAtSchool: number | null
  growthReward?: RegistrationGrowthReward
  growthCopy: GrowthRewardCopy | null
  selfMode: boolean
  onShare: () => void
  onRegisterMore: () => void
}

function contextLabel(context: RegistrationSuccessContext): string {
  const parts = [`${context.graduationYear}년 졸업`]
  if (context.grade !== null) parts.push(`${context.grade}학년`)
  if (context.classNumber !== null) parts.push(`${context.classNumber}반`)
  if (context.department) parts.push(context.department)
  if (context.studentYear !== null) parts.push(`${context.studentYear}학년`)
  return parts.join(' · ')
}

export default function RegistrationSuccessFeedback({
  context,
  success,
  dup,
  fail,
  createdNames,
  totalAtSchool,
  growthReward,
  growthCopy,
  selfMode,
  onShare,
  onRegisterMore,
}: Props) {
  const schoolHref = buildSchoolPath(context.schoolSlug)
  const yearHref = buildYearPath(context.schoolSlug, context.graduationYear)
  const classHref =
    context.grade !== null && context.classNumber !== null
      ? buildClassPath(context.schoolSlug, context.graduationYear, context.grade, context.classNumber)
      : null

  return (
    <main className="mx-auto w-full max-w-[680px] px-5 pb-24 pt-10 text-center">
      <div className="mx-auto mb-6 w-full max-w-xs overflow-hidden rounded-2xl">
        <Image
          src={IMG.completeGraduation}
          alt="졸업 축하"
          width={1000}
          height={750}
          className="h-auto w-full"
          priority
        />
      </div>

      <p className="text-xs tracking-[0.16em] text-schoollove-text">REGISTRATION COMPLETE</p>
      <h1 className="mt-2 text-2xl leading-snug text-schoollove-text" aria-live="polite">
        {growthCopy?.title ?? (selfMode ? '연결 완료!' : '등록 완료!')}
      </h1>
      <p className="mt-3 text-base leading-7 text-schoollove-text">
        <strong>{context.schoolName}</strong>에 {success}명이 {selfMode ? '연결됐어요.' : '등록됐어요.'}
      </p>
      <p className="mt-1 text-sm text-schoollove-text">{contextLabel(context)}</p>

      <section className="mt-5 border-y border-schoollove-border py-4 text-left" aria-label="등록된 이름">
        <p className="text-xs tracking-[0.12em] text-schoollove-text">NEW PEOPLE</p>
        <p className="mt-2 break-words text-base leading-7 text-schoollove-text">
          {summarizeCreatedNames(createdNames, success)}
        </p>
      </section>

      {growthCopy && (
        <RegistrationGrowthRewardCard
          copy={growthCopy}
          reward={growthReward}
          totalAtSchool={totalAtSchool}
        />
      )}

      {(dup > 0 || fail > 0) && (
        <div className="mt-4 border-y border-schoollove-border py-3 text-sm leading-6 text-schoollove-text">
          {dup > 0 && <p>이미 등록된 이름 {dup}명</p>}
          {fail > 0 && <p>등록하지 못한 이름 {fail}명</p>}
        </div>
      )}

      <nav className="mt-8 grid gap-2.5 sm:grid-cols-2" aria-label="등록 완료 다음 단계">
        <Link
          href={schoolHref}
          className="schoollove-dark-action inline-flex min-h-11 items-center justify-center rounded-2xl bg-neutral-900 px-5 py-3 text-sm text-white transition"
        >
          학교 성장 보기
        </Link>
        <Link
          href={yearHref}
          className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-schoollove-border px-5 py-3 text-sm text-schoollove-text"
        >
          같은 연도 사람 보기
        </Link>
        {classHref && (
          <Link
            href={classHref}
            className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-schoollove-border px-5 py-3 text-sm text-schoollove-text"
          >
            같은 반 사람 보기
          </Link>
        )}
        <Link
          href="/#growth-feed"
          className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-schoollove-border px-5 py-3 text-sm text-schoollove-text"
        >
          최신 성장 소식 보기
        </Link>
        <button
          type="button"
          onClick={onShare}
          className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-schoollove-border px-5 py-3 text-sm text-schoollove-text"
        >
          {growthCopy?.shareLabel ?? '단톡방에 공유하기'}
        </button>
        <button
          type="button"
          onClick={onRegisterMore}
          className="inline-flex min-h-11 items-center justify-center px-5 py-3 text-sm text-schoollove-text"
        >
          다른 이름 더 남기기
        </button>
      </nav>
    </main>
  )
}
