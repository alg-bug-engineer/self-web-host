'use client'

import Link from 'next/link'
import Image from 'next/image'

interface PlanetBannerProps {
  title?: string
  description?: string
  planetUrl?: string
  planetQrCode?: string
}

export default function PlanetBanner({
  title = '想把这个问题继续做深一点？',
  description = '知识星球用于整理大模型、RAG、Agent 与 AI 工程实践中的专题内容、案例和问题讨论。',
  planetUrl = '/planet',
  planetQrCode = '/images/ai-practice-poster.png',
}: PlanetBannerProps) {
  return (
    <section className="grid gap-7 rounded-lg border border-border-default border-l-[3px] border-l-accent-tertiary bg-bg-secondary p-6 sm:grid-cols-[1fr_auto] sm:items-center sm:p-8">
      <div>
        <p className="text-sm font-semibold text-accent-tertiary">AI 实践</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-text-primary">{title}</h2>
        <p className="mt-3 max-w-2xl leading-7 text-text-secondary">{description}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={planetUrl}
            className="planet-primary px-5 py-2.5"
            data-analytics-event="join_planet"
            data-analytics-target="content-banner"
          >
            查看学习社区
          </Link>
          <Link
            href="/planet"
            className="btn-secondary px-5 py-2.5"
            data-analytics-event="view_planet"
            data-analytics-target="content-banner"
          >
            先看实践路线
          </Link>
        </div>
      </div>

      {planetQrCode && (
        <Link
          href={planetUrl}
          className="justify-self-start rounded border border-border-default bg-white p-1 sm:justify-self-end"
          aria-label="打开 AI 实践知识星球"
          data-analytics-event="join_planet"
          data-analytics-target="content-banner-qr"
        >
          <Image src={planetQrCode} alt="AI 实践知识星球加入海报，包含可扫描二维码" width={360} height={198} className="h-auto w-full max-w-[360px] object-contain" />
        </Link>
      )}
    </section>
  )
}
