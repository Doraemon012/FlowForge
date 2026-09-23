import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LogOut, Menu, Search, UserPlus } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useProject } from '@/hooks/use-projects'
import { useWorkflow } from '@/hooks/use-workflows'
import { useRouteContext } from '@/hooks/use-route-context'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { FlowForgeLogo } from '@/components/brand/FlowForgeLogo'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import { commandPaletteStore } from '@/components/layout/command-palette-store'
import { TrialIndicator } from '@/components/layout/TrialIndicator'
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

interface TopBarProps {
  onToggleSidebar?: () => void
}

/**
 * The TopBar owns *history and identity*: where you are in the hierarchy and
 * who you are signed in as. Scope navigation lives in the Sidebar.
 *
 * Changes from the previous version:
 *
 * - The brand leads to the landing page (`/`), the same destination as every
 *   other FlowForge lockup - docs chrome and auth included. The landing page is
 *   public whether or not a session exists and answers an authenticated visitor
 *   with "Open app", so this never strands anyone; "Dashboard" in the sidebar
 *   remains the way to the workspace home.
 * - Breadcrumbs come from `Breadcrumbs` (built from route meaning) instead of
 *   raw path segments, so `/app` no longer renders a redundant "Overview" crumb
 *   and the current page is text rather than a link to itself.
 * - The icon-only documentation button next to the search field is gone.
 *   Documentation is reachable from the sidebar and the command palette.
 * - The sidebar collapse toggle moved into the sidebar itself.
 */
export function TopBar({ onToggleSidebar }: TopBarProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout, isTrial } = useAuth()
  const { projectId, workflowId, executionId } = useRouteContext()
  const { data: project } = useProject(projectId ?? '')
  const { data: workflow } = useWorkflow(projectId ?? '', workflowId ?? '')

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  // Signup is not reachable while a session exists, so a trial visitor who
  // wants persistence leaves the disposable session first.
  const handleCreateAccount = () => {
    logout()
    navigate('/signup', { replace: true })
  }

  return (
    <header className="topbar">
      {/* Mobile-only navigation trigger. It lives in a wrapper because the
          `.btn` class sets `display: inline-flex` from unlayered CSS, which
          outranks Tailwind's layered `md:hidden` — putting the responsive
          utility on the button itself left a dead control visible on desktop. */}
      <div className="md:hidden">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle navigation"
          onClick={onToggleSidebar}
        >
          <Menu className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      {/* Below `md` the sidebar is off-canvas, so the top bar has to carry the
          brand and the one-tap route home. From `md` up the sidebar's own brand
          row does exactly that, and repeating the mark here just rendered the
          brand twice, with a divider dangling off it whenever the trail was
          empty (which is every workspace-level page).

          The wrapper is required for the same reason as the menu button above:
          `.logo` sets `display: inline-flex` from unlayered CSS, which outranks
          Tailwind's layered `md:hidden`, so the utility on the link itself is
          simply ignored and the brand stayed visible on desktop. */}
      <div className="md:hidden">
        <Link to="/" className="logo shrink-0" aria-label="FlowForge home">
          <FlowForgeLogo wordmarkClassName="text-base font-semibold tracking-tight" />
        </Link>
      </div>

      <Breadcrumbs
        pathname={location.pathname}
        projectName={project?.name}
        workflowName={workflow?.name}
        executionId={executionId}
      />

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

      <ThemeToggle />

      <TrialIndicator />

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
          {isTrial ? (
            <>
              <DropdownMenuItem onClick={handleCreateAccount}>
                <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
                Create a free account
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          ) : null}
          <DropdownMenuItem onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
