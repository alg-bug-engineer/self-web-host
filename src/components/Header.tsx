'use client'

import Link from 'next/link'
import { ThemeToggle } from './ThemeToggle'

interface HeaderProps {
  setIsMobileMenuOpen: (isOpen: boolean) => void
}

const navItems = [
  { label: '文章', href: '/blog' },
  { label: '著作与作品', href: '/portfolio' },
  { label: 'AI 工具', href: '/collections/tools' },
  { label: 'AI 漫画', href: 'https://manga.ai-knowledgepoints.cn' },
  { label: '关于', href: '/about' },
]

export default function Header({ setIsMobileMenuOpen }: HeaderProps) {
  return (
    <header className="site-header">
      <div className="header-announcement">
        <span className="announcement-pulse" />
        <span>新内容</span>
        <Link href="/blog">AI 原理、Agent 实践与行业观察持续更新中 <b>→</b></Link>
      </div>
      <div className="header-main">
        <Link href="/" className="brand-lockup" aria-label="芝士AI吃鱼首页">
          <span className="brand-mark" aria-hidden="true"><i>AI</i></span>
          <span>
            <strong>芝士AI吃鱼</strong>
            <small>AI, EXPLAINED CLEARLY</small>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="主导航">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="nav-link">{item.label}</Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/search" className="header-search hidden sm:inline-flex">搜索内容 <span>⌕</span></Link>
          <Link href="/blog" className="header-cta hidden md:inline-flex">进入知识库 <span>↗</span></Link>
          <button onClick={() => setIsMobileMenuOpen(true)} className="mobile-menu-button lg:hidden" aria-label="打开菜单">
            <span /><span />
          </button>
        </div>
      </div>
    </header>
  )
}
