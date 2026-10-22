import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    // App Router is stable in Next.js 15
  },
  images: {
    remotePatterns: [],
  },
  // v2-07: 화면에서 내린 사용자 라우트. 페이지 파일은 v1 복구를 위해 그대로 두고 요청만 돌려보낸다.
  async redirects() {
    return [
      { source: '/promote', destination: '/', permanent: false },
      { source: '/promote/:path*', destination: '/', permanent: false },
      { source: '/invite', destination: '/', permanent: false },
      { source: '/submit', destination: '/', permanent: false },
      { source: '/feedback', destination: '/contact', permanent: false },
    ]
  },
  async headers() {
    const previewHeaders = process.env.VERCEL_ENV === 'preview' ? [{
      source: '/:path*',
      headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }],
    }] : []
    return [
      ...previewHeaders,
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
    ]
  },
}

export default nextConfig
