import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '站内搜索',
  description: '搜索芝士AI吃鱼的 AI 技术文章与知识内容。',
  alternates: { canonical: '/search' },
  robots: { index: false, follow: true },
}

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return children
}
