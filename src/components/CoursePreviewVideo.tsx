'use client'

import { useRef } from 'react'

type CoursePreviewVideoProps = {
  lessonId: string
  src: string
  captions: string
  poster: string
  title: string
}

export default function CoursePreviewVideo({ lessonId, src, captions, poster, title }: CoursePreviewVideoProps) {
  const sent = useRef(false)

  const recordFirstPlay = () => {
    if (sent.current || navigator.doNotTrack === '1') return
    const target = lessonId.toLowerCase()
    const storageKey = `course-preview-play:${target}`
    try {
      if (sessionStorage.getItem(storageKey) === '1') {
        sent.current = true
        return
      }
      sessionStorage.setItem(storageKey, '1')
    } catch {
      // Privacy modes may disable session storage. The in-memory guard still
      // prevents repeated events during this page view.
    }
    sent.current = true
    window.dispatchEvent(new CustomEvent('site:conversion', {
      detail: { name: 'course_preview_play', target },
    }))
  }

  return (
    <video
      controls
      playsInline
      preload="metadata"
      poster={poster}
      className="aspect-video w-full bg-slate-950 object-contain"
      aria-label={`${title}公开试听`}
      onPlay={recordFirstPlay}
    >
      <source src={src} type="video/mp4" />
      <track default kind="subtitles" src={captions} srcLang="zh-CN" label="中文" />
    </video>
  )
}
