import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import { getFlatDocs } from '@/components/docs/nav-data'
import { FlowForgeMark } from '@/components/brand/FlowForgeLogo'
import { DocsTopNav } from '@/components/docs/DocsTopNav'
import { DocsSidebar } from '@/components/docs/DocsSidebar'
import { DocsToc } from '@/components/docs/DocsToc'
import { DocsPager } from '@/components/docs/DocsPager'
import { DocsSearch } from '@/components/docs/DocsSearch'

interface DocsLayoutProps {
  slug: string
  children: ReactNode
}

export function DocsLayout({ slug, children }: DocsLayoutProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const mainRef = useRef<HTMLDivElement>(null)
  const flatDocs = getFlatDocs()

  const closeDrawer = () => setDrawerOpen(false)
  const openSearch = () => setSearchOpen(true)
  const closeSearch = () => setSearchOpen(false)

  useEffect(() => {
    if (!drawerOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDrawer()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [drawerOpen])

  useEffect(() => {
    if (!searchOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeSearch()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [searchOpen])

  // Close the drawer when navigating to a new route.
  useEffect(() => {
    setDrawerOpen(false)
  }, [slug])

  return (
    <div className="docs-shell">
      <DocsTopNav onToggleSidebar={() => setDrawerOpen(true)} onOpenSearch={openSearch} />

      {drawerOpen ? (
        <>
          <div className="docs-drawer-overlay" onClick={closeDrawer} aria-hidden="true" />
          <div className="docs-drawer" role="dialog" aria-modal="true" aria-label="Documentation navigation">
            <button
              type="button"
              className="docs-drawer-close"
              onClick={closeDrawer}
              aria-label="Close navigation menu"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
            <DocsSidebar
              currentSlug={slug}
              onNavigate={closeDrawer}
              onOpenSearch={() => {
                closeDrawer()
                openSearch()
              }}
            />
          </div>
        </>
      ) : null}

      {/* Mobile: horizontal section chips */}
      <div className="docs-chips" role="navigation" aria-label="Documentation sections">
        {flatDocs.map((item) => (
          <Link
            key={item.slug}
            to={`/docs/${item.slug}`}
            className={`docs-chip${slug === item.slug ? ' active' : ''}`}
            aria-current={slug === item.slug ? 'page' : undefined}
          >
            {item.title}
          </Link>
        ))}
      </div>

      <div className="docs-body">
        <div className="hidden md:block">
          <DocsSidebar currentSlug={slug} onOpenSearch={openSearch} />
        </div>

        <main className="docs-main" ref={mainRef}>
          <div className="docs-content">
            <div className="docs-content-inner">
              {children}
              <DocsPager slug={slug} />
            </div>
          </div>
        </main>

        <DocsToc contentRef={mainRef} />
      </div>

      <footer className="docs-footer">
        <div className="l">
          <Link to="/docs" className="logo" aria-label="FlowForge documentation home">
            <FlowForgeMark />
            <span>FlowForge</span>
          </Link>
        </div>
        <div className="l">
          <Link to="/">Back to site</Link>
          <span className="sep">·</span>
          <Link to="/login">Sign in</Link>
          <span className="sep">·</span>
          <span>© {new Date().getFullYear()} FlowForge</span>
        </div>
      </footer>

      <DocsSearch open={searchOpen} onClose={closeSearch} />
    </div>
  )
}
