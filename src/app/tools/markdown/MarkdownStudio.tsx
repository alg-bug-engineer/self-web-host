'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import styles from './markdown-studio.module.css'

type PaperTheme = 'green' | 'blue' | 'ink'
type ViewMode = 'edit' | 'preview'

const STORAGE_KEY = 'cheese-ai-markdown-draft'

const SAMPLE_MARKDOWN = `# 把复杂的事，讲得清楚一点

> Markdown 是一种轻量级标记语言。你只需要专注内容，排版交给工具。

## 为什么使用 Markdown？

它让写作重新回到内容本身：

- **结构清晰**：标题、列表和引用一目了然
- **容易迁移**：同一份内容可以发布到不同平台
- **专注写作**：不必反复调整字号、间距和颜色

## 一个简单的工作流

1. 在左侧写下你的内容
2. 点击「一键格式化」整理源码
3. 选择喜欢的排版主题
4. 点击「复制排版」粘贴到目标编辑器

### 小提示

链接、表格、代码块和删除线也都支持。比如访问 [芝士AI吃鱼](https://ai-knowledgepoints.cn)，继续探索更多 AI 知识。

| 功能 | 状态 |
| --- | --- |
| 实时预览 | 已支持 |
| 富文本复制 | 已支持 |
| 本地自动保存 | 已支持 |

\`\`\`javascript
const idea = '先写清楚，再写漂亮。'
console.log(idea)
\`\`\`

---

愿每一次表达，都准确、克制，也有温度。`

const themeOptions: Array<{ id: PaperTheme; name: string; color: string }> = [
  { id: 'green', name: '清新绿', color: '#19a974' },
  { id: 'blue', name: '知识蓝', color: '#3973e6' },
  { id: 'ink', name: '经典墨', color: '#33343b' },
]

const toolbarItems = [
  { label: '标题', mark: 'H', prefix: '## ', suffix: '', block: true },
  { label: '粗体', mark: 'B', prefix: '**', suffix: '**' },
  { label: '引用', mark: '❞', prefix: '> ', suffix: '', block: true },
  { label: '无序列表', mark: '•', prefix: '- ', suffix: '', block: true },
  { label: '有序列表', mark: '1.', prefix: '1. ', suffix: '', block: true },
  { label: '行内代码', mark: '</>', prefix: '`', suffix: '`' },
  { label: '链接', mark: '↗', prefix: '[', suffix: '](https://)' },
]

function formatMarkdown(value: string) {
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

function getReadingStats(markdown: string) {
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

function cloneWithInlineStyles(source: HTMLElement) {
  const clone = source.cloneNode(true) as HTMLElement
  const sourceNodes = [source, ...Array.from(source.querySelectorAll<HTMLElement>('*'))]
  const cloneNodes = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>('*'))]
  const properties = [
    'background-color', 'border', 'border-color', 'border-radius', 'border-left',
    'color', 'display', 'font-family', 'font-size', 'font-style', 'font-weight',
    'letter-spacing', 'line-height', 'margin', 'margin-top', 'margin-bottom',
    'padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
    'text-align', 'text-decoration', 'white-space', 'word-break',
  ]

  sourceNodes.forEach((node, index) => {
    const target = cloneNodes[index]
    if (!target) return
    const computed = window.getComputedStyle(node)
    const inline = properties
      .map((property) => `${property}:${computed.getPropertyValue(property)}`)
      .join(';')
    target.setAttribute('style', inline)
    target.removeAttribute('class')
  })

  clone.removeAttribute('class')
  clone.removeAttribute('data-paper-theme')
  return clone
}

