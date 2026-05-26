import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { cn } from '@/lib/utils';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
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
    <html lang="ko" className={cn('font-sans', geist.variable)}>
      <body className={geist.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}