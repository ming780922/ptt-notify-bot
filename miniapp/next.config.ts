import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: false,
  images: { unoptimized: true },

  // During `next dev`, proxy /api/* through the Next.js server to avoid CORS.
  // API_PROXY_TARGET is only set in .env.local — not read in production builds.
  // `output: 'export'` ignores rewrites at build time; this only affects dev.
  async rewrites() {
    const target = process.env.API_PROXY_TARGET
    if (!target) return []
    return [
      { source: '/api/:path*', destination: `${target}/api/:path*` },
    ]
  },
}

export default nextConfig
