import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LogOut, Menu, PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { commandPaletteStore } from '@/components/layout/command-palette-store'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

function getInitials(user: { displayName?: string; email?: string } | null): string {
  if (user?.displayName) {
    return user.displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('')
  }
  if (user?.email) {
    return user.email[0]?.toUpperCase() ?? '?'
  }
  return '?'
}

function labelForSegment(segment: string): string {
  const map: Record<string, string> = {
    app: 'Overview',
    projects: 'Projects',
    workflows: 'Workflows',
    versions: 'Versions',
    executions: 'Executions',
    login: 'Login',
    signup: 'Signup',
    new: 'New',
  }
  return map[segment] ?? segment
}

function buildCrumbs(pathname: string): { label: string; path: string }[] {
  const segments = pathname.split('/').filter(Boolean)
  const crumbs: { label: string; path: string }[] = []
  let current = ''
  for (const segment of segments) {
    current += `/${segment}`
    crumbs.push({ label: labelForSegment(segment), path: current })
  }
  return crumbs
}

interface TopBarProps {
  onToggleSidebar?: () => void
  sidebarCollapsed?: boolean
  onToggleCollapse?: () => void
}

export function TopBar({ onToggleSidebar, sidebarCollapsed, onToggleCollapse }: TopBarProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()
  const crumbs = buildCrumbs(location.pathname)

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="topbar">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Toggle navigation"
        onClick={onToggleSidebar}
      >
        <Menu className="h-4 w-4" aria-hidden="true" />
      </Button>

      {onToggleCollapse ? (
        <Button
          variant="ghost"
          size="icon"
          className="hidden md:inline-flex"
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!sidebarCollapsed}
          onClick={onToggleCollapse}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
          ) : (
            <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
          )}
        </Button>
      ) : null}

      <nav className="crumbs" aria-label="Breadcrumb">
        {crumbs.map((crumb, index) => (
          <span key={crumb.path} className="flex items-center gap-1">
            {index > 0 ? <span className="sep">/</span> : null}
            {index === crumbs.length - 1 ? (
              <span className="cur">{crumb.label}</span>
            ) : (
              <Link to={crumb.path}>{crumb.label}</Link>
            )}
          </span>
        ))}
      </nav>

      <div className="grow" />

      <button
        type="button"
        className="search"
        onClick={() => commandPaletteStore.open()}
        aria-label="Open command palette"
      >
        <Search className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="grow">Search…</span>
        <span className="kbd">⌘K</span>
      </button>

      <div className="live-indicator" title="All systems operational">
        <span className="live-dot" aria-hidden="true" />
        <span>Operational</span>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="h-9 w-9 rounded-md p-0"
            aria-label="Open account menu"
          >
            <Avatar className="h-8 w-8 rounded-md">
              <AvatarFallback>{getInitials(user)}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <span className="block truncate">{user?.displayName ?? user?.email}</span>
            {user?.displayName && user?.email ? (
              <span className="block truncate text-xs font-normal text-muted-foreground">
                {user.email}
              </span>
            ) : null}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