export default function MarkdownStudio() {
  const [markdown, setMarkdown] = useState(SAMPLE_MARKDOWN)
  const [paperTheme, setPaperTheme] = useState<PaperTheme>('green')
  const [viewMode, setViewMode] = useState<ViewMode>('edit')
  const [notice, setNotice] = useState('草稿会自动保存在本机')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const previewRef = useRef<HTMLElement>(null)
  const stats = useMemo(() => getReadingStats(markdown), [markdown])

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved) setMarkdown(saved)
  }, [])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, markdown)
  }, [markdown])

  const flash = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice('草稿会自动保存在本机'), 2200)
  }

  const applyFormat = () => {
    setMarkdown((current) => formatMarkdown(current))
    flash('格式已整理')
  }

  const insertMarkup = (prefix: string, suffix: string, block = false) => {
    const textarea = textareaRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selected = markdown.slice(start, end)
    const before = markdown.slice(0, start)
    const after = markdown.slice(end)
    const needsLineBreak = block && before.length > 0 && !before.endsWith('\n')
    const insertion = `${needsLineBreak ? '\n' : ''}${prefix}${selected}${suffix}`
    const next = before + insertion + after
    setMarkdown(next)
    window.requestAnimationFrame(() => {
      textarea.focus()
      const selectionStart = start + (needsLineBreak ? 1 : 0) + prefix.length
      textarea.setSelectionRange(selectionStart, selectionStart + selected.length)
    })
  }

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(markdown)
      flash('Markdown 源码已复制')
    } catch {
      flash('复制失败，请手动选择源码')
    }
  }

  const copyRichText = async () => {
    const preview = previewRef.current
    if (!preview) return
    const clone = cloneWithInlineStyles(preview)
    const html = clone.innerHTML
    const plain = preview.innerText

    try {
      if ('ClipboardItem' in window && navigator.clipboard.write) {
        const item = new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' }),
        })
        await navigator.clipboard.write([item])
      } else {
        const holder = document.createElement('div')
        holder.contentEditable = 'true'
        holder.style.position = 'fixed'
        holder.style.left = '-9999px'
        holder.appendChild(clone)
        document.body.appendChild(holder)
        const range = document.createRange()
        range.selectNodeContents(holder)
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(range)
        document.execCommand('copy')
        selection?.removeAllRanges()
        holder.remove()
      }
      flash('排版已复制，可以去粘贴了')
    } catch {
      try {
        await navigator.clipboard.writeText(plain)
        flash('已复制为纯文本')
      } catch {
        flash('复制失败，请在预览区手动复制')
      }
    }
  }

  const clearDraft = () => {
    if (!window.confirm('确定清空当前内容吗？这个操作无法撤销。')) return
    setMarkdown('')
    textareaRef.current?.focus()
    flash('内容已清空')
  }

  return (
    <div className={styles.pageShell}>
      <header className={styles.intro}>
        <div>
          <div className={styles.breadcrumb}>
            <Link href="/collections/tools">AI 工具</Link><span>/</span><span>Markdown 排版</span>
          </div>
          <h1>Markdown 排版工具</h1>
          <p>专注写作，排版交给这里。实时预览、一键整理，复制后即可粘贴到公众号、知识库或文档。</p>
        </div>
        <div className={styles.privacyNote}><span>✓</span> 内容仅保存在你的浏览器</div>
      </header>

      <section className={styles.workspace} aria-label="Markdown 编辑工作台">
        <div className={styles.topbar}>
          <div className={styles.mobileTabs} role="tablist" aria-label="编辑视图">
            <button type="button" role="tab" aria-selected={viewMode === 'edit'} onClick={() => setViewMode('edit')}>编辑</button>
            <button type="button" role="tab" aria-selected={viewMode === 'preview'} onClick={() => setViewMode('preview')}>预览</button>
          </div>
          <div className={styles.themePicker}>
            <span>排版主题</span>
            {themeOptions.map((theme) => (
              <button
                key={theme.id}
                type="button"
                className={paperTheme === theme.id ? styles.themeActive : ''}
                aria-pressed={paperTheme === theme.id}
                onClick={() => setPaperTheme(theme.id)}
              >
                <i style={{ background: theme.color }} />{theme.name}
              </button>
            ))}
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.secondaryButton} onClick={applyFormat}><span>✦</span> 一键格式化</button>
            <button type="button" className={styles.primaryButton} onClick={copyRichText}><span>▣</span> 复制排版</button>
          </div>
        </div>

        <div className={styles.columns}>
          <section className={`${styles.editorPanel} ${viewMode === 'preview' ? styles.mobileHidden : ''}`} aria-label="Markdown 编辑器">
            <div className={styles.panelHeader}>
              <div><span className={styles.statusDot} /> Markdown 源码</div>
              <div className={styles.headerActions}>
                <button type="button" onClick={copyMarkdown}>复制源码</button>
                <button type="button" onClick={clearDraft}>清空</button>
              </div>
            </div>
            <div className={styles.toolbar} aria-label="Markdown 快捷工具栏">
              {toolbarItems.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  title={item.label}
                  aria-label={item.label}
                  onClick={() => insertMarkup(item.prefix, item.suffix, item.block)}
                >
                  {item.mark}
                </button>
              ))}
            </div>
            <textarea
              ref={textareaRef}
              value={markdown}
              onChange={(event) => setMarkdown(event.target.value)}
              spellCheck={false}
              aria-label="输入 Markdown 内容"
              placeholder="# 从一个标题开始……"
            />
            <div className={styles.editorFooter}>
              <span>{stats.count} 字 · 约 {stats.minutes} 分钟阅读</span>
              <span aria-live="polite">{notice}</span>
            </div>
          </section>

          <section className={`${styles.previewPanel} ${viewMode === 'edit' ? styles.mobileHidden : ''}`} aria-label="排版预览">
            <div className={styles.panelHeader}>
              <div><span className={styles.previewIcon}>◉</span> 实时预览</div>
              <span>所见即所得</span>
            </div>
            <div className={styles.previewScroller}>
              {markdown.trim() ? (
                <article ref={previewRef} className={styles.paper} data-paper-theme={paperTheme}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
                </article>
              ) : (
                <div className={styles.emptyPreview}>
                  <span>⌁</span>
                  <strong>预览区还没有内容</strong>
                  <p>在编辑区写下第一句话，这里会实时呈现排版效果。</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </section>

      <footer className={styles.toolFooter}>
        <p><strong>不上传，不留痕。</strong> 所有内容只在当前设备中处理和保存。</p>
        <span>支持标准 Markdown · GitHub Flavored Markdown</span>
      </footer>
    </div>
  )
}
