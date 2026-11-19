import Link from 'next/link'
import type { HomeAttendance as HomeAttendanceData } from '@/lib/part2Public'
import { shortSchoolName } from '@/lib/push/contracts'

// Part 2 P1: LIVE 출석 티커 + 출석 열기 TOP 5. 실제 집계만, 점수·레벨 없음, 이름·인스타 없음.
// DB가 최근 7일 출석 5건 미만이면 visible:false를 돌려주고, 이때 영역 전체를 그리지 않는다.
export default function HomeAttendance({ data }: { data: HomeAttendanceData }) {
  if (!data.visible) return null
  return (
    <section aria-labelledby="home-live" className="mt-6 rounded-2xl bg-[#14532d] px-4 py-4 text-[#fcfaf5]">
      <h2 id="home-live" className="flex items-center gap-2 text-[15px] font-black">
        <span className="inline-flex items-center gap-1 rounded-full bg-[#16a34a] px-2 py-0.5 text-[11px] font-black tracking-[0.5px]"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-white" />LIVE</span>
        최근 7일 출석 {data.recent_total}명
      </h2>
      <ul className="mt-2.5 space-y-1.5" aria-label="최근 출석">
        {data.ticker.map((row) => (
          <li key={`${row.slug}-${row.graduation_year}`}>
            <Link href={`/school/${encodeURIComponent(row.slug)}/${row.graduation_year}`} className="schoollove-focus block truncate text-[14px] font-semibold text-[#fcfaf5]/90">
              {shortSchoolName(row.school_name)} {row.graduation_year}년 졸업 <b className="text-[#fbbf24]">{row.count}명</b> 출석
            </Link>
          </li>
        ))}
      </ul>
      {data.top.length > 0 ? <div className="mt-4 rounded-xl bg-[#fcfaf5] px-3 py-3 text-[#14532d]">
        <h3 className="text-[14px] font-black">출석부가 많이 열린 학교 TOP {data.top.length}</h3>
        <ol className="mt-1.5">
          {data.top.map((row, index) => (
            <li key={row.slug}>
              <Link href={`/school/${encodeURIComponent(row.slug)}`} className="schoollove-focus flex h-10 items-center gap-2 text-[14.5px] font-bold">
                <span className="w-5 text-center font-black text-[#d97706]">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate">{row.school_name}</span>
                <span className="shrink-0 font-black text-[#16a34a]">{row.count}명</span>
              </Link>
            </li>
          ))}
        </ol>
      </div> : null}
    </section>
  )
}
