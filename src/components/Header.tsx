'use client'

import { ThemeToggle } from './ThemeToggle'
import Link from 'next/link'

interface HeaderProps {
    setIsMobileMenuOpen: (isOpen: boolean) => void;
}

export default function Header({ setIsMobileMenuOpen }: HeaderProps) {
    return (
        <header className="lg:hidden sticky top-0 z-40 border-b border-border-default bg-bg-primary/90 backdrop-blur">
            <div className="flex items-center justify-between h-14 px-4">
                <button
                    onClick={() => setIsMobileMenuOpen(true)}
                    className="p-2 rounded-md hover:bg-bg-tertiary"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                </button>
                <Link href="/" className="flex items-center gap-2">
                    <div className="flex items-center">
                        <span className="text-2xl">🐱</span>
                        <span className="text-2xl">🤖</span>
                    </div>
                    <span className="text-sm font-semibold">芝士AI吃鱼</span>
                </Link>
                <ThemeToggle />
            </div>
        </header>
    )
}
