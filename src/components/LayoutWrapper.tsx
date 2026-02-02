'use client'

import { useState } from 'react'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import MobileMenu from '@/components/MobileMenu'

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

    return (
        <div className="min-h-screen lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
            <Sidebar />
            <div className="flex min-h-screen flex-col">
                <Header setIsMobileMenuOpen={setIsMobileMenuOpen} />
                <main className="flex-1 px-4 lg:px-6 py-4">
                    {children}
                </main>
                <Footer />
            </div>
            <MobileMenu isOpen={isMobileMenuOpen} setIsOpen={setIsMobileMenuOpen} />
        </div>
    )
}
