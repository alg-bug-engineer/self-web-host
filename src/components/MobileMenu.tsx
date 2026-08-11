'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'

interface MobileMenuProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
}

const navGroups = [
  {
    label: '探索内容',
    items: [
      { label: '全部文章', note: '原理、实践与观察', href: '/blog' },
      { label: 'AI 工具', note: '可直接使用的工具', href: '/collections/tools' },
      { label: 'AI 漫画', note: '用图像理解概念', href: 'https://manga.ai-knowledgepoints.cn' },
    ],
  },
  {
    label: '关于作者',
    items: [
      { label: '著作与作品', note: '书、产品与项目', href: '/portfolio' },
      { label: '知识星球', note: '持续交流与讨论', href: '/planet' },
      { label: '关于我', note: '经历与公开成果', href: '/about' },
    ],
  },
]

export default function MobileMenu({ isOpen, setIsOpen }: MobileMenuProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isOpen) return

    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus())
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setIsOpen(false)
        return
      }

      if (event.key !== 'Tab' || !dialogRef.current) return

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute('disabled'))

      if (focusable.length === 0) {
        event.preventDefault()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus()
    }
  }, [isOpen, setIsOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button type="button" tabIndex={-1} className="absolute inset-0 bg-black/45" onClick={() => setIsOpen(false)} aria-label="关闭菜单" />
      <aside
        ref={dialogRef}
        id="mobile-navigation-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="网站导航"
        className="absolute right-0 top-0 flex h-full w-[min(88vw,360px)] flex-col border-l border-border-default bg-bg-primary p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border-default pb-5">
          <Link href="/" className="font-semibold text-text-primary" onClick={() => setIsOpen(false)}>芝士AI吃鱼</Link>
          <button ref={closeButtonRef} type="button" onClick={() => setIsOpen(false)} className="rounded-full p-2 hover:bg-bg-tertiary" aria-label="关闭菜单">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth="1.8" d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
        <nav className="mt-6 flex flex-col gap-3" aria-label="移动端导航">
          <Link href="/" onClick={() => setIsOpen(false)} className="rounded-xl border border-border-default bg-bg-secondary px-4 py-3 text-base font-medium text-text-primary">首页</Link>
          {navGroups.map((group) => (
            <details key={group.label} open className="mobile-nav-accordion group rounded-xl border border-border-default bg-bg-secondary">
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-text-primary">
                {group.label}
                <svg className="h-4 w-4 text-text-tertiary transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="m6 9 6 6 6-6" /></svg>
              </summary>
              <div className="border-t border-border-muted px-2 py-2">
                {group.items.map((item) => (
                  <Link key={item.href} href={item.href} onClick={() => setIsOpen(false)} className="flex items-center justify-between rounded-lg px-3 py-3 transition-colors hover:bg-bg-tertiary">
                    <span>
                      <strong className="block text-sm font-medium text-text-primary">{item.label}</strong>
                      <small className="mt-1 block text-xs text-text-tertiary">{item.note}</small>
                    </span>
                    <span className="text-accent-primary">→</span>
                  </Link>
                ))}
              </div>
            </details>
          ))}
        </nav>
        <Link href="/search" onClick={() => setIsOpen(false)} className="mt-auto rounded-full bg-text-primary px-5 py-3 text-center text-sm font-medium text-bg-primary">搜索网站内容</Link>
      </aside>
    </div>
  )
}
