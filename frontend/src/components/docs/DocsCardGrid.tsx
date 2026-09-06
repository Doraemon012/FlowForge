import type { ComponentType } from 'react'
import { Link } from 'react-router-dom'

export interface DocsCardItem {
  title: string
  description: string
  to: string
  icon?: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>
}

interface DocsCardGridProps {
  cards: DocsCardItem[]
}

export function DocsCardGrid({ cards }: DocsCardGridProps) {
  return (
    <div className="docs-card-grid">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <Link key={card.to} to={card.to} className="docs-card">
            {Icon ? (
              <span className="docs-card-icon">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
            ) : null}
            <div className="docs-card-title">{card.title}</div>
            <div className="docs-card-desc">{card.description}</div>
          </Link>
        )
      })}
    </div>
  )
}
