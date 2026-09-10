import type { Metadata, Viewport } from 'next'
import './globals.css'
import './game.css'
import { Providers } from './providers'
import { ConnectionNotificationProvider } from '@/components/ConnectionNotificationProvider'
import DesktopNav from '@/components/DesktopNav'
import Footer from '@/components/Footer'
import TabBar from '@/components/TabBar'
import PrivacySafeAnalytics from '@/components/PrivacySafeAnalytics'

export const viewport: Viewport = {
  themeColor: '#FFFFFF',
  width: 'device-width',
  initialScale: 1,
}

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://www.schoollove.kr'),
  title: {
    default: '스쿨러브아이 - 우리 학교, 함께 키우기',
    template: '%s | 스쿨러브아이',
  },
  description: '우리 학교는 지금 몇 레벨일까? 학교를 찾고, 비공개로 내 학교를 기록하고, 친구와 함께 학교를 키워요.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '스쿨러브아이',
  },
  formatDetection: { telephone: false },
  verification: {
    other: {
      'naver-site-verification': [
        '73076bec23ea237533a3dcee3e0e9a27c743e249',
        '8f7bff53dc148b7cd36104080a3bcac3e5fde0e1',
      ],
    },
  },
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/icon-192.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head />
      <body className="antialiased">
        <Providers>
          <ConnectionNotificationProvider>
            <DesktopNav />
            <div className="pb-16">
              {children}
              <Footer />
            </div>
            <TabBar />
          </ConnectionNotificationProvider>
        </Providers>
        <PrivacySafeAnalytics />
      </body>
    </html>
  )
}
