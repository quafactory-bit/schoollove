import Link from 'next/link'
import { loadUserLoginBrokerConfig } from '@/lib/auth/social-broker/preview-config'

export const dynamic = 'force-dynamic'

/** Google is deliberately the sole visible user-login authority. */
export default function LoginPage() {
  const loginAvailable = loadUserLoginBrokerConfig() !== null
  return <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center px-5 py-10 sm:py-14">
    <section className="w-full" aria-labelledby="login-title">
      <p className="schoollove-hud-label text-[12px] tracking-[0.14em]">ADULT PRIVATE ACCOUNT</p>
      <h1 id="login-title" className="mt-3 text-3xl font-bold tracking-tight text-schoollove-text">{loginAvailable ? 'Google로 로그인' : '로그인 준비 중'}</h1>
      <p className="mt-3 text-sm leading-6 text-schoollove-secondary">{loginAvailable ? '개인 기능은 만 19세 이상 본인만 사용할 수 있습니다. Google 로그인 뒤 필요한 경우에만 복구 이메일 확인을 진행합니다.' : '현재 일반 사용자 로그인을 안전하게 준비하고 있습니다.'}</p>
      {loginAvailable
        ? <a href="/auth/social/start/google" className="schoollove-dark-action schoollove-focus mt-8 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-schoollove-text px-4 py-3 font-semibold text-white">Google로 계속하기</a>
        : <p role="status" className="mt-8 rounded-xl border border-schoollove-border bg-schoollove-surface px-4 py-3 text-sm text-schoollove-secondary">로그인은 아직 열리지 않았습니다.</p>}
      <p className="mt-8 text-xs leading-5 text-schoollove-secondary">자기진술 방식은 신분증 기반 본인확인이 아닙니다. <Link href="/privacy" className="underline">개인정보처리방침</Link>과 <Link href="/terms" className="underline">이용약관</Link>을 확인해 주세요.</p>
    </section>
  </main>
}
