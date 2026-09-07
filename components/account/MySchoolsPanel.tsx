import Link from 'next/link'
import type { SchoolMembership } from '@/lib/account'
import { buildMySchoolCards } from '@/lib/accountFirstValue'
import ShareButton from '@/components/ShareButton'
import { formatGradeClassHistory } from '@/lib/accountGradeClass'
import ClassHistoryEditor from './ClassHistoryEditor'

type Props = {
  memberships: SchoolMembership[]
  schoolMembershipWritable?: boolean
}

export default function MySchoolsPanel({ memberships, schoolMembershipWritable = false }: Props) {
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
        학교·졸업연도·학년·반 정보는 공개 명단에 표시되지 않습니다. 사람 찾기에서는 내가 입력한 조건과 정확히 일치하는 경우에만 비공개 매칭 조건으로 사용됩니다.
      </p>
      <p className="mt-1 text-sm leading-6 text-schoollove-secondary">
        다시 로그인하면 등록한 학교 이력을 내 계정에서 계속 확인할 수 있습니다.
      </p>
      <ul className="mt-4 space-y-3">
        {buildMySchoolCards(memberships).map((school, index) => (
          <li key={school.id} className="min-w-0 border border-schoollove-border bg-white p-4">
            <p className="break-words text-base font-bold text-schoollove-text">{school.schoolName}</p>
            {school.schoolType ? (
              <p className="mt-1 break-words text-sm leading-6 text-schoollove-secondary">
                {school.schoolType}{school.region ? ` · ${school.region}` : ''}
              </p>
            ) : null}
            <p className="mt-2 text-sm font-medium text-schoollove-text">
              {school.graduationYear}년 졸업
            </p>
            {school.classHistory.length > 0 ? (
              <p className="mt-1 text-sm text-schoollove-secondary">
                {formatGradeClassHistory(school.classHistory)}
              </p>
            ) : null}
            <ClassHistoryEditor membership={memberships[index]} writable={schoolMembershipWritable} />
            {school.href ? <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <Link href={school.href} className="schoollove-focus inline-flex min-h-11 items-center text-sm font-semibold text-schoollove-text underline">
                학교 페이지 보기
              </Link>
              <ShareButton
                schoolName={school.schoolName}
                url={school.href}
                label="학교 링크 공유"
                className="schoollove-focus inline-flex min-h-11 items-center text-sm font-semibold text-schoollove-text underline"
              />
            </div> : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
