import Link from 'next/link'
import { formatNumber } from '@/lib/utils'
import type { CurrentRankingViewRow } from '@/types/homeFeed'

interface Props {
  status: 'ok' | 'error'
  rows: CurrentRankingViewRow[]
}

function levelLabel(level: number) {
  return `LV.${String(level).padStart(2, '0')}`
}

export default function CurrentSchoolRanking({ status, rows }: Props) {
  return (
    <section className="mt-10 border-t border-schoollove-border pt-6" aria-labelledby="current-rank-title">
      <p className="font-status text-[11px] font-medium tracking-[0.12em] text-schoollove-secondary">CURRENT RANK</p>
      <h2 id="current-rank-title" className="mt-2 text-[20px] font-semibold tracking-tight text-schoollove-text">
        현재 학교 순위
      </h2>
      <p className="mt-1 text-[13px] leading-5 text-schoollove-secondary">
        지금까지 등록된 공개 프로필을 기준으로 집계했어요
      </p>

      <div className="mt-5 border border-schoollove-border bg-schoollove-surface">
        {status === 'error' ? (
          <p className="px-5 py-8 text-center text-[14px] text-schoollove-secondary" role="status">
            지금은 순위를 불러오지 못했어요. 잠시 후 다시 확인해 주세요.
          </p>
        ) : rows.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-[14px] font-medium text-schoollove-text">아직 순위에 오른 학교가 없어요.</p>
            <p className="mt-1 text-[13px] text-schoollove-secondary">첫 등록이 학교의 시작이 됩니다.</p>
            <Link href="/search" className="schoollove-focus mt-4 inline-flex min-h-11 items-center text-[13px] font-semibold text-schoollove-school">
              학교 찾아보기 →
            </Link>
          </div>
        ) : (
          <ol>
            {rows.map((row) => {
              const level = row.currentLevel === null ? null : levelLabel(row.currentLevel)
              const aria = `${row.rank}위 ${row.schoolName}, 공개 등록 ${row.visibleProfileCount}명${level ? `, ${level}` : ''}`
              return (
                <li key={row.schoolId} className="border-b border-schoollove-border last:border-b-0">
                  <Link
                    href={`/school/${row.slug}`}
                    aria-label={aria}
                    className="schoollove-focus group grid min-h-11 grid-cols-[2.25rem_minmax(0,1fr)] gap-3 px-4 py-5 sm:grid-cols-[2.5rem_minmax(0,1fr)]"
                  >
                    <span className="font-status pt-0.5 text-[17px] font-semibold tracking-[0.06em] text-schoollove-text">
                      {String(row.rank).padStart(2, '0')}
                    </span>
                    <span className="min-w-0">
                      <span className="block break-keep text-[16px] font-semibold leading-6 text-schoollove-school group-hover:underline">
                        {row.schoolName}
                      </span>
                      <span className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12px] leading-5">
                        <span className="font-status font-medium text-schoollove-number">{formatNumber(row.visibleProfileCount)}명</span>
                        {level && <span className="font-status font-medium text-schoollove-level">{level}</span>}
                        {row.remainingLabel && (
                          <span className="text-schoollove-secondary">
                            다음 성장 단계까지{' '}
                            <strong className="font-status font-medium text-schoollove-warning">
                              {row.remainingLabel.match(/\d+/)?.[0]}명
                            </strong>
                          </span>
                        )}
                        {row.isComplete && <span className="font-medium text-schoollove-growth">활발하게 이어지는 학교</span>}
                      </span>
                      <span className="mt-3 block h-[3px] overflow-hidden bg-schoollove-progress-track" aria-hidden="true">
                        <span className="block h-full bg-schoollove-school" style={{ width: `${row.progressPercent}%` }} />
                      </span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </section>
  )
}
