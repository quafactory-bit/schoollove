import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    // App Router is stable in Next.js 15
  },
  images: {
    remotePatterns: [],
  },
  async headers() {
    return [
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
