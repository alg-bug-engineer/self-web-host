'use client'

import Link from 'next/link'

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
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button className="absolute inset-0 bg-black/45" onClick={() => setIsOpen(false)} aria-label="关闭菜单" />
      <aside className="absolute right-0 top-0 flex h-full w-[min(88vw,360px)] flex-col border-l border-border-default bg-bg-primary p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-border-default pb-5">
          <Link href="/" className="font-semibold text-text-primary" onClick={() => setIsOpen(false)}>芝士AI吃鱼</Link>
          <button onClick={() => setIsOpen(false)} className="rounded-full p-2 hover:bg-bg-tertiary" aria-label="关闭菜单">
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
