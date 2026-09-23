import { Link, NavLink } from 'react-router-dom'
import {
  BookOpen,
  FolderKanban,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  PlayCircle,
  Workflow as WorkflowIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProject } from '@/hooks/use-projects'
import { useRouteContext } from '@/hooks/use-route-context'
import { FlowForgeMark } from '@/components/brand/FlowForgeLogo'
import { ProjectSwitcher } from '@/components/layout/ProjectSwitcher'

interface SidebarProps {
  className?: string
  onNavigate?: () => void
  collapsed?: boolean
  onToggleCollapse?: () => void
}

interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
  end?: boolean
}

// Deliberately not "Overview": the project zone below also has an Overview,
// and two identical labels one above the other made the sidebar read as if it
// listed the same destination twice. This one is the workspace dashboard.
const WORKSPACE_ITEMS: NavItem[] = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/projects', label: 'Projects', icon: FolderKanban, end: true },
]

const RESOURCE_ITEMS: NavItem[] = [{ to: '/docs', label: 'Documentation', icon: BookOpen }]

/**
 * Group headings become hairline dividers when the sidebar is collapsed:
 * rendering the label's text sideways is not an option, and an em dash reads as
 * a placeholder rather than a separator.
 */
function GroupHeading({ label, collapsed }: { label: string; collapsed: boolean }) {
  if (collapsed) return <div className="sb-divider" aria-hidden="true" />
  return <div className="sb-group">{label}</div>
}

/**
 * The sidebar owns *scope*: it answers "which part of FlowForge am I in and
 * where else can I go in it".
 *
 * Three changes from the previous version:
 *
 * 1. A contextual Project zone appears whenever the route is inside a project,
 *    exposing that project's Workflows and Runs. Previously there was no way to
 *    reach either from the sidebar, so a user had to rely on breadcrumbs.
 * 2. The account block in the footer is gone. It duplicated the TopBar's avatar
 *    menu, which is the single account surface now.
 * 3. The collapse toggle moved here from the TopBar, next to the thing it
 *    actually controls.
 */
export function Sidebar({ className, onNavigate, collapsed = false, onToggleCollapse }: SidebarProps) {
  const { projectId, section, inProject } = useRouteContext()
  const { data: project } = useProject(projectId ?? '')

  const projectItems: NavItem[] = projectId
    ? [
        { to: `/app/projects/${projectId}`, label: 'Overview', icon: FolderKanban, end: true },
        { to: `/app/projects/${projectId}/workflows`, label: 'Workflows', icon: WorkflowIcon },
        { to: `/app/projects/${projectId}/executions`, label: 'Runs', icon: PlayCircle },
      ]
    : []

  const renderItem = (item: NavItem) => {
    const Icon = item.icon
    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        onClick={onNavigate}
        title={collapsed ? item.label : undefined}
        aria-label={collapsed ? item.label : undefined}
        className={({ isActive }) => cn('sb-item', isActive && 'active')}
      >
        <Icon aria-hidden="true" />
        {!collapsed ? <span>{item.label}</span> : null}
      </NavLink>
    )
  }

  return (
    <aside
      className={cn('sidebar', collapsed && 'sb-collapsed', className)}
      style={collapsed ? { width: 64 } : undefined}
      aria-label="Primary"
    >
      <div className="sb-brand">
        {/* The brand always leads to the landing page, on every surface - it is
            the product's identity, not a route inside the app. The landing page
            recognises the session and offers "Open app", so a signed-in user is
            never stranded; "Dashboard" below is the way to the workspace home. */}
        <Link
          to="/"
          className="sb-brand-link"
          aria-label="FlowForge home"
          onClick={onNavigate}
        >
          <FlowForgeMark size={26} />
          {!collapsed ? <span className="sb-brand-name">FlowForge</span> : null}
        </Link>
        {onToggleCollapse ? (
          <button
            type="button"
            className="sb-collapse"
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        ) : null}
      </div>

      <nav aria-label="Primary navigation" className="sb-scroll">
        <GroupHeading label="Workspace" collapsed={collapsed} />
        {WORKSPACE_ITEMS.map(renderItem)}

        {inProject && projectItems.length > 0 ? (
          <div className="sb-project-zone">
            {collapsed ? (
              <div className="sb-divider" aria-hidden="true" />
            ) : (
              <ProjectSwitcher
                currentProjectId={projectId ?? ''}
                currentProjectName={project?.name}
                onNavigate={onNavigate}
              />
            )}
            {projectItems.map(renderItem)}
          </div>
        ) : null}

        <GroupHeading label="Resources" collapsed={collapsed} />
        {RESOURCE_ITEMS.map(renderItem)}
      </nav>

      {/*
        The project zone's active item is the only place the current section is
        named, so a screen reader gets an unambiguous position statement even
        when the sidebar is collapsed.
      */}
      <span className="sr-only" aria-live="polite">
        {inProject ? `Project section: ${section ?? 'overview'}` : 'Workspace'}
      </span>
    </aside>
  )
}
