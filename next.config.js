const { withContentlayer } = require('next-contentlayer2')

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: [
    'https://ai-knowledgepoints.cn',
    'https://www.ai-knowledgepoints.cn',
    'http://ai-knowledgepoints.cn',
    'http://www.ai-knowledgepoints.cn',
  ],
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
}

module.exports = withContentlayer(nextConfig)
