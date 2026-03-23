'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ThemeToggle } from './ThemeToggle'
import IconDiscover from './icons/IconDiscover'
import IconBrowse from './icons/IconBrowse'
import IconPortfolio from './icons/IconPortfolio'
import IconAbout from './icons/IconAbout'
import IconChat from './icons/IconChat'
import IconLab from './icons/IconLab' // Keep for now if needed elsewhere, but remove from nav

const mainNav = [
    { label: '发现', href: '/', icon: <IconDiscover className="w-4 h-4" /> },
    { label: '浏览', href: '/search', icon: <IconBrowse className="w-4 h-4" /> },
    { label: 'AI助手', href: '/chat', icon: <IconChat className="w-4 h-4" /> },
];

const collectionNav = [
    { label: '技术专栏', href: '/blog', icon: '📝' },
    { label: 'AI 工具箱', href: '/collections/tools', icon: '🔧' },
];

const createNav = [
    { label: '我的产品', href: '/portfolio', icon: <IconPortfolio className="w-4 h-4" /> },
    { label: '知识星球', href: '/planet', icon: '🪐' },
];

export default function Sidebar() {
    const pathname = usePathname()

    const isActive = (path: string) => {
        if (path === '/') return pathname === '/'
        if (path === '/blog') return pathname.startsWith('/blog') || pathname.startsWith('/collections/articles')
        return pathname.startsWith(path)
    }

    return (
        <aside className="hidden lg:flex flex-col border-r border-border-default bg-bg-secondary/70 backdrop-blur sticky top-0 h-screen">
            <div className="h-16 flex items-center px-5">
                <Link href="/" className="flex items-center gap-2 hover:opacity-80">
                    <div className="flex items-center">
                        <span className="text-2xl">🐱</span>
                        <span className="text-2xl">🤖</span>
                    </div>
                    <span className="text-lg font-semibold">芝士AI吃鱼</span>
                </Link>
            </div>

            <nav className="flex-1 min-h-0 px-3 pb-6 overflow-y-auto">
                <div className="space-y-6">
                    <div>
                        <p className="text-xs uppercase tracking-widest text-text-tertiary px-3 mb-2">内容</p>
                        <div className="space-y-1">
                            {mainNav.map((item) => (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`nav-item ${isActive(item.href) ? 'nav-item-active' : ''}`}
                                >
                                    <span className="nav-icon">{item.icon}</span>
                                    {item.label}
                                </Link>
                            ))}
                        </div>
                    </div>
                    
                    <div>
                        <p className="text-xs uppercase tracking-widest text-text-tertiary px-3 mb-2">合集</p>
                        <div className="space-y-1">
                            {collectionNav.map((item) => (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`nav-item ${isActive(item.href) ? 'nav-item-active' : ''}`}
                                >
                                    <span className="nav-icon">{item.icon}</span>
                                    {item.label}
                                </Link>
                            ))}
                        </div>
                    </div>

                    <div>
                        <p className="text-xs uppercase tracking-widest text-text-tertiary px-3 mb-2">创造与变现</p>
                        <div className="space-y-1">
                            {createNav.map((item) => (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`nav-item ${isActive(item.href) ? 'nav-item-active' : ''}`}
                                >
                                    <span className="nav-icon">{item.icon}</span>
                                    {item.label}
                                </Link>
                            ))}
                        </div>
                    </div>

                    <div>
                        <p className="text-xs uppercase tracking-widest text-text-tertiary px-3 mb-2">个人</p>
                        <div className="space-y-1">
                            <Link
                                href="/about"
                                className={`nav-item ${isActive('/about') ? 'nav-item-active' : ''}`}
                            >
                                <span className="nav-icon">
                                    <IconAbout className="w-4 h-4" />
                                </span>
                                关于我
                            </Link>
                        </div>
                    </div>
                </div>
            </nav>

            <div className="border-t border-border-default px-4 py-4 flex items-center justify-between">
                <ThemeToggle />
            </div>
        </aside>
    )
}
