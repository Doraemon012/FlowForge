import { Check, ChevronsUpDown, FolderKanban, Layers } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useProjects } from '@/hooks/use-projects'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

interface ProjectSwitcherProps {
  currentProjectId: string
  currentProjectName?: string
  /** Close the mobile drawer after navigating. */
  onNavigate?: () => void
  className?: string
}

/**
 * The project switcher shown at the head of the sidebar's project zone.
 *
 * Once a user is inside a project there was previously no way to move to
 * another one except backing out to the projects list. This keeps the current
 * project's name visible (so "where am I" is answered) and makes switching a
 * single click.
 */
export function ProjectSwitcher({
  currentProjectId,
  currentProjectName,
  onNavigate,
  className,
}: ProjectSwitcherProps) {
  const navigate = useNavigate()
  const { data: projects } = useProjects()

  const others = (projects ?? []).filter((project) => project.id !== currentProjectId)

  const go = (path: string) => {
    navigate(path)
    onNavigate?.()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            className,
          )}
          aria-label="Switch project"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[0.6875rem] font-semibold uppercase tracking-wide text-dim">
              Project
            </span>
            <span className="block truncate text-sm font-medium">
              {currentProjectName ?? 'Project'}
            </span>
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Switch project
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => go(`/app/projects/${currentProjectId}`)}>
          <Check className="mr-2 h-4 w-4" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">
            {currentProjectName ?? 'Current project'}
          </span>
        </DropdownMenuItem>
        {others.map((project) => (
          <DropdownMenuItem
            key={project.id}
            onClick={() => go(`/app/projects/${project.id}`)}
          >
            <FolderKanban className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{project.name}</span>
          </DropdownMenuItem>
        ))}
        {others.length === 0 ? (
          <DropdownMenuItem disabled>
            <span className="text-muted-foreground">No other projects yet</span>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => go('/app/projects')}>
          <Layers className="mr-2 h-4 w-4" aria-hidden="true" />
          All projects
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
