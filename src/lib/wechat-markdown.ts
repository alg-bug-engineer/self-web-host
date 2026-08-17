export type MarkdownDiagnostics = {
  codeBlocks: number
  codeLines: number
  quotes: number
  tables: number
  images: number
}

export function formatMarkdown(value: string) {
  const source = value.replace(/\r\n?/g, '\n').replace(/\t/g, '  ')
  const lines = source.split('\n')
  let inFence = false

  const normalized = lines.map((rawLine) => {
    const line = rawLine.replace(/[ \t]+$/g, '')
    if (/^\s*```/.test(line)) {
      inFence = !inFence
      return line.trimStart()
    }
    if (inFence) return line
    if (!line.trim()) return ''

    const indent = line.match(/^\s*/)?.[0] ?? ''
    const content = line.trimStart()
      .replace(/^(#{1,6})\s*/, '$1 ')
      .replace(/^>\s*/, '> ')
      .replace(/^[-*+]\s+/, '- ')
      .replace(/^(\d+)[.)]\s+/, '$1. ')

    return `${indent}${content}`
  })

  const compacted: string[] = []
  for (const line of normalized) {
    if (line === '' && compacted.at(-1) === '') continue
    compacted.push(line)
  }

  return compacted.join('\n').trim().concat('\n')
}

export function getReadingStats(markdown: string) {
  const plain = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!?(\[[^\]]*\])\([^)]*\)/g, '$1')
    .replace(/[#>*_~|\-]/g, ' ')
  const chinese = plain.match(/[\u3400-\u9fff]/g)?.length ?? 0
  const words = plain.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length ?? 0
  const count = chinese + words
  return { count, minutes: Math.max(1, Math.ceil(count / 300)) }
}

export function analyzeMarkdown(markdown: string): MarkdownDiagnostics {
  const fencedBlocks = Array.from(markdown.matchAll(/```[^\n]*\n([\s\S]*?)```/g))
  return {
    codeBlocks: fencedBlocks.length,
    codeLines: fencedBlocks.reduce((total, match) => {
      const content = (match[1] ?? '').replace(/\n$/, '')
      return total + (content ? content.split('\n').length : 0)
    }, 0),
    quotes: markdown.match(/^>\s?.+$/gm)?.length ?? 0,
    tables: markdown.match(/^\|(?:[^\n|]+\|){2,}$/gm)?.length ? 1 : 0,
    images: markdown.match(/!\[[^\]]*\]\([^)]*\)/g)?.length ?? 0,
  }
}

export function normalizeCodeText(value: string) {
  const normalized = value.replace(/\r\n?/g, '\n').replace(/\t/g, '    ')
  return normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized
}

/**
 * Turn CSS-dependent code layout into structural HTML. WeChat may discard
 * white-space rules, but it preserves BR elements and non-breaking spaces.
 */
export function materializeCodeBlocks(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('pre').forEach((pre) => {
    const code = pre.querySelector<HTMLElement>('code') ?? pre
    const lines = normalizeCodeText(code.textContent ?? '').split('\n')
    code.replaceChildren()
    code.style.display = 'block'
    code.style.whiteSpace = 'normal'
    code.style.wordBreak = 'normal'

    const lineBox = document.createElement('span')
    lineBox.style.display = 'block'
    lineBox.style.minWidth = 'max-content'
    lineBox.style.whiteSpace = 'normal'

    lines.forEach((line, index) => {
      lineBox.appendChild(document.createTextNode(line.replace(/ /g, '\u00a0') || '\u00a0'))
      if (index < lines.length - 1) lineBox.appendChild(document.createElement('br'))
    })
    code.appendChild(lineBox)
  })
}

const INLINE_STYLE_PROPERTIES = [
  'background-color', 'border', 'border-color', 'border-radius', 'border-left',
  'border-collapse', 'box-sizing', 'color', 'display', 'font-family', 'font-size',
  'font-style', 'font-weight', 'height', 'letter-spacing', 'line-height', 'margin',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'max-width',
  'overflow', 'overflow-x', 'padding', 'padding-top', 'padding-right',
  'padding-bottom', 'padding-left', 'text-align', 'text-decoration',
  'vertical-align', 'white-space', 'width', 'word-break',
] as const

export function cloneWithInlineStyles(source: HTMLElement) {
  const clone = source.cloneNode(true) as HTMLElement
  const sourceNodes = [source, ...Array.from(source.querySelectorAll<HTMLElement>('*'))]
  const cloneNodes = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>('*'))]

  sourceNodes.forEach((node, index) => {
    const target = cloneNodes[index]
    if (!target) return
    const computed = window.getComputedStyle(node)
    target.setAttribute(
      'style',
      INLINE_STYLE_PROPERTIES
        .map((property) => `${property}:${computed.getPropertyValue(property)}`)
        .join(';'),
    )
    target.removeAttribute('class')
    Array.from(target.attributes).forEach((attribute) => {
      if (attribute.name.startsWith('data-')) target.removeAttribute(attribute.name)
    })
  })

  materializeCodeBlocks(clone)
  return clone
}

export function createStandaloneHtml(articleHtml: string, title = '公众号文章') {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title.replace(/[<>&"]/g, '')}</title>
</head>
<body style="margin:0;padding:24px 12px;background:#f5f7fa;">
  <main style="max-width:680px;margin:0 auto;background:#ffffff;">${articleHtml}</main>
</body>
</html>`
}
