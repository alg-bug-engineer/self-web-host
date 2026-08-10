export type LlmPost = {
  title: string
  description: string
  date: string
  author: string
  tags?: string[]
  url: string
  sourceUrl?: string
  sourceName?: string
  body?: { raw?: string }
}

export function cleanMdxForLlms(source: string, siteUrl: string): string
export function renderPostMarkdown(post: LlmPost, siteUrl: string): string
