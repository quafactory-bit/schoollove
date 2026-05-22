import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: '스쿨러브아이 - 학교 동창 인스타 찾기',
  description: '전국 초/중/고/대학교 동창들의 인스타그램을 연결해보세요',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang='ko'>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}