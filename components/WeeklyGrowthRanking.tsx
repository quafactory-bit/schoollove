import Link from 'next/link'
import { formatNumber } from '@/lib/utils'
import type { WeeklyRankingViewRow } from '@/types/homeFeed'

interface Props {
  status: 'ok' | 'error'
  rows: WeeklyRankingViewRow[]
}

// "이번 주 학교 성장 순위" TOP 5. 실제 대상이 5개 미만이면 그 수만큼만 표시하고,
// 0건이면 빈 상태 문구를 보여준다(전체 기간 순위로 대체하지 않음). RPC 오류는 별도의
// 안전한 오류 상태로 표시하며 빈 상태처럼 위장하지 않는다.
export default function WeeklyGrowthRanking({ status, rows }: Props) {
  return (
    <section className="my-10">
      <h2 className="text-[19px] font-extrabold tracking-tight text-neutral-900">이번 주 학교 성장 순위</h2>
      <p className="mt-1 text-[13.5px] text-neutral-500">최근 7일 동안 새로 이름이 남겨진 학교예요.</p>

      {status === 'error' ? (
        <p className="mt-5 rounded-2xl bg-neutral-50 px-4 py-7 text-center text-[14px] text-neutral-400">
          지금 순위를 불러오지 못했어요. 잠시 후 다시 확인해주세요.
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-5 rounded-2xl bg-neutral-50 px-4 py-7 text-center text-[14px] text-neutral-500">
          이번 주에는 아직 새로 이름이 남겨진 학교가 없어요.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-neutral-100">
          {rows.map((row) => (
            <li key={row.schoolId}>
              <Link href={`/school/${row.slug}`} className="flex items-center gap-3 py-3.5">
                <span className="w-5 shrink-0 text-center text-[14px] font-black text-neutral-300">{row.rank}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <span className="truncate text-[14.5px] font-bold text-neutral-900">{row.schoolName}</span>
                    {row.currentLevel !== null && (
                      <span className="shrink-0 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10.5px] font-bold text-indigo-600">
                        Lv.{row.currentLevel}
                      </span>
                    )}
                    {row.isNearGrowth && (
                      <span className="shrink-0 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10.5px] font-bold text-blue-600">
                        성장 임박
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-[12.5px] text-neutral-400">
                    최근 7일 +{formatNumber(row.newVisibleProfiles)}명 · 누적 {formatNumber(row.visibleProfileCount)}명
                    {row.remainingLabel ? ` · ${row.remainingLabel}` : ' · 활발하게 이어지는 학교'}
                  </p>
                </div>
                <span className="shrink-0 text-neutral-300">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
