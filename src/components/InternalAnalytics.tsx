'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

export default function InternalAnalytics() {
  const pathname = usePathname()

  useEffect(() => {
    if (!pathname || pathname.startsWith('/blog/') || navigator.doNotTrack === '1') return

    const day = new Date().toISOString().slice(0, 10)
    const storageKey = `site-view:${day}:${pathname}`
    if (sessionStorage.getItem(storageKey)) return
    sessionStorage.setItem(storageKey, '1')

    fetch('/api/analytics/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: pathname,
        referrer: document.referrer,
        utmSource: new URLSearchParams(window.location.search).get('utm_source'),
        utmMedium: new URLSearchParams(window.location.search).get('utm_medium'),
      }),
      keepalive: true,
    }).catch(() => undefined)
  }, [pathname])

  return null
}
