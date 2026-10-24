import type { NextConfig } from 'next'

// v2-10: 새 도메인(운영자 확정 chulseokbu.kr)으로 옮길 준비. NEXT_PUBLIC_SITE_DOMAIN이 비어 있으면 아무 일도 하지 않는다.
// 도메인 구매·Vercel 연결·OAuth/Supabase 콜백 추가가 끝난 뒤 운영자가 값을 넣으면 옛 도메인(schoollove.kr,
// www.schoollove.kr)의 모든 경로가 같은 경로의 새 도메인으로 301 이동한다. preview.schoollove.kr 등 다른 하위 도메인은 그대로.
// 옛 도메인은 최소 1년 유지한다(해지 금지).
export const LEGACY_SITE_HOSTS = ['schoollove.kr', 'www.schoollove.kr']

export function legacyDomainRedirects(newDomain = process.env.NEXT_PUBLIC_SITE_DOMAIN?.trim() ?? '') {
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(newDomain) || LEGACY_SITE_HOSTS.includes(newDomain)) return []
  return LEGACY_SITE_HOSTS.map(host => ({
    source: '/:path*',
    has: [{ type: 'host' as const, value: host }],
    destination: `https://${newDomain}/:path*`,
    permanent: true,
  }))
}

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
      ...legacyDomainRedirects(),
      { source: '/promote', destination: '/', permanent: false },
      { source: '/promote/:path*', destination: '/', permanent: false },
      { source: '/invite', destination: '/', permanent: false },
      { source: '/submit', destination: '/', permanent: false },
      { source: '/feedback', destination: '/contact', permanent: false },
      // v2-06: 정확한 이름 검색은 출석부 이름 필터로, 연결 화면은 알림 탭으로 합쳤다.
      { source: '/people/search', destination: '/account', permanent: false },
      { source: '/connections', destination: '/notifications', permanent: false },
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
