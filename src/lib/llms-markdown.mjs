const CUSTOM_LAYOUT_TAG = /^\s*<\/?(?:TwoColumnLayout|Left)>\s*$/
const RIGHT_LAYOUT_TAG = /^\s*<Right>\s*$/
const RIGHT_LAYOUT_CLOSE_TAG = /^\s*<\/Right>\s*$/
const INFO_CARD_OPEN = /^\s*<InfoCard\b([^>]*)>\s*$/
const INFO_CARD_CLOSE = /^\s*<\/InfoCard>\s*$/

const oneLine = (value) => String(value || '').replace(/\s+/g, ' ').trim()

export function cleanMdxForLlms(source, siteUrl) {
  const output = []
  let fence = null

  for (const line of String(source || '').replace(/\r\n?/g, '\n').split('\n')) {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/)
    if (fenceMatch) {
      const marker = fenceMatch[1][0]
      if (!fence) fence = marker
      else if (fence === marker) fence = null
      output.push(line)
      continue
    }
    if (fence) {
      output.push(line)
      continue
    }

    const infoCard = line.match(INFO_CARD_OPEN)
    if (infoCard) {
      const title = infoCard[1].match(/\btitle=["']([^"']+)["']/)?.[1]
      if (title) output.push(`### ${oneLine(title)}`)
      continue
    }
    if (INFO_CARD_CLOSE.test(line) || CUSTOM_LAYOUT_TAG.test(line) || RIGHT_LAYOUT_CLOSE_TAG.test(line)) {
      continue
    }
    if (RIGHT_LAYOUT_TAG.test(line)) {
      output.push('---')
      continue
    }
    output.push(line)
  }

  const origin = String(siteUrl || '').replace(/\/+$/, '')
  return output
    .join('\n')
    .replace(/(!?\[[^\]]*\])\(\/(?!\/)([^)]+)\)/g, `$1(${origin}/$2)`)
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function renderPostMarkdown(post, siteUrl) {
  const canonical = new URL(post.url, siteUrl).toString()
  const markdownUrl = `${canonical.replace(/\/+$/, '')}/index.html.md`
  const date = new Date(post.date)
  const publishedDate = Number.isNaN(date.getTime()) ? oneLine(post.date) : date.toISOString().slice(0, 10)
  const tags = Array.isArray(post.tags) ? post.tags.map(oneLine).filter(Boolean) : []
  const metadata = [
    `- 作者：${oneLine(post.author)}`,
    `- 发布日期：${publishedDate}`,
    tags.length ? `- 主题：${tags.join('、')}` : null,
    `- HTML 正文：[${canonical}](${canonical})`,
    `- Markdown 永久链接：[${markdownUrl}](${markdownUrl})`,
    post.sourceUrl ? `- 原始来源：[${oneLine(post.sourceName || post.sourceUrl)}](${post.sourceUrl})` : null,
  ].filter(Boolean)

  return `# ${oneLine(post.title)}

> ${oneLine(post.description)}

${metadata.join('\n')}

引用本文时，请注明作者与 HTML 正文链接。Markdown 版本用于机器阅读，与 HTML 正文共享同一内容来源。

## 正文

${cleanMdxForLlms(post.body?.raw, siteUrl)}
`
}
