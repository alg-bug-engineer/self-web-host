'use client'

import { useEffect, useState } from 'react'
import type { ArticleHeading } from '@/lib/article-headings.mjs'

export default function ArticleReadingGuide({ headings }: { headings: ArticleHeading[] }) {
  const [activeId, setActiveId] = useState(headings[0]?.id || '')
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const content = document.querySelector<HTMLElement>('[data-article-content]')
    if (!content) return

    const updateProgress = () => {
      const top = content.getBoundingClientRect().top + window.scrollY
      const distance = Math.max(1, content.offsetHeight - window.innerHeight)
      const next = Math.min(100, Math.max(0, ((window.scrollY - top) / distance) * 100))
      setProgress(Math.round(next * 10) / 10)
    }
    updateProgress()
    window.addEventListener('scroll', updateProgress, { passive: true })
    window.addEventListener('resize', updateProgress)

    const elements = headings
      .map((heading) => document.getElementById(heading.id))
      .filter((element): element is HTMLElement => Boolean(element))
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top)[0]
      if (visible?.target.id) setActiveId(visible.target.id)
    }, { rootMargin: '-18% 0px -72% 0px' })
    elements.forEach((element) => observer.observe(element))

    return () => {
      window.removeEventListener('scroll', updateProgress)
      window.removeEventListener('resize', updateProgress)
      observer.disconnect()
    }
  }, [headings])

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-1 bg-transparent" aria-hidden="true">
        <div
          data-testid="article-reading-progress"
          className="h-full bg-accent-primary transition-[width] duration-150 motion-reduce:transition-none"
          style={{ width: `${progress}%` }}
        />
      </div>
      {headings.length >= 2 && (
        <nav aria-label="本文目录" className="mb-10 rounded-2xl border border-border-default bg-bg-secondary p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-tertiary">READING GUIDE</p>
              <h2 className="mt-1 text-lg font-semibold text-text-primary">本文目录</h2>
            </div>
            <span className="text-xs text-text-tertiary">{headings.length} 个章节</span>
          </div>
          <ol className="mt-4 grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {headings.map((heading, index) => (
              <li key={heading.id}>
                <a
                  href={`#${heading.id}`}
                  aria-current={activeId === heading.id ? 'location' : undefined}
                  className={`group flex min-h-10 items-start gap-3 rounded-lg px-2 py-2 text-sm leading-6 transition-colors ${
                    activeId === heading.id
                      ? 'bg-accent-primary/10 text-accent-primary'
                      : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
                  }`}
                >
                  <span className="mt-0.5 shrink-0 font-mono text-xs text-text-tertiary">{String(index + 1).padStart(2, '0')}</span>
                  <span>{heading.text}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}
    </>
  )
}
