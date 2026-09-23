import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { X } from 'lucide-react'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { CommandPalette } from '@/components/layout/CommandPalette'
import { Button } from '@/components/ui/button'

const SIDEBAR_COLLAPSED_KEY = 'flowforge.sidebar-collapsed'

/**
 * Whether the rail is collapsed is a preference, not a transient toggle. Like
 * the theme and the session it is kept in localStorage, so leaving the app -
 * for example by following the brand to the landing page and coming back -
 * returns the same chrome instead of silently rearranging it.
 */
function readSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true'
  } catch {
    return false
  }
}

function persistSidebarCollapsed(collapsed: boolean) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed))
  } catch {
    // Ignore storage write failures (e.g. private mode); state stays in memory.
  }
}

/**
 * The application chrome.
 *
 * The sidebar owns the collapse state and renders its own toggle, so the
 * TopBar no longer needs to know about either. Collapsing is a desktop-only
 * affordance — the mobile drawer is transient and always full width.
 */
export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed)

  const closeSidebar = () => setSidebarOpen(false)
  const toggleSidebar = () => setSidebarOpen((open) => !open)
  const toggleCollapse = () =>
    setSidebarCollapsed((collapsed) => {
      const next = !collapsed
      persistSidebarCollapsed(next)
      return next
    })

  useEffect(() => {
    if (!sidebarOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeSidebar()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [sidebarOpen])

  return (
    <div className="appview">
      {/* Desktop sidebar */}
      <Sidebar
        className="hidden md:flex"
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleCollapse}
      />

      {/* Mobile sidebar drawer */}
      {sidebarOpen ? (
        <div
          className="fixed inset-0 z-40 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          <div
            className="absolute inset-0 bg-black/50"
            onClick={closeSidebar}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 flex h-full shadow-xl">
            <Sidebar className="flex h-full sidebar sidebar-drawer" onNavigate={closeSidebar} />
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2"
              aria-label="Close navigation"
              onClick={closeSidebar}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      ) : null}

      <div className="main">
        <TopBar onToggleSidebar={toggleSidebar} />
        <div className="page">
          <div className="page-inner">
            <Outlet />
          </div>
        </div>
      </div>

      <CommandPalette />
    </div>
  )
}
