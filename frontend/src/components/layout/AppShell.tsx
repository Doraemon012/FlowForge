import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { X } from 'lucide-react'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { CommandPalette } from '@/components/layout/CommandPalette'
import { Button } from '@/components/ui/button'

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const closeSidebar = () => setSidebarOpen(false)
  const toggleSidebar = () => setSidebarOpen((open) => !open)
  const toggleCollapse = () => setSidebarCollapsed((collapsed) => !collapsed)

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
      <Sidebar className="hidden md:flex" collapsed={sidebarCollapsed} />

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
        <TopBar
          onToggleSidebar={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
          onToggleCollapse={toggleCollapse}
        />
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
