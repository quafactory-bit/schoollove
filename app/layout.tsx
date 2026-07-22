import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import Footer from '@/components/Footer';
import TabBar from '@/components/TabBar';
const geist = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' });
export const viewport: Viewport = {
  themeColor: '#FFFFFF',
  width: 'device-width',
  initialScale: 1,
};
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://www.schoollove.kr'),
  title: {
    default: '스쿨러브아이 - 학교 인스타 동창 찾기',
    template: '%s | 스쿨러브아이',
  },
  description: '전국 초중고 대학교 동창들의 인스타그램을 한눈에 찾아보세요',
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
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={geist.variable}>
      <head>
        {/* 한글용 Pretendard (영문은 Geist 유지) */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
        <style
          dangerouslySetInnerHTML={{
            __html: `body{font-family:'Pretendard Variable',Pretendard,var(--font-geist),-apple-system,BlinkMacSystemFont,system-ui,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;letter-spacing:-0.018em;}`,
          }}
        />
      </head>
      <body className="antialiased">
        <Providers>
          {/* 하단 탭바에 콘텐츠가 가리지 않게 여백 확보 */}
          <div className="pb-16">
            {children}
            <Footer />
          </div>
          <TabBar />
        </Providers>
      </body>
    </html>
  );
}
