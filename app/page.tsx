import Link from 'next/link'
import { Search,ShieldCheck,UserRound } from 'lucide-react'
import { getPublicAccountLaunchState,recordPublicAccountEvent } from '@/lib/publicAccountLaunch'

export const dynamic='force-dynamic'

const stateCopy={
  closed:{label:'계정 소프트런치 준비 중',description:'학교 검색은 지금 사용할 수 있습니다. 신규 성인 계정 시작은 안전 검증과 별도 승인 뒤에 엽니다.',cta:false},
  internal_test:{label:'내부 안전 검증 중',description:'승인된 합성 테스트 계정으로만 흐름을 검증하고 있습니다. 일반 신규 가입은 열리지 않았습니다.',cta:false},
  ready:{label:'공개 전 최종 준비',description:'기능 준비는 마쳤지만 별도 공개 승인 전까지 신규 계정 생성은 닫혀 있습니다.',cta:false},
  open:{label:'성인 비공개 계정 시작',description:'만 19세 이상 본인은 이메일 인증 뒤 자기 정보만 비공개로 기록할 수 있습니다.',cta:true},
  emergency_stopped:{label:'계정 기능 안전 점검 중',description:'긴급 안전 점검으로 계정 생성과 정보 변경을 잠시 중단했습니다. 학교 검색은 계속 사용할 수 있습니다.',cta:false},
} as const

export default async function HomePage(){
  const launch=await getPublicAccountLaunchState()
  await recordPublicAccountEvent('public_home_view','direct')
  const copy=stateCopy[launch.state]
  return <main className="mx-auto w-full max-w-[1180px] overflow-x-clip px-5 pb-16 sm:px-6 lg:px-8">
    <header className="pt-7 lg:pt-12"><div className="flex items-start justify-between gap-4"><div><Link href="/" className="schoollove-focus inline-flex min-h-11 items-center text-[18px] font-semibold tracking-tight text-schoollove-text">스쿨러브아이</Link><p className="mt-1 text-[13px] text-schoollove-secondary">학교 정보와 본인용 비공개 계정</p></div><Link href="/account" className="schoollove-focus hidden min-h-11 items-center border border-schoollove-border px-4 text-[14px] text-schoollove-text lg:inline-flex">내 계정</Link></div>
      <div className="mt-12 max-w-3xl lg:mt-20"><p className="schoollove-hud-label text-[12px] tracking-[0.14em] sm:text-[13px]">PRIVACY BY DEFAULT</p><h1 className="mt-4 break-keep text-[36px] font-bold leading-[1.22] tracking-[-0.02em] text-schoollove-text sm:text-[44px] lg:text-[56px]">학교는 찾고,<br/>개인 정보는 비공개로.</h1><p className="mt-6 max-w-2xl break-keep text-[15px] leading-7 text-schoollove-secondary sm:text-[17px]">학교 기본 정보 검색은 그대로 제공합니다. 공개 개인 명단·사람 이름 검색·Instagram 노출 없이, 성인 본인이 자기 정보만 관리하는 구조를 준비했습니다.</p><div className="mt-8 flex flex-wrap gap-3"><Link href="/search" className="schoollove-dark-action schoollove-focus inline-flex min-h-12 items-center gap-2 bg-schoollove-text px-6 text-[15px] text-white"><Search className="h-4 w-4" aria-hidden="true"/>학교 검색하기</Link>{copy.cta?<Link href="/login?next=/onboarding" className="schoollove-focus inline-flex min-h-12 items-center gap-2 border border-schoollove-border px-6 text-[15px] text-schoollove-text"><UserRound className="h-4 w-4" aria-hidden="true"/>성인 계정 시작</Link>:null}</div></div>
    </header>
    <section className="mt-14 grid gap-4 border-t border-schoollove-border pt-8 sm:grid-cols-3 lg:mt-20 lg:pt-10" aria-label="현재 서비스 상태">{[
      ['학교 검색','이용 가능'],['개인 정보','본인 전용 비공개'],['계정 상태',copy.label],
    ].map(([label,value])=><div key={label} className="border border-schoollove-border bg-schoollove-surface p-5"><ShieldCheck className="h-5 w-5 text-schoollove-text" aria-hidden="true"/><p className="mt-4 text-xs text-schoollove-secondary">{label}</p><p className="mt-1 break-keep text-lg font-semibold text-schoollove-text">{value}</p></div>)}</section>
    <section className="mt-10 border border-schoollove-border bg-schoollove-surface-subtle p-6" aria-labelledby="launch-status"><h2 id="launch-status" className="text-lg font-semibold text-schoollove-text">{copy.label}</h2><p className="mt-2 text-sm leading-6 text-schoollove-secondary">{copy.description}</p>{!copy.cta?<Link href="/submit" className="schoollove-focus mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-schoollove-text underline underline-offset-4">계정 시작 안내 보기</Link>:null}</section>
    <section className="mt-6 border border-schoollove-border bg-schoollove-surface p-6"><h2 className="text-lg font-semibold text-schoollove-text">본인 정보 처리나 삭제에 도움이 필요하신가요?</h2><p className="mt-2 text-sm leading-6 text-schoollove-secondary">개인정보처리방침을 확인하거나 운영자에게 문의해 주세요. 기존 등록자를 조회·연락·전환·재사용하지 않습니다.</p><div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold"><Link href="/privacy" className="schoollove-focus min-h-11 underline underline-offset-4">개인정보처리방침</Link><Link href="/contact" className="schoollove-focus min-h-11 underline underline-offset-4">운영자 문의</Link></div></section>
  </main>
}
