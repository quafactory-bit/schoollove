import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Google 로그인',
  description: '만 19세 이상 본인용 비공개 계정에 Google 계정으로 로그인합니다.',
  robots: { index: false, follow: false, nocache: true, noarchive: true },
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
