import Link from 'next/link'
import { ReactNode, ComponentPropsWithoutRef } from 'react'
import type { MDXComponents } from 'mdx/types'

// Info Card Component
interface InfoCardProps {
  type?: 'tip' | 'warning' | 'info' | 'cat' | 'robot'
  title?: string
  children: ReactNode
}

function InfoCard({ type = 'info', title, children }: InfoCardProps) {
  const styles = {
    tip: {
      bg: 'bg-color-success-subtle border-color-success-muted',
      icon: '💡',
      titleColor: 'text-color-success-fg',
    },
    warning: {
      bg: 'bg-color-warning-subtle border-color-warning-muted',
      icon: '⚠️',
      titleColor: 'text-color-warning-fg',
    },
    info: {
      bg: 'bg-color-attention-subtle border-color-attention-muted',
      icon: 'ℹ️',
      titleColor: 'text-color-attention-fg',
    },
    cat: {
        bg: 'bg-bg-tertiary border-border-default',
        icon: '🐱',
        titleColor: 'text-text-primary',
    },
    robot: {
        bg: 'bg-bg-tertiary border-border-default',
        icon: '🤖',
        titleColor: 'text-text-primary',
    },
  }

  const style = styles[type]

  return (
    <div className={`my-6 p-4 rounded-xl border ${style.bg}`}>
      <div className="flex items-start gap-3">
        <span className="text-xl flex-shrink-0">{style.icon}</span>
        <div className="flex-1">
          {title && (
            <p className={`font-semibold mb-2 ${style.titleColor}`}>{title}</p>
          )}
          <div className="text-text-secondary">{children}</div>
        </div>
      </div>
    </div>
  )
}

// Two Column Layout
interface TwoColumnLayoutProps {
  children: ReactNode
}

function TwoColumnLayout({ children }: TwoColumnLayoutProps) {
  return (
    <div className="grid md:grid-cols-2 gap-6 my-8">
      {children}
    </div>
  )
}

function Left({ children }: { children: ReactNode }) {
  return <div className="space-y-4">{children}</div>
}

function Right({ children }: { children: ReactNode }) {
  return <div className="space-y-4">{children}</div>
}

// Code Block with filename
interface CodeBlockProps {
  filename?: string
  children: ReactNode
}

function CodeBlock({ filename, children }: CodeBlockProps) {
  return (
    <div className="my-6 rounded-xl overflow-hidden border border-border-default">
      {filename && (
        <div className="bg-bg-tertiary px-4 py-2 border-b border-border-default flex items-center gap-2">
          <svg className="w-4 h-4 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
          <span className="text-sm font-mono text-text-secondary">{filename}</span>
        </div>
      )}
      <div className="bg-bg-inset text-text-primary p-4 overflow-x-auto">
        {children}
      </div>
    </div>
  )
}

// Highlight Box
interface HighlightBoxProps {
  children: ReactNode
}

function HighlightBox({ children }: HighlightBoxProps) {
  return (
    <div className="my-6 p-6 rounded-xl bg-gradient-to-br from-accent-primary/5 to-accent-secondary/5 border border-accent-primary/20">
      {children}
    </div>
  )
}

// Quote with author
interface QuoteProps {
  author?: string
  children: ReactNode
}

function Quote({ author, children }: QuoteProps) {
  return (
    <blockquote className="my-6 pl-6 border-l-4 border-accent-primary italic text-text-secondary">
      <div className="mb-2">{children}</div>
      {author && <cite className="text-sm text-text-tertiary not-italic">— {author}</cite>}
    </blockquote>
  )
}

// Step by Step
interface StepProps {
  number: number
  title: string
  children: ReactNode
}

function Step({ number, title, children }: StepProps) {
  return (
    <div className="my-6 flex gap-4">
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-accent-primary text-text-on-emphasis flex items-center justify-center font-bold">
        {number}
      </div>
      <div className="flex-1">
        <h4 className="font-bold text-text-primary mb-2">{title}</h4>
        <div className="text-text-secondary">{children}</div>
      </div>
    </div>
  )
}

