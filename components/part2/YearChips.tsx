'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

// Part 2 P1: 학교 상세에서 졸업연도를 먼저 고르게 한다. 등록된 연도는 칩, 나머지는 연도 선택.
export default function YearChips({ slug, years, currentYear }: { slug: string; years: Array<{ graduationYear: number; count: number }>; currentYear: number }) {
  const router = useRouter()
  const base = `/school/${encodeURIComponent(slug)}`
  const options = Array.from({ length: currentYear - 1950 + 1 }, (_, i) => currentYear - i)
  return (
    <div className="mt-3.5">
      <h2 className="text-[15px] font-extrabold text-sl-ink">내 졸업연도 고르기</h2>
      {years.length > 0 ? <ul className="mt-2 flex flex-wrap gap-2" aria-label="출석부가 열린 졸업연도">
        {years.map((row) => <li key={row.graduationYear}>
          <Link href={`${base}/${row.graduationYear}`} className="schoollove-focus inline-flex h-11 items-center gap-1.5 rounded-full border border-[#16a34a] bg-[#f0fdf4] px-3.5 text-[15px] font-bold text-[#14532d]">
            {row.graduationYear}년 <b className="text-[#16a34a]">{row.count}명</b>
          </Link>
        </li>)}
      </ul> : null}
      <label className="mt-2.5 block text-[13px] font-semibold text-sl-ink2">
        {years.length > 0 ? '다른 졸업연도' : '졸업연도를 고르면 우리 학년 칠판이 열려요'}
        <select
          defaultValue=""
          onChange={(e) => { if (e.target.value) router.push(`${base}/${e.target.value}`) }}
          className="schoollove-focus mt-1 block h-12 w-full rounded-xl border border-sl-line bg-[#fcfaf5] px-3 text-[16px] font-bold text-sl-ink"
        >
          <option value="" disabled>졸업연도 선택</option>
          {options.map((year) => <option key={year} value={year}>{year}년 졸업</option>)}
        </select>
      </label>
    </div>
  )
}
