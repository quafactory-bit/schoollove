import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    // App Router is stable in Next.js 15
  },
  images: {
    remotePatterns: [],
  },
}

export default nextConfig
