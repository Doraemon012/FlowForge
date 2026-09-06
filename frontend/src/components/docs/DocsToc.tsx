import { useEffect, useState, type RefObject } from 'react'
import { cn } from '@/lib/utils'

interface DocsTocProps {
  contentRef: RefObject<HTMLDivElement | null>
}

interface TocEntry {
  id: string
  title: string
  level: number
}

export function DocsToc({ contentRef }: DocsTocProps) {
  const [headings, setHeadings] = useState<TocEntry[]>([])
  const [activeId, setActiveId] = useState<string>('')

  useEffect(() => {
    const container = contentRef.current
    if (!container) return

    const nodes = Array.from(container.querySelectorAll<HTMLElement>('h2[id], h3[id]'))
    const entries = nodes.map((node) => ({
      id: node.id,
      title: node.textContent ?? '',
      level: node.tagName === 'H2' ? 2 : 3,
    }))
    setHeadings(entries)
  }, [contentRef])

  useEffect(() => {
    if (headings.length === 0) return

    const onScroll = () => {
      let current = headings[0].id
      const offset = 90
      for (const heading of headings) {
        const element = document.getElementById(heading.id)
        if (element) {
          const rect = element.getBoundingClientRect()
          if (rect.top <= offset) {
            current = heading.id
          }
        }
      }
      setActiveId(current)
    }

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [headings])

  if (headings.length === 0) return null

  return (
    <nav className="docs-onthis" aria-label="On this page">
      <div className="docs-onthis-label">On this page</div>
      <ul className="docs-onthis-list">
        {headings.map((heading) => (
          <li key={heading.id}>
            <a
              href={`#${heading.id}`}
              className={cn('docs-onthis-link', heading.level === 3 && 'h3', activeId === heading.id && 'active')}
              aria-current={activeId === heading.id ? 'location' : undefined}
            >
              {heading.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
