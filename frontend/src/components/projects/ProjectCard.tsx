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
      className="group flex items-center justify-between rounded-xl border border-border/80 bg-card p-4 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-border hover:shadow-md"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border/80 bg-secondary/50 text-muted-foreground transition-colors group-hover:border-primary/30 group-hover:text-primary">
          <FolderKanban className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium transition-colors group-hover:text-primary">
            {project.name}
          </p>
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
