'use client'

import Image from 'next/image'
import { useEffect, useRef } from 'react'

type PlanetGateProps = {
  slug: string
  title: string
  description: string
  items: string[]
  topicUrl: string
  planetUrl: string
  planetQrCode?: string
}

function analyticsAttributes(event: string, target: string) {
  return {
    'data-analytics-event': event,
    'data-analytics-target': target,
  }
}

export default function PlanetGate({
  slug,
  title,
  description,
  items,
  topicUrl,
  planetUrl,
  planetQrCode = '/images/ai-practice-poster.png',
}: PlanetGateProps) {
  const checkpointRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inlineTopicRef = useRef<HTMLAnchorElement>(null)
  const sessionKey = `planet-gate-seen:${slug}`

  const closeDialog = () => dialogRef.current?.close()

  useEffect(() => {
    const checkpoint = checkpointRef.current
    const dialog = dialogRef.current
    if (!checkpoint || !dialog) return

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      observer.disconnect()

      try {
        if (sessionStorage.getItem(sessionKey) === '1') return
        sessionStorage.setItem(sessionKey, '1')
      } catch {
        // Storage can be unavailable in strict privacy modes. The observer still
        // guarantees a single automatic opening for this page lifecycle.
      }

      if (!dialog.open) {
        dialog.showModal()
        window.dispatchEvent(new CustomEvent('site:conversion', {
          detail: { name: 'planet_gate_view', target: 'article-gate-modal' },
        }))
      }
    }, { threshold: 0.25 })

    observer.observe(checkpoint)
    return () => observer.disconnect()
  }, [sessionKey])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const restoreFocus = () => inlineTopicRef.current?.focus({ preventScroll: true })
    dialog.addEventListener('close', restoreFocus)
    return () => dialog.removeEventListener('close', restoreFocus)
  }, [])

  const checkpoint = (target: 'article-gate-modal' | 'article-gate-inline') => (
    <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
      <div>
        <p className="text-sm font-semibold text-accent-tertiary">{target === 'article-gate-modal' ? '完整教程包含' : '公开预览到这里'}</p>
        <h2 className="mt-2 text-2xl font-semibold text-text-primary">{title}</h2>
        <p className="mt-3 leading-7 text-text-secondary">{description}</p>
        <ol className="mt-5 border-y border-border-muted text-sm text-text-secondary">
          <li className="flex gap-3 border-b border-border-muted py-3"><span className="font-mono text-text-tertiary">01</span><span>先用公开部分判断，这篇是不是你正需要的</span></li>
          <li className="flex gap-3 border-b border-border-muted py-3"><span className="font-mono text-text-tertiary">02</span><span>原帖提供完整命令、配置、截图和排错记录</span></li>
          <li className="flex gap-3 py-3"><span className="font-mono text-text-tertiary">03</span><span>再把这个工具接进后续的完整工作流</span></li>
        </ol>
        <ul className="mt-5 grid gap-2 sm:grid-cols-2">
          {items.map((item) => (
            <li key={item} className="flex gap-2 text-sm text-text-primary">
              <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-tertiary" />{item}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-3 lg:w-52">
        <a
          ref={target === 'article-gate-inline' ? inlineTopicRef : undefined}
          href={topicUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="planet-primary px-5 py-3 text-center"
          {...analyticsAttributes('open_planet_topic', target)}
        >
          打开完整教程
        </a>
        <a
          href={planetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary px-5 py-3 text-center"
          {...analyticsAttributes('join_planet', target)}
        >
          加入 AI 实践
        </a>
        {target === 'article-gate-modal' && (
          <button type="button" onClick={closeDialog} className="px-5 py-2 text-sm text-text-secondary underline-offset-4 hover:text-text-primary hover:underline">
            继续阅读公开内容
          </button>
        )}
      </div>
    </div>
  )

  return (
    <>
      <div
        ref={checkpointRef}
        data-testid="planet-gate-inline"
        className="relative overflow-hidden rounded-lg border border-border-default border-l-[3px] border-l-accent-tertiary bg-bg-secondary p-6 sm:p-8"
      >
        {checkpoint('article-gate-inline')}
      </div>

      <dialog
        ref={dialogRef}
        aria-label="完整教程解锁"
        data-testid="planet-gate-dialog"
        className="m-auto max-h-[90vh] w-[min(92vw,760px)] overflow-y-auto rounded-lg border border-border-default bg-bg-secondary p-0 text-text-primary shadow-xl backdrop:bg-black/55 open:animate-none"
      >
        <div className="relative p-6 sm:p-8">
          <button
            type="button"
            onClick={closeDialog}
            aria-label="关闭解锁窗口"
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded border border-border-default bg-bg-secondary text-xl text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
          >
            ×
          </button>
          <div className="mb-5 pr-12">
            <p className="text-sm font-medium text-accent-tertiary">公开部分到这里</p>
            <p className="mt-1 text-sm text-text-secondary">扫码加入 AI 实践，或者在手机上直接点击海报。</p>
          </div>
          <a
            href={planetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-7 block overflow-hidden rounded border border-border-default bg-white p-1"
            aria-label="扫码或点击海报加入 AI 实践"
            data-testid="planet-gate-poster"
            {...analyticsAttributes('join_planet', 'article-gate-modal')}
          >
            <Image
              src={planetQrCode}
              alt="AI 实践知识星球加入海报，包含可扫描二维码"
              width={750}
              height={412}
              className="h-auto w-full"
              priority
            />
          </a>
          {checkpoint('article-gate-modal')}
        </div>
      </dialog>
    </>
  )
}
