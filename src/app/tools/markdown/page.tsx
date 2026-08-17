import type { Metadata } from 'next'
import MarkdownStudio from './MarkdownStudio'

export const metadata: Metadata = {
  title: '微信公众号排版器',
  description: '面向微信公众号的 Markdown 排版器：结构化保留代码换行与缩进，一键复制富文本或导出兼容 HTML。',
  alternates: { canonical: '/tools/markdown' },
  openGraph: {
    title: '微信公众号排版器 | 芝士AI吃鱼',
    description: '代码不再挤成一行。写 Markdown，复制微信兼容富文本。',
    url: '/tools/markdown',
    images: [{ url: '/images/tools/wechat-markdown-formatter-og.png', width: 1200, height: 630, alt: '从 Markdown 到公众号排版' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '微信公众号排版器 | 芝士AI吃鱼',
    description: '代码不再挤成一行。写 Markdown，复制微信兼容富文本。',
    images: ['/images/tools/wechat-markdown-formatter-og.png'],
  },
}

export default function MarkdownToolPage() {
  return <MarkdownStudio />
}
