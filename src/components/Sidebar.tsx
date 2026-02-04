'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ThemeToggle } from './ThemeToggle'
import IconDiscover from './icons/IconDiscover'
import IconBrowse from './icons/IconBrowse'
import IconPortfolio from './icons/IconPortfolio'
import IconLab from './icons/IconLab'
import IconAbout from './icons/IconAbout'
import IconChat from './icons/IconChat'
const collections = [
    { label: '文章', value: 'articles', icon: '📝', href: '/blog' },
    { label: '工具', value: 'tools', icon: '🔧', href: '/collections/tools' },
];

export default function Sidebar() {
    const pathname = usePathname()

    const isActive = (path: string) => {
        if (path === '/') return pathname === '/'
        if (path === '/blog') return pathname.startsWith('/blog') || pathname.startsWith('/collections/articles')
        return pathname.startsWith(path)
    }

    const isCollectionActive = (href: string) => {
        return pathname.startsWith(href);
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
                            <Link
                                href="/"
                                className={`nav-item ${isActive('/') ? 'nav-item-active' : ''}`}
                            >
                                <span className="nav-icon">
                                    <IconDiscover className="w-4 h-4" />
                                </span>
                                发现
                            </Link>
                            <Link
                                href="/search"
                                className={`nav-item ${isActive('/search') ? 'nav-item-active' : ''}`}
                            >
                                <span className="nav-icon">
                                    <IconBrowse className="w-4 h-4" />
                                </span>
                                浏览
                            </Link>
                            <Link
                                href="/chat"
                                className={`nav-item ${isActive('/chat') ? 'nav-item-active' : ''}`}
                            >
                                <span className="nav-icon">
                                    <IconChat className="w-4 h-4" />
                                </span>
                                AI助手
                            </Link>
                        </div>
                    </div>
                    
                    <div>
                        <p className="text-xs uppercase tracking-widest text-text-tertiary px-3 mb-2">合集</p>
                        <div className="space-y-1">
                            {collections.map((collection) => (
                                <Link
                                    key={collection.value}
                                    href={collection.href}
                                    className={`nav-item ${isCollectionActive(collection.href) ? 'nav-item-active' : ''}`}
                                >
                                    <span className="nav-icon">
                                        {collection.icon}
                                    </span>
                                    {collection.label}
                                </Link>
                            ))}
                        </div>
                    </div>

                    <div>
                        <p className="text-xs uppercase tracking-widest text-text-tertiary px-3 mb-2">创造</p>
                        <div className="space-y-1">
                            <Link
                                href="/portfolio"
                                className={`nav-item ${isActive('/portfolio') ? 'nav-item-active' : ''}`}
                            >
                                <span className="nav-icon">
                                    <IconPortfolio className="w-4 h-4" />
                                </span>
                                作品集
                            </Link>
                            <Link
                                href="/lab"
                                className={`nav-item ${isActive('/lab') ? 'nav-item-active' : ''}`}
                            >
                                <span className="nav-icon">
                                    <IconLab className="w-4 h-4" />
                                </span>
                                实验室
                            </Link>
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
                {/* Auth buttons can be added here later */}
            </div>
        </aside>
    )
}
