import { Link } from 'react-router-dom'
import { Search } from 'lucide-react'
import { docsNavGroups } from '@/components/docs/nav-data'
import { cn } from '@/lib/utils'

interface DocsSidebarProps {
  currentSlug: string
  onNavigate?: () => void
  onOpenSearch?: () => void
}

export function DocsSidebar({ currentSlug, onNavigate, onOpenSearch }: DocsSidebarProps) {
  return (
    <nav className="docs-sidebar" aria-label="Documentation navigation">
      {onOpenSearch ? (
        <div className="docs-sidebar-search">
          <button
            type="button"
            className="search"
            style={{ width: '100%', minWidth: 0, padding: '7px 10px' }}
            onClick={onOpenSearch}
            aria-label="Search documentation"
          >
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="grow">Search…</span>
            <span className="kbd">⌘K</span>
          </button>
        </div>
      ) : null}
      {docsNavGroups.map((group) => (
        <div className="docs-sidebar-group" key={group.label}>
          <div className="docs-sidebar-group-label">{group.label}</div>
          {group.items.map((item) => (
            <Link
              key={item.slug}
              to={`/docs/${item.slug}`}
              className={cn('docs-sidebar-item', currentSlug === item.slug && 'active')}
              aria-current={currentSlug === item.slug ? 'page' : undefined}
              onClick={onNavigate}
            >
              {item.title}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  )
}
