'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

export default function InternalAnalytics() {
  const pathname = usePathname()

  useEffect(() => {
    if (!pathname || navigator.doNotTrack === '1') return

    const day = new Date().toISOString().slice(0, 10)
    const storageKey = `site-view:${day}:${pathname}`
    const firstSeenKey = 'site-reader-first-seen'
    let firstSeen: string | null = null
    let alreadyCounted = false
    try {
      firstSeen = localStorage.getItem(firstSeenKey)
      if (!firstSeen) localStorage.setItem(firstSeenKey, day)
      alreadyCounted = sessionStorage.getItem(storageKey) === '1'
      if (!alreadyCounted) sessionStorage.setItem(storageKey, '1')
    } catch {
      // Some privacy modes disable Web Storage. Analytics still works with
      // the server-side daily hash, but no returning-reader signal is sent.
    }
    const returningReader = Boolean(firstSeen && firstSeen < day)

    if (!alreadyCounted) {
      fetch('/api/analytics/view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: pathname,
          referrer: document.referrer,
          returningReader,
          utmSource: new URLSearchParams(window.location.search).get('utm_source'),
          utmMedium: new URLSearchParams(window.location.search).get('utm_medium'),
        }),
        keepalive: true,
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.ok && Number.isFinite(data.views)) {
            window.dispatchEvent(new CustomEvent('site:pageview', {
              detail: { path: pathname, views: data.views },
            }))
          }
        })
        .catch(() => undefined)
    }

    const startedAt = Date.now()
    let maxDepth = 0
    const updateDepth = () => {
      const scrollable = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
      maxDepth = Math.max(maxDepth, Math.min(100, Math.round((window.scrollY / scrollable) * 100)))
    }
    const sendEngagement = () => {
      updateDepth()
      const seconds = Math.min(3600, Math.round((Date.now() - startedAt) / 1000))
      if (seconds < 10 && maxDepth < 25) return
      fetch('/api/analytics/view', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: pathname, seconds, depth: maxDepth }),
        keepalive: true,
      }).catch(() => undefined)
    }

    updateDepth()
    window.addEventListener('scroll', updateDepth, { passive: true })
    window.addEventListener('pagehide', sendEngagement)
    const interval = window.setInterval(sendEngagement, 30_000)

    return () => {
      sendEngagement()
      window.clearInterval(interval)
      window.removeEventListener('scroll', updateDepth)
      window.removeEventListener('pagehide', sendEngagement)
    }
  }, [pathname])

  return null
}
