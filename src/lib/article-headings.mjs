import GithubSlugger from 'github-slugger'

const markdownText = (value) => String(value || '')
  .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/<[^>]+>/g, '')
  .replace(/[`*_~]/g, '')
  .replace(/\\([\\`*_[\]{}()#+.!-])/g, '$1')
  .replace(/\s+#+\s*$/, '')
  .replace(/\s+/g, ' ')
  .trim()

export function extractArticleHeadings(source) {
  const headings = []
  const slugger = new GithubSlugger()
  let fence = null

  for (const line of String(source || '').replace(/\r\n?/g, '\n').split('\n')) {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/)
    if (fenceMatch) {
      const marker = fenceMatch[1][0]
      if (!fence) fence = marker
      else if (fence === marker) fence = null
      continue
    }
    if (fence) continue

    const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*$/)
    if (!heading) continue
    const text = markdownText(heading[2])
    if (!text) continue
    const level = heading[1].length
    const id = slugger.slug(text)
    if (level === 2) headings.push({ id, text, level })
  }

  return headings
}
