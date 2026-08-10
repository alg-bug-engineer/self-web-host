import type { Metadata } from 'next'
import './globals.css'
import GoogleAnalytics from '@/components/GoogleAnalytics'
import InternalAnalytics from '@/components/InternalAnalytics'
import SiteStructuredData from '@/components/SiteStructuredData'
import { BRAND_NAME, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/site'

import { ThemeProvider } from '@/components/providers/theme-provider'
import LayoutWrapper from '@/components/LayoutWrapper'

// 移除 next/font/google，避免构建时由于无法访问 Google Fonts 导致的超时报错
// 采用系统默认的等宽字体集
const monoFontFamily = '"JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} | ${BRAND_NAME} - 把 AI 天书，讲成人话`,
    template: `%s | ${BRAND_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: ['AI', '人工智能', '漫画', 'Transformer', '大模型', 'LLM', 'NLP', 'RAG', 'AI Agent', '效率工具'],
  authors: [{ name: BRAND_NAME, url: `${SITE_URL}/about` }],
  creator: BRAND_NAME,
  publisher: BRAND_NAME,
  alternates: {
    canonical: '/',
    types: { 'application/rss+xml': `${SITE_URL}/feed.xml` },
  },
  robots: { index: true, follow: true },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
    other: process.env.NEXT_PUBLIC_BAIDU_SITE_VERIFICATION
      ? { 'baidu-site-verification': process.env.NEXT_PUBLIC_BAIDU_SITE_VERIFICATION }
      : undefined,
  },
  openGraph: {
    title: `${SITE_NAME} | ${BRAND_NAME}`,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: SITE_NAME,
    locale: 'zh_CN',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} | ${BRAND_NAME}`,
    description: SITE_DESCRIPTION,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body 
        className="min-h-screen antialiased bg-bg-primary text-text-primary"
        style={{ '--font-jetbrains-mono': monoFontFamily } as React.CSSProperties}
      >
        <ThemeProvider>
          <GoogleAnalytics />
          <InternalAnalytics />
          <SiteStructuredData />
          <LayoutWrapper>
            {children}
          </LayoutWrapper>
        </ThemeProvider>
      </body>
    </html>
  )
}
