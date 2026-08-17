'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  analyzeMarkdown,
  cloneWithInlineStyles,
  createStandaloneHtml,
  formatMarkdown,
  getReadingStats,
} from '@/lib/wechat-markdown'
import styles from './markdown-studio.module.css'

type PaperTheme = 'editorial' | 'clear' | 'ink'
type ViewMode = 'edit' | 'preview'

const STORAGE_KEY = 'cheese-ai-wechat-markdown-draft-v2'

const SAMPLE_MARKDOWN = `# 把复杂的事，讲得清楚一点

> 好的排版不是装饰内容，而是帮读者更轻松地理解内容。

## 为什么专门为公众号排版？

微信编辑器会清理一部分 CSS。只依赖样式实现的代码换行，粘贴后可能挤成一行。这个工具会把换行和缩进写进 HTML 结构里：

- **真实换行**：代码行使用结构化换行，不依赖 \`white-space\`
- **保留缩进**：空格转换为不换行空格
- **所见即所得**：标题、引用、表格和行内代码保持统一层级

## 一段真实的代码

\`inline code\` 会显示为轻量标签，代码块则保留多行与缩进：

\`\`\`html
<article class="story">
  <h1>让内容先被看懂</h1>
  <p>再谈风格与表达。</p>
</article>
\`\`\`

## 发布前检查

| 检查项 | 处理方式 |
| --- | --- |
| 代码换行 | 固化为 HTML 结构 |
| 引用样式 | 无多余标签文字 |
| 草稿隐私 | 仅保存在当前浏览器 |

---

完成后点击「复制公众号排版」，直接粘贴到微信编辑器。`

const themeOptions: Array<{ id: PaperTheme; name: string; color: string }> = [
  { id: 'editorial', name: '深度蓝', color: '#1f5aa6' },
  { id: 'clear', name: '清爽青', color: '#248b8e' },
  { id: 'ink', name: '经典墨', color: '#323640' },
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

function downloadText(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export default function MarkdownStudio() {
  const [markdown, setMarkdown] = useState(SAMPLE_MARKDOWN)
  const [paperTheme, setPaperTheme] = useState<PaperTheme>('editorial')
  const [viewMode, setViewMode] = useState<ViewMode>('edit')
  const [notice, setNotice] = useState('草稿已在本机自动保存')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const previewRef = useRef<HTMLElement>(null)
  const noticeTimerRef = useRef<number | undefined>(undefined)
  const stats = useMemo(() => getReadingStats(markdown), [markdown])
  const diagnostics = useMemo(() => analyzeMarkdown(markdown), [markdown])

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved) setMarkdown(saved)
    return () => window.clearTimeout(noticeTimerRef.current)
  }, [])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, markdown)
  }, [markdown])

  const flash = (message: string) => {
    window.clearTimeout(noticeTimerRef.current)
    setNotice(message)
    noticeTimerRef.current = window.setTimeout(() => setNotice('草稿已在本机自动保存'), 2400)
  }

  const applyFormat = () => {
    setMarkdown((current) => formatMarkdown(current))
    flash('Markdown 已整理')
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
    setMarkdown(before + insertion + after)
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

  const getPortableArticle = () => {
    const preview = previewRef.current
    return preview ? cloneWithInlineStyles(preview) : null
  }

  const copyRichText = async () => {
    const preview = previewRef.current
    const clone = getPortableArticle()
    if (!preview || !clone) return
    const html = clone.outerHTML
    const plain = preview.innerText

    try {
      if ('ClipboardItem' in window && navigator.clipboard.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([plain], { type: 'text/plain' }),
          }),
        ])
      } else {
        const holder = document.createElement('div')
        holder.contentEditable = 'true'
        holder.style.cssText = 'position:fixed;left:-9999px;top:0;'
        holder.appendChild(clone)
        document.body.appendChild(holder)
        const range = document.createRange()
        range.selectNodeContents(holder)
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(range)
        const copied = document.execCommand('copy')
        selection?.removeAllRanges()
        holder.remove()
        if (!copied) throw new Error('copy failed')
      }
      flash(`排版已复制 · ${diagnostics.codeLines} 行代码已固化`)
    } catch {
      try {
        await navigator.clipboard.writeText(plain)
        flash('浏览器仅允许复制纯文本')
      } catch {
        flash('复制失败，请在预览区手动复制')
      }
    }
  }

  const exportHtml = () => {
    const clone = getPortableArticle()
    if (!clone) return
    const title = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() || '公众号文章'
    downloadText('公众号排版.html', createStandaloneHtml(clone.outerHTML, title), 'text/html;charset=utf-8')
    flash('兼容版 HTML 已导出')
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
            <Link href="/collections/tools">AI 工具</Link><span>/</span><span>公众号排版器</span>
          </div>
          <div className={styles.eyebrow}>WECHAT EDITORIAL STUDIO</div>
          <h1>微信公众号排版器</h1>
          <p>从 Markdown 到可直接粘贴的公众号富文本。代码换行写入 HTML 结构，经过微信编辑器清洗也不挤成一行。</p>
        </div>
        <div className={styles.privacyNote}><span>✓</span><div><strong>本地处理</strong><small>内容不会上传服务器</small></div></div>
      </header>

      <section className={styles.productPromise} aria-label="产品能力">
        <div><span>01</span><strong>结构化代码换行</strong><small>真实 BR 与缩进空格</small></div>
        <div><span>02</span><strong>公众号内联样式</strong><small>减少平台清洗影响</small></div>
        <div><span>03</span><strong>复制与 HTML 导出</strong><small>两种可靠交付方式</small></div>
      </section>

      <section className={styles.workspace} aria-label="微信公众号排版工作台">
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
            <button type="button" className={styles.secondaryButton} onClick={applyFormat}><span>✦</span> 整理 Markdown</button>
            <button type="button" className={styles.secondaryButton} onClick={exportHtml}><span>↓</span> 导出 HTML</button>
            <button type="button" className={styles.primaryButton} onClick={copyRichText}><span>▣</span> 复制公众号排版</button>
          </div>
        </div>

        <div className={styles.compatibilityBar}>
          <div><span className={styles.compatibilityDot} />微信兼容检查通过</div>
          <p>
            <span>{diagnostics.codeBlocks} 个代码块</span>
            <span>{diagnostics.codeLines} 行结构化换行</span>
            <span>{diagnostics.quotes} 条引用</span>
            <span>{diagnostics.tables} 个表格</span>
            {diagnostics.images > 0 && <span>{diagnostics.images} 张图片</span>}
          </p>
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

          <section className={`${styles.previewPanel} ${viewMode === 'edit' ? styles.mobileHidden : ''}`} aria-label="公众号排版预览">
            <div className={styles.panelHeader}>
              <div><span className={styles.previewIcon}>◉</span> 公众号预览</div>
              <span>375 px 阅读宽度</span>
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
        <span>支持 CommonMark · GitHub Flavored Markdown · 微信兼容 HTML</span>
      </footer>
    </div>
  )
}
