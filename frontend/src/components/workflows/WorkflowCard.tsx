import { Link } from 'react-router-dom'
import { ChevronRight, Workflow as WorkflowIcon } from 'lucide-react'
import type { Workflow } from '@/api/types'
import { Badge } from '@/components/ui/badge'
import { formatDateTime } from '@/lib/utils'

function getStatusVariant(status: string): 'success' | 'secondary' | 'warning' | 'info' {
  switch (status) {
    case 'active':
      return 'success'
    case 'paused':
      return 'warning'
    case 'draft':
      return 'secondary'
    default:
      return 'info'
  }
}

interface WorkflowCardProps {
  projectId: string
  workflow: Workflow
}

export function WorkflowCard({ projectId, workflow }: WorkflowCardProps) {
  const taskCount = workflow.draft_definition?.tasks?.length ?? 0

  return (
    <Link
      to={`/app/projects/${projectId}/workflows/${workflow.id}`}
      className="group flex items-center justify-between rounded-xl border border-border/80 bg-card p-4 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-border hover:shadow-md"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-secondary/50 text-muted-foreground transition-colors group-hover:border-primary/30 group-hover:text-primary">
          <WorkflowIcon className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium transition-colors group-hover:text-primary">
              {workflow.name}
            </p>
            <Badge variant={getStatusVariant(workflow.status)} className="capitalize">
              {workflow.status}
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {taskCount} task{taskCount === 1 ? '' : 's'}
            {workflow.active_version_id ? ' · Version active' : ''}
          </p>
          <p className="text-xs text-muted-foreground">
            Updated {formatDateTime(workflow.updated_at)}
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
