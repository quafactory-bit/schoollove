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
    <section className="mt-12 border-t border-schoollove-border pt-7 lg:mt-16 lg:pt-9" aria-labelledby="current-rank-title">
      <p className="text-[12px] tracking-[0.14em] text-schoollove-hud-red sm:text-[13px]">CURRENT RANK</p>
      <h2 id="current-rank-title" className="mt-2 text-[26px] tracking-[-0.01em] text-schoollove-text lg:text-[32px]">
        현재 학교 순위
      </h2>
      <p className="mt-1 text-[13px] leading-5 text-schoollove-secondary">
        지금까지 등록된 공개 프로필을 기준으로 집계했어요
      </p>

      <div className="mt-6 border border-schoollove-border bg-schoollove-surface">
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
                    className="schoollove-focus group grid min-h-11 grid-cols-[3rem_minmax(0,1fr)] gap-4 border-l-4 border-l-schoollove-electric-blue/70 px-4 py-5 sm:grid-cols-[3.5rem_minmax(0,1fr)] lg:grid-cols-[4.5rem_minmax(0,1fr)_minmax(220px,0.55fr)] lg:items-center lg:gap-6 lg:px-7 lg:py-7"
                  >
                    <span className="pt-0.5 text-[22px] leading-none tracking-normal text-schoollove-text lg:text-[30px]">
                      {String(row.rank).padStart(2, '0')}
                    </span>
                    <span className="min-w-0">
                      <span className="block break-keep text-[17px] leading-6 text-schoollove-text group-hover:underline lg:text-[21px] lg:leading-7">
                        {row.schoolName}
                      </span>
                      <span className="mt-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1.5 text-[13px] leading-5 lg:text-[14px]">
                        <span className="text-schoollove-number">{formatNumber(row.visibleProfileCount)}명</span>
                        {level && <span className="rounded-sm bg-schoollove-level/10 px-1.5 py-0.5 text-schoollove-text">{level}</span>}
                        {row.remainingLabel && (
                          <span className="text-schoollove-secondary">
                            다음 성장 단계까지{' '}
                            <strong className="rounded-sm bg-schoollove-neon-lime px-1 py-0.5 text-schoollove-text">
                              {row.remainingLabel.match(/\d+/)?.[0]}명
                            </strong>
                          </span>
                        )}
                        {row.isComplete && <span className="rounded-sm bg-schoollove-neon-mint px-1 py-0.5 text-schoollove-text">활발</span>}
                      </span>
                      <span className="mt-3 flex items-center justify-between gap-3 text-[11px] text-schoollove-secondary lg:hidden">
                        <span>PROGRESS</span>
                        <span className="text-schoollove-text">{Math.round(row.progressPercent)}%</span>
                      </span>
                      <span className="mt-2 block h-[5px] overflow-hidden bg-schoollove-progress-track lg:hidden" aria-hidden="true">
                        <span className="block h-full bg-schoollove-electric-blue" style={{ width: `${row.progressPercent}%` }} />
                      </span>
                    </span>
                    <span className="hidden min-w-0 lg:block">
                      <span className="mb-2 flex items-center justify-between gap-3 text-[12px] text-schoollove-secondary">
                        <span>PROGRESS</span>
                        <span className="text-schoollove-text">{Math.round(row.progressPercent)}%</span>
                      </span>
                      <span className="block h-[7px] overflow-hidden bg-schoollove-progress-track" aria-hidden="true">
                        <span className="block h-full bg-schoollove-electric-blue" style={{ width: `${row.progressPercent}%` }} />
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
