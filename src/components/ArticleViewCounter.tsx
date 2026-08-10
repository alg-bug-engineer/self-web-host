'use client'

import { useEffect, useState } from 'react'

export default function ArticleViewCounter({ path }: { path: string }) {
  const [views, setViews] = useState<number | null>(null)

  useEffect(() => {
    const day = new Date().toISOString().slice(0, 10)
    const storageKey = `site-view:${day}:${path}`
    const alreadyCounted = sessionStorage.getItem(storageKey) === '1'
    if (!alreadyCounted) sessionStorage.setItem(storageKey, '1')

    fetch(`/api/analytics/view?path=${encodeURIComponent(path)}`, {
      method: alreadyCounted ? 'GET' : 'POST',
      headers: alreadyCounted ? undefined : { 'Content-Type': 'application/json' },
      body: alreadyCounted ? undefined : JSON.stringify({
        path,
        referrer: document.referrer,
        utmSource: new URLSearchParams(window.location.search).get('utm_source'),
        utmMedium: new URLSearchParams(window.location.search).get('utm_medium'),
      }),
      keepalive: !alreadyCounted,
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.ok && Number.isFinite(data.views)) setViews(data.views)
      })
      .catch(() => undefined)
  }, [path])

  return <span>{views === null ? '阅读统计加载中' : `${views.toLocaleString('zh-CN')} 次阅读`}</span>
}
