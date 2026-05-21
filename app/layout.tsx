import type { Metadata } from 'next'
import './globals.css'
import Header from '@/components/Header'
import Providers from './providers'
import { getBaseMetadata } from '@/lib/seo'

export const metadata: Metadata = getBaseMetadata()

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <meta name="google-site-verification" content="rgKVxWEoGFuFJAys2vyK-QFtLbstnsDOGQj0mOkdkIo" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </head>
      <body>
        <Providers>
          <Header />
          <main>{children}</main>
          <footer className="mt-16 py-8 border-t border-gray-100 bg-white">
            <div className="max-w-content mx-auto px-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <p className="font-bold text-gray-900 text-sm">
                    I<span className="text-brand-blue">??/span>SCHOOL
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    ?„êµ­ ?™ì°½ ?¸ìŠ¤?€ê·¸ë¨ ê²€???Œë«??                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-400">
                  <a href="/privacy" className="hover:text-gray-600">ê°œì¸?•ë³´ì²˜ë¦¬ë°©ì¹¨</a>
                  <a href="/terms" className="hover:text-gray-600">?´ìš©?½ê?</a>
                  <a href="/about" className="hover:text-gray-600">?´ìš©?ˆë‚´</a>
                </div>
              </div>
              <p className="text-xs text-gray-300 mt-4">
                Â© 2025 SchoolLoveI. ê³µê°œ ?¸ìŠ¤?€ê·¸ë¨ ê³„ì •ë§??±ë¡ ê°€?¥í•©?ˆë‹¤.
              </p>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  )
}
