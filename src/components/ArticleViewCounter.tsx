'use client'

import { useEffect, useState } from 'react'

export default function ArticleViewCounter({ path }: { path: string }) {
  const [views, setViews] = useState<number | null>(null)

  useEffect(() => {
    const handlePageView = (event: Event) => {
      const detail = (event as CustomEvent<{ path?: string; views?: number }>).detail
      if (detail?.path === path && Number.isFinite(detail.views)) setViews(Number(detail.views))
    }
    window.addEventListener('site:pageview', handlePageView)

    fetch(`/api/analytics/view?path=${encodeURIComponent(path)}`, {
      method: 'GET',
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.ok && Number.isFinite(data.views)) setViews(data.views)
      })
      .catch(() => undefined)

    return () => window.removeEventListener('site:pageview', handlePageView)
  }, [path])

  return <span>{views === null ? '阅读统计加载中' : `${views.toLocaleString('zh-CN')} 次阅读`}</span>
}
