'use client'

import { useState } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import MobileMenu from '@/components/MobileMenu'

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

    return (
        <div className="flex min-h-screen flex-col">
            <Header setIsMobileMenuOpen={setIsMobileMenuOpen} />
            <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 sm:px-6 lg:px-10">
                {children}
            </main>
            <Footer />
            <MobileMenu isOpen={isMobileMenuOpen} setIsOpen={setIsMobileMenuOpen} />
        </div>
    )
}
