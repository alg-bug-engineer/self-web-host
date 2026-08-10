'use client'

import Link from 'next/link'
import { ThemeToggle } from './ThemeToggle'

interface HeaderProps {
  setIsMobileMenuOpen: (isOpen: boolean) => void
}

const navItems = [
  { label: '文章', href: '/blog' },
  { label: '著作与作品', href: '/portfolio' },
  { label: 'AI 漫画', href: 'https://manga.ai-knowledgepoints.cn' },
  { label: '关于', href: '/about' },
]

export default function Header({ setIsMobileMenuOpen }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-border-default bg-bg-primary/88 backdrop-blur-xl">
      <div className="mx-auto flex h-[4.5rem] max-w-[1360px] items-center justify-between gap-5 px-4 sm:px-6 lg:px-10">
        <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="芝士AI吃鱼首页">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-text-primary text-lg" aria-hidden="true">🐟</span>
          <span className="min-w-0">
            <span className="block truncate text-base font-semibold tracking-tight text-text-primary">芝士AI吃鱼</span>
            <span className="hidden text-[10px] uppercase tracking-[0.22em] text-text-tertiary sm:block">AI, explained clearly</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-7 lg:flex" aria-label="主导航">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="text-sm text-text-secondary transition-colors hover:text-text-primary">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1 sm:gap-2">
          <Link href="/search" className="hidden rounded-full border border-border-default px-4 py-2 text-sm text-text-secondary transition-colors hover:border-text-tertiary hover:text-text-primary sm:inline-flex">
            搜索 <span className="ml-2 text-text-tertiary">⌕</span>
          </Link>
          <ThemeToggle />
          <button onClick={() => setIsMobileMenuOpen(true)} className="rounded-full p-2 text-text-primary hover:bg-bg-tertiary lg:hidden" aria-label="打开菜单">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  )
}
