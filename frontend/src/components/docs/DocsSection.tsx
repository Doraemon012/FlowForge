import type { ReactNode } from 'react'

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

interface DocsSectionProps {
  id?: string
  title?: string
  eyebrow?: string
  children: ReactNode
}

export function DocsSection({ id, title, eyebrow, children }: DocsSectionProps) {
  return (
    <section className="docs-section" id={id}>
      {eyebrow ? <div className="docs-eyebrow">{eyebrow}</div> : null}
      {title ? (
        <h2 className="docs-section-title" id={id ?? (title ? slugify(title) : undefined)}>
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  )
}

export function DocsSubsection({
  id,
  title,
  children,
}: {
  id?: string
  title: string
  children: ReactNode
}) {
  return (
    <div id={id}>
      <h3 className="docs-subsection-title" id={id ?? slugify(title)}>
        {title}
      </h3>
      {children}
    </div>
  )
}

export function DocsParagraph({
  children,
  muted = false,
}: {
  children: ReactNode
  muted?: boolean
}) {
  return <p className={muted ? 'docs-paragraph muted' : 'docs-paragraph'}>{children}</p>
}
