import Link from 'next/link'
import type { SchoolMembership } from '@/lib/account'
import { buildMySchoolCards } from '@/lib/accountFirstValue'

type Props = {
  memberships: SchoolMembership[]
}

export default function MySchoolsPanel({ memberships }: Props) {
  if (memberships.length === 0) {
    return (
      <section className="mt-5 border border-schoollove-border bg-schoollove-surface p-5" aria-label="내 학교 안내">
        <p className="text-sm leading-6 text-schoollove-secondary">
          학교 이력을 한 곳 등록하면 비공개 계정에서 내 학교를 확인할 수 있습니다.
        </p>
      </section>
    )
  }

  return (
    <section className="mt-5 border border-schoollove-border bg-schoollove-surface p-5" aria-labelledby="my-schools-heading">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-600">Private first value</p>
      <h2 id="my-schools-heading" className="mt-2 text-xl font-bold text-schoollove-text">내 학교</h2>
      <p className="mt-2 text-sm leading-6 text-schoollove-secondary">
        학교 이력이 비공개 계정에 연결되었습니다. 이 정보는 사람 찾기나 공개 명단으로 사용되지 않습니다.
      </p>
      <ul className="mt-4 space-y-3">
        {buildMySchoolCards(memberships).map((school) => (
          <li key={school.id} className="min-w-0 border border-schoollove-border bg-white p-4">
            <p className="break-words text-base font-bold text-schoollove-text">{school.schoolName}</p>
            {school.schoolType ? (
              <p className="mt-1 break-words text-sm leading-6 text-schoollove-secondary">
                {school.schoolType}{school.region ? ` · ${school.region}` : ''}
              </p>
            ) : null}
            <p className="mt-2 text-sm font-medium text-schoollove-text">
              {school.graduationYear}년 졸업{school.classNumber === null ? '' : ` · ${school.classNumber}반`}
            </p>
            {school.href ? (
              <Link href={school.href} className="schoollove-focus mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-schoollove-text underline">
                학교 페이지 보기
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
