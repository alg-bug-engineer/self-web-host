import type { Metadata } from 'next'
import MarkdownStudio from './MarkdownStudio'

export const metadata: Metadata = {
  title: 'Markdown 排版工具',
  description: '在线编写、格式化并预览 Markdown，一键复制富文本到公众号、知识库或文档编辑器。',
  alternates: { canonical: '/tools/markdown' },
  openGraph: {
    title: 'Markdown 排版工具 | 芝士AI吃鱼',
    description: '在线编写、实时预览、一键格式化并复制 Markdown 富文本。',
    url: '/tools/markdown',
  },
}

export default function MarkdownToolPage() {
  return <MarkdownStudio />
}
