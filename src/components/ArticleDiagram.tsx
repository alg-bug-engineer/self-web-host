interface ArticleDiagramProps {
  src: string
  mobileSrc: string
  alt: string
  caption: string
  height: number
  mobileHeight: number
}

/** Separate art direction preserves readable labels on narrow screens. */
export default function ArticleDiagram({ src, mobileSrc, alt, caption, height, mobileHeight }: ArticleDiagramProps) {
  return (
    <figure className="my-10" data-testid="article-diagram">
      <picture>
        <source media="(max-width: 767px)" srcSet={mobileSrc} width={540} height={mobileHeight} />
        {/* Native picture is intentional: SVG text stays sharp in both layouts. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} width={1080} height={height} loading="lazy" className="block h-auto w-full" />
      </picture>
      <figcaption className="mt-3 text-sm leading-7 text-text-tertiary">
        {caption}{' '}
        <a href={src} target="_blank" rel="noopener noreferrer" className="hidden text-accent-primary hover:underline md:inline">查看大图 ↗</a>
        <a href={mobileSrc} target="_blank" rel="noopener noreferrer" className="text-accent-primary hover:underline md:hidden">查看大图 ↗</a>
      </figcaption>
    </figure>
  )
}
