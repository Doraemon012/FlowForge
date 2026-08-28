import { Link } from 'react-router-dom'
import { ChevronRight, FolderKanban } from 'lucide-react'
import type { Project } from '@/api/types'
import { formatDate } from '@/lib/utils'

interface ProjectCardProps {
  project: Project
}

export function ProjectCard({ project }: ProjectCardProps) {
  return (
    <Link
      to={`/app/projects/${project.id}`}
      className="group flex items-center justify-between rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md border bg-secondary/50">
          <FolderKanban className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{project.name}</p>
          <p className="text-xs text-muted-foreground">
            Created {formatDate(project.created_at)}
          </p>
        </div>
      </div>
      <ChevronRight
        className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  )
}
