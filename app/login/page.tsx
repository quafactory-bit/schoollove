import Link from 'next/link'
import { loadUserLoginBrokerConfig } from '@/lib/auth/social-broker/preview-config'
import SchoolSelection from '@/components/growth/SchoolSelection'
import SceneImage from '@/components/game/SceneImage'
import GameHeader from '@/components/game/GameHeader'

export const dynamic = 'force-dynamic'

/** Google is deliberately the sole visible user-login authority. */
export default function LoginPage() {
  const loginAvailable = loadUserLoginBrokerConfig() !== null
  return <main className="growth-journey sl-game sl-login mx-auto min-h-[calc(100vh-4rem)] max-w-3xl px-5 pb-8">
    <GameHeader />
    <section className="sl-login-card w-full" aria-labelledby="login-title">
      <SceneImage scene="login" className="sl-scene--login" sizes="(max-width: 767px) 100vw, 650px" priority />
      <div className="sl-login-content"><p className="text-xs font-semibold tracking-[0.14em] text-[var(--schoollove-game-accent)]">내 학교의 다음 장, 함께 시작해요</p>
      <h1 id="login-title" className="mt-3 text-3xl font-bold tracking-tight text-schoollove-text">{loginAvailable ? 'Google로 로그인' : '로그인 준비 중'}</h1>
      <p className="mt-3 text-sm leading-6 text-schoollove-secondary">{loginAvailable ? '친구의 인스타그램주소가 궁금하다면, Google로 시작해 보세요. 개인 기능은 만 19세 이상 본인만 사용할 수 있습니다. Google 로그인 뒤 필요한 경우에만 복구 이메일 확인을 진행합니다.' : '현재 일반 사용자 로그인을 안전하게 준비하고 있습니다.'}</p>
      <SchoolSelection />
      <p className="mt-4 text-sm leading-6 text-schoollove-secondary">로그인을 요청하면 계정 인증을 위해 Google 계정 식별값과 인증 결과를 확인하고, 해시 기반 식별자로 계정을 연결합니다. 이름·사진을 내 프로필로 자동 등록하지 않습니다. <Link href="/privacy#authentication" className="underline">로그인·복구 정보의 보유기간</Link>과 <Link href="/privacy#processors" className="underline">처리위탁·국외 이전 및 거부 방법</Link>을 먼저 확인해 주세요. 인증을 진행하지 않아도 공개 학교 정보는 볼 수 있습니다.</p>
      {loginAvailable
        ? <a href="/auth/social/start/google" className="schoollove-dark-action schoollove-focus mt-8 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-schoollove-text px-4 py-3 font-semibold text-white">Google로 계속하기</a>
        : <p role="status" className="mt-8 rounded-xl border border-schoollove-border bg-schoollove-surface px-4 py-3 text-sm text-schoollove-secondary">로그인은 아직 열리지 않았습니다.</p>}
      <p className="mt-8 text-xs leading-5 text-schoollove-secondary">자기진술 방식은 신분증 기반 본인확인이 아닙니다. <Link href="/privacy" className="underline">개인정보처리방침</Link>과 <Link href="/terms" className="underline">이용약관</Link>을 확인해 주세요.</p>
      </div>
    </section>
  </main>
}
