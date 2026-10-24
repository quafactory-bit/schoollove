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
      {/* v2-05: 설명 2줄만. 자세한 처리 내용은 개인정보처리방침으로, 자기진술 고지는 가입 화면 생년월일 칸으로 옮겼다. */}
      <p className="mt-2 text-[15px] leading-[1.5] text-sl-ink2">{loginAvailable ? <>친구의 인스타그램 주소가 궁금하다면 Google로 시작해요.<br />만 19세 이상만 쓸 수 있어요.</> : '현재 일반 사용자 로그인을 안전하게 준비하고 있습니다.'}</p>
      <SchoolSelection />
      {loginAvailable
        ? <a href="/auth/social/start/google" className="schoollove-dark-action schoollove-focus mt-6 inline-flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-[14px] bg-schoollove-text px-4 py-3 text-base font-extrabold text-white"><b aria-hidden="true" className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full bg-white font-[Arial,sans-serif] text-[13px] font-black text-[#4285f4]">G</b>Google로 계속하기</a>
        : <p role="status" className="mt-6 rounded-[14px] bg-sl-bg2 px-4 py-3 text-sm text-sl-ink2">로그인은 아직 열리지 않았습니다.</p>}
      <p className="mt-4 text-[12.5px] leading-[1.6] text-sl-ink3">로그인하면 Google 계정 식별값과 인증 결과를 계정 연결에만 써요. 이름·사진은 자동으로 등록하지 않아요. 새 계정은 처음 한 번 복구 이메일 확인을 거쳐요. 자세한 내용은 <Link href="/privacy#authentication" className="underline">개인정보처리방침</Link>에 있어요.</p>
    </section>
  </main>
}
