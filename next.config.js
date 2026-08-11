const { withContentlayer } = require('next-contentlayer2')
const contentRedirects = require('./ops/content-redirects.json')

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  allowedDevOrigins: [
    'https://ai-knowledgepoints.cn',
    'https://www.ai-knowledgepoints.cn',
    'http://ai-knowledgepoints.cn',
    'http://www.ai-knowledgepoints.cn',
  ],
  output: 'standalone',
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'github.com',
      },
      {
        protocol: 'https',
        hostname: 'github.githubassets.com',
      },
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'mmbiz.qpic.cn',
      },
      {
        protocol: 'https',
        hostname: 'mmbiz.qlogo.cn',
      },
    ],
  },
  async redirects() {
    return contentRedirects.redirects.map(({ source, destination, permanent }) => ({
      source,
      destination,
      permanent,
    }))
  },
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
      ],
    }]
  },
}

module.exports = withContentlayer(nextConfig)
