import Avatar from '@/components/Avatar'
import { NEW_MEMBER_STRIP_LIMIT, type RosterEntry } from '@/lib/policy/roster'

// v2-06: 출석부 위 "이번 주 새로 들어온 동문" 띠(목업 4번). 0명이면 띠 대신 친구 부르기 버튼만.
export default function NewMembersStrip({ members, year, onShowAll, onInvite }: {
  members: RosterEntry[]
  year: number
  onShowAll?: () => void
  onInvite?: () => void
}) {
  if (members.length === 0) {
    return <button type="button" onClick={onInvite} className="btn-secondary schoollove-focus mt-3 w-full text-[15px]">친구 부르기 — {year}년 링크 복사</button>
  }
  return (
    <section aria-label="새로 들어온 동문" className="mt-3 rounded-2xl bg-sl-brand-soft px-3.5 py-3">
      <p className="flex items-center justify-between text-[13px] font-extrabold text-sl-brand-text">
        <span>이번 주 새로 들어온 동문 {members.length}명</span>
        <button type="button" onClick={onShowAll} className="schoollove-focus text-xs font-bold opacity-75">전체 보기 ›</button>
      </p>
      <ul className="mt-2.5 flex gap-3">
        {members.slice(0, NEW_MEMBER_STRIP_LIMIT).map(member => (
          <li key={`${member.graduation_year}|${member.display_name}`} className="flex w-14 flex-col items-center gap-1 text-xs font-bold text-sl-ink">
            <span className="relative"><Avatar name={member.display_name} size={48} highlighted /><b aria-hidden="true" className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-sl-brand text-[9px] text-white">N</b></span>
            <span className="max-w-full truncate">{member.display_name}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
