'use client'

import { useReportWebVitals } from 'next/web-vitals'

const CORE_WEB_VITALS = new Set(['LCP', 'INP', 'CLS'])

const reportWebVital: Parameters<typeof useReportWebVitals>[0] = (metric) => {
  if (navigator.doNotTrack === '1' || !CORE_WEB_VITALS.has(metric.name)) return
  const value = metric.name === 'CLS'
    ? Math.round(metric.value * 10_000) / 10_000
    : Math.round(metric.value)

  fetch('/api/analytics/view', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: window.location.pathname,
      name: metric.name,
      value,
    }),
    keepalive: true,
  }).catch(() => undefined)
}

export default function WebVitalsReporter() {
  useReportWebVitals(reportWebVital)
  return null
}
