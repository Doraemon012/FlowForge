import { Link } from 'react-router-dom'
import { Menu, Search } from 'lucide-react'

interface DocsTopNavProps {
  onToggleSidebar: () => void
  onOpenSearch: () => void
}

export function DocsTopNav({ onToggleSidebar, onOpenSearch }: DocsTopNavProps) {
  return (
    <header className="docs-topnav">
      <div className="docs-topnav-left">
        <button
          type="button"
          className="docs-menu-btn"
          onClick={onToggleSidebar}
          aria-label="Open navigation menu"
        >
          <Menu className="h-4 w-4" aria-hidden="true" />
        </button>
        <Link to="/docs" className="logo" aria-label="FlowForge documentation home">
          <span className="logo-mark">F</span>
          <span>FlowForge</span>
        </Link>
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <span className="sep">/</span>
          <span className="cur">Docs</span>
        </nav>
      </div>
      <div className="docs-topnav-right">
        <button
          type="button"
          className="search"
          onClick={onOpenSearch}
          aria-label="Search documentation"
          style={{ minWidth: 180 }}
        >
          <Search className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="grow">Search…</span>
          <span className="kbd">⌘K</span>
        </button>
        <Link to="/" className="btn btn-ghost btn-sm docs-cta-text">
          Back to site
        </Link>
        <Link to="/login" className="btn btn-secondary btn-sm docs-cta-text">
          Sign in
        </Link>
      </div>
    </header>
  )
}
