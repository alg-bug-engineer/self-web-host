'use client'

import Script from 'next/script'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

const GA_TRACKING_ID = process.env.NEXT_PUBLIC_GA_ID || 'G-LH50LSN47W'

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
    __gaTrackedPath?: string
  }
}

export default function GoogleAnalytics() {
  const pathname = usePathname()
  const [trackingAllowed, setTrackingAllowed] = useState(false)

  useEffect(() => {
    setTrackingAllowed(navigator.doNotTrack !== '1')
  }, [])

  useEffect(() => {
    if (trackingAllowed && pathname && window.gtag && window.__gaTrackedPath && window.__gaTrackedPath !== pathname) {
      window.gtag('event', 'page_view', {
        page_path: pathname,
        page_location: window.location.href,
        page_title: document.title,
      })
      window.__gaTrackedPath = pathname
    }
  }, [pathname, trackingAllowed])

  if (!GA_TRACKING_ID || !trackingAllowed) return null

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_TRACKING_ID}`}
        strategy="afterInteractive"
        onLoad={() => {
          if (!window.gtag) return
          const currentPath = window.location.pathname
          window.gtag('config', GA_TRACKING_ID, {
            page_path: currentPath,
            page_location: window.location.href,
            page_title: document.title,
            anonymize_ip: true,
          })
          window.__gaTrackedPath = currentPath
        }}
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          window.gtag = gtag;
        `}
      </Script>
    </>
  )
}
