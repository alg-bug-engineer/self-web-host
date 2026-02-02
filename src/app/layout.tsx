import type { Metadata } from 'next'
import './globals.css'
import GoogleAnalytics from '@/components/GoogleAnalytics'

import { ThemeProvider } from '@/components/providers/theme-provider'
import LayoutWrapper from '@/components/LayoutWrapper'

export const metadata: Metadata = {
  title: 'AI 知识点 | 芝士AI吃鱼 - 把 AI 天书，讲成人话',
  description: '左手画漫画，右手写代码。用爆笑漫画把 AI 天书讲成人话，提供 AI 效率工具助你提升工作效率。',
  keywords: ['AI', '人工智能', '漫画', 'Transformer', '大模型', 'LLM', '效率工具', '博客'],
  authors: [{ name: '芝士AI吃鱼' }],
  openGraph: {
    title: 'AI 知识点 | 芝士AI吃鱼',
    description: '把 AI 天书，讲成人话。',
    url: 'https://www.ai-knowledgepoints.cn',
    siteName: 'AI 知识点',
    locale: 'zh_CN',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen antialiased bg-bg-primary text-text-primary">
        <ThemeProvider>
          <GoogleAnalytics />
          <LayoutWrapper>
            {children}
          </LayoutWrapper>
        </ThemeProvider>
      </body>
    </html>
  )
}