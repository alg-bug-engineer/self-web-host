const { withContentlayer } = require('next-contentlayer2')

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
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
}

module.exports = withContentlayer(nextConfig)
