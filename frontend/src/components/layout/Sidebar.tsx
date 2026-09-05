import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, FolderKanban } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSession } from '@/lib/auth-store'

const groups = [
  {
    label: 'Workspace',
    items: [
      { to: '/app', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/app/projects', label: 'Projects', icon: FolderKanban, end: false },
    ],
  },
]

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

interface SidebarProps {
  className?: string
  onNavigate?: () => void
  collapsed?: boolean
}

export function Sidebar({ className, onNavigate, collapsed = false }: SidebarProps) {
  const session = useSession()
  const user = session?.user ?? null
  const initials = getInitials(user)
  const workspaceName = user?.displayName ?? 'FlowForge'
  const navigate = useNavigate()

  const handleWorkspaceActivate = () => {
    navigate('/app')
    onNavigate?.()
  }

  return (
    <aside
      className={cn('sidebar', collapsed && 'sb-collapsed', className)}
      style={collapsed ? { width: 64 } : undefined}
      aria-label="Primary"
    >
      <div
        className="sb-workspace"
        role="button"
        tabIndex={0}
        title={collapsed ? workspaceName : undefined}
        onClick={handleWorkspaceActivate}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            handleWorkspaceActivate()
          }
        }}
      >
        <div className="sb-avatar">{initials}</div>
        {!collapsed ? (
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="name">{workspaceName}</div>
            <div className="env">workspace</div>
          </div>
        ) : null}
      </div>

      <nav aria-label="Primary navigation" className="flex-1">
        {groups.map((group) => (
          <div key={group.label}>
            {!collapsed ? <div className="sb-group">{group.label}</div> : null}
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                title={collapsed ? item.label : undefined}
                aria-label={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  cn('sb-item', isActive && 'active')
                }
              >
                <item.icon aria-hidden="true" />
                {!collapsed ? <span>{item.label}</span> : null}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="sb-bottom">
        <div className="avatar">{initials}</div>
        {!collapsed ? (
          <div>
            <div className="who">{user?.displayName ?? user?.email ?? 'Account'}</div>
            <div className="plan">Team plan</div>
          </div>
        ) : null}
      </div>
    </aside>
  )
}
