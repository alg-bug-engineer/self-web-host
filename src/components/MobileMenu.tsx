'use client'

import Link from 'next/link'
import { ThemeToggle } from './ThemeToggle'
import IconDiscover from './icons/IconDiscover'
import IconBrowse from './icons/IconBrowse'
import IconAbout from './icons/IconAbout'
import IconPortfolio from './icons/IconPortfolio'
import IconChat from './icons/IconChat'

interface MobileMenuProps {
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
}

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

export default function MobileMenu({ isOpen, setIsOpen }: MobileMenuProps) {
    if (!isOpen) return null;

    return (
        <div className="lg:hidden fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/50" onClick={() => setIsOpen(false)}></div>
            <aside className="absolute left-0 top-0 h-full w-72 bg-bg-secondary border-r border-border-default p-4 flex flex-col">
                <div className="flex items-center justify-between mb-4">
                    <Link href="/" className="flex items-center gap-2" onClick={() => setIsOpen(false)}>
                        <div className="flex items-center">
                            <span className="text-2xl">🐱</span>
                            <span className="text-2xl">🤖</span>
                        </div>
                        <span className="text-base font-semibold">芝士AI吃鱼</span>
                    </Link>
                    <button onClick={() => setIsOpen(false)} className="p-2 rounded-md hover:bg-bg-tertiary">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="space-y-4 overflow-y-auto">
                    <div>
                        <p className="text-xs uppercase tracking-widest text-text-tertiary px-2 mb-2">内容</p>
                        <div className="space-y-1">
                            {mainNav.map((item) => (
                                <Link key={item.href} href={item.href} className="nav-item" onClick={() => setIsOpen(false)}>
                                    <span className="nav-icon">{item.icon}</span>
                                    {item.label}
                                </Link>
                            ))}
                        </div>
                    </div>
                    <div>
                        <p className="text-xs uppercase tracking-widest text-text-tertiary px-2 mb-2">合集</p>
                        <div className="space-y-1">
                            {collectionNav.map((item) => (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className="nav-item"
                                    onClick={() => setIsOpen(false)}
                                >
                                    <span className="nav-icon">{item.icon}</span>
                                    {item.label}
                                </Link>
                            ))}
                        </div>
                    </div>
                    <div>
                        <p className="text-xs uppercase tracking-widest text-text-tertiary px-2 mb-2">创造与变现</p>
                        <div className="space-y-1">
                            {createNav.map((item) => (
                                <Link key={item.href} href={item.href} className="nav-item" onClick={() => setIsOpen(false)}>
                                    <span className="nav-icon">{item.icon}</span>
                                    {item.label}
                                </Link>
                            ))}
                        </div>
                    </div>
                    <div>
                        <p className="text-xs uppercase tracking-widest text-text-tertiary px-2 mb-2">个人</p>
                         <div className="space-y-1">
                            <Link href="/about" className="nav-item" onClick={() => setIsOpen(false)}>
                                <span className="nav-icon"><IconAbout className="w-4 h-4" /></span>
                                关于我
                            </Link>
                        </div>
                    </div>
                </div>
                <div className="mt-auto pt-4 border-t border-border-default flex items-center justify-between">
                    <ThemeToggle />
                </div>
            </aside>
        </div>
    )
}
