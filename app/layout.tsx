import type { Metadata, Viewport } from 'next'
import './globals.css'
import './game.css'
import './scenes.css'
import './fantasy.css'
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
    default: '스쿨러브아이 - 기억 속 친구의 인스타그램주소 찾기',
    template: '%s | 스쿨러브아이',
  },
  description: '학교와 이름으로 친구를 찾고, 연결 후 상대가 허용한 인스타그램주소를 확인하세요.',
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
