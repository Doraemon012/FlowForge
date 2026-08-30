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
      className="group flex items-center justify-between rounded-lg border border-border bg-surface p-4 shadow-surface transition-all duration-150 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-surface-md"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted transition-colors group-hover:border-accent-dim group-hover:text-accent">
          <WorkflowIcon className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium transition-colors group-hover:text-accent">
              {workflow.name}
            </p>
            <Badge variant={getStatusVariant(workflow.status)} className="capitalize">
              {workflow.status}
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {taskCount} task{taskCount === 1 ? '' : 's'}
            {workflow.active_version_id ? ' · Version active' : ''}
          </p>
          <p className="text-xs text-muted">Updated {formatDateTime(workflow.updated_at)}</p>
        </div>
      </div>
      <ChevronRight
        className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  )
}
