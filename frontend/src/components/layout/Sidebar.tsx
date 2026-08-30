import { NavLink } from 'react-router-dom'
import { LayoutDashboard, FolderKanban, PlayCircle } from 'lucide-react'
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
  {
    label: 'Observe',
    items: [{ to: '/app/projects', label: 'Runs', icon: PlayCircle, end: false }],
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
}

export function Sidebar({ className, onNavigate }: SidebarProps) {
  const session = useSession()
  const user = session?.user ?? null
  const initials = getInitials(user)

  return (
    <aside className={cn('sidebar', className)}>
      <div className="sb-workspace" role="button" tabIndex={0}>
        <div className="sb-avatar">{initials}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="name">{user?.displayName ?? 'FlowForge'}</div>
          <div className="env">workspace</div>
        </div>
      </div>

      <nav aria-label="Primary navigation" className="flex-1">
        {groups.map((group) => (
          <div key={group.label}>
            <div className="sb-group">{group.label}</div>
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn('sb-item', isActive && 'active')
                }
              >
                <item.icon aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="sb-bottom">
        <div className="avatar">{initials}</div>
        <div>
          <div className="who">{user?.displayName ?? user?.email ?? 'Account'}</div>
          <div className="plan">Team plan</div>
        </div>
      </div>
    </aside>
  )
}
