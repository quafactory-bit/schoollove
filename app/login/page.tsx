import Link from 'next/link'
import { loadUserLoginBrokerConfig } from '@/lib/auth/social-broker/preview-config'
import SchoolSelection from '@/components/account/SchoolSelection'
import PageNav from '@/components/PageNav'
import BrandMark from '@/components/BrandMark'

export const dynamic = 'force-dynamic'

/** Google is deliberately the sole visible user-login authority. */
export default function LoginPage() {
  const loginAvailable = loadUserLoginBrokerConfig() !== null
  return <main className="sl-login mx-auto min-h-[calc(100vh-4rem)] max-w-content bg-white pb-8">
    <PageNav title="시작하기" />
    <section className="w-full px-4 pt-2" aria-labelledby="login-title">
      <BrandMark size={30} />
      <h1 id="login-title" className="mt-5 text-[28px] font-black leading-[1.15] tracking-[-0.6px] text-sl-ink">{loginAvailable ? 'Google로 로그인' : '로그인 준비 중'}</h1>
      <p className="mt-2 text-[15px] leading-[1.5] text-sl-ink2">{loginAvailable ? '같은 학교·같은 기수 출석부를 보려면 Google로 시작해 주세요. 개인 기능은 만 19세 이상 본인만 사용할 수 있습니다. Google 로그인 뒤 필요한 경우에만 복구 이메일 확인을 진행합니다.' : '현재 일반 사용자 로그인을 안전하게 준비하고 있습니다.'}</p>
      <SchoolSelection />
      {loginAvailable
        ? <a href="/auth/social/start/google" className="schoollove-dark-action schoollove-focus mt-6 inline-flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-[14px] bg-schoollove-text px-4 py-3 text-base font-extrabold text-white"><span aria-hidden="true" className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full bg-white font-[Arial,sans-serif] text-[13px] font-black text-[#4285f4]">G</span>Google로 계속하기</a>
        : <p role="status" className="mt-6 rounded-[14px] bg-sl-bg2 px-4 py-3 text-sm text-sl-ink2">로그인은 아직 열리지 않았습니다.</p>}
      <p className="mt-4 text-[12.5px] leading-[1.6] text-sl-ink3">로그인을 요청하면 계정 인증을 위해 Google 계정 식별값과 인증 결과를 확인하고, 해시 기반 식별자로 계정을 연결합니다. 이름·사진을 내 프로필로 자동 등록하지 않습니다. <Link href="/privacy#authentication" className="underline">로그인·복구 정보의 보유기간</Link>과 <Link href="/privacy#processors" className="underline">처리위탁·국외 이전 및 거부 방법</Link>을 먼저 확인해 주세요. 인증을 진행하지 않아도 공개 학교 정보는 볼 수 있습니다.</p>
      <p className="mt-4 text-xs leading-5 text-sl-ink3">자기진술 방식은 신분증 기반 본인확인이 아닙니다. <Link href="/privacy" className="underline">개인정보처리방침</Link>과 <Link href="/terms" className="underline">이용약관</Link>을 확인해 주세요.</p>
    </section>
  </main>
}
