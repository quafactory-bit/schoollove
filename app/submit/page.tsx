import type {Metadata} from 'next'
import Link from 'next/link'
import {ShieldCheck} from 'lucide-react'
import {getPublicRouteRobots} from '@/lib/policy/privacySafety'
import {getPublicAccountLaunchState} from '@/lib/publicAccountLaunch'

export const dynamic='force-dynamic'
export const metadata:Metadata={title:'성인 학교 계정 안내',description:'내 학교를 등록하고 같은 학교 사람을 찾는 성인 계정 시작 절차를 안내합니다.',robots:getPublicRouteRobots('submit')}

export default async function SubmitPage(){
  const launch=await getPublicAccountLaunchState()
  const open=launch.registrationEnabled
  return <main className="mx-auto flex min-h-[70vh] w-full max-w-xl items-center px-5 py-12"><section className="w-full border border-schoollove-border bg-schoollove-surface p-6 sm:p-8" aria-labelledby="account-start-title"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-schoollove-surface-subtle"><ShieldCheck className="h-6 w-6 text-schoollove-text" aria-hidden="true"/></div><p className="schoollove-hud-label mt-6 text-[12px] tracking-[0.14em]">ADULT SCHOOL ACCOUNT</p><h1 id="account-start-title" className="mt-3 break-keep text-2xl font-bold leading-snug text-schoollove-text sm:text-3xl">내 학교와 기억나는 사람을 찾아보세요</h1><p className="mt-4 break-keep text-sm leading-6 text-schoollove-secondary">타인의 정보는 등록할 수 없습니다. 새 계정은 Google 로그인, KST 기준 만 19세 이상 자기진술, 필수 동의 4개 뒤 본인의 전체 이름과 과거 학교 이력을 등록합니다.</p><div className="mt-6 space-y-2 border-y border-schoollove-border py-5 text-sm leading-6 text-schoollove-text"><p>학교 명단 표시는 기본으로 선택되며 등록 전에 해제할 수 있습니다.</p><p>표시를 유지하면 같은 학교 명단 참여자끼리 전체 이름·졸업연도·저장한 반을 확인할 수 있습니다.</p><p>인스타그램주소는 연결 후 내가 직접 허용한 상대에게만 표시됩니다.</p></div><p className={`mt-5 rounded-xl px-4 py-3 text-sm ${open?'bg-emerald-50 text-emerald-900':'bg-amber-50 text-amber-900'}`} role="status">{open?'현재 성인 계정을 시작할 수 있습니다.':'현재 계정 소프트런치를 준비 중입니다. 신규 계정 생성은 아직 열리지 않았습니다.'}</p><div className="mt-6 flex flex-wrap gap-3">{open?<Link href="/login?next=/onboarding" className="schoollove-dark-action schoollove-focus inline-flex min-h-11 items-center bg-schoollove-text px-5 text-sm text-white">Google로 시작하기</Link>:null}<Link href="/search" className="schoollove-focus inline-flex min-h-11 items-center border border-schoollove-border px-5 text-sm text-schoollove-text">학교 검색</Link><Link href="/contact" className="schoollove-focus inline-flex min-h-11 items-center border border-schoollove-border px-5 text-sm text-schoollove-text">운영자 문의</Link></div></section></main>
}
