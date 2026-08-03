import type {Metadata} from 'next'
import Link from 'next/link'
import {ShieldCheck} from 'lucide-react'
import {getPublicRouteRobots} from '@/lib/policy/privacySafety'
import {getPublicAccountLaunchState} from '@/lib/publicAccountLaunch'

export const dynamic='force-dynamic'
export const metadata:Metadata={title:'성인 비공개 계정 안내',description:'본인 정보만 관리하는 성인 비공개 계정 시작 절차를 안내합니다.',robots:getPublicRouteRobots('submit')}

export default async function SubmitPage(){
  const launch=await getPublicAccountLaunchState()
  const open=launch.registrationEnabled
  return <main className="mx-auto flex min-h-[70vh] w-full max-w-xl items-center px-5 py-12"><section className="w-full border border-schoollove-border bg-schoollove-surface p-6 sm:p-8" aria-labelledby="account-start-title"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-schoollove-surface-subtle"><ShieldCheck className="h-6 w-6 text-schoollove-text" aria-hidden="true"/></div><p className="schoollove-hud-label mt-6 text-[12px] tracking-[0.14em]">ADULT PRIVATE ACCOUNT</p><h1 id="account-start-title" className="mt-3 break-keep text-2xl font-bold leading-snug text-schoollove-text sm:text-3xl">본인 정보만 비공개로 관리합니다</h1><p className="mt-4 break-keep text-sm leading-6 text-schoollove-secondary">legacy 타인 정보 등록은 영구 종료했습니다. 새 계정은 이메일 로그인, KST 기준 만 19세 이상 자기진술, 필수 동의 4개 뒤 본인용 비공개 프로필과 과거 학교 이력을 관리하는 방식입니다.</p><div className="mt-6 space-y-2 border-y border-schoollove-border py-5 text-sm leading-6 text-schoollove-text"><p>공개 개인 명단과 사람 이름 검색은 제공하지 않습니다.</p><p>Instagram은 저장해도 다른 사람이나 공개 학교 화면에 노출되지 않습니다.</p><p>학교 이력은 실제 학교 검색 결과를 선택해 본인 이력만 최대 3개까지 저장합니다.</p></div><p className={`mt-5 rounded-xl px-4 py-3 text-sm ${open?'bg-emerald-50 text-emerald-900':'bg-amber-50 text-amber-900'}`} role="status">{open?'현재 성인 비공개 계정을 시작할 수 있습니다.':'현재 계정 소프트런치를 준비 중입니다. 신규 계정 생성은 아직 열리지 않았습니다.'}</p><div className="mt-6 flex flex-wrap gap-3">{open?<Link href="/login?next=/onboarding" className="schoollove-dark-action schoollove-focus inline-flex min-h-11 items-center bg-schoollove-text px-5 text-sm text-white">이메일로 시작하기</Link>:null}<Link href="/search" className="schoollove-focus inline-flex min-h-11 items-center border border-schoollove-border px-5 text-sm text-schoollove-text">학교 검색</Link><Link href="/contact" className="schoollove-focus inline-flex min-h-11 items-center border border-schoollove-border px-5 text-sm text-schoollove-text">운영자 문의</Link></div></section></main>
}
