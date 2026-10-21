import Image from 'next/image'
import Link from 'next/link'
import type { PortfolioItem } from '@/lib/portfolio'

export default function ProjectCard({ item, index }: { item: PortfolioItem; index: number }) {
  const links = [
    item.link && { href: item.link, label: item.type === 'opensource' ? '查看项目' : '访问网站', event: 'visit_project' },
    item.caseStudy && { href: item.caseStudy, label: '作品案例', event: 'visit_project' },
    item.github && item.github !== item.link && { href: item.github, label: 'GitHub', event: 'visit_github' },
  ].filter((link): link is { href: string; label: string; event: string } => Boolean(link))

  return (
    <article id={item.id} className="flex min-w-0 scroll-mt-24 flex-col overflow-hidden rounded-[1.75rem] border border-border-default bg-bg-secondary">
      <div className="relative aspect-[16/9] overflow-hidden bg-bg-tertiary">
        {item.image ? (
          <Image src={item.image} alt={`${item.title}实际界面`} fill className={item.imageFit === 'contain' ? 'object-contain' : 'object-cover object-top'} sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" />
        ) : (
          <div className="absolute inset-0 flex items-end bg-[radial-gradient(circle_at_78%_18%,rgba(82,190,255,.25),transparent_28%),linear-gradient(145deg,#102a43,#1b4965)] p-6 text-white">
            <div><span className="text-[10px] tracking-[0.24em] text-white/60">OPEN SOURCE</span><strong className="mt-2 block text-xl leading-7">{item.title}</strong></div>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-6">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
          {item.category && <span>{item.category}</span>}
          {item.status && <span className="label label-gray">{item.status}</span>}
        </div>
        <h3 className="text-xl font-semibold leading-7 text-text-primary">{item.title}</h3>
        <p className="mt-3 text-sm leading-7 text-text-secondary">{item.description}</p>
        {item.highlights && <ul className="mt-4 list-disc space-y-2 pl-4 text-sm leading-6 text-text-secondary">{item.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}</ul>}
        <div className="mt-4 flex flex-wrap gap-2">{item.tags?.map((tag) => <span key={tag} className="label label-gray">{tag}</span>)}</div>
        {item.note && <p className="mt-4 text-xs leading-6 text-text-tertiary">{item.note}</p>}
        <div className="mt-auto flex flex-wrap gap-x-5 gap-y-3 pt-6 text-sm font-medium">
          {links.map((link) => <Link key={link.href} href={link.href} target="_blank" rel="noopener noreferrer" className="text-accent-tertiary hover:underline" data-analytics-event={link.event} data-analytics-target={`project-${index + 1}`}>{link.label} ↗</Link>)}
        </div>
      </div>
    </article>
  )
}
