'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'

interface MobileMenuProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
}

const navItems = [
  { label: '首页', href: '/' },
  { label: '文章', href: '/blog' },
  { label: '著作与作品', href: '/portfolio' },
  { label: 'AI 漫画', href: 'https://manga.ai-knowledgepoints.cn' },
  { label: 'AI 工具', href: '/collections/tools' },
  { label: '知识星球', href: '/planet' },
  { label: '关于我', href: '/about' },
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
        <nav className="mt-6 flex flex-col" aria-label="移动端导航">
          {navItems.map((item, index) => (
            <Link key={item.href} href={item.href} onClick={() => setIsOpen(false)} className="flex items-center justify-between border-b border-border-default py-4 text-lg text-text-primary">
              <span>{item.label}</span><span className="text-sm text-text-tertiary">0{index + 1}</span>
            </Link>
          ))}
        </nav>
        <Link href="/search" onClick={() => setIsOpen(false)} className="mt-auto rounded-full bg-text-primary px-5 py-3 text-center text-sm font-medium text-bg-primary">搜索网站内容</Link>
      </aside>
    </div>
  )
}