// Custom heading components with anchor
function createHeading(level: 1 | 2 | 3 | 4 | 5 | 6) {
  const sizes = {
    1: 'text-3xl',
    2: 'text-2xl',
    3: 'text-xl',
    4: 'text-lg',
    5: 'text-base',
    6: 'text-sm',
  }

  const Heading = ({ children, id, ...props }: ComponentPropsWithoutRef<'h1'>) => {
    const Tag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
    return (
      <Tag id={id} className={`${sizes[level]} font-bold text-text-primary mt-8 mb-4 group`} {...props}>
        {children}
        {id && (
          <a href={`#${id}`} className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity text-accent-primary">
            #
          </a>
        )}
      </Tag>
    )
  }
  Heading.displayName = `Heading${level}`
  return Heading
}

// Export all MDX components
export const mdxComponents: MDXComponents = {
  // Custom components
  InfoCard,
  TwoColumnLayout,
  Left,
  Right,
  CodeBlock,
  HighlightBox,
  Quote,
  Step,

  // Override default HTML elements
  h1: createHeading(1),
  h2: createHeading(2),
  h3: createHeading(3),
  h4: createHeading(4),
  h5: createHeading(5),
  h6: createHeading(6),

  p: (props: ComponentPropsWithoutRef<'p'>) => (
    <p className="my-4 text-text-secondary leading-relaxed" {...props} />
  ),

  a: (props: ComponentPropsWithoutRef<'a'>) => {
    const { href, children, ...rest } = props
    const isExternal = href?.startsWith('http')
    if (isExternal) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent-primary hover:underline"
          {...rest}
        >
          {children}
        </a>
      )
    }
    return (
      <Link href={href || '#'} className="text-accent-primary hover:underline" {...rest}>
        {children}
      </Link>
    )
  },

  ul: (props: ComponentPropsWithoutRef<'ul'>) => (
    <ul className="my-4 pl-6 space-y-2 list-disc text-text-secondary" {...props} />
  ),

  ol: (props: ComponentPropsWithoutRef<'ol'>) => (
    <ol className="my-4 pl-6 space-y-2 list-decimal text-text-secondary" {...props} />
  ),

  li: (props: ComponentPropsWithoutRef<'li'>) => (
    <li className="leading-relaxed" {...props} />
  ),

  blockquote: (props: ComponentPropsWithoutRef<'blockquote'>) => (
    <blockquote className="my-6 pl-6 border-l-4 border-accent-primary/50 italic text-text-secondary" {...props} />
  ),

  code: (props: ComponentPropsWithoutRef<'code'>) => (
    <code className="px-1.5 py-0.5 rounded bg-bg-tertiary font-mono text-sm text-accent-primary" {...props} />
  ),

  pre: (props: ComponentPropsWithoutRef<'pre'>) => (
    <pre className="my-6 p-4 rounded-xl bg-bg-inset text-text-primary overflow-x-auto font-mono text-sm" {...props} />
  ),

  img: (props: ComponentPropsWithoutRef<'img'>) => (
    <figure className="my-8">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        {...props}
        alt={props.alt || ''}
        className="rounded-xl w-full"
      />
      {props.alt && (
        <figcaption className="mt-2 text-center text-sm text-text-tertiary">
          {props.alt}
        </figcaption>
      )}
    </figure>
  ),

  hr: () => <hr className="my-12 border-border-default" />,

  table: (props: ComponentPropsWithoutRef<'table'>) => (
    <div className="my-6 overflow-x-auto">
      <table className="w-full border-collapse" {...props} />
    </div>
  ),

  th: (props: ComponentPropsWithoutRef<'th'>) => (
    <th className="border border-border-default px-4 py-2 bg-bg-tertiary text-left font-semibold" {...props} />
  ),

  td: (props: ComponentPropsWithoutRef<'td'>) => (
    <td className="border border-border-default px-4 py-2" {...props} />
  ),
}