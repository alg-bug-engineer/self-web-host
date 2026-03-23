'use client'

import Link from 'next/link'

interface PlanetBannerProps {
    title?: string;
    description?: string;
    planetUrl?: string;
    planetQrCode?: string;
}

export default function PlanetBanner({ 
    title = "解锁更多硬核 AI 实战技巧", 
    description = "加入知识星球，获取本文配套源码、深度技术文档及 1对1 技术答疑。",
    planetUrl = "/planet",
    planetQrCode
}: PlanetBannerProps) {
    return (
        <div className="relative overflow-hidden bg-gradient-to-br from-accent-tertiary to-accent-primary rounded-3xl p-8 text-white shadow-xl">
            <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
                <div className="space-y-4 text-center md:text-left">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-sm text-xs font-bold uppercase tracking-wider">
                        🪐 Member Exclusive
                    </div>
                    <h2 className="text-3xl font-bold tracking-tight">
                        {title}
                    </h2>
                    <p className="text-white/80 max-w-xl leading-relaxed">
                        {description}
                    </p>
                    <div className="flex flex-wrap gap-4 pt-2 justify-center md:justify-start">
                        <Link 
                            href={planetUrl} 
                            className="px-6 py-2.5 bg-white text-accent-tertiary font-bold rounded-xl hover:bg-opacity-90 transition-colors"
                        >
                            立即加入
                        </Link>
                        <Link 
                            href="/planet" 
                            className="px-6 py-2.5 bg-accent-tertiary/20 backdrop-blur-md border border-white/30 text-white font-bold rounded-xl hover:bg-white/10 transition-colors"
                        >
                            了解更多
                        </Link>
                    </div>
                </div>

                <div className="flex-shrink-0 relative group">
                    <div className="absolute -inset-4 bg-white/20 rounded-2xl blur-xl group-hover:blur-2xl transition-all opacity-50"></div>
                    <div className="relative w-40 h-40 bg-white rounded-2xl p-2 shadow-2xl overflow-hidden">
                        {planetQrCode ? (
                            <img src={planetQrCode} alt="星球二维码" className="w-full h-full object-contain rounded-xl" />
                        ) : (
                            <div className="w-full h-full bg-gray-100 flex items-center justify-center border-2 border-dashed border-gray-300 text-gray-400 rounded-xl">
                                <div className="text-center">
                                    <span className="text-2xl block mb-1">🪐</span>
                                    <span className="text-[10px] font-bold">星球二维码</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Background Decorative Elements */}
            <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
            <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-64 h-64 bg-black/10 rounded-full blur-3xl"></div>
        </div>
    )
}
